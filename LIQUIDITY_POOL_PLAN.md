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

     # Deploy to mainnet (deploys all canisters - simplest approach)
     ./deploy.sh
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
   git commit -m "feat(dice): add share-token liquidity pool for house ownership"
   git push -u origin feature/dice-liquidity-pool
   gh pr create --title "feat(dice): Share-Token Liquidity Pool for House Ownership" --body "Implements LIQUIDITY_POOL_PLAN.md

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai
- New APIs: deposit_liquidity, withdraw_liquidity, get_pool_stats, get_lp_position"
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

# Implementation Plan: Share-Token Liquidity Pool for Dice Backend

## 📊 Current State Documentation

### Existing DeFi Accounting Architecture
**Location:** `/home/theseus/alexandria/openhouse/dice_backend/src/defi_accounting/`

**Current Files:**
```
dice_backend/src/defi_accounting/
├── mod.rs         # Module exports and timer initialization
├── accounting.rs  # Core accounting logic
├── README.md      # Module documentation
└── CLAUDE.md      # Claude context
```

**Key Components:**
- **User Balances:** `StableBTreeMap<Principal, u64>` (Memory ID: 10)
- **Canister Balance Cache:** `RefCell<u64>` refreshed hourly via timer
- **House Balance:** Calculated as `canister_balance - total_user_deposits`
- **Max Payout:** 10% of house balance (conservative limit)
- **Timer:** Runs every 3600 seconds to refresh canister balance

**Current Balance Flow:**
```
User Deposit → Individual Balance → House Gets Remainder
User Withdraw ← Individual Balance ← House Loses Funds
Game Win → User Balance Increases → House Balance Decreases
Game Loss → User Balance Decreases → House Balance Increases
```

## 🎯 Feature Requirements

**Goal:** Transform the house into a decentralized liquidity pool where users can:
1. Deposit ICP to become proportional owners of the house
2. Receive share tokens representing ownership percentage
3. Withdraw their share including profits/losses from gambling
4. Have instant withdrawals with immediate max bet recalculation

**Specifications:**
- **Share Model:** Virtual share tokens (not actual ICRC tokens)
- **No Minimum Liquidity:** Pool can operate with any amount
- **Instant Withdrawals:** No lock-up periods
- **Pure Profit Sharing:** No fees, LPs earn from 1% house edge
- **Precision:** 8 decimals (same as ICP) to prevent rounding issues

## 📁 File Structure Changes

