import { useState, useEffect, useCallback } from 'react';
import { GameType } from '../../types/balance';
import { PoolStats, LPPosition } from '../../types/liquidity';
import { useGameActor } from '../actors/useGameActor';
import { useAuth } from '../../providers/AuthProvider';

interface UsePoolStatsResult {
  poolStats: PoolStats | null;
  myPosition: LPPosition | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePoolStats(gameId: GameType, refreshInterval = 30000): UsePoolStatsResult {
  const { actor, isReady } = useGameActor(gameId);
  const { isAuthenticated } = useAuth();

  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [myPosition, setMyPosition] = useState<LPPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!actor || !isReady) return;

    try {
      const stats = await actor.get_pool_stats();
      setPoolStats(stats);

      if (isAuthenticated) {
        const position = await actor.get_my_lp_position();
        setMyPosition(position);
      }
      setError(null);
    } catch (err) {
      console.error(`Failed to load pool stats for ${gameId}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to load pool stats');
    } finally {
      setIsLoading(false);
    }
  }, [actor, isReady, gameId, isAuthenticated]);

  // Initial load and interval
  useEffect(() => {
    refresh(); // Initial load
    
    // Set up interval
    const interval = setInterval(() => {
      refresh();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { poolStats, myPosition, isLoading, error, refresh };
}
