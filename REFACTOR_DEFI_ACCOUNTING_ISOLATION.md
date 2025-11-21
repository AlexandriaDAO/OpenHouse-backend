# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-defi-isolation"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-defi-isolation`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
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

   # Test the live API endpoints
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_pool_stats
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_my_lp_position
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(dice): isolate defi_accounting as reusable module

- Move get_canister_balance() into defi_accounting
- Add #[query]/#[update] attributes directly to defi_accounting functions
- Remove all re-exports and wrapper endpoints from lib.rs
- Clean separation: lib.rs only has game-specific logic
- defi_accounting now fully self-contained for reuse in other games

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
   git push -u origin refactor/isolate-defi-accounting
   gh pr create --title "Refactor: Isolate defi_accounting as reusable module" --body "Implements REFACTOR_DEFI_ACCOUNTING_ISOLATION.md

## Changes
- Moved \`get_canister_balance()\` from \`lib.rs\` into \`defi_accounting\` module
- Added \`#[query]\` and \`#[update]\` attributes directly to defi_accounting functions
- Removed all re-exports (lines 21-27) from \`lib.rs\`
- Removed all wrapper endpoints (lines 168-209) from \`lib.rs\`
- Updated \`game.rs\` to directly import needed functions

## Result
- \`defi_accounting\` is now fully self-contained
- Can be copied to other games without modification
- Clean separation: game logic in \`lib.rs\`, accounting in \`defi_accounting/\`

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai"
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

**Branch:** `refactor/isolate-defi-accounting`
**Worktree:** `/home/theseus/alexandria/openhouse-defi-isolation`

---

# Implementation Plan: Isolate DeFi Accounting Module

## Task Classification: REFACTORING

This is a **code organization refactoring** to make `defi_accounting` fully self-contained and reusable across different games without requiring code changes.

## Current State

### File Structure
```
dice_backend/
├── src/
│   ├── lib.rs                    # ⚠️ Contains defi_accounting logic (PROBLEM)
│   ├── game.rs                   # Uses defi_accounting functions
│   ├── seed.rs
│   ├── analytics.rs
│   ├── types.rs
│   └── defi_accounting/          # Should be self-contained
│       ├── mod.rs                # Re-exports functions
│       ├── accounting.rs         # Core accounting logic
│       ├── liquidity_pool.rs     # LP system
│       ├── query.rs              # Query endpoints (has #[query] attributes)
│       ├── types.rs              # Type definitions
│       ├── CLAUDE.md
│       └── README.md
```

### Problem: Logic Outside defi_accounting/

#### 1. lib.rs Lines 21-27: Blanket Re-exports
```rust
pub use defi_accounting::{
    deposit, withdraw_all, get_balance, get_my_balance, get_house_balance,
    get_max_allowed_payout, get_accounting_stats, audit_balances, refresh_canister_balance,
    AccountingStats,
    // Liquidity Pool types only
    LPPosition, PoolStats,
};
```
**Issue:** Exposes everything from defi_accounting at the top level unnecessarily.

#### 2. lib.rs Lines 128-153: get_canister_balance() Implementation
```rust
#[update]
async fn get_canister_balance() -> u64 {
    #[derive(CandidType, serde::Serialize)]
    struct Account {
        owner: Principal,
        subaccount: Option<Vec<u8>>,
    }

    let account = Account {
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
```
**Issue:** This is accounting logic that should live in `defi_accounting/accounting.rs`.

#### 3. lib.rs Lines 168-209: Wrapper API Endpoints
```rust
#[update]
async fn deposit_liquidity(amount: u64) -> Result<Nat, String> {
    defi_accounting::deposit_liquidity(amount).await
}

#[update]
async fn withdraw_all_liquidity() -> Result<u64, String> {
    defi_accounting::withdraw_all_liquidity().await
}

#[query]
fn get_lp_position(user: Principal) -> LPPosition {
    defi_accounting::get_lp_position(user)
}

#[query]
fn get_my_lp_position() -> LPPosition {
    let caller = ic_cdk::caller();
    defi_accounting::get_lp_position(caller)
}

#[query]
fn get_pool_stats() -> PoolStats {
    defi_accounting::get_pool_stats()
}

#[query]
fn get_house_mode() -> String {
    "liquidity_pool".to_string()
}

#[query]
fn can_accept_bets() -> bool {
    defi_accounting::can_accept_bets()
}

#[query]
fn get_withdrawal_status() -> Option<defi_accounting::types::PendingWithdrawal> {
    defi_accounting::accounting::get_withdrawal_status()
}

#[query]
fn get_audit_log(offset: usize, limit: usize) -> Vec<defi_accounting::types::AuditEntry> {
    defi_accounting::accounting::get_audit_log(offset, limit)
}
```
**Issue:** These are just thin wrappers. The `#[query]`/`#[update]` attributes should be directly in `defi_accounting/` modules.

### What game.rs Actually Needs

From analysis of `dice_backend/src/game.rs`:

```rust
// Line 3: Import statement
use crate::defi_accounting::{self as accounting, liquidity_pool};

// Line 81: Get user balance
let user_balance = accounting::get_balance(caller);

// Line 147: Get max allowed payout
let max_allowed = accounting::get_max_allowed_payout();

// Line 170, 243: Update balance (internal function, not API endpoint)
accounting::update_balance(caller, balance_after_bet)?;

// Line 246, 248: Update pool (internal functions, not API endpoints)
liquidity_pool::update_pool_on_win(profit);
liquidity_pool::update_pool_on_loss(bet_amount);
```

**Required exports for game logic:**
- `accounting::get_balance()` - query function
- `accounting::get_max_allowed_payout()` - query function
- `accounting::update_balance()` - internal function (pub but not #[update])
- `liquidity_pool::update_pool_on_win()` - internal function (pub(crate))
- `liquidity_pool::update_pool_on_loss()` - internal function (pub(crate))

**Note:** Game logic uses internal APIs, not the public canister endpoints. This is correct.

## Implementation Steps

### Step 1: Move get_canister_balance() to defi_accounting

**File:** `dice_backend/src/defi_accounting/accounting.rs`

**Action:** Add this function at the end of the file (after line 490):

```rust
// PSEUDOCODE - Add after refresh_canister_balance() function

#[update]
pub async fn get_canister_balance() -> u64 {
    // Define Account struct locally (ICRC-1 standard)
    #[derive(CandidType, Deserialize)]
    struct IcrcAccount {
        owner: Principal,
        subaccount: Option<Vec<u8>>,
    }

    let account = IcrcAccount {
        owner: ic_cdk::id(),
        subaccount: None,
    };

    // Query ICP ledger
    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let result: Result<(Nat,), _> = ic_cdk::call(ledger, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            // Convert Nat to u64, return 0 if conversion fails
            balance.0.try_into().unwrap_or(0)
        }
        Err(e) => {
            ic_cdk::println!("Failed to query canister balance: {:?}", e);
            0
        }
    }
}
```

**Why:** This function queries the ICP ledger for the canister's balance - clearly accounting logic.

### Step 2: Add #[query] and #[update] Attributes to defi_accounting Functions

#### 2a. Update `defi_accounting/liquidity_pool.rs`

Currently lines 130 and 309 have `pub async fn` but no attributes. Add `#[update]`:

```rust
// PSEUDOCODE

// Line 130 - Add #[update] attribute
#[update]
pub async fn deposit_liquidity(amount: u64) -> Result<Nat, String> {
    // ... existing implementation ...
}

// Line 309 - Add #[update] attribute
#[update]
pub async fn withdraw_all_liquidity() -> Result<u64, String> {
    // ... existing implementation ...
}

// Line 408 - Add #[query] attribute
#[query]
pub fn can_accept_bets() -> bool {
    // ... existing implementation ...
}
```

#### 2b. Update `defi_accounting/query.rs`

This file already has `#[query]` attributes on most functions (lines 10, 15, 20, 25, 30, 35). Good!

But lines 44 and 48 are missing attributes. Add them:

```rust
// PSEUDOCODE

// Line 44 - Add #[query] attribute
#[query]
pub fn get_lp_position(user: Principal) -> LPPosition {
    // ... existing implementation ...
}

// Line 48 - Add #[query] attribute
#[query]
pub fn get_pool_stats() -> PoolStats {
    // ... existing implementation ...
}
```

#### 2c. Update `defi_accounting/accounting.rs`

Lines 437 and 443 have public functions but no attributes. Add them:

```rust
// PSEUDOCODE

// Line 437 - Add #[query] attribute
#[query]
pub fn get_withdrawal_status() -> Option<PendingWithdrawal> {
    // ... existing implementation ...
}

// Line 443 - Add #[query] attribute
#[query]
pub fn get_audit_log(offset: usize, limit: usize) -> Vec<AuditEntry> {
    // ... existing implementation ...
}
```

### Step 3: Add get_house_mode() to defi_accounting

This is a simple constant query that returns the mode. Add to `query.rs`:

```rust
// PSEUDOCODE - Add to defi_accounting/query.rs

#[query]
pub fn get_house_mode() -> String {
    "liquidity_pool".to_string()
}
```

### Step 4: Add get_my_lp_position() to defi_accounting

This is a convenience wrapper. Add to `query.rs`:

```rust
// PSEUDOCODE - Add to defi_accounting/query.rs

#[query]
pub fn get_my_lp_position() -> LPPosition {
    get_lp_position(ic_cdk::caller())
}
```

### Step 5: Remove from lib.rs

#### 5a. Remove Re-exports (Lines 21-27)

**File:** `dice_backend/src/lib.rs`

**Delete these lines:**
```rust
pub use defi_accounting::{
    deposit, withdraw_all, get_balance, get_my_balance, get_house_balance,
    get_max_allowed_payout, get_accounting_stats, audit_balances, refresh_canister_balance,
    AccountingStats,
    // Liquidity Pool types only
    LPPosition, PoolStats,
};
```

**Keep only:** `pub use types::{...}` for game-specific types.

#### 5b. Remove get_canister_balance() (Lines 128-153)

**Delete the entire function** - it now lives in `defi_accounting/accounting.rs`.

#### 5c. Remove All Wrapper Endpoints (Lines 168-209)

**Delete these functions:**
- `deposit_liquidity()`
- `withdraw_all_liquidity()`
- `get_lp_position()`
- `get_my_lp_position()`
- `get_pool_stats()`
- `get_house_mode()`
- `can_accept_bets()`
- `get_withdrawal_status()`
- `get_audit_log()`

**Result:** `lib.rs` should have only:
- `mod defi_accounting;` declaration
- `mod game;`, `mod seed;`, `mod analytics;`, `mod types;`
- Game-specific endpoints: `play_dice()`, `get_stats()`, `get_recent_games()`, etc.
- Seed-related endpoints
- `greet()` function

### Step 6: Update game.rs Imports (If Needed)

**File:** `dice_backend/src/game.rs`

Current import (line 3):
```rust
use crate::defi_accounting::{self as accounting, liquidity_pool};
```

This should continue to work! The functions `game.rs` uses are:
- Internal functions: `update_balance()`, `update_pool_on_win()`, `update_pool_on_loss()`
- Query functions via query module: `get_balance()`, `get_max_allowed_payout()`

These are imported through the `defi_accounting` module re-exports in `mod.rs`.

**Check:** If any function is not accessible, we need to ensure `defi_accounting/mod.rs` exports it:

```rust
// PSEUDOCODE - Verify defi_accounting/mod.rs has these exports

pub use accounting::{
    // ... existing exports ...
    update_balance,  // Needed by game.rs
};

pub use liquidity_pool::{
    // ... existing exports ...
    update_pool_on_win,   // Needed by game.rs (should be pub(crate) only)
    update_pool_on_loss,  // Needed by game.rs (should be pub(crate) only)
};
```

**Note:** The pool update functions should be `pub(crate)` (internal to canister) not exposed as API endpoints.

### Step 7: Verify defi_accounting/mod.rs Exports

**File:** `dice_backend/src/defi_accounting/mod.rs`

Ensure it exports what `game.rs` needs:

```rust
// PSEUDOCODE - Review mod.rs exports

pub mod accounting;
pub mod liquidity_pool;
pub mod query;
pub mod types;

// Re-export for game logic use (internal)
pub use accounting::{
    deposit,  // #[update] in accounting.rs
    withdraw_all,  // #[update] in accounting.rs
    refresh_canister_balance,  // #[update] in accounting.rs
    update_balance,  // pub fn (internal) - NEEDED BY GAME.RS
    AccountingStats,
};

pub use liquidity_pool::{
    deposit_liquidity,  // #[update] in liquidity_pool.rs
    withdraw_all_liquidity,  // #[update] in liquidity_pool.rs
    can_accept_bets,  // #[query] in liquidity_pool.rs
    update_pool_on_win,  // pub(crate) fn (internal) - NEEDED BY GAME.RS
    update_pool_on_loss,  // pub(crate) fn (internal) - NEEDED BY GAME.RS
    LPPosition,
    PoolStats,
};

// Re-export query functions (these have #[query] in query.rs)
pub use query::{
    get_balance,  // NEEDED BY GAME.RS
    get_my_balance,
    get_house_balance,
    get_max_allowed_payout,  // NEEDED BY GAME.RS
    get_accounting_stats,
    audit_balances,
    get_lp_position,
    get_my_lp_position,
    get_pool_stats,
    get_house_mode,
};
```

**Important:** Functions marked with `#[query]` or `#[update]` automatically become canister endpoints. No wrapper needed in `lib.rs`.

## Testing Plan

### Build Check
```bash
cd dice_backend
cargo build --target wasm32-unknown-unknown --release
```

Should compile without errors.

### Deploy to Mainnet
```bash
./deploy.sh
```

### API Verification

Test that all accounting endpoints are still accessible:

```bash
# User accounting
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_my_balance
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_accounting_stats
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_canister_balance

# Liquidity pool
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_pool_stats
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_my_lp_position
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai can_accept_bets
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_house_mode

# Game still works
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_stats
```

All should return valid responses.

## Expected Outcome

### Before (Current State)
- `lib.rs`: 214 lines, contains accounting logic mixed with game logic
- `defi_accounting/`: Missing `#[query]`/`#[update]` attributes, relies on lib.rs wrappers
- Reusability: LOW - can't copy defi_accounting to another game without modifications

### After (Target State)
- `lib.rs`: ~140 lines, ONLY game-specific logic
- `defi_accounting/`: Fully self-contained with all API endpoints marked
- Reusability: HIGH - copy entire `defi_accounting/` folder to any game, works immediately
- Cleaner architecture: Each module responsible for its own API surface

### Code Reduction
- Remove ~42 lines of wrapper functions from lib.rs
- Remove ~7 lines of re-exports from lib.rs
- Add ~5 lines of attributes to defi_accounting
- Add ~30 lines (get_canister_balance) to defi_accounting
- **Net result:** Negative LOC in lib.rs, accounting logic properly isolated

## Migration Path for Other Games

After this refactor, adding liquidity pool to other games becomes trivial:

```bash
# In crash_backend, plinko_backend, or mines_backend:
cp -r dice_backend/src/defi_accounting .

# In lib.rs, just add:
mod defi_accounting;

# In game logic, import what you need:
use crate::defi_accounting::{self as accounting, liquidity_pool};

# That's it! All APIs automatically exposed.
```

## Deployment Verification

1. Build succeeds with no errors
2. Deploy to mainnet completes successfully
3. All existing API endpoints still work
4. Frontend can call accounting functions directly (no wrapper needed)
5. Game logic continues to function (play_dice works)

---

## Summary

This refactoring achieves the user's goal:
> "I want defi_accounting to be the replicable piece that doesn't require code changes for each game"

By moving all accounting logic into `defi_accounting/` and using `#[query]`/`#[update]` attributes directly, we eliminate the need for lib.rs wrappers. The module becomes truly self-contained and reusable.

**Result:** Copy-paste `defi_accounting/` → add `mod defi_accounting;` → done.
