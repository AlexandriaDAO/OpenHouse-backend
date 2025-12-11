use candid::{Principal, Nat};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::{StableBTreeMap, StableCell};
use std::cell::RefCell;
use std::time::Duration;
// Note: This module now uses ckUSDT (ICRC-2), not ICP ledger
// ckUSDT types defined in types.rs
use crate::types::{Account, TransferFromArgs, TransferFromError, TransferArg, TransferError, CKUSDT_CANISTER_ID, CKUSDT_TRANSFER_FEE};

use crate::{MEMORY_MANAGER, Memory};
use super::liquidity_pool;
use super::types::{PendingWithdrawal, WithdrawalType, AuditEntry, AuditEvent};

use super::memory_ids::{
    USER_BALANCES_MEMORY_ID,
    PENDING_WITHDRAWALS_MEMORY_ID,
    AUDIT_LOG_MAP_MEMORY_ID,
    AUDIT_LOG_COUNTER_MEMORY_ID,
};

// Constants
const MIN_DEPOSIT: u64 = 1_000_000; // 1 USDT
const MIN_WITHDRAW: u64 = 1_000_000; // 1 USDT
const MAX_AUDIT_ENTRIES: u64 = 1000; // Retention limit
/// Minimum balance before triggering automatic weekly withdrawal to parent canister.
/// Set to 10 USDT to minimize gas costs while ensuring timely fee collection.
const PARENT_AUTO_WITHDRAW_THRESHOLD: u64 = 10_000_000; // 10 USDT

thread_local! {
    static USER_BALANCES_STABLE: RefCell<StableBTreeMap<Principal, u64, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(USER_BALANCES_MEMORY_ID))),
        )
    );

    static PENDING_WITHDRAWALS: RefCell<StableBTreeMap<Principal, PendingWithdrawal, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(PENDING_WITHDRAWALS_MEMORY_ID)))
        )
    );

    // Audit trail with automatic pruning
    // Stores up to 1,000 entries using BTreeMap with sequential keys
    // Oldest entries are automatically removed when limit is exceeded
    static AUDIT_LOG_MAP: RefCell<StableBTreeMap<u64, AuditEntry, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(AUDIT_LOG_MAP_MEMORY_ID)))
        )
    );

    static AUDIT_LOG_COUNTER: RefCell<StableCell<u64, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(AUDIT_LOG_COUNTER_MEMORY_ID))),
            0u64
        )
    );

    static CACHED_CANISTER_BALANCE: RefCell<u64> = const { RefCell::new(0) };
    static PARENT_TIMER: RefCell<Option<ic_cdk_timers::TimerId>> = const { RefCell::new(None) };
    static RECONCILIATION_TIMER: RefCell<Option<ic_cdk_timers::TimerId>> = const { RefCell::new(None) };
}

pub(crate) enum TransferResult {
    Success(u64),
    DefiniteError(String),
    UncertainError(String),
}

// =============================================================================
// CACHED BALANCE TRACKING
// =============================================================================

/// Increment cached balance after successful deposit.
/// Called when ckUSDT is received by the canister.
pub(crate) fn increment_cached_balance(amount: u64) {
    CACHED_CANISTER_BALANCE.with(|cache| {
        let mut c = cache.borrow_mut();
        *c = c.saturating_add(amount);
    });
}

