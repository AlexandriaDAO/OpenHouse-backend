use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::StableBTreeMap;
use std::cell::RefCell;
use ic_ledger_types::{
    AccountIdentifier, TransferArgs, Tokens, DEFAULT_SUBACCOUNT,
    MAINNET_LEDGER_CANISTER_ID, Memo, AccountBalanceArgs,
};

use crate::{MEMORY_MANAGER, Memory};
use super::liquidity_pool;

// Constants
const ICP_TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP in e8s
const MIN_DEPOSIT: u64 = 10_000_000; // 0.1 ICP
const MIN_WITHDRAW: u64 = 10_000_000; // 0.1 ICP
const USER_BALANCES_MEMORY_ID: u8 = 10; // Memory ID for user balances
const MAX_PAYOUT_PERCENTAGE: f64 = 0.10; // 10% of house balance



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

    // STEP 2: Transfer ICP from user to canister using standard ledger types
    let transfer_args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(amount),
        fee: Tokens::from_e8s(ICP_TRANSFER_FEE),
        from_subaccount: None,
        to: AccountIdentifier::new(&ic_cdk::id(), &DEFAULT_SUBACCOUNT),
        created_at_time: None,
    };

    match ic_ledger_types::transfer(MAINNET_LEDGER_CANISTER_ID, transfer_args).await {
        Ok(Ok(block_index)) => {
            // Credit user with full amount
            let new_balance = USER_BALANCES_STABLE.with(|balances| {
                let mut balances = balances.borrow_mut();
                let current = balances.get(&caller).unwrap_or(0);
                let new_bal = current + amount;
                balances.insert(caller, new_bal);
                new_bal
            });

            ic_cdk::println!("Deposit successful: {} deposited {} e8s at block {}", caller, amount, block_index);
            Ok(new_balance)
        }
        Ok(Err(e)) => Err(format!("Transfer failed: {:?}", e)),
        Err((code, msg)) => Err(format!("Transfer call failed: {:?} {}", code, msg)),
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
    let user_balance = get_balance_internal(caller);
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
    // We use standard `transfer` (legacy) for simplicity and type safety with ic-ledger-types
    let transfer_args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(amount - ICP_TRANSFER_FEE),
        fee: Tokens::from_e8s(ICP_TRANSFER_FEE),
        from_subaccount: None,
        to: AccountIdentifier::new(&caller, &DEFAULT_SUBACCOUNT),
        created_at_time: None,
    };

    match ic_ledger_types::transfer(MAINNET_LEDGER_CANISTER_ID, transfer_args).await {
        Ok(Ok(block_index)) => {
            ic_cdk::println!("Withdrawal successful: {} withdrew {} e8s at block {}", caller, amount, block_index);
            Ok(new_balance)
        }
        Ok(Err(e)) => {
            // Rollback
            rollback_balance_change(caller, user_balance);
            Err(format!("Transfer failed: {:?}", e))
        }
        Err((code, msg)) => {
            // Rollback
            rollback_balance_change(caller, user_balance);
            Err(format!("Transfer call failed: {:?} {}", code, msg))
        }
    }
}

// =============================================================================
// WITHDRAW ALL FUNCTION
// =============================================================================

#[update]
pub async fn withdraw_all() -> Result<u64, String> {
    let caller = ic_cdk::caller();
    let user_balance = get_balance_internal(caller);

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
// BALANCE QUERIES (INTERNAL)
// =============================================================================

pub(crate) fn get_balance_internal(user: Principal) -> u64 {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow().get(&user).unwrap_or(0)
    })
}

/// Get the maximum allowed payout (10% of house balance)
/// Fast query using cached balance - no ledger call needed
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

// =============================================================================
// AUDIT FUNCTIONS (INTERNAL)
// =============================================================================

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
    let ledger = MAINNET_LEDGER_CANISTER_ID;
    let result: Result<(Tokens,), _> = ic_cdk::call(ledger, "account_balance", (AccountBalanceArgs {
        account: AccountIdentifier::new(&ic_cdk::id(), &DEFAULT_SUBACCOUNT)
    },)).await;

    match result {
        Ok((balance,)) => {
            let balance_u64 = balance.e8s();
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

// Internal transfer function for withdrawals (used by liquidity_pool)
pub(crate) async fn transfer_to_user(recipient: Principal, amount: u64) -> Result<(), String> {
    let transfer_args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(amount),
        fee: Tokens::from_e8s(10_000),
        from_subaccount: None,
        to: AccountIdentifier::new(&recipient, &DEFAULT_SUBACCOUNT),
        created_at_time: None,
    };

    match ic_ledger_types::transfer(MAINNET_LEDGER_CANISTER_ID, transfer_args).await {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => Err(format!("Transfer failed: {:?}", e)),
        Err((code, msg)) => Err(format!("Transfer call failed: {:?} {}", code, msg)),
    }
}
