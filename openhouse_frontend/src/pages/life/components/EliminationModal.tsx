/**
 * Elimination Modal Component
 *
 * Displayed when a player's base is destroyed.
 * Provides options to spectate or rejoin the game.
 *
 * CRITICAL FIX: This component receives handlers as props,
 * preventing the stale closure issues that caused
 * unresponsive buttons in the original implementation.
 */

import React from 'react';
import type { EliminationStats } from '../state/types';

interface EliminationModalProps {
  isOpen: boolean;
  stats: EliminationStats | null;
  currentBalance: number;
  onSpectate: () => void;
  onRejoin: () => void;
}

export const EliminationModal: React.FC<EliminationModalProps> = ({
  isOpen,
  stats,
  currentBalance,
  onSpectate,
  onRejoin,
}) => {
  if (!isOpen) return null;

  // Get elimination reason message
  const getReasonMessage = () => {
    if (!stats) return 'Your base was destroyed!';

    switch (stats.eliminationReason) {
      case 'inactivity':
        return 'You were eliminated due to inactivity.';
      case 'defeated':
        return 'Your base was destroyed!';
      default:
        return 'You have been eliminated.';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="elimination-title"
    >
      <div className="bg-gray-900 border border-red-500/50 rounded-lg p-6 max-w-sm mx-4 text-center">
        <div className="text-4xl mb-2" aria-hidden="true">💀</div>
        <h2
          id="elimination-title"
          className="text-2xl font-bold text-red-400 mb-2"
        >
          ELIMINATED
        </h2>
        <p className="text-gray-400 mb-4">{getReasonMessage()}</p>

        {stats && (
          <div className="bg-black/50 rounded p-3 mb-4 text-sm text-left">
            <div className="flex justify-between text-gray-500">
              <span>Survived:</span>
              <span className="text-white">
                {stats.generationsSurvived.toLocaleString()} gen
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Peak territory:</span>
              <span className="text-white">
                {stats.peakTerritory.toLocaleString()} cells
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Coins earned:</span>
              <span className={stats.coinsEarned >= 0 ? 'text-green-400' : 'text-red-400'}>
                {stats.coinsEarned >= 0 ? '+' : ''}{stats.coinsEarned}
              </span>
            </div>
          </div>
        )}

        <div className="text-gray-500 text-sm mb-4">
          Wallet: <span className="text-green-400">🪙 {currentBalance}</span>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={onSpectate}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Spectate
          </button>
          <button
            type="button"
            onClick={onRejoin}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Rejoin
          </button>
        </div>
      </div>
    </div>
  );
};

export default EliminationModal;