/// Decrement cached balance after successful withdrawal.
/// Called when ckUSDT is sent from the canister.
pub(crate) fn decrement_cached_balance(amount: u64) {
    CACHED_CANISTER_BALANCE.with(|cache| {
        let mut c = cache.borrow_mut();
        *c = c.saturating_sub(amount);
    });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

pub(crate) fn log_audit(event: AuditEvent) {
    // Get next counter value and increment (saturating_add prevents overflow)
    let idx = AUDIT_LOG_COUNTER.with(|counter| {
        let mut cell = counter.borrow_mut();
        let current = *cell.get();
        cell.set(current.saturating_add(1));
        current
    });

    // Create and insert entry
    let entry = AuditEntry {
        timestamp: ic_cdk::api::time(),
        event,
    };

    AUDIT_LOG_MAP.with(|log| {
        log.borrow_mut().insert(idx, entry);
    });

    // Prune if over limit (using saturating_sub for safety)
    let len = AUDIT_LOG_MAP.with(|log| log.borrow().len());
    if len > MAX_AUDIT_ENTRIES {
        prune_oldest_audit_entries(len.saturating_sub(MAX_AUDIT_ENTRIES));
    }
}

fn prune_oldest_audit_entries(count: u64) {
    AUDIT_LOG_MAP.with(|log| {
        let mut log = log.borrow_mut();
        // BTreeMap iterates in key order (oldest first since keys are sequential)
        let keys_to_remove: Vec<u64> = log.iter()
            .take(count as usize)
            .map(|entry| *entry.key())
            .collect();
        for key in keys_to_remove {
            log.remove(&key);
        }
    });
}

fn calculate_total_deposits() -> u64 {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow()
            .iter()
            .map(|entry| entry.value())
            .sum()
    })
}

// =============================================================================
// DEPOSIT FUNCTION (ICRC-2)
// =============================================================================

#[allow(deprecated)]
pub async fn deposit(amount: u64) -> Result<u64, String> {
    if amount < MIN_DEPOSIT {
        return Err(format!("Minimum deposit is {} USDT", MIN_DEPOSIT / 1_000_000));
    }

    let caller = ic_cdk::api::msg_caller();
    let ck_usdt_principal = Principal::from_text(CKUSDT_CANISTER_ID).expect("Invalid principal constant");

    let args = TransferFromArgs {
        spender_subaccount: None,
        from: Account::from(caller),
        to: Account::from(ic_cdk::api::canister_self()),
        amount: amount.into(),
        // Explicitly charge the fee to the sender.
        // This prevents the protocol from "eating" the fee (insolvency risk).
        // If the ledger creates a surplus from this, it is Protocol Profit (safe).
        fee: Some(Nat::from(CKUSDT_TRANSFER_FEE)), 
        memo: None,
        created_at_time: None,
    };

    let (result,): (Result<Nat, TransferFromError>,) =
        ic_cdk::api::call::call(ck_usdt_principal, "icrc2_transfer_from", (args,))
        .await
        .map_err(|(code, msg)| format!("Call failed: {:?} {}", code, msg))?;

    match result {
        Ok(block_index) => {
            // Credit user with the full amount
            // ICRC-2 transfer_from ACTUAL behavior:
            // - User pays: amount + fee (debited from user's account)
            // - Canister receives: amount (full amount)
            // - Fee is burned/collected by the ledger
            //
            // Net Canister Balance: +amount (user already paid the fee)
            // User Balance Credit: amount (full amount received)

            let new_balance = USER_BALANCES_STABLE.with(|balances| {
                let mut balances = balances.borrow_mut();
                let current = balances.get(&caller).unwrap_or(0);
                let new_bal = current + amount;
                balances.insert(caller, new_bal);
                new_bal
            });

            // Update cached canister balance (canister received `amount`)
            increment_cached_balance(amount);

            ic_cdk::println!("Deposit successful: {} deposited {} decimals at block {}", caller, amount, block_index);
            Ok(new_balance)
        }
        Err(e) => Err(format!("Transfer failed: {:?}", e)),
    }
}

// =============================================================================
// WITHDRAW FUNCTION
// =============================================================================

pub async fn withdraw_all() -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    withdraw_internal(caller).await
}

