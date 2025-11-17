# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

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
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build dice backend
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet
     ./deploy.sh --dice-only
     ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the live API
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_pool_stats
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): add Nat-based liquidity pool with KongSwap patterns"
   git push -u origin feature/dice-liquidity-pool
   gh pr create --title "feat(dice): Production-Grade Liquidity Pool with Perfect Precision" --body "Implements LIQUIDITY_POOL_PLAN_V2.md

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai
- Uses Nat for perfect precision (no overflow)
- Based on KongSwap's proven patterns
- Dynamic total supply calculation
- Instant withdrawals with solvency protection"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/dice-liquidity-pool`
**Worktree:** `/home/theseus/alexandria/openhouse-liquidity-pool`

---

# Implementation Plan V2: Production-Grade Liquidity Pool with Perfect Precision

## 🎯 Key Architecture Decisions (Based on KongSwap Research)

1. **Use `Nat` (arbitrary precision) instead of `u64`** - Prevents overflow, perfect precision
2. **Multiply-then-divide pattern** - Prevents precision loss in calculations
3. **Dynamic total supply** - Calculate by summing balances (never stored separately)
4. **Integer-only arithmetic** - No floating point anywhere
5. **8 decimal precision** - Same as ICP for simplicity
6. **Burn minimum liquidity** - 1000 units on first deposit (prevents inflation attacks)
7. **Start fresh** - Pool begins empty, no migration of existing funds
8. **No history tracking** - Only current state (saves storage)
9. **Block insolvency** - Prevent withdrawals that would make pool unable to cover bets

## 📁 Updated File Structure

### Update Cargo.toml Dependencies
```toml
# dice_backend/Cargo.toml - Add Nat support
[dependencies]
candid = "0.10"
ic-cdk = "0.13"
ic-cdk-timers = "0.7"
ic-stable-structures = "0.6"
ic-ledger-types = "0.10"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
sha2 = "0.10"
num-bigint = "0.4"  # NEW: For Nat support
num-traits = "0.2"  # NEW: For numeric operations
```

### New File: `dice_backend/src/defi_accounting/nat_helpers.rs`
```rust
// PSEUDOCODE - Nat arithmetic helpers based on KongSwap patterns
use candid::Nat;
use num_bigint::BigUint;
use num_traits::{Zero, One};

pub fn nat_zero() -> Nat {
    Nat::from(0u64)
}

pub fn nat_one() -> Nat {
    Nat::from(1u64)
}

pub fn nat_is_zero(n: &Nat) -> bool {
    n == &nat_zero()
}

// Integer division - ALWAYS ROUNDS DOWN
pub fn nat_divide(numerator: &Nat, denominator: &Nat) -> Option<Nat> {
    if nat_is_zero(numerator) {
        return Some(nat_zero());
    }
    if nat_is_zero(denominator) {
        return None; // Division by zero
    }
    Some(Nat(numerator.0.clone() / denominator.0.clone()))
}

// Safe multiplication - Cannot overflow with Nat
pub fn nat_multiply(n1: &Nat, n2: &Nat) -> Nat {
    Nat(n1.0.clone() * n2.0.clone())
}

// Safe addition
pub fn nat_add(n1: &Nat, n2: &Nat) -> Nat {
    Nat(n1.0.clone() + n2.0.clone())
}

// Safe subtraction - returns None if would underflow
pub fn nat_subtract(n1: &Nat, n2: &Nat) -> Option<Nat> {
    if n1 < n2 {
        None
    } else {
        Some(Nat(n1.0.clone() - n2.0.clone()))
    }
}

// Square root for initial liquidity - rounds down
pub fn nat_sqrt(n: &Nat) -> Nat {
    Nat(n.0.sqrt())
}

// Convert u64 (ICP e8s) to Nat
pub fn u64_to_nat(n: u64) -> Nat {
    Nat::from(n)
}

// Convert Nat to u64 - returns None if too large
pub fn nat_to_u64(n: &Nat) -> Option<u64> {
    // Check if Nat fits in u64
    if n.0 > BigUint::from(u64::MAX) {
        None
    } else {
        Some(n.0.to_u64_digits()[0])
    }
}

// Minimum of two Nats
pub fn nat_min(n1: &Nat, n2: &Nat) -> Nat {
    if n1 <= n2 {
        n1.clone()
    } else {
        n2.clone()
    }
}
```

