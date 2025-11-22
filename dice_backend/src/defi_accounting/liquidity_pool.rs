use candid::{CandidType, Deserialize, Nat, Principal};
use ic_cdk::{query, update};
use ic_stable_structures::{StableBTreeMap, StableCell, memory_manager::VirtualMemory, DefaultMemoryImpl, Storable};
use serde::Serialize;
use std::cell::RefCell;
use std::borrow::Cow;
use num_traits::ToPrimitive;
use ic_ledger_types::MAINNET_LEDGER_CANISTER_ID;

use super::accounting;

// Constants

const MINIMUM_LIQUIDITY: u64 = 1000;
const MIN_DEPOSIT: u64 = 100_000_000; // 1 ICP minimum for all deposits
const MIN_WITHDRAWAL: u64 = 100_000; // 0.001 ICP
const MIN_OPERATING_BALANCE: u64 = 1_000_000_000; // 10 ICP to operate games
const TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP
const PARENT_STAKER_CANISTER: &str = "e454q-riaaa-aaaap-qqcyq-cai";
const LP_WITHDRAWAL_FEE_BPS: u64 = 100; // 1%

pub fn get_parent_principal() -> Principal {
    Principal::from_text(PARENT_STAKER_CANISTER).expect("Invalid parent canister ID")
}

// Storable wrapper for Nat
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct StorableNat(pub Nat);

impl Storable for StorableNat {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let bytes = self.0.0.to_bytes_be();
        let len = bytes.len() as u32;
        let mut result = len.to_be_bytes().to_vec();
        result.extend_from_slice(&bytes);
        Cow::Owned(result)
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        if bytes.len() < 4 {
            panic!("StorableNat: Invalid byte length < 4");
        }
        let len = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        if bytes.len() < 4 + len {
            panic!("StorableNat: Invalid byte length, expected {} but got {}", 4 + len, bytes.len());
        }
        let bigint_bytes = &bytes[4..4+len];
        let biguint = num_bigint::BigUint::from_bytes_be(bigint_bytes);
        StorableNat(Nat(biguint))
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Unbounded;
}

// Pool state for stable storage
#[derive(Clone, CandidType, Deserialize, Serialize)]
struct PoolState {
    reserve: Nat,
    initialized: bool,
}

impl Storable for PoolState {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let serialized = serde_json::to_vec(self).unwrap();
        Cow::Owned(serialized)
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 1000,
            is_fixed_size: false
        };
}

// Storage
thread_local! {
    // LP shares by user
    static LP_SHARES: RefCell<StableBTreeMap<Principal, StorableNat, VirtualMemory<DefaultMemoryImpl>>> = {
        RefCell::new(StableBTreeMap::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(ic_stable_structures::memory_manager::MemoryId::new(11)))
        ))
    };

    // Pool state (reserve + initialized flag)
    static POOL_STATE: RefCell<StableCell<PoolState, VirtualMemory<DefaultMemoryImpl>>> = {
        RefCell::new(StableCell::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(ic_stable_structures::memory_manager::MemoryId::new(13))),
            PoolState {
                reserve: Nat::from(0u64),
                initialized: false,
            }
        ))
    };
}