### New File: `dice_backend/src/defi_accounting/liquidity_pool.rs`
```rust
// PSEUDOCODE - Core liquidity pool implementation
use ic_stable_structures::{StableBTreeMap, memory_manager::VirtualMemory};
use candid::{CandidType, Principal, Nat};
use serde::{Deserialize, Serialize};

// Constants
const SHARE_PRECISION: u64 = 100_000_000; // 8 decimals like ICP
const MIN_DEPOSIT: u64 = 10_000_000; // 0.1 ICP minimum
const TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP

// Storage (new memory IDs)
static LP_SHARES: StableBTreeMap<Principal, u64> = // Memory ID: 11
static TOTAL_SHARES: RefCell<u64> = // Memory ID: 12
static POOL_RESERVE: RefCell<u64> = // Memory ID: 13

// Types
#[derive(CandidType, Serialize, Deserialize)]
pub struct LPPosition {
    pub shares: u64,
    pub share_value_icp: u64,
    pub total_value_icp: u64,
    pub ownership_percentage: f64,
}

#[derive(CandidType, Serialize, Deserialize)]
pub struct PoolStats {
    pub total_shares: u64,
    pub pool_reserve: u64,
    pub share_price: u64,
    pub total_liquidity_providers: u64,
    pub available_for_withdrawal: u64,
}

// Core Functions
pub async fn deposit_liquidity(amount: u64) -> Result<u64, String> {
    // 1. Validate amount >= MIN_DEPOSIT
    // 2. Transfer ICP from caller to canister using ICRC-1
    // 3. Calculate shares to mint:
    //    if total_shares == 0:
    //        shares = amount * SHARE_PRECISION
    //    else:
    //        shares = (amount * total_shares) / pool_reserve
    // 4. Update LP_SHARES[caller] += shares
    // 5. Update TOTAL_SHARES += shares
    // 6. Update POOL_RESERVE += amount
    // 7. Call accounting::refresh_canister_balance()
    // 8. Return shares minted
}

pub async fn withdraw_liquidity(shares_to_burn: u64) -> Result<u64, String> {
    // 1. Get caller's shares from LP_SHARES
    // 2. Validate caller has enough shares
    // 3. Calculate ICP to return:
    //    payout = (shares_to_burn * pool_reserve) / total_shares
    // 4. DEDUCT shares FIRST (re-entrancy protection):
    //    LP_SHARES[caller] -= shares_to_burn
    //    TOTAL_SHARES -= shares_to_burn
    //    POOL_RESERVE -= payout
    // 5. Transfer ICP from canister to caller
    // 6. If transfer fails: ROLLBACK all changes
    // 7. Call accounting::refresh_canister_balance()
    // 8. Trigger max bet recalculation immediately
    // 9. Return ICP amount withdrawn
}

pub async fn withdraw_all_liquidity() -> Result<u64, String> {
    // Get all caller's shares and withdraw them
    let shares = get_lp_shares(caller);
    withdraw_liquidity(shares).await
}

// Query functions
pub fn get_lp_position(user: Principal) -> LPPosition {
    // Calculate and return user's position details
    let shares = LP_SHARES.get(&user).unwrap_or(0);
    let total_shares = TOTAL_SHARES.with(|s| *s.borrow());
    let pool_reserve = POOL_RESERVE.with(|r| *r.borrow());

    let share_value = if total_shares > 0 {
        pool_reserve / total_shares
    } else { 0 };

    LPPosition {
        shares,
        share_value_icp: share_value,
        total_value_icp: (shares * share_value) / SHARE_PRECISION,
        ownership_percentage: if total_shares > 0 {
            (shares as f64 / total_shares as f64) * 100.0
        } else { 0.0 },
    }
}

pub fn get_pool_stats() -> PoolStats {
    // Return comprehensive pool statistics
    PoolStats {
        total_shares: TOTAL_SHARES.with(|s| *s.borrow()),
        pool_reserve: POOL_RESERVE.with(|r| *r.borrow()),
        share_price: calculate_share_price(),
        total_liquidity_providers: count_lps(),
        available_for_withdrawal: POOL_RESERVE.with(|r| *r.borrow()),
    }
}

// Integration functions for game.rs
pub fn update_pool_on_win(payout: u64) {
    // Called when player wins, deduct from pool
    POOL_RESERVE.with(|r| {
        let current = *r.borrow();
        *r.borrow_mut() = current.saturating_sub(payout);
    });
}

pub fn update_pool_on_loss(bet: u64) {
    // Called when player loses, add to pool
    POOL_RESERVE.with(|r| {
        *r.borrow_mut() += bet;
    });
}

pub fn get_pool_reserve() -> u64 {
    // Used by game.rs to calculate max bet
    POOL_RESERVE.with(|r| *r.borrow())
}
```

### Modified: `dice_backend/src/defi_accounting/accounting.rs`
```rust
// PSEUDOCODE - Add liquidity pool integration

// Import liquidity pool module
use super::liquidity_pool;

// Modify get_house_balance() function (line ~240)
pub fn get_house_balance() -> u64 {
    // OLD: canister_balance - total_user_deposits
    // NEW: Use pool reserve directly
    liquidity_pool::get_pool_reserve()
}

// Add new export function
pub fn trigger_max_bet_update() {
    // Force immediate recalculation of max bet
    // This is called after withdrawals
    refresh_canister_balance();
}
```

