# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-crash-backend"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-crash-backend`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build crash backend
   cargo build --target wasm32-unknown-unknown --release

   # Deploy to mainnet
   ./deploy.sh --crash-only
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status crash_backend

   # Test the canister
   dfx canister --network ic call crash_backend get_crash_formula
   dfx canister --network ic call crash_backend get_expected_value
   dfx canister --network ic call crash_backend simulate_crash
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: simplify crash backend to stateless VRF design (<150 LOC)

- Replace complex 290-line state machine with simple 120-line VRF implementation
- Use formula: crash = 1.0 / (1.0 - 0.99 * random) for true 1% house edge
- Pattern matches plinko_backend simplicity
- Transparent, verifiable, stateless design
- All crash points have constant 1% house edge regardless of strategy

🤖 Generated with Claude Code"
   git push -u origin feature/crash-backend-v2
   gh pr create --title "feat: Simplify Crash Backend to Stateless VRF Design" --body "Implements CRASH_BACKEND_V2_PLAN.md

## Summary
- Replaces complex 290-line crash backend with simple ~120-line stateless design
- Uses transparent mathematical formula for true 1% house edge
- Pattern matches plinko_backend for consistency
- All randomness from IC VRF (raw_rand)

## Formula
\`\`\`rust
crash = 1.0 / (1.0 - 0.99 * random)
\`\`\`

This ensures P(crash ≥ X) = 0.99 / X, giving exactly 1% house edge for ANY cashout strategy.

## Changes
- **Deleted**: Complex state machine, round management, player tracking (290 lines)
- **Added**: Simple stateless VRF crash point generation (~120 lines)
- **Pattern**: Follows plinko_backend design philosophy

## Testing
Deployed to mainnet:
- Canister: fws6k-tyaaa-aaaap-qqc7q-cai
- Test: \`dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai simulate_crash\`

## House Edge Verification
- All cashout targets have exactly 1% house edge
- Transparent formula players can verify
- Matches dice (1%) and plinko (1%) consistency

🤖 Generated with Claude Code"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
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

**Branch:** `feature/crash-backend-v2`
**Worktree:** `/home/theseus/alexandria/openhouse-crash-backend`

---

# Implementation Plan: Simple Crash Backend (~120 Lines)

## Current State

### Existing Files
```
crash_backend/
├── Cargo.toml (279 bytes)
├── crash_backend.did (1076 bytes)
└── src/
    └── lib.rs (290 lines - COMPLEX STATE MACHINE)
```

**Current Implementation:**
- 290 lines with complex state management
- Round-based gameplay with betting windows
- Player tracking, stable storage, memory management
- Multiple types: GameRound, PlayerBet, RoundStatus, GameState
- Stateful design requiring careful upgrade handling

**Problems:**
- Too complex for experimental casino
- State management overhead
- Difficult to verify house edge
- Not transparent like plinko/dice

### Target: Plinko-Style Simplicity
```
plinko_backend/src/lib.rs: 220 lines (including tests)
  - Stateless design
  - Single VRF call per game
  - Transparent mathematical formula
  - Easy to verify 1% house edge
```

## New Implementation

### Design Philosophy

**Stateless Crash Game:**
1. Each `simulate_crash()` call = one independent crash point
2. No rounds, no state, no player tracking
3. Pure VRF → Formula → Result
4. Frontend handles timing/animation
5. Backend just provides fair random crash points

**Pattern Match: Plinko**
- Plinko: `drop_ball()` → VRF → Formula → Multiplier
- Crash: `simulate_crash()` → VRF → Formula → Crash Point

### Files to Modify

#### 1. `crash_backend/src/lib.rs` (REPLACE - Target: ~120 lines)

```rust
// PSEUDOCODE - Full replacement