// Types
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct LPPosition {
    pub shares: Nat,
    pub pool_ownership_percent: f64,
    pub redeemable_icp: Nat,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct PoolStats {
    pub total_shares: Nat,
    pub pool_reserve: Nat,
    pub share_price: Nat,
    pub total_liquidity_providers: u64,
    pub minimum_liquidity_burned: Nat,
    pub is_initialized: bool,
}

// Deposit liquidity
// NOTE: We use `icrc2_transfer_from` here because the user must approve the canister
// to spend their funds (ICRC-2 approval flow). This is different from user deposits
// in `accounting.rs` which use the legacy `transfer` (ICRC-1) where the user sends
// funds directly to the canister's subaccount.
#[update]
pub async fn deposit_liquidity(amount: u64) -> Result<Nat, String> {
    // Validate
    if amount < MIN_DEPOSIT {
        return Err(format!("Minimum deposit is {} e8s", MIN_DEPOSIT));
    }

    let caller = ic_cdk::api::msg_caller();
    let amount_nat = Nat::from(amount);

    // Transfer from user (requires prior ICRC-2 approval)
    match transfer_from_user(caller, amount).await {
        Err(e) => return Err(format!("Transfer failed: {}", e)),
        Ok(_) => {}
    }

    // Calculate shares to mint
    let shares_to_mint = POOL_STATE.with(|state| {
        let pool_state = state.borrow().get().clone();
        let current_reserve = pool_state.reserve.clone();
        let total_shares = calculate_total_supply();

        if total_shares == Nat::from(0u64) {
            // First deposit - burn minimum liquidity
            let initial_shares = amount_nat.clone();
            let burned_shares = Nat::from(MINIMUM_LIQUIDITY);

            // Mint burned shares to zero address
            LP_SHARES.with(|shares| {
                shares.borrow_mut().insert(Principal::anonymous(), StorableNat(burned_shares.clone()));
            });

            // User gets initial_shares - burned
            if initial_shares < burned_shares {
                return Err("Initial deposit too small".to_string());
            }
            Ok(initial_shares - burned_shares)
        } else {
            // Subsequent deposits - proportional shares
            // shares = (amount * total_shares) / current_reserve
            let numerator = amount_nat.clone() * total_shares;
            if current_reserve == Nat::from(0u64) {
                 return Err("Division by zero".to_string());
            }
            Ok(numerator / current_reserve)
        }
    })?;

    // Update user shares
    LP_SHARES.with(|shares| {
        let mut shares_map = shares.borrow_mut();
        let current = shares_map.get(&caller).map(|s| s.0.clone()).unwrap_or(Nat::from(0u64));
        let new_shares = current + shares_to_mint.clone();
        shares_map.insert(caller, StorableNat(new_shares));
    });

    // Update pool reserve
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        pool_state.reserve += amount_nat;
        state.borrow_mut().set(pool_state);
    });

    Ok(shares_to_mint)
}

// Internal function for withdrawing liquidity (called by withdraw_all_liquidity)
// 
// # Fire and Forget Accounting
// This function implements the simplest possible fee mechanism:
// 1. Deduct the FULL payout (LP share + Fee) from the Reserve immediately.
// 2. Transfer the LP's share (Critical). If this fails, rollback everything.
// 3. Transfer the Fee (Best Effort). If this fails, we DO NOT rollback.
//    The fee remains in the canister as a protocol buffer.
//    This ensures the Reserve is always solvent (Reserve <= Balance).
async fn withdraw_liquidity(shares_to_burn: Nat) -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();

    // Validate shares
    if shares_to_burn == Nat::from(0u64) {
        return Err("Cannot withdraw zero shares".to_string());
    }

    let user_shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
    if user_shares < shares_to_burn {
        return Err("Insufficient shares".to_string());
    }

    // Calculate payout
    let payout_nat = POOL_STATE.with(|state| {
        let pool_state = state.borrow().get().clone();
        let current_reserve = pool_state.reserve.clone();
        let total_shares = calculate_total_supply();

        if total_shares == Nat::from(0u64) {
            return Err("No shares in circulation".to_string());
        }

        // payout = (shares_to_burn * current_reserve) / total_shares
        // payout = (shares_to_burn * current_reserve) / total_shares
        let numerator = shares_to_burn.clone() * current_reserve.clone();
        // SAFETY: total_shares checked for zero above (line 207)
        let payout = numerator / total_shares;

        // Check reserve sufficiency (read-only check)
        if current_reserve < payout {
             return Err("Insufficient pool reserve".to_string());
        }

        Ok(payout)
    })?;

    // Check minimum withdrawal
    let payout_u64 = payout_nat.0.to_u64().ok_or("Payout too large")?;
    if payout_u64 < MIN_WITHDRAWAL {
        return Err(format!("Minimum withdrawal is {} e8s", MIN_WITHDRAWAL));
    }

    // Calculate fee (1% using basis points for precision)
    let fee_amount = (payout_u64 * LP_WITHDRAWAL_FEE_BPS) / 10_000;
    let lp_amount = payout_u64 - fee_amount;

    // Update shares BEFORE transfer (reentrancy protection)
    LP_SHARES.with(|shares| {
        let mut shares_map = shares.borrow_mut();
        let new_shares = user_shares.clone() - shares_to_burn.clone();
        if new_shares == Nat::from(0u64) {
            shares_map.remove(&caller);
        } else {
            shares_map.insert(caller, StorableNat(new_shares));
        }
    });

    // Deduct FULL payout from reserve
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        if pool_state.reserve < payout_nat {
             return Err("Insufficient pool reserve".to_string());
        }
        pool_state.reserve -= payout_nat.clone();
        state.borrow_mut().set(pool_state);
        Ok::<(), String>(())
    })?;

    // Schedule Safe Withdrawal
    match accounting::schedule_lp_withdrawal(caller, shares_to_burn.clone(), payout_nat.clone(), lp_amount) {
        Ok(_) => {
            // SAFE ACCOUNTING: Credit parent internally
            // No ledger transfer needed, so we save the TRANSFER_FEE.
            // PROTOCOL BENEFIT: Since no ledger transfer occurs, the saved TRANSFER_FEE
            // is retained as protocol revenue.
            if fee_amount > 0 {
                 let parent = get_parent_principal();
                 if !accounting::credit_parent_fee(parent, fee_amount) {
                     // Parent is busy (pending withdrawal).
                     // Return fee to the pool reserve (LPs get the bonus).
                     // This ensures Reserve + Deposits == Canister Balance.
                     POOL_STATE.with(|state| {
                        let mut pool_state = state.borrow().get().clone();
                        pool_state.reserve += Nat::from(fee_amount);
                        state.borrow_mut().set(pool_state);
                    });

                    accounting::log_audit(crate::defi_accounting::types::AuditEvent::ParentFeeFallback {
                        amount: fee_amount,
                        reason: "Credit failed".to_string()
                    });
                 }
            }

            Ok(lp_amount)
        }
        Err(e) => {
            // If scheduling fails (e.g. duplicate), rollback state immediately
            
            // 1. Restore shares
            LP_SHARES.with(|shares| {
                shares.borrow_mut().insert(caller, StorableNat(user_shares));
            });

            // 2. Restore reserve (add back FULL payout)
            POOL_STATE.with(|state| {
                let mut pool_state = state.borrow().get().clone();
                pool_state.reserve += payout_nat;
                state.borrow_mut().set(pool_state);
            });

            Err(e)
        }
    }
}

