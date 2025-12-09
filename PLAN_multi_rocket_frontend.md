# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-multi-rocket"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-multi-rocket`
2. **Sync declarations first** (CRITICAL):
   ```bash
   dfx generate crash_backend
   cp -r src/declarations/crash_backend/* openhouse_frontend/src/declarations/crash_backend/
   ```
3. **Implement feature** - Follow plan sections below
4. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```

5. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/crash"
   echo "Test: Launch 5 rockets at 2x target, verify independent trajectories"
   ```

6. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(crash): multi-rocket frontend with 10 independent trajectories"
   git push -u origin feature/multi-rocket-crash
   gh pr create --title "feat(crash): Multi-Rocket Frontend UI" --body "Implements PLAN_multi_rocket_frontend.md

## Summary
- Adds rocket count slider (1-10 rockets)
- Calls \`play_crash_multi\` backend endpoint
- Renders 10 independent trajectory lines with distinct colors
- Staggered rocket animations (200ms between launches)
- Shows aggregate results (X/Y rockets reached target)

## Deployed to mainnet
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/crash

## Testing
1. Visit /crash page
2. Set target to 2x, rockets to 5
3. Click LAUNCH
4. Verify 5 rockets with different colored trajectories
5. Verify results show X/5 succeeded"
   ```

7. **Iterate autonomously**:
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

**Branch:** `feature/multi-rocket-crash`
**Worktree:** `/home/theseus/alexandria/openhouse-multi-rocket`

---

# Implementation Plan: Multi-Rocket Crash Frontend

## Feature Summary

Update the crash game UI to support launching 1-10 rockets simultaneously. Each rocket has its own trajectory line and crash point, creating dramatic "will any survive?" gameplay.

## Prerequisites

The backend `play_crash_multi(target, count)` endpoint is already deployed on mainnet (`fws6k-tyaaa-aaaap-qqc7q-cai`).

---

## Step 0: Sync Declarations (MANDATORY FIRST)

The frontend declarations are outdated. Run these commands FIRST:

```bash
cd /home/theseus/alexandria/openhouse-multi-rocket
dfx generate crash_backend
cp -r src/declarations/crash_backend/* openhouse_frontend/src/declarations/crash_backend/
```

After sync, `crash_backend.did.d.ts` should contain:
- `SingleRocketResult` type
- `MultiCrashResult` type
- `play_crash_multi` method

---

## Current State

### File: `openhouse_frontend/src/pages/Crash.tsx` (243 lines)

**Current behavior:**
- Single rocket game
- Calls `actor.play_crash(targetCashout)`
- Single trajectory line
- Single result display

**Key state variables (lines 28-37):**
```typescript
const [isPlaying, setIsPlaying] = useState(false);
const [isCrashed, setIsCrashed] = useState(false);
const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
const [crashPoint, setCrashPoint] = useState<number | null>(null);
const [targetCashout, setTargetCashout] = useState(2.5);
const [graphHistory, setGraphHistory] = useState<Array<{ multiplier: number; timestamp: number }>>([]);
const [gameResult, setGameResult] = useState<PlayCrashResult | null>(null);
```

### File: `openhouse_frontend/src/components/game-specific/crash/CrashCanvas.tsx` (227 lines)

**Current behavior:**
- Single trajectory line (lime green `#39FF14`)
- Single rocket sprite
- Single crash explosion

**Key props:**
```typescript
interface CrashCanvasProps {
    currentMultiplier: number;
    isCrashed: boolean;
    crashPoint: number | null;
    history: Array<{ multiplier: number; timestamp: number }>;
}
```

---

## Implementation

### Step 1: Add TypeScript Interfaces

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Add after existing interfaces (around line 22):

```typescript
// PSEUDOCODE - Types should match generated declarations
interface SingleRocketResult {
  rocket_index: number;
  crash_point: number;
  reached_target: boolean;
  payout: bigint;
}

interface MultiCrashResult {
  rockets: SingleRocketResult[];
  target_multiplier: number;
  rocket_count: number;
  rockets_succeeded: number;
  total_payout: bigint;
  master_randomness_hash: string;
}

// Per-rocket animation state
interface RocketState {
  index: number;
  crashPoint: number;
  reachedTarget: boolean;
  currentMultiplier: number;
  isCrashed: boolean;
  history: Array<{ multiplier: number; timestamp: number }>;
  startTime: number;
}
```

