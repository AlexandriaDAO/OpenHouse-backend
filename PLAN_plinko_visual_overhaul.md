# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-visual-overhaul"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-visual-overhaul`
2. **Implement feature** - Follow plan sections below IN ORDER (Phase 1 → 2 → 3)
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
   git commit -m "feat(plinko): complete visual overhaul - Stake-style buckets, pins, balls, and physics"
   git push -u origin feature/plinko-visual-overhaul
   gh pr create --title "Plinko: Complete Visual Overhaul" --body "$(cat <<'EOF'
## Summary
Complete visual upgrade to match Stake-style Plinko aesthetic:

### Phase 1: Gradient Buckets
- Red (edges) → Yellow (center) color gradient based on multiplier
- Win animations with glow effects
- 3D depth with shadows

### Phase 2: Pins & Balls Styling
- 3D gradient pins with glow
- Metallic gold balls with specular highlights
- Shadow/depth effects

### Phase 3: Physics Animation
- Bounce easing on pin collision
- Squash/stretch deformation
- Gravity acceleration feel

## Reference
Visual style from: https://github.com/AnsonH/plinko-game

## Deployed
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko

Generated with Claude Code
EOF
)"
   ```
6. **Iterate autonomously** until approved or max 5 iterations

## CRITICAL RULES
- NO questions ("should I?", "want me to?")
- NO skipping PR creation
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error
- **IMPLEMENT IN ORDER: Phase 1 → Phase 2 → Phase 3**

**Branch:** `feature/plinko-visual-overhaul`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-visual-overhaul`

---

# Plinko Complete Visual Overhaul

## Objective
Transform the Plinko game visuals to match the polished Stake-style casino aesthetic from the reference game at https://github.com/AnsonH/plinko-game

**CRITICAL: Implement phases in order. Each phase builds on the previous.**

## Reference Source Code

Fetch these for reference during implementation:
```
https://raw.githubusercontent.com/AnsonH/plinko-game/main/src/lib/constants/game.ts
https://raw.githubusercontent.com/AnsonH/plinko-game/main/src/lib/components/Plinko/PlinkoEngine.ts
https://raw.githubusercontent.com/AnsonH/plinko-game/main/src/lib/components/Plinko/BinsRow.svelte
```

---

# PHASE 1: Gradient Buckets & Win Animations
*Most isolated - creates new component, minimal conflicts*

## 1.1 Add Color Utilities

**File:** `openhouse_frontend/src/components/game-specific/plinko/plinkoAnimations.ts`

Add these new exports AFTER the existing `PLINKO_LAYOUT` object:

```typescript
// PSEUDOCODE - Add after PLINKO_LAYOUT export

// Stake-style bucket colors
export const BUCKET_COLORS = {
  // High multiplier (edges) - Red
  high: {
    bg: { r: 255, g: 0, b: 63 },
    shadow: { r: 166, g: 0, b: 4 },
  },
  // Low multiplier (center) - Yellow
  low: {
    bg: { r: 255, g: 192, b: 0 },
    shadow: { r: 171, g: 121, b: 0 },
  },
};

// Linear interpolation between two RGB colors
function lerpColor(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number },
  t: number
): string {
  const r = Math.round(color1.r + (color2.r - color1.r) * t);
  const g = Math.round(color1.g + (color2.g - color1.g) * t);
  const b = Math.round(color1.b + (color2.b - color1.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Get bucket colors based on position (edges=red, center=yellow)
export function getBucketColors(index: number, totalBuckets: number): {
  background: string;
  shadow: string;
  glow: string;
} {
  const center = (totalBuckets - 1) / 2;
  const distanceFromCenter = Math.abs(index - center);
  const maxDistance = center;

  // t = 0 at center (yellow), t = 1 at edges (red)
  const t = maxDistance > 0 ? distanceFromCenter / maxDistance : 0;

  return {
    background: lerpColor(BUCKET_COLORS.low.bg, BUCKET_COLORS.high.bg, t),
    shadow: lerpColor(BUCKET_COLORS.low.shadow, BUCKET_COLORS.high.shadow, t),
    glow: lerpColor(
      { r: 255, g: 200, b: 50 },
      { r: 255, g: 50, b: 100 },
      t
    ),
  };
}
```

## 1.2 Create MultiplierSlot Component

