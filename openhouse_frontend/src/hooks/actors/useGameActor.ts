import { GameType } from '../../types/balance';
import { LiquidityActorInterface, isLiquidityActor } from '../../types/liquidity';
import useDiceActor from './useDiceActor';
import usePlinkoActor from './usePlinkoActor';
import useBlackjackActor from './useBlackjackActor';

interface UseGameActorResult {
  actor: LiquidityActorInterface | null;
  isReady: boolean;
}

/**
 * Returns the appropriate actor for a given game type, cast to the common LiquidityActorInterface.
 * This allows shared components to be type-safe without using `any`.
 */
export function useGameActor(gameId: GameType): UseGameActorResult {
  const diceResult = useDiceActor();
  const plinkoResult = usePlinkoActor();
  const blackjackResult = useBlackjackActor();

  // Select the appropriate actor based on gameId
  let rawActor: unknown = null;
  switch (gameId) {
    case 'dice':
      rawActor = diceResult.actor;
      break;
    case 'plinko':
      rawActor = plinkoResult.actor;
      break;
    case 'blackjack':
      rawActor = blackjackResult.actor;
      break;
    default:
      console.warn(`No liquidity actor available for game: ${gameId}`);
      return { actor: null, isReady: false };
  }

  // Validate and cast to common interface
  if (rawActor && isLiquidityActor(rawActor)) {
    return { actor: rawActor, isReady: true };
  }

  return { actor: null, isReady: false };
}
