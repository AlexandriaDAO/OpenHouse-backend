use candid::{CandidType, Deserialize, Nat, Principal};
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::StableBTreeMap;
use std::cell::RefCell;

use crate::{MEMORY_MANAGER, Memory};

// Constants
const ICP_TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP in e8s
const MIN_DEPOSIT: u64 = 10_000_000; // 0.1 ICP
const MIN_WITHDRAW: u64 = 10_000_000; // 0.1 ICP
const USER_BALANCES_MEMORY_ID: u8 = 10; // Memory ID for user balances
const ICP_LEDGER_CANISTER_ID: &str = "ryjl3-tyaaa-aaaaa-aaaba-cai"; // ICP ledger principal
const MAX_PAYOUT_PERCENTAGE: f64 = 0.10; // 10% of house balance

// ICRC-1 types (since ic-ledger-types doesn't have them all)
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct Account {
    pub owner: Principal,
    pub subaccount: Option<Vec<u8>>,
}

#[derive(CandidType, Deserialize)]
pub struct TransferArg {
    pub from_subaccount: Option<Vec<u8>>,
    pub to: Account,
    pub amount: Nat,
    pub fee: Option<Nat>,
    pub memo: Option<Vec<u8>>,
    pub created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Debug)]
pub enum TransferErrorIcrc {
    BadFee { expected_fee: Nat },
    BadBurn { min_burn_amount: Nat },
    InsufficientFunds { balance: Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: Nat },
    TemporarilyUnavailable,
    GenericError { error_code: Nat, message: String },
}

// User balance tracking (stable storage only)
thread_local! {
    // Stable storage for persistence across upgrades
    static USER_BALANCES_STABLE: RefCell<StableBTreeMap<Principal, u64, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(USER_BALANCES_MEMORY_ID))),
        )
    );

    // Cached canister balance (refreshed hourly via heartbeat)
    // This avoids 500ms ledger query on every balance check
    static CACHED_CANISTER_BALANCE: RefCell<u64> = RefCell::new(0);
}

#[derive(CandidType, Deserialize, Clone)]
pub struct AccountingStats {
    pub total_user_deposits: u64,
    pub house_balance: u64,
    pub canister_balance: u64,
    pub unique_depositors: u64,
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/// Calculate total user deposits on-demand from stable storage
fn calculate_total_deposits() -> u64 {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow()
            .iter()
            .map(|(_, balance)| balance)
            .sum()
    })
}

/// Rollback balance change helper (DRY)
fn rollback_balance_change(user: Principal, original_balance: u64) {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, original_balance);
    });
}

// =============================================================================
// DEPOSIT FUNCTION
// =============================================================================

#[update]
pub async fn deposit(amount: u64) -> Result<u64, String> {
    // STEP 1: Validate deposit amount
    if amount < MIN_DEPOSIT {
        return Err(format!("Minimum deposit is {} ICP", MIN_DEPOSIT / 100_000_000));
    }

    let caller = ic_cdk::caller();

    // STEP 2: Transfer ICP from user to canister using ICRC-1
    let transfer_args = TransferArg {
        from_subaccount: None,
        to: Account {
            owner: ic_cdk::id(),
            subaccount: None,
        },
        amount: Nat::from(amount),
        fee: Some(Nat::from(ICP_TRANSFER_FEE)),
        memo: None,
        created_at_time: None,
    };

    let ledger = Principal::from_text(ICP_LEDGER_CANISTER_ID)
        .expect("ICP ledger canister ID must be valid");
    let call_result: Result<(Result<Nat, TransferErrorIcrc>,), _> =
        ic_cdk::call(ledger, "icrc1_transfer", (transfer_args,)).await;

    match call_result {
        Ok((transfer_result,)) => match transfer_result {
            Ok(_block_index) => {
                // Credit user with full amount
                // In ICRC-1: user pays (amount + fee), canister receives amount
                let new_balance = USER_BALANCES_STABLE.with(|balances| {
                    let mut balances = balances.borrow_mut();
                    let current = balances.get(&caller).unwrap_or(0);
                    let new_bal = current + amount;
                    balances.insert(caller, new_bal);
                    new_bal
                });

                ic_cdk::println!("Deposit successful: {} deposited {} e8s", caller, amount);
                Ok(new_balance)
            }
            Err(transfer_error) => {
                Err(format!("Transfer failed: {:?}", transfer_error))
            }
        }
        Err(call_error) => {
            Err(format!("Transfer call failed: {:?}", call_error))
        }
    }
}

// =============================================================================
// WITHDRAW FUNCTION
// =============================================================================

