import React, { useState } from 'react';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { GameType } from '../../types/balance';

interface ConnectionStatusProps {
  game: GameType;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ game }) => {
  const balance = useGameBalance(game);
  const { status, isLoading, hasError, isSyncing, retry, clearError } = balance;
  const [showDetails, setShowDetails] = useState(false);

  // Determine the status indicator
  const getStatusIndicator = () => {
    if (isLoading) {
      return {
        icon: '⏳',
        text: 'Loading...',
        className: 'text-yellow-400',
        pulse: true,
      };
    }

    if (isSyncing) {
      return {
        icon: '🔄',
        text: 'Syncing...',
        className: 'text-blue-400',
        pulse: true,
      };
    }

    if (hasError) {
      return {
        icon: '⚠️',
        text: 'Error',
        className: 'text-red-400',
        pulse: false,
      };
    }

    return {
      icon: '✓',
      text: 'Connected',
      className: 'text-green-400',
      pulse: false,
    };
  };

  const statusInfo = getStatusIndicator();

  return (
    <>
      {/* Status Indicator */}
      <div className="fixed top-20 right-4 z-50">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-all ${
            statusInfo.pulse ? 'animate-pulse' : ''
          }`}
          title={`Connection status: ${statusInfo.text}`}
        >
          <span className={`text-lg ${statusInfo.className}`}>{statusInfo.icon}</span>
          <span className="text-xs text-gray-300">{statusInfo.text}</span>
        </button>

        {/* Dropdown Details */}
        {showDetails && (
          <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white mb-3">
                Connection Status
              </h3>

              {/* Status Details */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Game:</span>
                  <span className="text-white capitalize">{game}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Status:</span>
                  <span className={statusInfo.className}>{statusInfo.text}</span>
                </div>

                {status.error && (
                  <div className="mt-3 p-2 bg-red-900/20 border border-red-800 rounded">
                    <p className="text-red-400 text-xs">{status.error}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              {hasError && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={async () => {
                      await retry();
                      setShowDetails(false);
                    }}
                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                  >
                    🔄 Retry
                  </button>
                  <button
                    onClick={() => {
                      clearError();
                      setShowDetails(false);
                    }}
                    className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {!hasError && !isLoading && !isSyncing && (
                <div className="mt-4">
                  <button
                    onClick={async () => {
                      await retry();
                      setShowDetails(false);
                    }}
                    className="w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                  >
                    🔄 Refresh Balances
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sync Warning Toast */}
      {status.error && status.error.includes('sync required') && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className="flex items-center gap-3 px-4 py-3 bg-yellow-900/90 border border-yellow-700 rounded-lg shadow-xl">
            <span className="text-yellow-400">⚠️</span>
            <div className="flex-1">
              <p className="text-sm text-yellow-300 font-medium">Balance Out of Sync</p>
              <p className="text-xs text-yellow-400 mt-1">
                Your balance has been updated to match the blockchain.
              </p>
            </div>
            <button
              onClick={clearError}
              className="text-yellow-400 hover:text-yellow-300 text-xl"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

// Mini version for inline use
export const ConnectionStatusMini: React.FC<ConnectionStatusProps> = ({ game }) => {
  const { isLoading, hasError, isSyncing } = useGameBalance(game);

  if (isLoading) {
    return <span className="text-yellow-400 text-xs animate-pulse">⏳</span>;
  }

  if (isSyncing) {
    return <span className="text-blue-400 text-xs animate-pulse">🔄</span>;
  }

  if (hasError) {
    return <span className="text-red-400 text-xs">⚠️</span>;
  }

  return <span className="text-green-400 text-xs">✓</span>;
};