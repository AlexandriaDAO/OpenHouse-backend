# Optimistic Local Simulation Redesign

## Problem Statement

The Risk game needs smooth visual animation (10 FPS) while maintaining accurate synchronization with the backend state. Currently we have two modes:

1. **Backend Mode** (`ENABLE_LOCAL_SIM = false`): Accurate but choppy (2 FPS)
2. **Local Sim Mode** (`ENABLE_LOCAL_SIM = true`): Smooth but drifts significantly

The drift in local sim mode causes UX issues where players click on cells that appear valid locally but are rejected by the backend.

## Root Cause Analysis

### Why Local Simulation Drifts

The frontend's `stepLocalGeneration()` implements basic Conway's Game of Life rules:
- Survival: 2-3 neighbors → live
- Birth: exactly 3 neighbors → born with majority owner
- Death: otherwise

But the backend has additional mechanics **not simulated locally**:

| Mechanic | Effect | Frontend Simulates? |
|----------|--------|---------------------|
| **Siege** | Births in enemy base zones are blocked, coins transfer | ❌ No |
| **Disconnection** | Territory cut off from base is killed | ❌ No |
| **Quadrant Wipes** | Every 5 min, a quadrant is cleared | ❌ No |
| **Grace Period Elimination** | Players with 0 cells for 10 min are eliminated | ❌ No |

### Sync Verification Results

Our sync verification proved that **basic Conway rules match exactly**. When generations align and no backend-only mechanics occur, hashes match perfectly. The drift comes entirely from the mechanics above.

---

## Design Options

### Option A: Full Backend Parity

**Approach**: Implement all backend mechanics in the frontend.

**Pros**:
- True 1:1 parity with backend
- Local sim would be authoritative for most cases

**Cons**:
- Complex to implement (siege detection, BFS disconnection, wipe scheduling)
- Must keep frontend/backend code perfectly in sync
- Wipe timing would still need synchronization

**Effort**: High (2-3 days)

---

### Option B: Optimistic Simulation with Smart Reconciliation

**Approach**: Run local sim but intelligently merge backend state without jarring visual jumps.

**Key Insight**: Instead of replacing local state entirely on sync, detect what changed and animate the transition.

**Algorithm**:
```
On backend sync:
  1. Compare local state hash with backend state hash
  2. If match: continue local sim (no action needed)
  3. If mismatch:
     a. Find cells that differ (we already have findCellDifferences())
     b. For small diffs (<50 cells): animate individual cell changes
     c. For large diffs (>50 cells): crossfade to backend state
  4. Reset local generation counter to backend generation
```

**Pros**:
- Smooth visuals most of the time
- Graceful degradation when drift occurs
- Simpler than full parity

**Cons**:
- Still have brief visual inconsistencies
- Placement validation still needs backend truth

**Effort**: Medium (1-2 days)

---

### Option C: Dual-Layer Rendering

**Approach**: Separate "authoritative" layer from "predictive" layer.

**Architecture**:
```
┌─────────────────────────────────────────┐
│           Visual Display                 │
├─────────────────────────────────────────┤
│  Predictive Layer (local sim, 10 FPS)   │  ← Smooth animation
├─────────────────────────────────────────┤
│  Authoritative Layer (backend, 2 FPS)   │  ← Used for validation
└─────────────────────────────────────────┘
```

**Behavior**:
- Render predictive layer for visuals
- Use authoritative layer for placement validation
- When layers diverge significantly, blend/flash to indicate uncertainty
- "Danger zones" (near enemy bases, wipe quadrants) shown with visual indicator

**Pros**:
- Smooth visuals
- Accurate placement validation
- User understands when prediction is uncertain

**Cons**:
- More complex state management
- Two full grid states in memory

**Effort**: Medium (1-2 days)

---

### Option D: Backend-Driven Animation Frames

**Approach**: Backend sends intermediate states, frontend just renders.

**Changes**:
- Backend exposes `get_animation_frames(from_gen, to_gen)` query
- Returns array of cell deltas between generations
- Frontend interpolates between frames

