use candid::{CandidType, Deserialize, Principal, Nat};
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::{StableBTreeMap, StableVec};
use std::cell::RefCell;
use std::time::Duration;
use ic_ledger_types::{
    AccountIdentifier, TransferArgs, Tokens, DEFAULT_SUBACCOUNT,
    MAINNET_LEDGER_CANISTER_ID, Memo, AccountBalanceArgs, BlockIndex, Timestamp,
};
use crate::types::{Account, TransferFromArgs, TransferFromError};
use ic_cdk::api::call::RejectionCode;

use crate::{MEMORY_MANAGER, Memory};
use super::liquidity_pool;
use super::types::{PendingWithdrawal, WithdrawalType, AuditEntry, AuditEvent};

// Constants
const ICP_TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP in e8s
const MIN_DEPOSIT: u64 = 10_000_000; // 0.1 ICP
const MIN_WITHDRAW: u64 = 10_000_000; // 0.1 ICP
const USER_BALANCES_MEMORY_ID: u8 = 10;
const PENDING_WITHDRAWALS_MEMORY_ID: u8 = 20;
const AUDIT_LOG_MEMORY_ID: u8 = 21;
const MAX_PAYOUT_PERCENTAGE: f64 = 0.10;
const MAX_RETRIES: u8 = 10;

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

    // Audit trail (unbounded - monitor size periodically)
    // Growth estimate: ~500 bytes/entry
    // At 1000 entries/day: ~182MB/year
    // At 100k entries total: ~50MB stable storage
    // Recommendation: Monitor via canister status and archive/prune if exceeds 100k entries
    static AUDIT_LOG: RefCell<StableVec<AuditEntry, Memory>> = RefCell::new(
        StableVec::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(AUDIT_LOG_MEMORY_ID)))
        )
    );

    static CACHED_CANISTER_BALANCE: RefCell<u64> = RefCell::new(0);
    static PROCESSING_WITHDRAWALS: RefCell<bool> = RefCell::new(false);
    static RETRY_TIMER_ID: RefCell<Option<ic_cdk_timers::TimerId>> = RefCell::new(None);
}

#[derive(CandidType, Deserialize, Clone)]
pub struct AccountingStats {
    pub total_user_deposits: u64,
    pub house_balance: u64,
    pub canister_balance: u64,
    pub unique_depositors: u64,
}

enum TransferResult {
    Success(BlockIndex),
    DefiniteError(String),
    UncertainError(String),
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

fn log_audit(event: AuditEvent) {
    AUDIT_LOG.with(|log| {
        let entry = AuditEntry {
            timestamp: ic_cdk::api::time(),
            event: event.clone(),
        };
        log.borrow_mut().push(&entry);
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

#[update]
pub async fn deposit(amount: u64) -> Result<u64, String> {
    if amount < MIN_DEPOSIT {
        return Err(format!("Minimum deposit is {} ICP", MIN_DEPOSIT / 100_000_000));
    }

    let caller = ic_cdk::caller();

    let args = TransferFromArgs {
        spender_subaccount: None,
        from: Account::from(caller),
        to: Account::from(ic_cdk::id()),
        amount: amount.into(),
        fee: None, 
        memo: None,
        created_at_time: None,
    };

    let (result,): (Result<Nat, TransferFromError>,) =
        ic_cdk::call(MAINNET_LEDGER_CANISTER_ID, "icrc2_transfer_from", (args,))
        .await
        .map_err(|(code, msg)| format!("Call failed: {:?} {}", code, msg))?;

    match result {
        Ok(block_index) => {
            // Credit user with full amount
            // ✅ VERIFIED: ICRC-2 transfer_from fee accounting
            //
            // Research confirms that ICRC-2's transfer_from charges the transfer fee to the
            // sender separately. The recipient (this canister) receives exactly the `amount`
            // specified in the transfer_from call.
            //
            // This is different from ICRC-1's transfer() where the fee is deducted from the
            // amount being sent. Here, if a user calls deposit(100_000_000), the canister
            // receives exactly 100,000,000 e8s, and the user is charged 100,010,000 e8s total
            // (amount + fee).
            //
            // Therefore, crediting the full `amount` to the user's balance is correct.
            let new_balance = USER_BALANCES_STABLE.with(|balances| {
                let mut balances = balances.borrow_mut();
                let current = balances.get(&caller).unwrap_or(0);
                let new_bal = current + amount;  // Correct: credits exactly what canister received
                balances.insert(caller, new_bal);
                new_bal
            });

            ic_cdk::println!("Deposit successful: {} deposited {} e8s at block {}", caller, amount, block_index);
            Ok(new_balance)
        }
        Err(e) => Err(format!("Transfer failed: {:?}", e)),
    }
}

// =============================================================================
// WITHDRAW FUNCTION
// =============================================================================

#[update]
pub async fn withdraw_all() -> Result<u64, String> {
    let caller = ic_cdk::caller();

    // Check if already pending (prevents concurrent withdrawals)
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&caller)) {
        return Err("Withdrawal already pending".to_string());
    }

    let balance = get_balance_internal(caller);

    if balance == 0 {
        return Err("No balance to withdraw".to_string());
    }

    if balance < MIN_WITHDRAW {
        return Err(format!("Balance {} e8s is below minimum withdrawal of {} ICP",
                          balance, MIN_WITHDRAW / 100_000_000));
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
        retries: 0,
        last_error: None,
    };

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().insert(caller, pending));

    // Now that pending is created, zero the balance
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(caller, 0);
    });

    log_audit(AuditEvent::WithdrawalInitiated { user: caller, amount: balance });

    match attempt_transfer(caller, balance, created_at).await {
        TransferResult::Success(_block) => {
            PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&caller));
            log_audit(AuditEvent::WithdrawalCompleted { user: caller, amount: balance });
            Ok(balance)
        }
        TransferResult::DefiniteError(err) => {
            rollback_withdrawal(caller)?;
            log_audit(AuditEvent::WithdrawalFailed { user: caller, amount: balance });
            Err(err)
        }
        TransferResult::UncertainError(msg) => {
            update_pending_error(caller, msg.clone());
            Err(format!("Processing withdrawal. Check status later. {}", msg))
        }
    }
}

