import { useActor } from 'ic-use-actor';
import { GameType } from '../../types/balance';
import { LiquidityActorInterface, isLiquidityActor } from '../../types/liquidity';
import { getGameConfig } from '../../config/gameRegistry';

interface UseGameActorResult {
  actor: LiquidityActorInterface | null;
  isReady: boolean;
}

/**
 * Returns the appropriate actor for a given game type, cast to the common LiquidityActorInterface.
 * This allows shared components to be type-safe without using `any`.
 * 
 * PERFORMANCE: Uses the generic useActor hook with a dynamic canister ID to avoid 
 * instantiating all 3 game hooks (useDiceActor, usePlinkoActor, useBlackjackActor) simultaneously.
 */
export function useGameActor(gameId: GameType): UseGameActorResult {
  const config = getGameConfig(gameId);
  
  // Dynamically fetch the actor by canister ID (or name if registered as such)
  // ic-use-actor registers actors by the canisterId passed to createActorHook
  const { actor: rawActor } = useActor(config?.canisterId || '');

  // Validate and cast to common interface
  if (rawActor && isLiquidityActor(rawActor)) {
    return { actor: rawActor, isReady: true };
  }

  return { actor: null, isReady: false };
}