import React, { useState, useEffect } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import { HealthCheck } from '../declarations/dice_backend/dice_backend.did';

export const Admin: React.FC = () => {
  const { actor } = useDiceActor();
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    if (!actor) return;
    setLoading(true);
    setError(null);
    try {
        // @ts-ignore - types might not be fully synced in IDE but valid in runtime if built
        const result = await actor.admin_health_check();
        if ('Ok' in result) {
            setHealth(result.Ok);
        } else {
            setError(result.Err);
        }
    } catch (e) {
        setError(String(e));
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      if(actor) {
          checkHealth();
      }
  }, [actor]);

  if (!actor) return <div className="p-8 text-white">Initializing actor...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Health Check</h1>
      
      <div className="mb-6">
          <button 
            onClick={checkHealth}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Refresh Health'}
          </button>
      </div>

      {error && (
          <div className="bg-red-900/50 border border-red-500 p-4 rounded mb-6">
              <h3 className="font-bold text-red-400">Error</h3>
              <p>{error}</p>
          </div>
      )}

      {health && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                  <h2 className="text-xl font-semibold mb-4 text-gray-300">Status</h2>
                  <div className={`text-2xl font-bold mb-2 ${health.is_healthy ? 'text-green-400' : 'text-red-400'}`}>
                      {health.is_healthy ? 'HEALTHY' : 'UNHEALTHY'}
                  </div>
                  <div className="text-gray-400 text-sm">{health.health_status}</div>
              </div>

              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                  <h2 className="text-xl font-semibold mb-4 text-gray-300">Financials</h2>
                  <div className="space-y-3">
                      <div className="flex justify-between">
                          <span className="text-gray-400">Pool Reserve:</span>
                          <span className="font-mono">{Number(health.pool_reserve).toLocaleString()} e8s</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-gray-400">Total Deposits:</span>
                          <span className="font-mono">{Number(health.total_deposits).toLocaleString()} e8s</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-700 pt-2">
                          <span className="text-gray-400">Calculated Total:</span>
                          <span className="font-mono">{Number(health.calculated_total).toLocaleString()} e8s</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-gray-400">Canister Balance:</span>
                          <span className="font-mono text-yellow-400">{Number(health.canister_balance).toLocaleString()} e8s</span>
                      </div>
                  </div>
              </div>

              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                  <h2 className="text-xl font-semibold mb-4 text-gray-300">Discrepancy</h2>
                  <div className="space-y-3">
                      <div className="flex justify-between">
                          <span className="text-gray-400">Excess (e8s):</span>
                          <span className={`font-mono ${Number(health.excess) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {health.excess.toString()}
                          </span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-gray-400">Excess (USDT):</span>
                          <span className={`font-mono ${Number(health.excess_usdt) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {Number(health.excess_usdt).toFixed(6)}
                          </span>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
