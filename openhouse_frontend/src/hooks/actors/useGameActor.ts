import { GameType } from '../../types/balance';
import { LiquidityActorInterface } from '../../types/liquidity';
import useDice from './useDiceActor';
import usePlinko from './usePlinkoActor';
import useRoulette from './useRouletteActor';

interface UseGameActorResult {
  actor: LiquidityActorInterface | null;
  isReady: boolean;
}

/**
 * Returns the appropriate actor for a given game type.
 *
 * ARCHITECTURE: This follows the Alexandria pattern where all actor hooks are called
 * at once. ic-use-actor actors share global state, so there's no performance penalty
 * for initializing all hooks - they're singletons managed by the library.
 *
 * This pattern matches how ActorProvider works in both OpenHouse and Alexandria.
 */
export function useGameActor(gameId: GameType): UseGameActorResult {
  // Call all game actor hooks (they're singletons, so this is efficient)
  const dice = useDice();
  const plinko = usePlinko();
  const roulette = useRoulette();

  // Map game ID to corresponding actor result
  // ic-use-actor returns { actor, isSuccess, ... } but we normalize to { actor, isReady }
  const actorMap: Record<GameType, UseGameActorResult> = {
    dice: { actor: dice.actor as LiquidityActorInterface | null, isReady: dice.isSuccess },
    plinko: { actor: plinko.actor as LiquidityActorInterface | null, isReady: plinko.isSuccess },
    roulette: { actor: roulette.actor as LiquidityActorInterface | null, isReady: roulette.isSuccess },
  };

  return actorMap[gameId];
}
