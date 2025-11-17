# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create/update the PR.**

## IMPORTANT: Continuing Existing PR #39
- **PR Already Exists**: https://github.com/AlexandriaDAO/OpenHouse/pull/39
- **Branch**: `feature/dice-liquidity-pool` (already exists)
- **Your Task**: Fix the P0 critical issues identified in the review

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-liquidity-pool"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)

1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-liquidity-pool`

2. **Pull latest changes from PR**:
   ```bash
   git pull origin feature/dice-liquidity-pool
   ```

3. **Fix all P0 issues** - Follow the implementation sections below

4. **Build & Test Locally First**:
   ```bash
   # Build to catch compilation errors
   cargo build --target wasm32-unknown-unknown --release

   # If build succeeds, deploy to mainnet
   ./deploy.sh --dice-only
   ```

5. **Verify deployment**:
   ```bash
   # Test initialization
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai initialize_pool_from_house

   # Check pool stats
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_pool_stats
   ```

6. **Update PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix: address P0 critical issues from review

- Fix pool initialization with existing house balance
- Implement proper ICRC-2 transfer flow
- Add dual-mode house balance for smooth transition
- Store pool reserve in stable memory
- Handle zero share/reserve edge cases
- Add minimum withdrawal amount"

   git push origin feature/dice-liquidity-pool

   # Add comment to PR
   gh pr comment 39 --body "Fixed all P0 critical issues:
   ✅ Pool initialization from existing house balance
   ✅ Proper ICRC-2 transfer implementation
   ✅ Dual-mode house balance (LP pool + legacy)
   ✅ Stable storage for pool reserve
   ✅ Edge case handling for zero states
   ✅ Minimum withdrawal amount

   Ready for re-review."
   ```

7. **Monitor PR autonomously**:
   - Check for new review comments
   - Fix any new P0 issues immediately
   - Continue until approved

## CRITICAL RULES
- ❌ NO questions - just implement the fixes
- ❌ NO stopping after implementation - update PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ You're CONTINUING an existing PR, not creating a new one

---

# Implementation Plan V3: Fixing Critical Issues

## 🚨 P0 Critical Issues to Fix

### Fix 1: Pool Initialization from Existing House Balance

**File**: `dice_backend/src/defi_accounting/liquidity_pool.rs`

Add initialization function:
```rust
// PSEUDOCODE - One-time migration from existing house balance
use super::accounting;

// Add constant for minimum operating balance
const MIN_OPERATING_BALANCE: u64 = 10_000_000_000; // 100 ICP minimum to operate

// Add initialization function
#[ic_cdk::update]
pub async fn initialize_pool_from_house() -> Result<String, String> {
    // Check if already initialized
    if POOL_INITIALIZED.with(|init| *init.borrow()) {
        return Err("Pool already initialized".to_string());
    }

    // Get existing house balance
    let canister_balance = accounting::get_canister_balance();
    let user_deposits = accounting::get_total_user_deposits();
    let house_balance = canister_balance.saturating_sub(user_deposits);

    if house_balance == 0 {
        return Err("No house balance to migrate".to_string());
    }

    // Initialize pool with house balance
    POOL_RESERVE.with(|reserve| {
        *reserve.borrow_mut() = u64_to_nat(house_balance);
    });

    POOL_INITIALIZED.with(|init| {
        *init.borrow_mut() = true;
    });

    // Optional: Mint founder shares to a treasury/DAO address
    // For now, just initialize the pool without shares
    // This makes the pool ready to accept LP deposits

    Ok(format!("Pool initialized with {} e8s from house balance", house_balance))
}

// Add function to check if game can accept bets
pub fn can_accept_bets() -> bool {
    let pool_reserve = get_pool_reserve();

    // Can accept bets if:
    // 1. Pool has minimum balance OR
    // 2. Legacy house balance is sufficient
    if pool_reserve >= MIN_OPERATING_BALANCE {
        return true;
    }

    // Fall back to checking legacy house balance
    let house_balance = accounting::get_legacy_house_balance();
    house_balance >= MIN_OPERATING_BALANCE
}
```

### Fix 2: Proper ICRC-2 Transfer Implementation

**File**: `dice_backend/src/defi_accounting/accounting.rs`

