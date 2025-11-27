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
   git commit -m "feat(dice): Replace slider betting with chip-based UI

   - 5 ICP-themed chip denominations (0.01 to 10 USDT)
   - Click chips to add to bet, click pot to undo
   - Auto-consolidation (10 whites → 1 red, etc.)
   - Visual chip stacking with side-view images"
   git push -u origin feature/dice-chip-betting
   gh pr create --title "Dice: Chip-based betting UI with auto-consolidation" --body "$(cat <<'EOF'
## Summary
Replaces the slider-based bet amount input with physical casino chip interface:
- 5 ICP-themed chip colors mapped to denominations
- Click chips to add to bet (stacked side-view display)
- Click pot to undo last chip (LIFO)
- Auto-consolidation: 10 smaller chips → 1 larger chip
- Game balance shown as chip stack

## Chip Denominations
| Color | Value | Consolidation |
|-------|-------|---------------|
| White | 0.01 USDT | 10 → 1 Red |
| Red | 0.10 USDT | 10 → 1 Blue |
| Blue | 1.00 USDT | 5 → 1 Green |
| Green | 5.00 USDT | 2 → 1 Black |
| Black | 10.00 USDT | (highest) |

## Test Plan
- [ ] Click each chip type to add to bet
- [ ] Verify auto-consolidation triggers correctly
- [ ] Click pot to undo chips in LIFO order
- [ ] Place bet and verify game works
- [ ] Check balance displays as chip stack

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
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

**Branch:** `feature/dice-chip-betting`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-chips`

---

# Implementation Plan: Dice Game Chip-Based Betting UI

## Overview
Replace the slider-based betting in the dice game with a physical casino chip interface using custom ICP-themed PNG images. Features auto-consolidation to keep chip stacks manageable.

## Asset Structure (ALREADY IN PLACE)
```
openhouse_frontend/public/chips/
├── white_top.png    # 0.01 USDT - top view (for tray buttons)
├── white_side.png   # 0.01 USDT - side view (for stacking)
├── red_top.png      # 0.10 USDT
├── red_side.png
├── blue_top.png     # 1.00 USDT
├── blue_side.png
├── green_top.png    # 5.00 USDT
├── green_side.png
├── black_top.png    # 10.00 USDT
└── black_side.png
```

## Chip Denomination System

| Color | Value (USDT) | Label | Consolidation Rule |
|-------|--------------|-------|-------------------|
| White | 0.01 | "0.01" | 10 white → 1 red |
| Red | 0.10 | "0.10" | 10 red → 1 blue |
| Blue | 1.00 | "1" | 5 blue → 1 green |
| Green | 5.00 | "5" | 2 green → 1 black |
| Black | 10.00 | "10" | (highest denomination) |

**Rationale**: Clean decimal ratios enable automatic consolidation without awkward remainders.

---

## Step 1: Create Chip Config
**File**: `openhouse_frontend/src/components/game-specific/dice/chipConfig.ts` (NEW)

```typescript
// REAL CODE - implement exactly as shown

export interface ChipDenomination {
  value: number;
  label: string;
  color: string;
  topImg: string;
  sideImg: string;
  consolidateAt: number;  // How many of this chip triggers consolidation to next tier
}

export const CHIP_DENOMINATIONS: ChipDenomination[] = [
  {
    value: 0.01,
    label: '0.01',
    color: 'white',
    topImg: '/chips/white_top.png',
    sideImg: '/chips/white_side.png',
    consolidateAt: 10  // 10 white = 1 red
  },
  {
    value: 0.10,
    label: '0.10',
    color: 'red',
    topImg: '/chips/red_top.png',
    sideImg: '/chips/red_side.png',
    consolidateAt: 10  // 10 red = 1 blue
  },
  {
    value: 1.00,
    label: '1',
    color: 'blue',
    topImg: '/chips/blue_top.png',
    sideImg: '/chips/blue_side.png',
    consolidateAt: 5   // 5 blue = 1 green
  },
  {
    value: 5.00,
    label: '5',
    color: 'green',
    topImg: '/chips/green_top.png',
    sideImg: '/chips/green_side.png',
    consolidateAt: 2   // 2 green = 1 black
  },
  {
    value: 10.00,
    label: '10',
    color: 'black',
    topImg: '/chips/black_top.png',
    sideImg: '/chips/black_side.png',
    consolidateAt: Infinity  // Never consolidates (highest)
  },
];

