# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-minimalism"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-minimalism`
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
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(plinko): minimalist UI redesign matching dice aesthetic"
   git push -u origin feature/plinko-minimalism
   gh pr create --title "Plinko: Minimalist UI Redesign" --body "Redesigns Plinko page to match the minimalist aesthetic of the Dice game.

## Changes
- Remove verbose header (title, emoji, description)
- Hide formula/probabilities behind '?' modal
- Simplify result display to one-line format
- Clean layout: board → result → multipliers → slider → button
- No functional changes to game logic

## Screenshots
[Add before/after screenshots]

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
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

**Branch:** `feature/plinko-minimalism`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-minimalism`

---

# Implementation Plan: Plinko Minimalist UI

## Goal
Transform cluttered Plinko page to match Dice's minimalist aesthetic - animation-focused, no explanatory text visible, controls minimal.

## Design Principles (from Dice)
- Animation is the centerpiece
- Zero visible header (no title, emoji, description)
- Information hidden behind "?" modal
- One tight stats row or inline result
- Clean layout with breathing room

## Current State Analysis

### Plinko.tsx (324 lines) - CLUTTERED
```
- GameLayout with title="Pure Mathematical Plinko", icon="🎯", description
- ConnectionStatus banner
- "Mathematical Formula Display" card (15 lines)
- GameStats component
- Ball count slider with verbose labels
- GameButton with emoji
- PlinkoBoard
- PlinkoMultipliers
- Probability distribution text
- Win zones text
- Verbose result display (single ball) with emojis
- Multi-ball summary panel (60 lines)
- Individual results expander
```

### DiceGame.tsx (429 lines) - MINIMAL (TARGET)
```
- GameLayout with hideFooter, noScroll, NO title/icon/description
- DiceAnimation (clickable centerpiece)
- "TAP TO ROLL" hint
- Inline result: "WON +$X" or "LOST"
- Direction buttons (UNDER/OVER)
- Target slider
- One stats row (Win Chance | Multiplier | Payout)
- "?" button → modal with odds explanation
- BettingRail at bottom
```

## Target Layout (top to bottom)
```
┌─────────────────────────────────────────┐
│                                         │
│        [PlinkoBoard - LARGE]            │  ← Centerpiece, no wrapper card
│                                         │
├─────────────────────────────────────────┤
│     WON 2.34x    or    AVG 0.92x        │  ← Inline result (green/red)
├─────────────────────────────────────────┤
│  [0.2x][0.4x][0.8x][1.5x][6.5x]...      │  ← Multipliers strip (compact)
├─────────────────────────────────────────┤
│  Balls: [═══════●═══════] 15            │  ← Simple slider, minimal label
├─────────────────────────────────────────┤
│         [ DROP 15 BALLS ]               │  ← Clean button, no emoji
├─────────────────────────────────────────┤
│                              [?]        │  ← Info modal trigger (corner)
└─────────────────────────────────────────┘
```

## Files to Modify

### Primary: `openhouse_frontend/src/pages/Plinko.tsx`
Complete restructure following dice pattern.

### Secondary (minor tweaks):
- `openhouse_frontend/src/components/game-specific/plinko/PlinkoMultipliers.tsx` - Simplify styling
- `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.css` - May need spacing adjustments

## Implementation Pseudocode

### Plinko.tsx Rewrite

```typescript
// PSEUDOCODE - Complete rewrite of Plinko.tsx

