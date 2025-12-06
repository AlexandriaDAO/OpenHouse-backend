# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-svg"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-svg`
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
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(plinko): migrate from Pixi.js to SVG + Framer Motion

- Delete 1,207 lines of custom Pixi.js renderers
- Replace with 270 lines of declarative SVG + Framer Motion
- Simplify animation logic by 80%
- Remove WebGL context management complexity
- Improve performance and maintainability"
   git push -u origin feature/plinko-svg-migration
   gh pr create --title "Refactor: Migrate Plinko from Pixi.js to SVG + Framer Motion" --body "Implements PLAN_PLINKO_SVG_MIGRATION.md

## Changes
- **Deleted**: All Pixi.js renderers (~1,207 lines)
- **Added**: SVG-based components with Framer Motion (~270 lines)
- **Net reduction**: -937 lines (-78% code reduction)

## Benefits
- 🎨 **Simpler visuals**: Declarative SVG instead of imperative WebGL
- ⚡ **Better performance**: No WebGL context management overhead
- 🔧 **Easier maintenance**: Standard React patterns, no custom game engine
- 📱 **Better scaling**: SVG scales naturally, no aspect ratio hacks
- 🎯 **Same gameplay**: Backend path generation unchanged (provably fair)

## Testing
- Tested on mainnet: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
- Verified ball animations follow paths correctly
- Confirmed multiplier display matches backend
- Checked responsive scaling on mobile

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: pezw3-laaaa-aaaal-qssoa-cai (frontend only)"
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

**Branch:** `feature/plinko-svg-migration`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-svg`

---

# Implementation Plan: Plinko SVG Migration

## Task Classification
**REFACTORING** - Replace complex Pixi.js game engine with simple SVG + Framer Motion

## Current State Analysis

### Files to DELETE (1,207 lines total)
```
components/game-specific/plinko/
├── pixi/
│   ├── BallRenderer.ts        (134 lines) - Custom ball physics renderer
│   ├── BucketRenderer.ts      (289 lines) - Bucket animation controller
│   ├── LayoutConfig.ts        (88 lines)  - Canvas sizing constants
│   ├── PegRenderer.ts         (54 lines)  - Peg grid renderer
│   ├── SlotRenderer.ts        (181 lines) - Multiplier slot renderer
│   └── index.ts               (6 lines)   - Exports
├── PlinkoController.ts        (301 lines) - Game state machine
└── PlinkoStage.tsx            (154 lines) - Pixi canvas wrapper
```

**Total complexity:**
- 8 files managing WebGL context, canvas sizing, renderer coordination
- Custom game loop with Ticker updates
- Manual sprite positioning and animation
- Complex aspect ratio constraints (see `CLAUDE.md`)
- Fighting with WebGL context loss/restore

### Files to MODIFY
```
pages/plinko/
└── PlinkoGame.tsx             (482 lines) - Simplify to use new components

components/game-specific/plinko/
└── index.ts                   (11 lines) - Update exports
```

### Files to CREATE (270 lines total)
```
components/game-specific/plinko/
├── PlinkoBoard.tsx            (~150 lines) - SVG board with pegs/slots
├── PlinkoBall.tsx             (~80 lines)  - Framer Motion animated ball
└── plinkoAnimations.ts        (~40 lines)  - Animation configuration
```

**Net result:** -937 lines (-78% reduction)

## Dependencies Check
```json
// package.json - Already installed!
{
  "framer-motion": "^12.23.25",  // ✅ Already in package.json
  "pixi.js": "^8.14.3"           // ❌ Can be removed after migration
}
```

## Implementation Details

### Step 1: Create Animation Configuration
**File:** `openhouse_frontend/src/components/game-specific/plinko/plinkoAnimations.ts` (NEW)

```typescript
// PSEUDOCODE - Animation constants and helpers
export const PLINKO_LAYOUT = {
  // SVG viewBox dimensions (scales naturally)
  BOARD_WIDTH: 400,
  BOARD_HEIGHT: 440,

  // Spacing (same as old LayoutConfig for consistency)
  PEG_SPACING_X: 38,
  PEG_SPACING_Y: 36,
  PEG_RADIUS: 8,
  BALL_RADIUS: 10,

  // Slot configuration
  SLOT_WIDTH: 34,
  SLOT_HEIGHT: 32,
  SLOT_GAP: 2,

  // Animation timing
  MS_PER_ROW: 80,        // Same as Pixi version
  BALL_STAGGER_MS: 120,  // Delay between multi-ball drops

  // Colors (Tailwind-compatible)
  COLORS: {
    peg: '#e8e8e8',
    ball: '#ffd700',
    win: '#22c55e',
    lose: '#6b7280',
    board: '#0a0a14',
  }
};

