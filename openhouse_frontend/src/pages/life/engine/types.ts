/**
 * Optimistic Simulation Type Definitions
 *
 * These types support the frontend's local Conway simulation that runs
 * between backend syncs to provide smooth animation despite IC latency.
 */

import type { BaseInfo } from '../../../declarations/life1_backend/life1_backend.did';

// Re-export for convenience
export type { BaseInfo };

/**
 * Dense grid cell representation.
 * Used for local simulation (vs. backend's bitmap format).
 */
export interface Cell {
  owner: number;  // 0 = neutral, 1-10 = player slots
  alive: boolean;
}

/**
 * Current synchronization state between local and backend.
 */
export interface SyncState {
  localGeneration: bigint;
  lastSyncedGeneration: bigint;
  lastSyncTime: number;
  inSync: boolean;
  driftGens: number;
}

/**
 * Result of sync decision logic.
 */
export interface SyncDecision {
  shouldSync: boolean;
  reason: 'catchup' | 'drift' | 'force' | 'skip';
  genDiff: number;
}

/**
 * Query latency statistics for monitoring.
 */
export interface LatencyStats {
  samples: number[];
  avgMs: number;
  minMs: number;
  maxMs: number;
}

/**
 * Configuration for the optimistic simulation.
 */
export interface SimulationConfig {
  gridSize: number;           // 512
  localTickMs: number;        // 125 (8 gen/sec)
  backendSyncMs: number;      // 500
  syncToleranceGens: number;  // 16
  forceSyncMs: number;        // 5000
  enableLocalSim: boolean;    // true
}

/**
 * Callbacks for simulation events.
 */
export interface SimulationCallbacks {
  onCellsUpdate?: (cells: Cell[]) => void;
  onSyncStateChange?: (state: SyncState) => void;
  onGenerationUpdate?: (generation: bigint) => void;
}