// Get chip by color
export function getChipByColor(color: string): ChipDenomination | undefined {
  return CHIP_DENOMINATIONS.find(c => c.color === color);
}

// Get chip by value
export function getChipByValue(value: number): ChipDenomination | undefined {
  return CHIP_DENOMINATIONS.find(c => Math.abs(c.value - value) < 0.001);
}

// Get next higher denomination
export function getNextHigherChip(chip: ChipDenomination): ChipDenomination | undefined {
  const idx = CHIP_DENOMINATIONS.findIndex(c => c.color === chip.color);
  return idx < CHIP_DENOMINATIONS.length - 1 ? CHIP_DENOMINATIONS[idx + 1] : undefined;
}

/**
 * Decompose a total amount into optimal chip counts.
 * Uses greedy algorithm: largest chips first.
 * Returns array of {chip, count} sorted largest to smallest.
 */
export function decomposeIntoChips(amount: number): { chip: ChipDenomination; count: number }[] {
  const result: { chip: ChipDenomination; count: number }[] = [];
  let remaining = Math.round(amount * 100) / 100; // Fix floating point

  // Process from highest to lowest denomination
  for (let i = CHIP_DENOMINATIONS.length - 1; i >= 0; i--) {
    const chip = CHIP_DENOMINATIONS[i];
    const count = Math.floor(remaining / chip.value);
    if (count > 0) {
      result.push({ chip, count });
      remaining = Math.round((remaining - count * chip.value) * 100) / 100;
    }
  }

  return result;
}

/**
 * Convert chip counts to a flat array of chip values for stacking display.
 * Limits total chips shown to maxChips.
 */
export function chipCountsToArray(
  chipCounts: { chip: ChipDenomination; count: number }[],
  maxChips: number = 15
): ChipDenomination[] {
  const chips: ChipDenomination[] = [];

  for (const { chip, count } of chipCounts) {
    for (let i = 0; i < count && chips.length < maxChips; i++) {
      chips.push(chip);
    }
  }

  return chips;
}
```

---

## Step 2: Create ChipStack Component
**File**: `openhouse_frontend/src/components/game-specific/dice/ChipStack.tsx` (NEW)

```typescript
// REAL CODE - implement exactly as shown

import React from 'react';
import { ChipDenomination, decomposeIntoChips, chipCountsToArray } from './chipConfig';

interface ChipStackProps {
  amount: number;
  maxChipsShown?: number;
  onClick?: () => void;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ChipStack: React.FC<ChipStackProps> = ({
  amount,
  maxChipsShown = 10,
  onClick,
  showValue = true,
  size = 'md',
  className = '',
}) => {
  const chipCounts = decomposeIntoChips(amount);
  const chipsToShow = chipCountsToArray(chipCounts, maxChipsShown);
  const totalChipCount = chipCounts.reduce((sum, { count }) => sum + count, 0);
  const hasMore = totalChipCount > maxChipsShown;

  // Size configurations
  const sizeConfig = {
    sm: { width: 40, height: 20, offset: -14 },
    md: { width: 60, height: 30, offset: -20 },
    lg: { width: 80, height: 40, offset: -28 },
  };
  const { width, height, offset } = sizeConfig[size];

  if (amount <= 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center ${className}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default', minHeight: height + 20 }}
      >
        <div className="text-gray-500 text-xs italic">No chips</div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Chip stack - side view images stacked vertically */}
      <div
        className="relative"
        style={{
          height: height + (chipsToShow.length - 1) * Math.abs(offset) + 10,
          width: width + 20,
        }}
      >
        {chipsToShow.map((chip, index) => (
          <img
            key={index}
            src={chip.sideImg}
            alt={`${chip.color} chip`}
            className="absolute left-1/2 transform -translate-x-1/2 drop-shadow-md transition-transform hover:scale-105"
            style={{
              width,
              height: 'auto',
              bottom: index * Math.abs(offset),
              zIndex: index,
            }}
          />
        ))}

        {/* "More" indicator if truncated */}
        {hasMore && (
          <div
            className="absolute -top-2 -right-2 bg-dfinity-turquoise text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
            style={{ zIndex: chipsToShow.length + 1 }}
          >
            +{totalChipCount - maxChipsShown}
          </div>
        )}
      </div>

      {/* Value display */}
      {showValue && (
        <div className="mt-1 text-xs font-mono font-bold text-gray-300">
          {amount.toFixed(2)} USDT
        </div>
      )}
    </div>
  );
};
```

---

## Step 3: Create ChipBetting Component (with Auto-Consolidation)
**File**: `openhouse_frontend/src/components/game-specific/dice/ChipBetting.tsx` (NEW)

```typescript
// REAL CODE - implement exactly as shown