pub(crate) async fn withdraw_internal(user: Principal) -> Result<u64, String> {
    // Check if already pending (prevents concurrent withdrawals)
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Withdrawal already pending. Call retry_withdrawal() to retry or abandon_withdrawal() to cancel.".to_string());
    }

    let balance = get_balance_internal(user);

    if balance == 0 {
        return Err("No balance to withdraw".to_string());
    }

    if balance < MIN_WITHDRAW {
        return Err(format!("Balance {} decimals is below minimum withdrawal of {} USDT",
                          balance, MIN_WITHDRAW / 1_000_000));
    }

    // ATOMIC: Create pending FIRST, then zero balance
    // This ordering is critical for atomicity:
    // - If inserting pending fails (e.g., memory full), balance remains untouched
    // - IC stable structures auto-rollback on trap, so partial state is impossible
    // - Only after pending is successfully created do we zero the balance
    let created_at = ic_cdk::api::time();
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: balance },
        created_at,
    };

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().insert(user, pending));

    // Now that pending is created, zero the balance
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, 0);
    });

    log_audit(AuditEvent::WithdrawalInitiated { user, amount: balance });

    match attempt_transfer(user, balance, created_at).await {
        TransferResult::Success(_block) => {
            PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&user));
            log_audit(AuditEvent::WithdrawalCompleted { user, amount: balance });
            // Update cached canister balance (canister sent `balance`)
            decrement_cached_balance(balance);
            Ok(balance)
        }
        TransferResult::DefiniteError(err) => {
            // DESIGN NOTE FOR AUDITORS:
            // Rollback on INITIAL DefiniteError is safe because:
            // 1. Fresh timestamp = TooOld impossible on first attempt
            // 2. DefiniteError = ledger definitely rejected the transaction
            // 3. No prior UncertainError = we KNOW it never succeeded
            rollback_withdrawal(user)?;
            log_audit(AuditEvent::WithdrawalFailed { user, amount: balance });
            Err(err)
        }
        TransferResult::UncertainError(msg) => {
            // DESIGN NOTE FOR AUDITORS:
            // DO NOT rollback here! The transfer may have succeeded on-chain.
            // User must call retry_withdrawal() or abandon_withdrawal().
            // This is the core fix for the double-spend vulnerability.
            Err(format!(
                "Withdrawal pending (uncertain outcome). \
                 Call retry_withdrawal() to retry or check on-chain balance. \
                 If you received funds, call abandon_withdrawal() to clear pending state. \
                 Error: {}", msg
            ))
        }
    }
}

// =============================================================================
// LP WITHDRAWAL HELPERS
// =============================================================================

/// Schedule an LP withdrawal and return the created_at timestamp for immediate transfer attempt.
/// Returns the created_at timestamp needed for attempt_transfer().
///
/// # Arguments
/// * `fee` - Protocol fee to credit to parent on successful transfer (not on rollback)
pub fn schedule_lp_withdrawal(user: Principal, shares: Nat, reserve: Nat, amount: u64, fee: u64) -> Result<u64, String> {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Withdrawal already pending. Call retry_withdrawal() to retry or abandon_withdrawal() to cancel.".to_string());
    }

    let created_at = ic_cdk::api::time();
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::LP { shares, reserve, amount, fee },
        created_at,
    };

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().insert(user, pending));
    log_audit(AuditEvent::WithdrawalInitiated { user, amount });

    Ok(created_at)
}


// =============================================================================
// INTERNAL CORE
// =============================================================================

// Suppress warning for deprecated `ic_cdk::call`.
// Refactoring to `Call::unbounded_wait` requires dependency updates and significant changes.
#[allow(deprecated)]
pub(crate) async fn attempt_transfer(user: Principal, amount: u64, created_at: u64) -> TransferResult {
    let ck_usdt_principal = Principal::from_text(CKUSDT_CANISTER_ID).expect("Invalid principal constant");

    let args = TransferArg {
        from_subaccount: None,
        to: Account { owner: user, subaccount: None },
        amount: Nat::from(amount - CKUSDT_TRANSFER_FEE),
        fee: Some(Nat::from(CKUSDT_TRANSFER_FEE)),
        memo: None,
        created_at_time: Some(created_at),
    };

    let call_result: Result<(Result<Nat, TransferError>,), _> = 
        ic_cdk::api::call::call(ck_usdt_principal, "icrc1_transfer", (args,)).await;

    match call_result {
        Ok((Ok(block_index),)) => {
            let idx = block_index.0.try_into().unwrap_or(0);
            TransferResult::Success(idx)
        },
        Ok((Err(e),)) => TransferResult::DefiniteError(format!("{:?}", e)),
        Err((code, msg)) => TransferResult::UncertainError(format!("{:?} {}", code, msg)),
    }
}

