import React, { useEffect, useCallback, useMemo, useState } from 'react';
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

// Helper to check if an error is a session expiry error
const isSessionExpiredError = (error: unknown): boolean => {
  const errorStr = String(error);
  return (
    errorStr.includes('Invalid request expiry') ||
    errorStr.includes('ingress_expiry') ||
    errorStr.includes('delegation') && errorStr.includes('expired') ||
    errorStr.includes('Specified ingress_expiry not within expected range')
  );
};

export const ActorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { identity, isInitializing, logout } = useAuth();
  const [showSessionExpired, setShowSessionExpired] = useState(false);

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
          setShowSessionExpired(true);
          throw new Error('Your session has expired. Please refresh the page to continue.');
        }
      }
      return data.args;
    },
    [identity]
  );

  const onRequestError = useCallback((data: InterceptorErrorData) => {
    console.error('Request error:', data.methodName, data.error);

    // Check if this is a session expiry error
    if (isSessionExpiredError(data.error)) {
      console.error('Session expired detected in request error');
      setShowSessionExpired(true);
      return new Error('Your session has expired. Please refresh the page to continue.');
    }

    return data.error;
  }, []);

  const onResponse = useCallback((data: InterceptorResponseData) => {
    return data.response;
  }, []);

  const onResponseError = useCallback((data: InterceptorErrorData) => {
    console.error('Response error:', data.methodName, data.error);

    // Check if this is a session expiry error
    if (isSessionExpiredError(data.error)) {
      console.error('Session expired detected in response error');
      setShowSessionExpired(true);
      // Return a user-friendly error
      return new Error('Your session has expired. Please refresh the page to continue.');
    }

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
  // NOTE: Actor hooks are stable, only update when interceptors change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    ensureAllInitialized().then(() => {
      crash.setInterceptors(interceptors);
      plinko.setInterceptors(interceptors);
      mines.setInterceptors(interceptors);
      dice.setInterceptors(interceptors);
      ledger.setInterceptors(interceptors);
    });
  }, [interceptors]); // Only interceptors, actor hooks are stable

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <>
      {children}
      {showSessionExpired && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-yellow-500/50 shadow-2xl">
            <div className="text-center">
              <div className="text-4xl mb-4">⏰</div>
              <h3 className="text-xl font-bold text-yellow-400 mb-2">Session Expired</h3>
              <p className="text-gray-300 mb-6">
                Your login session has expired. This happens after being idle for a while.
                Please refresh the page to continue playing.
              </p>
              <button
                onClick={handleRefresh}
                className="w-full px-6 py-3 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 transition"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
