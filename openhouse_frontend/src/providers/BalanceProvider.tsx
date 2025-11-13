import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import useLedgerActor from '../hooks/actors/useLedgerActor';
import { Account } from '../types/ledger';

interface BalanceContextType {
  balance: bigint | null;
  isLoading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

export const BalanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { identity, isAuthenticated, principal } = useAuth();
  const { actor: ledgerActor } = useLedgerActor();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!ledgerActor || !identity || !principal) {
      setBalance(null);
      return;
    }

    // Don't fetch balance for anonymous users
    if (!isAuthenticated) {
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const account: Account = {
        owner: identity.getPrincipal(),
        subaccount: [], // Default subaccount
      };

      const balanceE8s = await ledgerActor.icrc1_balance_of(account);
      setBalance(balanceE8s);
    } catch (err) {
      console.error('Failed to fetch ICP balance:', err);
      setError(err instanceof Error ? err.message : String(err));
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [ledgerActor, identity, principal, isAuthenticated]);

  // Fetch balance when identity or ledger actor changes
  // NOTE: We DON'T include refreshBalance in deps to avoid infinite loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAuthenticated && ledgerActor) {
      refreshBalance();
    } else {
      // Reset balance when logged out
      setBalance(null);
      setError(null);
    }
  }, [isAuthenticated, ledgerActor]); // Only these deps, not refreshBalance

  const value: BalanceContextType = {
    balance,
    isLoading,
    error,
    refreshBalance,
  };

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
};

export const useBalance = (): BalanceContextType => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalance must be used within a BalanceProvider');
  }
  return context;
};