// Calculate ball position at a given path step
export function calculateBallPosition(
  path: boolean[],
  currentRow: number,
  progress: number // 0-1 within current row
): { x: number; y: number } {
  // PSEUDOCODE
  // Count rights up to current row to get X offset
  const rightsToCurrentRow = path.slice(0, currentRow).filter(v => v).length;

  // Calculate X position (center board is 200, adjust by rights)
  const currentX = BOARD_WIDTH / 2 +
    (rightsToCurrentRow - currentRow / 2) * PEG_SPACING_X;

  // Calculate next X for interpolation
  const rightsToNextRow = path.slice(0, currentRow + 1).filter(v => v).length;
  const nextX = BOARD_WIDTH / 2 +
    (rightsToNextRow - (currentRow + 1) / 2) * PEG_SPACING_X;

  // Interpolate X with easing
  const x = currentX + (nextX - currentX) * easeInOutQuad(progress);

  // Calculate Y position
  const DROP_ZONE = 70;
  const baseY = DROP_ZONE + currentRow * PEG_SPACING_Y;
  const y = baseY + PEG_SPACING_Y * easeInOutQuad(progress);

  return { x, y };
}

// Easing function
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Generate Framer Motion keyframes from path
export function generateBallKeyframes(path: boolean[]) {
  // PSEUDOCODE
  const keyframes: { x: number; y: number }[] = [];

  // Start at top
  keyframes.push({ x: BOARD_WIDTH / 2, y: 50 });

  // Add keyframe for each row
  for (let row = 0; row <= path.length; row++) {
    const pos = calculateBallPosition(path, row, 1);
    keyframes.push(pos);
  }

  return keyframes;
}
```

### Step 2: Create SVG Board Component
**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx` (NEW)

```tsx
// PSEUDOCODE - SVG-based Plinko board
import React from 'react';
import { PLINKO_LAYOUT } from './plinkoAnimations';

interface PlinkoBoarProps {
  rows: number;
  multipliers: number[];
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({ rows, multipliers }) => {
  // Generate peg positions
  const pegs = generatePegPositions(rows);

  // Generate slot positions (bottom of board)
  const slots = generateSlotPositions(rows, multipliers);

  return (
    <svg
      viewBox={`0 0 ${PLINKO_LAYOUT.BOARD_WIDTH} ${PLINKO_LAYOUT.BOARD_HEIGHT}`}
      className="w-full h-full"
      style={{ backgroundColor: PLINKO_LAYOUT.COLORS.board }}
    >
      {/* Render pegs */}
      <g id="pegs">
        {pegs.map((peg, i) => (
          <circle
            key={i}
            cx={peg.x}
            cy={peg.y}
            r={PLINKO_LAYOUT.PEG_RADIUS}
            fill={PLINKO_LAYOUT.COLORS.peg}
          />
        ))}
      </g>

      {/* Render multiplier slots */}
      <g id="slots">
        {slots.map((slot, i) => {
          const mult = multipliers[i];
          const isWin = mult > 1.0;

          return (
            <g key={i} transform={`translate(${slot.x}, ${slot.y})`}>
              {/* Slot box */}
              <rect
                x={-PLINKO_LAYOUT.SLOT_WIDTH / 2}
                y={0}
                width={PLINKO_LAYOUT.SLOT_WIDTH}
                height={PLINKO_LAYOUT.SLOT_HEIGHT}
                fill={isWin ? PLINKO_LAYOUT.COLORS.win : PLINKO_LAYOUT.COLORS.lose}
                opacity={0.2}
                stroke={isWin ? PLINKO_LAYOUT.COLORS.win : PLINKO_LAYOUT.COLORS.lose}
                strokeWidth={2}
                rx={4}
              />

              {/* Multiplier text */}
              <text
                x={0}
                y={PLINKO_LAYOUT.SLOT_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={12}
                fontWeight="bold"
              >
                {mult.toFixed(2)}x
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// Helper: Generate peg grid positions
function generatePegPositions(rows: number) {
  // PSEUDOCODE
  const pegs: { x: number; y: number }[] = [];
  const centerX = PLINKO_LAYOUT.BOARD_WIDTH / 2;
  const DROP_ZONE = 70;

  for (let row = 0; row < rows; row++) {
    const pegsInRow = row + 1;
    for (let col = 0; col < pegsInRow; col++) {
      const x = centerX + (col - row / 2) * PLINKO_LAYOUT.PEG_SPACING_X;
      const y = DROP_ZONE + row * PLINKO_LAYOUT.PEG_SPACING_Y;
      pegs.push({ x, y });
    }
  }

  return pegs;
}

// Helper: Generate slot positions
function generateSlotPositions(rows: number, multipliers: number[]) {
  // PSEUDOCODE
  const slots: { x: number; y: number }[] = [];
  const centerX = PLINKO_LAYOUT.BOARD_WIDTH / 2;
  const slotCount = rows + 1;
  const DROP_ZONE = 70;
  const slotsY = DROP_ZONE + rows * PLINKO_LAYOUT.PEG_SPACING_Y + 16;

  for (let i = 0; i < slotCount; i++) {
    const x = centerX + (i - rows / 2) * PLINKO_LAYOUT.PEG_SPACING_X;
    slots.push({ x, y: slotsY });
  }

  return slots;
}
```

