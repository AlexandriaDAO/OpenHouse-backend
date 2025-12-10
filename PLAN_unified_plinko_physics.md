# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-unified-physics"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-unified-physics`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend && npm run build && cd ..
   ./deploy.sh --frontend-only
   ```
4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(plinko): unify physics engines for seamless ball transition"
   git push -u origin feature/plinko-unified-physics
   gh pr create --title "Plinko: Unified Physics Engine" --body "$(cat <<'EOF'
## Summary
- Merges TunnelPhysicsEngine into PlinkoPhysicsEngine for seamless ball animation
- Balls now fall naturally from bucket through pegs without disappearing
- Removes the visual glitch where balls would teleport from bucket to board

## Changes
- Modified `PlinkoEngine.ts` to include bucket geometry (walls + gate)
- Simplified `PlinkoPhysicsBalls.tsx` to handle filling phase
- Removed `TunnelPhysicsEngine.ts` and `TunnelFillingBalls.tsx`
- Updated `PlinkoGame.tsx` for simpler state management

## Test Plan
- [ ] Drop 1 ball - should fall smoothly from bucket through pegs
- [ ] Drop 10 balls - all should queue in bucket then fall through
- [ ] Drop 30 balls - verify bucket handles high count gracefully

Deployed to mainnet: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
EOF
)"
   ```
6. **Iterate autonomously** - Fix any P0 issues from review

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/plinko-unified-physics`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-unified-physics`

---

# Implementation Plan: Unified Plinko Physics Engine

## Problem Statement

Balls disappear and reappear when transitioning from the bucket to the board because there are **two separate Matter.js physics engines**:
1. `TunnelPhysicsEngine` - Controls balls in the bucket
2. `PlinkoPhysicsEngine` - Controls balls on the board

When balls are "released", we:
1. Read positions from TunnelPhysicsEngine
2. Destroy those ball objects
3. Create NEW ball objects in PlinkoPhysicsEngine

No matter how we time it, there's always a visual discontinuity because they're different ball objects in different physics worlds.

## Solution

**Merge everything into ONE physics engine.** The bucket walls, gate, pegs, and balls all exist in a single Matter.js world. When the gate opens, the same ball objects fall naturally from the bucket onto the pegs below.

## Current File Structure

```
openhouse_frontend/src/components/game-specific/plinko/
├── PlinkoEngine.ts          # Board physics (MODIFY - add bucket)
├── TunnelPhysicsEngine.ts   # Bucket physics (DELETE)
├── PlinkoPhysicsBalls.tsx   # Renders board balls (MODIFY - handle filling)
├── TunnelFillingBalls.tsx   # Renders bucket balls (DELETE)
├── ReleaseTunnel.tsx        # Visual bucket structure (KEEP - visual only)
├── PlinkoBoard.tsx          # Static pegs/slots (KEEP)
├── plinkoAnimations.ts      # Layout constants (KEEP)
├── index.ts                 # Exports (MODIFY)
└── ...

openhouse_frontend/src/pages/plinko/
└── PlinkoGame.tsx           # Main orchestrator (MODIFY - simplify)
```

## Implementation Steps

### Step 1: Modify `PlinkoEngine.ts` - Add Bucket Geometry

Add bucket walls and gate to the existing physics engine.

