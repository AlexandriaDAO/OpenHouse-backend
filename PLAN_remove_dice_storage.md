# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-storage-cleanup"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-storage-cleanup`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build dice backend
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend
   cd openhouse_frontend && npm run build && cd ..

   # Deploy to mainnet
   ./deploy.sh --dice-only

   # Deploy frontend with updated declarations
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   # Test that game still works
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai play_dice '(10000 : nat64, 50 : nat8, variant { Over }, "test" : text)'

   # Verify old endpoints are gone (should fail)
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_stats  # Should error

   # Check live frontend
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): Remove game history storage outside defi_accounting

- Delete analytics.rs and all game history storage
- Remove GAME_HISTORY, GAME_STATS, ROTATION_HISTORY
- Simplify play_dice() to return MinimalGameResult
- Remove 6 query endpoints (get_stats, get_recent_games, etc.)
- Frontend now shows only current game result
- All statistics now via defi_accounting module

BREAKING CHANGE: Removes game-by-game history API. Historical aggregate stats preserved in defi_accounting.

Removes ~568 lines of code."

   git push -u origin feature/remove-dice-game-storage

   gh pr create --title "feat(dice): Remove game storage outside defi_accounting" --body "## Summary

Transforms dice_backend from a history-tracking system to a pure game engine.

## Changes

**Backend (~500 lines removed):**
- ❌ Deleted analytics.rs entirely
- ❌ Removed GAME_HISTORY, GAME_STATS, ROTATION_HISTORY storage
- ❌ Removed 6 query endpoints
- ✅ New MinimalGameResult return type (3 fields vs 14)
- ✅ All stats now via defi_accounting

**Frontend (~70 lines removed):**
- Shows only current game result
- Removed unused history state and CSV export
- Cleaner, simpler UI

## Deployment

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

## Breaking Changes

- ❌ Game-by-game history API removed
- ❌ Historical game data lost (one-time)
- ✅ Daily aggregate stats preserved in defi_accounting
- ✅ All financial data intact (balances, LP positions)

## Testing

- [x] play_dice() works and returns minimal result
- [x] Old endpoints removed and fail correctly
- [x] Frontend displays game results
- [x] defi_accounting stats still update
- [x] LP pool integration intact"
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

**Branch:** `feature/remove-dice-game-storage`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-storage-cleanup`

---

# Implementation Plan: Remove Game Storage Outside defi_accounting

## Objective

Transform dice_backend from a dual-purpose system (game engine + history tracker) into a pure game engine that delegates all statistics to defi_accounting.

**Philosophy**: Game backend plays games. defi_accounting tracks everything.

## Current State

### Storage Structures (TO BE REMOVED)
```rust
// dice_backend/src/game.rs (lines 16-26)
thread_local! {
    static GAME_STATS: RefCell<GameStats> = RefCell::new(GameStats::default());
    pub(crate) static GAME_HISTORY: RefCell<StableBTreeMap<u64, DiceResult, Memory>> = ...;
    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(0);
}

// dice_backend/src/seed.rs (lines 42-48)
thread_local! {
    static ROTATION_HISTORY: RefCell<StableBTreeMap<u64, SeedRotationRecord, Memory>> = ...;
    static NEXT_ROTATION_ID: RefCell<u64> = RefCell::new(0);
}
```

### Query Endpoints (TO BE REMOVED)
- `get_stats()` → Returns GameStats
- `get_recent_games(limit)` → Returns Vec<DiceResult>
- `get_game(game_id)` → Returns Option<DiceResult>
- `get_detailed_history(limit)` → Returns Vec<DetailedGameHistory>
- `export_history_csv(limit)` → Returns CSV string
- `get_rotation_history(limit)` → Returns seed rotation history

### Files Affected
- `dice_backend/src/analytics.rs` (77 lines) - DELETE ENTIRE FILE
- `dice_backend/src/game.rs` (343 lines) - MAJOR SIMPLIFICATION
- `dice_backend/src/seed.rs` (339 lines) - REMOVE ROTATION HISTORY
- `dice_backend/src/types.rs` (218 lines) - REMOVE MULTIPLE TYPES
- `dice_backend/src/lib.rs` (156 lines) - REMOVE ENDPOINTS
- `dice_backend/dice_backend.did` (130 lines) - UPDATE INTERFACE
- `openhouse_frontend/src/pages/dice/DiceGame.tsx` (620 lines) - SIMPLIFY UI

### Memory IDs Currently Used
- Memory ID 0: GAME_HISTORY (StableBTreeMap) ← WILL BECOME UNUSED
- Memory ID 1: SEED_CELL (StableCell) ← KEEP
- Memory ID 2: LAST_ROTATION_CELL (StableCell) ← KEEP
- Memory ID 3: ROTATION_HISTORY (StableBTreeMap) ← WILL BECOME UNUSED

## Implementation Steps

### Step 1: Delete analytics.rs
```bash
# PSEUDOCODE - Shell command
rm dice_backend/src/analytics.rs
```

### Step 2: Create New Minimal Result Type

```rust
// PSEUDOCODE
// dice_backend/src/types.rs - ADD THIS TYPE

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MinimalGameResult {
    pub rolled_number: u8,
    pub is_win: bool,
    pub payout: u64,
}
```

### Step 3: Remove Old Types from types.rs

```rust
// PSEUDOCODE
// dice_backend/src/types.rs - DELETE THESE TYPES

