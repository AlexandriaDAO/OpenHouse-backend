import React, { useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useBalance } from '../providers/BalanceProvider';
import { formatUSDT } from '../types/ledger';
import { AuthMethodSelector } from './AuthMethodSelector';
import { type IdentityProviderConfig, getPreferredProvider } from '../lib/ic-use-identity/config/identityProviders';

export const AuthButton: React.FC = () => {
  const { isAuthenticated, principal, login, logout, isInitializing } = useAuth();
  const { balance, isLoading: balanceLoading, refreshBalance } = useBalance();
  const [copied, setCopied] = useState(false);
  const [showProviderSelector, setShowProviderSelector] = useState(false);

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

  const handleLoginClick = () => {
    const preferredProvider = getPreferredProvider();
    if (preferredProvider) {
      login(undefined, preferredProvider);
    } else {
      setShowProviderSelector(true);
    }
  };

  const handleProviderSelect = (provider: IdentityProviderConfig) => {
    setShowProviderSelector(false);
    login(undefined, provider);
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
      <div className="flex items-center gap-3">
        {/* Balance Display with Icon */}
        <div className="flex items-center gap-2 bg-casino-accent/50 px-3 py-1.5 rounded">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="font-mono text-sm">
            {balanceLoading ? (
              <span className="animate-pulse">...</span>
            ) : balance !== null ? (
              <span>{formatUSDT(balance)}</span>
            ) : (
              <span className="text-gray-500">--</span>
            )}
          </div>
          <button
            onClick={handleRefreshBalance}
            disabled={balanceLoading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <svg
              className={`w-3.5 h-3.5 ${balanceLoading ? 'animate-spin' : ''}`}
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

        {/* Principal Display with Icon */}
        <div className="flex items-center gap-2 bg-casino-secondary/50 px-3 py-1.5 rounded">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <div className="font-mono text-xs text-gray-300">{principal.substring(0, 8)}...</div>
          <button
            onClick={handleCopyPrincipal}
            className="text-gray-400 hover:text-white transition-colors"
            title="Copy principal"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Logout Icon Button */}
        <button
          onClick={logout}
          className="p-2 hover:bg-casino-secondary/30 rounded transition-colors"
          title="Logout"
        >
          <svg className="w-5 h-5 text-gray-400 hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleLoginClick}
        className="p-2 hover:bg-gray-800 rounded transition-colors"
        title="Login"
      >
        <svg className="w-6 h-6 text-gray-400 hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
        </svg>
      </button>

      {showProviderSelector && (
        <AuthMethodSelector
          onSelect={handleProviderSelect}
          onCancel={() => setShowProviderSelector(false)}
        />
      )}
    </>
  );
};
