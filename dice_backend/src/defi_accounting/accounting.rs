use candid::{CandidType, Deserialize, Principal, Nat};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::{StableBTreeMap, StableCell};
use std::cell::RefCell;
use std::time::Duration;
// Note: This module now uses ckUSDT (ICRC-2), not ICP ledger
// ckUSDT types defined in types.rs
use crate::types::{Account, TransferFromArgs, TransferFromError, TransferArg, TransferError, CKUSDT_CANISTER_ID, CKUSDT_TRANSFER_FEE};

use crate::{MEMORY_MANAGER, Memory};
use super::liquidity_pool;
use super::types::{PendingWithdrawal, WithdrawalType, AuditEntry, AuditEvent, HealthCheck};

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
/// Set to 100 USDT to minimize gas costs while ensuring timely fee collection.
const PARENT_AUTO_WITHDRAW_THRESHOLD: u64 = 100_000_000; // 100 USDT

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

    static CACHED_CANISTER_BALANCE: RefCell<u64> = RefCell::new(0);
    static PARENT_TIMER: RefCell<Option<ic_cdk_timers::TimerId>> = RefCell::new(None);
}

#[derive(CandidType, Deserialize, Clone)]
pub struct AccountingStats {
    pub total_user_deposits: u64,
    pub house_balance: u64,
    pub canister_balance: u64,
    pub unique_depositors: u64,
}

pub(crate) enum TransferResult {
    Success(u64),
    DefiniteError(String),
    UncertainError(String),
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
            .map(|entry| entry.key().clone())
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
            .map(|entry| entry.value().clone())
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
    (house_balance * 10) / 100
}

pub(crate) fn get_accounting_stats_internal() -> AccountingStats {
    let total_deposits = calculate_total_deposits();
    let unique_depositors = USER_BALANCES_STABLE.with(|balances|
        balances.borrow().iter().count() as u64
    );

    let canister_balance = CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow());
    let house_balance = liquidity_pool::get_pool_reserve();

    AccountingStats {
        total_user_deposits: total_deposits,
        house_balance,
        canister_balance,
        unique_depositors,
    }
}

pub(crate) fn audit_balances_internal() -> Result<String, String> {
    let total_deposits = calculate_total_deposits();
    let canister_balance = CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow());
    let pool_reserve = liquidity_pool::get_pool_reserve();

    let calculated_total = pool_reserve + total_deposits;

    if calculated_total == canister_balance {
        Ok(format!("✅ Audit passed: pool_reserve ({}) + deposits ({}) = canister ({})",
                   pool_reserve, total_deposits, canister_balance))
    } else {
        Err(format!("❌ Audit FAILED: pool_reserve ({}) + deposits ({}) = {} != canister ({})",
                    pool_reserve, total_deposits, calculated_total, canister_balance))
    }
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

/// Credits amount to user's balance (adds to existing balance).
/// Used for slippage protection refunds.
pub fn credit_balance(user: Principal, amount: u64) -> Result<(), String> {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Cannot credit: withdrawal pending".to_string());
    }

    USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&user).unwrap_or(0);
        let new_balance = current.checked_add(amount)
            .ok_or(format!("Balance overflow: current {} + amount {}", current, amount))?;

        balances.insert(user, new_balance);

        log_audit(AuditEvent::BalanceCredited { user, amount, new_balance });

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

pub fn get_audit_log(offset: usize, limit: usize) -> Vec<AuditEntry> {
    AUDIT_LOG_MAP.with(|log| {
        let log = log.borrow();
        // BTreeMap iterates in key order (sequential = chronological)
        log.iter()
            .skip(offset)
            .take(limit)
            .map(|entry| entry.value())
            .collect()
    })
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

#[allow(deprecated)]
pub async fn get_canister_balance() -> u64 {
    let ck_usdt_principal = Principal::from_text(CKUSDT_CANISTER_ID).expect("Invalid principal constant");

    let account = Account {
        owner: ic_cdk::api::canister_self(),
        subaccount: None,
    };

    let result: Result<(Nat,), _> = ic_cdk::api::call::call(ck_usdt_principal, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            let bal: u64 = balance.0.try_into().unwrap_or(0);
            CACHED_CANISTER_BALANCE.with(|cache| {
                *cache.borrow_mut() = bal;
            });
            bal
        }
        Err(e) => {
            ic_cdk::println!("Failed to query canister balance: {:?}", e);
            0
        }
    }
}

const ADMIN_PRINCIPAL: &str = "p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae";

/// Admin-only health check that mirrors scripts/check_balance.sh
/// Returns comprehensive accounting health status.
pub async fn admin_health_check() -> Result<HealthCheck, String> {
    let admin = Principal::from_text(ADMIN_PRINCIPAL)
        .map_err(|_| "Invalid admin principal constant")?;

    let caller = ic_cdk::api::msg_caller();
    if caller != admin {
        return Err("Unauthorized: admin only".to_string());
    }

    // Refresh canister balance from ledger
    let canister_balance = refresh_canister_balance().await;

    // Get current values
    let pool_reserve = super::liquidity_pool::get_pool_reserve();
    let total_deposits = calculate_total_deposits();
    let calculated_total = pool_reserve.checked_add(total_deposits)
        .ok_or("CRITICAL: Accounting overflow (pool_reserve + total_deposits > u64::MAX)")?;

    // Calculate excess (can be negative if deficit)
    let excess = canister_balance as i64 - calculated_total as i64;
    let excess_usdt = excess as f64 / 1_000_000.0;

    // Determine health status
    let (is_healthy, health_status) = if excess < 0 {
        (false, "CRITICAL: DEFICIT - Liabilities exceed assets".to_string())
    } else if excess < 1_000_000 {
        (true, "HEALTHY".to_string())
    } else if excess < 5_000_000 {
        (true, "WARNING: Excess accumulating (1-5 USDT)".to_string())
    } else {
        (false, "ACTION REQUIRED: High excess (>5 USDT)".to_string())
    };

    Ok(HealthCheck {
        pool_reserve,
        total_deposits,
        canister_balance,
        calculated_total,
        excess,
        excess_usdt,
        is_healthy,
        health_status,
        timestamp: ic_cdk::api::time(),
    })
}