pub(crate) fn rollback_withdrawal(user: Principal) -> Result<(), String> {
    let pending = PENDING_WITHDRAWALS.with(|p| p.borrow().get(&user))
        .ok_or("No pending withdrawal")?;

    match pending.withdrawal_type {
        WithdrawalType::User { amount } => {
            USER_BALANCES_STABLE.with(|balances| {
                let mut balances = balances.borrow_mut();
                let current = balances.get(&user).unwrap_or(0);
                balances.insert(user, current + amount);
            });
            log_audit(AuditEvent::BalanceRestored { user, amount });
        }
        WithdrawalType::LP { shares, reserve, amount, .. } => {
            // Restore LP position (fee is NOT credited on rollback - this is the fix)
            liquidity_pool::restore_lp_position(user, shares, reserve);
            log_audit(AuditEvent::LPRestored { user, amount });
        }
    }

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&user));
    Ok(())
}

/// Mark a pending withdrawal as complete (transfer succeeded).
pub(crate) fn complete_withdrawal(user: Principal, amount: u64) {
    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&user));
    log_audit(AuditEvent::WithdrawalCompleted { user, amount });
}


// =============================================================================
// PARENT WITHDRAWAL TIMER
// =============================================================================

pub fn start_parent_withdrawal_timer() {
    PARENT_TIMER.with(|t| {
        if t.borrow().is_some() { return; }
        
        // Run every 7 days (604,800 seconds)
        // Note: set_timer_interval expects a Future-returning closure.
        // We use || async { ... } which satisfies the trait bound and allows the library
        // to poll the future. Wrapping in spawn() here is redundant or incorrect for v1.0.0.
        let timer_id = ic_cdk_timers::set_timer_interval(Duration::from_secs(604_800), || async {
             auto_withdraw_parent().await;
        });
        *t.borrow_mut() = Some(timer_id);
    });
}

async fn auto_withdraw_parent() {
     let parent = crate::defi_accounting::liquidity_pool::get_parent_principal();

     // SAFETY: TOCTOU race is acceptable here because withdraw_internal()
     // performs its own balance checks atomically. Worst case is the timer
     // attempts a withdrawal that immediately fails with "Withdrawal already pending"
     // or "No balance to withdraw", which is harmless.
     let balance = get_balance_internal(parent);

     if balance > PARENT_AUTO_WITHDRAW_THRESHOLD {
         // Use withdraw_internal directly
         match withdraw_internal(parent).await {
             Ok(amount) => {
                 ic_cdk::println!("Auto-withdraw success: {} e8s to parent", amount);
                 log_audit(AuditEvent::SystemInfo {
                     message: crate::defi_accounting::types::sanitize_error(&format!("Auto-withdrawal success: {} e8s", amount))
                 });
             },
             Err(e) => {
                 ic_cdk::println!("Auto-withdraw skipped: {}", e);
                 log_audit(AuditEvent::SystemError {
                     error: crate::defi_accounting::types::sanitize_error(&format!("Auto-withdraw failed: {}", e))
                 });
             },
         }
     }
}

// =============================================================================
// BALANCE RECONCILIATION TIMER
// =============================================================================

