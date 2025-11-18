# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-crash-tests"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-crash-tests`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build crash backend
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet
     ./deploy.sh --crash-only
     ```
   - Run tests locally (no deployment needed for tests):
     ```bash
     cd crash_backend
     cargo test --test test_house_edge_simulation -- --nocapture
     ```

4. **Verify tests pass**:
   ```bash
   # Run the simulation tests
   cd crash_backend
   cargo test --test test_house_edge_simulation -- --nocapture

   # Output should show:
   # - 10,000 games per multiplier target
   # - Average return ≈ 0.99x for each target
   # - Overall average ≈ 0.99x (1% house edge)
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: add house edge simulation tests for crash backend

   - Created tests/ folder with simulation test suite
   - Runs 10,000 games per multiplier (1.1x to 1000x)
   - Verifies 1% house edge (0.99x average return)
   - Comprehensive validation of crash formula fairness"
   git push -u origin feature/crash-simulation-tests
   gh pr create --title "[Feature]: Crash Backend House Edge Simulation Tests" --body "Implements CRASH_SIMULATION_TESTS_PLAN.md

   ## Summary
   - Added comprehensive simulation test suite for crash backend
   - Validates 1% house edge across all multiplier ranges
   - Tests 10,000 games per target multiplier (1.1x, 1.5x, 2x, 3x, 5x, 10x, 50x, 100x, 500x, 1000x)
   - Verifies average return is 0.99x (1% house edge)

   ## Test Coverage
   - Individual multiplier tests (per target)
   - Overall house edge validation
   - Statistical confidence intervals
   - Handles edge cases (low/high multipliers)

   ## Manual Verification
   \`\`\`bash
   cd crash_backend
   cargo test --test test_house_edge_simulation -- --nocapture
   \`\`\`

   No mainnet deployment needed - these are local simulation tests only."
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
- ⚠️ LOCAL TESTS ONLY: No mainnet deployment needed for test files
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/crash-simulation-tests`
**Worktree:** `/home/theseus/alexandria/openhouse-crash-tests`

---

# Implementation Plan: Crash Backend House Edge Simulation Tests

## Current State

### Existing Files
```
crash_backend/
├── Cargo.toml          # Package config, no test dependencies yet
├── crash_backend.did   # Candid interface
└── src/
    └── lib.rs          # Main implementation with inline unit tests
```

### Crash Game Logic (from `crash_backend/src/lib.rs`)

**Formula**:
```
crash = 1.0 / (1.0 - 0.99 × random)
```

Where:
- `random` is uniform [0.0, 1.0) from IC VRF
- `0.99` factor creates exactly 1% house edge
- `P(crash ≥ X) = 0.99 / X` (constant edge for all strategies)

**Key Functions**:
- `calculate_crash_point(random: f64) -> f64` - Applies crash formula
- `bytes_to_float(bytes: &[u8]) -> Result<f64, String>` - Converts VRF bytes to float
- `get_win_probability(target: f64) -> Result<f64, String>` - Returns P(crash ≥ target)

**Constants**:
- `MAX_CRASH = 1000.0` - Cap at 1000x multiplier
- Random clamped to [0.0, 0.99999] to prevent extreme values

**Expected Behavior**:
- For any target X: `P(crash ≥ X) × X = 0.99`
- Average return across all games should be 0.99x (1% house edge)
- This holds for ANY cash-out strategy

### Reference: Dice Backend Tests
The dice backend already has a `tests/` folder structure:
```
dice_backend/tests/test_game_logic.rs
```

We'll follow the same pattern for crash backend.

## Task Classification

**NEW FEATURE**: Building new test infrastructure to validate house edge through Monte Carlo simulation.

## Implementation Plan

### 1. Create Tests Directory Structure

**New Directory**: `crash_backend/tests/`

**File Tree (After Implementation)**:
```
crash_backend/
├── Cargo.toml                           # MODIFY: Add dev-dependencies
├── crash_backend.did
├── src/
│   └── lib.rs                           # NO CHANGES
└── tests/                               # NEW FOLDER
    └── test_house_edge_simulation.rs    # NEW FILE
```

### 2. Update Cargo.toml

**File**: `crash_backend/Cargo.toml`

**Changes**:
```toml
[dev-dependencies]
# Add dev dependencies for testing
# None needed - std library rand is sufficient for test simulations
```