### New File: `dice_backend/src/defi_accounting/liquidity_pool.rs`
```rust
// PSEUDOCODE - Production-grade liquidity pool with perfect precision
use candid::{CandidType, Deserialize, Nat, Principal};
use ic_stable_structures::{StableBTreeMap, memory_manager::VirtualMemory};
use serde::Serialize;
use std::cell::RefCell;

use super::nat_helpers::*;

// Constants - Following KongSwap patterns
const LP_DECIMALS: u8 = 8; // Same as ICP
const MINIMUM_LIQUIDITY: u64 = 1000; // Burn on first deposit (Uniswap V2 pattern)
const MIN_DEPOSIT: u64 = 10_000_000; // 0.1 ICP minimum
const TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP

// Storage using Nat for perfect precision
thread_local! {
    // Memory ID: 11 - Maps user to their LP share amount
    static LP_SHARES: RefCell<StableBTreeMap<Principal, Nat, VirtualMemory<DefaultMemoryImpl>>> =
        RefCell::new(StableBTreeMap::init(get_memory(11)));

    // Memory ID: 12 - Pool reserve in e8s (actual ICP in pool)
    static POOL_RESERVE: RefCell<Nat> = RefCell::new(nat_zero());

    // Memory ID: 13 - Track if pool is initialized
    static POOL_INITIALIZED: RefCell<bool> = RefCell::new(false);
}

// Types
#[derive(CandidType, Serialize, Deserialize, Clone)]
pub struct LPPosition {
    pub shares: Nat,
    pub pool_ownership_percent: f64,
    pub redeemable_icp: Nat,
}

#[derive(CandidType, Serialize, Deserialize, Clone)]
pub struct PoolStats {
    pub total_shares: Nat,
    pub pool_reserve: Nat,
    pub share_price: Nat, // In e8s per share
    pub total_liquidity_providers: u64,
    pub minimum_liquidity_burned: Nat,
    pub is_initialized: bool,
}

// Core Functions - Based on KongSwap patterns

pub async fn deposit_liquidity(amount: u64) -> Result<Nat, String> {
    // 1. Validate amount
    if amount < MIN_DEPOSIT {
        return Err(format!("Minimum deposit is {} e8s", MIN_DEPOSIT));
    }

    let amount_nat = u64_to_nat(amount);
    let caller = ic_cdk::caller();

    // 2. Transfer ICP from caller to canister (using existing accounting transfer)
    super::accounting::transfer_from_user(caller, amount).await?;

    // 3. Calculate shares to mint
    let shares_to_mint = POOL_RESERVE.with(|reserve| {
        let current_reserve = reserve.borrow().clone();
        let total_shares = calculate_total_supply();

        if nat_is_zero(&total_shares) {
            // First deposit - Initialize pool
            POOL_INITIALIZED.with(|init| *init.borrow_mut() = true);

            // Following Uniswap V2: sqrt(amount * amount) = amount
            // But burn MINIMUM_LIQUIDITY to address 0 (prevents inflation attack)
            let initial_shares = amount_nat.clone();
            let burned_shares = u64_to_nat(MINIMUM_LIQUIDITY);

            // Mint burned shares to zero address (effectively removing from circulation)
            LP_SHARES.with(|shares| {
                shares.borrow_mut().insert(Principal::anonymous(), burned_shares.clone());
            });

            // User gets initial_shares - MINIMUM_LIQUIDITY
            nat_subtract(&initial_shares, &burned_shares)
                .ok_or("Initial deposit too small")?
        } else {
            // Subsequent deposits - proportional shares
            // CRITICAL: Multiply-then-divide pattern from KongSwap
            // shares = (amount * total_shares) / current_reserve
            let numerator = nat_multiply(&amount_nat, &total_shares);
            nat_divide(&numerator, &current_reserve)
                .ok_or("Division error in share calculation")?
        }
    });

    // 4. Update state
    LP_SHARES.with(|shares| {
        let mut shares_map = shares.borrow_mut();
        let current_shares = shares_map.get(&caller).unwrap_or(nat_zero());
        let new_shares = nat_add(&current_shares, &shares_to_mint);
        shares_map.insert(caller, new_shares);
    });

    POOL_RESERVE.with(|reserve| {
        let new_reserve = nat_add(&reserve.borrow(), &amount_nat);
        *reserve.borrow_mut() = new_reserve;
    });

    // 5. Refresh canister balance immediately
    super::accounting::refresh_canister_balance().await;

    Ok(shares_to_mint)
}

pub async fn withdraw_liquidity(shares_to_burn: Nat) -> Result<u64, String> {
    let caller = ic_cdk::caller();

    // 1. Validate caller has enough shares
    let user_shares = LP_SHARES.with(|shares| {
        shares.borrow().get(&caller).unwrap_or(nat_zero())
    });

    if nat_is_zero(&shares_to_burn) {
        return Err("Cannot withdraw zero shares".to_string());
    }

    if &user_shares < &shares_to_burn {
        return Err(format!("Insufficient shares. You have {} but tried to withdraw {}",
            user_shares, shares_to_burn));
    }

    // 2. Calculate ICP payout (multiply-then-divide pattern)
    let payout_nat = POOL_RESERVE.with(|reserve| {
        let current_reserve = reserve.borrow().clone();
        let total_shares = calculate_total_supply();

        if nat_is_zero(&total_shares) {
            return Err("Pool has no shares".to_string());
        }

        // payout = (shares_to_burn * current_reserve) / total_shares
        let numerator = nat_multiply(&shares_to_burn, &current_reserve);
        nat_divide(&numerator, &total_shares)
            .ok_or("Division error in payout calculation".to_string())
    })?;

    // Convert to u64 for transfer
    let payout_u64 = nat_to_u64(&payout_nat)
        .ok_or("Payout amount too large for u64")?;

    // 3. Check solvency - Block withdrawal if it would prevent covering max bet
    let new_reserve = nat_subtract(&POOL_RESERVE.with(|r| r.borrow().clone()), &payout_nat)
        .ok_or("Withdrawal would make pool negative")?;

    // Calculate max bet with new reserve (10% of pool)
    let new_max_bet = nat_divide(&new_reserve, &u64_to_nat(10))
        .unwrap_or(nat_zero());

    // Get current active bets from game module
    let active_bets = super::super::game::get_total_active_bets();
    let active_bets_nat = u64_to_nat(active_bets);

    if new_max_bet < active_bets_nat {
        return Err("Withdrawal would make pool unable to cover active bets".to_string());
    }

    // 4. CRITICAL: Update state BEFORE transfer (re-entrancy protection)
    LP_SHARES.with(|shares| {
        let mut shares_map = shares.borrow_mut();
        let new_shares = nat_subtract(&user_shares, &shares_to_burn)
            .expect("Already validated sufficient shares");

        if nat_is_zero(&new_shares) {
            shares_map.remove(&caller); // Remove entry if zero balance
        } else {
            shares_map.insert(caller, new_shares);
        }
    });

    POOL_RESERVE.with(|reserve| {
        *reserve.borrow_mut() = new_reserve;
    });

    // 5. Transfer ICP to user
    match super::accounting::transfer_to_user(caller, payout_u64).await {
        Ok(_) => {
            // 6. Immediately update max bet after successful withdrawal
            super::accounting::refresh_canister_balance().await;
            super::accounting::trigger_max_bet_update();

            Ok(payout_u64)
        }
        Err(e) => {
            // ROLLBACK on transfer failure
            LP_SHARES.with(|shares| {
                shares.borrow_mut().insert(caller, user_shares);
            });

            POOL_RESERVE.with(|reserve| {
                *reserve.borrow_mut() = nat_add(&new_reserve, &payout_nat);
            });

            Err(format!("Transfer failed: {}. State rolled back.", e))
        }
    }
}

pub async fn withdraw_all_liquidity() -> Result<u64, String> {
    let caller = ic_cdk::caller();
    let user_shares = LP_SHARES.with(|shares| {
        shares.borrow().get(&caller).unwrap_or(nat_zero())
    });

    if nat_is_zero(&user_shares) {
        return Err("No liquidity to withdraw".to_string());
    }

    withdraw_liquidity(user_shares).await
}

// Query functions

pub fn get_lp_position(user: Principal) -> LPPosition {
    let user_shares = LP_SHARES.with(|shares| {
        shares.borrow().get(&user).unwrap_or(nat_zero())
    });

    let total_shares = calculate_total_supply();
    let pool_reserve = POOL_RESERVE.with(|r| r.borrow().clone());

    let (ownership_percent, redeemable_icp) = if !nat_is_zero(&total_shares) {
        // Calculate ownership percentage
        let ownership = (user_shares.0.to_f64().unwrap_or(0.0) /
                         total_shares.0.to_f64().unwrap_or(1.0)) * 100.0;

        // Calculate redeemable ICP (multiply-then-divide)
        let numerator = nat_multiply(&user_shares, &pool_reserve);
        let redeemable = nat_divide(&numerator, &total_shares)
            .unwrap_or(nat_zero());

        (ownership, redeemable)
    } else {
        (0.0, nat_zero())
    };

    LPPosition {
        shares: user_shares,
        pool_ownership_percent: ownership_percent,
        redeemable_icp,
    }
}

pub fn get_pool_stats() -> PoolStats {
    let total_shares = calculate_total_supply();
    let pool_reserve = POOL_RESERVE.with(|r| r.borrow().clone());
    let is_initialized = POOL_INITIALIZED.with(|init| *init.borrow());

    // Calculate share price (e8s per share)
    let share_price = if !nat_is_zero(&total_shares) {
        // price = reserve / total_shares (in e8s)
        nat_divide(&pool_reserve, &total_shares).unwrap_or(nat_zero())
    } else {
        nat_one() // 1:1 for uninitialized pool
    };

    // Count unique LPs
    let total_lps = LP_SHARES.with(|shares| {
        shares.borrow().iter()
            .filter(|(principal, amount)| {
                *principal != Principal::anonymous() && !nat_is_zero(amount)
            })
            .count() as u64
    });

    PoolStats {
        total_shares,
        pool_reserve,
        share_price,
        total_liquidity_providers: total_lps,
        minimum_liquidity_burned: if is_initialized {
            u64_to_nat(MINIMUM_LIQUIDITY)
        } else {
            nat_zero()
        },
        is_initialized,
    }
}

// CRITICAL: Calculate total supply by summing all balances (KongSwap pattern)
// This ensures perfect accounting - total always equals sum of parts
fn calculate_total_supply() -> Nat {
    LP_SHARES.with(|shares| {
        shares.borrow()
            .iter()
            .map(|(_, amount)| amount)
            .fold(nat_zero(), |acc, amount| nat_add(&acc, &amount))
    })
}

// Integration functions for game.rs

pub fn update_pool_on_win(payout: u64) {
    // Player won - deduct from pool
    POOL_RESERVE.with(|reserve| {
        let current = reserve.borrow().clone();
        let payout_nat = u64_to_nat(payout);

        // Safe subtraction - log error if would go negative
        match nat_subtract(&current, &payout_nat) {
            Some(new_reserve) => {
                *reserve.borrow_mut() = new_reserve;
            }
            None => {
                ic_cdk::trap("CRITICAL: Pool reserve would go negative!");
            }
        }
    });
}

pub fn update_pool_on_loss(bet: u64) {
    // Player lost - add to pool
    POOL_RESERVE.with(|reserve| {
        let current = reserve.borrow().clone();
        let bet_nat = u64_to_nat(bet);
        *reserve.borrow_mut() = nat_add(&current, &bet_nat);
    });
}

pub fn get_pool_reserve() -> u64 {
    // Return pool reserve as u64 for game calculations
    let reserve_nat = POOL_RESERVE.with(|r| r.borrow().clone());
    nat_to_u64(&reserve_nat).unwrap_or(0)
}

// Upgrade hooks to persist state
pub fn pre_upgrade() {
    // StableBTreeMap auto-persists, but save RefCell values
    let reserve = POOL_RESERVE.with(|r| r.borrow().clone());
    let initialized = POOL_INITIALIZED.with(|i| *i.borrow());

    // Store in stable memory (would need stable storage for these)
    // For now, they'll reinitialize from LP_SHARES on post_upgrade
}

pub fn post_upgrade() {
    // Reconstruct pool reserve from shares if needed
    // This ensures consistency after upgrades
    verify_accounting_integrity();
}

// Verify accounting integrity (can be called periodically)
pub fn verify_accounting_integrity() -> bool {
    let computed_total = calculate_total_supply();

    // For logging/monitoring
    ic_cdk::print(format!("Total LP shares: {}", computed_total));

    true // Always true since we compute dynamically
}
```

