/**
 * Optimistic Simulation Engine
 *
 * Manages local Conway simulation with backend sync for smooth animation
 * despite Internet Computer's 800-2000ms query latency.
 *
 * Architecture:
 * - Frontend runs local GOL at 8 gen/sec for smooth animation
 * - Backend is authoritative (handles sieges, disconnection, wipes)
 * - Sync every 500ms applies backend state if it's ahead
 * - Only accepts forward progress (never backward jumps)
 */

import type {
  Cell,
  SyncState,
  SyncDecision,
  SimulationConfig,
  LatencyStats,
  BaseInfo,
} from './types';
import type { GameState } from '../../../declarations/life1_backend/life1_backend.did';
import { stepGeneration } from './ConwayRules';
import {
  GRID_SIZE,
  TOTAL_CELLS,
  LOCAL_TICK_MS,
  BACKEND_SYNC_MS,
  SYNC_TOLERANCE_GENS,
  FORCE_SYNC_MS,
  ENABLE_LOCAL_SIM,
} from '../../lifeConstants';

const DEFAULT_CONFIG: SimulationConfig = {
  gridSize: GRID_SIZE,
  localTickMs: LOCAL_TICK_MS,
  backendSyncMs: BACKEND_SYNC_MS,
  syncToleranceGens: SYNC_TOLERANCE_GENS,
  forceSyncMs: FORCE_SYNC_MS,
  enableLocalSim: ENABLE_LOCAL_SIM,
};

