/**
 * Game State Machine Types
 *
 * These types enforce valid game states through discriminated unions,
 * making invalid states impossible to represent (e.g., you cannot be
 * both "eliminated" and "joining" simultaneously).
 */

import type { BaseInfo } from '../../../declarations/life1_backend/life1_backend.did';
import type { RegionInfo, RiskServer } from '../../lifeConstants';

// ============ Player State ============

export interface PlayerState {
  playerNum: number;
  hasBase: boolean;
  balance: number;
}

// ============ Elimination Stats ============

export interface EliminationStats {
  generationsSurvived: bigint;
  peakTerritory: number;
  coinsEarned: number;
  eliminationReason: 'defeated' | 'inactivity' | 'unknown';
}

// ============ Game Phase Discriminated Union ============

/**
 * All possible game phases as a discriminated union.
 * This makes it impossible to be in an invalid combination of states.
 */
export type GamePhase =
  | { phase: 'initializing' }
  | { phase: 'unauthenticated' }
  | { phase: 'selecting-server'; servers: RiskServer[] }
  | { phase: 'selecting-region'; availableRegions: RegionInfo[]; takenRegions: Set<number> }
  | { phase: 'joining-slot'; region: RegionInfo; slotIndex: number }
  | { phase: 'playing'; player: PlayerState }
  | { phase: 'spectating' }
  | { phase: 'eliminated'; stats: EliminationStats; previousPlayer: PlayerState }
  | { phase: 'frozen'; player: PlayerState }
  | { phase: 'error'; error: string; recoverable: boolean };

// ============ World State (Shared Across Phases) ============

export interface WorldState {
  generation: bigint;
  bases: Map<number, BaseInfo>;
  wipeInfo: { quadrant: number; secondsUntil: number } | null;
  frozen: boolean;
}

// ============ Game State Machine Context ============

export interface GameStateContext {
  phase: GamePhase;
  world: WorldState;
  server: RiskServer | null;

  // Session tracking (persists across phase transitions)
  joinedAtGeneration: bigint | null;
  peakTerritory: number;
  initialBalance: number;
}

// ============ State Transitions ============

/**
 * Valid state transitions. Each function returns a new GamePhase
 * or null if the transition is invalid from the current state.
 */
export interface GameStateTransitions {
  // Auth transitions
  authenticate: () => GamePhase | null;
  logout: () => GamePhase | null;

  // Server selection
  selectServer: (server: RiskServer) => GamePhase | null;

  // Region/slot selection
  selectRegion: (region: RegionInfo) => GamePhase | null;
  cancelRegionSelection: () => GamePhase | null;
  joinSlot: (slotIndex: number, region: RegionInfo) => GamePhase | null;
  joinComplete: (playerNum: number, balance: number) => GamePhase | null;
  joinFailed: (error: string) => GamePhase | null;

  // In-game transitions
  eliminate: (stats: Omit<EliminationStats, 'eliminationReason'>, reason: EliminationStats['eliminationReason']) => GamePhase | null;
  freeze: () => GamePhase | null;
  unfreeze: () => GamePhase | null;

  // Post-elimination
  spectate: () => GamePhase | null;
  rejoin: () => GamePhase | null;

  // Error handling
  setError: (error: string, recoverable?: boolean) => GamePhase | null;
  clearError: () => GamePhase | null;
  reset: () => GamePhase;
}

// ============ Type Guards ============

export function isPlaying(phase: GamePhase): phase is { phase: 'playing'; player: PlayerState } {
  return phase.phase === 'playing';
}

export function isEliminated(phase: GamePhase): phase is { phase: 'eliminated'; stats: EliminationStats; previousPlayer: PlayerState } {
  return phase.phase === 'eliminated';
}

export function isSpectating(phase: GamePhase): phase is { phase: 'spectating' } {
  return phase.phase === 'spectating';
}

export function isSelectingRegion(phase: GamePhase): phase is { phase: 'selecting-region'; availableRegions: RegionInfo[]; takenRegions: Set<number> } {
  return phase.phase === 'selecting-region';
}

export function isJoiningSlot(phase: GamePhase): phase is { phase: 'joining-slot'; region: RegionInfo; slotIndex: number } {
  return phase.phase === 'joining-slot';
}

export function isError(phase: GamePhase): phase is { phase: 'error'; error: string; recoverable: boolean } {
  return phase.phase === 'error';
}

export function isFrozen(phase: GamePhase): phase is { phase: 'frozen'; player: PlayerState } {
  return phase.phase === 'frozen';
}

export function canPlaceCells(phase: GamePhase): boolean {
  return phase.phase === 'playing' && phase.player.hasBase;
}

export function getPlayer(phase: GamePhase): PlayerState | null {
  if (phase.phase === 'playing') return phase.player;
  if (phase.phase === 'frozen') return phase.player;
  if (phase.phase === 'eliminated') return phase.previousPlayer;
  return null;
}