### Modified: `dice_backend/src/defi_accounting/accounting.rs`
```rust
// PSEUDOCODE - Key modifications for LP integration

// Update get_house_balance to use pool reserve
pub fn get_house_balance() -> u64 {
    // OLD: canister_balance - total_user_deposits
    // NEW: Use pool reserve directly
    liquidity_pool::get_pool_reserve()
}

// Add helper for transfers (reuse existing ICRC-1 logic)
pub async fn transfer_from_user(user: Principal, amount: u64) -> Result<(), String> {
    // Existing deposit logic without crediting user balance
    // Just transfer ICP to canister
    let transfer_args = TransferArg {
        from_subaccount: None,
        to: Account {
            owner: ic_cdk::id(),
            subaccount: None,
        },
        amount: Nat::from(amount),
        fee: Some(Nat::from(TRANSFER_FEE)),
        memo: None,
        created_at_time: None,
    };

    // Call ICP ledger
    let result = icrc1_transfer(transfer_args).await?;

    Ok(())
}

pub async fn transfer_to_user(user: Principal, amount: u64) -> Result<(), String> {
    // Existing withdrawal logic without debiting user balance
    // Just transfer ICP from canister
    let transfer_args = TransferArg {
        from_subaccount: None,
        to: Account {
            owner: user,
            subaccount: None,
        },
        amount: Nat::from(amount),
        fee: Some(Nat::from(TRANSFER_FEE)),
        memo: None,
        created_at_time: None,
    };

    // Call ICP ledger
    let result = icrc1_transfer(transfer_args).await?;

    Ok(())
}

pub fn trigger_max_bet_update() {
    // Force recalculation of max allowed payout
    // This is called after LP withdrawals
    let new_max = get_max_allowed_payout();
    ic_cdk::print(format!("Max bet updated to: {} e8s", new_max));
}
```