### Step 2: Add Rocket Count State

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Add new state variables after existing ones (around line 37):

```typescript
// PSEUDOCODE
// Multi-rocket state
const [rocketCount, setRocketCount] = useState(1);
const [multiResult, setMultiResult] = useState<MultiCrashResult | null>(null);
const [rocketStates, setRocketStates] = useState<RocketState[]>([]);
const [allCrashed, setAllCrashed] = useState(false);
```

### Step 3: Update startGame Function

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Replace `startGame` function (lines 40-84) with multi-rocket version:

```typescript
// PSEUDOCODE
const startGame = async () => {
  if (!actor) return;
  if (!isAuthenticated) {
    setGameError('Please log in to play');
    return;
  }

  // Reset state
  setIsPlaying(true);
  setIsCrashed(false);
  setAllCrashed(false);
  setGameError('');
  setMultiResult(null);
  setRocketStates([]);
  setGameResult(null);
  setPassedTarget(false);

  try {
    // Call multi-rocket endpoint
    const result = await actor.play_crash_multi(targetCashout, rocketCount);

    if ('Ok' in result) {
      const gameData = result.Ok;
      setMultiResult(gameData);

      // Initialize rocket states with staggered start times
      const initialStates: RocketState[] = gameData.rockets.map((rocket, i) => ({
        index: rocket.rocket_index,
        crashPoint: rocket.crash_point,
        reachedTarget: rocket.reached_target,
        currentMultiplier: 1.0,
        isCrashed: false,
        history: [],
        startTime: Date.now() + (i * 200), // 200ms stagger
      }));

      setRocketStates(initialStates);

      // Start multi-rocket animation
      animateMultiRockets(initialStates);
    } else {
      setGameError(result.Err);
      setIsPlaying(false);
    }
  } catch (err) {
    setGameError(err instanceof Error ? err.message : 'Failed to start game');
    setIsPlaying(false);
  }
};
```

### Step 4: Add Multi-Rocket Animation Function

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Add after `startGame` function:

```typescript
// PSEUDOCODE
const animateMultiRockets = (initialStates: RocketState[]) => {
  const crashedSet = new Set<number>();

  const animate = () => {
    const now = Date.now();

    setRocketStates(prevStates => {
      const newStates = prevStates.map(rocket => {
        // Skip if already crashed
        if (rocket.isCrashed) return rocket;

        // Check if this rocket has started yet (staggered start)
        const elapsed = now - rocket.startTime;
        if (elapsed < 0) return rocket;

        // Calculate multiplier using exponential curve
        const duration = Math.min(rocket.crashPoint * 1000, 10000);
        const k = Math.log(rocket.crashPoint) / duration;
        const mult = Math.min(Math.exp(k * elapsed), rocket.crashPoint);

        // Check if crashed
        const isCrashed = mult >= rocket.crashPoint;
        if (isCrashed && !crashedSet.has(rocket.index)) {
          crashedSet.add(rocket.index);
        }

        return {
          ...rocket,
          currentMultiplier: mult,
          isCrashed,
          history: [...rocket.history, { multiplier: mult, timestamp: elapsed }],
        };
      });

      return newStates;
    });

    // Check if all rockets have crashed
    if (crashedSet.size < initialStates.length) {
      requestAnimationFrame(animate);
    } else {
      setAllCrashed(true);
      setTimeout(() => {
        setIsPlaying(false);
      }, 2000);
    }
  };

  requestAnimationFrame(animate);
};
```

### Step 5: Add Rocket Count Slider to UI

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Add after the Target slider (around line 202):

```tsx
// PSEUDOCODE
{/* Rocket Count Slider */}
<div className="flex items-center justify-between bg-[#0a0a14] p-3 rounded-lg border border-gray-800/50">
  <span className="text-xs text-gray-500 uppercase font-bold w-16">Rockets</span>
  <div className="flex items-center flex-1 mx-4">
    <input
      type="range"
      min="1"
      max="10"
      step="1"
      value={rocketCount}
      onChange={(e) => setRocketCount(parseInt(e.target.value))}
      disabled={isPlaying}
      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dfinity-turquoise"
    />
  </div>
  <span className="text-lg text-white font-mono font-bold w-16 text-right">{rocketCount}</span>
</div>
```

### Step 6: Update Result Display

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Replace the result display section (lines 126-157) with multi-rocket version:

```tsx
// PSEUDOCODE
{/* Result Display */}
<div className="w-full max-w-lg mx-auto mb-2 min-h-[48px] flex items-center justify-center">
  {isPlaying ? (
    <div className="text-yellow-400 text-xs font-mono tracking-widest uppercase animate-pulse">
      {rocketStates.filter(r => !r.isCrashed).length} rockets flying...
    </div>
  ) : multiResult ? (
    <div className="flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase text-gray-500 font-bold">Rockets</span>
        <span className="text-xl font-bold text-white">{multiResult.rocket_count}</span>
      </div>
      <div className="h-8 w-px bg-gray-800"></div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase text-gray-500 font-bold">Reached Target</span>
        <span className={`text-xl font-bold ${multiResult.rockets_succeeded > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {multiResult.rockets_succeeded}/{multiResult.rocket_count}
        </span>
      </div>
      <div className="h-8 w-px bg-gray-800"></div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase text-gray-500 font-bold">Total Payout</span>
        <span className={`text-xl font-bold ${Number(multiResult.total_payout) > 0 ? 'text-green-400' : 'text-red-400'}`}>
          ${(Number(multiResult.total_payout) / 1_000_000).toFixed(2)}
        </span>
      </div>
    </div>
  ) : (
    <div className="text-gray-600 text-xs font-mono tracking-widest opacity-50 uppercase">
      Set target & rockets
    </div>
  )}
</div>
```

### Step 7: Update CrashCanvas Props

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Update the CrashCanvas component usage (around line 161):

```tsx
// PSEUDOCODE
<CrashCanvas
  rocketStates={rocketStates}
  targetMultiplier={targetCashout}
/>
```

### Step 8: Rewrite CrashCanvas for Multi-Rocket

**File:** `openhouse_frontend/src/components/game-specific/crash/CrashCanvas.tsx`

Complete rewrite to support multiple rockets:

```typescript
// PSEUDOCODE
import React, { useRef, useEffect, useState } from 'react';

// 10 distinct colors for rockets
const ROCKET_COLORS = [
  '#39FF14', // Lime green (original)
  '#FF6B6B', // Coral red
  '#4ECDC4', // Teal
  '#FFE66D', // Yellow
  '#FF8C00', // Orange
  '#E040FB', // Purple
  '#00BCD4', // Cyan
  '#FF4081', // Pink
  '#7C4DFF', // Indigo
  '#64FFDA', // Aqua
];

interface RocketState {
  index: number;
  crashPoint: number;
  reachedTarget: boolean;
  currentMultiplier: number;
  isCrashed: boolean;
  history: Array<{ multiplier: number; timestamp: number }>;
  startTime: number;
}

interface CrashCanvasProps {
  rocketStates: RocketState[];
  targetMultiplier?: number;
  width?: number;
  height?: number;
}

