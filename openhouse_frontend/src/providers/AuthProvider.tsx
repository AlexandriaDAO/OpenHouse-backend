import React, { createContext, useContext, useCallback } from 'react';
import { Identity } from '@dfinity/agent';
import { useIdentity, useInternetIdentity, getIdentity, isAuthenticated } from '../lib/ic-use-identity';
import type { Status } from '../lib/ic-use-identity';

interface AuthContextType {
  identity: Identity | undefined;
  isAuthenticated: boolean;
  principal: string | null;
  login: () => void;
  logout: () => Promise<void>;
  isInitializing: boolean;
  status: Status;
  error?: Error;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { identity, status, error, clear } = useIdentity();
  const { login } = useInternetIdentity();

  const handleLogout = useCallback(async () => {
    await clear();
  }, [clear]);

  // Re-compute isAuthenticated when identity or status changes
  // This ensures BalanceProvider and other consumers get updated values
  const authenticated = status === 'success' && isAuthenticated();

  const value: AuthContextType = {
    identity,
    isAuthenticated: authenticated,
    principal: identity?.getPrincipal().toString() ?? null,
    login,
    logout: handleLogout,
    isInitializing: status === 'initializing',
    status,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Re-export getIdentity for use in interceptors
export { getIdentity, isAuthenticated };
