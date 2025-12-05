import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIdentity, getIdentity } from '../lib/ic-use-identity';
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
import useBlackjackActor from '../hooks/actors/useBlackjackActor';
import useDiceActor from '../hooks/actors/useDiceActor';
import useLedgerActor from '../hooks/actors/useLedgerActor';

// Helper to check if an error indicates invalid/stale authentication
// Be careful: error JSON dumps contain "ingress_expiry" as a field name in request details,
// so we must check for actual error messages, not just field names
const isAuthenticationError = (error: unknown): boolean => {
  const errorStr = String(error);
  return (
    // Session expiry errors - must match actual error messages
    errorStr.includes('Invalid request expiry') ||
    errorStr.includes('Specified ingress_expiry not within expected range') ||
    errorStr.includes('request expired') ||
    (errorStr.includes('delegation') && errorStr.includes('expired')) ||
    // Signature verification errors (stale/corrupted delegation)
    errorStr.includes('Invalid signature') ||
    errorStr.includes('signature could not be verified') ||
    errorStr.includes('EcdsaP256 signature could not be verified')
  );
};

// Authentication error modal component
function AuthErrorModal() {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-red-500/50 shadow-2xl">
        <div className="text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h3 className="text-xl font-bold text-red-400 mb-2">Authentication Invalid</h3>
          <p className="text-gray-300 mb-4">
            Your login session is invalid or has expired.
            You will be logged out automatically.
          </p>
          <p className="text-yellow-400 font-mono text-lg mb-4">
            Refreshing in {countdown}...
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-6 py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-400 transition"
          >
            Refresh Now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ActorProvider - returns null, sets up actors and interceptors as a side effect
export function ActorProvider() {
  const { identity, clear, status } = useIdentity();
  const [showAuthError, setShowAuthError] = useState(false);
  const isLoggingOut = useRef(false);
  // Track if we've ever had a valid authenticated session this page load
  const hadValidSession = useRef(false);

  // Initialize all actor hooks
  const crash = useCrashActor();
  const plinko = usePlinkoActor();
  const blackjack = useBlackjackActor();
  const dice = useDiceActor();
  const ledger = useLedgerActor();

  // Track when we establish a valid authenticated session
  useEffect(() => {
    if (status === 'success' && identity && !identity.getPrincipal().isAnonymous()) {
      hadValidSession.current = true;
    }
  }, [status, identity]);

  // Function to handle authentication errors - only runs once
  // Only shows modal if we had a valid session that expired mid-use
  const handleAuthError = useCallback(() => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    console.error('Authentication error detected - clearing session');

    // Only show the error modal if we had a valid session before
    // This prevents infinite reload loop for already-expired sessions on page load
    if (hadValidSession.current) {
      setShowAuthError(true);
    }

    // Clear the stored credentials immediately
    clear().catch(console.error);
  }, [clear]);

  // Interceptor to check delegation validity before each request
  const onRequest = useCallback(
    (data: InterceptorRequestData) => {
      // Get current identity from global store at request time
      const currentIdentity = getIdentity();

      // Only check delegation for authenticated users
      if (currentIdentity && !currentIdentity.getPrincipal().isAnonymous()) {
        // Check if delegation is still valid
        if (!isDelegationValid((currentIdentity as DelegationIdentity).getDelegation())) {
          console.error('Login expired - delegation no longer valid');
          handleAuthError();
        }
      }
      return data.args;
    },
    [handleAuthError]
  );

  const onRequestError = useCallback((data: InterceptorErrorData) => {
    console.error('Request error:', data.methodName, data.error);

    // Check if this is an authentication error (expired or invalid signature)
    if (isAuthenticationError(data.error)) {
      handleAuthError();
      return new Error('Your session is invalid. Logging out...');
    }

    return data.error;
  }, [handleAuthError]);

  const onResponse = useCallback((data: InterceptorResponseData) => {
    return data.response;
  }, []);

  const onResponseError = useCallback((data: InterceptorErrorData) => {
    console.error('Response error:', data.methodName, data.error);

    // Check if this is an authentication error (expired or invalid signature)
    if (isAuthenticationError(data.error)) {
      handleAuthError();
      return new Error('Your session is invalid. Logging out...');
    }

    return data.error;
  }, [handleAuthError]);

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
    if (!identity) return;
    ensureAllInitialized().then(() => {
      authenticateAll(identity);
    });
  }, [identity]);

  // Set interceptors for all actors - only depends on interceptors
  useEffect(() => {
    ensureAllInitialized().then(() => {
      crash.setInterceptors(interceptors);
      plinko.setInterceptors(interceptors);
      blackjack.setInterceptors(interceptors);
      dice.setInterceptors(interceptors);
      ledger.setInterceptors(interceptors);
    });
  }, [interceptors]);

  // Return null - this is a side-effect component, not a wrapper
  // Use portal for the modal so it renders even though we return null
  if (showAuthError) {
    return <AuthErrorModal />;
  }

  return null;
}
