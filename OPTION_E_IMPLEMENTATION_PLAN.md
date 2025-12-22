# Option E: Uncertainty Zones Implementation Plan

## Background

Query latency testing confirmed that backend-driven animation (Option D) is not viable:
- **Average latency**: 500-580ms
- **Max viable FPS**: ~2 (unacceptable for smooth animation)

Option E keeps smooth 10 FPS local simulation while being honest about where predictions may differ from backend state.

---

## Core Concept

Instead of pretending local simulation is always accurate, we:
1. Identify zones where backend mechanics cause drift (siege, disconnection, wipes)
2. Mark these cells as "uncertain" with visual indicators
3. Validate placements against backend only when targeting uncertain cells

---

## Implementation Phases

### Phase 1: Uncertainty Mask Computation

**File: `openhouse_frontend/src/pages/riskUtils.ts`**

Add function to compute which cells are uncertain:

```typescript
export interface UncertaintyConfig {
  siegeRadius: number;        // Cells around enemy bases (default: 10)
  wipeWarningSeconds: number; // Mark wipe quadrant when < N seconds (default: 30)
  boundaryDepth: number;      // Cells into contested territory (default: 2)
}

export const DEFAULT_UNCERTAINTY_CONFIG: UncertaintyConfig = {
  siegeRadius: 10,
  wipeWarningSeconds: 30,
  boundaryDepth: 2,
};

export function computeUncertaintyMask(
  cells: Cell[],
  bases: Map<number, BaseInfo>,
  myPlayerNum: number | null,
  wipeQuadrant: number,
  secondsUntilWipe: number,
  config: UncertaintyConfig = DEFAULT_UNCERTAINTY_CONFIG
): Uint8Array {
  // Returns bitmask: 0 = certain, 1 = uncertain
  // Use Uint8Array for memory efficiency (262,144 cells)
}
```

**Uncertainty sources to implement:**

| Source | Detection Logic | Why it causes drift |
|--------|-----------------|---------------------|
| Siege zones | Cells within `siegeRadius` of enemy base | Backend blocks births, transfers coins |
| Wipe quadrant | All cells in quadrant when timer < threshold | Backend will wipe entire quadrant |
| Contested boundaries | Player cells adjacent to enemy cells | Disconnection detection may kill territory |
| Near enemy territory | Cells within 2 of enemy-owned cells | Battles can flip ownership unpredictably |

### Phase 2: Constants & Configuration

**File: `openhouse_frontend/src/pages/riskConstants.ts`**

Add new constants:

```typescript
// Uncertainty zone configuration
export const ENABLE_UNCERTAINTY_ZONES = true;
export const SIEGE_UNCERTAINTY_RADIUS = 10;  // Cells around enemy bases
export const WIPE_WARNING_THRESHOLD = 30;    // Seconds before wipe to mark uncertain
export const BOUNDARY_UNCERTAINTY_DEPTH = 2; // Cells into contested areas

// Visual styling for uncertain cells
export const UNCERTAIN_CELL_STYLE = {
  strokeColor: 'rgba(255, 200, 0, 0.6)',  // Yellow-orange
  strokeWidth: 1,
  dashPattern: [2, 2],  // Dashed line
  pulseEnabled: false,  // Optional: pulse animation
};
```

### Phase 3: State Management

**File: `openhouse_frontend/src/pages/Risk.tsx`**

Add state for uncertainty tracking:

```typescript
// New state
const [uncertaintyMask, setUncertaintyMask] = useState<Uint8Array>(
  new Uint8Array(TOTAL_CELLS)
);
const [uncertainCount, setUncertainCount] = useState(0);

// Recompute uncertainty mask when relevant state changes
useEffect(() => {
  if (!ENABLE_UNCERTAINTY_ZONES) return;

  const mask = computeUncertaintyMask(
    localCells,
    bases,
    myPlayerNum,
    wipeInfo.quadrant,
    wipeInfo.secondsRemaining,
  );

  setUncertaintyMask(mask);
  setUncertainCount(mask.reduce((sum, v) => sum + v, 0));
}, [localCells, bases, myPlayerNum, wipeInfo]);
```

### Phase 4: Visual Rendering

**File: `openhouse_frontend/src/pages/Risk.tsx` - `drawCells` function**

After drawing each cell, check if it's uncertain and add indicator:

```typescript
// Inside cell rendering loop, after drawing the cell color
if (ENABLE_UNCERTAINTY_ZONES && uncertaintyMask[cellIdx]) {
  ctx.save();
  ctx.strokeStyle = UNCERTAIN_CELL_STYLE.strokeColor;
  ctx.lineWidth = UNCERTAIN_CELL_STYLE.strokeWidth;
  ctx.setLineDash(UNCERTAIN_CELL_STYLE.dashPattern);
  ctx.strokeRect(
    screenX + 0.5,
    screenY + 0.5,
    cellSize - 1,
    cellSize - 1
  );
  ctx.restore();
}
```

**Alternative rendering options to consider:**
- Semi-transparent overlay instead of border
- Hatching/diagonal lines pattern
- Subtle color shift (desaturate uncertain cells)
- Pulsing animation for cells about to be wiped

### Phase 5: Smart Placement Validation

**File: `openhouse_frontend/src/pages/Risk.tsx` - `confirmPlacement` function**

Before sending placement to backend, check if any target cells are uncertain:

```typescript
const confirmPlacement = useCallback(async () => {
  if (!actor || pendingPlacements.length === 0) return;

  const cellsToPlace: [number, number][] = pendingPlacements.flatMap(p => p.cells);

  // Check if any cells are in uncertain zones
  const hasUncertainTargets = cellsToPlace.some(([x, y]) => {
    const idx = y * GRID_SIZE + x;
    return uncertaintyMask[idx] === 1;
  });

  if (hasUncertainTargets) {
    // Fetch fresh state from backend before validating
    console.log('[PLACE] Uncertain cells detected, fetching fresh backend state...');

    try {
      const freshState = await actor.get_state();
      const freshCells = sparseToDense(freshState);

      // Re-validate against fresh state
      for (const [x, y] of cellsToPlace) {
        const idx = y * GRID_SIZE + x;
        const freshCell = freshCells[idx];

        if (freshCell.alive) {
          setPlacementError('Cell already occupied (synced with backend)');
          return;
        }

        if (freshCell.owner !== myPlayerNum && freshCell.owner !== 0) {
          setPlacementError('Not your territory (synced with backend)');
          return;
        }
      }

      console.log('[PLACE] Backend validation passed for uncertain cells');
    } catch (err) {
      console.error('[PLACE] Failed to fetch fresh state:', err);
      setPlacementError('Network error during validation. Try again.');
      return;
    }
  }

  // Proceed with placement (existing code)
  // ...
}, [actor, pendingPlacements, uncertaintyMask, myPlayerNum]);
```

### Phase 6: Debug Overlay Enhancement

**File: `openhouse_frontend/src/pages/Risk.tsx` - debug overlay section**

Add uncertainty stats to the debug display:

```typescript
{DEBUG_SYNC && (
  <div className="absolute top-2 left-2 bg-black/80 text-white text-xs p-2 rounded font-mono">
    <div>Mode: {ENABLE_LOCAL_SIM ? 'Local Sim' : 'Backend Only'}</div>
    <div>Sync: {syncStatus.inSync ? '✓' : '✗'} ({syncStatus.driftGens} drift)</div>
    {ENABLE_UNCERTAINTY_ZONES && (
      <>
        <div>Uncertain: {uncertainCount.toLocaleString()} cells</div>
        <div>({((uncertainCount / TOTAL_CELLS) * 100).toFixed(1)}% of grid)</div>
      </>
    )}
    <div>Query avg: {queryLatencyStats.current.avg?.toFixed(0) || '?'}ms</div>
  </div>
)}
```

---

## Detailed Algorithm: `computeUncertaintyMask`