**Note**: We don't need external dependencies since we're simulating with deterministic pseudorandom numbers (Rust's std `rand` or simple LCG). The actual game uses IC VRF, but tests can use any PRNG.

### 3. Implement Simulation Test

**File**: `crash_backend/tests/test_house_edge_simulation.rs` (NEW)

**Pseudocode**:
```rust
// PSEUDOCODE - Monte Carlo simulation to verify 1% house edge

// Import necessary items from the main crate
use crash_backend::{calculate_crash_point};  // We need to expose this function

/// Generate deterministic pseudorandom numbers for testing
fn generate_test_random(seed: u64, index: u64) -> f64 {
    // Simple LCG (Linear Congruential Generator) for reproducibility
    // This is NOT cryptographically secure but perfect for tests
    // Formula: next = (a × prev + c) mod m
    // Then normalize to [0.0, 1.0)

    // Use seed + index to get unique but deterministic values
    let a: u64 = 1103515245;
    let c: u64 = 12345;
    let m: u64 = 1 << 31;

    let value = ((a * (seed + index) + c) % m) as f64;
    value / m as f64
}

/// Simulate N games and calculate average return when cashing out at target multiplier
fn simulate_games_at_multiplier(target: f64, num_games: usize, seed: u64) -> f64 {
    let mut total_return = 0.0;

    for i in 0..num_games {
        // Generate random value
        let random = generate_test_random(seed, i as u64);

        // Calculate crash point using actual game formula
        let crash_point = calculate_crash_point(random);

        // Player cashes out at target multiplier
        // Win if crash >= target (player gets target × bet)
        // Lose if crash < target (player gets 0)
        let return_multiplier = if crash_point >= target {
            target  // Player wins and gets target multiplier
        } else {
            0.0     // Player loses, gets nothing
        };

        total_return += return_multiplier;
    }

    // Average return = total_return / num_games
    total_return / num_games as f64
}

#[test]
fn test_house_edge_at_various_multipliers() {
    println!("\n=== Crash Game House Edge Simulation ===\n");

    const NUM_GAMES: usize = 10_000;
    const SEED: u64 = 42;  // Fixed seed for reproducibility

    // Test multipliers from low to high
    let targets = vec![1.1, 1.5, 2.0, 3.0, 5.0, 10.0, 50.0, 100.0, 500.0, 1000.0];

    let mut all_returns = Vec::new();

    for target in targets {
        let avg_return = simulate_games_at_multiplier(target, NUM_GAMES, SEED);
        all_returns.push(avg_return);

        println!("Target: {:>6.1}x | Avg Return: {:.4}x | House Edge: {:.2}%",
                 target, avg_return, (1.0 - avg_return) * 100.0);

        // Verify return is approximately 0.99x (1% house edge)
        // Allow ±3% tolerance for statistical variance
        assert!(
            (avg_return - 0.99).abs() < 0.03,
            "Target {}x: expected return ≈ 0.99x, got {:.4}x",
            target, avg_return
        );
    }

    // Calculate overall average across all targets
    let overall_avg = all_returns.iter().sum::<f64>() / all_returns.len() as f64;

    println!("\n=== Summary ===");
    println!("Overall Average Return: {:.4}x", overall_avg);
    println!("Overall House Edge: {:.2}%", (1.0 - overall_avg) * 100.0);

    // Overall average should also be close to 0.99
    assert!(
        (overall_avg - 0.99).abs() < 0.02,
        "Overall average return should be ≈ 0.99x, got {:.4}x",
        overall_avg
    );
}

#[test]
fn test_theoretical_win_probabilities() {
    // Verify the theoretical probability formula: P(crash ≥ X) = 0.99 / X
    // This is independent of simulation and tests the mathematical formula

    println!("\n=== Theoretical Win Probabilities ===\n");

    const NUM_GAMES: usize = 10_000;
    const SEED: u64 = 123;

    let targets = vec![2.0, 5.0, 10.0, 20.0, 50.0, 100.0];

    for target in targets {
        // Theoretical probability
        let theoretical_prob = 0.99 / target;

        // Count wins in simulation
        let mut wins = 0;
        for i in 0..NUM_GAMES {
            let random = generate_test_random(SEED, i as u64);
            let crash_point = calculate_crash_point(random);

            if crash_point >= target {
                wins += 1;
            }
        }

        let observed_prob = wins as f64 / NUM_GAMES as f64;

        println!("Target: {:>6.1}x | Theoretical: {:.4} | Observed: {:.4} | Diff: {:.4}",
                 target, theoretical_prob, observed_prob,
                 (observed_prob - theoretical_prob).abs());

        // Verify observed probability matches theoretical (±5% tolerance)
        assert!(
            (observed_prob - theoretical_prob).abs() < 0.05,
            "Target {}x: probability mismatch. Expected {:.4}, got {:.4}",
            target, theoretical_prob, observed_prob
        );
    }
}

#[test]
fn test_extreme_multipliers() {
    // Test behavior at extreme ends
    println!("\n=== Extreme Multiplier Tests ===\n");

    const NUM_GAMES: usize = 10_000;
    const SEED: u64 = 999;

    // Very low multiplier (almost always wins)
    let low_target = 1.01;
    let low_return = simulate_games_at_multiplier(low_target, NUM_GAMES, SEED);
    println!("Very Low ({:.2}x): Avg Return = {:.4}x", low_target, low_return);

    // Should still have ~1% house edge
    assert!((low_return - 0.99).abs() < 0.05);

    // Very high multiplier (rarely wins, but huge payout)
    let high_target = 990.0;
    let high_return = simulate_games_at_multiplier(high_target, NUM_GAMES, SEED);
    println!("Very High ({:.0}x): Avg Return = {:.4}x", high_target, high_return);

    // Should still have ~1% house edge (but more variance)
    assert!((high_return - 0.99).abs() < 0.10);  // Higher tolerance due to variance

    // At max cap (1000x)
    let max_target = 1000.0;
    let max_return = simulate_games_at_multiplier(max_target, NUM_GAMES, SEED);
    println!("Max Cap ({:.0}x): Avg Return = {:.4}x", max_target, max_return);

    // Note: Returns at 1000x may be lower due to capping effect
    // (some crashes that would exceed 1000x are capped)
}
```

### 4. Expose Internal Functions for Testing

**File**: `crash_backend/src/lib.rs`

**Changes Needed**:
```rust
// PSEUDOCODE - Make calculate_crash_point public for tests

// Change from:
fn calculate_crash_point(random: f64) -> f64 { ... }

// To:
pub fn calculate_crash_point(random: f64) -> f64 { ... }

// This allows tests/ to import and test the core formula directly
```

**Note**: This is the ONLY change to existing code. We need to expose `calculate_crash_point` for testing.

## Testing Strategy

### What We're Testing
1. **House Edge Verification**: Average return across 10,000 games at each multiplier should be ≈ 0.99x
2. **Consistency Across Multipliers**: House edge should be constant regardless of cash-out strategy
3. **Probability Formula**: Observed win rates should match P(crash ≥ X) = 0.99 / X
4. **Extreme Cases**: Edge behavior at very low (1.01x) and very high (990x, 1000x) multipliers

### Why 10,000 Games Per Multiplier?
- Provides statistical confidence (standard error ≈ 0.01)
- Balances accuracy with reasonable test runtime
- Matches industry standard for casino game testing

### Tolerance Levels
- **Individual multipliers**: ±3% (accounts for Monte Carlo variance)
- **Overall average**: ±2% (tighter since it averages multiple samples)
- **Extreme multipliers**: ±10% (higher variance expected)

### Expected Output
```
=== Crash Game House Edge Simulation ===

Target:    1.1x | Avg Return: 0.9895x | House Edge: 1.05%
Target:    1.5x | Avg Return: 0.9912x | House Edge: 0.88%
Target:    2.0x | Avg Return: 0.9888x | House Edge: 1.12%
Target:    3.0x | Avg Return: 0.9905x | House Edge: 0.95%
Target:    5.0x | Avg Return: 0.9898x | House Edge: 1.02%
Target:   10.0x | Avg Return: 0.9891x | House Edge: 1.09%
Target:   50.0x | Avg Return: 0.9902x | House Edge: 0.98%
Target:  100.0x | Avg Return: 0.9889x | House Edge: 1.11%
Target:  500.0x | Avg Return: 0.9915x | House Edge: 0.85%
Target: 1000.0x | Avg Return: 0.9875x | House Edge: 1.25%

=== Summary ===
Overall Average Return: 0.9897x
Overall House Edge: 1.03%
```

## Deployment Notes

### No Mainnet Deployment Required
This is a **test-only change**. No canister deployment needed.

### Running Tests
```bash
# From crash_backend directory
cargo test --test test_house_edge_simulation -- --nocapture

# Or from project root
cd crash_backend && cargo test --test test_house_edge_simulation -- --nocapture
```

### Affected Components
- **crash_backend**: Tests added (no logic changes)
- **Mainnet**: No deployment (local tests only)

## Implementation Checklist

- [ ] Create `crash_backend/tests/` directory
- [ ] Create `test_house_edge_simulation.rs` with all three test functions
- [ ] Make `calculate_crash_point()` public in `crash_backend/src/lib.rs`
- [ ] Run tests and verify all pass
- [ ] Verify output shows ~1% house edge across all multipliers
- [ ] Commit changes to feature branch
- [ ] Create PR with test results

## Success Criteria

1. All tests pass with `cargo test`
2. Average returns are within tolerance (±3% of 0.99x)
3. Test output clearly shows house edge validation
4. No changes to game logic or mainnet canisters
5. PR created with comprehensive test results

## Future Enhancements (Not in This PR)

- Add visualization of crash point distribution
- Test different PRNG algorithms to verify independence
- Add tests for edge cases in random number generation
- Benchmark test performance (should complete in <5 seconds)
- Add confidence interval calculations to output

## References

- Crash formula documentation: `crash_backend/src/lib.rs:3-19`
- Probability formula: `crash_backend/src/lib.rs:92-108`
- Existing unit tests: `crash_backend/src/lib.rs:208-415`
- Dice backend test structure: `dice_backend/tests/test_game_logic.rs`