import React, { useEffect, useState, useCallback } from 'react';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import { GameLayout } from '../components/game-ui';
import { PlinkoBoard, PlinkoMultipliers } from '../components/game-specific/plinko';

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [ballCount, setBallCount] = useState<number>(1);
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>('');
  const [expectedValue, setExpectedValue] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<SingleResult | null>(null);
  const [multiBallResult, setMultiBallResult] = useState<MultiBallResult | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Load game data on mount (same as before)
  useEffect(() => { /* fetch multipliers, formula, EV */ }, [actor]);

  // Drop ball(s) function (same logic as before)
  const dropBalls = async () => { /* existing logic */ };

  const handleAnimationComplete = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Calculate house edge for modal
  const houseEdge = ((1 - expectedValue) * 100).toFixed(2);

  return (
    <GameLayout hideFooter noScroll>
      {/* Main container - flex column, centered */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto px-4 overflow-hidden min-h-0">

        {/* PlinkoBoard - Centerpiece, no card wrapper */}
        <div className="flex-shrink-0 py-4">
          <PlinkoBoard
            rows={8}
            paths={/* same logic */}
            isDropping={isPlaying}
            onAnimationComplete={handleAnimationComplete}
            finalPositions={/* same logic */}
          />
        </div>

        {/* Result Display - Single line, inline */}
        <div className="h-10 flex items-center justify-center flex-shrink-0">
          {!isPlaying && (currentResult || multiBallResult) && (
            <ResultDisplay
              singleResult={currentResult}
              multiResult={multiBallResult}
            />
          )}
        </div>

        {/* Multipliers Strip - Compact */}
        {multipliers.length > 0 && (
          <div className="flex-shrink-0 py-2">
            <PlinkoMultipliers
              multipliers={multipliers}
              highlightedIndex={currentResult?.final_position}
              showWinLoss={false}  // Simplified - no +/-% labels
            />
          </div>
        )}

        {/* Ball Slider - Minimal */}
        <div className="flex-shrink-0 py-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400 w-12">Balls</span>
            <input
              type="range"
              min="1"
              max="30"
              value={ballCount}
              onChange={(e) => setBallCount(parseInt(e.target.value))}
              disabled={isPlaying}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm text-white font-mono w-8">{ballCount}</span>
          </div>
        </div>

        {/* Drop Button - Clean, no emoji */}
        <div className="flex-shrink-0 py-2">
          <button
            onClick={dropBalls}
            disabled={!actor || isPlaying}
            className="w-full py-4 bg-dfinity-turquoise text-black font-bold rounded-xl
                       hover:bg-dfinity-turquoise/90 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
          >
            {isPlaying
              ? 'DROPPING...'
              : ballCount === 1
                ? 'DROP BALL'
                : `DROP ${ballCount} BALLS`
            }
          </button>
        </div>

        {/* Error Display */}
        {gameError && (
          <div className="text-red-400 text-xs text-center py-2">
            {gameError}
          </div>
        )}

        {/* Info Button - Bottom right corner */}
        <div className="flex justify-end pt-4">
          <button
            onClick={() => setShowInfoModal(true)}
            className="text-gray-600 hover:text-gray-400 text-lg"
            title="Game info"
          >
            ?
          </button>
        </div>
      </div>

      {/* Info Modal - Hidden by default */}
      {showInfoModal && (
        <InfoModal
          onClose={() => setShowInfoModal(false)}
          formula={formula}
          houseEdge={houseEdge}
          expectedValue={expectedValue}
          multipliers={multipliers}
        />
      )}
    </GameLayout>
  );
};