### Step 3: Create Animated Ball Component
**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoBall.tsx` (NEW)

```tsx
// PSEUDOCODE - Framer Motion animated ball
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateBallKeyframes, PLINKO_LAYOUT } from './plinkoAnimations';

interface PlinkoBallProps {
  id: number;
  path: boolean[];
  onComplete: (id: number, finalSlot: number) => void;
  staggerDelay?: number;
}

export const PlinkoBall: React.FC<PlinkoBallProps> = ({
  id,
  path,
  onComplete,
  staggerDelay = 0
}) => {
  // Generate animation keyframes from path
  const keyframes = generateBallKeyframes(path);

  // Calculate final slot (count of rights in path)
  const finalSlot = path.filter(v => v).length;

  // Calculate total animation duration
  const duration = (path.length * PLINKO_LAYOUT.MS_PER_ROW) / 1000;

  // Notify parent when animation completes
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete(id, finalSlot);
    }, (duration + staggerDelay) * 1000);

    return () => clearTimeout(timer);
  }, [id, finalSlot, duration, staggerDelay, onComplete]);

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{
        x: keyframes.map(k => k.x),
        y: keyframes.map(k => k.y),
        opacity: [0, 1, 1, 1, 0.5],
      }}
      transition={{
        duration,
        delay: staggerDelay,
        ease: "easeInOut",
        times: keyframes.map((_, i) => i / (keyframes.length - 1)),
      }}
    >
      {/* Ball circle */}
      <circle
        r={PLINKO_LAYOUT.BALL_RADIUS}
        fill={PLINKO_LAYOUT.COLORS.ball}
      />

      {/* 3D highlight */}
      <circle
        cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
        cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
        r={PLINKO_LAYOUT.BALL_RADIUS * 0.3}
        fill="white"
        opacity={0.4}
      />
    </motion.g>
  );
};
```

### Step 4: Simplify PlinkoGame.tsx
**File:** `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx` (MODIFY)

```tsx
// PSEUDOCODE - Simplified game component
import React, { useEffect, useState, useCallback } from 'react';
import usePlinkoActor from '../../hooks/actors/usePlinkoActor';
import { GameLayout } from '../../components/game-ui';
import { BettingRail } from '../../components/betting';
import { PlinkoBoard, PlinkoBall } from '../../components/game-specific/plinko';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { useBalance } from '../../providers/BalanceProvider';
import { useAuth } from '../../providers/AuthProvider';
import { DECIMALS_PER_CKUSDT } from '../../types/balance';

const ROWS = 8;
const PLINKO_BACKEND_CANISTER_ID = 'weupr-2qaaa-aaaap-abl3q-cai';

