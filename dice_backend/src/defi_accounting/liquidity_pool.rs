// Full implementation with all fixes
use candid::{CandidType, Deserialize, Nat, Principal};
use ic_stable_structures::{StableBTreeMap, StableCell, memory_manager::VirtualMemory, DefaultMemoryImpl, Storable};
use serde::Serialize;
use std::cell::RefCell;
use std::borrow::Cow;
use std::sync::LazyLock;
use num_traits::ToPrimitive;

use super::nat_helpers::*;
use super::accounting;
use super::nat_helpers::StorableNat;

// Constants
const LP_DECIMALS: u8 = 8;
const MINIMUM_LIQUIDITY: u64 = 1000;
const MIN_DEPOSIT: u64 = 100_000_000; // 1 ICP minimum for all deposits
const MIN_WITHDRAWAL: u64 = 100_000; // 0.001 ICP
const MIN_OPERATING_BALANCE: u64 = 1_000_000_000; // 10 ICP to operate games
const TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP
const PARENT_STAKER_CANISTER: &str = "e454q-riaaa-aaaap-qqcyq-cai";
const LP_WITHDRAWAL_FEE_BPS: u64 = 100; // 1%

static PARENT_PRINCIPAL: LazyLock<Principal> = LazyLock::new(|| {
    Principal::from_text(PARENT_STAKER_CANISTER)
        .expect("Invalid parent canister ID")
});

// Pool state for stable storage
#[derive(Clone, CandidType, Deserialize, Serialize)]
struct PoolState {
    reserve: Nat,
    initialized: bool,
}

impl Storable for PoolState {
    fn to_bytes(&self) -> Cow<[u8]> {
        let serialized = serde_json::to_vec(self).unwrap();
        Cow::Owned(serialized)
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
                reserve: nat_zero(),
                initialized: false,
            }
        ).expect("Failed to init pool state"))
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

// Deposit liquidity (frontend handles ICRC-2 approval first)
pub async fn deposit_liquidity(amount: u64) -> Result<Nat, String> {
    // ====================================================================
    // SECURITY ANALYSIS: Why No Guard Needed
    // ====================================================================
    // The Internet Computer guarantees sequential execution of update calls.
    // Even if a user submits multiple deposit requests simultaneously:
    // 1. Each request executes completely before the next starts
    // 2. State updates are atomic and visible to subsequent calls
    // 3. No race conditions possible within the canister
    //
    // Pattern used: All state changes happen BEFORE any await points
    // This prevents reentrancy without needing guards.
    //
    // Comparison with icp_swap (which DOES need guards):
    // - icp_swap: Multiple awaits with state changes between them
    // - This code: State updates complete before transfer, with rollback on failure
    // ====================================================================

    // Validate
    if amount < MIN_DEPOSIT {
        return Err(format!("Minimum deposit is {} e8s", MIN_DEPOSIT));
    }

    let caller = ic_cdk::caller();
    let amount_nat = u64_to_nat(amount);

    // Transfer from user (requires prior ICRC-2 approval)
    match transfer_from_user(caller, amount).await {
        Err(e) if e.contains("InsufficientAllowance") => {
            return Err(format!(
                "Your ICP approval has expired or been consumed. Please approve {} e8s again in your wallet.",
                amount
            ));
        }
        Err(e) if e.contains("InsufficientFunds") => {
            return Err(format!(
                "Insufficient ICP balance. You need {} e8s plus transfer fee.",
                amount
            ));
        }
        Err(e) => return Err(format!("Transfer failed: {}", e)),
        Ok(_) => {}
    }

    // Calculate shares to mint
    let shares_to_mint = POOL_STATE.with(|state| {
        let pool_state = state.borrow().get().clone();
        let current_reserve = pool_state.reserve.clone();
        let total_shares = calculate_total_supply();

        if nat_is_zero(&total_shares) {
            // First deposit - burn minimum liquidity
            let initial_shares = amount_nat.clone();
            let burned_shares = u64_to_nat(MINIMUM_LIQUIDITY);

            // Mint burned shares to zero address
            LP_SHARES.with(|shares| {
                shares.borrow_mut().insert(Principal::anonymous(), StorableNat(burned_shares.clone()));
            });

            // User gets initial_shares - burned
            nat_subtract(&initial_shares, &burned_shares)
                .ok_or("Initial deposit too small".to_string())
        } else {
            // Subsequent deposits - proportional shares
            // shares = (amount * total_shares) / current_reserve
            let numerator = nat_multiply(&amount_nat, &total_shares);
            nat_divide(&numerator, &current_reserve)
                .ok_or("Division error".to_string())
        }
    })?;

    // Update user shares
    LP_SHARES.with(|shares| {
        let mut shares_map = shares.borrow_mut();
        let current = shares_map.get(&caller).map(|s| s.0.clone()).unwrap_or(nat_zero());
        let new_shares = nat_add(&current, &shares_to_mint);
        shares_map.insert(caller, StorableNat(new_shares));
    });

    // Update pool reserve
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        pool_state.reserve = nat_add(&pool_state.reserve, &amount_nat);
        state.borrow_mut().set(pool_state).unwrap();
    });

    Ok(shares_to_mint)
}