```typescript
export function computeUncertaintyMask(
  cells: Cell[],
  bases: Map<number, BaseInfo>,
  myPlayerNum: number | null,
  wipeQuadrant: number,
  secondsUntilWipe: number,
  config: UncertaintyConfig = DEFAULT_UNCERTAINTY_CONFIG
): Uint8Array {
  const mask = new Uint8Array(TOTAL_CELLS);

  // 1. Mark siege zones around enemy bases
  for (const [slot, base] of bases) {
    if (slot !== myPlayerNum) {
      markCircularZone(mask, base.x + 4, base.y + 4, config.siegeRadius);
    }
  }

  // 2. Mark wipe quadrant if imminent
  if (secondsUntilWipe < config.wipeWarningSeconds) {
    markQuadrant(mask, wipeQuadrant);
  }

  // 3. Mark contested boundaries (cells adjacent to enemy territory)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const idx = y * GRID_SIZE + x;
      const cell = cells[idx];

      // Skip if not my cell or already marked
      if (cell.owner !== myPlayerNum || mask[idx]) continue;

      // Check if adjacent to enemy cell
      if (hasEnemyNeighbor(cells, x, y, myPlayerNum)) {
        // Mark this cell and neighbors up to boundaryDepth
        markRadius(mask, x, y, config.boundaryDepth);
      }
    }
  }

  return mask;
}

function markCircularZone(mask: Uint8Array, centerX: number, centerY: number, radius: number): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
          mask[y * GRID_SIZE + x] = 1;
        }
      }
    }
  }
}

function markQuadrant(mask: Uint8Array, quadrant: number): void {
  const qx = quadrant % QUADRANTS_PER_ROW;
  const qy = Math.floor(quadrant / QUADRANTS_PER_ROW);
  const startX = qx * QUADRANT_SIZE;
  const startY = qy * QUADRANT_SIZE;

  for (let dy = 0; dy < QUADRANT_SIZE; dy++) {
    for (let dx = 0; dx < QUADRANT_SIZE; dx++) {
      mask[(startY + dy) * GRID_SIZE + (startX + dx)] = 1;
    }
  }
}

function hasEnemyNeighbor(cells: Cell[], x: number, y: number, myPlayerNum: number | null): boolean {
  const neighbors = [
    [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]
  ];

  for (const [nx, ny] of neighbors) {
    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
    const neighbor = cells[ny * GRID_SIZE + nx];
    if (neighbor.owner !== 0 && neighbor.owner !== myPlayerNum) {
      return true;
    }
  }
  return false;
}

function markRadius(mask: Uint8Array, x: number, y: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
        mask[ny * GRID_SIZE + nx] = 1;
      }
    }
  }
}
```

---

## Testing Plan

### Test 1: Solo Gameplay (No Uncertainty Expected)
1. Join game alone, place cells far from any base
2. **Expected**: No yellow indicators, placements work instantly

### Test 2: Near Enemy Base
1. Expand territory toward an enemy base
2. **Expected**: Yellow indicators appear within 10 cells of enemy base
3. **Expected**: Placements still work but show brief "validating..." state

### Test 3: Pre-Wipe Warning
1. Wait until wipe countdown < 30 seconds
2. **Expected**: Entire target quadrant shows yellow uncertainty
3. **Expected**: Can still place, but with backend validation

### Test 4: Contested Boundary
1. Place cells adjacent to enemy territory
2. **Expected**: Boundary cells show uncertainty
3. **Expected**: Backend validation catches territory that was just lost

### Test 5: Performance Check
1. With 50%+ grid marked uncertain
2. **Expected**: Still smooth 10 FPS rendering
3. **Expected**: Uncertainty computation < 50ms

---

## Performance Considerations

### Mask Computation Optimization
- Use `Uint8Array` instead of `boolean[]` (4x smaller)
- Only recompute when bases/wipe info changes, not every frame
- Consider Web Worker for computation if > 100ms

### Rendering Optimization
- Batch uncertain cell rendering (single `setLineDash` call)
- Skip uncertainty rendering in overview mode (too small to see)
- Use canvas layer separation if needed

### Memory
- Mask size: 262,144 bytes (~256KB)
- Acceptable for modern browsers

---

## Rollout Strategy

1. **Feature flag**: `ENABLE_UNCERTAINTY_ZONES = false` initially
2. **Internal testing**: Enable for developers, verify UX
3. **Gradual rollout**: Enable for all users after validation
4. **Monitoring**: Track placement success/failure rates in uncertain vs certain zones

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Placement rejection rate (certain zones) | < 1% |
| Placement rejection rate (uncertain zones) | < 10% |
| User complaints about "cell occupied" | Decrease by 50%+ |
| Frame rate with uncertainty rendering | Stable 10 FPS |
| Uncertainty mask computation time | < 50ms |

---

## Future Enhancements

If Option E proves insufficient, consider:

1. **Progressive uncertainty**: 3 levels (certain/maybe/uncertain) with different colors
2. **Predictive siege**: Simulate siege mechanic locally for better accuracy
3. **Full parity (Option A)**: Implement all backend mechanics in frontend

---

*Plan created: 2025-12-22*
*Status: Ready for implementation*