// DELETE: DiceResult struct (lines 89-109)
// DELETE: GameStats struct (lines 128-133)
// DELETE: DetailedGameHistory struct (lines 136-152)
// DELETE: SeedRotationRecord struct (lines 60-66)

// KEEP: RollDirection enum
// KEEP: RandomnessSeed struct
// KEEP: All ICRC-2 types
// KEEP: All constants
```

### Step 4: Simplify game.rs

```rust
// PSEUDOCODE
// dice_backend/src/game.rs

// DELETE: Lines 16-26 (thread-local storage)
// Remove GAME_STATS, GAME_HISTORY, NEXT_GAME_ID

// KEEP: Lines 32-64 (calculation functions)
// Keep calculate_win_chance(), calculate_multiplier_direct()

// MODIFY: play_dice() function (lines 70-286)
pub async fn play_dice(
    bet_amount: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String,
    caller: Principal
) -> Result<MinimalGameResult, String> {
    // KEEP: All validation logic (lines 78-166)
    // KEEP: Seed rotation check (line 169)
    // KEEP: Roll generation (line 174)
    // KEEP: Balance deduction (lines 180-182)
    // KEEP: Volume recording (line 185)

    // KEEP: Win/loss determination (lines 188-204)
    let is_house_hit = rolled_number == target_number;
    let is_win = if is_house_hit { false } else {
        match direction {
            RollDirection::Over => rolled_number > target_number,
            RollDirection::Under => rolled_number < target_number,
        }
    };

    let payout = if is_win {
        (bet_amount as f64 * multiplier) as u64
    } else {
        0
    };

    // DELETE: Lines 206-211 (game ID generation)
    // DELETE: Lines 213-229 (DiceResult construction)
    // DELETE: Lines 232-238 (GAME_STATS updates)
    // DELETE: Lines 240-243 (GAME_HISTORY.insert())

    // KEEP: Lines 245-283 (balance updates and LP pool logic)
    if is_win {
        // Same logic for pool check and payout
    } else {
        liquidity_pool::update_pool_on_loss(bet_amount);
    }

    // REPLACE RETURN VALUE:
    Ok(MinimalGameResult {
        rolled_number,
        is_win,
        payout,
    })
}

// DELETE: Lines 292-315 (query functions)
// Remove get_stats(), get_recent_games(), get_game()

// KEEP: Lines 317-335 (calculate_payout_info - UI helper)
// KEEP: Lines 337-343 (get_total_active_bets - LP system needs this)
```

### Step 5: Remove Rotation History from seed.rs

```rust
// PSEUDOCODE
// dice_backend/src/seed.rs

// DELETE: Lines 42-48 (rotation history storage)
// Remove ROTATION_HISTORY, NEXT_ROTATION_ID

// KEEP: SEED_STATE, SEED_CELL, LAST_ROTATION_CELL (Memory IDs 1 & 2)
// KEEP: All seed generation logic
// KEEP: Seed rotation scheduling logic

// MODIFY: rotate_seed_async() function
// Remove any code that records to ROTATION_HISTORY