Fix transfer functions:
```rust
// PSEUDOCODE - Proper ICRC-2 transfers

// For deposits, we need ICRC-2 approval flow
pub async fn deposit_liquidity_with_approval(amount: u64) -> Result<Nat, String> {
    let caller = ic_cdk::caller();
    let canister_id = ic_cdk::id();

    // Step 1: User must approve canister to spend their ICP
    // This happens on frontend before calling deposit

    // Step 2: Transfer from user to canister using approved amount
    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();

    let transfer_from_args = TransferFromArgs {
        from: Account {
            owner: caller,
            subaccount: None,
        },
        to: Account {
            owner: canister_id,
            subaccount: None,
        },
        amount: Nat::from(amount),
        fee: Some(Nat::from(10_000)), // 0.0001 ICP fee
        memo: None,
        created_at_time: None,
        spender_subaccount: None,
    };

    // Call ICRC-2 transfer_from
    let result: (TransferFromResult,) = ic_cdk::call(
        ledger,
        "icrc2_transfer_from",
        (transfer_from_args,)
    ).await.map_err(|e| format!("Transfer failed: {:?}", e))?;

    match result.0 {
        TransferFromResult::Ok(block_index) => {
            // Transfer successful, now mint LP shares
            liquidity_pool::mint_shares_for_deposit(caller, amount).await
        },
        TransferFromResult::Err(e) => {
            Err(format!("Transfer failed: {:?}", e))
        }
    }
}

// For withdrawals, direct transfer from canister
pub async fn transfer_to_user_for_withdrawal(user: Principal, amount: u64) -> Result<(), String> {
    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();

    let transfer_args = TransferArg {
        from_subaccount: None,
        to: Account {
            owner: user,
            subaccount: None,
        },
        amount: Nat::from(amount),
        fee: Some(Nat::from(10_000)),
        memo: None,
        created_at_time: None,
    };

    // Call ICRC-1 transfer (canister has control of its own funds)
    let result: (TransferResult,) = ic_cdk::call(
        ledger,
        "icrc1_transfer",
        (transfer_args,)
    ).await.map_err(|e| format!("Transfer failed: {:?}", e))?;

    match result.0 {
        TransferResult::Ok(_) => Ok(()),
        TransferResult::Err(e) => Err(format!("Transfer failed: {:?}", e))
    }
}
```

### Fix 3: Dual-Mode House Balance

**File**: `dice_backend/src/defi_accounting/accounting.rs`

Support both systems during transition:
```rust
// PSEUDOCODE - Dual-mode house balance

// Keep the legacy calculation available
pub fn get_legacy_house_balance() -> u64 {
    let canister_balance = CANISTER_BALANCE.with(|balance| *balance.borrow());
    let total_user_deposits = get_total_user_deposits();
    canister_balance.saturating_sub(total_user_deposits)
}

// Updated house balance that supports both modes
pub fn get_house_balance() -> u64 {
    // First check if LP pool is active
    let pool_reserve = liquidity_pool::get_pool_reserve();
    let pool_initialized = liquidity_pool::is_pool_initialized();

    if pool_initialized && pool_reserve > 0 {
        // Use LP pool if initialized and has funds
        pool_reserve
    } else {
        // Fall back to legacy calculation
        get_legacy_house_balance()
    }
}

// Add helper to check which mode we're in
pub fn get_house_mode() -> String {
    let pool_initialized = liquidity_pool::is_pool_initialized();
    let pool_reserve = liquidity_pool::get_pool_reserve();

    if pool_initialized && pool_reserve > 0 {
        "liquidity_pool".to_string()
    } else {
        "legacy".to_string()
    }
}
```

### Fix 4: Stable Storage for Pool Reserve

**File**: `dice_backend/src/defi_accounting/liquidity_pool.rs`