**File:** `openhouse_frontend/src/components/game-specific/plinko/MultiplierSlot.tsx` (NEW FILE)

```typescript
// PSEUDOCODE - Create new file

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBucketColors, PLINKO_LAYOUT } from './plinkoAnimations';

interface MultiplierSlotProps {
  index: number;
  totalSlots: number;
  multiplier: number;
  x: number;
  y: number;
  isActive?: boolean;
}

export const MultiplierSlot: React.FC<MultiplierSlotProps> = ({
  index,
  totalSlots,
  multiplier,
  x,
  y,
  isActive = false,
}) => {
  const { SLOT_WIDTH, SLOT_HEIGHT } = PLINKO_LAYOUT;
  const colors = getBucketColors(index, totalSlots);
  const isWin = multiplier >= 1.0;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Glow effect when active */}
      <AnimatePresence>
        {isActive && (
          <motion.rect
            x={-SLOT_WIDTH / 2 - 4}
            y={-4}
            width={SLOT_WIDTH + 8}
            height={SLOT_HEIGHT + 8}
            fill="none"
            stroke={colors.glow}
            strokeWidth={3}
            rx={8}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 1, 0.5, 1, 0],
              scale: [0.8, 1.1, 1, 1.05, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            filter={`drop-shadow(0 0 8px ${colors.glow})`}
          />
        )}
      </AnimatePresence>

      {/* Shadow layer for 3D depth */}
      <rect
        x={-SLOT_WIDTH / 2}
        y={4}
        width={SLOT_WIDTH}
        height={SLOT_HEIGHT}
        fill={colors.shadow}
        rx={4}
      />

      {/* Main bucket body */}
      <motion.rect
        x={-SLOT_WIDTH / 2}
        y={0}
        width={SLOT_WIDTH}
        height={SLOT_HEIGHT}
        fill={colors.background}
        rx={4}
        animate={isActive ? { y: [0, 2, 0] } : {}}
        transition={{ duration: 0.2 }}
      />

      {/* Top highlight for 3D effect */}
      <rect
        x={-SLOT_WIDTH / 2 + 2}
        y={2}
        width={SLOT_WIDTH - 4}
        height={4}
        fill="white"
        opacity={0.3}
        rx={2}
      />

      {/* Multiplier text */}
      <text
        x={0}
        y={SLOT_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={10}
        fontWeight="bold"
        style={{
          pointerEvents: 'none',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}
      >
        {multiplier.toFixed(1)}x
      </text>

      {/* Win popup */}
      <AnimatePresence>
        {isActive && isWin && (
          <motion.text
            x={0}
            y={-10}
            textAnchor="middle"
            fill="#00ff00"
            fontSize={12}
            fontWeight="bold"
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [1, 0], y: -20 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            WIN!
          </motion.text>
        )}
      </AnimatePresence>
    </g>
  );
};
```

## 1.3 Update PlinkoBoard to Use MultiplierSlot

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx`

```typescript
// PSEUDOCODE - Update the component

// Add import at top
import { MultiplierSlot } from './MultiplierSlot';

// Update interface to accept activeSlot
interface PlinkoBoardProps {
  rows: number;
  multipliers: number[];
  activeSlot?: number | null;  // ADD THIS
}

