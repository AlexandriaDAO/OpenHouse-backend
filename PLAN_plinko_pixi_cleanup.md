# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-pixi-cleanup"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-pixi-cleanup`
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
   git commit -m "fix: Plinko Pixi.js UI cleanup - ball landing, result position, remove redundant button"
   git push -u origin feature/plinko-pixi-cleanup
   gh pr create --title "Fix: Plinko Pixi.js UI cleanup" --body "Fixes UI issues from Pixi.js migration:

- Ball animations now land in correct slots at bottom
- Result overlay moved below game board (not covering it)
- Removed redundant DROP button that covered bucket
- Fixed layout calculations for proper ball trajectories

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

**Branch:** `feature/plinko-pixi-cleanup`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-pixi-cleanup`

---

# Implementation Plan: Plinko Pixi.js UI Cleanup

## Background

The Plinko game was migrated from CSS animations to Pixi.js canvas rendering. The migration introduced these UI bugs:

1. **Redundant DROP button** - A React button overlays the Pixi.js bucket, covering it
2. **Result overlay covers game** - The win/loss display appears over the game board instead of below
3. **Balls don't land correctly** - Ball animations freeze mid-board instead of landing in bottom slots

## Current State

### Files to Modify

| File | Issue |
|------|-------|
| `openhouse_frontend/src/components/game-specific/plinko/PlinkoCanvas.tsx` | Remove redundant button, fix container layout |
| `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx` | Move ResultOverlay below game board |
| `openhouse_frontend/src/components/game-specific/plinko/pixi/LayoutConfig.ts` | Review layout constants |
| `openhouse_frontend/src/components/game-specific/plinko/pixi/BallRenderer.ts` | Fix ball landing position calculation |
| `openhouse_frontend/src/components/game-specific/plinko/pixi/SlotRenderer.ts` | Ensure slots are positioned correctly |

### Current Layout Constants (`LayoutConfig.ts`)
```typescript
export const LAYOUT = {
  BASE_WIDTH: 800,
  BASE_HEIGHT: 700,
  PEG_SPACING_X: 50,
  PEG_SPACING_Y: 55,
  PEG_RADIUS: 6,
  BALL_RADIUS: 12,
  DROP_ZONE_HEIGHT: 80,
  BUCKET_WIDTH: 160,
  BUCKET_HEIGHT: 80,
  SLOT_WIDTH: 45,
  SLOT_HEIGHT: 40,
  MS_PER_ROW: 100,
  // ...colors
};
```

## Implementation

### Issue 1: Remove Redundant DROP Button

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoCanvas.tsx`

The bucket in Pixi.js already has a label and is clickable. Remove the React button overlay.

```typescript
// PSEUDOCODE - Remove this entire button element from PlinkoCanvas.tsx
// DELETE lines ~173-189 (the <button> element)
// The bucket renderer already shows "DROP" label and handles clicks via parent onDrop
```

**File:** `openhouse_frontend/src/components/game-specific/plinko/pixi/BucketRenderer.ts`

Make bucket interactive (clickable):
```typescript
// PSEUDOCODE - Add click handling to bucket
async init(parent: Container, centerX: number): Promise<void> {
  // ... existing code ...

  // Make bucket interactive
  this.container.eventMode = 'static';
  this.container.cursor = 'pointer';
  // Parent component will attach click handler via callback
}

// Add method to set click handler
setOnClick(callback: () => void): void {
  this.container.on('pointerdown', callback);
}
```

**File:** `openhouse_frontend/src/components/game-specific/plinko/pixi/PlinkoPixiApp.ts`

Wire up click handler:
```typescript
// PSEUDOCODE - Add onDrop callback to config
export interface PlinkoAppConfig {
  // ... existing
  onDrop?: () => void;
}

// In init(), wire up bucket click
await this.bucketRenderer.init(this.mainContainer, this.centerX);
if (this.config.onDrop) {
  this.bucketRenderer.setOnClick(this.config.onDrop);
}
```

### Issue 2: Move Result Overlay Below Game Board

**File:** `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx`

Move ResultOverlay outside the game board container, position it below:

```typescript
// PSEUDOCODE - Current structure (wrong):
<div className="flex-1 flex justify-center items-start py-2 min-h-0 relative">
  <PlinkoCanvas ... />
  <ResultOverlay ... />  // ❌ Inside game board container
</div>

// PSEUDOCODE - New structure (correct):
<div className="flex-1 flex flex-col min-h-0">
  {/* Game Board */}
  <div className="flex-1 flex justify-center items-start py-2 min-h-0">
    <PlinkoCanvas ... />
  </div>

  {/* Result Overlay - Below game board */}
  <div className="h-16 flex items-center justify-center">
    <ResultOverlay ... />
  </div>
</div>
```

**File:** `openhouse_frontend/src/components/game-specific/plinko/ui/ResultOverlay.tsx`

Update positioning - remove absolute positioning since it's now in flow:

```typescript
// PSEUDOCODE - Change from absolute to relative positioning
// Remove: className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
// Use:    className="flex justify-center"
```

### Issue 3: Fix Ball Landing Position

**File:** `openhouse_frontend/src/components/game-specific/plinko/pixi/BallRenderer.ts`

The balls land at wrong Y position. Fix the landing calculation:

```typescript
// PSEUDOCODE - Current landing position (line ~87):
const y = LAYOUT.DROP_ZONE_HEIGHT + this.rows * LAYOUT.PEG_SPACING_Y + LAYOUT.SLOT_HEIGHT / 2;

// This puts balls IN the slot, but slots might be positioned wrong.
// Need to verify slot Y matches.
```

**File:** `openhouse_frontend/src/components/game-specific/plinko/pixi/SlotRenderer.ts`

Verify slot positioning matches ball landing:

```typescript
// PSEUDOCODE - Check slot Y position (around line 38):
const slotY = LAYOUT.DROP_ZONE_HEIGHT + this.rows * LAYOUT.PEG_SPACING_Y + 20;

// Ball lands at: DROP_ZONE_HEIGHT + rows * PEG_SPACING_Y + SLOT_HEIGHT / 2
// Slot is at:    DROP_ZONE_HEIGHT + rows * PEG_SPACING_Y + 20

// For 8 rows:
// Ball Y = 80 + 8*55 + 20 = 540
// Slot Y = 80 + 8*55 + 20 = 520 (top of slot)
// Slot center = 520 + 40/2 = 540 ✓ (matches if SLOT_HEIGHT=40)
```

The real issue is the ball's `currentRow` check. Review `update()`:

```typescript
// PSEUDOCODE - Ball landing check
if (ball.currentRow >= this.rows) {
  // Ball should stop HERE, not continue animating
  // Verify this.rows matches actual peg rows (8)
}
```

**Root Cause:** The ball may be comparing against wrong row count. Check initialization:

```typescript
// In BallRenderer constructor:
constructor(rows: number, ...) {
  this.rows = rows;  // Should be 8 for 8-row board
}
```

**Fix:** Ensure `rows` is passed correctly from PlinkoGame (ROWS = 8) through PlinkoCanvas → PlinkoPixiApp → BallRenderer.

### Issue 4: Container Height for Canvas

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoCanvas.tsx`

Remove hard-coded minHeight since layout is now flexbox:

```typescript
// PSEUDOCODE - Update container styling
// Current: style={{ minHeight: '400px' }}
// New: Remove inline minHeight, let flex handle it

return (
  <div className="relative w-full h-full">
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ touchAction: 'none' }}
    />
  </div>
);
```

## Testing Checklist (Manual)

After deployment, verify at https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko:

1. [ ] No redundant DROP button visible (only Pixi bucket)
2. [ ] Clicking bucket triggers drop
3. [ ] Result overlay appears BELOW the game board
4. [ ] Ball animations land in the correct bottom slots
5. [ ] Single ball drop works
6. [ ] Multi-ball drop (5+ balls) works
7. [ ] Mobile responsive (test at 375px width)

## Files Changed Summary

| File | Change |
|------|--------|
| `PlinkoCanvas.tsx` | Remove button, simplify container |
| `PlinkoGame.tsx` | Move ResultOverlay below game |
| `ResultOverlay.tsx` | Remove absolute positioning |
| `BucketRenderer.ts` | Add click interactivity |
| `PlinkoPixiApp.ts` | Wire up onDrop callback |
| `BallRenderer.ts` | Verify row count for landing |

## Deployment

Frontend-only deployment:
```bash
cd openhouse_frontend && npm run build && cd ..
./deploy.sh --frontend-only
```

Affected canister: `pezw3-laaaa-aaaal-qssoa-cai` (Frontend)
