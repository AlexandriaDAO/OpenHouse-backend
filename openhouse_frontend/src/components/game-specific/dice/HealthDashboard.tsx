import React, { useState, useEffect } from 'react';
import useDiceActor from '../../../hooks/actors/useDiceActor';
import { AccountingStats, PoolStats, GameStats } from '../../../types/dice-backend';

interface HealthDashboardProps {
  inline?: boolean;
}

export const HealthDashboard: React.FC<HealthDashboardProps> = ({ inline = false }) => {
  const { actor: diceActor } = useDiceActor();

  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [accounting, setAccounting] = useState<AccountingStats | null>(null);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [auditStatus, setAuditStatus] = useState<string>('');
  const [canAcceptBets, setCanAcceptBets] = useState<boolean | null>(null);

  // Auto-refresh effect
  useEffect(() => {
    // If inline, force show
    if (inline) {
      setShowHealthCheck(true);
    }

    if (showHealthCheck && !accounting) {
      fetchHealthMetrics();
    }

    if (showHealthCheck) {
      const interval = setInterval(fetchHealthMetrics, 30000); // Auto-refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [showHealthCheck, diceActor, inline, accounting]);

  const fetchHealthMetrics = async () => {
    if (!diceActor) {
      setError('Actor not available. Please ensure you are connected.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all stats in parallel
      const [accountingResult, poolResult, gameResult, auditResult, betsResult] = await Promise.all([
        diceActor.get_accounting_stats(),
        diceActor.get_pool_stats(),
        diceActor.get_stats(),
        diceActor.audit_balances(),
        diceActor.can_accept_bets()
      ]);

      setAccounting(accountingResult);
      setPoolStats(poolResult);
      setGameStats(gameResult);
      setAuditStatus('Ok' in auditResult ? auditResult.Ok : auditResult.Err);
      setCanAcceptBets(betsResult);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch health metrics:', err);
      const errorMessage = err?.message || 'Unknown error occurred';
      setError(`Failed to fetch stats: ${errorMessage}`);
      setAuditStatus('Error fetching metrics');
    } finally {
      setIsLoading(false);
    }
  };

  const formatUSDT = (decimals: bigint) => {
    return (Number(decimals) / 1_000_000).toFixed(4);
  };

  const formatNumber = (n: bigint) => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const calculateHouseEdge = () => {
    if (!gameStats || gameStats.total_volume === BigInt(0)) return '0.00';
    const houseEdge = (Number(gameStats.house_profit) / Number(gameStats.total_volume)) * 100;
    return houseEdge.toFixed(2);
  };

  const calculateExcess = () => {
    if (!accounting) return { excess: '0', excessUSDT: '0.000000', orphanedFees: 0, isHealthy: true };

    // Use BigInt arithmetic to avoid precision loss
    const poolReserve = accounting.house_balance;
    const deposits = accounting.total_user_deposits;
    const canisterBalance = accounting.canister_balance;

    const calculated = poolReserve + deposits;
    const excess = canisterBalance - calculated;
    const excessUSDT = formatUSDT(excess);
    const orphanedFees = Number(excess / BigInt(10_000));
    const isHealthy = excess < BigInt(1_000_000); // Less than 1 USDT

    return { excess: excess.toString(), excessUSDT, orphanedFees, isHealthy };
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never';
    return lastUpdated.toLocaleTimeString();
  };

  return (
    <div className={inline ? "mt-4" : "card p-4 mt-6 bg-gray-900/30 border border-gray-700"}>
      {/* Toggle Button - Hide if inline */}
      {!inline && (
        <button
          onClick={() => {
            setShowHealthCheck(!showHealthCheck);
          }}
          className="w-full px-4 py-2 bg-purple-600/80 hover:bg-purple-600 rounded text-sm font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <span>📊</span>
          <span>{showHealthCheck ? 'Hide' : 'Show'} System Health Check</span>
        </button>
      )}

      {/* Health Dashboard */}
      {showHealthCheck && (
        <div className="mt-4 space-y-4">
          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-sm">
              <strong>⚠️ Error:</strong> {error}
            </div>
          )}

          {/* Refresh Button with Last Updated */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHealthMetrics}
              disabled={isLoading}
              className="flex-1 px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 rounded text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {isLoading ? '⏳ Loading...' : '🔄 Refresh Stats'}
            </button>
            <span className="text-xs text-gray-400">
              Last updated: {formatLastUpdated()}
            </span>
          </div>

          {accounting && poolStats && gameStats && (
            <div className="space-y-4">
              {/* System Health */}
              <section className="bg-gray-800/50 p-3 rounded">
                <h3 className="text-sm font-bold mb-2 text-purple-400">🏥 System Health</h3>
                <div className="space-y-1 text-xs">
                  <div className={`p-2 rounded ${auditStatus.includes('✅') ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                    {auditStatus}
                  </div>
                  <div className="flex justify-between p-2 bg-gray-900/50 rounded">
                    <span className="text-gray-400">Operational Status:</span>
                    <span className={canAcceptBets ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {canAcceptBets ? '✅ Accepting Bets' : '❌ Cannot Accept Bets'}
                    </span>
                  </div>
                  {(() => {
                    const { excess, excessUSDT, orphanedFees, isHealthy } = calculateExcess();
                    return (
                      <>
                        <div className="flex justify-between p-2 bg-gray-900/50 rounded">
                          <span className="text-gray-400">Excess Balance:</span>
                          <span className={isHealthy ? 'text-gray-300' : 'text-yellow-400'}>
                            {excessUSDT} USDT
                          </span>
                        </div>
                        <div className="flex justify-between p-2 bg-gray-900/50 rounded">
                          <span className="text-gray-400">Orphaned Fees:</span>
                          <span className="text-gray-300">{orphanedFees} (@ 0.01 USDT each)</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </section>

              {/* Accounting Stats */}
              <section className="bg-blue-900/10 p-3 rounded border border-blue-500/20">
                <h3 className="text-sm font-bold mb-2 text-blue-400">💰 Accounting</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-gray-400">Total Deposits</span>
                    <span className="font-mono text-white">{formatUSDT(accounting.total_user_deposits)} USDT</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Unique Depositors</span>
                    <span className="font-mono text-white">{accounting.unique_depositors.toString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">House Balance</span>
                    <span className="font-mono text-white">{formatUSDT(accounting.house_balance)} USDT</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Canister Balance</span>
                    <span className="font-mono text-white">{formatUSDT(accounting.canister_balance)} USDT</span>
                  </div>
                </div>
              </section>

              {/* Pool Stats */}
              <section className="bg-purple-900/10 p-3 rounded border border-purple-500/20">
                <h3 className="text-sm font-bold mb-2 text-purple-400">🏊 Liquidity Pool</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-gray-400">Total Shares</span>
                    <span className="font-mono text-white">{formatNumber(poolStats.total_shares)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Pool Reserve</span>
                    <span className="font-mono text-white">{formatUSDT(poolStats.pool_reserve)} USDT</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Total LPs</span>
                    <span className="font-mono text-white">{poolStats.total_liquidity_providers.toString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Share Price</span>
                    <span className="font-mono text-white">{formatUSDT(poolStats.share_price)} USDT</span>
                  </div>
                </div>
              </section>

              {/* Game Stats */}
              <section className="bg-green-900/10 p-3 rounded border border-green-500/20">
                <h3 className="text-sm font-bold mb-2 text-green-400">🎲 Game Performance</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-gray-400">Total Games</span>
                    <span className="font-mono text-white">{formatNumber(gameStats.total_games)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Total Volume</span>
                    <span className="font-mono text-white">{formatUSDT(gameStats.total_volume)} USDT</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Total Payouts</span>
                    <span className="font-mono text-white">{formatUSDT(gameStats.total_payouts)} USDT</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">House Profit</span>
                    <span className={`font-mono ${Number(gameStats.house_profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatUSDT(gameStats.house_profit)} USDT
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">House Edge</span>
                    <span className="font-mono text-white">{calculateHouseEdge()}%</span>
                  </div>
                </div>
              </section>

              {/* Info */}
              <div className="text-xs text-gray-400 p-2 bg-gray-800/30 rounded">
                💡 <strong>Health Check:</strong> This dashboard shows real-time system metrics for LP owners.
                Stats auto-refresh every 30 seconds while visible.
              </div>
            </div>
          )}

          {!accounting && !isLoading && !error && (
            <div className="text-center text-gray-400 text-sm py-4">
              Loading health metrics...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