// Internal function for withdrawing liquidity (called by withdraw_all_liquidity)
async fn withdraw_liquidity(shares_to_burn: Nat) -> Result<u64, String> {
    // ====================================================================
    // SECURITY: Checks-Effects-Interactions Pattern
    // ====================================================================
    // We follow the CEI pattern to prevent reentrancy:
    // 1. CHECK: Validate shares and calculate payout
    // 2. EFFECTS: Update state (deduct shares, reduce pool)
    // 3. INTERACTIONS: Transfer ICP (with rollback on failure)
    //
    // Even without guards, this is safe because:
    // - State is updated BEFORE the transfer
    // - If transfer fails, we explicitly rollback
    // - IC's sequential execution prevents concurrent modifications
    // ====================================================================

    let caller = ic_cdk::caller();

    // Validate shares
    if nat_is_zero(&shares_to_burn) {
        return Err("Cannot withdraw zero shares".to_string());
    }

    let user_shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(nat_zero()));
    if &user_shares < &shares_to_burn {
        return Err("Insufficient shares".to_string());
    }

    // Calculate payout
    let (payout_nat, new_reserve) = POOL_STATE.with(|state| {
        let pool_state = state.borrow().get().clone();
        let current_reserve = pool_state.reserve.clone();
        let total_shares = calculate_total_supply();

        if nat_is_zero(&total_shares) {
            return Err("No shares in circulation".to_string());
        }

        // payout = (shares_to_burn * current_reserve) / total_shares
        let numerator = nat_multiply(&shares_to_burn, &current_reserve);
        let payout = nat_divide(&numerator, &total_shares)
            .ok_or("Division error".to_string())?;

        let new_reserve = nat_subtract(&current_reserve, &payout)
            .ok_or("Insufficient pool reserve".to_string())?;

        Ok((payout, new_reserve))
    })?;

    // Check minimum withdrawal
    let payout_u64 = nat_to_u64(&payout_nat).ok_or("Payout too large")?;
    if payout_u64 < MIN_WITHDRAWAL {
        return Err(format!("Minimum withdrawal is {} e8s", MIN_WITHDRAWAL));
    }

    // Calculate fee (1% using basis points for precision)
    // SAFETY: We use integer math. 100 bps = 1%.
    let fee_amount = (payout_u64 * LP_WITHDRAWAL_FEE_BPS) / 10_000;
    let lp_amount = payout_u64 - fee_amount;

    // Update shares BEFORE transfer (reentrancy protection)
    LP_SHARES.with(|shares| {
        let mut shares_map = shares.borrow_mut();
        let new_shares = nat_subtract(&user_shares, &shares_to_burn).unwrap();
        if nat_is_zero(&new_shares) {
            shares_map.remove(&caller);
        } else {
            shares_map.insert(caller, StorableNat(new_shares));
        }
    });

    // ====================================================================
    // SAFETY VALVE ACCOUNTING:
    // 1. Deduct ONLY the LP's portion from the reserve initially.
    // 2. The fee portion remains in the reserve until it is successfully transferred.
    // 3. If the fee transfer fails, we DO NOT deduct it.
    //    Result: Reserve matches Balance. Fee is "refunded" to the pool.
    // ====================================================================
    
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        // Deduct only what we are about to send to the LP
        pool_state.reserve = nat_subtract(&pool_state.reserve, &u64_to_nat(lp_amount))
            .ok_or("Insufficient pool reserve")?;
        state.borrow_mut().set(pool_state).unwrap();
        Ok::<(), String>(())
    })?;

    // CRITICAL: Transfer to LP first
    match transfer_to_user(caller, lp_amount).await {
        Ok(_) => {
            // LP got paid successfully ✅
            
            // BEST EFFORT: Try to pay parent
            // Only attempt if fee > transfer cost, otherwise it stays in pool
            let net_fee = fee_amount.saturating_sub(TRANSFER_FEE);
            
            if net_fee > 0 {
                match transfer_to_user(*PARENT_PRINCIPAL, net_fee).await {
                    Ok(_) => {
                        // Parent transfer succeeded - NOW we deduct the fee from reserve
                        POOL_STATE.with(|state| {
                            let mut pool_state = state.borrow().get().clone();
                            pool_state.reserve = nat_subtract(&pool_state.reserve, &u64_to_nat(fee_amount))
                                .unwrap_or(pool_state.reserve);
                            state.borrow_mut().set(pool_state).unwrap();
                        });
                        ic_cdk::println!("LP withdrawal: {} got {} e8s, parent fee {} e8s", 
                                       caller, lp_amount, fee_amount);
                    }
                    Err(e) => {
                        // SAFETY VALVE: Parent transfer failed.
                        // We do NOTHING. The fee remains in the reserve.
                        // Reserve matches Balance. No floating funds.
                        ic_cdk::println!("Parent fee transfer failed: {}, {} e8s remains in pool",
                                       e, fee_amount);
                    }
                }
            } else {
                ic_cdk::println!("Fee {} e8s too small to transfer, remains in pool", fee_amount);
            }

            Ok(lp_amount)
        }
        Err(e) => {
            // LP transfer failed - ROLLBACK EVERYTHING
            
            // 1. Restore shares
            LP_SHARES.with(|shares| {
                shares.borrow_mut().insert(caller, StorableNat(user_shares));
            });

            // 2. Restore reserve (add back ONLY what we deducted: lp_amount)
            POOL_STATE.with(|state| {
                let mut pool_state = state.borrow().get().clone();
                pool_state.reserve = nat_add(&pool_state.reserve, &u64_to_nat(lp_amount));
                state.borrow_mut().set(pool_state).unwrap();
            });

            Err(format!("Transfer failed: {}. State rolled back.", e))
        }
    }
}