Use stable storage:
```rust
// PSEUDOCODE - Stable storage for pool reserve

use ic_stable_structures::{StableCell, Storable};
use std::borrow::Cow;

// Define storable wrapper for Nat
#[derive(Clone)]
struct PoolReserveState {
    reserve: Nat,
    initialized: bool,
}

impl Storable for PoolReserveState {
    fn to_bytes(&self) -> Cow<[u8]> {
        // Serialize to bytes
        let mut bytes = vec![];
        bytes.extend(self.reserve.0.to_bytes_le());
        bytes.push(if self.initialized { 1 } else { 0 });
        Cow::Owned(bytes)
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        // Deserialize from bytes
        let initialized = bytes.last() == Some(&1);
        let reserve_bytes = &bytes[..bytes.len() - 1];
        let reserve = Nat(BigUint::from_bytes_le(reserve_bytes));
        PoolReserveState { reserve, initialized }
    }

    const BOUND: Bound = Bound::Unbounded;
}

// Use StableCell for pool state
thread_local! {
    static POOL_STATE: RefCell<StableCell<PoolReserveState, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(13))),
            PoolReserveState {
                reserve: nat_zero(),
                initialized: false,
            }
        ).expect("Failed to initialize pool state")
    );
}

// Update functions to use stable storage
pub fn get_pool_reserve() -> u64 {
    POOL_STATE.with(|state| {
        let pool_state = state.borrow().get();
        nat_to_u64(&pool_state.reserve).unwrap_or(0)
    })
}

pub fn update_pool_reserve(new_reserve: Nat) {
    POOL_STATE.with(|state| {
        let mut pool_state = state.borrow().get().clone();
        pool_state.reserve = new_reserve;
        state.borrow_mut().set(pool_state)
            .expect("Failed to update pool state");
    });
}

pub fn is_pool_initialized() -> bool {
    POOL_STATE.with(|state| {
        state.borrow().get().initialized
    })
}

// No need for pre/post upgrade - StableCell handles it automatically
```

### Fix 5: Handle Zero Share/Reserve Edge Cases

**File**: `dice_backend/src/defi_accounting/liquidity_pool.rs`

Add edge case handling:
```rust
// PSEUDOCODE - Edge case handling

pub fn get_share_price() -> Nat {
    let total_shares = calculate_total_supply();
    let pool_reserve = get_pool_reserve_nat();

    // Handle edge cases
    if nat_is_zero(&total_shares) {
        // No shares issued yet, return initial price
        u64_to_nat(100_000_000) // 1 ICP per share initial
    } else if nat_is_zero(&pool_reserve) {
        // Pool drained but shares exist (shouldn't happen, but handle gracefully)
        // Return minimum price to indicate issue
        u64_to_nat(1) // Minimum price
    } else {
        // Normal case: price = reserve / shares
        nat_divide(&pool_reserve, &total_shares).unwrap_or(nat_one())
    }
}

pub fn get_lp_position(user: Principal) -> LPPosition {
    let user_shares = LP_SHARES.with(|shares| {
        shares.borrow().get(&user).unwrap_or(nat_zero())
    });

    let total_shares = calculate_total_supply();
    let pool_reserve = get_pool_reserve_nat();

    // Handle edge cases
    let (ownership_percent, redeemable_icp) = if nat_is_zero(&total_shares) {
        (0.0, nat_zero())
    } else if nat_is_zero(&pool_reserve) {
        // Shares exist but no reserve (emergency state)
        let ownership = (user_shares.0.to_f64().unwrap_or(0.0) /
                        total_shares.0.to_f64().unwrap_or(1.0)) * 100.0;
        (ownership, nat_zero()) // Can't redeem if no reserve
    } else {
        // Normal calculation
        let ownership = (user_shares.0.to_f64().unwrap_or(0.0) /
                        total_shares.0.to_f64().unwrap_or(1.0)) * 100.0;
        let numerator = nat_multiply(&user_shares, &pool_reserve);
        let redeemable = nat_divide(&numerator, &total_shares)
            .unwrap_or(nat_zero());
        (ownership, redeemable)
    };

    LPPosition {
        shares: user_shares,
        pool_ownership_percent: ownership_percent,
        redeemable_icp,
    }
}
```

### Fix 6: Add Minimum Withdrawal Amount

**File**: `dice_backend/src/defi_accounting/liquidity_pool.rs`