// DELETE: Lines 330-339 (get_rotation_history function)
```

### Step 6: Update lib.rs

```rust
// PSEUDOCODE
// dice_backend/src/lib.rs

// DELETE: Line 14
// Remove: mod analytics;

// MODIFY: Line 20 (re-exports)
// OLD: pub use types::{RollDirection, DiceResult, GameStats, DetailedGameHistory, SeedRotationRecord};
// NEW: pub use types::{RollDirection, MinimalGameResult};

// MODIFY: Lines 74-76 (play_dice signature)
#[update]
async fn play_dice(
    bet_amount: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String
) -> Result<MinimalGameResult, String> {
    game::play_dice(bet_amount, target_number, direction, client_seed, ic_cdk::api::msg_caller()).await
}

// DELETE: Lines 79-80 (get_stats endpoint)
// DELETE: Lines 84-85 (get_recent_games endpoint)
// DELETE: Lines 89-90 (get_game endpoint)
// DELETE: Lines 94-95 (get_detailed_history endpoint)
// DELETE: Lines 99-100 (export_history_csv endpoint)
// DELETE: Lines 119-120 (get_rotation_history endpoint)

// KEEP: All other endpoints (seed management, defi_accounting, LP pool)
```

### Step 7: Update dice_backend.did

```candid
// PSEUDOCODE
// dice_backend/dice_backend.did

// ADD: New minimal result type
type MinimalGameResult = record {
  rolled_number: nat8;
  is_win: bool;
  payout: nat64;
};

// DELETE: DiceResult type (lines 6-17)
// DELETE: GameStats type (lines 19-24)
// DELETE: DetailedGameHistory type (lines 33-48)

// MODIFY: play_dice signature
play_dice: (nat64, nat8, RollDirection, text) -> (variant { Ok: MinimalGameResult; Err: text });

// DELETE: Query endpoints
// Remove: get_stats, get_recent_games, get_game
// Remove: get_detailed_history, export_history_csv
// Remove: get_rotation_history

// KEEP: All seed management queries
// KEEP: All defi_accounting queries
// KEEP: All LP pool queries
```

### Step 8: Simplify Frontend UI

```typescript
// PSEUDOCODE
// openhouse_frontend/src/pages/dice/DiceGame.tsx

// DELETE: Lines 41-56 (local DetailedGameHistory interface)

// DELETE: Lines 131-133 (unused state variables)
// Remove: detailedHistory, showDetailedView, csvExport state

// DELETE: Lines 408-417 (CSV export function)
// Remove: copyHistoryToCSV()

// DELETE: Lines 608-615 (CSV button UI)

// MODIFY: Game history display section
// OLD: Scrollable list of past games
// NEW: Show only the most recent roll result
//      Display: "Last Roll: {number} - {WIN/LOSS} - {payout} USDT"

// MODIFY: gameState type definition
interface GameState {
    currentRoll: {
        number: number;
        isWin: boolean;
        payout: number;
    } | null;
    // Remove history array
}

// MODIFY: After play_dice() call
const result = await diceBackend.play_dice(betAmount, targetNumber, direction, clientSeed);
if ('Ok' in result) {
    const gameResult = result.Ok;
    setGameState({
        currentRoll: {
            number: gameResult.rolled_number,
            isWin: gameResult.is_win,
            payout: Number(gameResult.payout),
        }
    });
}
```

## Deployment Strategy

### Phase 1: Backend Deployment
```bash
# Build dice backend
cargo build --target wasm32-unknown-unknown --release

# Deploy dice backend only
./deploy.sh --dice-only

# Verify deployment
dfx canister --network ic status whchi-hyaaa-aaaao-a4ruq-cai

# Test that game works with new minimal return
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai play_dice \
  '(10000 : nat64, 50 : nat8, variant { Over }, "test123" : text)'

# Verify old endpoints are gone (should error)
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_stats
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_recent_games '(10 : nat32)'
```

### Phase 2: Frontend Deployment
```bash
# Build frontend (declarations auto-update from new .did file)
cd openhouse_frontend
npm run build
cd ..

# Deploy frontend
./deploy.sh --frontend-only