// =============================================================================
// LP WITHDRAWAL HELPERS
// =============================================================================

pub fn schedule_lp_withdrawal(user: Principal, shares: Nat, reserve: Nat, amount: u64) -> Result<(), String> {
     if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Withdrawal already pending".to_string());
    }

    let created_at = ic_cdk::api::time();
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::LP { shares, reserve, amount },
        created_at,
        retries: 0,
        last_error: None,
    };

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().insert(user, pending));
    log_audit(AuditEvent::WithdrawalInitiated { user, amount });
    
    ic_cdk::spawn(async move {
        let _ = process_single_withdrawal(user).await;
    });

    Ok(())
}


// =============================================================================
// INTERNAL CORE
// =============================================================================

async fn attempt_transfer(user: Principal, amount: u64, created_at: u64) -> TransferResult {
    let args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(amount - ICP_TRANSFER_FEE),
        fee: Tokens::from_e8s(ICP_TRANSFER_FEE),
        from_subaccount: None,
        to: AccountIdentifier::new(&user, &DEFAULT_SUBACCOUNT),
        created_at_time: Some(Timestamp { timestamp_nanos: created_at }),
    };

    match ic_ledger_types::transfer(MAINNET_LEDGER_CANISTER_ID, &args).await {
        Ok(Ok(block)) => TransferResult::Success(block),
        Ok(Err(e)) => {
             // Ledger Application Error (e.g. InsufficientFunds)
             // The Ledger definitely rejected it.
             TransferResult::DefiniteError(format!("{:?}", e))
        }
        Err(e) => {
            // System Error (Timeout, CanisterError, etc.)
            // The request might have been processed.
            // CRITICAL: Return UncertainError. Do NOT rollback.
            TransferResult::UncertainError(format!("{:?}", e))
        }
    }
}

fn rollback_withdrawal(user: Principal) -> Result<(), String> {
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
        WithdrawalType::LP { shares, reserve, amount } => {
            // Restore LP position
            liquidity_pool::restore_lp_position(user, shares, reserve);
            log_audit(AuditEvent::LPRestored { user, amount });
        }
    }

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&user));
    Ok(())
}

fn update_pending_error(user: Principal, error: String) {
    PENDING_WITHDRAWALS.with(|p| {
        let mut map = p.borrow_mut();
        if let Some(mut pending) = map.get(&user) {
            pending.last_error = Some(error);
            map.insert(user, pending);
        }
    });
}

// =============================================================================
// RETRY LOGIC
// =============================================================================

