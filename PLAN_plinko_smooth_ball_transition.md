# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-smooth-transition"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-smooth-transition`
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
   git commit -m "fix(plinko): smooth ball transition from bucket to board"
   git push -u origin feature/plinko-smooth-ball-transition
   gh pr create --title "fix(plinko): Smooth ball transition from bucket to board" --body "Fixes the visual discontinuity where balls disappear from the bucket and reappear on the board.

## Problem
Balls in the bucket would vanish and new balls would appear on the plinko board because two separate physics engines were used with no coordinate transfer.

## Solution
Transfer ball positions and velocities from TunnelPhysicsEngine to PlinkoPhysicsEngine when releasing, creating seamless physics continuity.

## Changes
- TunnelPhysicsEngine: Added velocity tracking and gate removal
- TunnelFillingBalls: Added release callback with position/velocity data
- PlinkoEngine: Modified dropBall() to accept initial position/velocity
- PlinkoPhysicsBalls: Pass initial states to engine
- PlinkoGame: Orchestrate smooth handoff between engines

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

**Branch:** `feature/plinko-smooth-ball-transition`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-smooth-transition`

---

# Implementation Plan

## Problem Statement

Balls in the Plinko bucket disappear and reappear on the board instead of falling naturally through the gate opening. This happens because two separate Matter.js physics engines are used:

1. `TunnelPhysicsEngine` - balls settle in bucket (Y: 5-70)
2. `PlinkoPhysicsEngine` - balls on board (starts at Y: 60)

When switching engines, `TunnelFillingBalls` unmounts (balls vanish) and `PlinkoPhysicsBalls` mounts (new balls appear at different positions).

## Current State

### File: `TunnelPhysicsEngine.ts`
```
Location: openhouse_frontend/src/components/game-specific/plinko/TunnelPhysicsEngine.ts
Lines: 1-223

Current capabilities:
- getBallStates() returns {x, y, rotation} - NO velocity
- No method to remove gate
- Balls tracked in Map<number, Matter.Body>
```

### File: `TunnelFillingBalls.tsx`
```
Location: openhouse_frontend/src/components/game-specific/plinko/TunnelFillingBalls.tsx
Lines: 1-171

Current behavior:
- Returns null when isFilling=false (line 81)
- No release callback
- Balls immediately vanish on state change
```

### File: `PlinkoGame.tsx`
```
Location: openhouse_frontend/src/pages/plinko/PlinkoGame.tsx
Lines: 140-165 (tryReleaseBalls function)

Current flow:
1. setBucketOpen(true) - gate animation
2. After 300ms delay:
   - setPendingBalls(newBalls) - creates NEW balls
   - setIsFilling(false) - tunnel balls vanish
```

### File: `PlinkoEngine.ts`
```
Location: openhouse_frontend/src/components/game-specific/plinko/PlinkoEngine.ts
Lines: 395-428 (dropBall function)

Current behavior:
- Always starts balls at BALL_START_Y (60)
- Random X within pinDistanceX range
- No option for custom initial position/velocity
```

### File: `PlinkoPhysicsBalls.tsx`
```
Location: openhouse_frontend/src/components/game-specific/plinko/PlinkoPhysicsBalls.tsx
Lines: 74-91

Current behavior:
- Calls engine.dropBall(id, path) with no initial position
```

---

## Implementation

### Step 1: Enhance TunnelPhysicsEngine.ts

```typescript
// PSEUDOCODE - Add to TunnelPhysicsEngine class

// New interface for ball state with velocity
export interface TunnelBallStateWithVelocity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Add method to get ball states WITH velocity (around line 155)
public getBallStatesWithVelocity(): TunnelBallStateWithVelocity[] {
  const states: TunnelBallStateWithVelocity[] = [];
  for (const [id, ball] of this.balls) {
    states.push({
      id,
      x: ball.position.x,
      y: ball.position.y,
      vx: ball.velocity.x,
      vy: ball.velocity.y,
    });
  }
  return states;
}

// Add method to remove gate (around line 100, after createTunnelWalls)
private gate: Matter.Body | null = null;  // Store reference to gate

// Modify createTunnelWalls to store gate reference:
// Change: this.walls = [leftWall, rightWall, bottomWall];
// To: this.gate = bottomWall; this.walls = [leftWall, rightWall, bottomWall];

