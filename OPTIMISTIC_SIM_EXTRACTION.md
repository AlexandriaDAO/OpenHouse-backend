# Optimistic Simulation Extraction Plan

## Goal

Extract the optimistic local simulation system from `Life.tsx` into a standalone, testable module. This is the most complex and latency-sensitive part of the codebase, requiring isolation for easier debugging, testing, and maintenance.

---

## Background: What is Optimistic Simulation?

The Internet Computer has 800-2000ms query latency. Displaying backend state directly results in 1-2 FPS choppy gameplay. The solution:

1. **Frontend runs its own Conway's Game of Life** at 8 generations/second
2. **Backend is authoritative** - runs the real game with sieges, territory, wipes
3. **Periodic sync** every 500ms corrects frontend drift
4. **Sync decision logic** prevents backward jumps and handles out-of-order responses

See `OPTIMISTIC_SIM_JOURNEY.md` for the full history of attempts and failures.

---

## Current State (Life.tsx)

All simulation logic is embedded in the 3,141-line `Life.tsx` component:

### Data Types (lines 65-94)

```typescript
// Life.tsx:65-69
interface Cell {
  owner: number;  // 0 = neutral, 1-9 = player slots
  alive: boolean;
}

// Life.tsx:87-94
const findProtectionZoneOwner = (x: number, y: number, bases: Map<number, BaseInfo>): number | null => {
  for (const [playerNum, base] of bases) {
    if (isInBaseZone(x, y, base.x, base.y)) {
      return playerNum;
    }
  }
  return null;
};
```

### Local GOL Step Function (lines 106-200)

```typescript
// Life.tsx:106-200
const stepLocalGeneration = (cells: Cell[], bases: Map<number, BaseInfo>): Cell[] => {
  // Full Conway's Game of Life step with:
  // - Toroidal wrapping (512x512 grid)
  // - Neighbor counting
  // - Birth/death rules (2-3 survive, 3 birth)
  // - Majority owner inheritance for births
  // - Siege mechanic (births blocked in enemy base zones)
  // - Performance tracking
};
```

### State Variables (lines 340-366)

```typescript
// Sync verification state
const [localGeneration, setLocalGeneration] = useState<bigint>(0n);
const [lastSyncedGeneration, setLastSyncedGeneration] = useState<bigint>(0n);
const [lastSyncTime, setLastSyncTime] = useState<number>(0);
const [syncStatus, setSyncStatus] = useState<SyncStatus>(...);

// Refs for async callbacks (avoid stale closures)
const localCellsRef = useRef<Cell[]>([]);
const localGenerationRef = useRef<bigint>(0n);
const lastSyncedGenerationRef = useRef<bigint>(0n);
const lastSyncTimeRef = useRef<number>(0);
const basesRef = useRef<Map<number, BaseInfo>>(new Map());

// Query tracking
const queryLatencyStats = useRef<{ samples: number[] }>({ samples: [] });
const querySequence = useRef<number>(0);
```

### Backend Sync Effect (lines 795-977)

```typescript
// Life.tsx:795-977 - The core sync logic
useEffect(() => {
  const syncFromBackend = async () => {
    // 1. Query backend for authoritative state
    // 2. Calculate generation difference (genDiff)
    // 3. SYNC DECISION:
    //    - If backend AHEAD (genDiff < 0): Always sync
    //    - If local slightly ahead: Skip (let backend catch up)
    //    - If local way ahead (>16 gens) OR force timeout (5s): Sync
    // 4. Apply state: cells, generation, bases, balance, wipe info
  };

  syncFromBackend();
  const syncInterval = setInterval(syncFromBackend, BACKEND_SYNC_MS);
  return () => clearInterval(syncInterval);
}, [actor, principal, isAuthenticated, sparseToDense]);
```

### Local Simulation Tick Effect (lines 979-991)

```typescript
// Life.tsx:979-991
useEffect(() => {
  if (!ENABLE_LOCAL_SIM || !isRunning || isFrozen || localCells.length === 0) return;

  const localTick = setInterval(() => {
    setLocalCells(cells => stepLocalGeneration(cells, basesRef.current));
    setLocalGeneration(g => g + 1n);
  }, LOCAL_TICK_MS);

  return () => clearInterval(localTick);
}, [isRunning, isFrozen, localCells.length > 0]);
```

### Sparse-to-Dense Conversion (lines 661-730)

