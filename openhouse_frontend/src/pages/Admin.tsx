import React, { useState, useEffect, useCallback } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import { 
  HealthCheck, 
  PendingWithdrawalInfo, 
  OrphanedFundsReport, 
  UserBalance, 
  LPPositionInfo 
} from '../declarations/dice_backend/dice_backend.did';
import { useAuth } from '../providers/AuthProvider';

const ADMIN_PRINCIPAL = 'p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae';

// Helper to format ckUSDT (6 decimals) to readable string
const formatUSDT = (amount: bigint | number): string => {
  const val = typeof amount === 'bigint' ? Number(amount) : amount;
  return (val / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};

const formatDate = (ns: bigint): string => {
  return new Date(Number(ns) / 1_000_000).toLocaleString();
};

export const Admin: React.FC = () => {
  const { actor } = useDiceActor();
  const { principal, isAuthenticated } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'health' | 'withdrawals' | 'orphaned' | 'balances'>('health');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data States
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawalInfo[]>([]);
  const [orphanedReport, setOrphanedReport] = useState<OrphanedFundsReport | null>(null);
  const [userBalances, setUserBalances] = useState<UserBalance[]>([]);
  const [lpPositions, setLpPositions] = useState<LPPositionInfo[]>([]);

  const isAdmin = principal === ADMIN_PRINCIPAL;

  const fetchData = useCallback(async () => {
    if (!actor || !isAdmin) return;
    setLoading(true);
    setError(null);

    try {
      // Always fetch health
      const healthRes = await actor.admin_health_check();
      if ('Ok' in healthRes) setHealth(healthRes.Ok);
      else throw new Error(healthRes.Err);

      // Fetch other data based on active tab
      if (activeTab === 'withdrawals') {
        const withdrawRes = await actor.admin_get_all_pending_withdrawals();
        if ('Ok' in withdrawRes) setPendingWithdrawals(withdrawRes.Ok);
        else console.error("Failed to fetch withdrawals:", withdrawRes.Err);
      } 
      else if (activeTab === 'orphaned') {
        const orphanRes = await actor.admin_get_orphaned_funds_report();
        if ('Ok' in orphanRes) setOrphanedReport(orphanRes.Ok);
        else console.error("Failed to fetch orphaned report:", orphanRes.Err);
      }
      else if (activeTab === 'balances') {
        // Fetch top 50 balances and LP positions
        // Note: BigInt literals require "n" suffix or BigInt() constructor
        const balancesRes = await actor.admin_get_all_balances(BigInt(0), BigInt(50));
        if ('Ok' in balancesRes) setUserBalances(balancesRes.Ok);
        
        const lpRes = await actor.admin_get_all_lp_positions(BigInt(0), BigInt(50));
        if ('Ok' in lpRes) setLpPositions(lpRes.Ok);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [actor, isAdmin, activeTab]);

  useEffect(() => {
    if (actor && isAdmin) {
      fetchData();
    }
  }, [fetchData]);

  if (!actor) return <div className="p-8 text-white">Initializing actor...</div>;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="max-w-md w-full">
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">🚫</div>
            <h1 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h1>
            <p className="text-gray-300 mb-4">This page is restricted to authorized administrators only.</p>
            <div className="bg-gray-800 rounded p-3 mb-4">
              <p className="text-xs text-gray-400 mb-1">Your Principal:</p>
              <p className="font-mono text-xs text-gray-300 break-all">{principal || 'Not authenticated'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <button 
          onClick={fetchData}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50 transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 p-4 rounded mb-6">
          <h3 className="font-bold text-red-400">Error</h3>
          <p>{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-gray-700">
        {(['health', 'withdrawals', 'orphaned', 'balances'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-4 capitalize ${
              activeTab === tab 
                ? 'border-b-2 border-blue-500 text-blue-400 font-semibold' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'health' && health && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* System Status */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-gray-300">System Status</h2>
            <div className={`text-2xl font-bold mb-2 ${health.is_healthy ? 'text-green-400' : 'text-red-400'}`}>
              {health.is_healthy ? 'HEALTHY' : 'UNHEALTHY'}
            </div>
            <div className="text-gray-400 text-sm mb-3">{health.health_status}</div>
            <div className="text-xs text-gray-500">
              Last checked: {formatDate(health.timestamp)}
            </div>
          </div>

          {/* Financial Overview */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-gray-300">Financials</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Pool Reserve:</span>
                <span className="font-mono">{formatUSDT(health.pool_reserve)} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">User Deposits:</span>
                <span className="font-mono">{formatUSDT(health.total_deposits)} USDT</span>
              </div>
              <div className="flex justify-between text-blue-300">
                <span className="text-gray-400">Pending Withdrawals:</span>
                <span className="font-mono">{formatUSDT(health.pending_withdrawals_total_amount)} USDT</span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-2">
                <span className="text-gray-400">Required Total:</span>
                <span className="font-mono">{formatUSDT(health.calculated_total)} USDT</span>
              </div>
              <div className="flex justify-between text-yellow-400">
                <span>Canister Balance:</span>
                <span className="font-mono">{formatUSDT(health.canister_balance)} USDT</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="text-gray-400">Excess:</span>
                <span className={`font-mono ${Number(health.excess) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatUSDT(health.excess)} USDT
                </span>
              </div>
            </div>
          </div>

          {/* Operational Metrics */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-gray-300">Operational Metrics</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Pending Withdrawals:</span>
                <span className="font-mono text-white">{health.pending_withdrawals_count.toString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Unique Users:</span>
                <span className="font-mono text-white">{health.unique_users.toString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Unique LPs:</span>
                <span className="font-mono text-white">{health.unique_lps.toString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Heap Memory:</span>
                <span className="font-mono text-white">{(Number(health.heap_memory_bytes) / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stable Memory:</span>
                <span className="font-mono text-white">{health.stable_memory_pages.toString()} Pages</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'withdrawals' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-gray-300">Pending Withdrawals ({pendingWithdrawals.length})</h2>
          </div>
          {pendingWithdrawals.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No pending withdrawals found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3">User Principal</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3 text-right">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingWithdrawals.map((w, i) => (
                    <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                      <td className="px-6 py-4 font-mono text-xs">{w.user.toString()}</td>
                      <td className="px-6 py-4">{w.withdrawal_type}</td>
                      <td className="px-6 py-4 text-right font-mono text-white">{formatUSDT(w.amount)} USDT</td>
                      <td className="px-6 py-4 text-right">{formatDate(w.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'orphaned' && orphanedReport && (
        <div className="space-y-6">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
             <h2 className="text-xl font-semibold mb-4 text-gray-300">Orphaned Funds Summary</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="bg-gray-900/50 p-4 rounded">
                 <div className="text-gray-400 text-sm mb-1">Total Abandoned Amount</div>
                 <div className="text-2xl font-mono text-yellow-500">{formatUSDT(orphanedReport.total_abandoned_amount)} USDT</div>
               </div>
               <div className="bg-gray-900/50 p-4 rounded">
                 <div className="text-gray-400 text-sm mb-1">Abandoned Count</div>
                 <div className="text-2xl font-mono text-white">{orphanedReport.abandoned_count.toString()}</div>
               </div>
             </div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-gray-300">Recent Abandonments (Last 50)</h2>
            </div>
            {orphanedReport.recent_abandonments.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No abandoned withdrawals found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                  <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                    <tr>
                      <th className="px-6 py-3">User Principal</th>
                      <th className="px-6 py-3 text-right">Amount Lost</th>
                      <th className="px-6 py-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphanedReport.recent_abandonments.map((entry, i) => (
                      <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                        <td className="px-6 py-4 font-mono text-xs">{entry.user.toString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-yellow-500">{formatUSDT(entry.amount)} USDT</td>
                        <td className="px-6 py-4 text-right">{formatDate(entry.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'balances' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           {/* User Balances Table */}
           <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-gray-300">Top User Balances (First 50)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3 text-right">Balance (USDT)</th>
                  </tr>
                </thead>
                <tbody>
                  {userBalances.length === 0 ? (
                     <tr><td colSpan={2} className="px-6 py-4 text-center">No balances found</td></tr>
                  ) : userBalances.map((u, i) => (
                    <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                      <td className="px-6 py-4 font-mono text-xs truncate max-w-[150px]" title={u.user.toString()}>{u.user.toString()}</td>
                      <td className="px-6 py-4 text-right font-mono text-white">{formatUSDT(u.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
           </div>

           {/* LP Positions Table */}
           <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-gray-300">Top LP Positions (First 50)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3">LP</th>
                    <th className="px-6 py-3 text-right">Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {lpPositions.length === 0 ? (
                     <tr><td colSpan={2} className="px-6 py-4 text-center">No LP positions found</td></tr>
                  ) : lpPositions.map((p, i) => (
                    <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                      <td className="px-6 py-4 font-mono text-xs truncate max-w-[150px]" title={p.user.toString()}>{p.user.toString()}</td>
                      <td className="px-6 py-4 text-right font-mono text-white">{formatUSDT(p.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
           </div>
        </div>
      )}
    </div>
  );
};