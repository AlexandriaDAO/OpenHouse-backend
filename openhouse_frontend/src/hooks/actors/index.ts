/**
 * Actor Hooks - Barrel Export
 *
 * Centralized exports for all IC canister actor hooks.
 * Follows Alexandria frontend pattern for clean imports.
 *
 * Usage:
 *   import { useDice, usePlinko, useGameActor } from '@/hooks/actors';
 */

// Game backend actors
export { default as useDice } from './useDiceActor';
export { default as usePlinko } from './usePlinkoActor';
export { default as useRoulette } from './useRouletteActor';
export { default as useCrash } from './useCrashActor';

// Ledger actor
export { default as useLedger } from './useLedgerActor';

// Utility hooks
export { useGameActor } from './useGameActor';