```typescript
// Life.tsx:661-730
const sparseToDense = useCallback((state: GameState): Cell[] => {
  // Convert backend bitmap format to dense Cell[] array
  // Decode alive_bitmap (u64 words → individual cells)
  // Apply territory from TerritoryExport chunks
}, []);
```

---

## Target Architecture

Create a new module: `openhouse_frontend/src/pages/life/engine/OptimisticSimulation.ts`

### Module Structure

```
openhouse_frontend/src/pages/life/engine/
├── OptimisticSimulation.ts   # Main class
├── ConwayRules.ts            # Pure GOL step function
├── types.ts                  # Cell, SyncState, etc.
└── index.ts                  # Exports
```

---

## Extraction Steps

### Step 1: Create Types File

**File:** `life/engine/types.ts`

```typescript
import type { BaseInfo } from '../../../declarations/life1_backend/life1_backend.did';

export interface Cell {
  owner: number;  // 0 = neutral, 1-10 = player slots
  alive: boolean;
}

export interface SyncState {
  localGeneration: bigint;
  lastSyncedGeneration: bigint;
  lastSyncTime: number;
  inSync: boolean;
  driftGens: number;
}

export interface SyncDecision {
  shouldSync: boolean;
  reason: 'catchup' | 'drift' | 'force' | 'skip';
  genDiff: number;
}

export interface LatencyStats {
  samples: number[];
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface SimulationConfig {
  gridSize: number;           // 512
  localTickMs: number;        // 125 (8 gen/sec)
  backendSyncMs: number;      // 500
  syncToleranceGens: number;  // 16
  forceSyncMs: number;        // 5000
  enableLocalSim: boolean;    // true
}
```

### Step 2: Extract Conway Rules

**File:** `life/engine/ConwayRules.ts`

Extract `stepLocalGeneration` as a pure function with no React dependencies:

```typescript
import type { Cell } from './types';
import type { BaseInfo } from '../../../declarations/life1_backend/life1_backend.did';
import { isInBaseZone } from '../../lifeConstants';

/**
 * Find which player's base protection zone contains this cell (if any)
 */
export function findProtectionZoneOwner(
  x: number,
  y: number,
  bases: Map<number, BaseInfo>
): number | null {
  for (const [playerNum, base] of bases) {
    if (isInBaseZone(x, y, base.x, base.y)) {
      return playerNum;
    }
  }
  return null;
}

/**
 * Run one generation of Conway's Game of Life with siege mechanics.
 *
 * Rules:
 * - Living cell survives with 2-3 neighbors
 * - Dead cell born with exactly 3 neighbors
 * - New cell owner = majority owner among 3 parents
 * - Births blocked in enemy base protection zones (siege)
 * - Territory (owner) persists even when cells die
 *
 * @param cells - Current 512x512 dense grid
 * @param bases - Map of player bases for siege checking
 * @param gridSize - Grid dimension (512)
 * @returns New cell array after one generation
 */
export function stepGeneration(
  cells: Cell[],
  bases: Map<number, BaseInfo>,
  gridSize: number = 512
): Cell[] {
  if (cells.length === 0) return cells;

  const newCells: Cell[] = new Array(gridSize * gridSize);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      const current = cells[idx];

      // Count neighbors and track owner counts
      let neighborCount = 0;
      const ownerCounts: number[] = new Array(11).fill(0);

      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (di === 0 && dj === 0) continue;

          // Toroidal wrap
          const nRow = (row + di + gridSize) % gridSize;
          const nCol = (col + dj + gridSize) % gridSize;
          const neighbor = cells[nRow * gridSize + nCol];

          if (neighbor.alive) {
            neighborCount++;
            if (neighbor.owner > 0 && neighbor.owner <= 10) {
              ownerCounts[neighbor.owner]++;
            }
          }
        }
      }

      // Apply Conway's rules
      let newAlive = false;
      let newOwner = current.owner;

      if (current.alive) {
        newAlive = neighborCount === 2 || neighborCount === 3;
      } else {
        if (neighborCount === 3) {
          newAlive = true;

          // Majority owner among parents
          let maxCount = 0;
          let majorityOwner = 1;
          for (let o = 1; o <= 10; o++) {
            if (ownerCounts[o] > maxCount) {
              maxCount = ownerCounts[o];
              majorityOwner = o;
            }
          }
          newOwner = majorityOwner;

          // Siege: births blocked in enemy base zones
          const protectionOwner = findProtectionZoneOwner(col, row, bases);
          if (protectionOwner !== null && protectionOwner !== newOwner) {
            newAlive = false;
            newOwner = current.owner;
          }
        }
      }

      newCells[idx] = { owner: newOwner, alive: newAlive };
    }
  }

  return newCells;
}
```