#[update]
pub async fn withdraw_all_liquidity() -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    let shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));

    if shares == Nat::from(0u64) {
        return Err("No liquidity to withdraw".to_string());
    }

    withdraw_liquidity(shares).await
}

// Query functions

pub(crate) fn get_lp_position_internal(user: Principal) -> LPPosition {
    let user_shares = LP_SHARES.with(|s| s.borrow().get(&user).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
    let total_shares = calculate_total_supply();
    let pool_reserve = get_pool_reserve_nat();

    let (ownership_percent, redeemable_icp) = if total_shares == Nat::from(0u64) {
        (0.0, Nat::from(0u64))
    } else if pool_reserve == Nat::from(0u64) {
        // Edge case: shares exist but no reserve
        let ownership = (user_shares.0.to_f64().unwrap_or(0.0) /
                        total_shares.0.to_f64().unwrap_or(1.0)) * 100.0;
        (ownership, Nat::from(0u64))
    } else {
        // Normal case
        let ownership = (user_shares.0.to_f64().unwrap_or(0.0) /
                        total_shares.0.to_f64().unwrap_or(1.0)) * 100.0;
        let numerator = user_shares.clone() * pool_reserve.clone();
        // SAFETY: total_shares checked for zero above (line 307)
        let redeemable = numerator / total_shares;
        (ownership, redeemable)
    };

    LPPosition {
        shares: user_shares,
        pool_ownership_percent: ownership_percent,
        redeemable_icp,
    }
}

pub(crate) fn get_pool_stats_internal() -> PoolStats {
    let total_shares = calculate_total_supply();
    let pool_state = POOL_STATE.with(|s| s.borrow().get().clone());
    let pool_reserve = pool_state.reserve;

    // Calculate share price
    let share_price = if total_shares == Nat::from(0u64) {
        Nat::from(100_000_000u64) // 1 ICP initial price
    } else if pool_reserve == Nat::from(0u64) {
        Nat::from(1u64) // Minimum price if drained
    } else {
        // SAFETY: total_shares checked for zero above (line 336)
        pool_reserve.clone() / total_shares.clone()
    };

    // Count LPs (excluding burned shares)
    let total_lps = LP_SHARES.with(|shares| {
        shares.borrow().iter()
            .filter(|entry| entry.key() != &Principal::anonymous() && entry.value().0 != Nat::from(0u64))
            .count() as u64
    });

    PoolStats {
        total_shares,
        pool_reserve,
        share_price,
        total_liquidity_providers: total_lps,
        minimum_liquidity_burned: if pool_state.initialized {
            Nat::from(MINIMUM_LIQUIDITY)
        } else {
            Nat::from(0u64)
        },
        is_initialized: pool_state.initialized,
    }
}

// Helper functions

fn calculate_total_supply() -> Nat {
    LP_SHARES.with(|shares| {
        shares.borrow()
            .iter()
            .map(|entry| entry.value().0.clone())
            .fold(Nat::from(0u64), |acc, amt| acc + amt)
    })
}

pub fn get_pool_reserve() -> u64 {
    get_pool_reserve_nat().0.to_u64().expect("Pool reserve exceeds u64")
}

pub fn get_pool_reserve_nat() -> Nat {
    POOL_STATE.with(|s| s.borrow().get().reserve.clone())
}

#[query]
pub fn can_accept_bets() -> bool {
    let pool_reserve = get_pool_reserve();
    pool_reserve >= MIN_OPERATING_BALANCE
}

// Game integration (internal use only - called by game logic)

pub(crate) fn update_pool_on_win(payout: u64) {
    // Player won - deduct from pool (concurrent-safe)
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        let payout_nat = Nat::from(payout);

        // Safe subtraction with trap on underflow
        if pool_state.reserve < payout_nat {
             // CRITICAL: Halt operations to protect LP funds
             ic_cdk::trap(&format!(
                "CRITICAL: Pool insolvent. Attempted payout {} e8s exceeds reserve {} e8s. Halting to protect LPs.",
                payout,
                pool_state.reserve.0.to_u64().unwrap_or(u64::MAX) // Use MAX to indicate overflow if it happens
            ));
        }
        pool_state.reserve -= payout_nat;
        state.borrow_mut().set(pool_state);
    });
}