**Pros**:
- Perfect accuracy
- Smooth animation
- Single source of truth

**Cons**:
- Increases query load on backend
- Latency-dependent (bad on slow connections)
- More cycles consumed for queries

**Effort**: Medium-High (2 days)

---

### Option E: Uncertainty Zones (Recommended)

**Approach**: Run local sim but mark regions where backend might differ.

**Key Insight**: We know exactly WHERE drift can occur:
1. Within 8 cells of any enemy base (siege zone)
2. Territory that might become disconnected (near contested boundaries)
3. The next wipe quadrant (5-minute countdown visible)

**Implementation**:
```typescript
interface Cell {
  owner: number;
  alive: boolean;
  uncertain: boolean;  // NEW: backend might differ here
}

function markUncertainZones(cells: Cell[], bases: BaseInfo[], wipeQuadrant: number) {
  // Mark cells near enemy bases as uncertain
  for (const base of bases) {
    if (base.owner !== myPlayerNum) {
      markRadiusUncertain(cells, base.x, base.y, radius: 10);
    }
  }

  // Mark wipe quadrant as uncertain if wipe is imminent (<30 seconds)
  if (secondsUntilWipe < 30) {
    markQuadrantUncertain(cells, wipeQuadrant);
  }

  // Mark territory boundaries as uncertain (simplified: any cell adjacent to enemy)
  markContestdBoundaries(cells);
}
```

**Rendering**:
- Certain cells: solid color, normal rendering
- Uncertain cells: semi-transparent or pulsing border
- Placement on uncertain cells: show warning "Backend may differ"

**Validation**:
- Placement on certain cells: allow immediately (optimistic)
- Placement on uncertain cells: validate against backend first (slower but accurate)

**Pros**:
- Smooth animation everywhere
- Clear UX indication of uncertainty
- Placement works reliably
- Minimal implementation complexity

**Cons**:
- Uncertain zones might be visually noisy
- Still some edge cases where certain zones drift

**Effort**: Low-Medium (1 day)

---

## Recommended Approach: Option E (Uncertainty Zones)

### Rationale

1. **Lowest effort** with highest UX improvement
2. **Honest UX** - tells user when prediction is unreliable
3. **Correct placement** - validates against backend when uncertain
4. **Progressive enhancement** - can add full parity later if needed

### Implementation Plan

#### Phase 1: Uncertainty Tracking (Frontend Only)

**File: `riskConstants.ts`**
```typescript
export const ENABLE_LOCAL_SIM = true;
export const ENABLE_UNCERTAINTY_ZONES = true;
export const SIEGE_RADIUS = 10;  // Cells around enemy bases marked uncertain
export const WIPE_WARNING_SECONDS = 30;  // Mark wipe quadrant uncertain when < 30s
```

**File: `riskUtils.ts`**
```typescript
export function computeUncertaintyMask(
  cells: Cell[],
  bases: Map<number, BaseInfo>,
  myPlayerNum: number,
  wipeQuadrant: number,
  secondsUntilWipe: number
): boolean[] {
  const uncertain = new Array(TOTAL_CELLS).fill(false);

  // 1. Mark siege zones around enemy bases
  for (const [slot, base] of bases) {
    if (slot !== myPlayerNum) {
      markRadius(uncertain, base.x, base.y, SIEGE_RADIUS);
    }
  }

  // 2. Mark wipe quadrant if imminent
  if (secondsUntilWipe < WIPE_WARNING_SECONDS) {
    markQuadrant(uncertain, wipeQuadrant);
  }

  // 3. Mark contested territory boundaries
  markContestedBoundaries(uncertain, cells, myPlayerNum);

  return uncertain;
}
```

#### Phase 2: Rendering Uncertainty

**File: `Risk.tsx` - drawCells function**
```typescript
// After drawing normal cell
if (uncertaintyMask[cellIdx]) {
  // Draw diagonal stripes or pulsing border
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(x, y, cellSize - gap, cellSize - gap);
  ctx.setLineDash([]);
}
```