### Step 3: Create Main Simulation Class

**File:** `life/engine/OptimisticSimulation.ts`

```typescript
import type { Cell, SyncState, SyncDecision, SimulationConfig, LatencyStats } from './types';
import type { GameState, BaseInfo } from '../../../declarations/life1_backend/life1_backend.did';
import { stepGeneration } from './ConwayRules';
import { GRID_SIZE, TOTAL_CELLS } from '../../lifeConstants';

const DEFAULT_CONFIG: SimulationConfig = {
  gridSize: 512,
  localTickMs: 125,        // 8 gen/sec
  backendSyncMs: 500,
  syncToleranceGens: 16,
  forceSyncMs: 5000,
  enableLocalSim: true,
};

/**
 * Manages optimistic local simulation with backend sync.
 *
 * Architecture:
 * - Frontend runs local GOL at 8 gen/sec for smooth animation
 * - Backend is authoritative (handles sieges, disconnection, wipes)
 * - Sync every 500ms applies backend state if it's ahead
 * - Only accepts forward progress (never backward jumps)
 */
export class OptimisticSimulation {
  private config: SimulationConfig;

  // Cell state
  private cells: Cell[] = [];
  private bases: Map<number, BaseInfo> = new Map();

  // Sync tracking
  private localGeneration: bigint = 0n;
  private lastSyncedGeneration: bigint = 0n;
  private lastSyncTime: number = 0;

  // Query tracking
  private querySequence: number = 0;
  private latencyStats: LatencyStats = {
    samples: [],
    avgMs: 0,
    minMs: Infinity,
    maxMs: 0,
  };

  // Intervals
  private localTickInterval: ReturnType<typeof setInterval> | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private onCellsUpdate: ((cells: Cell[]) => void) | null = null;
  private onSyncStateChange: ((state: SyncState) => void) | null = null;
  private onSync: ((state: GameState) => void) | null = null;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============ PUBLIC API ============

  /**
   * Initialize with backend state
   */
  initialize(state: GameState, bases: Map<number, BaseInfo>): void {
    this.cells = this.sparseToDense(state);
    this.bases = bases;
    this.localGeneration = state.generation;
    this.lastSyncedGeneration = state.generation;
    this.lastSyncTime = Date.now();
    this.emitCellsUpdate();
  }

  /**
   * Start local simulation tick
   */
  startLocalSim(): void {
    if (!this.config.enableLocalSim) return;
    this.stopLocalSim();

    this.localTickInterval = setInterval(() => {
      this.stepLocal();
    }, this.config.localTickMs);
  }

  /**
   * Stop local simulation
   */
  stopLocalSim(): void {
    if (this.localTickInterval) {
      clearInterval(this.localTickInterval);
      this.localTickInterval = null;
    }
  }

  /**
   * Process incoming backend state.
   * Returns whether sync was applied.
   */
  processBackendState(state: GameState, latencyMs: number): boolean {
    this.recordLatency(latencyMs);

    const decision = this.makeSyncDecision(state.generation);

    if (!decision.shouldSync) {
      return false;
    }

    // Apply sync
    this.cells = this.sparseToDense(state);
    this.localGeneration = state.generation;
    this.lastSyncedGeneration = state.generation;
    this.lastSyncTime = Date.now();

    this.emitCellsUpdate();
    this.emitSyncStateChange();

    if (this.onSync) {
      this.onSync(state);
    }

    console.log('[SYNC]', {
      incoming: state.generation.toString(),
      localGen: this.localGeneration.toString(),
      correction: decision.genDiff,
      reason: decision.reason,
      latency: `${latencyMs.toFixed(0)}ms`,
    });

    return true;
  }

  /**
   * Optimistically apply cell placements
   */
  applyOptimisticPlacement(placements: Array<[number, number]>, owner: number): void {
    for (const [x, y] of placements) {
      const idx = y * this.config.gridSize + x;
      if (idx >= 0 && idx < this.cells.length) {
        this.cells[idx] = { owner, alive: true };
      }
    }
    this.emitCellsUpdate();
  }

  /**
   * Update bases (for siege checking)
   */
  updateBases(bases: Map<number, BaseInfo>): void {
    this.bases = bases;
  }

  /**
   * Get current cells (read-only view)
   */
  getCells(): readonly Cell[] {
    return this.cells;
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return {
      localGeneration: this.localGeneration,
      lastSyncedGeneration: this.lastSyncedGeneration,
      lastSyncTime: this.lastSyncTime,
      inSync: this.localGeneration === this.lastSyncedGeneration,
      driftGens: Number(this.localGeneration - this.lastSyncedGeneration),
    };
  }

  /**
   * Get latency statistics
   */
  getLatencyStats(): LatencyStats {
    return { ...this.latencyStats };
  }

  /**
   * Clean up intervals
   */
  destroy(): void {
    this.stopLocalSim();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // ============ CALLBACKS ============

  onCellsChanged(callback: (cells: Cell[]) => void): void {
    this.onCellsUpdate = callback;
  }

  onSyncStateChanged(callback: (state: SyncState) => void): void {
    this.onSyncStateChange = callback;
  }

  onBackendSync(callback: (state: GameState) => void): void {
    this.onSync = callback;
  }

  // ============ PRIVATE ============

  private stepLocal(): void {
    if (this.cells.length === 0) return;

    this.cells = stepGeneration(this.cells, this.bases, this.config.gridSize);
    this.localGeneration += 1n;

    this.emitCellsUpdate();
  }

  /**
   * Core sync decision logic.
   *
   * Strategy:
   * - Backend AHEAD (genDiff < 0): Always sync (we're behind)
   * - Local slightly ahead: Skip (let backend catch up)
   * - Local way ahead (>tolerance) OR force timeout: Sync to prevent drift
   */
  private makeSyncDecision(incomingGen: bigint): SyncDecision {
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;
    const genDiff = Number(this.localGeneration - incomingGen);

    // Reject true out-of-order (older than already synced)
    if (incomingGen < this.lastSyncedGeneration) {
      return { shouldSync: false, reason: 'skip', genDiff };
    }

    const backendAhead = genDiff < 0;
    const localTooFarAhead = genDiff > this.config.syncToleranceGens;
    const needsForceSync = timeSinceLastSync >= this.config.forceSyncMs;

    if (backendAhead) {
      return { shouldSync: true, reason: 'catchup', genDiff };
    }

    if (needsForceSync) {
      return { shouldSync: true, reason: 'force', genDiff };
    }

    if (localTooFarAhead) {
      return { shouldSync: true, reason: 'drift', genDiff };
    }

    return { shouldSync: false, reason: 'skip', genDiff };
  }

  private recordLatency(ms: number): void {
    this.latencyStats.samples.push(ms);
    if (this.latencyStats.samples.length > 20) {
      this.latencyStats.samples.shift();
    }

    const samples = this.latencyStats.samples;
    this.latencyStats.avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;
    this.latencyStats.minMs = Math.min(...samples);
    this.latencyStats.maxMs = Math.max(...samples);
  }

  /**
   * Convert backend bitmap format to dense Cell[] array
   */
  private sparseToDense(state: GameState): Cell[] {
    const dense: Cell[] = new Array(TOTAL_CELLS).fill(null).map(() => ({
      owner: 0,
      alive: false
    }));

    // Decode alive_bitmap
    const bitmap = Array.from(state.alive_bitmap);
    for (let wordIdx = 0; wordIdx < bitmap.length; wordIdx++) {
      const word = BigInt(bitmap[wordIdx]);
      for (let bit = 0; bit < 64; bit++) {
        if ((word >> BigInt(bit)) & BigInt(1)) {
          const cellIdx = wordIdx * 64 + bit;
          if (cellIdx < TOTAL_CELLS) {
            dense[cellIdx].alive = true;
          }
        }
      }
    }

    // Apply territory from slots
    for (let slotIdx = 0; slotIdx < state.territories.length; slotIdx++) {
      const territory = state.territories[slotIdx];
      if (!territory) continue;

      const playerNum = slotIdx + 1;
      const chunkMask = BigInt(territory.chunk_mask);

      let chunkDataIdx = 0;
      for (let chunkIdx = 0; chunkIdx < 64; chunkIdx++) {
        if (!((chunkMask >> BigInt(chunkIdx)) & 1n)) continue;

        const chunkData = territory.chunks[chunkDataIdx];
        if (!chunkData) { chunkDataIdx++; continue; }

        const chunkRow = Math.floor(chunkIdx / 8);
        const chunkCol = chunkIdx % 8;
        const baseY = chunkRow * 64;
        const baseX = chunkCol * 64;

        for (let rowInChunk = 0; rowInChunk < 64; rowInChunk++) {
          const word = BigInt(chunkData[rowInChunk] || 0n);
          for (let bit = 0; bit < 64; bit++) {
            if ((word >> BigInt(bit)) & 1n) {
              const cellX = baseX + bit;
              const cellY = baseY + rowInChunk;
              const cellIdx = cellY * GRID_SIZE + cellX;
              if (cellIdx < TOTAL_CELLS) {
                dense[cellIdx].owner = playerNum;
              }
            }
          }
        }
        chunkDataIdx++;
      }
    }

    // Mark owned alive cells
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (dense[i].alive && dense[i].owner === 0) {
        dense[i].owner = 1; // Default owner for unowned alive cells
      }
    }

    return dense;
  }

  private emitCellsUpdate(): void {
    if (this.onCellsUpdate) {
      this.onCellsUpdate(this.cells);
    }
  }

  private emitSyncStateChange(): void {
    if (this.onSyncStateChange) {
      this.onSyncStateChange(this.getSyncState());
    }
  }
}
```

