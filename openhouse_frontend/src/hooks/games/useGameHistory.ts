import { useEffect, useState } from 'react';

export function useGameHistory<T extends { clientId?: string }>(
  actor: any,
  fetchMethod: string = 'get_recent_games',
  limit: number = 10
) {
  const [history, setHistory] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadHistory = async () => {
      if (!actor || !actor[fetchMethod]) return;

      setIsLoading(true);
      setError('');

      try {
        const games = await actor[fetchMethod](limit);
        const gamesWithIds = games.map((game: T) => ({
          ...game,
          clientId: game.clientId || crypto.randomUUID(),
        }));
        setHistory(gamesWithIds);
      } catch (err) {
        console.error('Failed to load game history:', err);
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [actor, fetchMethod, limit]);

  return {
    history,
    isLoading,
    error,
    refresh: () => {
      // Trigger reload by changing a dependency
      setHistory([]);
      setIsLoading(true);
    },
  };
}