// Update component signature
export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  rows,
  multipliers,
  activeSlot = null  // ADD THIS
}) => {

// Replace the entire slots rendering section (the <g id="slots"> block)
// with:
<g id="slots">
  {slots.map((slot, i) => (
    <MultiplierSlot
      key={i}
      index={i}
      totalSlots={slots.length}
      multiplier={multipliers[i] ?? 0}
      x={slot.x}
      y={slot.y}
      isActive={activeSlot === i}
    />
  ))}
</g>
```

## 1.4 Update PlinkoGame to Track Active Slot

**File:** `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx`

```typescript
// PSEUDOCODE - Add active slot tracking

// Add state near other state declarations
const [activeSlot, setActiveSlot] = useState<number | null>(null);
const activeSlotTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// Update handleBallComplete callback to trigger slot animation
const handleBallComplete = useCallback((ballId: number) => {
  // Find the ball's path to determine final slot
  const ball = animatingBalls.find(b => b.id === ballId);
  if (ball) {
    const finalSlot = ball.path.filter(v => v).length;

    // Trigger slot animation
    setActiveSlot(finalSlot);

    // Clear after animation
    if (activeSlotTimeoutRef.current) {
      clearTimeout(activeSlotTimeoutRef.current);
    }
    activeSlotTimeoutRef.current = setTimeout(() => {
      setActiveSlot(null);
    }, 600);
  }

  setAnimatingBalls(prev => prev.filter(b => b.id !== ballId));
}, [animatingBalls]);

// Pass activeSlot to PlinkoBoard
<PlinkoBoard
  rows={ROWS}
  multipliers={multipliers}
  activeSlot={activeSlot}  // ADD THIS
/>

// Cleanup on unmount (add to existing useEffect or create new one)
useEffect(() => {
  return () => {
    if (activeSlotTimeoutRef.current) {
      clearTimeout(activeSlotTimeoutRef.current);
    }
  };
}, []);
```

## 1.5 Update Exports

**File:** `openhouse_frontend/src/components/game-specific/plinko/index.ts`

```typescript
// PSEUDOCODE - Add MultiplierSlot export

export { PlinkoBoard } from './PlinkoBoard';
export { PlinkoBall } from './PlinkoBall';
export { PlinkoBucket } from './PlinkoBucket';
export { MultiplierSlot } from './MultiplierSlot';  // ADD THIS
export * from './plinkoAnimations';
```

---

# PHASE 2: Pins & Balls Visual Styling
*Builds on Phase 1 - modifies existing components*

## 2.1 Add SVG Gradient Definitions

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx`

```typescript
// PSEUDOCODE - Add <defs> block inside the returned <g> element, before pegs

return (
  <g>
    {/* ADD THIS DEFS BLOCK */}
    <defs>
      {/* Pin gradient - 3D spherical effect */}
      <radialGradient id="pinGradient" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#c0c0c0" />
        <stop offset="100%" stopColor="#808080" />
      </radialGradient>

      {/* Pin subtle glow */}
      <filter id="pinGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Ball gradient - metallic gold */}
      <radialGradient id="ballGradient" cx="35%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff7cc" />
        <stop offset="30%" stopColor="#ffd700" />
        <stop offset="70%" stopColor="#daa520" />
        <stop offset="100%" stopColor="#b8860b" />
      </radialGradient>

      {/* Ball shadow filter */}
      <filter id="ballShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
      </filter>
    </defs>

    {/* Rest of component... */}
```

## 2.2 Update Pin Rendering

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx`

```typescript
// PSEUDOCODE - Replace the pegs rendering block

<g id="pegs">
  {pegs.map((peg, i) => (
    <g key={i}>
      {/* Shadow for depth */}
      <circle
        cx={peg.x}
        cy={peg.y + 1}
        r={PLINKO_LAYOUT.PEG_RADIUS}
        fill="#404040"
        opacity={0.4}
      />
      {/* Main pin with gradient */}
      <circle
        cx={peg.x}
        cy={peg.y}
        r={PLINKO_LAYOUT.PEG_RADIUS}
        fill="url(#pinGradient)"
        filter="url(#pinGlow)"
      />
    </g>
  ))}
</g>
```

## 2.3 Update Ball Rendering

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoBall.tsx`

```typescript
// PSEUDOCODE - Replace the ball rendering inside motion.g

// The ball should use the gradient defined in PlinkoBoard
// Replace the existing circle elements with:

<g filter="url(#ballShadow)">
  {/* Drop shadow ellipse */}
  <ellipse
    cx={2}
    cy={PLINKO_LAYOUT.BALL_RADIUS + 2}
    rx={PLINKO_LAYOUT.BALL_RADIUS * 0.7}
    ry={PLINKO_LAYOUT.BALL_RADIUS * 0.25}
    fill="black"
    opacity={0.15}
  />

  {/* Main ball with gradient */}
  <circle
    r={PLINKO_LAYOUT.BALL_RADIUS}
    fill="url(#ballGradient)"
  />

  {/* Primary specular highlight */}
  <ellipse
    cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
    cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
    rx={PLINKO_LAYOUT.BALL_RADIUS * 0.35}
    ry={PLINKO_LAYOUT.BALL_RADIUS * 0.25}
    fill="white"
    opacity={0.6}
  />

  {/* Secondary highlight dot */}
  <circle
    cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.15}
    cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.45}
    r={PLINKO_LAYOUT.BALL_RADIUS * 0.1}
    fill="white"
    opacity={0.8}
  />
</g>
```

---

# PHASE 3: Physics-Based Ball Animation
*Builds on Phase 2 - enhances ball animation*

## 3.1 Add Physics Keyframe Generator

**File:** `openhouse_frontend/src/components/game-specific/plinko/plinkoAnimations.ts`

```typescript
// PSEUDOCODE - Add after getBucketColors function

// Physics keyframe with optional transform properties
interface PhysicsKeyframe {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

// Generate physics-enhanced keyframes from path
export function generatePhysicsKeyframes(path: boolean[]): PhysicsKeyframe[] {
  const keyframes: PhysicsKeyframe[] = [];
  const { BOARD_WIDTH, DROP_ZONE_Y, PEG_SPACING_X, PEG_SPACING_Y, BALL_START_Y } = PLINKO_LAYOUT;

  // Start position
  keyframes.push({
    x: BOARD_WIDTH / 2,
    y: BALL_START_Y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  });

  for (let row = 0; row < path.length; row++) {
    const goesRight = path[row];
    const rightsSoFar = path.slice(0, row + 1).filter(v => v).length;

    // Calculate positions
    const pinX = BOARD_WIDTH / 2 + (rightsSoFar - row / 2 - 0.5) * PEG_SPACING_X;
    const pinY = DROP_ZONE_Y + row * PEG_SPACING_Y;
    const landX = BOARD_WIDTH / 2 + (rightsSoFar - (row + 1) / 2) * PEG_SPACING_X;
    const landY = DROP_ZONE_Y + (row + 1) * PEG_SPACING_Y;

    // Approach pin (slight vertical stretch from falling)
    keyframes.push({
      x: pinX,
      y: pinY - 2,
      scaleX: 0.95,
      scaleY: 1.05,
      rotation: goesRight ? 5 : -5
    });

    // Impact (squash)
    keyframes.push({
      x: pinX + (goesRight ? 2 : -2),
      y: pinY,
      scaleX: 1.12,
      scaleY: 0.88,
      rotation: goesRight ? 10 : -10
    });

    // Bounce away (stretch)
    const bounceX = pinX + (goesRight ? PEG_SPACING_X * 0.3 : -PEG_SPACING_X * 0.3);
    const bounceY = pinY + PEG_SPACING_Y * 0.3;
    keyframes.push({
      x: bounceX,
      y: bounceY,
      scaleX: 0.92,
      scaleY: 1.08,
      rotation: goesRight ? 12 : -12
    });

    // Land (normalize)
    keyframes.push({
      x: landX,
      y: landY,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    });
  }

  return keyframes;
}

// Generate timing array with gravity acceleration feel
export function generatePhysicsTiming(keyframeCount: number): number[] {
  const times: number[] = [];
  let accumulated = 0;

  for (let i = 0; i < keyframeCount; i++) {
    times.push(accumulated);

    // Vary timing based on keyframe type (4 per row after initial)
    const segmentType = i === 0 ? -1 : (i - 1) % 4;
    let segmentDuration: number;

    switch (segmentType) {
      case -1: segmentDuration = 0.1; break;  // Initial drop
      case 0: segmentDuration = 0.12; break;  // Approach
      case 1: segmentDuration = 0.04; break;  // Impact (quick)
      case 2: segmentDuration = 0.10; break;  // Bounce
      case 3: segmentDuration = 0.08; break;  // Land
      default: segmentDuration = 0.08;
    }

    // Gradually speed up (gravity effect) - max 30% faster at bottom
    const progress = i / keyframeCount;
    const gravityMultiplier = 1 - progress * 0.3;
    accumulated += segmentDuration * gravityMultiplier;
  }

  // Normalize to 0-1
  return times.map(t => t / accumulated);
}
```

## 3.2 Update PlinkoBall to Use Physics Animation

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoBall.tsx`

```typescript
// PSEUDOCODE - Replace the entire component

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { generatePhysicsKeyframes, generatePhysicsTiming, PLINKO_LAYOUT } from './plinkoAnimations';

interface PlinkoBallProps {
  id: number;
  path: boolean[];
  onComplete: (id: number) => void;
  staggerDelay?: number;
}

export const PlinkoBall: React.FC<PlinkoBallProps> = ({
  id,
  path,
  onComplete,
  staggerDelay = 0
}) => {
  // Generate physics keyframes
  const keyframes = generatePhysicsKeyframes(path);
  const timings = generatePhysicsTiming(keyframes.length);

  // Duration based on path length (slightly longer for physics effect)
  const duration = (path.length * PLINKO_LAYOUT.MS_PER_ROW * 1.3) / 1000;

  // Notify parent when complete
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete(id);
    }, (duration + staggerDelay) * 1000 + 100);
    return () => clearTimeout(timer);
  }, [id, duration, staggerDelay, onComplete]);

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{
        x: keyframes.map(k => k.x),
        y: keyframes.map(k => k.y),
        scaleX: keyframes.map(k => k.scaleX),
        scaleY: keyframes.map(k => k.scaleY),
        rotate: keyframes.map(k => k.rotation),
        opacity: [0, 1, ...Array(Math.max(0, keyframes.length - 3)).fill(1), 0.8, 0.5],
      }}
      transition={{
        duration,
        delay: staggerDelay,
        times: timings,
        ease: "easeInOut",
      }}
      style={{ transformOrigin: 'center center' }}
    >
      {/* Ball with gradient and shadows - uses defs from PlinkoBoard */}
      <g filter="url(#ballShadow)">
        {/* Drop shadow */}
        <ellipse
          cx={2}
          cy={PLINKO_LAYOUT.BALL_RADIUS + 2}
          rx={PLINKO_LAYOUT.BALL_RADIUS * 0.7}
          ry={PLINKO_LAYOUT.BALL_RADIUS * 0.25}
          fill="black"
          opacity={0.15}
        />

        {/* Main ball */}
        <circle
          r={PLINKO_LAYOUT.BALL_RADIUS}
          fill="url(#ballGradient)"
        />

        {/* Specular highlight */}
        <ellipse
          cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
          cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
          rx={PLINKO_LAYOUT.BALL_RADIUS * 0.35}
          ry={PLINKO_LAYOUT.BALL_RADIUS * 0.25}
          fill="white"
          opacity={0.6}
        />

        {/* Secondary highlight */}
        <circle
          cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.15}
          cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.45}
          r={PLINKO_LAYOUT.BALL_RADIUS * 0.1}
          fill="white"
          opacity={0.8}
        />
      </g>
    </motion.g>
  );
};
```

## 3.3 Update PlinkoBall onComplete Signature

**File:** `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx`

```typescript
// PSEUDOCODE - The handleBallComplete was updated in Phase 1
// Make sure PlinkoBall's onComplete only passes id (path lookup happens in handler)