### Modified: `dice_backend/src/defi_accounting/mod.rs`
```rust
// PSEUDOCODE - Export liquidity pool functions

// Add module
pub mod liquidity_pool;

// Export LP functions
pub use liquidity_pool::{
    deposit_liquidity,
    withdraw_liquidity,
    withdraw_all_liquidity,
    get_lp_position,
    get_pool_stats,
    get_pool_reserve,
};
```

### Modified: `dice_backend/src/lib.rs`
```rust
// PSEUDOCODE - Expose LP endpoints

// Import LP functions
use crate::defi_accounting::{
    deposit_liquidity,
    withdraw_liquidity,
    withdraw_all_liquidity,
    get_lp_position,
    get_pool_stats,
};

// Add update methods
#[ic_cdk::update]
async fn deposit_liquidity(amount: u64) -> Result<u64, String> {
    defi_accounting::deposit_liquidity(amount).await
}

#[ic_cdk::update]
async fn withdraw_liquidity(shares: u64) -> Result<u64, String> {
    defi_accounting::withdraw_liquidity(shares).await
}

#[ic_cdk::update]
async fn withdraw_all_liquidity() -> Result<u64, String> {
    defi_accounting::withdraw_all_liquidity().await
}

// Add query methods
#[ic_cdk::query]
fn get_lp_position(user: Principal) -> LPPosition {
    defi_accounting::get_lp_position(user)
}

#[ic_cdk::query]
fn get_pool_stats() -> PoolStats {
    defi_accounting::get_pool_stats()
}
```

### Modified: `dice_backend/src/game.rs`
```rust
// PSEUDOCODE - Update game to use pool reserve

// Import LP functions
use crate::defi_accounting::liquidity_pool::{
    update_pool_on_win,
    update_pool_on_loss,
};

// In play_dice function (around line 200)
pub async fn play_dice(...) -> Result<DiceResult, String> {
    // ... existing validation ...

    // After determining win/loss:
    if player_wins {
        let payout = calculate_payout(bet_amount, multiplier);

        // Update user balance
        update_balance(caller, new_balance)?;

        // NEW: Update pool reserve
        update_pool_on_loss(payout - bet_amount);

    } else {
        // Player lost, bet stays in pool

        // NEW: Update pool reserve
        update_pool_on_win(bet_amount);
    }

    // ... rest of function ...
}
```

### Modified: `dice_backend/dice_backend.did`
```candid
// Add new types
type LPPosition = record {
    shares: nat64;
    share_value_icp: nat64;
    total_value_icp: nat64;
    ownership_percentage: float64;
};

type PoolStats = record {
    total_shares: nat64;
    pool_reserve: nat64;
    share_price: nat64;
    total_liquidity_providers: nat64;
    available_for_withdrawal: nat64;
};

// Add new service methods
service : {
    // ... existing methods ...

    // Liquidity Pool Management
    deposit_liquidity : (nat64) -> (variant { Ok: nat64; Err: text });
    withdraw_liquidity : (nat64) -> (variant { Ok: nat64; Err: text });
    withdraw_all_liquidity : () -> (variant { Ok: nat64; Err: text });

    // LP Queries
    get_lp_position : (principal) -> (LPPosition) query;
    get_pool_stats : () -> (PoolStats) query;
}
```

## 🔐 Critical Implementation Details

### 1. Share Calculation Precision
```rust
// First depositor gets 1:1 shares with precision multiplier
if total_shares == 0 {
    shares = amount * SHARE_PRECISION; // 1 ICP = 100_000_000 shares
}

// Subsequent depositors get proportional shares
else {
    // Prevent division by zero
    shares = (amount * total_shares) / pool_reserve;
}

// Withdrawal calculation (conservative rounding)
payout = (shares_to_burn * pool_reserve) / total_shares;
```

### 2. Re-entrancy Protection Pattern
```rust
// ALWAYS follow this order:
1. Validate inputs
2. Update state FIRST (deduct shares/balance)
3. Perform external call (transfer)
4. If transfer fails, rollback state
```

