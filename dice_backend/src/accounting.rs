use candid::{CandidType, Deserialize, Nat, Principal};
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::StableBTreeMap;
use std::cell::RefCell;
use std::collections::HashMap;

use crate::{MEMORY_MANAGER, Memory};

// Constants
const ICP_TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP in e8s
const MIN_DEPOSIT: u64 = 100_000_000; // 1 ICP
const MIN_WITHDRAW: u64 = 10_000_000; // 0.1 ICP

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

// User balance tracking (in-memory + stable backup)
thread_local! {
    // In-memory for fast access
    static USER_BALANCES: RefCell<HashMap<Principal, u64>> = RefCell::new(HashMap::new());

    // Stable storage for persistence across upgrades
    static USER_BALANCES_STABLE: RefCell<StableBTreeMap<Principal, u64, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(10))),
        )
    );

    // Track total user deposits for house balance calculation
    static TOTAL_USER_DEPOSITS: RefCell<u64> = RefCell::new(0);

    // Cached canister balance (updated after deposits/withdrawals)
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
// BALANCE CACHE MANAGEMENT
// =============================================================================

/// Refresh the cached canister balance from the ledger
#[update]
pub async fn refresh_canister_balance() -> u64 {
    let account = Account {
        owner: ic_cdk::id(),
        subaccount: None,
    };

    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let result: Result<(Nat,), _> = ic_cdk::call(ledger, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            let balance_u64 = balance.0.try_into().unwrap_or(0);
            CACHED_CANISTER_BALANCE.with(|cache| {
                *cache.borrow_mut() = balance_u64;
            });
            balance_u64
        }
        Err(e) => {
            ic_cdk::println!("Failed to refresh canister balance: {:?}", e);
            0
        }
    }
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

    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let call_result: Result<(Result<Nat, TransferErrorIcrc>,), _> =
        ic_cdk::call(ledger, "icrc1_transfer", (transfer_args,)).await;

    match call_result {
        Ok((transfer_result,)) => match transfer_result {
            Ok(_block_index) => {
                // STEP 3: Credit user with (amount - fee) since ledger deducts fee
                // Canister receives amount, but user paid amount + fee
                // To keep accounting correct: credit user with what canister actually received
                let credited_amount = amount.saturating_sub(ICP_TRANSFER_FEE);

                let new_balance = USER_BALANCES.with(|balances| {
                    let mut balances = balances.borrow_mut();
                    let current = balances.get(&caller).unwrap_or(&0);
                    let new_bal = current + credited_amount;
                    balances.insert(caller, new_bal);
                    new_bal
                });

                // STEP 4: Persist to stable storage
                USER_BALANCES_STABLE.with(|stable| {
                    stable.borrow_mut().insert(caller, new_balance);
                });

                // STEP 5: Update total deposits
                TOTAL_USER_DEPOSITS.with(|total| {
                    *total.borrow_mut() += credited_amount;
                });

                // STEP 6: Refresh cached canister balance
                refresh_canister_balance().await;

                ic_cdk::println!("Deposit successful: {} deposited {} e8s (credited {} e8s after fee)",
                                 caller, amount, credited_amount);
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

    // STEP 3: Deduct from user balance FIRST (prevent re-entrancy)
    let new_balance = USER_BALANCES.with(|balances| {
        let mut balances = balances.borrow_mut();
        let new_bal = user_balance - amount;
        balances.insert(caller, new_bal);
        new_bal
    });

    // STEP 4: Persist to stable storage
    USER_BALANCES_STABLE.with(|stable| {
        stable.borrow_mut().insert(caller, new_balance);
    });

    // STEP 5: Update total deposits
    TOTAL_USER_DEPOSITS.with(|total| {
        *total.borrow_mut() -= amount;
    });

    // STEP 6: Transfer ICP from canister to user
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

    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let call_result: Result<(Result<Nat, TransferErrorIcrc>,), _> =
        ic_cdk::call(ledger, "icrc1_transfer", (transfer_args,)).await;

    match call_result {
        Ok((transfer_result,)) => match transfer_result {
            Ok(_block_index) => {
                // Refresh cached canister balance after successful withdrawal
                refresh_canister_balance().await;

                ic_cdk::println!("Withdrawal successful: {} withdrew {} e8s", caller, amount);
                Ok(new_balance)
            }
            Err(transfer_error) => {
                // ROLLBACK on transfer error
                USER_BALANCES.with(|balances| {
                    balances.borrow_mut().insert(caller, user_balance);
                });
                USER_BALANCES_STABLE.with(|stable| {
                    stable.borrow_mut().insert(caller, user_balance);
                });
                TOTAL_USER_DEPOSITS.with(|total| {
                    *total.borrow_mut() += amount;
                });
                Err(format!("Transfer failed: {:?}", transfer_error))
            }
        }
        Err(call_error) => {
            // ROLLBACK on call failure
            USER_BALANCES.with(|balances| {
                balances.borrow_mut().insert(caller, user_balance);
            });
            USER_BALANCES_STABLE.with(|stable| {
                stable.borrow_mut().insert(caller, user_balance);
            });
            TOTAL_USER_DEPOSITS.with(|total| {
                *total.borrow_mut() += amount;
            });
            Err(format!("Transfer call failed: {:?}", call_error))
        }
    }
}

// =============================================================================
// BALANCE QUERIES
// =============================================================================

#[query]
pub fn get_balance(user: Principal) -> u64 {
    USER_BALANCES.with(|balances| {
        *balances.borrow().get(&user).unwrap_or(&0)
    })
}

#[query]
pub fn get_my_balance() -> u64 {
    get_balance(ic_cdk::caller())
}

#[query]
pub fn get_house_balance() -> u64 {
    // House balance = Total canister balance - Total user deposits
    // Uses cached balance (refreshed after deposits/withdrawals)
    let canister_balance = CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow());
    let total_deposits = TOTAL_USER_DEPOSITS.with(|total| *total.borrow());

    if canister_balance > total_deposits {
        canister_balance - total_deposits
    } else {
        0 // Should never happen unless exploited
    }
}

#[query]
pub fn get_accounting_stats() -> AccountingStats {
    let total_deposits = TOTAL_USER_DEPOSITS.with(|total| *total.borrow());
    let unique_depositors = USER_BALANCES.with(|balances| balances.borrow().len() as u64);
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
    // Verify: house_balance + sum(user_balances) = canister_balance
    let total_deposits = TOTAL_USER_DEPOSITS.with(|total| *total.borrow());
    let house_balance = get_house_balance();
    let canister_balance = CACHED_CANISTER_BALANCE.with(|cache| *cache.borrow());

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

pub fn update_balance(user: Principal, new_balance: u64) -> Result<(), String> {
    USER_BALANCES.with(|balances| {
        balances.borrow_mut().insert(user, new_balance);
    });

    USER_BALANCES_STABLE.with(|stable| {
        stable.borrow_mut().insert(user, new_balance);
    });

    Ok(())
}

// =============================================================================
// UPGRADE HOOKS
// =============================================================================

pub fn pre_upgrade_accounting() {
    // USER_BALANCES_STABLE already persists data
    // TOTAL_USER_DEPOSITS needs to be persisted - will be recalculated on post_upgrade
}

pub fn post_upgrade_accounting() {
    // Restore in-memory HashMap from stable storage
    USER_BALANCES_STABLE.with(|stable| {
        USER_BALANCES.with(|memory| {
            let mut memory = memory.borrow_mut();
            memory.clear();

            let mut total = 0u64;
            for (principal, balance) in stable.borrow().iter() {
                memory.insert(principal, balance);
                total += balance;
            }

            // Restore total deposits
            TOTAL_USER_DEPOSITS.with(|t| {
                *t.borrow_mut() = total;
            });
        });
    });
}