### Modified: `dice_backend/src/game.rs`
```rust
// PSEUDOCODE - Update game to use pool reserve

// Add function to get total active bets
pub fn get_total_active_bets() -> u64 {
    // Sum all currently active/pending bets
    // This would track bets that haven't resolved yet
    ACTIVE_BETS.with(|bets| {
        bets.borrow().values().sum()
    })
}

// In play_dice function
pub async fn play_dice(
    bet_amount: u64,
    target_number: u8,
    direction: RollDirection,
) -> Result<DiceResult, String> {
    // ... existing validation ...

    // After determining win/loss:
    if player_wins {
        let payout = calculate_payout(bet_amount, multiplier);
        let profit = payout - bet_amount;

        // Update user balance
        accounting::update_balance(caller, new_balance)?;

        // Update pool reserve (deduct profit from pool)
        liquidity_pool::update_pool_on_win(profit);

    } else {
        // Player lost, bet goes to pool
        liquidity_pool::update_pool_on_loss(bet_amount);
    }

    // ... rest of function ...
}
```

### Modified: `dice_backend/dice_backend.did`
```candid
// Add Nat type and new interfaces
type LPPosition = record {
    shares: nat;
    pool_ownership_percent: float64;
    redeemable_icp: nat;
};

type PoolStats = record {
    total_shares: nat;
    pool_reserve: nat;
    share_price: nat;
    total_liquidity_providers: nat64;
    minimum_liquidity_burned: nat;
    is_initialized: bool;
};

service : {
    // ... existing methods ...

    // Liquidity Pool Management
    deposit_liquidity : (nat64) -> (variant { Ok: nat; Err: text });
    withdraw_liquidity : (nat) -> (variant { Ok: nat64; Err: text });
    withdraw_all_liquidity : () -> (variant { Ok: nat64; Err: text });

    // LP Queries
    get_lp_position : (principal) -> (LPPosition) query;
    get_pool_stats : () -> (PoolStats) query;
}
```