pub(crate) fn update_pool_on_loss(bet: u64) {
    // Player lost - add to pool (concurrent-safe)
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        pool_state.reserve += Nat::from(bet);
        state.borrow_mut().set(pool_state);
    });
}

/// Restore LP position after failed withdrawal (called by accounting module)
pub fn restore_lp_position(user: Principal, shares: Nat, reserve_amount: Nat) {
    // Restore user's LP shares
    LP_SHARES.with(|shares_map| {
        shares_map.borrow_mut().insert(user, StorableNat(shares));
    });

    // Restore pool reserve
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        pool_state.reserve += reserve_amount;
        state.borrow_mut().set(pool_state);
    });

    ic_cdk::println!("LP position restored for user: {}", user);
}

// Transfer helpers (using existing accounting module)

// ICRC-2 types not in ic_ledger_types
#[derive(CandidType, Deserialize)]
struct Account {
    owner: Principal,
    subaccount: Option<[u8; 32]>,
}

#[derive(CandidType, Deserialize)]
struct TransferFromArgs {
    from: Account,
    to: Account,
    amount: Nat,
    fee: Option<Nat>,
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
    spender_subaccount: Option<[u8; 32]>,
}

#[derive(CandidType, Deserialize, Debug)]
enum TransferFromError {
    BadFee { expected_fee: Nat },
    BadBurn { min_burn_amount: Nat },
    InsufficientFunds { balance: Nat },
    InsufficientAllowance { allowance: Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: Nat },
    TemporarilyUnavailable,
    GenericError { error_code: Nat, message: String },
}

type TransferFromResult = Result<Nat, TransferFromError>;

#[allow(deprecated)]
async fn transfer_from_user(user: Principal, amount: u64) -> Result<(), String> {
    // Frontend must call icrc2_approve first
    // Then we use transfer_from
    let ledger = MAINNET_LEDGER_CANISTER_ID;
    let canister_id = ic_cdk::api::canister_self();

    let args = TransferFromArgs {
        from: Account {
            owner: user,
            subaccount: None,
        },
        to: Account {
            owner: canister_id,
            subaccount: None,
        },
        amount: Nat::from(amount),
        fee: Some(Nat::from(TRANSFER_FEE)),
        memo: None,
        created_at_time: None,
        spender_subaccount: None,
    };

    let (result,): (TransferFromResult,) =
        ic_cdk::api::call::call(ledger, "icrc2_transfer_from", (args,))
        .await
        .map_err(|e| format!("Call failed: {:?}", e))?;

    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Transfer failed: {:?}", e)),
    }
}
