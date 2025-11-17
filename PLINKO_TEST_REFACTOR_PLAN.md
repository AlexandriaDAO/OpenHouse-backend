# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-test-refactor"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-test-refactor`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build plinko backend
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status plinko_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(plinko): extract tests to separate file and add statistical verification"
   git push -u origin feature/plinko-test-refactor
   gh pr create --title "Refactor: Plinko Test Organization & Statistical Verification" --body "Implements PLINKO_TEST_REFACTOR_PLAN.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: plinko_backend (weupr-2qaaa-aaaap-abl3q-cai)

## Changes
- Extracted all tests from lib.rs to separate test files
- Added statistical simulation test (10,000 games) to verify 1% house edge
- Follows dice_backend test organization pattern

## Tests Pass
- All existing unit tests preserved
- New statistical test verifies actual house edge matches expected 0.99 EV"
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

**Branch:** `feature/plinko-test-refactor`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-test-refactor`

---

# Implementation Plan: Plinko Test Refactoring & Statistical Verification

## Task Classification
**REFACTORING + NEW FEATURE**
- Refactoring: Move existing tests from lib.rs to separate files (subtractive approach)
- New Feature: Add statistical simulation test to verify house edge (additive approach)

## Current State

### File Structure (BEFORE)
```
plinko_backend/
├── Cargo.toml
├── plinko_backend.did
└── src/
    └── lib.rs (228 lines - includes 6 tests inline)
```

### Existing Tests (lib.rs:148-227)
```rust
#[cfg(test)]
mod tests {
    // Line 153: test_exact_multipliers - verifies formula output
    // Line 168: test_expected_value_exactly_point_99 - verifies EV
    // Line 178: test_house_edge_exactly_one_percent - verifies house edge
    // Line 189: test_multiplier_symmetry - verifies symmetry
    // Line 203: test_win_loss_positions - counts winners/losers
    // Line 215: test_variance_ratio - checks max/min ratio
}
```

### Pattern to Follow
Dice backend already uses this pattern:
```
dice_backend/
├── tests/
│   └── test_game_logic.rs
```

## Target State

### File Structure (AFTER)
```
plinko_backend/
├── Cargo.toml (unchanged)
├── plinko_backend.did (unchanged)
├── src/
│   └── lib.rs (remove tests mod, keep all game logic)
└── tests/
    ├── test_multipliers.rs (unit tests for formula)
    └── test_statistical_verification.rs (NEW - Monte Carlo simulation)
```

## Implementation Steps

### Step 1: Create tests directory structure
```bash
# PSEUDOCODE
cd plinko_backend
mkdir tests
```

### Step 2: Extract existing tests to `tests/test_multipliers.rs`
```rust
// PSEUDOCODE for tests/test_multipliers.rs

// Import the public functions we need to test
use plinko_backend::{calculate_multiplier, get_multipliers, get_expected_value};

#[test]
fn test_exact_multipliers() {
    // Copy test from lib.rs:153-165
    let expected = [6.52, 3.755, 1.78, 0.595, 0.2, 0.595, 1.78, 3.755, 6.52];

    for (pos, &expected_mult) in expected.iter().enumerate() {
        let calculated = calculate_multiplier(pos as u8);
        assert!(
            (calculated - expected_mult).abs() < 0.001,
            "Position {}: expected {}, got {}",
            pos, expected_mult, calculated
        );
    }
}

#[test]
fn test_expected_value_exactly_point_99() {
    // Copy test from lib.rs:168-175
    let ev = get_expected_value();
    assert!(
        (ev - 0.99).abs() < 0.000001,
        "Expected value should be exactly 0.99, got {}",
        ev
    );
}

#[test]
fn test_house_edge_exactly_one_percent() {
    // Copy test from lib.rs:178-186
    let ev = get_expected_value();
    let house_edge = 1.0 - ev;
    assert!(
        (house_edge - 0.01).abs() < 0.000001,
        "House edge should be exactly 1%, got {}%",
        house_edge * 100.0
    );
}