export const CrashCanvas: React.FC<CrashCanvasProps> = ({
  rocketStates,
  targetMultiplier,
  width = 800,
  height = 400
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rocketPositions, setRocketPositions] = useState<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height);

    // Draw target line if set
    if (targetMultiplier && targetMultiplier > 1) {
      drawTargetLine(ctx, targetMultiplier, canvas.width, canvas.height);
    }

    // Calculate max X across all rockets for consistent scaling
    const maxHistoryLength = Math.max(
      ...rocketStates.map(r => r.history.length),
      100
    );

    // Draw each rocket's trajectory
    const newPositions = new Map<number, { x: number; y: number }>();

    rocketStates.forEach((rocket) => {
      if (rocket.history.length === 0) return;

      const color = ROCKET_COLORS[rocket.index % ROCKET_COLORS.length];

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let lastX = 0;
      let lastY = height;

      rocket.history.forEach((point, i) => {
        const x = (i / maxHistoryLength) * width;
        const logMult = Math.log10(point.multiplier);
        const logMax = Math.log10(100);
        const y = height - (Math.min(logMult / logMax, 1) * height);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        lastX = x;
        lastY = y;
      });

      ctx.stroke();

      // Store rocket position
      newPositions.set(rocket.index, { x: lastX, y: lastY });
    });

    setRocketPositions(newPositions);

  }, [rocketStates, targetMultiplier, width, height]);

  // Find the highest current multiplier for display
  const maxCurrentMultiplier = Math.max(
    ...rocketStates.map(r => r.currentMultiplier),
    1.0
  );
  const anyFlying = rocketStates.some(r => !r.isCrashed);
  const allCrashed = rocketStates.length > 0 && rocketStates.every(r => r.isCrashed);

  return (
    <div className="relative bg-gradient-to-b from-pure-black to-dfinity-navy rounded-lg overflow-hidden border border-pure-white/20 shadow-2xl">
      {/* Stars Background */}
      <div className="absolute inset-0 opacity-50">
        {generateStars(50).map(star => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: star.style.left,
              top: star.style.top,
              width: star.style.width,
              height: star.style.height,
              opacity: star.style.opacity,
            }}
          />
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="relative z-10 w-full h-full"
      />

      {/* Rocket Elements - one for each rocket */}
      {rocketStates.map((rocket) => {
        const pos = rocketPositions.get(rocket.index);
        if (!pos) return null;

        const color = ROCKET_COLORS[rocket.index % ROCKET_COLORS.length];

        return (
          <div
            key={rocket.index}
            className="absolute z-20 pointer-events-none transition-transform duration-75 ease-linear will-change-transform"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) rotate(-45deg)`,
              left: 0,
              top: 0,
            }}
          >
            <div className={`relative ${rocket.isCrashed ? 'animate-ping' : ''}`}>
              {rocket.isCrashed ? (
                <div className="text-3xl">💥</div>
              ) : (
                <RocketSVG color={color} size={30} />
              )}
            </div>
          </div>
        );
      })}

      {/* Current Max Multiplier Display */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-30">
        <div className={`text-5xl font-bold font-mono ${allCrashed ? 'text-red-500' : 'text-white'} drop-shadow-lg`}>
          {maxCurrentMultiplier.toFixed(2)}x
        </div>
        {allCrashed && (
          <div className="text-red-400 font-bold text-xl mt-2 animate-bounce">
            ALL CRASHED
          </div>
        )}
      </div>

      {/* Rocket count indicator */}
      <div className="absolute top-2 right-2 flex gap-1 z-30">
        {rocketStates.map((rocket) => (
          <div
            key={rocket.index}
            className={`w-3 h-3 rounded-full ${rocket.isCrashed ? 'opacity-30' : ''}`}
            style={{ backgroundColor: ROCKET_COLORS[rocket.index % ROCKET_COLORS.length] }}
          />
        ))}
      </div>

      {/* Axes labels */}
      <div className="absolute bottom-2 right-2 text-xs text-pure-white/40 font-mono">
        Time
      </div>
      <div className="absolute top-2 left-2 text-xs text-pure-white/40 font-mono">
        Multiplier
      </div>
    </div>
  );
};

// Rocket SVG with customizable color
const RocketSVG: React.FC<{ color: string; size?: number }> = ({ color, size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 60 80" className="drop-shadow-glow">
    <path d="M30,0 L45,60 L15,60 Z" fill={color} />
    <path d="M15,60 L5,80 L15,70 Z" fill="#3B00B9" />
    <path d="M45,60 L55,80 L45,70 Z" fill="#3B00B9" />
    <circle cx="30" cy="30" r="8" fill="#FFFFFF" />
    <g className="animate-pulse">
      <path d="M20,70 L25,80 L30,75 L35,80 L40,70" fill="#F15A24" />
    </g>
  </svg>
);

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = height - (i * height / 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawTargetLine(
  ctx: CanvasRenderingContext2D,
  targetMultiplier: number,
  width: number,
  height: number
) {
  const logMult = Math.log10(targetMultiplier);
  const logMax = Math.log10(100);
  const y = height - (Math.min(logMult / logMax, 1) * height);

  // Green dashed line at target
  ctx.strokeStyle = '#22C55E';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = '#22C55E';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`TARGET ${targetMultiplier.toFixed(2)}x`, width - 120, y - 5);
}

function generateStars(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    style: {
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      width: `${Math.random() * 2 + 1}px`,
      height: `${Math.random() * 2 + 1}px`,
      opacity: Math.random() * 0.7 + 0.3,
    }
  }));
}

export { ROCKET_COLORS };
```

### Step 9: Update Stats Row

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Update the stats row (around lines 204-220) to show per-rocket info:

```tsx
// PSEUDOCODE
{/* Stats Row */}
<div className="flex items-center justify-between bg-[#0a0a14] rounded-lg p-3 border border-gray-800/50">
  <div className="flex flex-col items-center flex-1">
    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Chance</span>
    <span className="text-green-400 font-mono font-bold">
      {((0.99 / targetCashout) * 100).toFixed(1)}%
    </span>
    <span className="text-[8px] text-gray-600">per rocket</span>
  </div>
  <div className="h-6 w-px bg-gray-800"></div>
  <div className="flex flex-col items-center flex-1">
    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Target</span>
    <span className="text-yellow-400 font-mono font-bold">{targetCashout.toFixed(2)}x</span>
  </div>
  <div className="h-6 w-px bg-gray-800"></div>
  <div className="flex flex-col items-center flex-1">
    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Rockets</span>
    <span className="text-blue-400 font-mono font-bold">{rocketCount}</span>
  </div>
  <div className="h-6 w-px bg-gray-800"></div>
  <div className="flex flex-col items-center flex-1">
    <span className="text-[10px] text-gray-500 uppercase tracking-wider">House Edge</span>
    <span className="text-red-400 font-mono font-bold">1%</span>
  </div>
</div>
```

### Step 10: Update Button Label

**File:** `openhouse_frontend/src/pages/Crash.tsx`

Update the launch button (around line 223):

```tsx
// PSEUDOCODE
<GameButton
  onClick={startGame}
  disabled={!actor || !isAuthenticated || isPlaying}
  loading={isPlaying}
  label={`LAUNCH ${rocketCount} ROCKET${rocketCount > 1 ? 'S' : ''}`}
  loadingLabel={`${rocketStates.filter(r => !r.isCrashed).length} FLYING...`}
  icon="🚀"
/>
```

---

## Build & Deploy

```bash
cd /home/theseus/alexandria/openhouse-multi-rocket

# Sync declarations
dfx generate crash_backend
cp -r src/declarations/crash_backend/* openhouse_frontend/src/declarations/crash_backend/

# Build frontend
cd openhouse_frontend
npm run build

# Deploy
cd ..
./deploy.sh --frontend-only
```

---

## Testing (MANDATORY)

After deployment, manually test at https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/crash

### Test 1: Single rocket (backwards compatibility)
1. Set rockets to 1
2. Set target to 2x
3. Click LAUNCH
4. **Verify:** Single green trajectory, single rocket sprite

### Test 2: Multi-rocket basic
1. Set rockets to 5
2. Set target to 2x
3. Click LAUNCH
4. **Verify:** 5 different colored trajectories, 5 rocket sprites
5. **Verify:** Rockets crash at different heights

### Test 3: Staggered animation
1. Set rockets to 10
2. Set target to 5x
3. Click LAUNCH
4. **Verify:** Rockets launch with visible delay between them
5. **Verify:** Some explode early, others continue

### Test 4: Result display
1. After game completes
2. **Verify:** Shows "X/Y Reached Target"
3. **Verify:** Shows total payout

### Test 5: High target
1. Set rockets to 10
2. Set target to 50x
3. Click LAUNCH
4. **Verify:** Most rockets crash before target line
5. **Verify:** Maybe 1-2 reach target (statistically ~2% each)

### Test 6: Low target
1. Set rockets to 5
2. Set target to 1.1x
3. Click LAUNCH
4. **Verify:** Most/all rockets reach target (~90% each)

---

## Success Criteria

1. ✅ Rocket count slider works (1-10)
2. ✅ Multiple trajectories render in distinct colors
3. ✅ Multiple rocket sprites visible
4. ✅ Staggered launch animation (200ms delay)
5. ✅ Individual crash detection per rocket
6. ✅ Aggregate results display (X/Y succeeded)
7. ✅ Target line visible on canvas
8. ✅ No regression on single rocket mode

---

## Files Modified

| File | Changes |
|------|---------|
| `openhouse_frontend/src/pages/Crash.tsx` | Multi-rocket state, `play_crash_multi` call, animation, result display |
| `openhouse_frontend/src/components/game-specific/crash/CrashCanvas.tsx` | Multi-line rendering, multiple rockets, color palette |
| `openhouse_frontend/src/declarations/crash_backend/*` | Sync from backend |

---

## Affected Canisters

- **Frontend**: `pezw3-laaaa-aaaal-qssoa-cai` (MODIFIED)
- Crash Backend: Already deployed with `play_crash_multi`