/// Start hourly timer to reconcile cached balance with actual ledger balance.
/// This is a safety mechanism to detect any drift between cached and actual balance.
pub fn start_balance_reconciliation_timer() {
    RECONCILIATION_TIMER.with(|t| {
        if t.borrow().is_some() { return; }

        // Run every hour (3600 seconds)
        let timer_id = ic_cdk_timers::set_timer_interval(Duration::from_secs(3600), || async {
            // refresh_canister_balance() queries the ledger and updates the cache
            // This automatically corrects any drift
            let _ = refresh_canister_balance().await;
        });
        *t.borrow_mut() = Some(timer_id);
    });
}

// =============================================================================
// USER-INITIATED RETRY & ABANDON
// =============================================================================

/// Retry a pending withdrawal.
///
/// # Design Rationale (FOR AUDITORS)
///
/// Users can retry indefinitely - there's no MAX_RETRIES limit. This is safe because:
/// - Same `created_at` = same dedup key on ledger = idempotent
/// - Even after TooOld, retries just fail harmlessly (no state change)
/// - System never makes rollback decisions automatically
///
/// ## What happens with TooOld?
/// After ~24 hours, the ledger returns TooOld because `created_at` is expired.
/// This does NOT mean the transfer failed - it means we can't retry anymore.
/// The user should:
/// 1. Check their ckUSDT balance on-chain
/// 2. If they received funds -> call `abandon_withdrawal()` to unfreeze account
/// 3. If they didn't -> they can keep retrying (harmless) or `abandon_withdrawal()`
///
/// ## Why no automatic rollback on TooOld?
/// TooOld only means "I can't process THIS retry" - it says nothing about whether
/// a PRIOR attempt succeeded. Auto-rollback here would cause double-spend if the
/// original transfer actually went through.
pub async fn retry_withdrawal() -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();

    let pending = PENDING_WITHDRAWALS.with(|p| p.borrow().get(&caller))
        .ok_or("No pending withdrawal to retry")?;

    let amount = pending.get_amount();

    // Retry with original created_at - ledger deduplication handles idempotency
    match attempt_transfer(caller, amount, pending.created_at).await {
        TransferResult::Success(_) => {
            // For LP withdrawals, credit the protocol fee on success
            // This is deferred from initial withdraw to prevent orphaned fees on rollback
            if let WithdrawalType::LP { fee, .. } = &pending.withdrawal_type {
                if *fee > 0 {
                    let parent = liquidity_pool::get_parent_principal();
                    if !credit_parent_fee(parent, *fee) {
                        // Fallback: return fee to pool reserve (tokens are in canister)
                        liquidity_pool::add_to_reserve(*fee);
                        log_audit(AuditEvent::ParentFeeFallback {
                            amount: *fee,
                            reason: crate::defi_accounting::types::sanitize_error("Credit failed on retry")
                        });
                    }
                }
            }
            PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&caller));
            log_audit(AuditEvent::WithdrawalCompleted { user: caller, amount });
            // Update cached canister balance (canister sent `amount`)
            decrement_cached_balance(amount);
            Ok(amount)
        }
        TransferResult::DefiniteError(e) => {
            // DESIGN NOTE FOR AUDITORS:
            // DO NOT rollback here! This might be TooOld, which doesn't mean
            // the original transfer failed. Stay pending, let user decide.
            Err(format!(
                "Transfer failed: {}. \
                 Check your on-chain ckUSDT balance. \
                 If you received funds, call abandon_withdrawal(). \
                 Otherwise, you may retry again or abandon.", e
            ))
        }
        TransferResult::UncertainError(msg) => {
            Err(format!("Transfer uncertain: {}. Please retry.", msg))
        }
    }
}

