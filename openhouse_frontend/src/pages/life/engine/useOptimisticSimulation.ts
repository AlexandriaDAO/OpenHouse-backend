/**
 * React Hook for Optimistic Simulation
 *
 * Provides a React-friendly interface to the OptimisticSimulation class,
 * managing lifecycle, state updates, and refs for async callbacks.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { OptimisticSimulation } from './OptimisticSimulation';
import type { Cell, SyncState, SimulationConfig, BaseInfo } from './types';
import type { GameState } from '../../../declarations/life1_backend/life1_backend.did';

interface UseOptimisticSimulationOptions {
  config?: Partial<SimulationConfig>;
  isRunning: boolean;
  isFrozen: boolean;
}

interface UseOptimisticSimulationResult {
  /** Current cell grid state */
  cells: Cell[];
  /** Current sync state */
  syncState: SyncState;
  /** Current local generation */
  localGeneration: bigint;
  /** Initialize simulation with backend state */
  initialize: (state: GameState, bases: Map<number, BaseInfo>) => void;
  /** Process incoming backend state, returns true if sync was applied */
  processBackendState: (state: GameState, latencyMs: number) => boolean;
  /** Force sync from backend state */
  forceSync: (state: GameState) => void;
  /** Apply optimistic cell placements */
  applyOptimisticPlacement: (placements: Array<[number, number]>, owner: number) => void;
  /** Update bases for siege checking */
  updateBases: (bases: Map<number, BaseInfo>) => void;
  /** Get latency statistics */
  getLatencyStats: () => { samples: number[]; avgMs: number; minMs: number; maxMs: number };
  /** Get simulation instance for advanced use */
  getSimulation: () => OptimisticSimulation | null;
}

const DEFAULT_SYNC_STATE: SyncState = {
  localGeneration: 0n,
  lastSyncedGeneration: 0n,
  lastSyncTime: 0,
  inSync: true,
  driftGens: 0,
};

export function useOptimisticSimulation(
  options: UseOptimisticSimulationOptions
): UseOptimisticSimulationResult {
  const { config, isRunning, isFrozen } = options;

  const simRef = useRef<OptimisticSimulation | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [syncState, setSyncState] = useState<SyncState>(DEFAULT_SYNC_STATE);
  const [localGeneration, setLocalGeneration] = useState<bigint>(0n);

  // Initialize simulation on mount
  useEffect(() => {
    const sim = new OptimisticSimulation(config);
    sim.onCellsChanged(setCells);
    sim.onSyncStateChanged(setSyncState);
    sim.onGenerationChanged(setLocalGeneration);
    simRef.current = sim;

    return () => {
      sim.destroy();
      simRef.current = null;
    };
  }, []); // Only on mount

  // Control local simulation based on isRunning/isFrozen
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;

    const hasInitialCells = cells.length > 0;

    if (isRunning && !isFrozen && hasInitialCells) {
      sim.startLocalSim();
    } else {
      sim.stopLocalSim();
    }

    return () => sim.stopLocalSim();
  }, [isRunning, isFrozen, cells.length > 0]);

  // API methods - stable references via useCallback
  const initialize = useCallback((state: GameState, bases: Map<number, BaseInfo>) => {
    simRef.current?.initialize(state, bases);
  }, []);

  const processBackendState = useCallback((state: GameState, latencyMs: number): boolean => {
    return simRef.current?.processBackendState(state, latencyMs) ?? false;
  }, []);

  const forceSync = useCallback((state: GameState) => {
    simRef.current?.forceSync(state);
  }, []);

  const applyOptimisticPlacement = useCallback(
    (placements: Array<[number, number]>, owner: number) => {
      simRef.current?.applyOptimisticPlacement(placements, owner);
    },
    []
  );

  const updateBases = useCallback((bases: Map<number, BaseInfo>) => {
    simRef.current?.updateBases(bases);
  }, []);

  const getLatencyStats = useCallback(() => {
    return (
      simRef.current?.getLatencyStats() ?? {
        samples: [],
        avgMs: 0,
        minMs: 0,
        maxMs: 0,
      }
    );
  }, []);

  const getSimulation = useCallback(() => {
    return simRef.current;
  }, []);

  return {
    cells,
    syncState,
    localGeneration,
    initialize,
    processBackendState,
    forceSync,
    applyOptimisticPlacement,
    updateBases,
    getLatencyStats,
    getSimulation,
  };
}