import React, { useState, useCallback, useMemo } from 'react';
import {
  CHIP_DENOMINATIONS,
  ChipDenomination,
  decomposeIntoChips,
  getNextHigherChip,
} from './chipConfig';
import { ChipStack } from './ChipStack';
import { DECIMALS_PER_CKUSDT } from '../../../types/balance';

interface ChipBettingProps {
  betAmount: number;
  onBetChange: (amount: number) => void;
  gameBalance: bigint;
  maxBet: number;
  disabled?: boolean;
}

export const ChipBetting: React.FC<ChipBettingProps> = ({
  betAmount,
  onBetChange,
  gameBalance,
  maxBet,
  disabled = false,
}) => {
  // Track chip history for LIFO undo (stores chip values in order added)
  const [chipHistory, setChipHistory] = useState<number[]>([]);

  // Convert game balance to USDT for comparison
  const gameBalanceUSDT = Number(gameBalance) / DECIMALS_PER_CKUSDT;

  /**
   * Auto-consolidation: Convert lower denomination chips to higher ones
   * when we have enough. This keeps the visual stack clean.
   *
   * Example: If user clicks white 10 times, we show 1 red instead of 10 whites.
   *
   * This is purely visual - the actual bet amount stays the same.
   */
  const consolidatedDisplay = useMemo(() => {
    return decomposeIntoChips(betAmount);
  }, [betAmount]);

  // Check if adding a chip would exceed limits
  const canAddChip = useCallback((chipValue: number): boolean => {
    if (disabled) return false;
    const newAmount = betAmount + chipValue;
    // Round to avoid floating point issues
    const roundedNew = Math.round(newAmount * 100) / 100;
    return roundedNew <= maxBet && roundedNew <= gameBalanceUSDT;
  }, [betAmount, maxBet, gameBalanceUSDT, disabled]);

  // Add a chip to the bet
  const addChip = useCallback((chip: ChipDenomination) => {
    if (!canAddChip(chip.value)) return;

    const newAmount = Math.round((betAmount + chip.value) * 100) / 100;
    setChipHistory(prev => [...prev, chip.value]);
    onBetChange(newAmount);
  }, [betAmount, onBetChange, canAddChip]);

  // Remove the last chip added (LIFO)
  const undoLastChip = useCallback(() => {
    if (chipHistory.length === 0 || disabled) return;

    const lastChipValue = chipHistory[chipHistory.length - 1];
    const newAmount = Math.round((betAmount - lastChipValue) * 100) / 100;

    setChipHistory(prev => prev.slice(0, -1));
    onBetChange(Math.max(0, newAmount));
  }, [chipHistory, betAmount, onBetChange, disabled]);

  // Clear all chips
  const clearBet = useCallback(() => {
    if (disabled) return;
    setChipHistory([]);
    onBetChange(0);
  }, [onBetChange, disabled]);

  return (
    <div className="space-y-4">
      {/* Current Bet Display - Click to undo */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Your Bet</span>
          {betAmount > 0 && (
            <button
              onClick={clearBet}
              disabled={disabled}
              className="text-xs text-red-400 hover:text-red-300 transition disabled:opacity-50"
            >
              Clear All
            </button>
          )}
        </div>

        <div
          className="flex items-center justify-center min-h-[100px] cursor-pointer hover:bg-gray-700/30 rounded-lg transition"
          onClick={undoLastChip}
          title={betAmount > 0 ? "Click to remove last chip" : ""}
        >
          {betAmount > 0 ? (
            <ChipStack
              amount={betAmount}
              maxChipsShown={12}
              showValue={true}
              size="md"
            />
          ) : (
            <div className="text-gray-500 text-sm italic">
              Click chips below to place bet
            </div>
          )}
        </div>

        {betAmount > 0 && (
          <p className="text-center text-xs text-gray-500 mt-2">
            Click stack to undo last chip
          </p>
        )}
      </div>

      {/* Chip Tray - Click to add */}
      <div>
        <span className="text-xs text-gray-400 uppercase tracking-wide block mb-2">
          Add Chips
        </span>

        <div className="flex flex-wrap justify-center gap-2">
          {CHIP_DENOMINATIONS.map((chip) => {
            const canAdd = canAddChip(chip.value);

            return (
              <button
                key={chip.color}
                onClick={() => addChip(chip)}
                disabled={!canAdd}
                className={`
                  flex flex-col items-center p-2 rounded-lg transition-all
                  ${canAdd
                    ? 'bg-gray-800/50 hover:bg-gray-700/50 hover:scale-105 cursor-pointer border border-gray-700/50 hover:border-dfinity-turquoise/50'
                    : 'bg-gray-900/30 opacity-40 cursor-not-allowed border border-gray-800/30'
                  }
                `}
                title={canAdd ? `Add ${chip.label} USDT` : `Cannot add (exceeds ${betAmount + chip.value > maxBet ? 'max bet' : 'balance'})`}
              >
                <img
                  src={chip.topImg}
                  alt={`${chip.color} chip - ${chip.label} USDT`}
                  className="w-12 h-12 object-contain drop-shadow-lg"
                />
                <span className={`text-xs font-mono mt-1 ${canAdd ? 'text-gray-300' : 'text-gray-600'}`}>
                  {chip.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Limits info */}
      <div className="flex justify-between text-xs text-gray-500 px-1">
        <span>Balance: {gameBalanceUSDT.toFixed(2)} USDT</span>
        <span>Max bet: {maxBet.toFixed(2)} USDT</span>
      </div>
    </div>
  );
};
```

---

## Step 4: Update Component Exports
**File**: `openhouse_frontend/src/components/game-specific/dice/index.ts` (MODIFY)

Add these exports to the existing file:

```typescript
// ADD these lines to existing exports
export * from './chipConfig';
export * from './ChipStack';
export * from './ChipBetting';
```

---

## Step 5: Update DiceGame.tsx
**File**: `openhouse_frontend/src/pages/dice/DiceGame.tsx` (MODIFY)

### 5a. Update imports (around line 13)
```typescript
// CHANGE this line:
import { DiceAnimation, DiceControls, type DiceDirection } from '../../components/game-specific/dice';

// TO this:
import { DiceAnimation, DiceControls, type DiceDirection, ChipBetting, ChipStack } from '../../components/game-specific/dice';
```

### 5b. Remove BetAmountInput import (around line 8)
```typescript
// REMOVE BetAmountInput from this import:
import {
  GameLayout,
  BetAmountInput,  // <-- REMOVE THIS
  GameButton,
  GameStats,
  type GameStat,
} from '../../components/game-ui';
```

### 5c. Replace BetAmountInput with ChipBetting (around lines 442-451)

**Find this code block:**
```tsx
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
```

**Replace with:**
```tsx
<ChipBetting
  betAmount={betAmount}
  onBetChange={setBetAmount}
  gameBalance={balance.game}
  maxBet={maxBet}
  disabled={isPlaying}
/>
```

### 5d. Update Game Balance display in balance bar (around lines 387-391)

**Find this code block:**
```tsx
<div className="flex items-center gap-2">
  <span className="text-gray-400">Game:</span>
  <span className="font-mono font-bold text-blue-400">{formatUSDT(balance.game)}</span>
</div>
```

**Replace with:**
```tsx
<div className="flex items-center gap-2">
  <span className="text-gray-400">Game:</span>
  <div className="flex items-center gap-2">
    <ChipStack
      amount={Number(balance.game) / 1_000_000}
      maxChipsShown={5}
      showValue={false}
      size="sm"
    />
    <span className="font-mono font-bold text-blue-400">{formatUSDT(balance.game)}</span>
  </div>
</div>
```

### 5e. Reset bet on successful roll (optional enhancement)

After a successful roll, you may want to reset the bet. In the `rollDice` function success handler (around line 352), the bet amount is preserved by default so users can quickly re-bet. This is intentional casino UX - no change needed.

---

## UI Layout Reference

```
┌─────────────────────────────────────────────────────────────┐
│  BALANCE BAR                                                │
│  ┌─────────────┐  ┌───────────────────┐  ┌─────────────┐   │
│  │ Wallet:     │  │ Game: [CHIPS] 5.23│  │ House:      │   │
│  │ 50.00 USDT  │  │                   │  │ 1000 USDT   │   │
│  └─────────────┘  └───────────────────┘  └─────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  YOUR BET                              [Clear All]          │
│  ┌───────────────────────────────────────────────┐         │
│  │                                               │         │
│  │              [STACKED SIDE-VIEW CHIPS]        │         │
│  │                   2.35 USDT                   │         │
│  │                                               │         │
│  │         (click to remove last chip)           │         │
│  └───────────────────────────────────────────────┘         │
│                                                             │
│  ADD CHIPS                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │ [W]  │ │ [R]  │ │ [B]  │ │ [G]  │ │ [K]  │             │
│  │ 0.01 │ │ 0.10 │ │  1   │ │  5   │ │  10  │             │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘             │
│  (top-view chip buttons - click to add)                    │
│                                                             │
│  Balance: 5.23 USDT          Max bet: 2.50 USDT            │
├─────────────────────────────────────────────────────────────┤
│  [Target slider & Over/Under buttons - unchanged]           │
├─────────────────────────────────────────────────────────────┤
│  [ROLL DICE button]                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Auto-Consolidation Behavior

The auto-consolidation is **purely visual** - implemented in `decomposeIntoChips()`:

| User Action | Bet Amount | Visual Display |
|-------------|------------|----------------|
| Click white x1 | 0.01 | 1 white chip |
| Click white x10 | 0.10 | 1 red chip (consolidated) |
| Click white x15 | 0.15 | 1 red + 5 white |
| Click red x10 | 1.00 | 1 blue chip |
| Click blue x5 | 5.00 | 1 green chip |
| Click green x2 | 10.00 | 1 black chip |
| Click blue x7 | 7.00 | 1 green + 2 blue |

The LIFO undo still tracks the **actual chips clicked** (via `chipHistory`), so clicking undo removes chips in the order they were added, regardless of how they're visually consolidated.

---

## Files Summary

**Create (3 files):**
1. `openhouse_frontend/src/components/game-specific/dice/chipConfig.ts`
2. `openhouse_frontend/src/components/game-specific/dice/ChipStack.tsx`
3. `openhouse_frontend/src/components/game-specific/dice/ChipBetting.tsx`

**Modify (2 files):**
1. `openhouse_frontend/src/components/game-specific/dice/index.ts` - Add exports
2. `openhouse_frontend/src/pages/dice/DiceGame.tsx` - Replace BetAmountInput with ChipBetting

**Assets (already in place):**
- `openhouse_frontend/public/chips/*.png` - 10 chip images (5 colors × 2 views)

---

## Edge Cases Handled

1. **Bet exceeds max** → Chip buttons disabled, shows tooltip
2. **Bet exceeds balance** → Chip buttons disabled
3. **Empty pot click** → No action (graceful no-op)
4. **Floating point precision** → Multiply by 100, round, divide by 100
5. **Large bets** → Stack limited to 12 chips visual, "+N" badge for overflow
6. **Zero balance** → All chips disabled, helpful message

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
