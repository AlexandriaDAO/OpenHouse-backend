# Risk Backend: Sync Verification for Timer Optimization

## Executive Summary

This document details the sync verification implementation to confirm that the frontend's local simulation produces identical results to the backend. Once verified, we can safely increase the backend timer interval (e.g., from 1 second to 10 seconds) for significant cycle savings.

---

## Current Behavior

| Component | Tick Rate | Generations/sec | Sync Interval |
|-----------|-----------|-----------------|---------------|
| Backend | 1 second | 10 | - |
| Frontend | 100ms | 10 | 5 seconds |

The frontend currently replaces its local state entirely every 5 seconds, hiding any algorithm differences.

---

## Implementation (Completed)

### 1. Debug Infrastructure

**File: `openhouse_frontend/src/pages/riskConstants.ts`**

Added `DEBUG_SYNC` flag to enable/disable all sync verification logging and UI.

```typescript
export const DEBUG_SYNC = true;
```

---

### 2. Hash Utility Functions

**File: `openhouse_frontend/src/pages/riskUtils.ts`**

Added three functions:
- `hashCellState(cells)` - Hash local cell state
- `hashBitmapState(bitmap)` - Hash backend bitmap state
- `findCellDifferences(localCells, bitmap)` - Find specific cell differences

---

### 3. Generation Tracking State

**File: `openhouse_frontend/src/pages/Risk.tsx`**

Added state variables:
- `localGeneration` - Counter incremented each frontend generation
- `lastSyncedGeneration` - Backend's generation at last sync
- `syncStatus` - UI display state for the debug overlay

---

### 4. Sync Verification Logic

**File: `openhouse_frontend/src/pages/Risk.tsx`**

Modified `syncFromBackend` to:
1. Hash local state before sync
2. Hash backend bitmap
3. Compare hashes and log results
4. Show mismatch details in console if different

---

### 5. Sync Status UI Indicator

**File: `openhouse_frontend/src/pages/Risk.tsx`**

Added visual overlay showing:
- Green box when hashes match ("✓ In Sync")
- Red box when mismatch detected ("✗ MISMATCH")
- Generation drift count
- Hash comparison

---

## Testing Protocol

### Phase A: Baseline Test (5-second sync)

1. Deploy with `DEBUG_SYNC = true`
2. Open browser console (F12)
3. Join game and place some cells
4. Play for 10+ minutes
5. **Expected**: All `[SYNC VERIFY]` logs show `hashMatch: true`
6. **If mismatches occur**: Note the generation drift and difference patterns

### Phase B: Extended Drift Test (30-second sync)

1. Edit `riskConstants.ts`: Change `BACKEND_SYNC_MS = 30000`
2. Redeploy frontend
3. Play for 10+ minutes
4. **Expected**: Hashes still match after 300 generations of drift
5. **If mismatches occur**: Algorithm difference exists between frontend/backend

### Phase C: Stress Test (60-second sync)

1. Edit `riskConstants.ts`: Change `BACKEND_SYNC_MS = 60000`
2. Redeploy frontend
3. Play for 10+ minutes
4. **Expected**: Hashes match after 600 generations of drift

---

## Common Discrepancy Sources

If mismatches are found, investigate these areas:

| Issue | Frontend Code | Backend Code | Check For |
|-------|---------------|--------------|-----------|
| Neighbor counting | `stepLocalGeneration()` | `compute_fates()` | Off-by-one in loop bounds |
| Toroidal wrap | `(row + di + GRID_HEIGHT) % GRID_HEIGHT` | `& 511` bitmask | Different wrap semantics |
| Birth owner resolution | Majority vote in `ownerCounts` | `resolve_owner()` | Tie-breaking logic |
| Territory persistence | `newOwner = current.owner` when dead | Territory bitmap handling | Dead cells keeping owner |
| **Siege mechanics** | NOT SIMULATED | `in_protection_zone()` checks | Backend prevents births in enemy bases |
| **Disconnection** | NOT SIMULATED | `check_all_disconnections()` | Backend kills disconnected territory |
| **Wipe effects** | NOT SIMULATED | `wipe_quadrant()` | Backend clears quadrant cells |

**Important**: The frontend does NOT simulate siege, disconnection, or wipe mechanics. Mismatches are expected when these occur. The goal is to verify the *basic Conway rules* match.

---

## Success Criteria

| Test | Drift (gens) | Duration | Requirement |
|------|--------------|----------|-------------|
| Phase A | 50 | 5 sec | hashMatch = true (when no sieges/wipes) |
| Phase B | 300 | 30 sec | hashMatch = true (when no sieges/wipes) |
| Phase C | 600 | 60 sec | hashMatch = true (when no sieges/wipes) |

**Visual Criteria**:
- No visible "cell jumping" when sync occurs (for basic Conway evolution)
- Smooth continuous animation
- Other players' cells appear without jarring repositions

---

## Next Steps (After Verification)

Once sync verification passes:

1. **Simple timer increase**: Change backend `TICK_INTERVAL_MS` from 1000 to 10000 (10 seconds)
2. **Adjust generations per tick**: Change `GENERATIONS_PER_TICK` from 10 to 100
3. **Result**: 90% cycle reduction with minimal UX impact

---

## File Summary

| File | Changes |
|------|---------|
| `openhouse_frontend/src/pages/riskConstants.ts` | Added `DEBUG_SYNC` flag |
| `openhouse_frontend/src/pages/riskUtils.ts` | Added hash functions |
| `openhouse_frontend/src/pages/Risk.tsx` | Generation tracking, sync logging, UI overlay |

---

*Document created for Risk Backend Timer Optimization Project*
*Last updated: 2025-12-20*
