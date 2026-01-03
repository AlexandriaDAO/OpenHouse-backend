import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import useCrashActor from '../hooks/actors/useCrashActor';
import useRouletteActor from '../hooks/actors/useRouletteActor';
import {
  HealthCheck,
  PendingWithdrawalInfo,
  OrphanedFundsReport,
  UserBalance,
  LPPositionInfo,
  AuditEntry,
  AuditEvent
} from '../declarations/dice_backend/dice_backend.did';
import { useAuth } from '../providers/AuthProvider';
import { getAdminGames } from '../config/gameRegistry';
import { GameType } from '../types/balance';

const ADMIN_PRINCIPAL = 'p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae';
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

// Color configuration per game (matches registry theme)
const GAME_COLORS: Record<string, { header: string; bg: string; badge: string }> = {
  dice: { header: 'text-dfinity-turquoise', bg: 'bg-dfinity-turquoise/10', badge: 'bg-dfinity-turquoise/30 text-dfinity-turquoise' },
  plinko: { header: 'text-orange-500', bg: 'bg-orange-500/10', badge: 'bg-orange-500/30 text-orange-500' },
  crash: { header: 'text-purple-500', bg: 'bg-purple-500/10', badge: 'bg-purple-500/30 text-purple-500' },
  roulette: { header: 'text-red-500', bg: 'bg-red-500/10', badge: 'bg-red-500/30 text-red-500' },
};