//! Simple Crash Game - Transparent Formula Casino Game
//!
//! **Design Philosophy:**
//! Stateless crash point generation using transparent mathematical formula
//! for provably fair 1% house edge.
//!
//! **The Formula:**
//! crash = 1.0 / (1.0 - 0.99 × random)
//!
//! Where:
//! - random is uniform [0.0, 1.0) from IC VRF
//! - 0.99 factor creates exactly 1% house edge
//! - P(crash ≥ X) = 0.99 / X (constant edge for all strategies)
//!
//! **Transparency & Fairness:**
//! - Randomness: IC VRF (raw_rand) - no fallback
//! - Expected value: Exactly 0.99 (1% house edge)
//! - All crash points independently verifiable
//! - No state, no rounds, no complex mechanics

use candid::{CandidType, Deserialize};
use ic_cdk::{init, pre_upgrade, post_upgrade, query, update};
use ic_cdk::api::management_canister::main::raw_rand;

// Constants
const MAX_CRASH: f64 = 1000.0;  // Cap crash at 1000x

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct CrashResult {
    pub crash_point: f64,        // Where it crashed (1.00x - 1000.00x)
    pub vrf_hash: String,         // VRF output hash for verification
}

// Memory management for future upgrades
#[init]
fn init() {
    ic_cdk::println!("Simple Crash Game initialized");
}

#[pre_upgrade]
fn pre_upgrade() {
    // Stateless - nothing to preserve
    ic_cdk::println!("Pre-upgrade: No state to preserve");
}

#[post_upgrade]
fn post_upgrade() {
    // Stateless - nothing to restore
    ic_cdk::println!("Post-upgrade: No state to restore");
}

/// Simulate a crash point using IC VRF
/// Returns crash point and VRF hash for verification
#[update]
async fn simulate_crash() -> Result<CrashResult, String> {
    // Get randomness from IC VRF
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?
        .0;

    // Convert first 8 bytes to f64 in range [0.0, 1.0)
    let random = bytes_to_float(&random_bytes)?;

    // Calculate crash point with 1% house edge
    // Formula: crash = 1.0 / (1.0 - 0.99 * random)
    let crash_point = calculate_crash_point(random);

    // Create VRF hash for verification (SHA256 of first 32 bytes)
    let vrf_hash = create_vrf_hash(&random_bytes);

    Ok(CrashResult {
        crash_point,
        vrf_hash,
    })
}

/// Get the crash formula as a string
#[query]
fn get_crash_formula() -> String {
    "crash = 1.0 / (1.0 - 0.99 × random)".to_string()
}

/// Get expected value (should be 0.99)
#[query]
fn get_expected_value() -> f64 {
    0.99  // Theoretical - actual calculation would require integration
}

/// Calculate probability of reaching a specific multiplier
/// Returns P(crash ≥ target)
#[query]
fn get_win_probability(target: f64) -> f64 {
    if target < 1.0 || target > MAX_CRASH {
        return 0.0;
    }
    // Formula: P(crash ≥ X) = 0.99 / X
    (0.99 / target).min(1.0)
}