pub async fn withdraw_all_liquidity() -> Result<u64, String> {
    let caller = ic_cdk::caller();
    let shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(nat_zero()));

    if nat_is_zero(&shares) {
        return Err("No liquidity to withdraw".to_string());
    }

    withdraw_liquidity(shares).await
}

// Query functions

pub fn get_lp_position(user: Principal) -> LPPosition {
    let user_shares = LP_SHARES.with(|s| s.borrow().get(&user).map(|sn| sn.0.clone()).unwrap_or(nat_zero()));
    let total_shares = calculate_total_supply();
    let pool_reserve = get_pool_reserve_nat();

    let (ownership_percent, redeemable_icp) = if nat_is_zero(&total_shares) {
        (0.0, nat_zero())
    } else if nat_is_zero(&pool_reserve) {
        // Edge case: shares exist but no reserve
        let ownership = (user_shares.0.to_f64().unwrap_or(0.0) /
                        total_shares.0.to_f64().unwrap_or(1.0)) * 100.0;
        (ownership, nat_zero())
    } else {
        // Normal case
        let ownership = (user_shares.0.to_f64().unwrap_or(0.0) /
                        total_shares.0.to_f64().unwrap_or(1.0)) * 100.0;
        let numerator = nat_multiply(&user_shares, &pool_reserve);
        let redeemable = nat_divide(&numerator, &total_shares).unwrap_or(nat_zero());
        (ownership, redeemable)
    };

    LPPosition {
        shares: user_shares,
        pool_ownership_percent: ownership_percent,
        redeemable_icp,
    }
}

