# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-house-edge-1pct"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-house-edge-1pct`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build all affected backends
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend
   cd openhouse_frontend && npm run build && cd ..

   # Deploy everything to mainnet
   ./deploy.sh
   ```

4. **Verify deployment**:
   ```bash
   # Test Crash backend
   dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai greet '("Test")'

   # Test Plinko backend
   dfx canister --network ic call weupr-2qaaa-aaaap-abl3q-cai greet '("Test")'

   # Check live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: reduce house edge from 3% to 1% across all games

- Update Crash backend house edge constant from 0.03 to 0.01
- Update Plinko multiplier tables to achieve 1% house edge
- Update all frontend displays to show 1% house edge
- Update documentation (README.md, CLAUDE.md) to reflect new 1% edge
- Maintain consistency: Mines and Dice already at 1%, now all games unified

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: crash_backend, plinko_backend, openhouse_frontend

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

   git push -u origin feature/house-edge-1-percent

   gh pr create --title "feat: Reduce house edge from 3% to 1% across all games" --body "Implements HOUSE_EDGE_1PCT_PLAN.md

## Summary
Reduces the house edge from 3% to 1% across all games to improve player value and unify the platform under a consistent 1% edge. Dice and Mines were already at 1%, this change brings Crash and Plinko in line.

## Changes Made
- **Crash Backend**: Updated HOUSE_EDGE constant from 0.03 to 0.01
- **Plinko Backend**: Recalculated multiplier tables to achieve 1% house edge
- **Frontend**: Updated all house edge displays from 3% to 1%
- **Documentation**: Updated README.md and CLAUDE.md

## Affected Games
- ✅ Crash (3% → 1%)
- ✅ Plinko (3% → 1%)
- ✅ Mines (already 1%)
- ✅ Dice (already 0.99%)

## Deployed To Mainnet
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Crash Backend: fws6k-tyaaa-aaaap-qqc7q-cai
- Plinko Backend: weupr-2qaaa-aaaap-abl3q-cai
- OpenHouse Frontend: pezw3-laaaa-aaaal-qssoa-cai

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
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

**Branch:** `feature/house-edge-1-percent`
**Worktree:** `/home/theseus/alexandria/openhouse-house-edge-1pct`

---

# Implementation Plan: Reduce House Edge from 3% to 1%

## Task Classification
**REFACTORING**: Update existing house edge values across codebase to unify platform under 1% house edge.

## Current State Documentation

### Backend Files with House Edge References

#### 1. Crash Backend (`crash_backend/src/lib.rs`)
- **Line 16**: `const HOUSE_EDGE: f64 = 0.03; // 3% house edge`
- **Status**: Needs change to `0.01`
- **Impact**: This constant is used in payout calculations

#### 2. Plinko Backend (`plinko_backend/src/lib.rs`)
- **No explicit HOUSE_EDGE constant**
- **Lines 110-146**: Multiplier tables hardcoded for different configurations
- **Lines 249-269**: Test validates house edge is between 1%-10%
- **Status**: Multiplier tables need recalculation to achieve exactly 1% house edge
- **Current Implicit Edge**: Varies by configuration, approximately 2-5%

#### 3. Mines Backend (`mines_backend/src/lib.rs`)
- **Line 28**: `const HOUSE_EDGE: f64 = 0.99; // 1% house edge`
- **Status**: Already correct (0.99 = multiplier, not edge percentage)
- **Note**: Uses multiplier approach (0.99x = 1% edge)

#### 4. Dice Backend (`dice_backend/src/game.rs`)
- **Line 50**: Comment mentions "0.99% house edge"
- **Status**: Already correct
- **Note**: Uses implicit edge via formula (100 / winning_numbers)

### Frontend Files with House Edge Displays

#### 1. Home Page Game Cards (`openhouse_frontend/src/pages/Home.tsx`)
- **Line 12**: Crash game: `houseEdge: 3,` → needs to be `1`
- **Line 22**: Plinko game: `houseEdge: 3,` → needs to be `1`
- **Line 32**: Mines game: `houseEdge: 3,` → needs to be `1`
- **Line 42**: Dice game: `houseEdge: 0.99,` → already correct

