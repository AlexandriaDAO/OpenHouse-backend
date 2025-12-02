import { useState, useEffect } from 'react';
import useDiceActor from '../../../../hooks/actors/useDiceActor';
import type { ApyInfo } from '../../../../declarations/dice_backend/dice_backend.did';

export const useApyData = () => {
  const [apy7, setApy7] = useState<ApyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { actor } = useDiceActor();

  useEffect(() => {
    const fetchApy = async () => {
      if (!actor) return;
      
      setIsLoading(true);
      setError(null);
      try {
        const result = await actor.get_pool_apy([7]);
        setApy7(result);
      } catch (err) {
        console.error('APY fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load APY');
      } finally {
        setIsLoading(false);
      }
    };

    fetchApy();
  }, [actor]);

  return { apy7, isLoading, error };
};