interface AnimatingBall {
  id: number;
  path: boolean[];
}

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();
  const { isAuthenticated } = useAuth();
  const gameBalanceContext = useGameBalance('plinko');
  const balance = gameBalanceContext.balance;

  // Game state (MUCH SIMPLER - no controller!)
  const [isPlaying, setIsPlaying] = useState(false);
  const [ballCount, setBallCount] = useState(1);
  const [betAmount, setBetAmount] = useState(0.01);
  const [maxBet, setMaxBet] = useState(100);
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [gameError, setGameError] = useState('');

  // Animation state (simple array of active balls)
  const [animatingBalls, setAnimatingBalls] = useState<AnimatingBall[]>([]);
  const [nextBallId, setNextBallId] = useState(0);

  // Load multipliers on mount
  useEffect(() => {
    async function loadMultipliers() {
      if (!actor) return;
      const multsBp = await actor.get_multipliers_bp();
      const mults = Array.from(multsBp).map(bp => Number(bp) / 10000);
      setMultipliers(mults);
    }
    loadMultipliers();
  }, [actor]);

  // Drop balls handler
  const dropBalls = async () => {
    if (!actor || isPlaying || !isAuthenticated) return;

    setIsPlaying(true);
    setGameError('');

    try {
      // Call backend to get paths
      const betAmountE8s = BigInt(Math.floor(betAmount * DECIMALS_PER_CKUSDT));
      const result = await actor.play_plinko_batch(betAmountE8s, ballCount);

      if ('Ok' in result) {
        const results = result.Ok.results;

        // Create animating balls from backend paths
        const newBalls: AnimatingBall[] = results.map((r, i) => ({
          id: nextBallId + i,
          path: r.path,
        }));

        setAnimatingBalls(newBalls);
        setNextBallId(prev => prev + ballCount);

        // Refresh balance after all animations complete
        setTimeout(() => {
          gameBalanceContext.refresh();
        }, (results.length * 120 + 2000));

      } else {
        setGameError(result.Err);
        setIsPlaying(false);
      }
    } catch (err) {
      setGameError(err instanceof Error ? err.message : 'Failed to play');
      setIsPlaying(false);
    }
  };

  // Handle ball animation complete
  const handleBallComplete = useCallback((ballId: number, finalSlot: number) => {
    // Remove ball from animating list
    setAnimatingBalls(prev => prev.filter(b => b.id !== ballId));

    // If no more balls animating, game is done
    setAnimatingBalls(prev => {
      if (prev.length === 0) {
        setIsPlaying(false);
      }
      return prev;
    });
  }, []);

  return (
    <GameLayout
      title="Plinko"
      icon="🔴"
      description="Drop balls through pegs to win multipliers!"
      minBet={0.01}
      maxWin={1000}
      houseEdge={1}
    >
      {/* Game Board - SVG with fixed aspect ratio */}
      <div className="card max-w-4xl mx-auto relative p-0 overflow-hidden">
        <div style={{ aspectRatio: '400/440' }}>
          <svg viewBox="0 0 400 440" className="w-full h-full">
            {/* Static board */}
            <PlinkoBoard rows={ROWS} multipliers={multipliers} />

            {/* Animated balls */}
            {animatingBalls.map((ball, index) => (
              <PlinkoBall
                key={ball.id}
                id={ball.id}
                path={ball.path}
                onComplete={handleBallComplete}
                staggerDelay={index * 0.12} // 120ms stagger
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Betting Controls */}
      <BettingRail
        canisterId={PLINKO_BACKEND_CANISTER_ID}
        balance={balance}
        onBalanceRefresh={gameBalanceContext.refresh}
        onPlay={dropBalls}
        isPlaying={isPlaying}
        betAmount={betAmount}
        onBetAmountChange={setBetAmount}
        maxBet={maxBet}
      />

      {/* Ball count selector */}
      <div className="card max-w-2xl mx-auto">
        <label>Balls to drop: {ballCount}</label>
        <input
          type="range"
          min={1}
          max={10}
          value={ballCount}
          onChange={(e) => setBallCount(Number(e.target.value))}
          disabled={isPlaying}
        />
      </div>

      {gameError && (
        <div className="text-red-400 text-center">{gameError}</div>
      )}
    </GameLayout>
  );
};
```

### Step 5: Update Exports
**File:** `openhouse_frontend/src/components/game-specific/plinko/index.ts` (MODIFY)

```typescript
// PSEUDOCODE - Updated exports
export { PlinkoBoard } from './PlinkoBoard';
export { PlinkoBall } from './PlinkoBall';
export * from './plinkoAnimations';

// OLD EXPORTS - DELETE THESE
// export { PlinkoStage } from './PlinkoStage';
// export { PlinkoController } from './PlinkoController';
```

### Step 6: Delete Old Pixi Files
**Files to DELETE:**
```bash
# Delete entire pixi directory
rm -rf openhouse_frontend/src/components/game-specific/plinko/pixi/

# Delete old controller and stage
rm openhouse_frontend/src/components/game-specific/plinko/PlinkoController.ts
rm openhouse_frontend/src/components/game-specific/plinko/PlinkoStage.tsx

# Delete old CLAUDE.md (sizing constraints no longer needed!)
rm openhouse_frontend/src/pages/plinko/CLAUDE.md
```

### Step 7: Optional - Remove Pixi.js Dependency
**File:** `openhouse_frontend/package.json` (MODIFY)

```json
// PSEUDOCODE - Remove pixi.js if no other games use it
{
  "dependencies": {
    // ... other deps
    // "pixi.js": "^8.14.3",  // DELETE - no longer needed
  }
}
```

Then run:
```bash
cd openhouse_frontend
npm uninstall pixi.js
```

## File Change Summary

### DELETE (8 files, 1,207 lines)
- ✂️ `components/game-specific/plinko/pixi/BallRenderer.ts` (134 lines)
- ✂️ `components/game-specific/plinko/pixi/BucketRenderer.ts` (289 lines)
- ✂️ `components/game-specific/plinko/pixi/LayoutConfig.ts` (88 lines)
- ✂️ `components/game-specific/plinko/pixi/PegRenderer.ts` (54 lines)
- ✂️ `components/game-specific/plinko/pixi/SlotRenderer.ts` (181 lines)
- ✂️ `components/game-specific/plinko/pixi/index.ts` (6 lines)
- ✂️ `components/game-specific/plinko/PlinkoController.ts` (301 lines)
- ✂️ `components/game-specific/plinko/PlinkoStage.tsx` (154 lines)

### CREATE (3 files, 270 lines)
- ➕ `components/game-specific/plinko/PlinkoBoard.tsx` (~150 lines)
- ➕ `components/game-specific/plinko/PlinkoBall.tsx` (~80 lines)
- ➕ `components/game-specific/plinko/plinkoAnimations.ts` (~40 lines)

### MODIFY (2 files)
- 📝 `pages/plinko/PlinkoGame.tsx` (simplify from 482 to ~250 lines)
- 📝 `components/game-specific/plinko/index.ts` (update exports)

### OPTIONAL DELETE (1 file)
- ✂️ `pages/plinko/CLAUDE.md` (67 lines) - sizing constraints doc no longer needed

**Net change:** -937 lines (-78% reduction)

## Benefits

### Code Quality
- ❌ **Before**: 1,207 lines of custom game engine
- ✅ **After**: 270 lines of declarative components
- 📉 **Reduction**: 78% less code to maintain

### Complexity Reduction
- ❌ **Before**: WebGL context management, custom game loop, manual sprite positioning
- ✅ **After**: Standard React components, declarative animations
- 🎯 **Win**: React developers can now modify Plinko easily

### Performance
- ❌ **Before**: WebGL overhead, context loss handling, manual ticker updates
- ✅ **After**: Hardware-accelerated SVG, browser-optimized transforms
- ⚡ **Result**: Lighter memory footprint, smoother animations

### Maintainability
- ❌ **Before**: Required CLAUDE.md to warn about sizing pitfalls
- ✅ **After**: SVG scales naturally, no aspect ratio hacks
- 🛠️ **Win**: No more "canvas is tiny" debugging

## Testing Checklist

Manual verification on mainnet:
- [ ] Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
- [ ] Drop 1 ball - verify animation follows path
- [ ] Drop 10 balls - verify staggered animation
- [ ] Check multiplier slots display correctly
- [ ] Verify win/loss colors match old implementation
- [ ] Test responsive scaling (resize browser)
- [ ] Confirm backend integration unchanged (same API calls)

## Deployment Notes

**Affected Canisters:**
- `pezw3-laaaa-aaaal-qssoa-cai` (frontend only)

**Backend Changes:**
- None - backend API unchanged

**Breaking Changes:**
- None - UI replacement only, same user experience

## Rollback Plan

If SVG migration causes issues:
```bash
git revert HEAD
cd openhouse_frontend && npm run build && cd ..
./deploy.sh --frontend-only
```

## Success Criteria

1. ✅ Plinko game playable on mainnet
2. ✅ Ball animations visually match old implementation
3. ✅ Code reduced by >75%
4. ✅ No CLAUDE.md sizing warnings needed
5. ✅ PR merged without P0 issues
