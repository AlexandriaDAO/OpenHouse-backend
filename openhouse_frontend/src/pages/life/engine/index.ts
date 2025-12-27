/**
 * Optimistic Simulation Engine
 *
 * Provides smooth local Conway's Game of Life simulation between
 * backend syncs, compensating for IC's 800-2000ms latency.
 */

// Main class
export { OptimisticSimulation } from './OptimisticSimulation';

// React hook
export { useOptimisticSimulation } from './useOptimisticSimulation';

// Pure functions (testable)
export { stepGeneration, findProtectionZoneOwner, countAlive, countByOwner } from './ConwayRules';

// Types
export type {
  Cell,
  SyncState,
  SyncDecision,
  SimulationConfig,
  LatencyStats,
  SimulationCallbacks,
  BaseInfo,
} from './types';