```typescript
// PSEUDOCODE - Add to PlinkoPhysicsEngine class

// New properties
private bucketWalls: Matter.Body[] = [];
private bucketGate: Matter.Body | null = null;
private isBucketOpen = false;

// New constants (add to class)
private static BUCKET = {
  TOP_Y: 5,
  BOTTOM_Y: 70,
  WIDTH: 140,
  GATE_HEIGHT: 4,
};

// New method: createBucket()
private createBucket() {
  const { BUCKET } = PlinkoPhysicsEngine;
  const centerX = this.options.width / 2;
  const boxHeight = BUCKET.BOTTOM_Y - BUCKET.TOP_Y;
  const halfWidth = BUCKET.WIDTH / 2;

  // Left wall
  const leftWall = Matter.Bodies.rectangle(
    centerX - halfWidth - 4,
    BUCKET.TOP_Y + boxHeight / 2,
    8,
    boxHeight + 40,
    { isStatic: true }
  );

  // Right wall
  const rightWall = Matter.Bodies.rectangle(
    centerX + halfWidth + 4,
    BUCKET.TOP_Y + boxHeight / 2,
    8,
    boxHeight + 40,
    { isStatic: true }
  );

  // Gate (floor of bucket)
  const gate = Matter.Bodies.rectangle(
    centerX,
    BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT / 2,
    BUCKET.WIDTH + 20,
    BUCKET.GATE_HEIGHT + 4,
    { isStatic: true }
  );

  this.bucketWalls = [leftWall, rightWall];
  this.bucketGate = gate;
  Matter.Composite.add(this.engine.world, [...this.bucketWalls, gate]);
}

// New method: dropBallIntoBucket()
public dropBallIntoBucket(id: number, delay: number = 0): void {
  const { BUCKET } = PlinkoPhysicsEngine;
  const centerX = this.options.width / 2;

  setTimeout(() => {
    const boxHalfWidth = BUCKET.WIDTH / 2 - 8 - 4;
    const startX = centerX + (Math.random() * 2 - 1) * boxHalfWidth;
    const startY = -20 - Math.random() * 30;

    const ball = Matter.Bodies.circle(startX, startY, this.pinRadius * 2, {
      restitution: 0.4,
      friction: 0.3,
      frictionAir: 0.02,
      collisionFilter: {
        category: PlinkoPhysicsEngine.BALL_CATEGORY,
        mask: PlinkoPhysicsEngine.PIN_CATEGORY,
      },
      label: `ball_${id}`,
    });

    Matter.Body.setVelocity(ball, {
      x: (Math.random() - 0.5) * 2,
      y: 2 + Math.random() * 2,
    });

    Matter.Composite.add(this.engine.world, ball);
    this.balls.set(id, ball);
  }, delay);
}

// New method: openBucket()
public openBucket(): void {
  if (this.bucketGate && !this.isBucketOpen) {
    Matter.Composite.remove(this.engine.world, this.bucketGate);
    this.bucketGate = null;
    this.isBucketOpen = true;
  }
}

// New method: resetBucket()
public resetBucket(): void {
  // Remove old walls
  if (this.bucketWalls.length > 0) {
    Matter.Composite.remove(this.engine.world, this.bucketWalls);
  }
  this.bucketWalls = [];
  this.bucketGate = null;
  this.isBucketOpen = false;

  // Recreate bucket for next round
  this.createBucket();
}

// New method: assignPathToBall()
public assignPathToBall(id: number, path: boolean[]): void {
  const targetSlot = path.filter(v => v).length;
  this.ballTargets.set(id, targetSlot);
}

// Modify constructor to call createBucket()
constructor(options: PhysicsEngineOptions) {
  // ... existing code ...
  this.placePinsAndWalls();
  this.createBucket();  // ADD THIS
  this.createSensor();
  this.setupCollisionHandling();
}
```

### Step 2: Modify `PlinkoPhysicsBalls.tsx` - Handle Filling Phase

Update to handle both filling and playing phases.

```typescript
// PSEUDOCODE - New props
interface PlinkoPhysicsBallsProps {
  rows: number;
  // For filling phase
  isFilling?: boolean;
  fillBallCount?: number;
  onFillingComplete?: () => void;
  // For playing phase
  pendingBalls?: PendingBall[];
  onAllBallsLanded: () => void;
  onBallLanded?: (slotIndex: number) => void;
  // Bucket control
  isReleasing?: boolean;
  staggerMs?: number;
}

// Modify component logic:
// 1. When isFilling=true, call engine.dropBallIntoBucket() for each ball
// 2. When isReleasing=true, call engine.openBucket() and engine.assignPathToBall() for each
// 3. Continue tracking balls until they land

useEffect(() => {
  if (isFilling && fillBallCount > 0) {
    // Drop balls into bucket with stagger
    for (let i = 0; i < fillBallCount; i++) {
      engineRef.current?.dropBallIntoBucket(i, i * staggerMs);
    }
  }
}, [isFilling, fillBallCount]);

useEffect(() => {
  if (isReleasing && pendingBalls) {
    // Open bucket gate
    engineRef.current?.openBucket();

    // Assign paths to existing balls (steering will guide them)
    pendingBalls.forEach((ball, index) => {
      engineRef.current?.assignPathToBall(index, ball.path);
    });
  }
}, [isReleasing, pendingBalls]);
```

