import React, { useEffect, useState } from 'react';
import useCrashActor from '../hooks/actors/useCrashActor';
import { useAuth } from '../providers/AuthProvider';

export const Crash: React.FC = () => {
  const { actor } = useCrashActor();
  const { isAuthenticated } = useAuth();
  const [greeting, setGreeting] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [testingConnection, setTestingConnection] = useState(false);
  const actorLoading = !actor;

  // Test backend connection when actor is ready
  useEffect(() => {
    const testConnection = async () => {
      if (!actor) return;

      setTestingConnection(true);
      setError('');

      try {
        const result = await actor.greet('Player');
        setGreeting(result);
      } catch (err) {
        console.error('Failed to connect to Crash backend:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setTestingConnection(false);
      }
    };

    testConnection();
  }, [actor]);

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <div className="text-center">
        <div className="text-6xl mb-4">🚀</div>
        <h1 className="text-4xl font-bold mb-2">Crash Game</h1>
        <p className="text-gray-400">Watch the multiplier rise and cash out before it crashes!</p>
      </div>

      {/* Connection Status */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4">Backend Connection Status</h3>

        {actorLoading && (
          <div className="flex items-center gap-3 text-yellow-400">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-400"></div>
            <span>Initializing actor...</span>
          </div>
        )}

        {!actorLoading && actor && !testingConnection && !error && greeting && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-green-400">
              <span className="text-2xl">✅</span>
              <span className="font-semibold">Connected to Crash Backend</span>
            </div>
            <div className="bg-casino-primary rounded p-3 text-sm">
              <div className="text-gray-400 mb-1">Backend Response:</div>
              <div className="font-mono">{greeting}</div>
            </div>
            <div className="text-sm text-gray-400">
              Canister ID: <span className="font-mono">fws6k-tyaaa-aaaap-qqc7q-cai</span>
            </div>
          </div>
        )}

        {testingConnection && (
          <div className="flex items-center gap-3 text-blue-400">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
            <span>Testing backend connection...</span>
          </div>
        )}

        {error && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-red-400">
              <span className="text-2xl">❌</span>
              <span className="font-semibold">Connection Failed</span>
            </div>
            <div className="bg-red-900/20 border border-red-500/50 rounded p-3 text-sm">
              <div className="text-red-400 mb-1">Error:</div>
              <div className="font-mono text-xs">{error}</div>
            </div>
          </div>
        )}
      </div>

      {/* Authentication Notice */}
      {!isAuthenticated && (
        <div className="card max-w-2xl mx-auto bg-casino-accent">
          <div className="flex items-start gap-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="font-bold mb-1">Login Required to Play</h3>
              <p className="text-sm text-gray-300">
                You're currently in anonymous mode. Click "Login to Play" in the header to authenticate
                with Internet Identity and start placing bets.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Game Area Placeholder */}
      <div className="card max-w-4xl mx-auto">
        <h3 className="font-bold mb-4">Game Area</h3>
        <div className="bg-casino-primary rounded-lg p-12 text-center">
          <p className="text-gray-400 mb-4">Game UI will be implemented here</p>
          <p className="text-sm text-gray-500">
            Actor initialization is complete. Ready for game logic implementation.
          </p>
        </div>
      </div>

      {/* Game Info */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4">Game Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Min Bet:</span>
            <span className="font-semibold">1 ICP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max Win:</span>
            <span className="font-semibold text-casino-highlight">1000x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">House Edge:</span>
            <span className="font-semibold">1%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