/// Abandon a pending withdrawal WITHOUT restoring balance.
///
/// # Design Rationale (FOR AUDITORS)
///
/// This is the escape hatch for stuck withdrawals. It does NOT restore the user's
/// balance because we cannot know if the original transfer succeeded.
///
/// ## Before calling this, users MUST check their on-chain ckUSDT balance:
/// - If they received the funds -> abandon is correct, just clears frozen state
/// - If they didn't receive funds -> they are accepting the loss
///
/// ## Why No Double-Spend Is Possible
/// Since we NEVER restore balance on abandon, the worst case scenarios are:
///
/// | Scenario                          | On-Chain | Internal | Result           |
/// |-----------------------------------|----------|----------|------------------|
/// | Abandon after receiving funds     | +amount  | 0        | Correct          |
/// | Abandon without receiving funds   | 0        | 0        | User loses       |
///
/// We accept "user might lose" over "house might lose twice" because:
/// - Orphaned funds stay in canister (system remains solvent)
/// - User made the choice with full information (they can check on-chain first)
/// - The edge case is astronomically rare (~1 in 30 billion)
/// - The user has agency - they're not forced to abandon
///
/// ## What happens to orphaned funds?
/// If a user abandons without receiving funds, those funds remain in the canister's
/// ckUSDT balance but are not credited to any user. This is a "surplus" that keeps
/// the system solvent. An admin recovery mechanism could be added later if needed.
pub fn abandon_withdrawal() -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();

    let pending = PENDING_WITHDRAWALS.with(|p| p.borrow().get(&caller))
        .ok_or("No pending withdrawal to abandon")?;

    let amount = pending.get_amount();

    // Remove pending state - DO NOT restore balance
    // This is the critical safety property that prevents double-spend
    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&caller));
    log_audit(AuditEvent::WithdrawalAbandoned { user: caller, amount });

    Ok(amount) // Returns amount for user's records
}

// =============================================================================
// PUBLIC QUERIES & UTILS
// =============================================================================

pub(crate) fn get_balance_internal(user: Principal) -> u64 {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow().get(&user).unwrap_or(0)
    })
}

pub(crate) fn get_max_allowed_payout_internal() -> u64 {
    let house_balance = liquidity_pool::get_pool_reserve();
    // Backend allows 15%, frontend shows 10% - creates 50% safety buffer for max bet race conditions
    (house_balance * 15) / 100
}

pub fn update_balance(user: Principal, new_balance: u64) -> Result<(), String> {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Cannot update balance: withdrawal pending".to_string());
    }

    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, new_balance);
    });
    Ok(())
}

/// Atomically check and deduct balance in a single operation.
///
/// # TOCTOU Race Condition Fix
/// This function prevents the Time-of-Check-Time-of-Use vulnerability by performing
/// balance check and deduction atomically. Unlike the old pattern where balance was
/// captured before an await point and then used after, this function reads the CURRENT
/// balance at the time of deduction.
///
/// # Usage
/// Call this function AFTER any await points (like raw_rand()) to ensure the balance
/// check uses the current state, not a stale value captured before the await.
///
/// # Returns
/// - Ok(remaining_balance) on success
/// - Err if withdrawal pending, insufficient funds, or underflow
pub fn try_deduct_balance(user: Principal, amount: u64) -> Result<u64, String> {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Cannot deduct balance: withdrawal pending".to_string());
    }

    USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&user).unwrap_or(0);

        if current < amount {
            return Err("INSUFFICIENT_BALANCE".to_string());
        }

        let new_balance = current.checked_sub(amount)
            .ok_or("Balance underflow")?;

        balances.insert(user, new_balance);
        Ok(new_balance)
    })
}

