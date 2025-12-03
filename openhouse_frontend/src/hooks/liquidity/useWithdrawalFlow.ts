import { useState, useCallback } from 'react';
import { GameType, DECIMALS_PER_CKUSDT } from '../../types/balance';
import { useGameActor } from '../actors/useGameActor';

export function useWithdrawalFlow(gameId: GameType, onSuccess?: () => void) {
  const { actor, isReady } = useGameActor(gameId);

  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const handleWithdrawAll = useCallback(async () => {
    if (!actor || !isReady) return;

    setIsWithdrawing(true);
    clearMessages();

    try {
      const result = await actor.withdraw_all_liquidity();

      if ('Ok' in result) {
        const amount = result.Ok;
        const amountUSDT = Number(amount) / DECIMALS_PER_CKUSDT;
        setSuccess(`Withdrew ${amountUSDT.toFixed(2)} USDT!`);
        onSuccess?.();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  }, [actor, isReady, clearMessages, onSuccess]);

  return {
    isWithdrawing,
    error,
    success,
    handleWithdrawAll,
    clearMessages,
  };
}