// Inline Result Component
const ResultDisplay: React.FC<{singleResult, multiResult}> = ({singleResult, multiResult}) => {
  if (singleResult) {
    const isWin = singleResult.multiplier >= 1.0;
    return (
      <div className={`text-xl font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
        {isWin ? 'WON' : 'LOST'} {singleResult.multiplier.toFixed(2)}x
      </div>
    );
  }

  if (multiResult) {
    const isNetWin = multiResult.average_multiplier >= 1.0;
    return (
      <div className={`text-lg font-bold ${isNetWin ? 'text-green-400' : 'text-red-400'}`}>
        AVG {multiResult.average_multiplier.toFixed(2)}x
        <span className="text-gray-500 text-sm ml-2">
          ({multiResult.total_wins}/{multiResult.total_balls} wins)
        </span>
      </div>
    );
  }

  return null;
};

// Info Modal Component (like dice's odds explainer)
const InfoModal: React.FC<{onClose, formula, houseEdge, expectedValue, multipliers}> = (props) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         onClick={props.onClose}>
      <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-gray-700"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">How Plinko Works</h3>
          <button onClick={props.onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        <div className="text-sm text-gray-300 space-y-4">
          {/* Formula */}
          <div>
            <p className="font-semibold text-white mb-1">The Formula</p>
            <code className="text-sm font-mono text-dfinity-turquoise bg-black/50 px-3 py-1 rounded block">
              {props.formula || 'M(k) = 0.2 + 6.32 × ((k-4)/4)²'}
            </code>
          </div>

          {/* House Edge */}
          <div>
            <p className="font-semibold text-white mb-1">House Edge</p>
            <p>{props.houseEdge}% (Expected Value: {props.expectedValue.toFixed(4)})</p>
          </div>

          {/* Probability Distribution */}
          <div>
            <p className="font-semibold text-white mb-1">Probability Distribution</p>
            <p className="font-mono text-xs">
              0.4% | 3.1% | 10.9% | 21.9% | 27.3% | 21.9% | 10.9% | 3.1% | 0.4%
            </p>
          </div>

          {/* Win Zones */}
          <div>
            <p className="font-semibold text-white mb-1">Win Zones</p>
            <p>
              <span className="text-green-400">Edges (29%)</span> = Win (1x+) |
              <span className="text-red-400 ml-1">Center (71%)</span> = Loss (&lt;1x)
            </p>
          </div>

          {/* Multipliers */}
          <div>
            <p className="font-semibold text-white mb-1">Multipliers</p>
            <div className="flex flex-wrap gap-1">
              {props.multipliers.map((m, i) => (
                <span key={i} className={`text-xs px-2 py-1 rounded ${m >= 1 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                  {m.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### PlinkoMultipliers.tsx Simplification

```typescript
// PSEUDOCODE - Simplified multipliers display

// Remove:
// - Position indicator numbers (index)
// - +/-% labels when showWinLoss=false
// - Excessive padding

// Keep:
// - Color coding (green for win, red for loss)
// - Highlight for current result
// - Compact sizing

// Changes:
className="px-2 py-1 text-xs font-mono rounded"  // Smaller padding
// Remove: <div className="text-xs mt-1">{index}</div>  // No position numbers
```

## What Gets Removed

1. ❌ `title="Pure Mathematical Plinko"` from GameLayout
2. ❌ `icon="🎯"` from GameLayout
3. ❌ `description="Transparent formula..."` from GameLayout
4. ❌ `<ConnectionStatus />` component
5. ❌ Mathematical Formula Display card (entire section)
6. ❌ `<GameStats stats={stats} />` component
7. ❌ Probability distribution text below multipliers
8. ❌ Win zones text below multipliers
9. ❌ Verbose single-ball result display with emojis
10. ❌ Multi-ball summary panel (60 lines)
11. ❌ Individual results `<details>` expander

## What Gets Added

1. ✅ `hideFooter noScroll` props to GameLayout
2. ✅ Simple inline `<ResultDisplay />` component
3. ✅ `<InfoModal />` component (hidden by default)
4. ✅ "?" button to trigger info modal
5. ✅ Cleaner slider without verbose labels
6. ✅ Simpler button without emoji

## Testing Checklist

After deployment, verify:
- [ ] Board renders and animates correctly
- [ ] Single ball drop works
- [ ] Multi-ball drop (1-30) works
- [ ] Results display inline (not verbose panels)
- [ ] "?" button opens info modal
- [ ] Info modal shows formula, house edge, probabilities
- [ ] Mobile responsive
- [ ] No console errors

## Deployment

Frontend-only change:
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

Affected canister: `pezw3-laaaa-aaaal-qssoa-cai` (Frontend only)