### Step 3: Modify `PlinkoGame.tsx` - Simplify Orchestration

Remove tunnel-specific state and use unified physics.

```typescript
// PSEUDOCODE - Remove these imports/state:
// - TunnelFillingBalls
// - tunnelBallStates
// - handleTunnelRelease

// Simplify to:
const [isFilling, setIsFilling] = useState(false);
const [isReleasing, setIsReleasing] = useState(false);
const [pendingBalls, setPendingBalls] = useState<PendingBall[]>([]);

// When user clicks to play:
const dropBalls = async () => {
  setIsFilling(true);  // Start filling animation

  // Call backend...
  const results = await actor.play_multi_plinko(...);

  // When backend responds and balls settled:
  setPendingBalls(results.map(...));
  setIsReleasing(true);  // Open bucket, balls fall through
  setIsFilling(false);
};

// In JSX - replace TunnelFillingBalls + PlinkoPhysicsBalls with single component:
<PlinkoPhysicsBalls
  rows={ROWS}
  isFilling={isFilling}
  fillBallCount={ballCount}
  isReleasing={isReleasing}
  pendingBalls={pendingBalls}
  onFillingComplete={handleFillingComplete}
  onAllBallsLanded={handleAllBallsLanded}
  onBallLanded={handleBallLanded}
  staggerMs={60}
/>
```

### Step 4: Update `index.ts` - Remove Tunnel Exports

```typescript
// REMOVE these lines:
// export { TunnelFillingBalls } from './TunnelFillingBalls';
// export * from './TunnelPhysicsEngine';
```

### Step 5: Delete Tunnel Files

```bash
rm openhouse_frontend/src/components/game-specific/plinko/TunnelPhysicsEngine.ts
rm openhouse_frontend/src/components/game-specific/plinko/TunnelFillingBalls.tsx
```

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `PlinkoEngine.ts` | MODIFY | Add bucket geometry, dropBallIntoBucket(), openBucket(), assignPathToBall() |
| `PlinkoPhysicsBalls.tsx` | MODIFY | Handle isFilling and isReleasing phases |
| `PlinkoGame.tsx` | MODIFY | Remove tunnel state, simplify orchestration |
| `index.ts` | MODIFY | Remove tunnel exports |
| `TunnelPhysicsEngine.ts` | DELETE | No longer needed |
| `TunnelFillingBalls.tsx` | DELETE | No longer needed |

## Visual Result

**Before:** Balls in bucket (TunnelPhysicsEngine) → disappear → reappear on board (PlinkoPhysicsEngine)

**After:** Balls drop into bucket → gate opens → same balls fall through pegs → land in slots (all in one PlinkoPhysicsEngine)

## Key Benefits

1. **No visual discontinuity** - Same ball objects throughout
2. **Simpler code** - 2 files deleted, ~150 lines removed
3. **More realistic physics** - Natural gravity transition from bucket to board
4. **Easier maintenance** - Single physics engine to debug

## Testing Checklist

- [ ] Single ball drops smoothly from bucket through board
- [ ] Multiple balls (10) queue in bucket, fall through gate when opened
- [ ] High ball count (30) doesn't cause performance issues
- [ ] Balls land in correct slots (steering still works)
- [ ] Multiplier highlights when balls land
- [ ] Balance updates correctly after game
