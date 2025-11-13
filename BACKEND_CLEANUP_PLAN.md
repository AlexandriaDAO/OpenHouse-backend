# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-backend-cleanup"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-backend-cleanup`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build all affected backends
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet (deploys all canisters - simplest approach)
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Check that builds succeed without warnings
   cargo build --target wasm32-unknown-unknown --release 2>&1 | grep -i "warning"

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor: remove dead code from backends and fix dice frontend types"
   git push -u origin feature/backend-cleanup
   gh pr create --title "refactor: Backend cleanup - remove dead code and fix dice types" --body "Implements BACKEND_CLEANUP_PLAN.md

## Changes
- Removed unused constants from Crash, Plinko, and Mines backends
- Removed unused calculate_multiplier function from Mines backend
- Regenerated TypeScript declarations for Dice backend to fix type mismatch

## Deployment
Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: crash_backend, plinko_backend, mines_backend, dice_backend

## Testing
- All backends build without warnings
- Frontend TypeScript compilation succeeds
- Dice game frontend now has correct type declarations"
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

**Branch:** `feature/backend-cleanup`
**Worktree:** `/home/theseus/alexandria/openhouse-backend-cleanup`

---

# Implementation Plan

## Current State Analysis

### Deployment Warnings Summary

From the latest deployment output, we have the following dead code warnings:

**Crash Backend (`crash_backend/src/lib.rs`):**
```
warning: constant `ROUND_DELAY_SECONDS` is never used
  --> crash_backend/src/lib.rs:19:7
```

**Plinko Backend (`plinko_backend/src/lib.rs`):**
```
warning: constant `HOUSE_EDGE` is never used
  --> plinko_backend/src/lib.rs:16:7

warning: constant `ROWS_8` is never used
  --> plinko_backend/src/lib.rs:19:7

warning: constant `ROWS_12` is never used
  --> plinko_backend/src/lib.rs:20:7

warning: constant `ROWS_16` is never used
  --> plinko_backend/src/lib.rs:21:7
```

**Mines Backend (`mines_backend/src/lib.rs`):**
```
warning: constant `HOUSE_EDGE` is never used
  --> mines_backend/src/lib.rs:16:7

warning: function `calculate_multiplier` is never used
  --> mines_backend/src/lib.rs:85:4
```

**Dice Backend:**
- ✅ No warnings - clean!

### Frontend TypeScript Error

**File:** `openhouse_frontend/src/pages/Dice.tsx:130`
```
error TS2554: Expected 3 arguments, but got 4.

130       const result = await actor.play_dice(betAmountE8s, targetNumber, directionVariant, clientSeed);
                                                                                             ~~~~~~~~~~
```

**Root Cause:** TypeScript declarations are out of sync with the actual Candid interface. The `dice_backend.did` file correctly defines 4 parameters, but the generated TypeScript declarations haven't been regenerated after the instant randomness feature was added.

### Affected Canisters
- **Crash Backend**: `fws6k-tyaaa-aaaap-qqc7q-cai`
- **Plinko Backend**: `weupr-2qaaa-aaaap-abl3q-cai`
- **Mines Backend**: `wvrcw-3aaaa-aaaah-arm4a-cai`
- **Dice Backend**: `whchi-hyaaa-aaaao-a4ruq-cai` (only TypeScript declarations affected)
- **Frontend**: `pezw3-laaaa-aaaal-qssoa-cai`

## Implementation Steps

### Step 1: Remove Dead Code from Crash Backend

**File:** `crash_backend/src/lib.rs`

**Line to Remove:** Line 19

```rust
// REMOVE THIS LINE:
const ROUND_DELAY_SECONDS: u64 = 10;
```

**Rationale:** This constant was defined but never referenced in the code. The round timing logic doesn't use it.

### Step 2: Remove Dead Code from Plinko Backend

**File:** `plinko_backend/src/lib.rs`

**Lines to Remove:** Lines 16, 19-21

```rust
// REMOVE THIS LINE:
const HOUSE_EDGE: f64 = 0.03; // 3% house edge

// REMOVE THESE LINES:
const ROWS_8: u8 = 8;
const ROWS_12: u8 = 12;
const ROWS_16: u8 = 16;
```

