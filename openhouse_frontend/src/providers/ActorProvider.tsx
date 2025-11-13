import React, { useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import {
  ensureAllInitialized,
  authenticateAll,
  type InterceptorErrorData,
  type InterceptorRequestData,
  type InterceptorResponseData,
} from 'ic-use-actor';
import { type DelegationIdentity, isDelegationValid } from '@dfinity/identity';
import useCrashActor from '../hooks/actors/useCrashActor';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import useMinesActor from '../hooks/actors/useMinesActor';
import useDiceActor from '../hooks/actors/useDiceActor';
import useLedgerActor from '../hooks/actors/useLedgerActor';

export const ActorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { identity, isInitializing, logout } = useAuth();

  // Initialize all actor hooks
  const crash = useCrashActor();
  const plinko = usePlinkoActor();
  const mines = useMinesActor();
  const dice = useDiceActor();
  const ledger = useLedgerActor();

  // Interceptor to check delegation validity before each request
  const onRequest = useCallback(
    (data: InterceptorRequestData) => {
      // Only check delegation for authenticated users
      if (identity && identity.getPrincipal().isAnonymous() === false) {
        // Check if delegation is still valid
        if (!isDelegationValid((identity as DelegationIdentity).getDelegation())) {
          console.error('Login expired - delegation no longer valid');

          // Log out and reload to clear stale auth
          setTimeout(async () => {
            await logout();
            window.location.reload();
          }, 100);

          throw new Error('Login expired. Please log in again.');
        }
      }
      return data.args;
    },
    [identity, logout]
  );

  const onRequestError = useCallback((data: InterceptorErrorData) => {
    console.error('Request error:', data.methodName, data.error);
    return data.error;
  }, []);

  const onResponse = useCallback((data: InterceptorResponseData) => {
    return data.response;
  }, []);

  const onResponseError = useCallback((data: InterceptorErrorData) => {
    console.error('Response error:', data.methodName, data.error);
    return data.error;
  }, []);

  const interceptors = useMemo(
    () => ({
      onRequest,
      onResponse,
      onRequestError,
      onResponseError,
    }),
    [onRequest, onResponse, onRequestError, onResponseError]
  );

  // Update all actors when identity changes
  useEffect(() => {
    if (isInitializing || !identity) return;

    const initActors = async () => {
      try {
        await ensureAllInitialized();
        await authenticateAll(identity);
        console.log('All actors initialized with identity:', identity.getPrincipal().toString());
      } catch (error) {
        console.error('Failed to initialize actors:', error);
      }
    };

    initActors();
  }, [identity, isInitializing]);

  // Set interceptors for all actors
  useEffect(() => {
    ensureAllInitialized().then(() => {
      crash.setInterceptors(interceptors);
      plinko.setInterceptors(interceptors);
      mines.setInterceptors(interceptors);
      dice.setInterceptors(interceptors);
      ledger.setInterceptors(interceptors);
    });
  }, [interceptors, crash, plinko, mines, dice, ledger]);

  return <>{children}</>;
};
