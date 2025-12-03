# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-physics"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-physics`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Frontend changes only (backend unchanged):
     ```bash
     cd openhouse_frontend
     npm install  # Install matter-js
     npm run build
     cd ..
     ./deploy.sh --frontend-only
     ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
   echo "Check that balls use realistic physics with Matter.js"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: Replace Plinko CSS animation with Matter.js physics engine

Replaces custom physics simulation with Matter.js for realistic ball physics.
- Install matter-js as dependency
- Create physics world with gravity and boundaries
- Add pegs as static circular bodies
- Balls follow predetermined paths via Matter.js constraints
- Improved visual realism with actual collision physics
- Maintains same game mechanics (backend provides paths)"
   git push -u origin feature/plinko-matter-physics
   gh pr create --title "[Feature]: Replace Plinko with Matter.js Physics" --body "Implements PLAN_plinko_matter_physics.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
- Affected components: PlinkoBoard.tsx, package.json
- No backend changes

## Changes
- Replaced custom physics simulation with Matter.js
- Real physics collisions with pegs
- Realistic bouncing and gravity
- Balls follow predetermined paths from backend
- Visual improvements with physics-based movement

## Testing
Manual verification on mainnet required:
- Drop single ball - should bounce realistically through pegs
- Drop multiple balls - should all follow their paths
- Verify multipliers display correctly
- Check mobile responsiveness"
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

**Branch:** `feature/plinko-matter-physics`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-physics`

---

# Implementation Plan: Plinko Matter.js Physics Engine

## Overview
Replace the custom CSS-based physics simulation in PlinkoBoard.tsx with the Matter.js physics engine for realistic, accurate physics rendering. The backend remains unchanged - it still provides predetermined paths via IC VRF. Matter.js will render balls following those paths with real collision physics.

## Current State Analysis

### File Structure
```
openhouse_frontend/
├── src/
│   ├── components/
│   │   └── game-specific/
│   │       └── plinko/
│   │           ├── PlinkoBoard.tsx        # Custom physics (310 lines)
│   │           └── PlinkoBoard.css        # CSS styling (278 lines)
│   └── pages/
│       └── Plinko.tsx                     # Main game page
├── package.json                           # Dependencies
└── ...
```

### Current Implementation Problems

**PlinkoBoard.tsx:27-33** - Manual physics constants:
```typescript
const GRAVITY = 0.6;
const BOUNCE_DAMPING = 0.5;
const PEG_SPACING_X = 40;
const PEG_SPACING_Y = 50;
const DROP_ZONE_HEIGHT = 60;
```
- Arbitrary values with no physical accuracy
- No collision detection library
- Manual bounce calculations

**PlinkoBoard.tsx:92-159** - Custom animation loop:
```typescript
const animate = (currentTime: number) => {
  // Manual gravity application
  velocityY += GRAVITY * deltaTime;
  yOffset += velocityY * deltaTime;

  // Manual bounce detection
  if (yOffset >= targetY && row >= 0) {
    velocityY = -velocityY * BOUNCE_DAMPING;
  }
  // ... 60+ lines of manual physics
}
```
- No real collision detection
- Fake "bounce" by velocity reversal
- Balls don't actually interact with pegs physically

**PlinkoBoard.css:102-112** - CSS-based rendering:
```css
.plinko-peg {
  position: absolute;
  width: 10px;
  height: 10px;
  background: radial-gradient(...);
  /* Just visual decoration, no physics interaction */
}
```

### Backend (No Changes Required)
The backend is perfect and requires **NO MODIFICATIONS**:
- `drop_ball()` returns path as `Vec<bool>` (left/right decisions)
- `drop_multiple_balls(n)` returns multiple paths
- IC VRF provides cryptographically secure randomness
- Pure mathematical multipliers

## Matter.js Integration Strategy

### Dependencies
Add to `package.json`:
```json
"dependencies": {
  "matter-js": "^0.19.0",
  "@types/matter-js": "^0.19.7"
}
```

### Architecture Changes

**Before (Custom Physics):**
```
Backend Path → React State → Manual Animation Loop → CSS Positioning
```

**After (Matter.js):**
```
Backend Path → React State → Matter.js World → Physics Simulation → Canvas Rendering
```