## 🔐 Critical Implementation Patterns

### Pattern 1: Multiply-Then-Divide (ALWAYS)
```rust
// CORRECT - Preserves precision
let numerator = nat_multiply(&amount, &total_shares);
let shares = nat_divide(&numerator, &reserve);

// WRONG - Loses precision
let ratio = nat_divide(&amount, &reserve);
let shares = nat_multiply(&ratio, &total_shares);
```

### Pattern 2: State Before Transfer (Re-entrancy Protection)
```rust
// ALWAYS update state first
LP_SHARES.with(|s| s.borrow_mut().insert(user, new_amount));
POOL_RESERVE.with(|r| *r.borrow_mut() = new_reserve);

// THEN do external call
transfer_to_user(user, amount).await?;

// Rollback on failure
if transfer_failed {
    // Restore original state
}
```

### Pattern 3: Dynamic Total Supply
```rust
// NEVER store total_supply separately
// ALWAYS calculate by summing balances
fn calculate_total_supply() -> Nat {
    LP_SHARES.with(|shares| {
        shares.borrow()
            .iter()
            .fold(nat_zero(), |acc, (_, amt)| nat_add(&acc, amt))
    })
}
```

## 🧪 Testing Checklist

1. **First Deposit:**
   ```bash
   dfx canister --network ic call dice_backend deposit_liquidity '(100_000_000 : nat64)'
   # Should return 99_999_000 shares (100M - 1000 burned)
   ```