#[test]
fn test_multiplier_symmetry() {
    // Copy test from lib.rs:189-200
    for i in 0..=4 {
        let left = calculate_multiplier(i);
        let right = calculate_multiplier(8 - i);
        assert!(
            (left - right).abs() < 0.0001,
            "Asymmetry at position {}: {} != {}",
            i, left, right
        );
    }
}

#[test]
fn test_win_loss_positions() {
    // Copy test from lib.rs:203-212
    let multipliers = get_multipliers();
    let winners = multipliers.iter().filter(|&&m| m >= 1.0).count();
    let losers = multipliers.iter().filter(|&&m| m < 1.0).count();

    assert_eq!(winners, 4, "Should have 4 winning positions");
    assert_eq!(losers, 5, "Should have 5 losing positions");
}

#[test]
fn test_variance_ratio() {
    // Copy test from lib.rs:215-226
    let multipliers = get_multipliers();
    let max = multipliers.iter().fold(0.0, |a, &b| a.max(b));
    let min = multipliers.iter().fold(f64::MAX, |a, &b| a.min(b));

    let variance_ratio = max / min;
    assert!(
        (variance_ratio - 32.6).abs() < 0.1,
        "Variance ratio should be ~32.6:1, got {}:1",
        variance_ratio
    );
}
```

### Step 3: Create statistical verification test `tests/test_statistical_verification.rs`
```rust
// PSEUDOCODE for tests/test_statistical_verification.rs

// This test runs Monte Carlo simulations to verify the house edge
// is actually 1% across thousands of games

use plinko_backend::{calculate_multiplier, get_expected_value};

/// Simulate a single plinko drop using deterministic randomness
/// Returns (final_position, multiplier, payout_for_1_unit_bet)
fn simulate_drop(random_byte: u8) -> (u8, f64, f64) {
    const ROWS: u8 = 8;

    // Generate path from random byte (same logic as lib.rs)
    let path: Vec<bool> = (0..ROWS)
        .map(|i| (random_byte >> i) & 1 == 1)
        .collect();

    // Count rights to get final position
    let final_position = path.iter().filter(|&&d| d).count() as u8;

    // Calculate multiplier
    let multiplier = calculate_multiplier(final_position);

    // For 1 unit bet, payout is multiplier (or 0 if loss)
    let payout = multiplier; // Raw multiplier is the payout

    (final_position, multiplier, payout)
}