/// Force credit balance for internal system refunds.
///
/// # Safety
/// This bypasses the pending withdrawal check. It is safe because:
/// 1. The pending withdrawal amount is FIXED at creation time
/// 2. Adding new funds doesn't affect the pending withdrawal amount
/// 3. This is ONLY called for refunds where tokens are already in canister
///
/// # Overflow Safety
/// This function returns an error on overflow. In the specific case of
/// `deposit_liquidity` slippage refunds, this would technically result in
/// orphaned funds (transfer succeeded, credit failed).
/// 
/// However, this is theoretically impossible because:
/// - Token is USDT (6 decimals)
/// - Max u64 is ~18 quintillion (1.8 * 10^19)
/// - Total USDT supply is ~100 billion (10^11)
/// - Therefore, `current_balance + refund` can never overflow u64.
///
/// # When to use
/// ONLY for slippage refunds in `deposit_liquidity` where:
/// - `transfer_from_user` succeeded (tokens ARE in canister)
/// - `credit_balance` would fail due to concurrent `PendingWithdrawal`
///
/// DO NOT use for general credits or rewards.
pub(crate) fn force_credit_balance_system(user: Principal, amount: u64) -> Result<(), String> {
    // NOTE: We intentionally skip the PENDING_WITHDRAWALS check here.
    // This is safe - see docstring above.

    USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&user).unwrap_or(0);
        let new_balance = current.checked_add(amount)
            .ok_or(format!("Balance overflow: {} + {}", current, amount))?;

        balances.insert(user, new_balance);

        log_audit(AuditEvent::SystemRefundCredited { user, amount, new_balance });

        Ok(())
    })
}

/// Best-effort fee crediting.
/// Returns true if credited, false if skipped (user has pending withdrawal).
pub fn credit_parent_fee(user: Principal, amount: u64) -> bool {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return false;
    }

    USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&user).unwrap_or(0);
        match current.checked_add(amount) {
            Some(new_bal) => {
                balances.insert(user, new_bal);
                log_audit(AuditEvent::ParentFeeCredited { amount });
                true
            },
            None => {
                log_audit(AuditEvent::SystemError { 
                    error: format!("Parent balance overflow: {} + {}", current, amount) 
                });
                false 
            }
        }
    })
}


pub fn get_withdrawal_status() -> Option<PendingWithdrawal> {
    let caller = ic_cdk::api::msg_caller();
    PENDING_WITHDRAWALS.with(|p| p.borrow().get(&caller))
}

/// Get audit log entries in reverse chronological order (most recent first).
/// Used by admin_query for the admin dashboard.
///
/// # Arguments
/// - `limit`: Maximum number of entries to return
/// - `offset`: Number of entries to skip from the most recent
///
/// # Implementation Note
/// StableBTreeMap doesn't implement DoubleEndedIterator, so we can't use `.rev()`.
/// Instead, we calculate the exact window of entries needed, iterate forward through
/// that window, and reverse the result. This avoids collecting all keys into memory.
pub(crate) fn get_audit_entries(limit: u64, offset: u64) -> Vec<AuditEntry> {
    AUDIT_LOG_MAP.with(|log| {
        let log = log.borrow();
        let len = log.len();
        if offset >= len {
            return vec![];
        }

        // Calculate the window of entries we need
        let entries_to_fetch = limit.min(len - offset) as usize;
        let skip_from_start = (len as usize).saturating_sub(offset as usize + entries_to_fetch);

        // Iterate forward through the window, then reverse for most-recent-first order
        log.iter()
            .skip(skip_from_start)
            .take(entries_to_fetch)
            .map(|entry| entry.value())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    })
}

/// Get the total number of audit log entries.
pub(crate) fn get_audit_count() -> u64 {
    AUDIT_LOG_MAP.with(|log| log.borrow().len())
}

#[allow(deprecated)]
pub async fn refresh_canister_balance() -> u64 {
    let ck_usdt_principal = Principal::from_text(CKUSDT_CANISTER_ID).expect("Invalid principal constant");

    let account = Account {
        owner: ic_cdk::api::canister_self(),
        subaccount: None,
    };

    let result: Result<(Nat,), _> = ic_cdk::api::call::call(ck_usdt_principal, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            let balance_u64 = balance.0.try_into().unwrap_or_else(|_| {
                ic_cdk::println!("CRITICAL: Balance exceeds u64::MAX");
                u64::MAX
            });
            CACHED_CANISTER_BALANCE.with(|cache| {
                *cache.borrow_mut() = balance_u64;
            });
            balance_u64
        }
        Err(_e) => {
            CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow())
        }
    }
}