pub fn start_retry_timer() {
    RETRY_TIMER_ID.with(|id| {
        if id.borrow().is_some() {
             return;
        }
        let timer_id = ic_cdk_timers::set_timer_interval(Duration::from_secs(300), || async {
            process_pending_withdrawals().await;
        });
        *id.borrow_mut() = Some(timer_id);
    });
}

async fn process_pending_withdrawals() {
    if PROCESSING_WITHDRAWALS.with(|p| *p.borrow()) {
        return;
    }
    PROCESSING_WITHDRAWALS.with(|p| *p.borrow_mut() = true);

    let pending_users: Vec<Principal> = PENDING_WITHDRAWALS.with(|p| {
        p.borrow().iter().take(50).map(|entry| entry.key().clone()).collect()
    });

    for user in pending_users {
        let _ = process_single_withdrawal(user).await;
    }

    PROCESSING_WITHDRAWALS.with(|p| *p.borrow_mut() = false);
}

async fn process_single_withdrawal(user: Principal) -> Result<(), String> {
    let pending = PENDING_WITHDRAWALS.with(|p| p.borrow().get(&user))
        .ok_or("No pending")?;

    if pending.retries >= MAX_RETRIES {
        log_audit(AuditEvent::SystemError {
             error: format!("Withdrawal STUCK for {}. Manual Check Required.", user)
        });
        return Ok(());
    }

    let amount = match pending.withdrawal_type {
         WithdrawalType::User { amount } => amount,
         WithdrawalType::LP { amount, .. } => amount,
    };

    match attempt_transfer(user, amount, pending.created_at).await {
        TransferResult::Success(_) => {
             PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&user));
             log_audit(AuditEvent::WithdrawalCompleted { user, amount });
        }
        TransferResult::DefiniteError(_) => {
             rollback_withdrawal(user)?;
             log_audit(AuditEvent::WithdrawalFailed { user, amount });
        }
        TransferResult::UncertainError(msg) => {
             PENDING_WITHDRAWALS.with(|p| {
                let mut map = p.borrow_mut();
                if let Some(mut w) = map.get(&user) {
                    w.retries += 1;
                    w.last_error = Some(msg);
                    map.insert(user, w);
                }
             });
        }
    }

    Ok(())
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
    (house_balance as f64 * MAX_PAYOUT_PERCENTAGE) as u64
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

#[query]
pub fn get_withdrawal_status() -> Option<PendingWithdrawal> {
    let caller = ic_cdk::caller();
    PENDING_WITHDRAWALS.with(|p| p.borrow().get(&caller))
}

#[query]
pub fn get_audit_log(offset: usize, limit: usize) -> Vec<AuditEntry> {
    AUDIT_LOG.with(|log| {
        let log = log.borrow();
        log.iter()
            .skip(offset)
            .take(limit)
            .collect()
    })
}

// Internal function needed by liquidity_pool.rs
pub(crate) async fn transfer_to_user(user: Principal, amount: u64) -> Result<(), String> {
    let args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(amount - ICP_TRANSFER_FEE),
        fee: Tokens::from_e8s(ICP_TRANSFER_FEE),
        from_subaccount: None,
        to: AccountIdentifier::new(&user, &DEFAULT_SUBACCOUNT),
        created_at_time: None, // Idempotency not required: used for best-effort internal transfers/fees only
    };

    match ic_ledger_types::transfer(MAINNET_LEDGER_CANISTER_ID, &args).await {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => Err(format!("{:?}", e)),
        Err(e) => Err(format!("{:?}", e)),
    }
}

#[update]
pub async fn refresh_canister_balance() -> u64 {
    let ledger = MAINNET_LEDGER_CANISTER_ID;
    let result: Result<(Tokens,), _> = ic_cdk::call(ledger, "account_balance", (AccountBalanceArgs {
        account: AccountIdentifier::new(&ic_cdk::id(), &DEFAULT_SUBACCOUNT)
    },)).await;

    match result {
        Ok((balance,)) => {
            let balance_u64 = balance.e8s();
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

#[update]
pub async fn get_canister_balance() -> u64 {
    #[derive(CandidType, Deserialize)]
    struct IcrcAccount {
        owner: Principal,
        subaccount: Option<Vec<u8>>,
    }

    let account = IcrcAccount {
        owner: ic_cdk::id(),
        subaccount: None,
    };

    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let result: Result<(Nat,), _> = ic_cdk::call(ledger, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            balance.0.try_into().unwrap_or(0)
        }
        Err(e) => {
            ic_cdk::println!("Failed to query canister balance: {:?}", e);
            0
        }
    }
}