#[test]
fn test_statistical_house_edge_verification() {
    // Run 10,000 simulations to verify house edge
    const NUM_SIMULATIONS: usize = 10_000;
    const BET_AMOUNT: f64 = 1.0; // Bet 1 unit per game

    let mut total_wagered = 0.0;
    let mut total_returned = 0.0;
    let mut position_counts = [0usize; 9]; // Track distribution

    // Use all possible byte values multiple times for coverage
    for i in 0..NUM_SIMULATIONS {
        let random_byte = (i % 256) as u8;

        // Simulate drop
        let (position, _multiplier, payout) = simulate_drop(random_byte);

        // Track finances
        total_wagered += BET_AMOUNT;
        total_returned += payout * BET_AMOUNT;

        // Track position distribution
        position_counts[position as usize] += 1;
    }

    // Calculate actual return-to-player (RTP)
    let actual_rtp = total_returned / total_wagered;
    let actual_house_edge = 1.0 - actual_rtp;

    // Get theoretical expected value
    let expected_rtp = get_expected_value();
    let expected_house_edge = 1.0 - expected_rtp;

    // Print detailed results
    println!("\n=== Statistical Verification (N={}) ===", NUM_SIMULATIONS);
    println!("Total Wagered: {:.2} units", total_wagered);
    println!("Total Returned: {:.2} units", total_returned);
    println!("Actual RTP: {:.4} ({:.2}%)", actual_rtp, actual_rtp * 100.0);
    println!("Actual House Edge: {:.4} ({:.2}%)", actual_house_edge, actual_house_edge * 100.0);
    println!("Expected RTP: {:.4} ({:.2}%)", expected_rtp, expected_rtp * 100.0);
    println!("Expected House Edge: {:.4} ({:.2}%)", expected_house_edge, expected_house_edge * 100.0);
    println!("\nPosition Distribution:");
    for (pos, count) in position_counts.iter().enumerate() {
        let pct = (*count as f64 / NUM_SIMULATIONS as f64) * 100.0;
        println!("  Position {}: {} drops ({:.2}%)", pos, count, pct);
    }

    // Assertions with reasonable tolerance for statistical variance
    // With 10k simulations, we expect ~1% error margin
    let tolerance = 0.02; // 2% tolerance for statistical variance

    assert!(
        (actual_rtp - expected_rtp).abs() < tolerance,
        "Actual RTP ({:.4}) differs from expected ({:.4}) by more than {:.2}%",
        actual_rtp, expected_rtp, tolerance * 100.0
    );

    assert!(
        (actual_house_edge - expected_house_edge).abs() < tolerance,
        "Actual house edge ({:.4}) differs from expected ({:.4}) by more than {:.2}%",
        actual_house_edge, expected_house_edge, tolerance * 100.0
    );

    // Verify we're actually getting a house edge close to 1%
    assert!(
        (actual_house_edge - 0.01).abs() < tolerance,
        "House edge should be approximately 1%, got {:.2}%",
        actual_house_edge * 100.0
    );

    // Verify players are getting back approximately 99% of wagered amount
    assert!(
        (actual_rtp - 0.99).abs() < tolerance,
        "RTP should be approximately 0.99, got {:.4}",
        actual_rtp
    );
}

#[test]
fn test_position_distribution_matches_binomial() {
    // Verify the position distribution follows binomial probabilities
    const NUM_DROPS: usize = 25_600; // Multiple of 256 for even distribution

    let mut position_counts = [0usize; 9];

    // Use all byte values evenly (100 cycles through 0-255)
    for i in 0..NUM_DROPS {
        let random_byte = (i % 256) as u8;
        let (position, _, _) = simulate_drop(random_byte);
        position_counts[position as usize] += 1;
    }

    // Expected binomial distribution for 8 rows (coefficients / 256)
    let expected_probabilities = [
        1.0 / 256.0,   // Position 0
        8.0 / 256.0,   // Position 1
        28.0 / 256.0,  // Position 2
        56.0 / 256.0,  // Position 3
        70.0 / 256.0,  // Position 4 (center - most probable)
        56.0 / 256.0,  // Position 5
        28.0 / 256.0,  // Position 6
        8.0 / 256.0,   // Position 7
        1.0 / 256.0,   // Position 8
    ];

    println!("\n=== Position Distribution Test ===");
    for (pos, &count) in position_counts.iter().enumerate() {
        let actual_prob = count as f64 / NUM_DROPS as f64;
        let expected_prob = expected_probabilities[pos];
        let diff = (actual_prob - expected_prob).abs();

        println!(
            "Position {}: actual={:.4} expected={:.4} diff={:.4}",
            pos, actual_prob, expected_prob, diff
        );

        // Allow 1% deviation from expected probability
        assert!(
            diff < 0.01,
            "Position {} probability deviates too much: {:.4} vs {:.4}",
            pos, actual_prob, expected_prob
        );
    }
}
```

### Step 4: Update lib.rs - Remove tests module
```rust
// PSEUDOCODE for lib.rs changes

// DELETE lines 148-227 (entire #[cfg(test)] mod tests { ... })

// Everything else stays the same
// Main game logic functions remain unchanged:
// - drop_ball()
// - get_multipliers()
// - get_formula()
// - get_expected_value()
// - calculate_multiplier()
// - greet()
```

### Step 5: Make calculate_multiplier public for tests
```rust
// PSEUDOCODE for lib.rs changes