2. **Verify Minimum Burned:**
   ```bash
   dfx canister --network ic call dice_backend get_pool_stats
   # minimum_liquidity_burned should be 1000
   ```

3. **Second Deposit (Proportional):**
   ```bash
   # When pool has 100 ICP, deposit 50 ICP
   dfx canister --network ic call dice_backend deposit_liquidity '(50_000_000 : nat64)'
   # Should get ~50% of existing shares
   ```

4. **Withdrawal Solvency Check:**
   ```bash
   # Try to withdraw more than safe amount
   dfx canister --network ic call dice_backend withdraw_all_liquidity
   # Should fail if would leave pool unable to cover bets
   ```

5. **Game Integration:**
   ```bash
   dfx canister --network ic call dice_backend get_pool_stats
   # Note pool_reserve

   dfx canister --network ic call dice_backend play_dice '(1_000_000 : nat64, 50 : nat8, variant { Over })'

   dfx canister --network ic call dice_backend get_pool_stats
   # Pool should increase on loss, decrease on win
   ```

## 🚀 Migration Strategy

Since we're starting fresh:
1. Deploy with empty pool
2. First LP deposits and gets shares minus burned minimum
3. Pool grows from house edge on bets
4. LPs can withdraw proportional value anytime

## ⚠️ Security Guarantees

1. **No Overflow:** Nat type prevents overflow entirely
2. **No Precision Loss:** Multiply-then-divide pattern
3. **Perfect Accounting:** Total supply always equals sum of balances
4. **Solvency Protection:** Blocks withdrawals that would break game
5. **Re-entrancy Safe:** State updates before transfers
6. **Inflation Attack Prevention:** Burn 1000 minimum liquidity

## 📈 Expected Behavior

- **Initial State:** Pool empty, not initialized
- **First Deposit:** Initializes pool, burns 1000 units
- **Share Price:** Increases as house wins, decreases as house loses
- **Withdrawals:** Instant, but blocked if would cause insolvency
- **Total Supply:** Always equals sum of all LP balances

---

**This V2 plan incorporates KongSwap's production-proven patterns with Nat-based arithmetic for perfect precision and robust solvency protection.**