// Helper functions
const formatUSDT = (amount: bigint | number): string => {
  const val = typeof amount === 'bigint' ? Number(amount) : amount;
  return (val / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};

function formatTimeAgo(timestamp: bigint | Date): string {
  // Convert bigint nanoseconds to Date if needed
  const date = timestamp instanceof Date
    ? timestamp
    : new Date(Number(timestamp) / 1_000_000);

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function truncatePrincipal(principal: string, length: number = 8): string {
  if (principal.length <= length + 3) return principal;
  return principal.slice(0, length) + '...';
}

interface GameHealthData {
  health: HealthCheck | null;
  pendingWithdrawals: PendingWithdrawalInfo[];
  orphanedReport: OrphanedFundsReport | null;
  userBalances: UserBalance[];
  lpPositions: LPPositionInfo[];
  error: string | null;
}

// Extended withdrawal info to include game name
interface UnifiedPendingWithdrawal extends PendingWithdrawalInfo {
  game: string;
}

// Audit log state for each game
interface AuditLogData {
  entries: AuditEntry[];
  totalCount: number;
  error: string | null;
}

export const Admin: React.FC = () => {
  // Get admin-enabled games from registry
  const adminGames = useMemo(() => getAdminGames(), []);

  // All actor hooks (called unconditionally per React rules)
  const { actor: diceActor } = useDiceActor();
  const { actor: plinkoActor } = usePlinkoActor();
  const { actor: crashActor } = useCrashActor();
  const { actor: rouletteActor } = useRouletteActor();
  const { principal, isAuthenticated } = useAuth();

  // Map of actors by game ID
  const actorMap = useMemo(() => ({
    dice: diceActor,
    plinko: plinkoActor,
    crash: crashActor,
    roulette: rouletteActor,
  } as Record<GameType, any>), [diceActor, plinkoActor, crashActor, rouletteActor]);

  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Dynamic state for all games - keyed by game ID
  const [gameData, setGameData] = useState<Record<string, GameHealthData>>(() => {
    const initial: Record<string, GameHealthData> = {};
    adminGames.forEach(g => {
      initial[g.id] = {
        health: null, pendingWithdrawals: [], orphanedReport: null,
        userBalances: [], lpPositions: [], error: null
      };
    });
    return initial;
  });

  // Audit log state (per-game)
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLogData>>(() => {
    const initial: Record<string, AuditLogData> = {};
    adminGames.forEach(g => {
      initial[g.id] = { entries: [], totalCount: 0, error: null };
    });
    return initial;
  });

  const [auditOffsets, setAuditOffsets] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    adminGames.forEach(g => { initial[g.id] = 0; });
    return initial;
  });

  const [auditFilters, setAuditFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    adminGames.forEach(g => { initial[g.id] = 'all'; });
    return initial;
  });

  const AUDIT_LOG_PAGE_SIZE = 25;
  const isAdmin = principal === ADMIN_PRINCIPAL;

  // Fetch data from a specific game backend
  const fetchGameData = async (
    actor: any,
    setData: React.Dispatch<React.SetStateAction<GameHealthData>>,
    gameName: string
  ) => {
    if (!actor) return;

    try {
      // Always fetch health check
      const healthRes = await actor.admin_health_check();
      if ('Err' in healthRes) throw new Error(healthRes.Err);

      // Try to fetch all other data (gracefully handle missing methods)
      let pending: PendingWithdrawalInfo[] = [];
      let orphaned: OrphanedFundsReport | null = null;
      let balances: UserBalance[] = [];
      let lps: LPPositionInfo[] = [];

      try {
        const pendingRes = await actor.admin_get_all_pending_withdrawals?.();
        if (pendingRes && 'Ok' in pendingRes) pending = pendingRes.Ok;
      } catch (e) { console.warn(`${gameName} missing pending withdrawals API`) }

      try {
        // NEW: Call with no limit to get ALL abandonments
        const orphanedRes = await actor.admin_get_orphaned_funds_report_full?.();
        if (orphanedRes && 'Ok' in orphanedRes) orphaned = orphanedRes.Ok;
      } catch (e) { console.warn(`${gameName} missing orphaned funds API`) }

      try {
        // NEW: Use complete query (no pagination)
        const balanceRes = await actor.admin_get_all_balances_complete?.();
        if (balanceRes && 'Ok' in balanceRes) balances = balanceRes.Ok;
      } catch (e) { console.warn(`${gameName} missing balances API`) }

      try {
        // NEW: Use complete query (no pagination)
        const lpRes = await actor.admin_get_all_lp_positions_complete?.();
        if (lpRes && 'Ok' in lpRes) lps = lpRes.Ok;
      } catch (e) { console.warn(`${gameName} missing LP positions API`) }

      setData({
        health: 'Ok' in healthRes ? healthRes.Ok : null,
        pendingWithdrawals: pending,
        orphanedReport: orphaned,
        userBalances: balances,
        lpPositions: lps,
        error: null
      });
    } catch (e) {
      setData(prev => ({ ...prev, error: String(e) }));
    }
  };

  // Generic audit log fetcher for any game
  const fetchGameAuditLogs = useCallback(async (gameId: string, offset: number = 0) => {
    const actor = actorMap[gameId as GameType];
    if (!isAdmin || !isAuthenticated || !actor) return;

    try {
      const [logRes, countRes] = await Promise.all([
        actor.admin_get_audit_log?.(BigInt(AUDIT_LOG_PAGE_SIZE), BigInt(offset)),
        actor.admin_get_audit_log_count?.()
      ]);

      let entries: AuditEntry[] = [];
      let totalCount = 0;

      if (logRes && 'Ok' in logRes) entries = logRes.Ok;
      if (countRes && 'Ok' in countRes) totalCount = Number(countRes.Ok);

      setAuditLogs(prev => ({
        ...prev,
        [gameId]: { entries, totalCount, error: null }
      }));
    } catch (e) {
      console.warn(`${gameId} audit log fetch failed:`, e);
      setAuditLogs(prev => ({
        ...prev,
        [gameId]: { ...prev[gameId], error: String(e) }
      }));
    }
  }, [actorMap, isAdmin, isAuthenticated]);

  // Fetch all game data in parallel (dynamic based on registry)
  const fetchAllData = useCallback(async () => {
    if (!isAdmin || !isAuthenticated) return;
    setLoading(true);

    // Fetch health data for all admin-enabled games
    const healthPromises = adminGames.map(async (game) => {
      const actor = actorMap[game.id];
      if (!actor) return;

      const setData = (updater: (prev: GameHealthData) => GameHealthData) => {
        setGameData(prev => ({ ...prev, [game.id]: updater(prev[game.id]) }));
      };

      await fetchGameData(actor, (data) => setData(() => data as GameHealthData), game.name);
    });

    // Fetch audit logs for all admin-enabled games
    const auditPromises = adminGames.map(game => fetchGameAuditLogs(game.id, 0));

    await Promise.all([...healthPromises, ...auditPromises]);

    // Reset all audit offsets on full refresh
    setAuditOffsets(prev => {
      const reset: Record<string, number> = {};
      Object.keys(prev).forEach(k => { reset[k] = 0; });
      return reset;
    });

    setLastRefresh(new Date());
    setLoading(false);
  }, [adminGames, actorMap, isAdmin, isAuthenticated, fetchGameAuditLogs]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    if (isAdmin && isAuthenticated) {
      fetchAllData();
      const interval = setInterval(fetchAllData, AUTO_REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [fetchAllData, isAdmin, isAuthenticated]);

  // Access control
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

  // Calculate platform-wide metrics dynamically from all admin games
  const allHealthData = adminGames.map(g => gameData[g.id]?.health).filter(Boolean);
  const totalTVL = allHealthData.reduce((sum, h) => sum + (h?.pool_reserve || 0n), 0n);
  const activeGames = allHealthData.filter(h => h).length;
  const overallHealthy = allHealthData.every(h => !h || h.is_healthy);
  const allSolvent = allHealthData.every(h => !h || (h as any).is_solvent !== false);

  // Combine pending withdrawals from all games
  const allPendingWithdrawals: UnifiedPendingWithdrawal[] = adminGames
    .flatMap(g => (gameData[g.id]?.pendingWithdrawals || []).map(w => ({ ...w, game: g.name })))
    .sort((a, b) => Number(b.created_at - a.created_at)); // Most recent first

  // Get list of operational game names for display
  const operationalGames = adminGames
    .filter(g => gameData[g.id]?.health)
    .map(g => g.name)
    .join(', ') || 'None';


  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          {lastRefresh && (
            <p className="text-sm text-gray-400 mt-1">
              Last updated: {formatTimeAgo(lastRefresh)} • Auto-refresh: 30s
            </p>
          )}
        </div>
        <button onClick={fetchAllData} disabled={loading}
          className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded">
          {loading ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      {/* SECTION 1: Platform Overview */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Platform Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="text-gray-400 text-xs mb-1">Total Value Locked</div>
            <div className="text-2xl font-mono text-white">${formatUSDT(totalTVL)}</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="text-gray-400 text-xs mb-1">Active Games</div>
            <div className="text-2xl font-mono text-white">{activeGames}/{adminGames.length}</div>
            <div className="text-xs text-gray-500 mt-1">{operationalGames} operational</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="text-gray-400 text-xs mb-1">Platform Status</div>
            <div className={`text-2xl font-bold ${overallHealthy ? 'text-green-400' : 'text-red-400'}`}>
              {overallHealthy ? 'HEALTHY ✓' : 'ISSUES ⚠️'}
            </div>
          </div>
          {/* Solvency Status */}
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="text-gray-400 text-xs mb-1">Solvency Status</div>
            <div className={`text-2xl font-bold ${allSolvent ? 'text-green-400' : 'text-red-400'}`}>
              {allSolvent ? 'SOLVENT ✓' : 'DEFICIT ⚠️'}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Game Health Cards (Dynamic) */}
      <div className={`grid grid-cols-1 ${adminGames.length >= 2 ? 'lg:grid-cols-2' : ''} ${adminGames.length >= 3 ? 'xl:grid-cols-3' : ''} gap-6 mb-6`}>
        {adminGames.map(game => (
          <GameHealthCard
            key={game.id}
            gameName={game.name}
            data={gameData[game.id]}
            canisterId={game.canisterId}
          />
        ))}
      </div>

      {/* SECTION 3: System Resources (Dynamic) */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-300">System Resources</h2>
        <div className={`grid grid-cols-1 ${adminGames.length >= 2 ? 'md:grid-cols-2' : ''} ${adminGames.length >= 3 ? 'lg:grid-cols-3' : ''} gap-4 text-sm`}>
          {adminGames.map(game => {
            const data = gameData[game.id];
            const colors = GAME_COLORS[game.id] || GAME_COLORS.dice;
            return (
              <div key={game.id} className="bg-gray-900/50 p-3 rounded">
                <div className={`font-semibold mb-2 ${colors.header}`}>{game.name} Backend</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Heap Memory:</span>
                    <span className="font-mono">
                      {data?.health
                        ? (Number(data.health.heap_memory_bytes) / 1024 / 1024).toFixed(2) + ' MB'
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stable Memory:</span>
                    <span className="font-mono">
                      {data?.health?.stable_memory_pages?.toString() || 'N/A'} pages
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Pending Withdrawals (All Games Combined) */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg mb-6 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-300">
            Pending Withdrawals ({allPendingWithdrawals.length})
          </h2>
          <div className="text-sm text-gray-400">
            {adminGames.map(g => `${g.name}: ${gameData[g.id]?.pendingWithdrawals?.length || 0}`).join(' • ')}
          </div>
        </div>
        {allPendingWithdrawals.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No pending withdrawals</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Game</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                {allPendingWithdrawals.map((w, i) => {
                  const gameConfig = adminGames.find(g => g.name === w.game);
                  const colors = GAME_COLORS[gameConfig?.id || 'dice'] || GAME_COLORS.dice;
                  return (
                    <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-mono text-xs" title={w.user.toString()}>
                        {truncatePrincipal(w.user.toString())}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${colors.badge}`}>
                          {w.game}
                        </span>
                      </td>
                      <td className="px-4 py-3">{w.withdrawal_type}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">
                        {formatUSDT(w.amount)} USDT
                      </td>
                      <td className="px-4 py-3 text-right">{formatTimeAgo(w.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 5: Orphaned Funds Summary (Dynamic) */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Orphaned Funds</h2>
        <div className={`grid grid-cols-1 ${adminGames.length >= 2 ? 'md:grid-cols-2' : ''} ${adminGames.length >= 3 ? 'lg:grid-cols-3' : ''} gap-4`}>
          {adminGames.map(game => (
            <OrphanedFundsCard
              key={game.id}
              gameName={game.name}
              report={gameData[game.id]?.orphanedReport || null}
            />
          ))}
        </div>
      </div>

      {/* SECTION 6: Per-Game User Balances & LP Positions (Dynamic) */}
      <div className={`grid grid-cols-1 ${adminGames.length >= 2 ? 'lg:grid-cols-2' : ''} ${adminGames.length >= 3 ? 'xl:grid-cols-3' : ''} gap-6 mb-6`}>
        {adminGames.map(game => {
          const colorMap: Record<string, 'blue' | 'purple' | 'green' | 'orange'> = {
            dice: 'blue',
            plinko: 'orange',
            crash: 'purple',
            roulette: 'purple',
          };
          return (
            <GameBalancesCard
              key={game.id}
              gameName={game.name}
              color={colorMap[game.id] || 'blue'}
              userBalances={gameData[game.id]?.userBalances || []}
              lpPositions={gameData[game.id]?.lpPositions || []}
            />
          );
        })}
      </div>

      {/* SECTION 7: Per-Game Audit Logs (Dynamic) */}
      <div className={`grid grid-cols-1 ${adminGames.length >= 2 ? 'lg:grid-cols-2' : ''} ${adminGames.length >= 3 ? 'xl:grid-cols-3' : ''} gap-6`}>
        {adminGames.map(game => {
          const colorMap: Record<string, 'blue' | 'purple'> = {
            dice: 'blue',
            plinko: 'purple',
            crash: 'purple',
            roulette: 'purple',
          };
          return (
            <GameAuditLogCard
              key={game.id}
              gameName={game.name}
              color={colorMap[game.id] || 'blue'}
              auditLog={auditLogs[game.id] || { entries: [], totalCount: 0, error: null }}
              offset={auditOffsets[game.id] || 0}
              filter={auditFilters[game.id] || 'all'}
              pageSize={AUDIT_LOG_PAGE_SIZE}
              onOffsetChange={(newOffset) => {
                setAuditOffsets(prev => ({ ...prev, [game.id]: newOffset }));
                fetchGameAuditLogs(game.id, newOffset);
              }}
              onFilterChange={(filter) => setAuditFilters(prev => ({ ...prev, [game.id]: filter }))}
            />
          );
        })}
      </div>
    </div>
  );
};

// Reusable component for game health display
const GameHealthCard: React.FC<{
  gameName: string;
  data: GameHealthData;
  canisterId: string;
}> = ({ gameName, data, canisterId }) => {
  if (!data.health) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2">{gameName}</h3>
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const h = data.health as any; // Type cast to access new fields if they exist

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      {/* Header with health status */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold">{gameName}</h3>
          <p className="text-xs text-gray-500 font-mono">{canisterId}</p>
        </div>
        <div className={`px-3 py-1 rounded text-sm font-bold ${
          h.is_healthy ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
        }`}>
          {h.is_healthy ? '● HEALTHY' : '● ISSUE'}
        </div>
      </div>

      {/* NEW: Solvency Alert Banner (if insolvent) */}
      {h.is_solvent !== undefined && !h.is_solvent && (
        <div className="mb-3 p-3 bg-red-900/30 border border-red-500 rounded">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-bold text-red-400">INSOLVENCY ALERT</div>
              <div className="text-xs text-gray-300 mt-1">
                Canister balance cannot cover all obligations. Bets are blocked.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Canister Accounting Breakdown */}
      <div className="mb-3 p-3 bg-gray-900/50 rounded border border-gray-700">
        <div className="text-xs text-gray-400 mb-2 font-semibold">Canister Accounting</div>
        <div className="space-y-2 text-xs">
          {/* Actual Balance */}
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Actual Canister Balance:</span>
            <span className="font-mono text-white font-semibold">
              {formatUSDT(h.canister_balance)} USDT
            </span>
          </div>

          {/* Calculated Total (Obligations) */}
          <div className="flex justify-between items-center border-t border-gray-700 pt-2">
            <span className="text-gray-400">Total Obligations:</span>
            <span className="font-mono text-yellow-400 font-semibold">
              {formatUSDT(h.calculated_total || (h.pool_reserve + h.total_deposits))} USDT
            </span>
          </div>

          {/* Breakdown of obligations */}
          <div className="ml-4 space-y-1 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>• Pool Reserve:</span>
              <span className="font-mono">{formatUSDT(h.pool_reserve)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span>• User Deposits:</span>
              <span className="font-mono">{formatUSDT(h.total_deposits)} USDT</span>
            </div>
          </div>

          {/* Surplus/Deficit */}
          <div className="flex justify-between items-center border-t border-gray-700 pt-2">
            <span className="text-gray-400">Unallocated Balance:</span>
            <span className={`font-mono font-bold ${
              Number(h.excess) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {Number(h.excess) >= 0 ? '+' : ''}{formatUSDT(h.excess)} USDT
            </span>
          </div>

          {/* NEW: Solvency Indicator */}
          {h.is_solvent !== undefined && (
            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-400">Solvency Status:</span>
              <span className={`font-mono font-bold text-xs px-2 py-1 rounded ${
                h.is_solvent
                  ? 'bg-green-900/30 text-green-400'
                  : 'bg-red-900/30 text-red-400'
              }`}>
                {h.is_solvent ? '✓ SOLVENT' : '✗ INSOLVENT'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Existing metrics grid (simplified) */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">Pending W/D</div>
          <div className="font-mono text-white text-sm">
            {h.pending_withdrawals_count.toString()} ({formatUSDT(h.pending_withdrawals_total_amount)} USDT)
          </div>
        </div>
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">Orphaned Funds</div>
          <div className={`font-mono text-sm ${
            Number(h.total_abandoned_amount) > 0 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {formatUSDT(h.total_abandoned_amount)} USDT
          </div>
        </div>
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">Unique Users</div>
          <div className="font-mono text-white text-sm">{h.unique_users.toString()}</div>
        </div>
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">Unique LPs</div>
          <div className="font-mono text-white text-sm">{h.unique_lps.toString()}</div>
        </div>
      </div>

      {/* Error display */}
      {data.error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-500 rounded text-xs text-red-400">
          Error: {data.error}
        </div>
      )}
    </div>
  );
};

// Reusable component for orphaned funds display
const OrphanedFundsCard: React.FC<{
  gameName: string;
  report: OrphanedFundsReport | null;
}> = ({ gameName, report }) => {
  const [expanded, setExpanded] = React.useState(false);

  if (!report) {
    return (
      <div className="bg-gray-900/50 p-3 rounded">
        <div className="font-semibold text-sm mb-1">{gameName}</div>
        <div className="text-gray-500 text-xs">No data</div>
      </div>
    );
  }

  const hasAbandonments = Number(report.abandoned_count) > 0;
  const recentAbandonments = (report as any).recent_abandonments; // Access new field if exists

  return (
    <div className="bg-gray-900/50 p-3 rounded">
      <div className="font-semibold text-sm mb-2 flex items-center gap-2">
        {gameName}
        {hasAbandonments && (
          <span className="text-xs px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded">
            ⚠️ INVESTIGATE
          </span>
        )}
      </div>

      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="text-xs text-gray-400">Total Abandoned</div>
          <div className={`font-mono text-lg ${
            hasAbandonments ? 'text-yellow-500' : 'text-green-400'
          }`}>
            ${formatUSDT(report.total_abandoned_amount)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Events</div>
          <div className="font-mono text-white text-lg">
            {report.abandoned_count.toString()}
          </div>
        </div>
      </div>

      {/* NEW: Warning message if abandonments exist */}
      {hasAbandonments && (
        <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700 rounded p-2 mb-2">
          ⚠️ Orphaned funds indicate potential withdrawal flow bugs
        </div>
      )}

      {/* NEW: Expandable recent abandonments list */}
      {hasAbandonments && recentAbandonments && recentAbandonments.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            {expanded ? '▼ Hide' : '▶'} Recent Abandonments ({recentAbandonments.length})
          </button>

          {expanded && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {recentAbandonments.map((entry: any, i: number) => (
                <div key={i} className="text-xs bg-gray-800/50 p-2 rounded border border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-gray-400 text-xs">User</div>
                      <div className="font-mono text-gray-300" title={entry.user.toString()}>
                        {truncatePrincipal(entry.user.toString(), 12)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-xs">Amount</div>
                      <div className="font-mono text-yellow-400">
                        {formatUSDT(entry.amount)} USDT
                      </div>
                    </div>
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    {formatTimeAgo(entry.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Per-game user balances and LP positions card
const GameBalancesCard: React.FC<{
  gameName: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
  userBalances: UserBalance[];
  lpPositions: LPPositionInfo[];
}> = ({ gameName, color, userBalances, lpPositions }) => {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-900/30 border-blue-700',
    purple: 'text-purple-400 bg-purple-900/30 border-purple-700',
    green: 'text-green-400 bg-green-900/30 border-green-700',
    orange: 'text-orange-400 bg-orange-900/30 border-orange-700',
  };

  const headerColor = colorClasses[color].split(' ')[0];
  const bgColor = colorClasses[color].split(' ')[1];

  // Sort and limit to top 10
  const sortedBalances = [...userBalances]
    .sort((a, b) => Number(b.balance - a.balance))
    .slice(0, 10);

  const sortedLPs = [...lpPositions]
    .sort((a, b) => Number(b.shares - a.shares))
    .slice(0, 10);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className={`p-4 border-b border-gray-700 ${bgColor}`}>
        <h2 className={`text-lg font-semibold ${headerColor}`}>{gameName}</h2>
        <p className="text-xs text-gray-400 mt-1">Isolated canister balances</p>
      </div>

      <div className="p-4 space-y-4">
        {/* User Balances Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <span>User Balances</span>
            <span className="text-xs text-gray-500 font-normal">({userBalances.length} users)</span>
          </h3>
          {sortedBalances.length === 0 ? (
            <div className="text-gray-500 text-xs p-2 bg-gray-900/50 rounded">No user balances</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-400 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {sortedBalances.map((u, i) => (
                    <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-3 py-2 font-mono" title={u.user.toString()}>
                        {truncatePrincipal(u.user.toString())}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-white">
                        {formatUSDT(u.balance)} USDT
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* LP Positions Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <span>LP Positions</span>
            <span className="text-xs text-gray-500 font-normal">({lpPositions.length} LPs)</span>
          </h3>
          {sortedLPs.length === 0 ? (
            <div className="text-gray-500 text-xs p-2 bg-gray-900/50 rounded">No LP positions</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-400 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-3 py-2 text-left">LP</th>
                    <th className="px-3 py-2 text-right">Shares</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {sortedLPs.map((p, i) => (
                    <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-3 py-2 font-mono" title={p.user.toString()}>
                        {truncatePrincipal(p.user.toString())}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-white">
                        {formatUSDT(p.shares)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper to get event type name from AuditEvent
const getEventTypeName = (event: AuditEvent): string => {
  if ('WithdrawalInitiated' in event) return 'WithdrawalInitiated';
  if ('WithdrawalCompleted' in event) return 'WithdrawalCompleted';
  if ('WithdrawalFailed' in event) return 'WithdrawalFailed';
  if ('WithdrawalAbandoned' in event) return 'WithdrawalAbandoned';
  if ('WithdrawalExpired' in event) return 'WithdrawalExpired';
  if ('BalanceRestored' in event) return 'BalanceRestored';
  if ('LPRestored' in event) return 'LPRestored';
  if ('SystemError' in event) return 'SystemError';
  if ('ParentFeeCredited' in event) return 'ParentFeeCredited';
  if ('ParentFeeFallback' in event) return 'ParentFeeFallback';
  if ('SystemInfo' in event) return 'SystemInfo';
  if ('BalanceCredited' in event) return 'BalanceCredited';
  if ('SlippageProtectionTriggered' in event) return 'SlippageProtectionTriggered';
  if ('SystemRefundCredited' in event) return 'SystemRefundCredited';
  return 'Unknown';
};

// Get color class for event type
const getEventColor = (eventType: string): string => {
  const greenEvents = ['WithdrawalCompleted', 'BalanceCredited', 'ParentFeeCredited'];
  const yellowEvents = ['WithdrawalInitiated', 'SystemInfo', 'ParentFeeFallback'];
  const redEvents = ['WithdrawalFailed', 'WithdrawalAbandoned', 'SystemError', 'SlippageProtectionTriggered'];
  const blueEvents = ['BalanceRestored', 'LPRestored', 'SystemRefundCredited'];

  if (greenEvents.includes(eventType)) return 'bg-green-900/30 text-green-400';
  if (yellowEvents.includes(eventType)) return 'bg-yellow-900/30 text-yellow-400';
  if (redEvents.includes(eventType)) return 'bg-red-900/30 text-red-400';
  if (blueEvents.includes(eventType)) return 'bg-blue-900/30 text-blue-400';
  return 'bg-gray-700 text-gray-300';
};

// Format event details
const formatEventDetails = (event: AuditEvent): { user?: string; amount?: string; message?: string } => {
  if ('WithdrawalInitiated' in event) {
    return { user: event.WithdrawalInitiated.user.toString(), amount: formatUSDT(event.WithdrawalInitiated.amount) };
  }
  if ('WithdrawalCompleted' in event) {
    return { user: event.WithdrawalCompleted.user.toString(), amount: formatUSDT(event.WithdrawalCompleted.amount) };
  }
  if ('WithdrawalFailed' in event) {
    return { user: event.WithdrawalFailed.user.toString(), amount: formatUSDT(event.WithdrawalFailed.amount) };
  }
  if ('WithdrawalAbandoned' in event) {
    return { user: event.WithdrawalAbandoned.user.toString(), amount: formatUSDT(event.WithdrawalAbandoned.amount) };
  }
  if ('WithdrawalExpired' in event) {
    return { user: event.WithdrawalExpired.user.toString(), amount: formatUSDT(event.WithdrawalExpired.amount) };
  }
  if ('BalanceRestored' in event) {
    return { user: event.BalanceRestored.user.toString(), amount: formatUSDT(event.BalanceRestored.amount) };
  }
  if ('LPRestored' in event) {
    return { user: event.LPRestored.user.toString(), amount: formatUSDT(event.LPRestored.amount) };
  }
  if ('SystemError' in event) {
    return { message: event.SystemError.error };
  }
  if ('ParentFeeCredited' in event) {
    return { amount: formatUSDT(event.ParentFeeCredited.amount) };
  }
  if ('ParentFeeFallback' in event) {
    return { amount: formatUSDT(event.ParentFeeFallback.amount), message: event.ParentFeeFallback.reason };
  }
  if ('SystemInfo' in event) {
    return { message: event.SystemInfo.message };
  }
  if ('BalanceCredited' in event) {
    return { user: event.BalanceCredited.user.toString(), amount: formatUSDT(event.BalanceCredited.amount) };
  }
  if ('SlippageProtectionTriggered' in event) {
    return { user: event.SlippageProtectionTriggered.user.toString(), amount: formatUSDT(event.SlippageProtectionTriggered.deposit_amount) };
  }
  if ('SystemRefundCredited' in event) {
    return { user: event.SystemRefundCredited.user.toString(), amount: formatUSDT(event.SystemRefundCredited.amount) };
  }
  return {};
};

// All event types for the filter dropdown
const ALL_EVENT_TYPES = [
  'all',
  'WithdrawalInitiated',
  'WithdrawalCompleted',
  'WithdrawalFailed',
  'WithdrawalAbandoned',
  'WithdrawalExpired',
  'BalanceRestored',
  'LPRestored',
  'SystemError',
  'ParentFeeCredited',
  'ParentFeeFallback',
  'SystemInfo',
  'BalanceCredited',
  'SlippageProtectionTriggered',
  'SystemRefundCredited'
];

// Per-game Audit Log Card Component
const GameAuditLogCard: React.FC<{
  gameName: string;
  color: 'blue' | 'purple';
  auditLog: AuditLogData;
  offset: number;
  filter: string;
  pageSize: number;
  onOffsetChange: (newOffset: number) => void;
  onFilterChange: (filter: string) => void;
}> = ({ gameName, color, auditLog, offset, filter, pageSize, onOffsetChange, onFilterChange }) => {
  const colorClasses = {
    blue: { header: 'text-blue-400', bg: 'bg-blue-900/30', border: 'border-blue-700' },
    purple: { header: 'text-purple-400', bg: 'bg-purple-900/30', border: 'border-purple-700' },
  };

  const colors = colorClasses[color];

  // Apply filter
  const filteredEntries = filter === 'all'
    ? auditLog.entries
    : auditLog.entries.filter(e => getEventTypeName(e.event) === filter);

  const hasMore = offset + pageSize < auditLog.totalCount;
  const hasPrev = offset > 0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className={`p-4 border-b border-gray-700 ${colors.bg}`}>
        <div className="flex justify-between items-start">
          <div>
            <h2 className={`text-lg font-semibold ${colors.header}`}>{gameName} Audit Log</h2>
            <p className="text-xs text-gray-400 mt-1">{auditLog.totalCount} entries</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-3 border-b border-gray-700 flex justify-between items-center flex-wrap gap-2 bg-gray-900/30">
        {/* Filter dropdown */}
        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="bg-gray-900 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1"
        >
          {ALL_EVENT_TYPES.map(type => (
            <option key={type} value={type}>
              {type === 'all' ? 'All Events' : type}
            </option>
          ))}
        </select>

        {/* Pagination controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
            disabled={!hasPrev}
            className={`px-2 py-1 rounded text-xs ${
              hasPrev
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            ←
          </button>
          <span className="text-xs text-gray-400 px-2">
            {Math.floor(offset / pageSize) + 1}
          </span>
          <button
            onClick={() => onOffsetChange(offset + pageSize)}
            disabled={!hasMore}
            className={`px-2 py-1 rounded text-xs ${
              hasMore
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            →
          </button>
        </div>
      </div>

      {/* Error display */}
      {auditLog.error && (
        <div className="p-3 bg-red-900/20 border-b border-red-700 text-red-400 text-xs">
          {auditLog.error}
        </div>
      )}

      {/* Table */}
      {filteredEntries.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm">No audit log entries</div>
      ) : (
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs">
            <thead className="text-xs text-gray-400 uppercase bg-gray-700/50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Event</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="text-gray-400">
              {filteredEntries.map((entry, i) => {
                const eventType = getEventTypeName(entry.event);
                const details = formatEventDetails(entry.event);
                return (
                  <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {formatTimeAgo(entry.timestamp)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getEventColor(eventType)}`}>
                        {eventType.replace('Withdrawal', 'W/D')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white whitespace-nowrap">
                      {details.amount ? `${details.amount}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};