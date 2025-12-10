import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useBalance } from '../providers/BalanceProvider';
import { useGameBalance } from '../providers/GameBalanceProvider';
import { AuthMethodSelector } from './AuthMethodSelector';
import { type IdentityProviderConfig } from '../lib/ic-use-identity/config/identityProviders';

interface OnboardingBannerProps {
  /** Where the banner is displayed - affects messaging */
  context?: 'home' | 'game';
}

const DISMISSED_KEY = 'openhouse_onboarding_dismissed';

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({
  context = 'home',
}) => {
  const navigate = useNavigate();
  const { isAuthenticated, login, isInitializing } = useAuth();
  const { balance, isLoading: balanceLoading } = useBalance();
  const gameBalanceContext = useGameBalance();
  const [dismissed, setDismissed] = useState(false);
  const [dismissedChips, setDismissedChips] = useState(false);
  const [visible, setVisible] = useState(true);
  const [showProviderSelector, setShowProviderSelector] = useState(false);

  // Check if user has any chips across all games
  const totalGameChips =
    gameBalanceContext.balances.dice.game +
    gameBalanceContext.balances.plinko.game +
    gameBalanceContext.balances.crash.game +
    gameBalanceContext.balances.roulette.game;

  // Check if user has dismissed the "get ckUSDT" banner before
  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY);
    if (wasDismissed === 'true') {
      setDismissed(true);
    }
  }, []);

  // Animate out when user has chips
  useEffect(() => {
    if (isAuthenticated && totalGameChips > 0n) {
      // User has chips - fade out
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [isAuthenticated, totalGameChips]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  // Use the same login flow as AuthButton - always show selector
  const handleLoginClick = () => {
    setShowProviderSelector(true);
  };

  const handleProviderSelect = (provider: IdentityProviderConfig) => {
    setShowProviderSelector(false);
    login(undefined, provider);
  };

  // Don't show during initialization
  if (isInitializing) {
    return null;
  }

  // State 1: Not authenticated - show login prompt
  if (!isAuthenticated) {
    return (
      <>
        <div className="onboarding-banner onboarding-banner--compact">
          <span className="onboarding-text-simple">Sign in to start playing</span>
          <button onClick={handleLoginClick} className="onboarding-login-btn" title="Sign In">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </button>
        </div>

        {showProviderSelector && (
          <AuthMethodSelector
            onSelect={handleProviderSelect}
            onCancel={() => setShowProviderSelector(false)}
          />
        )}
      </>
    );
  }

  // State 2: Authenticated but zero ckUSDT balance - prompt to get ckUSDT
  if (!balanceLoading && (balance === null || balance === 0n) && !dismissed) {
    return (
      <div className={`onboarding-banner onboarding-banner--compact ${visible ? '' : 'onboarding-banner--hidden'}`}>
        <span className="onboarding-text-simple">Get ckUSDT to start playing</span>
        <div className="onboarding-actions">
          <button onClick={() => navigate('/wallet')} className="onboarding-wallet-btn" title="View Wallet">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 10h20" />
              <circle cx="17" cy="14" r="2" />
            </svg>
          </button>
          <button onClick={handleDismiss} className="onboarding-dismiss-inline" title="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // State 3: Has ckUSDT but no chips - prompt to deposit chips
  if (balance && balance > 0n && totalGameChips === 0n && !dismissedChips) {
    return (
      <div className={`onboarding-banner onboarding-banner--compact ${visible ? '' : 'onboarding-banner--hidden'}`}>
        <span className="onboarding-text-simple">Deposit chips to start playing</span>
        <div className="onboarding-actions">
          <span className="onboarding-hint">Click [+] in the betting rail</span>
          <button onClick={() => setDismissedChips(true)} className="onboarding-dismiss-inline" title="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // State 4: User has chips - show nothing
  return null;
};