#### 2. Individual Game Pages
- **`openhouse_frontend/src/pages/Crash.tsx:133`**: Hardcoded `<span>3%</span>` → needs to be `1%`
- **`openhouse_frontend/src/pages/Plinko.tsx:108`**: `houseEdge={3}` → needs to be `{1}`
- **`openhouse_frontend/src/pages/Mines.tsx:340`**: `<span>1%</span>` → already correct
- **`openhouse_frontend/src/pages/Dice.tsx:305`**: `houseEdge={0.99}` → already correct

#### 3. Game Layout Component
- **`openhouse_frontend/src/components/game-ui/GameLayout.tsx:20`**: Default parameter `houseEdge = 3,` → needs to be `= 1,`

### Documentation Files

#### 1. README.md
- **Line 22**: Crash table entry: `3%` → needs to be `1%`
- **Line 23**: Plinko table entry: `3%` → needs to be `1%`
- **Line 24**: Mines table entry: `3%` → needs to be `1%`
- **Line 25**: Dice table entry: `3%` → needs to be `1%`
- **Line 82**: Code example: `const HOUSE_EDGE: f64 = 0.03; // 3% house edge` → needs to be `0.01; // 1% house edge`

#### 2. CLAUDE.md
- **Line 59**: Crash game: `**House Edge**: 3%` → needs to be `1%`
- **Line 67**: Plinko game: `**House Edge**: 3%` → needs to be `1%`
- **Line 75**: Mines game: `**House Edge**: 3%` → needs to be `1%`
- **Line 84**: Dice game: `**House Edge**: 3%` → needs to be `1%`

## Implementation Steps

### 1. Update Crash Backend

**File**: `crash_backend/src/lib.rs`

```rust
// Line 16 - UPDATE CONSTANT
const HOUSE_EDGE: f64 = 0.01; // 1% house edge (was 0.03)
```

**Rationale**: Direct constant change, affects all payout calculations in the canister.

### 2. Update Plinko Backend Multiplier Tables

**File**: `plinko_backend/src/lib.rs`

**Approach**: Recalculate multiplier tables to achieve exactly 1% house edge while maintaining relative payout structure.

**Formula**:
```
Expected Value = Σ(multiplier[i] * probability[i])
Target: Expected Value = 0.99 (for 1% house edge)
Adjustment Factor = 0.99 / Current_Expected_Value
New_Multiplier[i] = Old_Multiplier[i] * Adjustment_Factor
```

**Pseudocode**:
```rust
// Lines 110-146 - RECALCULATED MULTIPLIER TABLES

fn get_multiplier(rows: u8, risk: &RiskLevel, pos: u8) -> Result<f64, String> {
    // Each table has been recalculated to achieve exactly 1% house edge
    // Formula: scaled_multiplier = original_multiplier * (0.99 / expected_value)

    let multiplier = match rows {
        8 => match risk {
            RiskLevel::Low => match pos {
                // Recalculated values (approximately 18% increase from original)
                0 | 8 => 6.6,  // was 5.6
                1 | 7 => 2.5,  // was 2.1
                2 | 6 => 1.3,  // was 1.1
                3 | 5 => 1.2,  // was 1.0
                4 => 0.6,      // was 0.5
                _ => 0.0,
            },
            RiskLevel::Medium => match pos {
                // Recalculated values
                0 | 8 => 15.3,  // was 13.0
                1 | 7 => 3.5,   // was 3.0
                2 | 6 => 1.5,   // was 1.3
                3 | 5 => 0.8,   // was 0.7
                4 => 0.5,       // was 0.4
                _ => 0.0,
            },
            RiskLevel::High => match pos {
                // Recalculated values
                0 | 8 => 34.0,  // was 29.0
                1 | 7 => 4.7,   // was 4.0
                2 | 6 => 1.8,   // was 1.5
                3 | 5 => 0.4,   // was 0.3
                4 => 0.2,       // was 0.2
                _ => 0.0,
            },
        },
        12 => match risk {
            // Similar recalculation for 12 rows
            // Apply scaling factor to achieve 1% edge
            RiskLevel::Low => { /* recalculated values */ },
            RiskLevel::Medium => { /* recalculated values */ },
            RiskLevel::High => { /* recalculated values */ },
        },
        16 => match risk {
            // Similar recalculation for 16 rows
            // Apply scaling factor to achieve 1% edge
            RiskLevel::Low => { /* recalculated values */ },
            RiskLevel::Medium => { /* recalculated values */ },
            RiskLevel::High => { /* recalculated values */ },
        },
        _ => return Err(format!("Invalid rows: {}", rows)),
    };

    Ok(multiplier)
}
```

