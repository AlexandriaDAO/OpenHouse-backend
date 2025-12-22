# Optimistic Local Simulation Plan

## Overview

Run smooth 10 FPS local Game of Life simulation, sync with backend every ~500ms, hard snap to backend state on each sync.

---

## Core Concept

```
Time ────────────────────────────────────────────────────────────>

Backend:  [Gen 100]─────────────────[Gen 105]─────────────────[Gen 110]
              │                         │                         │
              ▼                         ▼                         ▼
           Sync 1                    Sync 2                    Sync 3
              │                         │                         │
Local:        └─101─102─103─104─105────►└─106─107─108─109─110────►└─...
                   (optimistic)              (optimistic)
```

- Backend is source of truth
- Local sim fills the gaps with pure GoL rules
- On each backend sync, hard snap local state to backend state
- Drift from siege/wipe/disconnection auto-corrects within 500ms

---

## Implementation

### File: `openhouse_frontend/src/pages/Risk.tsx`

#### State

```typescript
// Backend state (source of truth)
const [backendCells, setBackendCells] = useState<Cell[]>([]);
const [backendGen, setBackendGen] = useState(0);

// Local state (for rendering)
const [localCells, setLocalCells] = useState<Cell[]>([]);
const [localGen, setLocalGen] = useState(0);

// Sync tracking
const [lastSyncTime, setLastSyncTime] = useState(0);
```

#### Backend Sync Loop (~2 Hz)

```typescript
useEffect(() => {
  if (!actor) return;

  const syncInterval = setInterval(async () => {
    try {
      const state = await actor.get_state();
      const cells = sparseToDense(state.cells);

      // Hard snap to backend truth
      setBackendCells(cells);
      setBackendGen(state.generation);
      setLocalCells(cells);
      setLocalGen(state.generation);
      setLastSyncTime(Date.now());

    } catch (err) {
      console.error('[SYNC] Backend fetch failed:', err);
    }
  }, 500);

  return () => clearInterval(syncInterval);
}, [actor]);
```

#### Local Simulation Loop (10 Hz)

```typescript
useEffect(() => {
  if (!ENABLE_LOCAL_SIM) return;

  const simInterval = setInterval(() => {
    setLocalCells(prev => {
      const next = runGameOfLifeStep(prev);
      return next;
    });
    setLocalGen(prev => prev + 1);
  }, 100);

  return () => clearInterval(simInterval);
}, []);
```

#### Rendering

```typescript
// Always render localCells for smooth animation
const cellsToRender = localCells;
```

#### Placement Handling

```typescript
const handlePlacement = useCallback(async (placements: Placement[]) => {
  if (!actor) return;

  const cellsToPlace = placements.flatMap(p => p.cells);

  // 1. Optimistically apply to local state
  setLocalCells(prev => {
    const next = [...prev];
    for (const [x, y] of cellsToPlace) {
      const idx = y * GRID_SIZE + x;
      next[idx] = { ...next[idx], alive: true, owner: myPlayerNum };
    }
    return next;
  });

  // 2. Send to backend
  try {
    const result = await actor.place_cells(cellsToPlace);

    if ('Err' in result) {
      // Revert optimistic update (next sync will correct anyway)
      console.warn('[PLACE] Backend rejected:', result.Err);
      setPlacementError(result.Err);
    }
  } catch (err) {
    console.error('[PLACE] Network error:', err);
    setPlacementError('Network error. Try again.');
  }
}, [actor, myPlayerNum]);
```

---

## Constants

### File: `openhouse_frontend/src/pages/riskConstants.ts`

```typescript
// Simulation settings
export const ENABLE_LOCAL_SIM = true;
export const LOCAL_SIM_FPS = 10;
export const LOCAL_SIM_INTERVAL_MS = 1000 / LOCAL_SIM_FPS;  // 100ms

// Backend sync settings
export const BACKEND_SYNC_INTERVAL_MS = 500;

// Debug
export const DEBUG_SYNC = true;  // Show sync stats overlay
```

---

## Debug Overlay

Show sync status for development:

```typescript
{DEBUG_SYNC && (
  <div className="absolute top-2 left-2 bg-black/80 text-white text-xs p-2 rounded font-mono">
    <div>Backend Gen: {backendGen}</div>
    <div>Local Gen: {localGen}</div>
    <div>Drift: {localGen - backendGen} gens</div>
    <div>Last Sync: {Date.now() - lastSyncTime}ms ago</div>
  </div>
)}
```

---

## Edge Cases

| Scenario | What Happens | User Experience |
|----------|--------------|-----------------|
| Pure GoL area | Local matches backend | Seamless |
| Siege zone | Local drifts, snaps on sync | Brief visual correction |
| Wipe occurs | Local shows cells, sync removes them | Cells disappear on sync |
| Placement rejected | Optimistic cell disappears | Error message shown |
| Network lag | Local runs ahead, big snap on sync | Noticeable but acceptable |
| Network failure | Local continues, no sync | Stale state until reconnect |

---

## What We're NOT Doing

- No uncertainty zones or visual indicators
- No pre-placement backend validation
- No interpolation/smoothing on sync
- No drift detection or thresholds
- No Web Workers for simulation

Keep it simple. If problems arise, address them specifically.

---

## Testing

1. **Solo play**: Place cells, watch them evolve smoothly
2. **Near enemy**: Observe sync corrections in contested areas
3. **During wipe**: Confirm quadrant clears on sync
4. **Network throttle**: Simulate 1000ms+ latency, verify graceful degradation
5. **Rapid placement**: Place many cells quickly, verify backend accepts

---

## Success Criteria

- Smooth 10 FPS animation
- No perceptible lag in normal gameplay
- Sync corrections are brief and non-jarring
- Placement errors are rare (<5% in contested zones)
- No user confusion about game state

---

## Migration from Current State

1. Review current `Risk.tsx` implementation
2. Ensure `runGameOfLifeStep` function exists and matches backend rules
3. Add sync loop if not present
4. Add local sim loop if not present
5. Wire up placement with optimistic updates
6. Test on mainnet

---

*Plan created: 2025-12-22*
*Replaces: OPTION_E_IMPLEMENTATION_PLAN.md*