#[update]
pub async fn withdraw(amount: u64) -> Result<u64, String> {
    // STEP 1: Validate withdrawal amount
    if amount < MIN_WITHDRAW {
        return Err(format!("Minimum withdrawal is {} ICP", MIN_WITHDRAW / 100_000_000));
    }

    let caller = ic_cdk::caller();

    // STEP 2: Check user has sufficient balance
    let user_balance = get_balance(caller);
    if user_balance < amount {
        return Err(format!("Insufficient balance. You have {} e8s, trying to withdraw {} e8s", user_balance, amount));
    }

    // Deduct from user balance FIRST (prevent re-entrancy)
    let new_balance = USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let new_bal = user_balance - amount;
        balances.insert(caller, new_bal);
        new_bal
    });

    // Transfer ICP from canister to user
    let transfer_args = TransferArg {
        from_subaccount: None,
        to: Account {
            owner: caller,
            subaccount: None,
        },
        amount: Nat::from(amount - ICP_TRANSFER_FEE),
        fee: Some(Nat::from(ICP_TRANSFER_FEE)),
        memo: None,
        created_at_time: None,
    };

    let ledger = Principal::from_text(ICP_LEDGER_CANISTER_ID)
        .expect("ICP ledger canister ID must be valid");
    let call_result: Result<(Result<Nat, TransferErrorIcrc>,), _> =
        ic_cdk::call(ledger, "icrc1_transfer", (transfer_args,)).await;

    match call_result {
        Ok((transfer_result,)) => match transfer_result {
            Ok(_block_index) => {
                ic_cdk::println!("Withdrawal successful: {} withdrew {} e8s", caller, amount);
                Ok(new_balance)
            }
            Err(transfer_error) => {
                // Use helper for rollback
                rollback_balance_change(caller, user_balance);
                Err(format!("Transfer failed: {:?}", transfer_error))
            }
        }
        Err(call_error) => {
            // Use helper for rollback
            rollback_balance_change(caller, user_balance);
            Err(format!("Transfer call failed: {:?}", call_error))
        }
    }
}

// =============================================================================
// WITHDRAW ALL FUNCTION
// =============================================================================

#[update]
pub async fn withdraw_all() -> Result<u64, String> {
    let caller = ic_cdk::caller();
    let user_balance = get_balance(caller);

    // Check if user has any balance to withdraw
    if user_balance == 0 {
        return Err("No balance to withdraw".to_string());
    }

    // Check if balance meets minimum withdrawal
    if user_balance < MIN_WITHDRAW {
        return Err(format!("Balance {} e8s is below minimum withdrawal of {} ICP",
                          user_balance, MIN_WITHDRAW / 100_000_000));
    }

    // Call the regular withdraw function with the full balance
    withdraw(user_balance).await
}

// =============================================================================
// BALANCE QUERIES
// =============================================================================

#[query]
pub fn get_balance(user: Principal) -> u64 {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow().get(&user).unwrap_or(0)
    })
}

#[query]
pub fn get_my_balance() -> u64 {
    get_balance(ic_cdk::caller())
}

/// Get the maximum allowed payout (10% of house balance)
/// Fast query using cached balance - no ledger call needed
#[query]
pub fn get_max_allowed_payout() -> u64 {
    let house_balance = get_house_balance();
    (house_balance as f64 * MAX_PAYOUT_PERCENTAGE) as u64
}

/// Get house balance using liquidity pool reserve
/// Fast query - no ledger call needed
#[query]
pub fn get_house_balance() -> u64 {
    // NEW: Use pool reserve directly from liquidity pool
    super::liquidity_pool::get_pool_reserve()
}

#[query]
pub fn get_accounting_stats() -> AccountingStats {
    let total_deposits = calculate_total_deposits();
    let unique_depositors = USER_BALANCES_STABLE.with(|balances|
        balances.borrow().iter().count() as u64
    );

    let canister_balance = CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow());
    let house_balance = if canister_balance > total_deposits {
        canister_balance - total_deposits
    } else {
        0
    };

    AccountingStats {
        total_user_deposits: total_deposits,
        house_balance,
        canister_balance,
        unique_depositors,
    }
}

// =============================================================================
// AUDIT FUNCTIONS
// =============================================================================

#[query]
pub fn audit_balances() -> Result<String, String> {
    let total_deposits = calculate_total_deposits();
    let canister_balance = CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow());

    let house_balance = if canister_balance > total_deposits {
        canister_balance - total_deposits
    } else {
        0
    };

    let calculated_total = house_balance + total_deposits;

    if calculated_total == canister_balance {
        Ok(format!("✅ Audit passed: house ({}) + deposits ({}) = canister ({})",
                   house_balance, total_deposits, canister_balance))
    } else {
        Err(format!("❌ Audit FAILED: house ({}) + deposits ({}) = {} != canister ({})",
                    house_balance, total_deposits, calculated_total, canister_balance))
    }
}

// =============================================================================
// BALANCE UPDATE (Internal use only)
// =============================================================================

/// Update user balance (called by game logic)
/// Note: Total deposits are calculated on-demand, so no need to track separately
pub fn update_balance(user: Principal, new_balance: u64) -> Result<(), String> {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, new_balance);
    });

    Ok(())
}

// =============================================================================
// COMPATIBILITY FUNCTION
// =============================================================================

/// Refresh canister balance from ledger and update cache
/// Called by heartbeat every hour to keep cache fresh
#[update]
pub async fn refresh_canister_balance() -> u64 {
    let account = Account {
        owner: ic_cdk::id(),
        subaccount: None,
    };

    let ledger = Principal::from_text(ICP_LEDGER_CANISTER_ID)
        .expect("ICP ledger canister ID must be valid");
    let result: Result<(Nat,), _> = ic_cdk::call(ledger, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            let balance_u64 = balance.0.try_into().unwrap_or(0);
            // Update the cache
            CACHED_CANISTER_BALANCE.with(|cache| {
                *cache.borrow_mut() = balance_u64;
            });
            ic_cdk::println!("Balance cache refreshed: {} e8s", balance_u64);
            balance_u64
        }
        Err(e) => {
            // Return cached value on error
            ic_cdk::println!("⚠️ Failed to refresh balance, using cache: {:?}", e);
            CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow())
        }
    }
}