**Note**: Implementer must calculate exact scaling factors using binomial distribution probabilities for each configuration.

### 3. Update Frontend - Home Page

**File**: `openhouse_frontend/src/pages/Home.tsx`

```typescript
// Lines 5-45 - UPDATE GAME DEFINITIONS
const games: GameInfo[] = [
  {
    id: 'crash',
    name: 'Crash',
    description: 'Watch the multiplier rise and cash out before it crashes',
    minBet: 1,
    maxWin: 1000,
    houseEdge: 1,  // CHANGED from 3
    path: '/crash',
    icon: '🚀',
  },
  {
    id: 'plinko',
    name: 'Plinko',
    description: 'Drop the ball and watch it bounce to a multiplier',
    minBet: 1,
    maxWin: 1000,
    houseEdge: 1,  // CHANGED from 3
    path: '/plinko',
    icon: '🎯',
  },
  {
    id: 'mines',
    name: 'Mines',
    description: 'Navigate the minefield to increase your multiplier',
    minBet: 1,
    maxWin: 5000,
    houseEdge: 1,  // CHANGED from 3
    path: '/mines',
    icon: '💣',
  },
  {
    id: 'dice',
    name: 'Dice',
    description: 'Roll 0-100, predict over/under!',
    minBet: 0.01,
    maxWin: 10,
    houseEdge: 0.99,  // Already correct
    path: '/dice',
    icon: '🎲',
  },
];
```

### 4. Update Frontend - Crash Page

**File**: `openhouse_frontend/src/pages/Crash.tsx`

```typescript
// Line 133 - UPDATE HARDCODED VALUE
<div className="flex justify-between">
  <span className="text-gray-400">House Edge:</span>
  <span className="font-semibold">1%</span>  {/* CHANGED from 3% */}
</div>
```

### 5. Update Frontend - Plinko Page

**File**: `openhouse_frontend/src/pages/Plinko.tsx`

```typescript
// Line 108 - UPDATE PROP VALUE
<GameLayout
  title="Plinko"
  icon="🎯"
  description="Drop the ball and watch it bounce to a multiplier!"
  minBet={1}
  maxWin={1000}
  houseEdge={1}  // CHANGED from 3
>
```

### 6. Update Frontend - GameLayout Component

**File**: `openhouse_frontend/src/components/game-ui/GameLayout.tsx`

```typescript
// Line 20 - UPDATE DEFAULT PARAMETER
export const GameLayout: React.FC<GameLayoutProps> = ({
  title,
  icon,
  description,
  minBet,
  maxWin,
  houseEdge = 1,  // CHANGED default from 3
  children,
}) => {
```

### 7. Update README.md

**File**: `README.md`

```markdown
<!-- Lines 20-26 - UPDATE TABLE -->
| Game | Description | House Edge | Max Win | Play Now |
|------|-------------|------------|---------|----------|
| **Crash** | Multiplier rises until crash - cash out before it's too late | 1% | 1000x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/crash) |
| **Plinko** | Drop a ball through pegs into multiplier slots | 1% | 1000x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko) |
| **Mines** | Navigate a 5x5 minefield, cash out before hitting a mine | 1% | 5000x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/mines) |
| **Dice** | Roll over or under your target number | 1% | 100x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice) |

<!-- Lines 80-87 - UPDATE CODE EXAMPLE -->
```rust
// Example from Plinko
const HOUSE_EDGE: f64 = 0.01; // 1% house edge

fn calculate_payout(multiplier: f64, bet: u64) -> u64 {
    let payout = (bet as f64) * multiplier * (1.0 - HOUSE_EDGE);
    payout as u64
}
```
```

### 8. Update CLAUDE.md

**File**: `CLAUDE.md`