#### Phase 3: Smart Placement Validation

**File: `Risk.tsx` - confirmPlacement function**
```typescript
async function confirmPlacement() {
  const targetCells = pendingPlacements.flatMap(p => p.cells);

  // Check if any target cells are in uncertain zones
  const hasUncertainCells = targetCells.some(([x, y]) => {
    const idx = y * GRID_SIZE + x;
    return uncertaintyMask[idx];
  });

  if (hasUncertainCells) {
    // Refresh state from backend before validating
    const freshState = await actor.get_state();
    const freshCells = sparseToDense(freshState);

    // Re-validate against fresh state
    for (const [x, y] of targetCells) {
      const idx = y * GRID_SIZE + x;
      if (freshCells[idx].alive) {
        setPlacementError("Cell already occupied (backend sync)");
        return;
      }
      if (freshCells[idx].owner !== myPlayerNum) {
        setPlacementError("Not your territory (backend sync)");
        return;
      }
    }
  }

  // Proceed with placement
  await actor.place_cells(targetCells);
}
```

#### Phase 4: Overlay Indicator

Update debug overlay to show uncertainty stats:
```typescript
{DEBUG_SYNC && (
  <div>
    <div>◉ Optimistic Mode</div>
    <div>Uncertain: {uncertainCount} cells</div>
    <div>Sync: {BACKEND_SYNC_MS}ms</div>
  </div>
)}
```

---

## Testing Plan

### Scenario 1: Normal Gameplay
1. Place cells in your own territory (no enemy bases nearby)
2. **Expected**: Immediate placement, smooth animation, cells appear correctly

### Scenario 2: Near Enemy Base
1. Place cells within 10 cells of an enemy base
2. **Expected**: Yellow uncertainty indicators visible, placement validates against backend

### Scenario 3: Pre-Wipe
1. Wait until wipe countdown < 30 seconds
2. **Expected**: Entire quadrant shows uncertainty, placement still works but validates

### Scenario 4: Territory Boundary
1. Place cells at the edge of your territory near enemy cells
2. **Expected**: Uncertainty indicators, backend validation for placement

---

## Migration Path

1. **Current**: Backend Mode (accurate, choppy)
2. **Phase 1**: Enable local sim + uncertainty zones (smooth, honest about uncertainty)
3. **Phase 2**: If needed, implement full backend parity for perfect sync

---

## Alternative: Faster Backend Sync

If network latency allows, an even simpler approach:

```typescript
export const BACKEND_SYNC_MS = 100;  // 10 FPS from backend directly
```

This would give smooth animation directly from backend state. Trade-off is ~10x more queries to the canister. Worth testing if query costs are acceptable.

---

## Appendix: Disconnection Detection (For Future Full Parity)

If we later want full parity, here's how to detect disconnected territory in frontend:

```typescript
function findDisconnectedTerritory(cells: Cell[], baseX: number, baseY: number, playerNum: number): number[] {
  // BFS from base interior
  const visited = new Set<number>();
  const queue: number[] = [];

  // Seed with base interior cells
  for (let dy = 1; dy < 7; dy++) {
    for (let dx = 1; dx < 7; dx++) {
      const idx = (baseY + dy) * GRID_SIZE + (baseX + dx);
      if (cells[idx].owner === playerNum) {
        queue.push(idx);
        visited.add(idx);
      }
    }
  }

  // BFS to find all connected territory
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % GRID_SIZE;
    const y = Math.floor(idx / GRID_SIZE);

    for (const [nx, ny] of [[x-1,y], [x+1,y], [x,y-1], [x,y+1]]) {
      const nidx = ny * GRID_SIZE + nx;
      if (!visited.has(nidx) && cells[nidx].owner === playerNum) {
        visited.add(nidx);
        queue.push(nidx);
      }
    }
  }

  // Find all player territory not reached by BFS = disconnected
  const disconnected: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].owner === playerNum && !visited.has(i)) {
      disconnected.push(i);
    }
  }

  return disconnected;
}
```

---

*Document created: 2025-12-20*
*Status: Planning*
