# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-simplified-odds"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-simplified-odds`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
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

   # Test new odds calculation
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai calculate_payout_info '(50 : nat8, variant { Over })'

   # Test exact hit scenario
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(dice): simplify odds to 0-100 with exact hit = house"
   git push -u origin feature/dice-simplified-odds
   gh pr create --title "Refactor: Simplify Dice Odds to Round Numbers" --body "Implements dice-simplified-odds-plan.md

Simplifies dice game mathematics:
- Roll 0-100 (101 outcomes)
- Exact hit = house wins (0.99% house edge)
- Clean round multipliers: 2x, 4x, 5x, 10x, 20x, 50x, 100x
- Better player odds: 0.99% edge vs 3% previously

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
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

**Branch:** `feature/dice-simplified-odds`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-simplified-odds`

---

# Implementation Plan

## Current State Documentation

### Affected Files
- `dice_backend/src/lib.rs` (lines 124, 315-363, 407-561, 682-711)

### Current Implementation Issues
1. **Complex house edge**: 3% baked into multiplier calculation (line 124, 336)
2. **Non-round multipliers**: 1.96x, 2.8x, 97.98x etc (lines 332-337)
3. **Complex win chance**: Uses 101 outcomes but doesn't leverage it (lines 315-330)
4. **Confusing max bet calculation**: Complex overflow handling (lines 340-363)

## Refactoring Plan (SUBTRACTIVE - Remove Complexity)

### 1. Update Constants - `dice_backend/src/lib.rs` (line 124)
```rust
// PSEUDOCODE - MODIFY existing constants
// DELETE: const HOUSE_EDGE: f64 = 0.03;  // No longer needed in calculations
const MIN_BET: u64 = 1_000_000; // Keep 0.01 ICP
const MAX_WIN: u64 = 10 * E8S_PER_ICP; // Keep 10 ICP max
const MAX_NUMBER: u8 = 100; // Keep same (0-100 roll)
```

### 2. Simplify Win Chance Calculation - `dice_backend/src/lib.rs` (lines 315-330)
```rust
// PSEUDOCODE - REPLACE entire function
fn calculate_win_chance(target: u8, direction: &RollDirection) -> f64 {
    // Count winning numbers (exact hit excluded automatically)
    let winning_numbers = match direction {
        RollDirection::Over => (MAX_NUMBER - target) as f64,  // e.g., target 50 → 100-50 = 50
        RollDirection::Under => target as f64,                // e.g., target 50 → 50
    };
    winning_numbers / 101.0  // Divide by total outcomes
}
```

### 3. Simplify Multiplier - `dice_backend/src/lib.rs` (lines 332-337)
```rust
// PSEUDOCODE - REPLACE entire function
fn calculate_multiplier(win_chance: f64) -> f64 {
    // DELETE all house edge calculations
    // Simple formula: 100 / winning_numbers
    if win_chance <= 0.0 {
        return 0.0;
    }
    // Convert win chance back to winning numbers and calculate
    let winning_numbers = (win_chance * 101.0).round();
    (100.0 / winning_numbers).min(100.0)  // Cap at 100x for safety
}

// OR BETTER - calculate directly from target:
fn calculate_multiplier_direct(target: u8, direction: &RollDirection) -> f64 {
    let winning_numbers = match direction {
        RollDirection::Over => (100 - target) as f64,
        RollDirection::Under => target as f64,
    };
    if winning_numbers == 0.0 {
        return 0.0;
    }
    100.0 / winning_numbers  // Clean round numbers!
}
```

### 4. Simplify Max Bet - `dice_backend/src/lib.rs` (lines 340-363)
```rust
// PSEUDOCODE - SIMPLIFY function
fn calculate_max_bet(target_number: u8, direction: &RollDirection) -> u64 {
    // DELETE complex overflow handling
    // Simple: MAX_WIN / multiplier
    let multiplier = calculate_multiplier_direct(target_number, direction);

    if multiplier <= 0.0 {
        return MIN_BET;
    }

    ((MAX_WIN as f64) / multiplier).floor() as u64
}
```

### 5. Add Exact Hit Check - `dice_backend/src/lib.rs` (lines 499-509)
```rust
// PSEUDOCODE - ADD exact hit detection in play_dice
// After rolling (line 497):
let (rolled_number, nonce, server_seed_hash) = generate_dice_roll_instant(&client_seed)?;

// NEW: Check for exact hit (house wins)
let is_exact_hit = rolled_number == target_number;

// Determine if player won (modified logic)
let is_win = if is_exact_hit {
    false  // House always wins on exact hit
} else {
    match direction {
        RollDirection::Over => rolled_number > target_number,
        RollDirection::Under => rolled_number < target_number,
    }
};

// Calculate payout
let payout = if is_win {
    let multiplier = calculate_multiplier_direct(target_number, &direction);
    (bet_amount as f64 * multiplier) as u64
} else {
    0
};
```

### 6. Update Result Struct (Optional) - `dice_backend/src/lib.rs` (line 136)
```rust
// PSEUDOCODE - ADD field to track house hits
pub struct DiceResult {
    // ... existing fields ...
    pub is_win: bool,
    pub timestamp: u64,
    #[serde(default)]
    pub is_house_hit: bool,  // NEW: Track when house wins on exact hit
    // ... verification fields ...
}
```

### 7. Update Validation - `dice_backend/src/lib.rs` (lines 443-470)
```rust
// PSEUDOCODE - SIMPLIFY validation
// DELETE complex win chance validation
// Keep simple range checks:
match direction {
    RollDirection::Over => {
        if target_number >= MAX_NUMBER {
            return Err("Target must be less than 100 for Over rolls".to_string());
        }
    }
    RollDirection::Under => {
        if target_number <= 0 {
            return Err("Target must be greater than 0 for Under rolls".to_string());
        }
    }
}
// DELETE win chance percentage checks (lines 467-469)
```

### 8. Update Query Functions - `dice_backend/src/lib.rs` (lines 682-705)
```rust
// PSEUDOCODE - UPDATE calculate_payout_info
fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
    // Validate
    // ... existing validation ...

    let win_chance = calculate_win_chance(target_number, &direction);
    let multiplier = calculate_multiplier_direct(target_number, &direction);
    Ok((win_chance, multiplier))
}

// UPDATE get_max_bet to use new calculation
fn get_max_bet(target_number: u8, direction: RollDirection) -> u64 {
    calculate_max_bet(target_number, &direction)
}
```

## Testing Checklist (Manual Verification)

After deployment, verify these scenarios work:
```bash
# Test 50/50 odds (should be exactly 2x)
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai calculate_payout_info '(50 : nat8, variant { Over })'
# Expected: ~49.5% win chance, 2.0x multiplier

# Test 10% odds (should be exactly 10x)
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai calculate_payout_info '(90 : nat8, variant { Over })'
# Expected: ~9.9% win chance, 10.0x multiplier

# Test 1% odds (should be exactly 100x)
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai calculate_payout_info '(99 : nat8, variant { Over })'
# Expected: ~0.99% win chance, 100.0x multiplier
```

## Summary

This refactoring:
- **REMOVES** complex house edge calculations (-15 lines)
- **SIMPLIFIES** multiplier to `100 / winning_numbers` (-20 lines)
- **ADDS** exact hit = house wins logic (+5 lines)
- **Net result**: Cleaner code, better odds for players (0.99% vs 3%), round multipliers
- **Affected canister**: dice_backend only
- **No frontend changes needed** (API stays same)

---

END OF PLAN