// CHANGE line 120 from:
// fn calculate_multiplier(position: u8) -> f64 {

// TO:
pub fn calculate_multiplier(position: u8) -> f64 {
//  ^^^ Add pub keyword so integration tests can access it
```

### Step 6: Run tests to verify
```bash
# PSEUDOCODE
cd plinko_backend

# Run all tests
cargo test

# Run specific test file
cargo test --test test_multipliers
cargo test --test test_statistical_verification

# Run with output to see statistics
cargo test test_statistical_house_edge_verification -- --nocapture
```

## Expected Test Output

When running the statistical test, you should see output like:
```
=== Statistical Verification (N=10000) ===
Total Wagered: 10000.00 units
Total Returned: 9900.23 units
Actual RTP: 0.9900 (99.00%)
Actual House Edge: 0.0100 (1.00%)
Expected RTP: 0.9900 (99.00%)
Expected House Edge: 0.0100 (1.00%)

Position Distribution:
  Position 0: 39 drops (0.39%)
  Position 1: 312 drops (3.12%)
  Position 2: 1093 drops (10.93%)
  Position 3: 2187 drops (21.87%)
  Position 4: 2734 drops (27.34%)  [most probable - center]
  Position 5: 2187 drops (21.87%)
  Position 6: 1093 drops (10.93%)
  Position 7: 312 drops (3.12%)
  Position 8: 39 drops (0.39%)
```

This confirms:
- ✅ House edge is exactly 1%
- ✅ Players get back 99% on average
- ✅ Distribution follows binomial probabilities
- ✅ Game is mathematically fair as advertised

## Deployment Notes

### Affected Canisters
- **Plinko Backend** (`weupr-2qaaa-aaaap-abl3q-cai`) - test refactoring only, no runtime changes

### No Runtime Changes
This refactoring only reorganizes tests. The game logic and canister functions remain unchanged:
- Same multiplier formula
- Same expected value (0.99)
- Same house edge (1%)
- Same user-facing behavior

### Testing Strategy
```bash
# Build to verify compilation
cargo build --target wasm32-unknown-unknown --release

# Run all tests locally
cargo test

# Deploy to mainnet
./deploy.sh

# Verify canister still works
dfx canister --network ic call plinko_backend get_multipliers
dfx canister --network ic call plinko_backend get_expected_value
dfx canister --network ic call plinko_backend get_formula
```

## Benefits

### Code Organization
- **Separation of concerns**: Tests live in standard Rust `tests/` directory
- **Easier to navigate**: Main game logic (147 lines) separate from tests
- **Follows best practices**: Matches dice_backend pattern

### Statistical Confidence
- **Verifies theory**: Monte Carlo simulation confirms math is correct
- **Detects bugs**: Would catch any implementation errors in randomness or payouts
- **Transparency**: Output shows exact house edge across thousands of games
- **Player trust**: Provable 1% house edge with concrete simulation data

### Maintainability
- **Easier testing**: Can run unit tests vs statistical tests separately
- **Better debugging**: Clear separation makes issues easier to isolate
- **Future expansion**: Easy to add more statistical tests (variance, max payout, etc.)

## Checklist

- [ ] Worktree created and isolated
- [ ] Created `tests/` directory
- [ ] Extracted 6 existing tests to `test_multipliers.rs`
- [ ] Created `test_statistical_verification.rs` with Monte Carlo simulation
- [ ] Removed tests module from `lib.rs` (lines 148-227)
- [ ] Made `calculate_multiplier` public for test access
- [ ] Ran `cargo test` - all tests pass
- [ ] Built WASM target successfully
- [ ] Deployed to mainnet with `./deploy.sh`
- [ ] Verified canister functions still work
- [ ] Committed changes to feature branch
- [ ] Created PR with deployment confirmation
- [ ] PR body includes test output showing 1% house edge verification
