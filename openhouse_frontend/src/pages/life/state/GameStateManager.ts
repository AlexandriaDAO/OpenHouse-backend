/**
 * Game State Manager
 *
 * Implements the state machine for the Life/Risk game.
 * All state transitions are explicit and validated,
 * preventing invalid state combinations.
 */

import type {
  GamePhase,
  GameStateContext,
  WorldState,
  PlayerState,
  EliminationStats,
} from './types';
import type { RegionInfo, RiskServer } from '../../lifeConstants';
import type { BaseInfo } from '../../../declarations/life1_backend/life1_backend.did';
import { REGIONS } from '../../lifeConstants';

// ============ Initial State Factory ============

export function createInitialContext(): GameStateContext {
  return {
    phase: { phase: 'initializing' },
    world: {
      generation: 0n,
      bases: new Map(),
      wipeInfo: null,
      frozen: false,
    },
    server: null,
    joinedAtGeneration: null,
    peakTerritory: 0,
    initialBalance: 0,
  };
}

export function createInitialWorldState(): WorldState {
  return {
    generation: 0n,
    bases: new Map(),
    wipeInfo: null,
    frozen: false,
  };
}

// ============ State Transition Functions ============

/**
 * Transition to unauthenticated state.
 * Valid from: initializing
 */
export function transitionToUnauthenticated(current: GamePhase): GamePhase | null {
  if (current.phase === 'initializing') {
    return { phase: 'unauthenticated' };
  }
  return null;
}

/**
 * Transition to region selection after authentication.
 * Valid from: unauthenticated, spectating, eliminated
 */
export function transitionToRegionSelection(
  current: GamePhase,
  availableRegions: RegionInfo[],
  takenRegions: Set<number>
): GamePhase | null {
  const validFromPhases = ['unauthenticated', 'spectating', 'eliminated', 'selecting-server'];
  if (validFromPhases.includes(current.phase)) {
    return {
      phase: 'selecting-region',
      availableRegions,
      takenRegions,
    };
  }
  return null;
}

/**
 * Transition to joining a slot after selecting a region.
 * Valid from: selecting-region
 */
export function transitionToJoiningSlot(
  current: GamePhase,
  region: RegionInfo,
  slotIndex: number
): GamePhase | null {
  if (current.phase === 'selecting-region') {
    return {
      phase: 'joining-slot',
      region,
      slotIndex,
    };
  }
  return null;
}

/**
 * Transition to playing state after successfully joining.
 * Valid from: joining-slot
 */
export function transitionToPlaying(
  current: GamePhase,
  playerNum: number,
  balance: number
): GamePhase | null {
  if (current.phase === 'joining-slot') {
    return {
      phase: 'playing',
      player: {
        playerNum,
        hasBase: true,
        balance,
      },
    };
  }
  // Also valid from frozen (unfreezing)
  if (current.phase === 'frozen') {
    return {
      phase: 'playing',
      player: current.player,
    };
  }
  return null;
}

/**
 * Update player state while playing.
 * Valid from: playing
 */
export function updatePlayerState(
  current: GamePhase,
  updates: Partial<PlayerState>
): GamePhase | null {
  if (current.phase === 'playing') {
    return {
      phase: 'playing',
      player: { ...current.player, ...updates },
    };
  }
  return null;
}

/**
 * Transition to eliminated state.
 * Valid from: playing, frozen
 */
export function transitionToEliminated(
  current: GamePhase,
  stats: EliminationStats
): GamePhase | null {
  if (current.phase === 'playing') {
    return {
      phase: 'eliminated',
      stats,
      previousPlayer: current.player,
    };
  }
  if (current.phase === 'frozen') {
    return {
      phase: 'eliminated',
      stats,
      previousPlayer: current.player,
    };
  }
  return null;
}

/**
 * Transition to spectating state.
 * Valid from: eliminated, joining-slot (if join fails)
 */
