/**
 * useGameState Hook
 *
 * React hook that provides the game state machine interface.
 * Handles all state transitions and prevents invalid states.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  GamePhase,
  GameStateContext,
  WorldState,
  PlayerState,
  EliminationStats,
} from './types';
import type { RegionInfo, RiskServer } from '../../lifeConstants';
import type { BaseInfo, SlotInfo } from '../../../declarations/life1_backend/life1_backend.did';
import { REGIONS } from '../../lifeConstants';
import {
  createInitialContext,
  transitionToUnauthenticated,
  transitionToRegionSelection,
  transitionToJoiningSlot,
  transitionToPlaying,
  transitionToEliminated,
  transitionToSpectating,
  transitionToFrozen,
  transitionToError,
  checkElimination,
  initializeSession,
  updatePeakTerritory,
  computeEliminationStats,
  resetSession,
} from './GameStateManager';

export interface UseGameStateReturn {
  // Current state
  phase: GamePhase;
  world: WorldState;
  server: RiskServer | null;

  // Derived state (for convenience)
  isPlaying: boolean;
  isEliminated: boolean;
  isSpectating: boolean;
  isSelectingRegion: boolean;
  isFrozen: boolean;
  playerNum: number | null;
  hasBase: boolean;
  balance: number;

  // World state
  generation: bigint;
  bases: Map<number, BaseInfo>;

  // Transitions
  setUnauthenticated: () => void;
  setAuthenticated: (slotsInfo: SlotInfo[], userPrincipal: string | null) => void;
  selectServer: (server: RiskServer) => void;
  showRegionSelection: () => void;
  selectRegion: (region: RegionInfo) => void;
  startJoiningSlot: (region: RegionInfo, slotIndex: number) => void;
  joinComplete: (playerNum: number, balance: number, generation: bigint) => void;
  joinFailed: (error: string) => void;
  eliminate: (reason: EliminationStats['eliminationReason']) => void;
  spectate: () => void;
  rejoin: () => void;
  freeze: () => void;
  unfreeze: () => void;
  setError: (error: string, recoverable?: boolean) => void;
  clearError: () => void;
  reset: () => void;

  // World state updates
  updateWorld: (world: Partial<WorldState>) => void;
  updateBases: (bases: Map<number, BaseInfo>) => void;
  updateGeneration: (generation: bigint) => void;
  updateBalance: (balance: number) => void;
  updateTerritory: (territory: number) => void;

  // Elimination checking (called during sync)
  checkAndHandleElimination: (
    newBases: Map<number, BaseInfo>,
    currentGeneration: bigint,
    currentBalance: number
  ) => boolean;
}

export function useGameState(): UseGameStateReturn {
  const [context, setContext] = useState<GameStateContext>(createInitialContext);

  // Track whether player has had a base (for elimination detection)
  // This is a ref because we need stable access in async callbacks
  const hadBaseRef = useRef(false);

  // ============ Transitions ============

  const setUnauthenticated = useCallback(() => {
    setContext(ctx => {
      const newPhase = transitionToUnauthenticated(ctx.phase);
      if (newPhase) {
        return { ...ctx, phase: newPhase };
      }
      return { ...ctx, phase: { phase: 'unauthenticated' } };
    });
  }, []);

  const setAuthenticated = useCallback((slotsInfo: SlotInfo[], userPrincipal: string | null) => {
    setContext(ctx => {
      // Check if user is already in a slot
      for (let i = 0; i < slotsInfo.length; i++) {
        const slotOpt = slotsInfo[i];
        if (slotOpt.length > 0) {
          const slot = slotOpt[0];
          if (slot.principal.length > 0 && slot.principal[0].toText() === userPrincipal) {
            // User is already in the game
            const hasBase = slot.base.length > 0;
            hadBaseRef.current = hasBase;
            return {
              ...ctx,
              phase: {
                phase: 'playing',
                player: {
                  playerNum: i + 1,
                  hasBase,
                  balance: 0, // Will be updated by balance fetch
                },
              },
            };
          }
        }
      }

      // User not in game - show region selection
      const takenSlots = new Set<number>();
      for (let i = 0; i < slotsInfo.length; i++) {
        const slotOpt = slotsInfo[i];
        if (slotOpt.length > 0 && slotOpt[0].base.length > 0) {
          takenSlots.add(i + 1);
        }
      }

      return {
        ...ctx,
        phase: {
          phase: 'selecting-region',
          availableRegions: Object.values(REGIONS),
          takenRegions: takenSlots,
        },
      };
    });
  }, []);

  const selectServer = useCallback((server: RiskServer) => {
    setContext(ctx => ({
      ...ctx,
      server,
    }));
  }, []);

  const showRegionSelection = useCallback(() => {
    setContext(ctx => {
      // Get taken regions from current bases
      const takenRegions = new Set<number>();
      for (const [playerNum] of ctx.world.bases) {
        takenRegions.add(playerNum);
      }

      const newPhase = transitionToRegionSelection(
        ctx.phase,
        Object.values(REGIONS),
        takenRegions
      );

      if (newPhase) {
        return { ...ctx, phase: newPhase };
      }
      // Force transition even if not "valid" - user wants to join
      return {
        ...ctx,
        phase: {
          phase: 'selecting-region',
          availableRegions: Object.values(REGIONS),
          takenRegions,
        },
      };
    });
  }, []);

  const selectRegion = useCallback((region: RegionInfo) => {
    setContext(ctx => {
      const newPhase = transitionToJoiningSlot(ctx.phase, region, region.id);
      if (newPhase) {
        return { ...ctx, phase: newPhase };
      }
      return ctx;
    });
  }, []);

  const startJoiningSlot = useCallback((region: RegionInfo, slotIndex: number) => {
    setContext(ctx => ({
      ...ctx,
      phase: {
        phase: 'joining-slot',
        region,
        slotIndex,
      },
    }));
  }, []);

  const joinComplete = useCallback((playerNum: number, balance: number, generation: bigint) => {
    hadBaseRef.current = true;
    setContext(ctx => ({
      ...initializeSession(ctx, generation, balance),
      phase: {
        phase: 'playing',
        player: {
          playerNum,
          hasBase: true,
          balance,
        },
      },
    }));
  }, []);

  const joinFailed = useCallback((error: string) => {
    setContext(ctx => ({
      ...ctx,
      phase: transitionToError(ctx.phase, error, true),
    }));
  }, []);

  const eliminate = useCallback((reason: EliminationStats['eliminationReason']) => {
    setContext(ctx => {
      if (ctx.phase.phase !== 'playing' && ctx.phase.phase !== 'frozen') {
        return ctx;
      }

      const player = ctx.phase.phase === 'playing' ? ctx.phase.player : ctx.phase.player;
      const stats = computeEliminationStats(
        ctx,
        ctx.world.generation,
        player.balance,
        reason
      );

      hadBaseRef.current = false;

      return {
        ...ctx,
        phase: {
          phase: 'eliminated',
          stats,
          previousPlayer: player,
        },
      };
    });
  }, []);

  const spectate = useCallback(() => {
    setContext(ctx => {
      const newPhase = transitionToSpectating(ctx.phase);
      if (newPhase) {
        hadBaseRef.current = false;
        return { ...ctx, phase: newPhase };
      }
      return ctx;
    });
  }, []);

  const rejoin = useCallback(() => {
    setContext(ctx => {
      const takenRegions = new Set<number>();
      for (const [playerNum] of ctx.world.bases) {
        takenRegions.add(playerNum);
      }

      hadBaseRef.current = false;

      return {
        ...resetSession(ctx),
        phase: {
          phase: 'selecting-region',
          availableRegions: Object.values(REGIONS),
          takenRegions,
        },
      };
    });
  }, []);

  const freeze = useCallback(() => {
    setContext(ctx => {
      const newPhase = transitionToFrozen(ctx.phase);
      if (newPhase) {
        return { ...ctx, phase: newPhase };
      }
      return ctx;
    });
  }, []);

  const unfreeze = useCallback(() => {
    setContext(ctx => {
      const newPhase = transitionToPlaying(ctx.phase, 0, 0);
      if (newPhase) {
        return { ...ctx, phase: newPhase };
      }
      return ctx;
    });
  }, []);

  const setError = useCallback((error: string, recoverable = true) => {
    setContext(ctx => ({
      ...ctx,
      phase: transitionToError(ctx.phase, error, recoverable),
    }));
  }, []);

  const clearError = useCallback(() => {
    setContext(ctx => {
      if (ctx.phase.phase === 'error' && ctx.phase.recoverable) {
        return {
          ...ctx,
          phase: { phase: 'unauthenticated' },
        };
      }
      return ctx;
    });
  }, []);

  const reset = useCallback(() => {
    hadBaseRef.current = false;
    setContext(createInitialContext());
  }, []);

  // ============ World State Updates ============

  const updateWorld = useCallback((updates: Partial<WorldState>) => {
    setContext(ctx => ({
      ...ctx,
      world: { ...ctx.world, ...updates },
    }));
  }, []);

  const updateBases = useCallback((bases: Map<number, BaseInfo>) => {
    setContext(ctx => ({
      ...ctx,
      world: { ...ctx.world, bases },
    }));
  }, []);

  const updateGeneration = useCallback((generation: bigint) => {
    setContext(ctx => ({
      ...ctx,
      world: { ...ctx.world, generation },
    }));
  }, []);

  const updateBalance = useCallback((balance: number) => {
    setContext(ctx => {
      if (ctx.phase.phase === 'playing') {
        return {
          ...ctx,
          phase: {
            ...ctx.phase,
            player: { ...ctx.phase.player, balance },
          },
        };
      }
      if (ctx.phase.phase === 'frozen') {
        return {
          ...ctx,
          phase: {
            ...ctx.phase,
            player: { ...ctx.phase.player, balance },
          },
        };
      }
      return ctx;
    });
  }, []);

  const updateTerritory = useCallback((territory: number) => {
    setContext(ctx => updatePeakTerritory(ctx, territory));
  }, []);

  // ============ Elimination Checking ============

  const checkAndHandleElimination = useCallback((
    newBases: Map<number, BaseInfo>,
    currentGeneration: bigint,
    currentBalance: number
  ): boolean => {
    let eliminated = false;

    setContext(ctx => {
      const result = checkElimination(ctx.phase, hadBaseRef.current, newBases);

      if (result.eliminated && result.playerNum !== null) {
        eliminated = true;
        hadBaseRef.current = false;

        const player = ctx.phase.phase === 'playing'
          ? ctx.phase.player
          : ctx.phase.phase === 'frozen'
            ? ctx.phase.player
            : null;

        if (player) {
          const stats = computeEliminationStats(
            ctx,
            currentGeneration,
            currentBalance,
            'defeated'
          );

          return {
            ...ctx,
            phase: {
              phase: 'eliminated',
              stats,
              previousPlayer: player,
            },
          };
        }
      }

      // Update hadBaseRef if player has a base
      if (ctx.phase.phase === 'playing' && ctx.phase.player.hasBase) {
        hadBaseRef.current = true;
      }

      return ctx;
    });

    return eliminated;
  }, []);

  // ============ Derived State ============

  const derived = useMemo(() => {
    const { phase } = context;

    let playerNum: number | null = null;
    let hasBase = false;
    let balance = 0;

    if (phase.phase === 'playing') {
      playerNum = phase.player.playerNum;
      hasBase = phase.player.hasBase;
      balance = phase.player.balance;
    } else if (phase.phase === 'frozen') {
      playerNum = phase.player.playerNum;
      hasBase = phase.player.hasBase;
      balance = phase.player.balance;
    } else if (phase.phase === 'eliminated') {
      playerNum = phase.previousPlayer.playerNum;
      balance = phase.previousPlayer.balance;
    }

    return {
      isPlaying: phase.phase === 'playing',
      isEliminated: phase.phase === 'eliminated',
      isSpectating: phase.phase === 'spectating',
      isSelectingRegion: phase.phase === 'selecting-region',
      isFrozen: phase.phase === 'frozen',
      playerNum,
      hasBase,
      balance,
    };
  }, [context.phase]);

  return {
    // Current state
    phase: context.phase,
    world: context.world,
    server: context.server,

    // Derived state
    ...derived,

    // World state shortcuts
    generation: context.world.generation,
    bases: context.world.bases,

    // Transitions
    setUnauthenticated,
    setAuthenticated,
    selectServer,
    showRegionSelection,
    selectRegion,
    startJoiningSlot,
    joinComplete,
    joinFailed,
    eliminate,
    spectate,
    rejoin,
    freeze,
    unfreeze,
    setError,
    clearError,
    reset,

    // World state updates
    updateWorld,
    updateBases,
    updateGeneration,
    updateBalance,
    updateTerritory,

    // Elimination checking
    checkAndHandleElimination,
  };
}