**Rationale:**
- `HOUSE_EDGE` is not used because the house edge is baked into the multiplier tables
- `ROWS_8`, `ROWS_12`, `ROWS_16` are not used; the code uses literal values `[8, 12, 16]` in validation and accepts `rows` as a parameter

### Step 3: Remove Dead Code from Mines Backend

**File:** `mines_backend/src/lib.rs`

**Lines to Remove:** Line 16 and lines 85-100

```rust
// REMOVE THIS LINE:
const HOUSE_EDGE: f64 = 0.03; // 3% house edge

// REMOVE THIS ENTIRE FUNCTION (lines 85-100):
fn calculate_multiplier(safe_tiles_revealed: usize, num_mines: u8) -> f64 {
    let total_tiles = GRID_SIZE as f64;
    let mines = num_mines as f64;
    let safe_tiles = total_tiles - mines;

    // Probability of each successful reveal
    let mut multiplier = 1.0;
    for i in 0..safe_tiles_revealed {
        let remaining_safe = safe_tiles - i as f64;
        let remaining_total = total_tiles - i as f64;
        let prob = remaining_safe / remaining_total;
        multiplier *= (1.0 - HOUSE_EDGE) / prob;
    }

    multiplier
}
```

**Rationale:** Both `HOUSE_EDGE` and `calculate_multiplier` are defined but never called. The mines game implementation is incomplete and these would be used when the "reveal tile" and "cash out" functionality is implemented. For now, they're just dead code.

### Step 4: Regenerate TypeScript Declarations for Dice Backend

**Approach:** Use `dfx generate` to regenerate TypeScript declarations from the Candid interface.

**Commands:**
```bash
# Generate declarations for dice_backend
dfx generate dice_backend

# Copy declarations to frontend
cp -r src/declarations/dice_backend openhouse_frontend/src/declarations/
```

**Expected Result:** The generated TypeScript declarations will match the Candid interface:
```typescript
// Expected signature in openhouse_frontend/src/declarations/dice_backend/dice_backend.did.d.ts
play_dice: (
  arg_0: bigint,
  arg_1: number,
  arg_2: RollDirection,
  arg_3: string
) => Promise<{ 'Ok' : DiceResult } | { 'Err' : string }>
```

### Step 5: Build and Verify

**Build all backends:**
```bash
cargo build --target wasm32-unknown-unknown --release
```

**Expected result:** No warnings about dead code

**Build frontend:**
```bash
cd openhouse_frontend
npm run build
```

**Expected result:** No TypeScript errors

### Step 6: Deploy to Mainnet

**Deploy all canisters:**
```bash
./deploy.sh
```

**Verify deployment:**
- Check that all canisters upgrade successfully
- Test dice game frontend at https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
- Verify TypeScript compilation succeeds

## Deployment Notes

**Affected Canisters:**
- Crash Backend: `fws6k-tyaaa-aaaap-qqc7q-cai` (code change)
- Plinko Backend: `weupr-2qaaa-aaaap-abl3q-cai` (code change)
- Mines Backend: `wvrcw-3aaaa-aaaah-arm4a-cai` (code change)
- Dice Backend: `whchi-hyaaa-aaaao-a4ruq-cai` (no code change, only declarations)
- Frontend: `pezw3-laaaa-aaaal-qssoa-cai` (updated declarations)

**Risk Assessment:** LOW
- All changes are purely code cleanup (removing unused code)
- No behavior changes to any game logic
- No changes to game state or data structures
- Frontend fix is only to sync type declarations with existing backend interface

## Testing Checklist

- [ ] Crash backend builds without warnings
- [ ] Plinko backend builds without warnings
- [ ] Mines backend builds without warnings
- [ ] Dice backend builds without warnings
- [ ] Frontend TypeScript compilation succeeds
- [ ] All canisters deploy successfully to mainnet
- [ ] Dice game frontend works correctly at https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

## Success Criteria

1. ✅ All Rust compilation warnings eliminated
2. ✅ Frontend TypeScript compilation succeeds
3. ✅ All canisters deployed to mainnet
4. ✅ Dice game frontend functional
5. ✅ PR created with proper description