### Key Design Decisions

1. **Predetermined Paths**: Backend provides path, Matter.js renders it
   - Apply subtle forces to guide ball left/right per backend path
   - Maintain deterministic outcomes for fairness
   - Let Matter.js handle realistic collision physics

2. **Rendering Approach**: Canvas overlay with React controls
   - Matter.js Render on HTML5 Canvas
   - React UI overlays for bucket, multipliers, slots
   - Canvas handles only balls and pegs

3. **Responsive Design**: Scale physics world to viewport
   - Maintain constant physics proportions
   - Scale canvas dimensions for mobile
   - Keep peg spacing ratios constant

## Implementation Plan

### Phase 1: Setup Matter.js Infrastructure

**File: `openhouse_frontend/package.json` (MODIFY)**
```json
// PSEUDOCODE - Add dependencies
{
  "dependencies": {
    // ... existing dependencies
    "matter-js": "^0.19.0"
  },
  "devDependencies": {
    // ... existing devDependencies
    "@types/matter-js": "^0.19.7"
  }
}
```

### Phase 2: Create Matter.js Physics Hook

**File: `openhouse_frontend/src/hooks/usePlinkoPhysics.ts` (NEW)**
```typescript
// PSEUDOCODE - Matter.js physics management hook
import Matter from 'matter-js';
import { useEffect, useRef, useState } from 'react';

interface PhysicsConfig {
  rows: number;
  pegSpacingX: number;
  pegSpacingY: number;
  ballRadius: number;
  pegRadius: number;
}

interface BallPath {
  id: number;
  path: boolean[]; // Backend-provided path
}

export function usePlinkoPhysics(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  config: PhysicsConfig,
  onBallLanded: (ballId: number, position: number) => void
) {
  // Create Matter.js engine
  const engineRef = useRef<Matter.Engine>();
  const renderRef = useRef<Matter.Render>();
  const pegsRef = useRef<Matter.Body[]>([]);
  const ballsRef = useRef<Map<number, Matter.Body>>(new Map());

  useEffect(() => {
    // Initialize Matter.js engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.0 } // Realistic gravity
    });

    // Create renderer
    const render = Matter.Render.create({
      canvas: canvasRef.current!,
      engine: engine,
      options: {
        width: canvasWidth,
        height: canvasHeight,
        wireframes: false,
        background: 'transparent'
      }
    });

    // Create pegs as static circles
    const pegs: Matter.Body[] = [];
    for (let row = 0; row <= config.rows; row++) {
      const pegsInRow = row + 1;
      for (let col = 0; col < pegsInRow; col++) {
        const x = calculatePegX(row, col);
        const y = calculatePegY(row);

        const peg = Matter.Bodies.circle(x, y, config.pegRadius, {
          isStatic: true,
          restitution: 0.8, // Bounciness
          render: {
            fillStyle: '#48D1CC',
            strokeStyle: '#48D1CC',
            lineWidth: 2
          }
        });

        pegs.push(peg);
      }
    }

    Matter.World.add(engine.world, pegs);
    pegsRef.current = pegs;

    // Create walls/boundaries
    const walls = createBoundaryWalls(canvasWidth, canvasHeight);
    Matter.World.add(engine.world, walls);

    // Start physics engine
    Matter.Engine.run(engine);
    Matter.Render.run(render);

    engineRef.current = engine;
    renderRef.current = render;

    // Cleanup
    return () => {
      Matter.Render.stop(render);
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
    };
  }, [config]);

  // Function to drop ball with predetermined path
  const dropBall = (ballData: BallPath) => {
    const ball = Matter.Bodies.circle(
      centerX, // Start at top center
      dropZoneY,
      config.ballRadius,
      {
        restitution: 0.6,
        friction: 0.001,
        render: {
          fillStyle: '#FFD700',
          strokeStyle: '#FFA500',
          lineWidth: 2
        },
        // Custom data to track path following
        plugin: {
          ballId: ballData.id,
          targetPath: ballData.path,
          currentStep: 0
        }
      }
    );

    Matter.World.add(engineRef.current!.world, ball);
    ballsRef.current.set(ballData.id, ball);

    // Add collision detection for path following
    Matter.Events.on(engineRef.current!, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;

        // Check if ball hit a peg
        if (isBall(bodyA) && isPeg(bodyB)) {
          handleBallPegCollision(bodyA, bodyB, ballData.path);
        }
      });
    });

    // Detect when ball reaches bottom
    Matter.Events.on(engineRef.current!, 'afterUpdate', () => {
      if (ball.position.y > bottomThreshold) {
        const finalPosition = calculateFinalPosition(ball.position.x);
        onBallLanded(ballData.id, finalPosition);

        // Remove ball after landing
        setTimeout(() => {
          Matter.World.remove(engineRef.current!.world, ball);
          ballsRef.current.delete(ballData.id);
        }, 500);
      }
    });
  };

  // Guide ball to follow predetermined path
  const handleBallPegCollision = (
    ball: Matter.Body,
    peg: Matter.Body,
    path: boolean[]
  ) => {
    const currentStep = ball.plugin.currentStep;

    if (currentStep < path.length) {
      const shouldGoRight = path[currentStep];

      // Apply subtle force to guide ball left or right
      const forceMagnitude = 0.002;
      const forceX = shouldGoRight ? forceMagnitude : -forceMagnitude;

      Matter.Body.applyForce(ball, ball.position, {
        x: forceX,
        y: 0
      });

      ball.plugin.currentStep++;
    }
  };

  return {
    dropBall,
    clearBalls: () => {
      ballsRef.current.forEach((ball) => {
        Matter.World.remove(engineRef.current!.world, ball);
      });
      ballsRef.current.clear();
    }
  };
}
```