# Verify live site
echo "Test at: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
```

## Testing Checklist

### Backend Tests
- [ ] `cargo test` passes
- [ ] play_dice() compiles with new return type
- [ ] Old query endpoints removed from lib.rs
- [ ] analytics.rs deleted
- [ ] DiceResult, GameStats types removed from types.rs
- [ ] MinimalGameResult added to types.rs

### Deployment Tests
- [ ] Dice backend deploys without errors
- [ ] play_dice() returns MinimalGameResult on mainnet
- [ ] Old endpoints fail with "method not found"
- [ ] Balance deduction still works
- [ ] Payout calculation correct
- [ ] LP pool integration intact

### Frontend Tests
- [ ] Frontend builds without errors
- [ ] Dice game page loads
- [ ] Can place bet successfully
- [ ] Current roll result displays
- [ ] Win/loss shows correctly
- [ ] Payout amount accurate
- [ ] No console errors

### Integration Tests
- [ ] Play 5 winning games in a row
- [ ] Play 5 losing games in a row
- [ ] Verify balance changes correctly
- [ ] Check defi_accounting stats still update
- [ ] Confirm LP pool reserves adjust
- [ ] Test with different bet amounts
- [ ] Test with different target numbers (Over/Under)

## Risk Assessment

**MEDIUM-HIGH RISK - Breaking API Change**

### Risks
1. **Permanent data loss**: All game-by-game history in GAME_HISTORY will be lost
2. **Breaking change**: Any external tools calling removed endpoints will break
3. **Frontend sync required**: Must deploy frontend immediately after backend
4. **Memory won't clean up**: Stable memory for Memory IDs 0 and 3 remains allocated

### Mitigations
1. **Single frontend**: Only OpenHouse frontend exists, controlled by us
2. **Financial data safe**: All balances, LP positions, aggregate stats in defi_accounting preserved
3. **Coordinated deployment**: Deploy backend first, test, then frontend
4. **Reversible**: Can revert from git (but data loss is permanent)

### Data Loss Impact
- ❌ Game-by-game records (lost forever)
- ❌ Individual roll verification history
- ✅ Daily aggregate statistics (preserved in defi_accounting)
- ✅ Pool performance metrics (preserved)
- ✅ User balances (preserved)
- ✅ LP positions (preserved)
- ✅ All financial data (intact)

## Success Criteria

1. **Backend simplification**: ~143 lines removed from game.rs, 77 from analytics.rs
2. **API cleanup**: 6 query endpoints removed
3. **Type simplification**: MinimalGameResult (3 fields) vs DiceResult (14 fields)
4. **Storage cleanup**: 2 StableBTreeMaps and 2 RefCells removed
5. **Frontend simplification**: ~70 lines removed, cleaner UI
6. **Functionality preserved**: Core game mechanics work identically
7. **Stats available**: All statistics via defi_accounting module
8. **No errors**: Clean deployment, no runtime errors

## Code Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| analytics.rs | 77 lines | 0 lines | -77 (deleted) |
| game.rs | 343 lines | ~200 lines | -143 |
| seed.rs | 339 lines | ~280 lines | -59 |
| types.rs | 218 lines | ~100 lines | -118 |
| lib.rs | 156 lines | ~100 lines | -56 |
| dice_backend.did | 130 lines | ~85 lines | -45 |
| DiceGame.tsx | 620 lines | ~550 lines | -70 |
| **TOTAL** | **1,883 lines** | **1,315 lines** | **-568 lines** |

## Post-Deployment Monitoring

1. **Canister cycles**: Monitor for unexpected usage spikes
2. **Error logs**: Check for any runtime errors
3. **defi_accounting stats**: Verify daily snapshots continue
4. **LP pool**: Confirm reserves update correctly
5. **User feedback**: Ensure simplified UX is acceptable

## Affected Canisters

- **Dice Backend**: `whchi-hyaaa-aaaao-a4ruq-cai` (MODIFIED)
- **Frontend**: `pezw3-laaaa-aaaal-qssoa-cai` (MODIFIED)

## Notes

- This is a **one-way transformation** - historical game data cannot be recovered
- Memory IDs 0 and 3 will remain allocated but unused (acceptable waste)
- Future games (Crash, Plinko, Mines) should follow this simplified architecture
- defi_accounting is the single source of truth for all statistics going forward