export function transitionToSpectating(current: GamePhase): GamePhase | null {
  if (current.phase === 'eliminated' || current.phase === 'joining-slot') {
    return { phase: 'spectating' };
  }
  // Also allow from unauthenticated (viewing without account)
  if (current.phase === 'unauthenticated') {
    return { phase: 'spectating' };
  }
  return null;
}

/**
 * Transition to frozen state.
 * Valid from: playing
 */
export function transitionToFrozen(current: GamePhase): GamePhase | null {
  if (current.phase === 'playing') {
    return {
      phase: 'frozen',
      player: current.player,
    };
  }
  return null;
}

/**
 * Transition to error state.
 * Valid from: any state
 */
export function transitionToError(
  _current: GamePhase,
  error: string,
  recoverable: boolean = true
): GamePhase {
  return {
    phase: 'error',
    error,
    recoverable,
  };
}

// ============ Elimination Detection ============

/**
 * Check if elimination occurred based on world state change.
 *
 * CRITICAL FIX: This function properly handles the edge cases that
 * caused phantom elimination:
 *
 * 1. Only checks elimination if player was PREVIOUSLY playing with a base
 * 2. Uses explicit previous state (not refs that can be stale)
 * 3. Never triggers elimination during join flow
 */
export function checkElimination(
  currentPhase: GamePhase,
  previousHadBase: boolean,
  newBases: Map<number, BaseInfo>
): { eliminated: boolean; playerNum: number | null } {
  // Can only be eliminated if currently playing
  if (currentPhase.phase !== 'playing') {
    return { eliminated: false, playerNum: null };
  }

  const playerNum = currentPhase.player.playerNum;

  // CRITICAL: Only check elimination if player PREVIOUSLY had a base
  // This prevents false positives when joining a new game
  if (!previousHadBase) {
    return { eliminated: false, playerNum };
  }

  // Check if base still exists
  const myBase = newBases.get(playerNum);
  if (!myBase) {
    return { eliminated: true, playerNum };
  }

  return { eliminated: false, playerNum };
}

// ============ Region Availability ============

/**
 * Compute available regions based on current game state.
 */
export function computeAvailableRegions(
  bases: Map<number, BaseInfo>,
  slotsInfo: Array<{ principal: string | null; hasBase: boolean }>
): { available: RegionInfo[]; taken: Set<number> } {
  const takenSlots = new Set<number>();

  // Check which slots are taken
  for (let i = 0; i < slotsInfo.length; i++) {
    if (slotsInfo[i].hasBase) {
      takenSlots.add(i + 1); // Slots are 1-indexed
    }
  }

  const available = Object.values(REGIONS).filter(region => !takenSlots.has(region.id));
  return { available, taken: takenSlots };
}

// ============ Session Tracking ============

/**
 * Initialize session tracking when player joins.
 */
export function initializeSession(
  context: GameStateContext,
  currentGeneration: bigint,
  balance: number
): GameStateContext {
  return {
    ...context,
    joinedAtGeneration: currentGeneration,
    peakTerritory: 0,
    initialBalance: balance,
  };
}

/**
 * Update peak territory tracking.
 */
export function updatePeakTerritory(
  context: GameStateContext,
  currentTerritory: number
): GameStateContext {
  if (currentTerritory > context.peakTerritory) {
    return { ...context, peakTerritory: currentTerritory };
  }
  return context;
}

/**
 * Compute elimination stats from session tracking.
 */
export function computeEliminationStats(
  context: GameStateContext,
  currentGeneration: bigint,
  currentBalance: number,
  reason: EliminationStats['eliminationReason']
): EliminationStats {
  const generationsSurvived = context.joinedAtGeneration !== null
    ? currentGeneration - context.joinedAtGeneration
    : 0n;

  return {
    generationsSurvived,
    peakTerritory: context.peakTerritory,
    coinsEarned: currentBalance - context.initialBalance,
    eliminationReason: reason,
  };
}

/**
 * Reset session tracking for rejoin.
 */
export function resetSession(context: GameStateContext): GameStateContext {
  return {
    ...context,
    joinedAtGeneration: null,
    peakTerritory: 0,
    // Keep initialBalance for cumulative tracking
  };
}
