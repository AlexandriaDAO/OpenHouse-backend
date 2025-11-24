import React, { useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useBalance } from '../providers/BalanceProvider';
import { formatUSDT } from '../types/ledger';

export const AuthButton: React.FC = () => {
  const { isAuthenticated, principal, login, logout, isInitializing } = useAuth();
  const { balance, isLoading: balanceLoading, refreshBalance } = useBalance();
  const [copied, setCopied] = useState(false);

  const handleCopyPrincipal = async () => {
    if (!principal) return;

    try {
      await navigator.clipboard.writeText(principal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy principal:', error);
    }
  };

  const handleRefreshBalance = async () => {
    await refreshBalance();
  };

  if (isInitializing) {
    return (
      <div className="flex items-center gap-2">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
        <span className="text-sm">Initializing...</span>
      </div>
    );
  }

  if (isAuthenticated && principal) {
    return (
      <div className="flex items-center gap-4">
        {/* Balance Display */}
        <div className="flex items-center gap-2 bg-casino-accent px-4 py-2 rounded-lg">
          <div className="text-sm">
            <div className="text-gray-400 text-xs">USDT Balance</div>
            <div className="font-bold text-lg">
              {balanceLoading ? (
                <span className="animate-pulse">Loading...</span>
              ) : balance !== null ? (
                <span>{formatUSDT(balance)}</span>
              ) : (
                <span className="text-gray-500">--</span>
              )}
            </div>
          </div>
          <button
            onClick={handleRefreshBalance}
            disabled={balanceLoading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <svg
              className={`w-4 h-4 ${balanceLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Principal Display with Copy */}
        <div className="flex items-center gap-2 bg-casino-secondary px-4 py-2 rounded-lg">
          <div className="text-sm">
            <div className="text-gray-400 text-xs">Principal</div>
            <div className="font-mono text-xs">{principal.substring(0, 20)}...</div>
          </div>
          <button
            onClick={handleCopyPrincipal}
            className="text-gray-400 hover:text-white transition-colors"
            title="Copy principal"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Logout Button */}
        <button onClick={logout} className="btn-secondary">
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm text-gray-400">Anonymous Mode (Browse Only)</div>
      <button onClick={login} className="btn-primary">
        Login to Play
      </button>
    </div>
  );
};
