# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-chips"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-chips`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): Replace slider betting with chip-based UI"
   git push -u origin feature/dice-chip-betting
   gh pr create --title "Dice: Chip-based betting UI" --body "Implements PLAN_DICE_CHIP_BETTING.md

Replaces the slider-based bet amount input with physical casino chip interface:
- Click chips to add to bet (stacked side-view display)
- Click pot to undo last chip (LIFO)
- Game balance shown as chip stack

Deployed to mainnet:
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
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- After sleep: IMMEDIATELY continue (no pause)
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/dice-chip-betting`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-chips`

---

# Implementation Plan: Dice Game Chip-Based Betting UI

## Overview
Replace the slider-based betting in the dice game with a physical casino chip interface using user-provided PNG images.

## Requirements Summary
- **Denominations**: 0.01, 0.1, 0.25, 1, 5, 10 USDT
- **Assets**: User provides PNGs in `public/chips/` (top-view + side-view per denomination)
- **Add chips**: Click chip button to add to pot
- **Remove chips**: Click pot to undo last chip (LIFO)
- **Balance display**: Stacked chips using side-view images
- **Bet display**: Stacked side-view chips
- **Scope**: Dice game only (can refactor for other games later)

## Expected Asset Structure
User will provide PNG images in `public/chips/` with top-view and side-view for each denomination.
The config file will use placeholder paths initially - update once images are added:
- 6 denominations: 0.01, 0.10, 0.25, 1.00, 5.00, 10.00 USDT
- 2 views per chip: top (for tray buttons) and side (for stacking)

---

## Step 1: Create Chip Config
**File**: `openhouse_frontend/src/components/game-specific/dice/chipConfig.ts` (NEW)

```typescript
// PSEUDOCODE
export interface ChipDenomination {
  value: number;      // 0.01, 0.10, etc.
  label: string;      // Display label
  topImg: string;     // Path to top-view PNG
  sideImg: string;    // Path to side-view PNG
}

export const CHIP_DENOMINATIONS: ChipDenomination[] = [
  { value: 0.01, label: '0.01', topImg: '/chips/TODO.png', sideImg: '/chips/TODO.png' },
  { value: 0.10, label: '0.10', topImg: '/chips/TODO.png', sideImg: '/chips/TODO.png' },
  { value: 0.25, label: '0.25', topImg: '/chips/TODO.png', sideImg: '/chips/TODO.png' },
  { value: 1.00, label: '1', topImg: '/chips/TODO.png', sideImg: '/chips/TODO.png' },
  { value: 5.00, label: '5', topImg: '/chips/TODO.png', sideImg: '/chips/TODO.png' },
  { value: 10.00, label: '10', topImg: '/chips/TODO.png', sideImg: '/chips/TODO.png' },
];
// ^ Update paths once user provides actual images

// Helper to decompose amount into chips (greedy algorithm, largest first)
export function decomposeIntoChips(amount: number): { chip: ChipDenomination; count: number }[] {
  // Sort denominations descending
  // For each denomination, divide remaining amount to get count
  // Return array of {chip, count}
}
```

---

## Step 2: Create ChipStack Component
**File**: `openhouse_frontend/src/components/game-specific/dice/ChipStack.tsx` (NEW)

Reusable component for rendering stacked chips using side-view images:

```typescript
// PSEUDOCODE
interface ChipStackProps {
  amount: number;           // Total value to display
  maxChipsShown?: number;   // Limit visual stack height (default: 10)
  onClick?: () => void;     // For bet pot click-to-remove
  label?: string;           // "Your Bet", "Balance", etc.
  showValue?: boolean;      // Show total amount text
}

export const ChipStack: React.FC<ChipStackProps> = (props) => {
  // Decompose amount into chips using helper
  // Render side-view images stacked vertically
  // Each chip offset slightly (e.g., -4px margin-top) to create stack effect
  // If more than maxChipsShown, show abbreviated stack + "..." indicator
  // onClick handler for pot removal
  // Optional label and value display below stack
}
```

---

## Step 3: Create ChipBetting Component
**File**: `openhouse_frontend/src/components/game-specific/dice/ChipBetting.tsx` (NEW)

Main betting interface component:

```typescript
// PSEUDOCODE
interface ChipBettingProps {
  betAmount: number;
  onBetChange: (amount: number) => void;
  gameBalance: bigint;      // For validation
  maxBet: number;
  disabled?: boolean;
}

export const ChipBetting: React.FC<ChipBettingProps> = (props) => {
  // State: chipHistory = number[] (tracks order chips were added for LIFO undo)

  // Handler: addChip(value)
  //   - Check if betAmount + value <= maxBet and <= gameBalance
  //   - If valid: push value to chipHistory, call onBetChange(betAmount + value)
  //   - If invalid: show visual feedback (shake, disable chip)

  // Handler: undoLastChip()
  //   - Pop last value from chipHistory
  //   - Call onBetChange(betAmount - poppedValue)

  // Render:
  //   1. Current bet display (ChipStack with onClick={undoLastChip})
  //   2. Chip tray: 6 buttons with top-view images
  //      - Each button shows chip image + value label
  //      - Disabled state when chip would exceed max/balance
  //      - Hover effect for clickability
}
```

---

## Step 4: Update DiceGame.tsx
**File**: `openhouse_frontend/src/pages/dice/DiceGame.tsx` (MODIFY)

Changes needed:

1. **Add import**:
```typescript
import { ChipBetting, ChipStack } from '../../components/game-specific/dice';
```

2. **Add chip history state** (around line 94):
```typescript
const [chipHistory, setChipHistory] = useState<number[]>([]);
```

3. **Replace BetAmountInput** (around line 442-451):
```typescript
// BEFORE:
<BetAmountInput
  value={betAmount}
  onChange={setBetAmount}
  min={0.01}
  max={maxBet}
  disabled={isPlaying}
  isPracticeMode={gameMode.isPracticeMode}
  error={betError}
  variant="slider"
/>

// AFTER:
<ChipBetting
  betAmount={betAmount}
  onBetChange={(amount) => {
    setBetAmount(amount);
    // Update chipHistory handled internally by ChipBetting
  }}
  gameBalance={balance.game}
  maxBet={maxBet}
  disabled={isPlaying}
/>
```

4. **Update balance display** (around line 388-391):
```typescript
// BEFORE:
<span className="text-gray-400">Game:</span>
<span className="font-mono font-bold text-blue-400">{formatUSDT(balance.game)}</span>

// AFTER:
<span className="text-gray-400">Game:</span>
<ChipStack
  amount={Number(balance.game) / 1_000_000}
  maxChipsShown={5}
  showValue={true}
/>
```

5. **Clear chip history on game end** (in rollDice success handler, around line 352):
```typescript
// After successful roll, clear history for next bet
setChipHistory([]);
```

---

## Step 5: Update Component Exports
**File**: `openhouse_frontend/src/components/game-specific/dice/index.ts` (MODIFY)

Add exports for new components:
```typescript
export * from './chipConfig';
export * from './ChipStack';
export * from './ChipBetting';
```

---

## UI Layout Reference

```
BALANCE BAR
+-------------+  +-------------+  +-------------+
| Wallet:     |  | Game:       |  | House:      |
| 50.00 USDT  |  | [CHIP STACK]|  | 1000 USDT   |
+-------------+  +-------------+  +-------------+

BETTING AREA

Your Bet:
+----------------------+
|    [CHIP STACK]      |  <- Click to remove last
|    $2.35 total       |
+----------------------+

Add Chips:
+----+ +----+ +----+ +----+ +----+ +----+
|.01 | |.10 | |.25 | | 1  | | 5  | | 10 |
| O  | | O  | | O  | | O  | | O  | | O  |
+----+ +----+ +----+ +----+ +----+ +----+
(top-view chip images)
```

---

## Files Summary

**Create (3 files):**
1. `openhouse_frontend/src/components/game-specific/dice/chipConfig.ts`
2. `openhouse_frontend/src/components/game-specific/dice/ChipStack.tsx`
3. `openhouse_frontend/src/components/game-specific/dice/ChipBetting.tsx`

**Modify (2 files):**
1. `openhouse_frontend/src/pages/dice/DiceGame.tsx`
2. `openhouse_frontend/src/components/game-specific/dice/index.ts`

---

## Edge Cases to Handle

1. **Bet exceeds max bet** - Disable chips that would push over limit
2. **Bet exceeds game balance** - Disable chips that would exceed balance
3. **Empty pot** - Click on empty pot does nothing
4. **Floating point precision** - Use cents internally (multiply by 100), display as dollars
5. **Very large bets** - Cap visual stack at ~10 chips, show total value

---

## User Action Required

User must provide chip PNG images in `openhouse_frontend/public/chips/` before full visual testing. Until then, use placeholder/fallback styling.

---

## Deployment

Frontend-only change:
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

No backend changes required.
