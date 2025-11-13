import React from 'react';

interface ConnectionStatusProps {
  isLoading: boolean;
  isConnected: boolean;
  error?: string;
  backendName: string;
  canisterId: string;
  greeting?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isLoading,
  isConnected,
  error,
  backendName,
  canisterId,
  greeting,
}) => {
  return (
    <div className="card max-w-2xl mx-auto">
      <h3 className="font-bold mb-4">Backend Connection Status</h3>

      {isLoading && (
        <div className="flex items-center gap-3 text-yellow-400">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-400"></div>
          <span>Initializing {backendName} actor...</span>
        </div>
      )}

      {!isLoading && isConnected && !error && greeting && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-green-400">
            <span className="text-2xl">✅</span>
            <span className="font-semibold">Connected to {backendName}</span>
          </div>
          <div className="bg-casino-primary rounded p-3 text-sm">
            <div className="text-gray-400 mb-1">Backend Response:</div>
            <div className="font-mono">{greeting}</div>
          </div>
          <div className="text-sm text-gray-400">
            Canister ID: <span className="font-mono">{canisterId}</span>
          </div>
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
  );
};