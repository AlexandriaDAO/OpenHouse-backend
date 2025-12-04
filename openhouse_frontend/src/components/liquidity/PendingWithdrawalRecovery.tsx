import { useState, useEffect } from 'react';
import { GameType } from '../../types/balance';
import { PendingWithdrawal } from '../../types/liquidity';
import { useGameActor } from '../../hooks/actors/useGameActor';
import { DECIMALS_PER_CKUSDT } from '../../types/balance';

interface Props {
  gameId: GameType;
  onResolved: () => void;
}

export function PendingWithdrawalRecovery({ gameId, onResolved }: Props) {
  const { actor, isReady } = useGameActor(gameId);
  const [pending, setPending] = useState<PendingWithdrawal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const formatUSDT = (val: bigint) => (Number(val) / DECIMALS_PER_CKUSDT).toFixed(2);

  // Check for pending withdrawal on mount and poll
  useEffect(() => {
    if (!actor || !isReady) return;

    const checkPending = async () => {
      try {
        const result = await actor.get_my_withdrawal_status();
        if (result.length > 0) {
          setPending(result[0]);
        } else {
          setPending(null);
        }
      } catch (err) {
        console.error(`Error checking pending withdrawal for ${gameId}:`, err);
      } finally {
        setIsLoading(false);
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 10000);
    return () => clearInterval(interval);
  }, [actor, isReady, gameId]);

  const handleRetry = async () => {
    if (!actor || !isReady) return;
    setIsRetrying(true);
    setError(null);
    try {
      const result = await actor.retry_withdrawal();
      if ('Ok' in result) {
        setSuccess(`Withdrawal completed! Received ${formatUSDT(result.Ok)} USDT`);
        setPending(null);
        onResolved();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAbandon = async () => {
    if (!actor || !isReady) return;
    setIsAbandoning(true);
    setError(null);
    try {
      const result = await actor.abandon_withdrawal();
      if ('Ok' in result) {
        setSuccess(`Funds returned to pool. ${formatUSDT(result.Ok)} USDT restored.`);
        setPending(null);
        onResolved();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abandon failed');
    } finally {
      setIsAbandoning(false);
    }
  };

  if (isLoading || !pending) return null;

  // Render recovery UI with retry/abandon buttons
  return (
    <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
      <h4 className="text-yellow-400 font-bold mb-2">Pending Withdrawal Detected</h4>
      <p className="text-sm text-gray-400 mb-4">
        A previous withdrawal timed out. Check your wallet - if funds arrived, click "Confirm Receipt".
        If not, click "Retry Transfer".
      </p>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {success && <p className="text-green-400 text-sm mb-2">{success}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleAbandon}
          disabled={isAbandoning || isRetrying}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {isAbandoning ? 'Processing...' : 'Confirm Receipt'}
        </button>
        <button
          onClick={handleRetry}
          disabled={isRetrying || isAbandoning}
          className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {isRetrying ? 'Retrying...' : 'Retry Transfer'}
        </button>
      </div>
    </div>
  );
}