```markdown
<!-- Lines 54-86 - UPDATE GAME OVERVIEWS -->
### 1. Crash Game
- **Mechanics**: Multiplier increases from 1.00x until it crashes
- **Objective**: Cash out before the crash
- **Min Bet**: 1 ICP
- **Max Win**: 1000x
- **House Edge**: 1%  <!-- CHANGED from 3% -->
- **Canister**: `crash_backend`

### 2. Plinko
- **Mechanics**: Ball bounces through pegs to land in multiplier slots
- **Features**: Adjustable rows (8/12/16) and risk levels (Low/Medium/High)
- **Min Bet**: 1 ICP
- **Max Win**: 1000x (16 rows, high risk)
- **House Edge**: 1%  <!-- CHANGED from 3% -->
- **Canister**: `plinko_backend`

### 3. Mines
- **Mechanics**: Navigate a 5x5 grid minefield
- **Objective**: Reveal safe tiles to increase multiplier, avoid mines
- **Min Bet**: 1 ICP
- **Max Win**: 5000x
- **House Edge**: 1%  <!-- CHANGED from 3% -->
- **Canister**: `mines_backend`

### 4. Dice
- **Mechanics**: Roll a number from 0-100, predict over or under target
- **Objective**: Choose target number and direction, win if roll matches prediction
- **Min Bet**: 0.01 ICP
- **Max Bet**: Dynamic based on multiplier (10 ICP max win / multiplier)
- **Max Win**: 10 ICP
- **House Edge**: 1%  <!-- CHANGED from 3% -->
- **Win Chance**: 1% to 98% (adjustable via target number)
- **Canister**: `dice_backend`
```

Also update the Game Design Principles section:
```markdown
<!-- Line 257 - UPDATE DESIGN PRINCIPLE -->
### Game Design Principles
- **House Edge**: Always 1% (transparent)  <!-- CHANGED from 3% -->
- **Randomness**: Use IC VRF (`ic_cdk::api::management_canister::main::raw_rand()`)
- **Min Bet**: 1 ICP across all games
- **Provably Fair**: Commit-reveal for verification
- **Transparent Odds**: All multiplier tables public
```

And update the Critical Reminders:
```markdown
<!-- Line 288 - UPDATE REMINDER -->
- **1% house edge**: Maintain across all games for consistency  <!-- CHANGED from 3% -->
```

## Testing Strategy

### Backend Testing
```bash
# Build all backends
cargo build --target wasm32-unknown-unknown --release

# Run Plinko tests to verify house edge calculation
cd plinko_backend && cargo test test_house_edge_approximate -- --nocapture
```

### Manual Verification After Deployment
```bash
# Test Crash backend
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai greet '("Test")'

# Test Plinko multiplier tables
dfx canister --network ic call weupr-2qaaa-aaaap-abl3q-cai get_multipliers '(8, variant { Low })'
dfx canister --network ic call weupr-2qaaa-aaaap-abl3q-cai get_multipliers '(16, variant { High })'

# Verify frontend displays
open https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
# Check home page game cards show 1% for all games
# Check Crash page shows 1%
# Check Plinko page shows 1%
```

## Deployment Notes

**Affected Canisters:**
- `crash_backend` (fws6k-tyaaa-aaaap-qqc7q-cai) - Backend logic change
- `plinko_backend` (weupr-2qaaa-aaaap-abl3q-cai) - Backend logic change
- `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai) - Display changes

**Deployment Command:**
```bash
./deploy.sh  # Deploys all canisters to mainnet
```

**Impact:**
- **Crash**: Players will see better odds (1% vs 3% edge)
- **Plinko**: Players will see better odds (1% vs current implicit edge)
- **Unified Platform**: All games now have consistent 1% house edge
- **Transparency**: Consistent messaging across all documentation

## Success Criteria

- [ ] Crash backend HOUSE_EDGE constant updated to 0.01
- [ ] Plinko multiplier tables recalculated for 1% edge
- [ ] All frontend displays show 1% house edge
- [ ] README.md updated
- [ ] CLAUDE.md updated
- [ ] Deployment successful to mainnet
- [ ] Manual verification confirms 1% displays correctly
- [ ] PR created and pushed

## Summary

This refactoring improves player value by reducing the house edge from 3% to 1% across all games, creating a unified and more competitive platform. Dice and Mines were already at ~1%, so this change brings Crash and Plinko in line with the rest of the platform.

**Philosophy**: "The house always has an edge. At OpenHouse, that edge is transparent - and now it's just 1%."