Add minimum withdrawal:
```rust
// PSEUDOCODE - Minimum withdrawal amount

const MIN_WITHDRAWAL_AMOUNT: u64 = 100_000; // 0.001 ICP minimum

pub async fn withdraw_liquidity(shares_to_burn: Nat) -> Result<u64, String> {
    // ... existing validation ...

    // Calculate payout
    let payout_nat = calculate_payout_for_shares(shares_to_burn)?;
    let payout_u64 = nat_to_u64(&payout_nat)
        .ok_or("Payout too large")?;

    // Check minimum withdrawal
    if payout_u64 < MIN_WITHDRAWAL_AMOUNT {
        return Err(format!(
            "Withdrawal amount {} is below minimum of {} e8s",
            payout_u64, MIN_WITHDRAWAL_AMOUNT
        ));
    }

    // ... rest of withdrawal logic ...
}
```

### Fix 7: Update Game Integration

**File**: `dice_backend/src/game.rs`

Ensure game works with both modes:
```rust
// PSEUDOCODE - Game integration with dual mode

pub async fn play_dice(
    bet_amount: u64,
    target_number: u8,
    direction: RollDirection,
) -> Result<DiceResult, String> {
    // Check if game can accept bets
    if !liquidity_pool::can_accept_bets() {
        return Err("Insufficient house balance to accept bets. Pool needs liquidity.".to_string());
    }

    // ... existing validation ...

    // Determine which mode we're in
    let house_mode = accounting::get_house_mode();

    // After determining win/loss:
    if player_wins {
        let payout = calculate_payout(bet_amount, multiplier);
        let profit = payout.saturating_sub(bet_amount);

        // Update user balance
        accounting::update_balance(caller, new_balance)?;

        // Update pool only if in LP mode
        if house_mode == "liquidity_pool" {
            liquidity_pool::update_pool_on_win(profit);
        }
    } else {
        // Player lost

        // Add to pool only if in LP mode
        if house_mode == "liquidity_pool" {
            liquidity_pool::update_pool_on_loss(bet_amount);
        }
    }

    // ... rest of function ...
}
```

### Fix 8: Update Candid Interface

**File**: `dice_backend/dice_backend.did`

Add initialization method:
```candid
service : {
    // ... existing methods ...

    // Pool initialization (one-time)
    initialize_pool_from_house : () -> (variant { Ok: text; Err: text });

    // Check house mode
    get_house_mode : () -> (text) query;

    // Check if can accept bets
    can_accept_bets : () -> (bool) query;

    // Liquidity Pool Management
    deposit_liquidity : (nat64) -> (variant { Ok: nat; Err: text });
    withdraw_liquidity : (nat) -> (variant { Ok: nat64; Err: text });
    withdraw_all_liquidity : () -> (variant { Ok: nat64; Err: text });

    // LP Queries
    get_lp_position : (principal) -> (LPPosition) query;
    get_pool_stats : () -> (PoolStats) query;
}
```

## 🧪 Testing Sequence

1. **Initialize Pool**:
   ```bash
   dfx canister --network ic call dice_backend initialize_pool_from_house
   ```

2. **Check Mode**:
   ```bash
   dfx canister --network ic call dice_backend get_house_mode
   # Should return "legacy" or "liquidity_pool"
   ```

3. **Test Can Accept Bets**:
   ```bash
   dfx canister --network ic call dice_backend can_accept_bets
   ```

4. **Test First Deposit** (if pool initialized):
   ```bash
   dfx canister --network ic call dice_backend deposit_liquidity '(100_000_000 : nat64)'
   ```

5. **Verify Pool Stats**:
   ```bash
   dfx canister --network ic call dice_backend get_pool_stats
   ```

## 📝 Summary of Fixes

All P0 critical issues are addressed:

1. ✅ **Pool Initialization** - Can initialize from existing house balance
2. ✅ **Transfer Implementation** - Proper ICRC-2 approval flow
3. ✅ **House Balance** - Dual-mode supports both LP and legacy
4. ✅ **Stable Storage** - Pool state persists across upgrades
5. ✅ **Edge Cases** - Handles zero shares/reserve gracefully
6. ✅ **Minimum Withdrawal** - Prevents dust withdrawals

The implementation now supports a smooth transition from the legacy house system to the LP pool system without breaking existing gameplay.

---

**This V3 plan fixes all critical issues. The implementing agent should work in the existing PR #39 to address the review feedback.**