### Step 4: Create Index Export

**File:** `life/engine/index.ts`

```typescript
export { OptimisticSimulation } from './OptimisticSimulation';
export { stepGeneration, findProtectionZoneOwner } from './ConwayRules';
export type { Cell, SyncState, SyncDecision, SimulationConfig, LatencyStats } from './types';
```

### Step 5: Create React Hook Wrapper

**File:** `life/engine/useOptimisticSimulation.ts`

```typescript
import { useRef, useEffect, useState, useCallback } from 'react';
import { OptimisticSimulation } from './OptimisticSimulation';
import type { Cell, SyncState, SimulationConfig } from './types';
import type { GameState, BaseInfo } from '../../../declarations/life1_backend/life1_backend.did';

interface UseOptimisticSimulationOptions {
  config?: Partial<SimulationConfig>;
  isRunning: boolean;
  isFrozen: boolean;
}

export function useOptimisticSimulation(options: UseOptimisticSimulationOptions) {
  const { config, isRunning, isFrozen } = options;

  const simRef = useRef<OptimisticSimulation | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [syncState, setSyncState] = useState<SyncState>({
    localGeneration: 0n,
    lastSyncedGeneration: 0n,
    lastSyncTime: 0,
    inSync: true,
    driftGens: 0,
  });

  // Initialize simulation
  useEffect(() => {
    const sim = new OptimisticSimulation(config);
    sim.onCellsChanged(setCells);
    sim.onSyncStateChanged(setSyncState);
    simRef.current = sim;

    return () => {
      sim.destroy();
      simRef.current = null;
    };
  }, []);  // Only on mount

  // Control local simulation
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;

    if (isRunning && !isFrozen && cells.length > 0) {
      sim.startLocalSim();
    } else {
      sim.stopLocalSim();
    }

    return () => sim.stopLocalSim();
  }, [isRunning, isFrozen, cells.length > 0]);

  // API methods
  const initialize = useCallback((state: GameState, bases: Map<number, BaseInfo>) => {
    simRef.current?.initialize(state, bases);
  }, []);

  const processBackendState = useCallback((state: GameState, latencyMs: number) => {
    return simRef.current?.processBackendState(state, latencyMs) ?? false;
  }, []);

  const applyOptimisticPlacement = useCallback((
    placements: Array<[number, number]>,
    owner: number
  ) => {
    simRef.current?.applyOptimisticPlacement(placements, owner);
  }, []);

  const updateBases = useCallback((bases: Map<number, BaseInfo>) => {
    simRef.current?.updateBases(bases);
  }, []);

  const getLatencyStats = useCallback(() => {
    return simRef.current?.getLatencyStats() ?? { samples: [], avgMs: 0, minMs: 0, maxMs: 0 };
  }, []);

  return {
    cells,
    syncState,
    initialize,
    processBackendState,
    applyOptimisticPlacement,
    updateBases,
    getLatencyStats,
  };
}
```