// =============================================================================
// ADMIN QUERY HELPERS (called by admin_query.rs)
// =============================================================================

/// Expose total deposits calculation for admin queries
pub(crate) fn calculate_total_deposits_internal() -> u64 {
    calculate_total_deposits()
}

/// Count unique users with balances
pub(crate) fn count_user_balances_internal() -> u64 {
    USER_BALANCES_STABLE.with(|b| b.borrow().len())
}

/// Get pending withdrawal stats (count, total amount)
pub(crate) fn get_pending_stats_internal() -> (u64, u64) {
    PENDING_WITHDRAWALS.with(|p| {
        let pending = p.borrow();
        let count = pending.len();
        let total: u64 = pending.iter()
            .map(|entry| entry.value().get_amount())
            .sum();
        (count, total)
    })
}

/// Iterate all pending withdrawals
pub(crate) fn iter_pending_withdrawals_internal() -> Vec<super::types::PendingWithdrawalInfo> {
    PENDING_WITHDRAWALS.with(|p| {
        p.borrow().iter().map(|entry| {
            let (user, pending) = (entry.key(), entry.value());
            super::types::PendingWithdrawalInfo {
                user: *user,
                withdrawal_type: match &pending.withdrawal_type {
                    WithdrawalType::User { .. } => "User".to_string(),
                    WithdrawalType::LP { .. } => "LP".to_string(),
                },
                amount: pending.get_amount(),
                created_at: pending.created_at,
            }
        }).collect()
    })
}

/// Paginated user balances
pub(crate) fn iter_user_balances_internal(offset: usize, limit: usize) -> Vec<super::types::UserBalance> {
    USER_BALANCES_STABLE.with(|b| {
        b.borrow().iter()
            .skip(offset)
            .take(limit)
            .map(|entry| super::types::UserBalance {
                user: *entry.key(),
                balance: entry.value(),
            })
            .collect()
    })
}

/// Sum all abandoned amounts from audit log
pub(crate) fn sum_abandoned_from_audit_internal() -> u64 {
    AUDIT_LOG_MAP.with(|log| {
        log.borrow().iter()
            .filter_map(|entry| {
                if let AuditEvent::WithdrawalAbandoned { amount, .. } = &entry.value().event {
                    Some(*amount)
                } else {
                    None
                }
            })
            .sum()
    })
}

pub(crate) fn get_cached_canister_balance_internal() -> u64 {
    CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow())
}

/// Build orphaned funds report from audit log
///
/// # Parameters
/// - `recent_limit`: Optional limit for recent abandonments. If None, returns ALL.
pub(crate) fn build_orphaned_funds_report_internal(recent_limit: Option<usize>)
    -> super::types::OrphanedFundsReport
{
    AUDIT_LOG_MAP.with(|log| {
        let mut total = 0u64;
        let mut count = 0u64;

        // Collect all abandoned withdrawals
        let mut all_abandonments: Vec<super::types::AbandonedEntry> = log.borrow()
            .iter()
            .filter_map(|entry| {
                if let AuditEvent::WithdrawalAbandoned { user, amount } = &entry.value().event {
                    total += amount;
                    count += 1;
                    Some(super::types::AbandonedEntry {
                        user: *user,
                        amount: *amount,
                        timestamp: entry.value().timestamp,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort by timestamp descending (most recent first)
        all_abandonments.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        // Apply limit if specified, otherwise return all
        let limited_abandonments = if let Some(limit) = recent_limit {
            all_abandonments.into_iter()
                .take(limit)
                .collect()
        } else {
            all_abandonments  // Return ALL
        };

        super::types::OrphanedFundsReport {
            total_abandoned_amount: total,
            abandoned_count: count,
            recent_abandonments: limited_abandonments,
        }
    })
}