### Phase 3: Rewrite PlinkoBoard Component

**File: `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx` (MODIFY)**
```typescript
// PSEUDOCODE - Simplified component using Matter.js
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePlinkoPhysics } from '../../../hooks/usePlinkoPhysics';
import './PlinkoBoard.css';

interface PlinkoBoardProps {
  rows: number;
  paths: boolean[][] | null;
  isDropping: boolean;
  onAnimationComplete?: () => void;
  finalPositions?: number[];
  multipliers?: number[];
  ballCount: number;
  onDrop: () => void;
  disabled: boolean;
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  rows,
  paths,
  isDropping,
  onAnimationComplete,
  finalPositions,
  multipliers,
  ballCount,
  onDrop,
  disabled,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [landedBalls, setLandedBalls] = useState<Set<number>>(new Set());
  const [bucketTilt, setBucketTilt] = useState(0);

  // Physics configuration
  const physicsConfig = {
    rows,
    pegSpacingX: 40,
    pegSpacingY: 50,
    ballRadius: 8,
    pegRadius: 5
  };

  // Handle ball landing
  const handleBallLanded = useCallback((ballId: number, position: number) => {
    setLandedBalls(prev => new Set(prev).add(ballId));
  }, []);

  // Initialize Matter.js physics
  const { dropBall, clearBalls } = usePlinkoPhysics(
    canvasRef,
    physicsConfig,
    handleBallLanded
  );

  // Drop balls when paths arrive
  useEffect(() => {
    if (!paths || paths.length === 0 || !isDropping) {
      if (!isDropping) {
        clearBalls();
        setLandedBalls(new Set());
        setBucketTilt(0);
      }
      return;
    }

    // Tilt bucket
    setBucketTilt(45);
    setTimeout(() => setBucketTilt(0), 400);

    // Drop each ball with stagger
    paths.forEach((path, index) => {
      setTimeout(() => {
        dropBall({ id: index, path });
      }, index * 200); // 200ms stagger between balls
    });
  }, [paths, isDropping, dropBall, clearBalls]);

  // Check if all balls landed
  useEffect(() => {
    if (paths && landedBalls.size === paths.length) {
      setTimeout(() => {
        onAnimationComplete?.();
      }, 300);
    }
  }, [landedBalls, paths, onAnimationComplete]);

  const handleBucketClick = () => {
    if (disabled || isDropping) return;
    onDrop();
  };

  const boardHeight = 60 + rows * 50 + 120;

  return (
    <div className="plinko-board-container">
      <div className="plinko-board" style={{ height: `${boardHeight}px` }}>

        {/* Tipping Bucket (React UI) */}
        <div
          className={`plinko-bucket ${disabled || isDropping ? 'bucket-disabled' : ''}`}
          style={{ transform: `rotate(${bucketTilt}deg)` }}
          onClick={handleBucketClick}
        >
          <div className="bucket-body">
            <div className="bucket-balls">
              {Array.from({ length: Math.min(ballCount, 10) }).map((_, i) => (
                <div
                  key={i}
                  className="bucket-ball"
                  style={{
                    left: `${10 + (i % 5) * 12}px`,
                    bottom: `${4 + Math.floor(i / 5) * 10}px`,
                  }}
                />
              ))}
            </div>
            {ballCount > 10 && (
              <span className="bucket-count">+{ballCount - 10}</span>
            )}
          </div>
          <div className="bucket-label">
            {isDropping ? '...' : ballCount > 1 ? `×${ballCount}` : 'TAP'}
          </div>
        </div>

        {/* Matter.js Canvas (Physics Rendering) */}
        <canvas
          ref={canvasRef}
          className="plinko-physics-canvas"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        />

        {/* Landing slots (React UI) */}
        <div
          className="plinko-slots"
          style={{ top: `${60 + rows * 50 + 30}px` }}
        >
          {Array.from({ length: rows + 1 }, (_, i) => (
            <div
              key={`slot-${i}`}
              className={`plinko-slot ${
                !isDropping && finalPositions?.includes(i) ? 'plinko-slot-active' : ''
              }`}
              style={{
                left: `calc(50% + ${(i - rows / 2) * 40}px)`,
              }}
            >
              {!isDropping && finalPositions && (() => {
                const count = finalPositions.filter(p => p === i).length;
                return count > 1 ? <span className="slot-count">{count}</span> : null;
              })()}
            </div>
          ))}
        </div>

        {/* Multiplier labels (React UI) */}
        {multipliers && multipliers.length > 0 && (
          <div
            className="plinko-multiplier-labels"
            style={{ top: `${60 + rows * 50 + 70}px` }}
          >
            {multipliers.map((mult, index) => {
              const isHighlighted = !isDropping && finalPositions?.includes(index);
              const isWin = mult >= 1.0;

              return (
                <div
                  key={`mult-${index}`}
                  className={`plinko-multiplier-label ${isWin ? 'win-multiplier' : 'lose-multiplier'} ${isHighlighted ? 'highlighted' : ''}`}
                  style={{
                    left: `calc(50% + ${(index - rows / 2) * 40}px)`,
                  }}
                >
                  {mult.toFixed(2)}x
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
```