### 3. Edge Cases to Handle
- **Empty pool:** First depositor initializes with 1:1 ratio
- **Last withdrawal:** Ensure no division by zero
- **Rounding errors:** Always round down on deposits, round up on withdrawals
- **Max payout exceeded:** Check pool can cover game payouts
- **Concurrent operations:** Use RefCell for atomic updates

### 4. Integration with Existing System
- **Separate accounting:** LP pool is separate from player balances
- **Game uses pool:** Wins/losses directly affect pool reserve
- **Max bet calculation:** Uses pool reserve instead of calculated house balance
- **Timer integration:** Withdrawal triggers immediate balance refresh

## 🧪 Testing Strategy (Manual Verification)

### Test Scenarios to Verify:
1. **First Deposit:**
   ```bash
   dfx canister --network ic call dice_backend deposit_liquidity '(100_000_000)'
   # Should return 10_000_000_000 shares (100 * PRECISION)
   ```

2. **Proportional Shares:**
   ```bash
   # Second depositor adds 50 ICP when pool has 100 ICP
   dfx canister --network ic call dice_backend deposit_liquidity '(50_000_000)'
   # Should get 50% of existing shares
   ```

3. **Withdrawal Accuracy:**
   ```bash
   # Withdraw half shares
   dfx canister --network ic call dice_backend withdraw_liquidity '(5_000_000_000)'
   # Should receive proportional ICP back
   ```

4. **Pool Stats:**
   ```bash
   dfx canister --network ic call dice_backend get_pool_stats
   # Verify all calculations are correct
   ```

5. **Game Integration:**
   ```bash
   # Play game and verify pool reserve changes
   dfx canister --network ic call dice_backend play_dice '(1_000_000, 50, variant { Over })'
   dfx canister --network ic call dice_backend get_pool_stats
   # Pool should increase on loss, decrease on win
   ```

## 📊 Migration Notes

### For Existing House Balance:
If there's existing ICP in the canister that belongs to the "house":
1. On first deployment, the pool starts empty
2. Admin can seed pool with initial deposit
3. This creates the first shares at 1:1 ratio
4. Future depositors get proportional shares

### Backward Compatibility:
- Player balance system remains unchanged
- Existing game logic works with minor modification
- Only house balance source changes (calculated → pool reserve)

## 🚀 Deployment Steps

1. **Build Backend:**
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ```

2. **Deploy to Mainnet:**
   ```bash
   ./deploy.sh --dice-only
   ```

3. **Verify Deployment:**
   ```bash
   dfx canister --network ic status dice_backend
   ```

4. **Test New APIs:**
   ```bash
   # Test deposit
   dfx canister --network ic call dice_backend deposit_liquidity '(10_000_000)'

   # Check stats
   dfx canister --network ic call dice_backend get_pool_stats
   ```

## ⚠️ Security Considerations

1. **Integer Overflow:** Use `saturating_add/sub` for all arithmetic
2. **Division by Zero:** Check denominators before division
3. **Reentrancy:** State changes before external calls
4. **Precision Loss:** Use high precision (8 decimals) for shares
5. **Access Control:** No admin functions - fully decentralized
6. **Withdrawal Limits:** Ensure pool can cover active bets

## 📈 Expected Outcomes

- **Decentralized House:** Users own the casino through share tokens
- **Transparent Profits:** Share value increases with house edge wins
- **Instant Liquidity:** No lock-ups, withdraw anytime
- **Automatic Rebalancing:** Max bet adjusts with pool size
- **Fair Distribution:** Proportional ownership based on contribution

## 🎯 Success Criteria

- [ ] LPs can deposit ICP and receive shares
- [ ] Share value increases when house wins
- [ ] LPs can withdraw proportional value
- [ ] Pool reserve updates affect max bet
- [ ] Game continues to function normally
- [ ] No precision/rounding errors
- [ ] All edge cases handled gracefully

---

**This plan provides a complete blueprint for implementing a share-token liquidity pool for the OpenHouse dice game, transforming it into a truly decentralized casino where users own the house.**