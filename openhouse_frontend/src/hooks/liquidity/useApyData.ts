import { useState, useEffect } from 'react';
import { GameType } from '../../types/balance';
import { ApyInfo } from '../../types/liquidity';
import { useGameActor } from '../actors/useGameActor';

export function useApyData(gameId: GameType) {
  const [apy7, setApy7] = useState<ApyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { actor, isReady } = useGameActor(gameId);

  useEffect(() => {
    const fetchApy = async () => {
      if (!actor || !isReady) return;

      setIsLoading(true);
      setError(null);
      try {
        const result = await actor.get_pool_apy([7]);
        setApy7(result);
      } catch (err) {
        console.error(`APY fetch error for ${gameId}:`, err);
        setError(err instanceof Error ? err.message : 'Failed to load APY');
      } finally {
        setIsLoading(false);
      }
    };

    fetchApy();
  }, [actor, isReady, gameId]);

  return { apy7, isLoading, error };
}