---

## Integration into Life.tsx

After extraction, Life.tsx changes from:

```typescript
// OLD: ~200 lines of simulation code embedded
const [localCells, setLocalCells] = useState<Cell[]>([]);
const [localGeneration, setLocalGeneration] = useState<bigint>(0n);
// ... many more state variables and effects
```

To:

```typescript
// NEW: Clean hook usage
import { useOptimisticSimulation } from './life/engine';

const {
  cells,
  syncState,
  initialize,
  processBackendState,
  applyOptimisticPlacement,
  updateBases,
} = useOptimisticSimulation({
  isRunning,
  isFrozen,
});

// Backend sync effect becomes much simpler:
useEffect(() => {
  const sync = async () => {
    const t0 = performance.now();
    const state = await actor.get_state();
    const latencyMs = performance.now() - t0;

    if (processBackendState(state, latencyMs)) {
      // Sync was applied - update other state (bases, balance, etc.)
      updateBasesFromState(state);
    }
  };

  sync();
  const interval = setInterval(sync, BACKEND_SYNC_MS);
  return () => clearInterval(interval);
}, [actor, processBackendState]);
```

---

## Testing Strategy

### Unit Tests for ConwayRules.ts

```typescript
describe('stepGeneration', () => {
  it('should kill cell with 0 neighbors', () => { /* ... */ });
  it('should kill cell with 1 neighbor', () => { /* ... */ });
  it('should keep cell alive with 2 neighbors', () => { /* ... */ });
  it('should keep cell alive with 3 neighbors', () => { /* ... */ });
  it('should kill cell with 4+ neighbors', () => { /* ... */ });
  it('should birth cell with exactly 3 neighbors', () => { /* ... */ });
  it('should assign majority owner to birthed cells', () => { /* ... */ });
  it('should block births in enemy base zones (siege)', () => { /* ... */ });
  it('should wrap toroidally', () => { /* ... */ });
});
```