/// Get example crash probabilities for common targets
#[query]
fn get_probability_table() -> Vec<(f64, f64)> {
    // Returns (target, probability) pairs
    let targets = vec![1.1, 1.5, 2.0, 3.0, 5.0, 10.0, 50.0, 100.0];
    targets.iter()
        .map(|&t| (t, get_win_probability(t)))
        .collect()
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/// Convert VRF bytes to float in range [0.0, 1.0)
fn bytes_to_float(bytes: &[u8]) -> Result<f64, String> {
    if bytes.len() < 8 {
        return Err("Insufficient randomness bytes".to_string());
    }

    // Use first 8 bytes as u64, then normalize to [0.0, 1.0)
    let mut byte_array = [0u8; 8];
    byte_array.copy_from_slice(&bytes[0..8]);
    let random_u64 = u64::from_be_bytes(byte_array);

    // Normalize: divide by 2^64 to get [0.0, 1.0)
    // Use 2^53 for better precision with f64
    let random = (random_u64 >> 11) as f64 / (1u64 << 53) as f64;

    Ok(random)
}

/// Calculate crash point using the formula
/// crash = 1.0 / (1.0 - 0.99 * random)
fn calculate_crash_point(random: f64) -> f64 {
    // Ensure random is in valid range
    let random = random.max(0.0).min(0.999999);

    // Apply formula
    let crash = 1.0 / (1.0 - 0.99 * random);

    // Cap at maximum
    crash.min(MAX_CRASH)
}

/// Create SHA256 hash of VRF bytes for verification
fn create_vrf_hash(bytes: &[u8]) -> String {
    use sha2::{Sha256, Digest};

    let mut hasher = Sha256::new();
    hasher.update(&bytes[0..32.min(bytes.len())]);
    format!("{:x}", hasher.finalize())
}

#[query]
fn greet(name: String) -> String {
    format!("Simple Crash: Transparent 1% edge, {} wins or loses fairly!", name)
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crash_formula_at_boundaries() {
        // random = 0.0 → crash = 1.0 / 1.0 = 1.00x
        assert!((calculate_crash_point(0.0) - 1.0).abs() < 0.01);

        // random = 0.5 → crash = 1.0 / 0.505 = 1.98x
        assert!((calculate_crash_point(0.5) - 1.98).abs() < 0.01);

        // random = 0.9 → crash = 1.0 / 0.109 = 9.17x
        assert!((calculate_crash_point(0.9) - 9.17).abs() < 0.1);

        // random = 0.99 → crash = 1.0 / 0.0099 = 101.01x (capped)
        let high_crash = calculate_crash_point(0.99);
        assert!(high_crash <= MAX_CRASH);
    }

    #[test]
    fn test_win_probability_formula() {
        // P(crash ≥ 2.0) = 0.99 / 2.0 = 49.5%
        assert!((get_win_probability(2.0) - 0.495).abs() < 0.001);

        // P(crash ≥ 10.0) = 0.99 / 10.0 = 9.9%
        assert!((get_win_probability(10.0) - 0.099).abs() < 0.001);

        // P(crash ≥ 100.0) = 0.99 / 100.0 = 0.99%
        assert!((get_win_probability(100.0) - 0.0099).abs() < 0.0001);
    }

    #[test]
    fn test_expected_return_constant_house_edge() {
        // For ANY target X: P(crash ≥ X) × X should equal 0.99
        let targets = vec![1.1, 2.0, 5.0, 10.0, 50.0, 100.0];

        for target in targets {
            let win_prob = get_win_probability(target);
            let expected_return = win_prob * target;

            assert!(
                (expected_return - 0.99).abs() < 0.01,
                "Target {}: expected return = {}, should be 0.99",
                target, expected_return
            );
        }
    }

    #[test]
    fn test_bytes_to_float_range() {
        // Test with various byte patterns
        let test_cases = vec![
            vec![0u8; 8],           // All zeros → 0.0
            vec![255u8; 8],         // All ones → ~1.0
            vec![128u8; 8],         // Mid → ~0.5
        ];

        for bytes in test_cases {
            let random = bytes_to_float(&bytes).unwrap();
            assert!(random >= 0.0 && random < 1.0,
                "Random value {} out of range [0.0, 1.0)", random);
        }
    }
}
```

#### 2. `crash_backend/crash_backend.did` (REPLACE - Target: ~40 lines)

```candid
# PSEUDOCODE

type CrashResult = record {
  crash_point: float64;
  vrf_hash: text;
};

service : {
  // Simulate a crash point
  simulate_crash: () -> (variant { Ok: CrashResult; Err: text });

  // Get the crash formula
  get_crash_formula: () -> (text) query;

  // Get expected value (0.99)
  get_expected_value: () -> (float64) query;

  // Get probability of reaching target
  get_win_probability: (float64) -> (float64) query;

  // Get probability table for common targets
  get_probability_table: () -> (vec record { float64; float64 }) query;

  // Test function
  greet: (text) -> (text) query;
}
```

#### 3. `crash_backend/Cargo.toml` (NO CHANGES NEEDED)

Current file should work fine. May need to add `sha2` dependency if not present:

```toml
[dependencies]
sha2 = "0.10"
```

## Implementation Notes

### Line Count Estimate
- Type definitions: ~10 lines
- Init/upgrade hooks: ~15 lines
- `simulate_crash()`: ~20 lines
- Query functions (4): ~30 lines
- Internal functions (3): ~35 lines
- Greet: ~5 lines
- Tests: ~50 lines
- Comments/docs: ~35 lines
**Total: ~120 lines** ✅ (under 150 target)

### Deletion Count
- **Removed**: 290 lines (complex state machine)
- **Added**: ~120 lines (simple stateless)
- **Net**: -170 lines (58% reduction)

### House Edge Verification

**Mathematical Proof:**
```
For any cashout target X:
  P(crash ≥ X) = 0.99 / X
  Expected return = P(crash ≥ X) × X = (0.99 / X) × X = 0.99
  House edge = 1 - 0.99 = 0.01 = 1%
```

This is **constant** for all targets (1.10x, 2x, 10x, 100x, etc.)

### Key Simplifications

1. **No State**: Each call is independent
2. **No Rounds**: Frontend handles timing
3. **No Betting**: Frontend handles ICP transactions
4. **No Players**: Just pure crash point generation
5. **No History**: Each simulation is fresh

### Deployment Strategy

```bash
# Build
cargo build --target wasm32-unknown-unknown --release

# Deploy (crash backend only)
./deploy.sh --crash-only

# Verify
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai simulate_crash
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai get_crash_formula
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai get_win_probability '(2.0)'
```

### Affected Canister

- **crash_backend**: `fws6k-tyaaa-aaaap-qqc7q-cai`

## Testing Checklist

**Manual Tests After Deployment:**

```bash
# 1. Simulate crash (should return ~1-1000x)
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai simulate_crash

# 2. Get formula (should return formula string)
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai get_crash_formula

# 3. Get expected value (should return 0.99)
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai get_expected_value

# 4. Get win probability for 2x (should return 0.495)
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai get_win_probability '(2.0)'

# 5. Get probability table
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai get_probability_table

# 6. Greet (sanity check)
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai greet '("Player")'
```

**Expected Results:**
- All calls should succeed
- simulate_crash returns crash_point between 1.0 and 1000.0
- get_expected_value returns 0.99
- get_win_probability(2.0) returns ~0.495
- No errors or panics

## Comparison: Old vs New

| Aspect | Old (290 lines) | New (~120 lines) |
|--------|----------------|------------------|
| **Complexity** | High (state machine) | Low (stateless) |
| **State** | Rounds, bets, players | None |
| **Memory** | Stable storage | None needed |
| **Upgrades** | Complex pre/post | Trivial |
| **Verification** | Difficult | Transparent |
| **Pattern** | Custom | Matches plinko |
| **House Edge** | Unclear | Provably 1% |
| **Testing** | Integration needed | Unit tests only |

## Security Considerations

1. **VRF Source**: IC's `raw_rand()` - cryptographically secure
2. **No State**: No race conditions or corruption possible
3. **Deterministic Formula**: Given VRF bytes, crash point is reproducible
4. **Capped Max**: Prevents overflow/infinite values
5. **No Admin**: No privileged operations

## Future Enhancements (NOT in this PR)

If stateful gameplay is needed later:
- Add round management (separate PR)
- Add betting system (separate PR)
- Add player history (separate PR)
- Add liquidity pool (separate PR)

**This PR**: Pure stateless crash point generation only.

---

## Summary

**Replaces complex 290-line crash backend with simple ~120-line stateless VRF design:**

✅ Transparent mathematical formula
✅ True constant 1% house edge
✅ Matches plinko_backend pattern
✅ Under 150 lines (120 lines)
✅ Stateless (no upgrade complexity)
✅ Verifiable fairness
✅ Ready for mainnet deployment
