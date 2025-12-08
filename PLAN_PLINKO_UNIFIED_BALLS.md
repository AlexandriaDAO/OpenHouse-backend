# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-unified-balls"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-unified-balls`
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
   git commit -m "feat(plinko): unify tunnel and board ball visuals/physics"
   git push -u origin feature/plinko-unified-balls
   gh pr create --title "Plinko: Unified Ball Visuals & Physics" --body "$(cat <<'EOF'
## Summary
- Unifies ball appearance between release tunnel and game board
- Removes dark pyramid container in favor of transparent ball pile
- Aligns ball sizes (8px) and rendering (full detail) across all states

## Changes
- `ReleaseTunnel.tsx`: Minimized container chrome, unified ball size/rendering
- `TunnelPhysicsEngine.ts`: Updated ball radius to match board physics
- `plinkoAnimations.ts`: Aligned tunnel ball radius constant

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
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

**Branch:** `feature/plinko-unified-balls`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-unified-balls`

---

# Implementation Plan: Unify Plinko Ball Visuals & Physics

## Task Classification
**REFACTORING** - Improve existing code with targeted fixes, aim for negative LOC

## Problem Statement
Currently, the Plinko game has a visual/physics disconnect between:
1. **Tunnel balls** (in release bucket): 5px radius, simple rendering (gradient + 1 highlight)
2. **Board balls** (during gameplay): 8-8.5px radius, full rendering (drop shadow, specular highlights)
3. **Dark pyramid container**: Heavy visual chrome that doesn't match the gold ball aesthetic

The user wants balls coming out of the bucket to have the **same look and physics** as balls on the board, with no distinction between the two.

## Current State Analysis

### File Tree (Affected Files)
```
openhouse_frontend/src/components/game-specific/plinko/
├── ReleaseTunnel.tsx         # Tunnel container + TunnelBall component (MODIFY)
├── TunnelPhysicsEngine.ts    # Tunnel physics with 5px balls (MODIFY)
├── plinkoAnimations.ts       # Constants including TUNNEL.BALL_RADIUS = 6 (MODIFY)
├── PlinkoPhysicsBalls.tsx    # Board physics balls - 8.5px (REFERENCE ONLY)
├── PlinkoBall.tsx            # Animation balls - 8px (REFERENCE ONLY)
└── PlinkoBoard.tsx           # Main board component (NO CHANGE)
```

### Current Ball Sizes
| Location | Radius | File | Line |
|----------|--------|------|------|
| Tunnel visual | 5px | ReleaseTunnel.tsx | 35 |
| Tunnel physics | 5px | TunnelPhysicsEngine.ts | 38 |
| Board physics | 8.5px | PlinkoPhysicsBalls.tsx | 122 |
| Board animation | 8px | PlinkoBall.tsx + plinkoAnimations.ts | BALL_RADIUS |
| Config constant | 6px | plinkoAnimations.ts | 36 |

### Current Visual Differences
| Element | Tunnel Ball | Board Ball |
|---------|-------------|------------|
| Main gradient | `tunnelBallGradient` | `physicsBallGradient` / `ballGradient` |
| Drop shadow | None | Ellipse at +2y, 15% opacity |
| Specular highlight | Simple 30% radius circle | Ellipse 35%x25%, 60% opacity |
| Secondary highlight | None | Circle 10% radius, 80% opacity |
| Shadow filter | None | `feDropShadow` filter |

## Implementation Plan

### 1. Unify Ball Radius Constants

#### File: `plinkoAnimations.ts` (MODIFY)

```typescript
// PSEUDOCODE - Update line 36
// Change TUNNEL.BALL_RADIUS from 6 to 8 to match BALL_RADIUS
TUNNEL: {
    ...existing config,
    BALL_RADIUS: 8,  // Was 6, now matches board balls
}
```

### 2. Update Tunnel Physics Engine

#### File: `TunnelPhysicsEngine.ts` (MODIFY)

```typescript
// PSEUDOCODE - Update line 38
// Change BALL_RADIUS from 5 to 8 to match board physics
private static BALL_RADIUS = 8;  // Was 5

// Adjust pyramid dimensions to accommodate larger balls
// Update BUCKET constants if balls don't fit well (may need to widen slightly)
```

### 3. Refactor ReleaseTunnel Visual Rendering

#### File: `ReleaseTunnel.tsx` (MODIFY)

This is the main change. We need to:
1. Remove/minimize the dark pyramid container (make transparent or very subtle)
2. Update TunnelBall to match PhysicsBall rendering exactly
3. Use consistent 8px ball radius

```typescript
// PSEUDOCODE - TunnelBall component rewrite (lines 246-306)