// The callback should match:
onComplete={(id) => handleBallComplete(id)}

// Or if using the callback directly:
onComplete={handleBallComplete}
```

---

# Files Summary

| File | Phase | Action |
|------|-------|--------|
| `plinkoAnimations.ts` | 1, 3 | Add getBucketColors, generatePhysicsKeyframes |
| `MultiplierSlot.tsx` | 1 | CREATE new component |
| `PlinkoBoard.tsx` | 1, 2 | Add activeSlot prop, MultiplierSlot, gradient defs, pin styling |
| `PlinkoBall.tsx` | 2, 3 | Gradient ball, physics animation |
| `PlinkoGame.tsx` | 1 | Add activeSlot state tracking |
| `index.ts` | 1 | Export MultiplierSlot |

---

# Testing Checklist

## Phase 1 - Buckets
- [ ] Edge buckets are red
- [ ] Center buckets are yellow
- [ ] Smooth gradient between positions
- [ ] Buckets have 3D shadow depth
- [ ] Active bucket glows when ball lands
- [ ] "WIN!" popup appears for multiplier >= 1.0

## Phase 2 - Pins & Balls
- [ ] Pins have 3D spherical gradient
- [ ] Pins have subtle glow effect
- [ ] Balls have metallic gold gradient
- [ ] Balls have specular highlights
- [ ] Ball shadow visible during animation

## Phase 3 - Physics
- [ ] Ball squashes on pin impact
- [ ] Ball stretches while bouncing
- [ ] Ball rotation adds realism
- [ ] Movement accelerates (gravity feel)
- [ ] Ball still lands in correct slot
- [ ] Performance OK with 30 balls

## Final
- [ ] Build completes: `npm run build`
- [ ] No console errors
- [ ] Deployed and visible at production URL

---

# Deployment

```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

Verify at: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
