import React, { useState, useEffect } from 'react';
import useDiceActor from '../../../hooks/actors/useDiceActor';
import { formatUSDT } from '../../../types/balance';
import { PendingWithdrawal } from '../../../declarations/dice_backend/dice_backend.did';

interface Props {
  onResolved: () => void;  // Callback when pending state is cleared
}

export const PendingWithdrawalRecovery: React.FC<Props> = ({ onResolved }) => {
  const { actor } = useDiceActor();
  const [pending, setPending] = useState<PendingWithdrawal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check for pending withdrawal on mount and poll
  useEffect(() => {
    if (!actor) return;

    let isMounted = true;
    const checkPending = async () => {
      if (!pending) setIsLoading(true); // Only show loading on first check
      setCheckError(null);
      try {
        const result = await actor.get_my_withdrawal_status();
        if (isMounted) {
          const newPending = result.length > 0 ? result[0] : null;
          setPending(newPending);
          
          // If resolved externally (e.g. other tab), notify parent
          if (!newPending && pending) {
             onResolved();
          }
        }
      } catch (err) {
        console.error('Failed to check pending status:', err);
        if (isMounted && !pending) { // Only show error if we don't have data yet
          setCheckError(err instanceof Error ? err.message : 'Failed to check status');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkPending();
    
    // Poll every 10s if pending exists
    const interval = setInterval(() => {
        if (pending) checkPending();
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [actor, pending, onResolved]);

  // Handle retry
  const handleRetry = async () => {
    if (!actor) return;
    setIsRetrying(true);
    setError(null);
    try {
      const result = await actor.retry_withdrawal();
      if ('Ok' in result) {
        setSuccess('Transfer successful! Funds sent to your wallet.');
        // Delay unmounting so user sees success message
        setTimeout(() => {
            setPending(null);
            onResolved();
        }, 2000);
      } else {
        setError(result.Err);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Retry failed: ${errorMsg}. Please check your cycles balance or try again later.`);
    } finally {
      setIsRetrying(false);
    }
  };

  // Handle abandon
  const handleAbandon = async () => {
    if (!actor) return;
    setIsAbandoning(true);
    setError(null);
    try {
      const result = await actor.abandon_withdrawal();
      if ('Ok' in result) {
        setSuccess('Withdrawal confirmed as received. State cleared.');
        // Delay unmounting so user sees success message
        setTimeout(() => {
            setPending(null);
            onResolved();
        }, 2000);
      } else {
        setError(result.Err);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Abandon failed: ${errorMsg}.`);
    } finally {
      setIsAbandoning(false);
      setShowAbandonConfirm(false);
    }
  };

  if (checkError) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-4">
        <p className="text-red-400 text-sm">⚠️ Failed to check withdrawal status: {checkError}</p>
      </div>
    );
  }

  // Don't render if loading or no pending withdrawal
  if (isLoading || !pending) return null;

  // Extract amount from withdrawal type
  const amount = 'User' in pending.withdrawal_type
    ? pending.withdrawal_type.User.amount
    : pending.withdrawal_type.LP.amount;

  const isLP = 'LP' in pending.withdrawal_type;

  return (
    <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1">
          <h3 className="font-bold text-yellow-400 mb-1">
            Pending {isLP ? 'Liquidity' : ''} Withdrawal
          </h3>
          <p className="text-sm text-gray-300 mb-1">
            You have a pending withdrawal of <strong>{formatUSDT(amount)}</strong> that
            may have timed out. Please check your wallet balance on-chain.
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Pending since: {new Date(Number(pending.created_at) / 1_000_000).toLocaleString()}
          </p>

          {isLP && 'LP' in pending.withdrawal_type && (
            <p className="text-xs text-gray-400 mt-1 mb-3 italic">
                Note: This was a liquidity withdrawal. The protocol fee will be processed on successful retry.
            </p>
          )}

          <div className="bg-black/30 rounded p-3 mb-3 text-xs text-gray-400">
            <p className="mb-2"><strong>Check your ckUSDT balance:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>If funds arrived in your wallet → Click "Confirm Receipt"</li>
              <li>If funds did NOT arrive → Click "Retry Transfer"</li>
            </ul>
          </div>

          {showAbandonConfirm ? (
              <div className="p-3 bg-red-900/20 rounded border border-red-500/30 mb-3 animate-in fade-in slide-in-from-top-1">
                <p className="text-xs text-white font-bold mb-2">⚠️ Are you SURE you received the funds? This cannot be undone.</p>
                <div className="flex gap-2">
                    <button 
                        onClick={handleAbandon}
                        disabled={isAbandoning}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold"
                    >
                        Yes, I received funds
                    </button>
                    <button 
                        onClick={() => setShowAbandonConfirm(false)}
                        disabled={isAbandoning}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                    >
                        Cancel
                    </button>
                </div>
              </div>
          ) : (
            <div className="flex gap-2">
                <button
                onClick={handleRetry}
                disabled={isRetrying || isAbandoning || !!success}
                aria-label="Retry pending withdrawal transfer"
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
                >
                {isRetrying ? 'Retrying...' : '🔄 Retry Transfer'}
                </button>
                <button
                onClick={() => setShowAbandonConfirm(true)}
                disabled={isRetrying || isAbandoning || !!success}
                aria-label="Confirm receipt of funds"
                className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50"
                >
                {isAbandoning ? 'Confirming...' : '✓ Confirm Receipt'}
                </button>
            </div>
          )}

          {error && (
            <div className="mt-2 text-red-400 text-xs">{error}</div>
          )}
          {success && (
            <div className="mt-2 text-green-400 text-xs">{success}</div>
          )}
        </div>
      </div>
    </div>
  );
};