### Unit Tests for Sync Decision Logic

```typescript
describe('makeSyncDecision', () => {
  it('should sync when backend is ahead', () => { /* ... */ });
  it('should skip when local is slightly ahead', () => { /* ... */ });
  it('should sync on drift (local >16 gens ahead)', () => { /* ... */ });
  it('should force sync after 5 seconds', () => { /* ... */ });
  it('should reject out-of-order responses', () => { /* ... */ });
});
```

---

## Files to Create

| File | Lines | Purpose |
|------|-------|---------|
| `life/engine/types.ts` | ~50 | Type definitions |
| `life/engine/ConwayRules.ts` | ~100 | Pure GOL logic |
| `life/engine/OptimisticSimulation.ts` | ~300 | Main simulation class |
| `life/engine/useOptimisticSimulation.ts` | ~80 | React hook wrapper |
| `life/engine/index.ts` | ~5 | Exports |

**Total: ~535 lines** (extracted from Life.tsx's ~400 lines of sim code)

---

## Lines Removed from Life.tsx

After extraction, remove from Life.tsx:

1. **Lines 65-200**: `Cell` interface, `findProtectionZoneOwner`, `stepLocalGeneration`, `perfStats`
2. **Lines 340-366**: Sync state variables and refs
3. **Lines 661-730**: `sparseToDense` function
4. **Lines 795-977**: Backend sync useEffect
5. **Lines 979-991**: Local simulation tick useEffect

**Estimated reduction: ~400 lines** (from 3,141 to ~2,741)

---

## Migration Checklist

- [ ] Create `life/engine/types.ts`
- [ ] Create `life/engine/ConwayRules.ts` with `stepGeneration`
- [ ] Create `life/engine/OptimisticSimulation.ts`
- [ ] Create `life/engine/useOptimisticSimulation.ts`
- [ ] Create `life/engine/index.ts`
- [ ] Update Life.tsx to use new hook
- [ ] Remove old embedded simulation code from Life.tsx
- [ ] Test locally (verify smooth animation)
- [ ] Test multiplayer sync (verify other players visible)
- [ ] Deploy to mainnet

---

## Success Criteria

1. **Same visual behavior** - Smooth 8 FPS animation
2. **Same sync behavior** - Other players visible within 500ms
3. **Testable** - ConwayRules has unit tests
4. **Isolated** - Simulation logic has no React dependencies
5. **Smaller Life.tsx** - Reduced by ~400 lines

---

## Notes for Implementer

- The `sparseToDense` function is the most complex part - carefully preserve territory chunk decoding
- Keep the sync decision logic EXACTLY as-is - it was hard-won through many iterations
- The `refs` pattern (localGenerationRef, etc.) exists to avoid stale closures in async callbacks
- Performance tracking (`perfStats`) can be removed or made optional
- The hook should expose the same API that Life.tsx currently uses internally
