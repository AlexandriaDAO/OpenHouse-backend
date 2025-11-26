# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-settle-bet"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-settle-bet`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ./deploy.sh --dice-only
   ```
4. **Verify deployment**:
   ```bash
   dfx canister --network ic status dice_backend
   dfx canister --network ic call dice_backend get_stats
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(defi_accounting): Add generic settle_bet() for game-agnostic bet settlement"
   git push -u origin feature/generic-settle-bet
   gh pr create --title "feat: Generic settle_bet() for game-agnostic betting framework" --body "$(cat <<'EOF'
## Summary
Refactors defi_accounting module to support ANY payout scenario (partial payouts like Plinko 0.2x, pushes, wins, total losses) via a unified `settle_bet(bet_amount, payout_amount)` function.

## Problem
Current API assumes binary outcomes:
- `update_pool_on_win(profit)` - player won
- `update_pool_on_loss(bet)` - player lost everything

Plinko has partial payouts (bet 100, get 20 on 0.2x). Using `update_pool_on_loss(100)` incorrectly confiscates the full bet instead of just the net loss (80).

## Solution
`settle_bet(bet, payout)` mathematically determines pool flow:
- payout > bet: pool pays profit
- payout < bet: pool gains difference
- payout == bet: no change (push)

## Changes
- `liquidity_pool.rs`: Added `settle_bet()` function
- `mod.rs`: Export `settle_bet`, `get_pool_reserve`, `can_accept_bets`
- `game.rs`: Migrated to use `settle_bet()` instead of direct pool calls
- `tests/`: Added comprehensive test coverage

## Testing
- Unit tests for all payout scenarios
- Proptest for multipliers 0x-10x
- Stress test with 10k random bets

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai
EOF
)"
   ```
6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- After sleep: IMMEDIATELY continue (no pause)
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/generic-settle-bet`
**Worktree:** `/home/theseus/alexandria/openhouse-settle-bet`

---

# Implementation Plan: Generic settle_bet() Function

## Goal
Refactor `dice_backend/src/defi_accounting/` into a generic, fork-ready betting framework that handles ALL payout scenarios via a unified `settle_bet()` function.

## Architecture
- Each game canister gets its own **forked copy** of `defi_accounting/`
- Complete isolation: separate pools, balances, LP shares per game
- Blast radius limited: bugs affect only one game's funds

---

## Current State

### File Structure
```
dice_backend/src/defi_accounting/
├── mod.rs              # Public exports
├── accounting.rs       # User balance management
├── liquidity_pool.rs   # LP system, pool updates
├── query.rs            # Query functions
├── types.rs            # Data types
├── statistics/         # Volume tracking, APY
└── tests/              # Test suite
```

### Current Pool Update Functions (liquidity_pool.rs:529-556)
```rust
// EXISTING CODE - binary assumption
pub(crate) fn update_pool_on_win(payout: u64)  // Deducts profit from pool
pub(crate) fn update_pool_on_loss(bet: u64)    // Adds bet to pool
```

### Current Dice Usage (game.rs:147-182)
```rust
// EXISTING CODE - branching logic
if is_win {
    let profit = payout.saturating_sub(bet_amount);
    // ... solvency check ...
    liquidity_pool::update_pool_on_win(profit);
} else {
    liquidity_pool::update_pool_on_loss(bet_amount);
}
```

---

## The Problem

| Scenario | Bet | Payout | Pool Change | Current API |
|----------|-----|--------|-------------|-------------|
| Total Loss | 100 | 0 | +100 | `update_pool_on_loss(100)` works |
| Partial Loss (Plinko 0.2x) | 100 | 20 | +80 | `update_pool_on_loss(100)` WRONG (takes 100) |
| Push | 100 | 100 | 0 | No function exists |
| Win | 100 | 200 | -100 | `update_pool_on_win(100)` works |

---

## Implementation Steps

### Step 1: Add settle_bet() to liquidity_pool.rs

**File:** `dice_backend/src/defi_accounting/liquidity_pool.rs`
**Location:** After line 556 (after `update_pool_on_loss`)

```rust
// PSEUDOCODE - Add after update_pool_on_loss()

/// Settle a bet with any payout amount.
///
/// Primary API for game integration. Games call this after determining
/// outcome instead of directly calling update_pool_on_win/loss.
///
/// # Arguments
/// * `bet_amount` - Original wager amount
/// * `payout_amount` - Total payout to player (0=loss, bet=push, >bet=win)
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(String)` if pool cannot afford the payout profit
///
/// # Pool Flow
/// - payout > bet: Pool pays profit (payout - bet)
/// - payout < bet: Pool gains loss (bet - payout)
/// - payout == bet: No pool change (push)
pub fn settle_bet(bet_amount: u64, payout_amount: u64) -> Result<(), String> {
    // IF payout > bet THEN
    //   profit = payout - bet
    //   check pool solvency (profit <= reserve)
    //   call update_pool_on_win(profit)
    // ELSE IF payout < bet THEN
    //   pool_gain = bet - payout
    //   call update_pool_on_loss(pool_gain)  // NOT full bet!
    // ELSE (push)
    //   no-op
    // RETURN Ok(())
}
```

### Step 2: Update mod.rs Exports

**File:** `dice_backend/src/defi_accounting/mod.rs`

```rust
// PSEUDOCODE - Add to exports

// Re-export game settlement function (primary game integration point)
pub use liquidity_pool::settle_bet;