/**
 * Manages optimistic local simulation with backend sync.
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
  private latencyStats: LatencyStats = {
    samples: [],
    avgMs: 0,
    minMs: Infinity,
    maxMs: 0,
  };

  // Intervals
  private localTickInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private onCellsUpdate: ((cells: Cell[]) => void) | null = null;
  private onSyncStateChange: ((state: SyncState) => void) | null = null;
  private onGenerationUpdate: ((generation: bigint) => void) | null = null;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============ PUBLIC API ============

  /**
   * Initialize with backend state.
   */
  initialize(state: GameState, bases: Map<number, BaseInfo>): void {
    this.cells = this.sparseToDense(state);
    this.bases = bases;
    this.localGeneration = state.generation;
    this.lastSyncedGeneration = state.generation;
    this.lastSyncTime = Date.now();
    this.emitCellsUpdate();
    this.emitGenerationUpdate();
  }

  /**
   * Start local simulation tick.
   */
  startLocalSim(): void {
    if (!this.config.enableLocalSim) return;
    this.stopLocalSim();

    this.localTickInterval = setInterval(() => {
      this.stepLocal();
    }, this.config.localTickMs);
  }

  /**
   * Stop local simulation.
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

    const decision = this.makeSyncDecision(state.generation, latencyMs);

    if (!decision.shouldSync) {
      console.log('[SYNC:skip]', {
        incoming: state.generation.toString(),
        localGen: this.localGeneration.toString(),
        drift: decision.genDiff,
        reason: decision.reason,
      });
      return false;
    }

    // RTT COMPENSATION: The backend has advanced since this response was generated.
    // Estimate how many generations passed during the round-trip.
    const rttGens = Math.floor(latencyMs / this.config.localTickMs);
    const compensatedGen = state.generation + BigInt(rttGens);

    const beforeLocalGen = this.localGeneration;

    // Apply sync with RTT compensation
    this.cells = this.sparseToDense(state);
    this.localGeneration = compensatedGen;  // Jump ahead to estimated current backend position
    this.lastSyncedGeneration = state.generation;  // Track actual synced state
    this.lastSyncTime = Date.now();

    this.emitCellsUpdate();
    this.emitSyncStateChange();
    this.emitGenerationUpdate();

    console.log('[SYNC:apply]', {
      backendReported: state.generation.toString(),
      rttCompensation: `+${rttGens}`,
      newLocalGen: this.localGeneration.toString(),
      wasAt: beforeLocalGen.toString(),
      netJump: Number(this.localGeneration - beforeLocalGen),
      latency: `${latencyMs.toFixed(0)}ms`,
      reason: decision.reason,
    });

    return true;
  }

  /**
   * Force sync from backend state (bypasses decision logic).
   * Use for initial state or explicit refresh.
   */
  forceSync(state: GameState): void {
    this.cells = this.sparseToDense(state);
    this.localGeneration = state.generation;
    this.lastSyncedGeneration = state.generation;
    this.lastSyncTime = Date.now();
    this.emitCellsUpdate();
    this.emitSyncStateChange();
    this.emitGenerationUpdate();
  }

  /**
   * Optimistically apply cell placements.
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
   * Update bases (for siege checking).
   */
  updateBases(bases: Map<number, BaseInfo>): void {
    this.bases = bases;
  }

  /**
   * Get current cells (read-only view).
   */
  getCells(): readonly Cell[] {
    return this.cells;
  }

  /**
   * Get current local generation.
   */
  getLocalGeneration(): bigint {
    return this.localGeneration;
  }

  /**
   * Get current sync state.
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
   * Get latency statistics.
   */
  getLatencyStats(): LatencyStats {
    return { ...this.latencyStats };
  }

  /**
   * Check if simulation is running.
   */
  isRunning(): boolean {
    return this.localTickInterval !== null;
  }

  /**
   * Clean up intervals.
   */
  destroy(): void {
    this.stopLocalSim();
  }

  // ============ CALLBACKS ============

  onCellsChanged(callback: (cells: Cell[]) => void): void {
    this.onCellsUpdate = callback;
  }

  onSyncStateChanged(callback: (state: SyncState) => void): void {
    this.onSyncStateChange = callback;
  }

  onGenerationChanged(callback: (generation: bigint) => void): void {
    this.onGenerationUpdate = callback;
  }

  // ============ PRIVATE ============

  private stepLocal(): void {
    if (this.cells.length === 0) return;

    this.cells = stepGeneration(this.cells, this.bases, this.config.gridSize);
    this.localGeneration += 1n;

    this.emitCellsUpdate();
    this.emitGenerationUpdate();
  }

  /**
   * Core sync decision logic with RTT awareness.
   *
   * Key insight: incomingGen is where backend WAS when query was made.
   * The backend is now at approximately: incomingGen + (latencyMs / tickMs)
   *
   * Strategy:
   * - Compare local position to ESTIMATED current backend position
   * - If we're behind the estimated position: sync (catchup)
   * - If we're close (within tolerance): skip (in sync)
   * - If way ahead or force timeout: sync (drift/force)
   */
  private makeSyncDecision(incomingGen: bigint, latencyMs: number = 0): SyncDecision {
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;

    // Estimate where backend IS NOW (not where it was when response was generated)
    const rttGens = Math.floor(latencyMs / this.config.localTickMs);
    const estimatedBackendNow = incomingGen + BigInt(rttGens);

    // genDiff > 0 means local is ahead of estimated backend
    // genDiff < 0 means local is behind estimated backend
    const genDiff = Number(this.localGeneration - estimatedBackendNow);

    // REJECT: True out-of-order (older than what we've already synced to)
    if (incomingGen < this.lastSyncedGeneration) {
      return { shouldSync: false, reason: 'skip', genDiff };
    }

    const needsForceSync = timeSinceLastSync >= this.config.forceSyncMs;

    // If local is behind estimated backend position, sync to catch up
    if (genDiff < -2) {  // Allow 2 gen slack for timing jitter
      return { shouldSync: true, reason: 'catchup', genDiff };
    }

    // If we're roughly in sync (-2 to +tolerance), skip
    if (genDiff >= -2 && genDiff <= this.config.syncToleranceGens) {
      // Force sync overrides if it's been too long
      if (needsForceSync) {
        return { shouldSync: true, reason: 'force', genDiff };
      }
      return { shouldSync: false, reason: 'skip', genDiff };
    }

    // Local is way ahead (> tolerance), sync to prevent drift
    return { shouldSync: true, reason: 'drift', genDiff };
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
   * Convert backend bitmap format to dense Cell[] array.
   */
  private sparseToDense(state: GameState): Cell[] {
    const dense: Cell[] = new Array(TOTAL_CELLS).fill(null).map(() => ({
      owner: 0,
      alive: false,
    }));

    // Decode alive_bitmap - each u64 represents 64 consecutive cells
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

    // Decode territories for each player slot (index 0 = slot 1, etc.)
    for (let slotIdx = 0; slotIdx < state.territories.length; slotIdx++) {
      const territory = state.territories[slotIdx];
      const playerNum = slotIdx + 1; // Slots are 1-indexed

      // chunk_mask indicates which 4096-cell chunks have data
      const chunkMask = BigInt(territory.chunk_mask);
      let chunkDataIdx = 0;

      for (let chunkIdx = 0; chunkIdx < 64; chunkIdx++) {
        // 64 chunks (8x8 grid of 64x64 chunks)
        if (!((chunkMask >> BigInt(chunkIdx)) & BigInt(1))) continue;

        // This chunk has data
        const chunkData = territory.chunks[chunkDataIdx];
        chunkDataIdx++;

        if (!chunkData) continue;

        // Chunk grid position (8x8 grid of chunks)
        const chunkRow = Math.floor(chunkIdx / 8); // 0-7
        const chunkCol = chunkIdx % 8; // 0-7

        // Each chunk has 64 words (one per row of 64 cells)
        const words = Array.from(chunkData);
        for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
          const word = BigInt(words[wordIdx]);
          for (let bit = 0; bit < 64; bit++) {
            if ((word >> BigInt(bit)) & BigInt(1)) {
              // wordIdx is the local row (0-63), bit is the local column (0-63)
              const localY = wordIdx;
              const localX = bit;

              // Global coordinates
              const globalY = chunkRow * 64 + localY;
              const globalX = chunkCol * 64 + localX;

              // Linear cell index (row-major: y * width + x)
              const cellIdx = globalY * GRID_SIZE + globalX;
              if (cellIdx < TOTAL_CELLS) {
                dense[cellIdx].owner = playerNum;
              }
            }
          }
        }
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

  private emitGenerationUpdate(): void {
    if (this.onGenerationUpdate) {
      this.onGenerationUpdate(this.localGeneration);
    }
  }
}
