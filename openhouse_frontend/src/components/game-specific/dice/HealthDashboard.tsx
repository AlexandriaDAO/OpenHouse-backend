import React, { useState } from 'react';
import useDiceActor from '../../../hooks/actors/useDiceActor';

interface AccountingStats {
  total_user_deposits: bigint;
  unique_depositors: bigint;
  house_balance: bigint;
  canister_balance: bigint;
}

interface PoolStats {
  total_shares: bigint;
  pool_reserve: bigint;
  share_price: bigint;
  total_liquidity_providers: bigint;
  minimum_liquidity_burned: bigint;
  is_initialized: boolean;
}

interface GameStats {
  total_games: bigint;
  total_volume: bigint;
  house_profit: bigint;
  games_won: bigint;
  games_lost: bigint;
}

export const HealthDashboard: React.FC = () => {
  const { actor: diceActor } = useDiceActor();

  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [accounting, setAccounting] = useState<AccountingStats | null>(null);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [auditStatus, setAuditStatus] = useState<string>('');
  const [canAcceptBets, setCanAcceptBets] = useState<boolean | null>(null);

  const fetchHealthMetrics = async () => {
    if (!diceActor) return;

    setIsLoading(true);

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
    } catch (err) {
      console.error('Failed to fetch health metrics:', err);
      setAuditStatus('Error fetching metrics');
    } finally {
      setIsLoading(false);
    }
  };

  const formatICP = (e8s: bigint) => {
    return (Number(e8s) / 100_000_000).toFixed(4);
  };

  const formatNumber = (n: bigint) => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const calculateWinRate = () => {
    if (!gameStats || gameStats.total_games === BigInt(0)) return '0.00';
    const winRate = (Number(gameStats.games_won) / Number(gameStats.total_games)) * 100;
    return winRate.toFixed(2);
  };

  const calculateExcess = () => {
    if (!accounting) return { excess: '0', excessICP: '0.0000', orphanedFees: 0, isHealthy: true };

    const poolReserve = Number(accounting.house_balance);
    const deposits = Number(accounting.total_user_deposits);
    const canisterBalance = Number(accounting.canister_balance);

    const calculated = poolReserve + deposits;
    const excess = canisterBalance - calculated;
    const excessICP = (excess / 100_000_000).toFixed(8);
    const orphanedFees = Math.floor(excess / 10_000);
    const isHealthy = excess < 100_000_000; // Less than 1 ICP

    return { excess: excess.toString(), excessICP, orphanedFees, isHealthy };
  };

  return (
    <div className="card p-4 mt-6">
      {/* Toggle Button */}
      <button
        onClick={() => {
          setShowHealthCheck(!showHealthCheck);
          if (!showHealthCheck && !accounting) {
            fetchHealthMetrics();
          }
        }}
        className="w-full px-4 py-2 bg-purple-600/80 hover:bg-purple-600 rounded text-sm font-bold flex items-center justify-center gap-2"
      >
        <span>📊</span>
        <span>{showHealthCheck ? 'Hide' : 'Show'} System Health Check</span>
      </button>

      {/* Health Dashboard */}
      {showHealthCheck && (
        <div className="mt-4 space-y-4">
          {/* Refresh Button */}
          <button
            onClick={fetchHealthMetrics}
            disabled={isLoading}
            className="w-full px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 rounded text-xs font-bold disabled:opacity-50"
          >
            {isLoading ? '⏳ Loading...' : '🔄 Refresh Stats'}
          </button>

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
                    const { excess, excessICP, orphanedFees, isHealthy } = calculateExcess();
                    return (
                      <>
                        <div className="flex justify-between p-2 bg-gray-900/50 rounded">
                          <span className="text-gray-400">Excess Balance:</span>
                          <span className={isHealthy ? 'text-gray-300' : 'text-yellow-400'}>
                            {excessICP} ICP
                          </span>
                        </div>
                        <div className="flex justify-between p-2 bg-gray-900/50 rounded">
                          <span className="text-gray-400">Orphaned Fees:</span>
                          <span className="text-gray-300">{orphanedFees} (@ 0.0001 ICP each)</span>
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
                    <span className="font-mono text-white">{formatICP(accounting.total_user_deposits)} ICP</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Unique Depositors</span>
                    <span className="font-mono text-white">{accounting.unique_depositors.toString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">House Balance</span>
                    <span className="font-mono text-white">{formatICP(accounting.house_balance)} ICP</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Canister Balance</span>
                    <span className="font-mono text-white">{formatICP(accounting.canister_balance)} ICP</span>
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
                    <span className="font-mono text-white">{formatICP(poolStats.pool_reserve)} ICP</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Total LPs</span>
                    <span className="font-mono text-white">{poolStats.total_liquidity_providers.toString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Share Price</span>
                    <span className="font-mono text-white">{formatICP(poolStats.share_price)} ICP</span>
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
                    <span className="font-mono text-white">{formatICP(gameStats.total_volume)} ICP</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">House Profit</span>
                    <span className={`font-mono ${Number(gameStats.house_profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatICP(gameStats.house_profit)} ICP
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Player Win Rate</span>
                    <span className="font-mono text-white">{calculateWinRate()}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Games Won</span>
                    <span className="font-mono text-green-400">{formatNumber(gameStats.games_won)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Games Lost</span>
                    <span className="font-mono text-red-400">{formatNumber(gameStats.games_lost)}</span>
                  </div>
                </div>
              </section>

              {/* Info */}
              <div className="text-xs text-gray-400 p-2 bg-gray-800/30 rounded">
                💡 <strong>Health Check:</strong> This dashboard shows real-time system metrics for LP owners.
                Refresh periodically to monitor pool performance and accounting integrity.
              </div>
            </div>
          )}

          {!accounting && !isLoading && (
            <div className="text-center text-gray-400 text-sm py-4">
              Click "Refresh Stats" to load health metrics
            </div>
          )}
        </div>
      )}
    </div>
  );
};