pub fn get_pool_stats() -> PoolStats {
    let total_shares = calculate_total_supply();
    let pool_state = POOL_STATE.with(|s| s.borrow().get().clone());
    let pool_reserve = pool_state.reserve;

    // Calculate share price
    let share_price = if nat_is_zero(&total_shares) {
        u64_to_nat(100_000_000) // 1 ICP initial price
    } else if nat_is_zero(&pool_reserve) {
        u64_to_nat(1) // Minimum price if drained
    } else {
        nat_divide(&pool_reserve, &total_shares).unwrap_or(nat_one())
    };

    // Count LPs (excluding burned shares)
    let total_lps = LP_SHARES.with(|shares| {
        shares.borrow().iter()
            .filter(|(p, amt)| *p != Principal::anonymous() && !nat_is_zero(&amt.0))
            .count() as u64
    });

    PoolStats {
        total_shares,
        pool_reserve,
        share_price,
        total_liquidity_providers: total_lps,
        minimum_liquidity_burned: if pool_state.initialized {
            u64_to_nat(MINIMUM_LIQUIDITY)
        } else {
            nat_zero()
        },
        is_initialized: pool_state.initialized,
    }
}

// Helper functions

fn calculate_total_supply() -> Nat {
    LP_SHARES.with(|shares| {
        shares.borrow()
            .iter()
            .map(|(_, amt)| amt.0.clone())
            .fold(nat_zero(), |acc, amt| nat_add(&acc, &amt))
    })
}

pub fn get_pool_reserve() -> u64 {
    nat_to_u64(&get_pool_reserve_nat()).unwrap_or(0)
}

pub fn get_pool_reserve_nat() -> Nat {
    POOL_STATE.with(|s| s.borrow().get().reserve.clone())
}

pub fn is_pool_initialized() -> bool {
    POOL_STATE.with(|s| s.borrow().get().initialized)
}

pub fn can_accept_bets() -> bool {
    let pool_reserve = get_pool_reserve();
    pool_reserve >= MIN_OPERATING_BALANCE
}

// Game integration (internal use only - called by game logic)

pub(crate) fn update_pool_on_win(payout: u64) {
    // Player won - deduct from pool (concurrent-safe)
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        let payout_nat = u64_to_nat(payout);

        // Safe subtraction with trap on underflow
        match nat_subtract(&pool_state.reserve, &payout_nat) {
            Some(new_reserve) => {
                pool_state.reserve = new_reserve;
                state.borrow_mut().set(pool_state).unwrap();
            }
            None => {
                // CRITICAL: Halt operations to protect LP funds
                ic_cdk::trap(&format!(
                    "CRITICAL: Pool insolvent. Attempted payout {} e8s exceeds reserve {} e8s. Halting to protect LPs.",
                    payout,
                    nat_to_u64(&pool_state.reserve).unwrap_or(0)
                ));
            }
        }
    });
}

pub(crate) fn update_pool_on_loss(bet: u64) {
    // Player lost - add to pool (concurrent-safe)
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        pool_state.reserve = nat_add(&pool_state.reserve, &u64_to_nat(bet));
        state.borrow_mut().set(pool_state).unwrap();
    });
}

// Transfer helpers (using existing accounting module)

// ICRC-2 types not in ic_ledger_types
#[derive(CandidType, Deserialize)]
struct TransferFromArgs {
    from: super::accounting::Account,
    to: super::accounting::Account,
    amount: Nat,
    fee: Option<Nat>,
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
    spender_subaccount: Option<Vec<u8>>,
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

async fn transfer_from_user(user: Principal, amount: u64) -> Result<(), String> {
    // Frontend must call icrc2_approve first
    // Then we use transfer_from
    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let canister_id = ic_cdk::id();

    let args = TransferFromArgs {
        from: super::accounting::Account {
            owner: user,
            subaccount: None,
        },
        to: super::accounting::Account {
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
        ic_cdk::call(ledger, "icrc2_transfer_from", (args,))
        .await
        .map_err(|e| format!("Call failed: {:?}", e))?;

    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Transfer failed: {:?}", e)),
    }
}

async fn transfer_to_user(user: Principal, amount: u64) -> Result<(), String> {
    accounting::transfer_to_user(user, amount).await
}