// Also expose pool queries for pre-flight validation
pub use liquidity_pool::get_pool_reserve;
pub use liquidity_pool::can_accept_bets;
```

### Step 3: Migrate game.rs to use settle_bet()

**File:** `dice_backend/src/game.rs`
**Replace:** Lines ~147-182 (the if/else win/loss branching)

```rust
// PSEUDOCODE - Simplified settlement

// Update user balance with payout (0 for loss, multiplied for win)
// current_balance = get_balance(caller)
// new_balance = current_balance + payout
// update_balance(caller, new_balance)

// Settle with pool using generic API
// result = settle_bet(bet_amount, payout)
// IF error (pool insolvent):
//   rollback user balance (refund bet)
//   return error with refund message
```

**Key simplification:** Remove the `if is_win { ... } else { ... }` branching entirely. The `payout` variable is already 0 for losses, so `settle_bet(bet_amount, 0)` correctly adds the full bet to the pool.

### Step 4: Add Test Cases

**File:** `dice_backend/src/defi_accounting/tests/stress_tests/operations.rs`

```rust
// PSEUDOCODE - Add operation variant
pub enum Operation {
    // ... existing variants ...

    /// Generic bet settlement (for Plinko-style partial payout games)
    SettleBet { user: u64, bet_amount: u64, payout_amount: u64 },
}
```

**File:** `dice_backend/src/defi_accounting/tests/stress_tests/model.rs`

```rust
// PSEUDOCODE - Add to AccountingModel

fn settle_bet(&mut self, user: u64, bet_amount: u64, payout_amount: u64) -> OpResult {
    // Check user has bet amount
    // Deduct bet from user
    // Calculate pool flow (same logic as real function)
    // Check solvency if payout > bet
    // Update user balance with payout
    // Update pool reserve
    // Return Success or appropriate error
}

// Update execute() match arm for SettleBet variant
```

**File:** `dice_backend/src/defi_accounting/tests/stress_tests/tests.rs`

```rust
// PSEUDOCODE - Add test cases

#[test]
fn test_settle_bet_total_loss() {
    // Bet 1 USDT, get 0 back
    // Assert pool gained 1 USDT
}

#[test]
fn test_settle_bet_partial_loss_plinko_style() {
    // Bet 1 USDT, get 0.2 USDT back (0.2x multiplier)
    // Assert pool gained 0.8 USDT (NOT full 1 USDT)
}

#[test]
fn test_settle_bet_push() {
    // Bet 1 USDT, get 1 USDT back
    // Assert pool unchanged
}

#[test]
fn test_settle_bet_win() {
    // Bet 1 USDT, get 2 USDT back (2x)
    // Assert pool paid 1 USDT profit
}

#[test]
fn test_settle_bet_big_win_exceeds_pool() {
    // Small pool (10 USDT), try 100x win
    // Assert error returned, user balance unchanged
}

#[test]
fn test_settle_bet_stress_mixed_outcomes() {
    // 10,000 bets with random multipliers 0x-10x
    // Assert invariants hold
}

proptest! {
    #[test]
    fn test_settle_bet_invariant_all_multipliers(
        bet in 100_000u64..10_000_000u64,
        multiplier_bps in 0u64..100_000u64  // 0x to 10x
    ) {
        // payout = bet * multiplier_bps / 10000
        // Execute settle_bet
        // Assert accounting invariants hold
    }
}
```

### Step 5: Add Documentation Header

**File:** `dice_backend/src/defi_accounting/liquidity_pool.rs` (top of file)

```rust
// PSEUDOCODE - Module-level documentation

//! Liquidity Pool Module - Game-Agnostic Betting Infrastructure
//!
//! ## Primary API
//! Use `settle_bet(bet_amount, payout_amount)` for all game settlement.
//!
//! ## Fork Checklist
//! When forking this module to a new game:
//! 1. Update `PARENT_STAKER_CANISTER` constant
//! 2. Update Memory IDs to unique values (avoid collision)
//!    - LP_SHARES: currently 11
//!    - POOL_STATE: currently 13
```

---

## Files to Modify

| File | Action | Lines |
|------|--------|-------|
| `dice_backend/src/defi_accounting/liquidity_pool.rs` | Add `settle_bet()` | After 556 |
| `dice_backend/src/defi_accounting/mod.rs` | Add exports | Exports section |
| `dice_backend/src/game.rs` | Migrate to `settle_bet()` | ~147-182 |
| `dice_backend/src/defi_accounting/tests/stress_tests/operations.rs` | Add variant | Enum |
| `dice_backend/src/defi_accounting/tests/stress_tests/model.rs` | Implement model | New method |
| `dice_backend/src/defi_accounting/tests/stress_tests/tests.rs` | Add tests | New tests |

---

## Verification After Deployment

```bash
# Run tests locally first
cargo test -p dice_backend

# Deploy to mainnet
./deploy.sh --dice-only

# Verify canister is healthy
dfx canister --network ic call dice_backend get_stats

# Test a small bet to verify settlement works
# (manual test via frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice)
```

---

## Fork Instructions for Future Games

When forking `defi_accounting/` to Plinko/Crash/etc:

1. **Copy module:** `cp -r dice_backend/src/defi_accounting plinko_backend/src/`

2. **Update constants:**
   - `PARENT_STAKER_CANISTER` in liquidity_pool.rs

3. **Update Memory IDs** (unique per canister):
   - LP_SHARES: 11 -> 31
   - POOL_STATE: 13 -> 33
   - USER_BALANCES: 10 -> 30
   - PENDING_WITHDRAWALS: 20 -> 40

4. **Integrate in game:**
   ```rust
   let payout = (bet as f64 * multiplier) as u64;
   liquidity_pool::settle_bet(bet, payout)?;
   ```