### Phase 4: Update CSS for Canvas Integration

**File: `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.css` (MODIFY)**
```css
/* PSEUDOCODE - Simplify CSS, remove manual positioning */

.plinko-board-container {
  width: 100%;
  overflow: visible;
  padding: 0;
  display: flex;
  justify-content: center;
}

.plinko-board {
  position: relative;
  width: 800px;
  margin: 0 auto;
  background: transparent;
}

/* Matter.js canvas */
.plinko-physics-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

/* Keep existing bucket, slots, multiplier styles */
/* Remove .plinko-peg and .plinko-ball styles (now rendered by Matter.js) */

/* ... rest of existing CSS ... */
```

### Phase 5: Testing & Verification

**Manual Tests** (Run on mainnet after deployment):
1. **Single Ball Drop**:
   - Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
   - Drop 1 ball
   - Verify realistic physics bounce
   - Check multiplier matches final position

2. **Multi-Ball Drop**:
   - Drop 10 balls
   - Verify staggered drops (200ms intervals)
   - Check all balls follow their paths
   - Verify final positions match backend results

3. **Mobile Responsiveness**:
   - Test on mobile viewport
   - Verify canvas scales correctly
   - Check touch interactions with bucket

4. **Performance**:
   - Drop 30 balls (max)
   - Verify smooth 60fps animation
   - Check no memory leaks after multiple games

## Architecture Decision Records

### ADR-1: Why Matter.js over Other Physics Engines?
**Decision**: Use Matter.js for Plinko physics