const TunnelBall: React.FC<TunnelBallProps> = ({ x, y, radius, ... }) => {
    // USE SAME RENDERING AS PhysicsBall from PlinkoPhysicsBalls.tsx

    return (
        <motion.g ...existing animation props...>
            <g filter="url(#tunnelBallShadow)">
                {/* Drop shadow - ADD THIS (was missing) */}
                <ellipse
                    cx={2}
                    cy={radius + 2}
                    rx={radius * 0.7}
                    ry={radius * 0.25}
                    fill="black"
                    opacity={0.15}
                />

                {/* Main ball */}
                <circle r={radius} fill="url(#tunnelBallGradient)" />

                {/* Specular highlight - ENHANCE (was simple circle) */}
                <ellipse
                    cx={-radius * 0.3}
                    cy={-radius * 0.3}
                    rx={radius * 0.35}
                    ry={radius * 0.25}
                    fill="white"
                    opacity={0.6}
                />

                {/* Secondary highlight - ADD THIS (was missing) */}
                <circle
                    cx={-radius * 0.15}
                    cy={-radius * 0.45}
                    r={radius * 0.1}
                    fill="white"
                    opacity={0.8}
                />
            </g>
        </motion.g>
    );
};
```

```typescript
// PSEUDOCODE - Update defs section (lines 104-130)

<defs>
    {/* Keep existing tunnelBallGradient - it's already identical to physicsBallGradient */}

    {/* ADD drop shadow filter to match board balls */}
    <filter id="tunnelBallShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
    </filter>

    {/* MINIMIZE pyramid gradient - make more transparent */}
    <linearGradient id="pyramidGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1a202c" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#2d3748" stopOpacity="0.3" />
    </linearGradient>
</defs>
```

```typescript
// PSEUDOCODE - Update pyramid body rendering (lines 143-168)

// Option A: Make pyramid nearly invisible (preferred - cleaner)
<path
    d={...existing pyramid path...}
    fill="url(#pyramidGradient)"
    stroke="rgba(74, 85, 104, 0.2)"  // Subtle stroke instead of solid
    strokeWidth={1}
    opacity={0.3}  // Was 0.85 - make much more transparent
/>

// Option B: Remove pyramid entirely, just keep gate
// Delete the pyramid body path and inner shadow path entirely
// Only keep the release gate rect at bottom

// Inner shadow for depth - REDUCE or REMOVE
<path
    d={...existing inner shadow path...}
    fill="#0a0a14"
    opacity={0.15}  // Was 0.4 - make more subtle
/>
```

```typescript
// PSEUDOCODE - Update ball radius (line 35)
const ballRadius = 8;  // Was 5, now matches board balls
```

### 4. Adjust Ball Grid Calculation (if needed)

With larger balls (8px vs 5px), fewer balls will fit in the same space. The calculation in lines 40-98 should automatically adjust via `spacing = ballDiameter + 1.5`, but may need tweaking:

```typescript
// PSEUDOCODE - If balls overflow or look cramped, adjust spacing
const ballDiameter = ballRadius * 2;
const spacing = ballDiameter + 2;  // Slightly increase spacing for larger balls
```

## Summary of Changes

| File | Change | Lines Affected |
|------|--------|----------------|
| `plinkoAnimations.ts` | Update `TUNNEL.BALL_RADIUS` from 6 to 8 | ~1 line |
| `TunnelPhysicsEngine.ts` | Update `BALL_RADIUS` from 5 to 8 | ~1 line |
| `ReleaseTunnel.tsx` | Update `ballRadius` from 5 to 8 | ~1 line |
| `ReleaseTunnel.tsx` | Add drop shadow filter to defs | ~3 lines |
| `ReleaseTunnel.tsx` | Reduce pyramid opacity (0.85 -> 0.3) | ~2 lines |
| `ReleaseTunnel.tsx` | Enhance TunnelBall with drop shadow + secondary highlight | ~15 lines |

**Estimated LOC Change:** +15 to +20 lines (mostly adding visual detail to TunnelBall)

## Visual Result

After implementation:
- Balls in tunnel look identical to balls on board (same gold metallic rendering)
- Tunnel container is nearly invisible - just shows pile of gold balls
- When gate opens, balls seamlessly transition to board physics
- No jarring visual change between "tunnel balls" and "playing balls"

## Testing (Manual)

1. Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
2. Select any number of balls
3. Observe:
   - Balls in release tunnel should look identical to balls on board
   - Container should be subtle/transparent
   - When released, balls should look consistent throughout fall
   - No size change or visual "pop" during transition

## Deployment Notes

- **Affected Canisters**: Frontend only (`pezw3-laaaa-aaaal-qssoa-cai`)
- **Backend Changes**: None
- **Deploy Command**: `./deploy.sh --frontend-only`