public removeGate(): void {
  if (this.gate) {
    Matter.Composite.remove(this.engine.world, this.gate);
    this.gate = null;
  }
}
```

### Step 2: Update TunnelFillingBalls.tsx

```typescript
// PSEUDOCODE - Modify TunnelFillingBalls component

// Add to props interface (around line 5-10)
interface TunnelFillingBallsProps {
  ballCount: number;
  isFilling: boolean;
  isReleasing?: boolean;  // NEW: trigger release animation
  onFillingComplete?: () => void;
  onRelease?: (states: TunnelBallStateWithVelocity[]) => void;  // NEW: callback with positions
  staggerMs?: number;
}

// Add useEffect to handle release (around line 50-56)
useEffect(() => {
  if (isReleasing && engineRef.current) {
    // Get ball states with velocity before they fall
    const states = engineRef.current.getBallStatesWithVelocity();
    onRelease?.(states);
    // Remove gate so balls fall through
    engineRef.current.removeGate();
  }
}, [isReleasing, onRelease]);

// Modify the return condition (line 81)
// OLD: if (!isFilling || ballStates.size === 0) return null;
// NEW: if ((!isFilling && !isReleasing) || ballStates.size === 0) return null;

// Add fade-out animation when releasing (wrap the balls in motion.g)
// Around line 116-120
<motion.g
  animate={{ opacity: isReleasing ? 0 : 1 }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
>
  {Array.from(ballStates.entries()).map(([id, state]) => (
    <TunnelBall key={id} state={state} />
  ))}
</motion.g>
```

### Step 3: Modify PlinkoEngine.ts dropBall()

```typescript
// PSEUDOCODE - Modify dropBall method (lines 395-428)

// Change signature to accept optional initial state
public dropBall(
  id: number,
  path: boolean[],
  initialState?: { x: number; y: number; vx: number; vy: number }
): void {
  const { rows, width } = this.options;
  const { BALL_START_Y } = PLINKO_LAYOUT;

  // Calculate target slot from backend path
  const targetSlot = path.filter(v => v).length;
  this.ballTargets.set(id, targetSlot);

  const ballRadius = this.pinRadius * 2;
  const frictionAir = PlinkoPhysicsEngine.frictionAirByRowCount[rows] ?? 0.04;

  // Determine start position
  let startX: number;
  let startY: number;
  let initialVelocity = { x: 0, y: 0 };

  if (initialState) {
    // Use provided position and velocity from tunnel
    startX = initialState.x;
    startY = initialState.y;
    initialVelocity = { x: initialState.vx, y: initialState.vy };
  } else {
    // Default behavior: random X at BALL_START_Y
    const ballOffsetRangeX = this.pinDistanceX * 0.8;
    const minX = width / 2 - ballOffsetRangeX;
    const maxX = width / 2 + ballOffsetRangeX;
    startX = minX + Math.random() * (maxX - minX);
    startY = BALL_START_Y;
  }

  const ball = Matter.Bodies.circle(startX, startY, ballRadius, {
    restitution: 0.8,
    friction: 0.5,
    frictionAir: frictionAir,
    collisionFilter: {
      category: PlinkoPhysicsEngine.BALL_CATEGORY,
      mask: PlinkoPhysicsEngine.PIN_CATEGORY,
    },
    label: `ball_${id}`,
  });

  // Apply initial velocity if provided
  if (initialState) {
    Matter.Body.setVelocity(ball, initialVelocity);
  }

  Matter.Composite.add(this.engine.world, ball);
  this.balls.set(id, ball);
}
```

### Step 4: Update PlinkoPhysicsBalls.tsx

```typescript
// PSEUDOCODE - Modify PlinkoPhysicsBalls component

// Add to props interface (around line 10-16)
interface PlinkoPhysicsBallsProps {
  rows: number;
  pendingBalls: PendingBall[];
  initialStates?: Map<number, { x: number; y: number; vx: number; vy: number }>;  // NEW
  onAllBallsLanded: () => void;
  onBallLanded?: (slotIndex: number) => void;
  staggerMs?: number;
}

// Modify the drop effect (around lines 83-90)
pendingBalls.forEach((ball, index) => {
  setTimeout(() => {
    if (engineRef.current && !droppedBallsRef.current.has(ball.id)) {
      droppedBallsRef.current.add(ball.id);
      // Get initial state if available
      const initialState = initialStates?.get(ball.id);
      engineRef.current.dropBall(ball.id, ball.path, initialState);
    }
  }, index * staggerMs);
});
```

### Step 5: Update PlinkoGame.tsx

```typescript
// PSEUDOCODE - Modify PlinkoGame component

// Add state for tunnel ball states (around line 83-89)
const [tunnelBallStates, setTunnelBallStates] = useState<Map<number, { x: number; y: number; vx: number; vy: number }>>(new Map());
const [isReleasing, setIsReleasing] = useState(false);

// Add callback for tunnel release (around line 171)
const handleTunnelRelease = useCallback((states: TunnelBallStateWithVelocity[]) => {
  // Create map indexed by position (we'll map to ball IDs when creating pending balls)
  const stateMap = new Map<number, { x: number; y: number; vx: number; vy: number }>();
  states.forEach((state, index) => {
    stateMap.set(index, { x: state.x, y: state.y, vx: state.vx, vy: state.vy });
  });
  setTunnelBallStates(stateMap);
}, []);

// Modify tryReleaseBalls (lines 140-165)
const tryReleaseBalls = useCallback(() => {
  if (fillingCompleteRef.current && backendResultsRef.current) {
    const results = backendResultsRef.current;

    // Open the bucket door AND trigger release
    setBucketOpen(true);
    setIsReleasing(true);  // This triggers position capture + gate removal

    // Wait for door animation + position capture, then start board balls
    setTimeout(() => {
      const newBalls: PendingBall[] = results.map((r, i) => ({
        id: nextBallId + i,
        path: r.path,
      }));

      // Map tunnel states to new ball IDs
      const mappedStates = new Map<number, { x: number; y: number; vx: number; vy: number }>();
      tunnelBallStates.forEach((state, index) => {
        if (index < newBalls.length) {
          mappedStates.set(nextBallId + index, state);
        }
      });
      setTunnelBallStates(mappedStates);

      setPendingBalls(newBalls);
      setNextBallId(prev => prev + results.length);
      setIsWaiting(false);
      setIsPlaying(true);

      // Delay hiding tunnel balls to allow fade-out
      setTimeout(() => {
        setIsFilling(false);
        setIsReleasing(false);
        setTunnelBallStates(new Map());
      }, 150);  // Match fade-out duration

      fillingCompleteRef.current = false;
      backendResultsRef.current = null;
    }, PLINKO_LAYOUT.BUCKET_OPEN_MS);
  }
}, [nextBallId, tunnelBallStates]);

// Update TunnelFillingBalls usage (around line 353-358)
<TunnelFillingBalls
  ballCount={ballCount}
  isFilling={isFilling}
  isReleasing={isReleasing}
  onFillingComplete={handleFillingComplete}
  onRelease={handleTunnelRelease}
  staggerMs={60}
/>

// Update PlinkoPhysicsBalls usage (around line 361-369)
{pendingBalls.length > 0 && (
  <PlinkoPhysicsBalls
    rows={ROWS}
    pendingBalls={pendingBalls}
    initialStates={tunnelBallStates}
    onAllBallsLanded={handleAllBallsLanded}
    onBallLanded={handleBallLanded}
    staggerMs={PLINKO_LAYOUT.BALL_STAGGER_MS}
  />
)}
```

---

## Files Modified Summary

| File | Type | Lines Changed |
|------|------|---------------|
| `openhouse_frontend/src/components/game-specific/plinko/TunnelPhysicsEngine.ts` | MODIFY | +25 lines |
| `openhouse_frontend/src/components/game-specific/plinko/TunnelFillingBalls.tsx` | MODIFY | +20 lines |
| `openhouse_frontend/src/components/game-specific/plinko/PlinkoEngine.ts` | MODIFY | +15 lines |
| `openhouse_frontend/src/components/game-specific/plinko/PlinkoPhysicsBalls.tsx` | MODIFY | +5 lines |
| `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx` | MODIFY | +30 lines |

## Expected Result

After implementation:
1. Balls pile up in bucket with physics (existing behavior)
2. Backend responds, gate opens
3. Gate is removed from physics world
4. Ball positions AND velocities are captured
5. Board balls are created at exact same positions with same velocities
6. Tunnel balls fade out while board balls seamlessly continue
7. Balls fall through pin grid with continuous physics

Visual result: Balls appear to fall naturally through the opening gate with no teleportation.