**Alternatives Considered**:
- Cannon.js (3D, overkill for 2D Plinko)
- p5.js (graphics-focused, lacks robust physics)
- Box2D (C++ port, complex integration)
- Custom physics (current approach, inaccurate)

**Rationale**:
- Mature 2D physics engine (50k+ stars)
- Built-in collision detection
- HTML5 Canvas rendering
- TypeScript support via @types
- Lightweight (~200KB gzipped)
- Excellent documentation

### ADR-2: Predetermined Paths vs Fully Simulated Physics
**Decision**: Use backend paths with Matter.js rendering

**Why Not Fully Simulated?**:
- Backend uses IC VRF (cryptographically secure)
- Deterministic outcomes ensure fairness
- Frontend simulation would be different on each device
- Multipliers must match backend calculations

**Implementation**:
- Backend provides path (Vec<bool>)
- Matter.js applies subtle forces to follow path
- Physics handles realistic collisions/bouncing
- Final position always matches backend result

### ADR-3: Canvas vs DOM Rendering
**Decision**: Hybrid approach (Canvas for physics, React for UI)

**Rationale**:
- Matter.js Render works best with Canvas
- React UI overlays for bucket, slots, multipliers
- Canvas isolates physics rendering from React updates
- Better performance for complex physics

## Deployment Strategy

### Pre-Deployment Checklist
- [ ] Install matter-js: `cd openhouse_frontend && npm install`
- [ ] Verify TypeScript builds: `npm run type-check`
- [ ] Build frontend: `npm run build`
- [ ] Check bundle size (should be ~200KB increase for Matter.js)

### Deployment Command
```bash
cd /home/theseus/alexandria/openhouse-plinko-physics
cd openhouse_frontend && npm install && npm run build && cd ..
./deploy.sh --frontend-only
```

### Affected Canisters
- **Frontend Only**: `pezw3-laaaa-aaaal-qssoa-cai`
- **Plinko Backend**: No changes (API unchanged)

### Rollback Plan
If Matter.js physics has issues:
1. Revert to previous commit
2. Rebuild frontend: `npm run build`
3. Redeploy: `./deploy.sh --frontend-only`

## Success Criteria

### Functional Requirements
- ✅ Balls follow backend-provided paths accurately
- ✅ Final positions match backend results (deterministic)
- ✅ Realistic physics bouncing and collisions
- ✅ Multi-ball drops work (up to 30 balls)
- ✅ Mobile responsive (canvas scales)

### Non-Functional Requirements
- ✅ 60fps animation on modern devices
- ✅ Bundle size increase ≤ 250KB
- ✅ No regression in existing functionality
- ✅ TypeScript type safety maintained

### Visual Quality
- ✅ Smooth, natural ball movement
- ✅ Realistic peg collisions
- ✅ No jittery or teleporting balls
- ✅ Bucket tilt animation preserved

## Future Enhancements (Not in This PR)

### Physics Tuning
- Experiment with restitution values for bounciness
- Adjust peg friction for smoother paths
- Add ball rotation physics

### Visual Effects
- Particle effects on peg collisions
- Ball trails/motion blur
- Glow effects on high multiplier slots

### Advanced Features
- Slow-motion replay of winning drops
- Multi-ball simultaneous drops (parallel physics)
- Sound effects synced to collisions

## References
- Matter.js Docs: https://brm.io/matter-js/docs/
- IC VRF: https://internetcomputer.org/docs/current/references/ic-interface-spec#ic-raw_rand
- Plinko Backend: `/home/theseus/alexandria/openhouse/plinko_backend/src/lib.rs`
- Current Frontend: `/home/theseus/alexandria/openhouse/openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx`

---

## Summary
This plan replaces Plinko's custom CSS physics with Matter.js, providing:
1. **Realistic physics**: Real collisions, gravity, and bouncing
2. **Same game logic**: Backend paths still control outcomes
3. **Better UX**: Smoother, more natural ball movement
4. **Maintainable code**: Standard physics library vs custom code

**Estimated Changes**: ~400 lines modified, ~200 lines new (hook), ~100 lines removed (manual physics)
**Risk Level**: Medium (frontend-only, backend unchanged, can rollback easily)
**Testing**: Manual verification on mainnet required
