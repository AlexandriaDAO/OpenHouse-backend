# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-admin-dashboard"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-admin-dashboard`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh
   ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/admin"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(admin): unified information-dense dashboard"
   git push -u origin feature/admin-dashboard
   gh pr create --title "[Feature]: Unified Admin Dashboard" --body "Implements PLAN_unified_admin_dashboard.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/admin
- Affected components: openhouse_frontend (Admin.tsx)

## Changes
- Removed 4-tab interface in favor of unified single-page dashboard
- Added multi-game support (Dice + Plinko health checks)
- Information-dense grid layout showing all datapoints at a glance
- Real-time health monitoring across all casino backends
- Improved visual hierarchy with color-coded status indicators

## Screenshots
Before: 4 separate tabs requiring navigation
After: All critical metrics visible in one view"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/admin-dashboard`
**Worktree:** `/home/theseus/alexandria/openhouse-admin-dashboard`

---

# Implementation Plan: Unified Admin Dashboard

## Task Classification
**REFACTORING**: Improve existing admin page from 4-tab interface to unified information-dense dashboard.

## Current State

### File Structure
```
openhouse_frontend/src/
├── pages/
│   └── Admin.tsx                 # Current 4-tab admin interface (360 lines)
├── hooks/actors/
│   ├── useDiceActor.ts          # Dice backend hook
│   ├── usePlinkoActor.ts        # Plinko backend hook
│   ├── useCrashActor.ts         # Crash backend hook
│   └── useBlackjackActor.ts     # Blackjack backend hook
└── App.tsx                       # Routes admin page to /admin
```

### Current Implementation (Admin.tsx)

**Lines 1-40: Imports & State Setup**
- Only imports Dice backend types and actor
- Hardcoded ADMIN_PRINCIPAL constant
- useState hooks for 4 tabs: 'health' | 'withdrawals' | 'orphaned' | 'balances'

**Lines 41-84: Data Fetching**
- `fetchData()` callback only calls Dice backend
- Tab-based lazy loading (only fetches data for active tab)
- No multi-game support

**Lines 106-141: Tab Navigation**
- 4 separate buttons for tab switching
- Content hidden/shown based on activeTab state
- User must click through tabs to see all data

**Lines 144-217: Health Tab**
- 3-column grid with: System Status, Financials, Operational Metrics
- Dice-only data

**Lines 220-252: Withdrawals Tab**
- Table of pending withdrawals (Dice only)

**Lines 254-300: Orphaned Tab**
- Abandoned withdrawal report (Dice only)

**Lines 302-358: Balances Tab**
- 2-column grid: User Balances, LP Positions (Dice only)

### Backend API Availability

**Dice Backend** (whchi-hyaaa-aaaao-a4ruq-cai):
- ✅ `admin_health_check()` → HealthCheck
- ✅ `admin_get_all_pending_withdrawals()` → Vec<PendingWithdrawalInfo>
- ✅ `admin_get_orphaned_funds_report()` → OrphanedFundsReport
- ✅ `admin_get_all_balances(offset, limit)` → Vec<UserBalance>
- ✅ `admin_get_all_lp_positions(offset, limit)` → Vec<LPPositionInfo>

**Plinko Backend** (weupr-2qaaa-aaaap-abl3q-cai):
- ✅ `admin_health_check()` → HealthCheck
- (Other admin functions TBD)

**Crash Backend** (fws6k-tyaaa-aaaap-qqc7q-cai):
- ❌ No admin functions yet

**Blackjack Backend** (wvrcw-3aaaa-aaaah-arm4a-cai):
- ❌ No admin functions yet

### Problems with Current Design
1. **Hidden Information**: Critical data requires tab navigation
2. **Single Game Only**: Only monitors Dice backend
3. **Inefficient Workflow**: Operator must click 4 tabs to see full picture
4. **Wasted Space**: Large empty areas, inefficient use of viewport
5. **No Comparative View**: Can't compare metrics across games

## Proposed Solution: Unified Information-Dense Dashboard

### Design Principles
1. **Everything Visible**: All critical metrics in single scrollable view
2. **Multi-Game Support**: Side-by-side comparison of Dice vs Plinko
3. **Visual Hierarchy**: Color-coded status, clear sections, compact tables
4. **Real-time Monitoring**: Auto-refresh every 30 seconds
5. **Responsive Grid**: 12-column grid system for flexible layout

### Layout Structure (Top to Bottom)

```
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN DASHBOARD                                    [Refresh]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─ PLATFORM OVERVIEW ────────────────────────────────────────┐  │
│ │ Total TVL: $XXX   |  Active Games: 2/4  |  Status: HEALTHY │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─ DICE GAME ─────────────┬─ PLINKO GAME ─────────────────────┐ │
│ │ Status: HEALTHY ●       │ Status: HEALTHY ●                 │ │
│ │ Pool: $XXX   Users: XXX │ Pool: $XXX   Users: XXX           │ │
│ │ Pending W/D: X ($XXX)   │ Pending W/D: X ($XXX)             │ │
│ │ Excess: +$XX  LPs: XX   │ Excess: +$XX  LPs: XX             │ │
│ └─────────────────────────┴───────────────────────────────────┘ │
│                                                                  │
│ ┌─ SYSTEM RESOURCES ──────────────────────────────────────────┐ │
│ │  Dice: 12.5 MB heap, 45 pages  |  Plinko: 8.2 MB, 32 pages │ │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─ PENDING WITHDRAWALS (Dice: 3, Plinko: 1) ─────────────────┐ │
│ │ User          | Game   | Type | Amount    | Created        │ │
│ │ p7336-jmp...  | Dice   | User | 150 USDT  | 2h ago        │ │
│ │ abc12-def...  | Dice   | LP   | 500 USDT  | 5m ago        │ │
│ │ xyz89-ghi...  | Plinko | User | 75 USDT   | 1h ago        │ │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─ ORPHANED FUNDS ────────────────────────────────────────────┐ │
│ │ Dice: $45.23 (12 events)  |  Plinko: $0.00 (0 events)      │ │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─ TOP BALANCES ──────────┬─ TOP LP POSITIONS ───────────────┐ │
│ │ User         |  Balance │ User         |  Shares           │ │
│ │ p7336...     |  500 USDT│ abc12...     |  10000           │ │
│ │ abc12...     |  250 USDT│ xyz89...     |  5000            │ │
│ └──────────────────────────┴──────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Pseudocode

### File: `openhouse_frontend/src/pages/Admin.tsx` (MODIFY)

```typescript
// PSEUDOCODE

import React, { useState, useEffect, useCallback } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import {
  HealthCheck,
  PendingWithdrawalInfo,
  OrphanedFundsReport,
  UserBalance,
  LPPositionInfo
} from '../declarations/dice_backend/dice_backend.did';
import { useAuth } from '../providers/AuthProvider';

const ADMIN_PRINCIPAL = 'p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae';
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

// Helper functions (keep existing formatUSDT, formatDate)
// ADD: formatTimeAgo(timestamp) for relative times
// ADD: truncatePrincipal(principal, length=8) for compact display

interface GameHealthData {
  health: HealthCheck | null;
  pendingWithdrawals: PendingWithdrawalInfo[];
  orphanedReport: OrphanedFundsReport | null;
  userBalances: UserBalance[];
  lpPositions: LPPositionInfo[];
  error: string | null;
}

export const Admin: React.FC = () => {
  const { actor: diceActor } = useDiceActor();
  const { actor: plinkoActor } = usePlinkoActor();
  const { principal, isAuthenticated } = useAuth();

  // REMOVE: activeTab state (no more tabs!)
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // NEW: Separate state for each game
  const [diceData, setDiceData] = useState<GameHealthData>({
    health: null, pendingWithdrawals: [], orphanedReport: null,
    userBalances: [], lpPositions: [], error: null
  });

  const [plinkoData, setPlinkoData] = useState<GameHealthData>({
    health: null, pendingWithdrawals: [], orphanedReport: null,
    userBalances: [], lpPositions: [], error: null
  });

  const isAdmin = principal === ADMIN_PRINCIPAL;

  // NEW: Fetch data from a specific game backend
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
        const orphanedRes = await actor.admin_get_orphaned_funds_report?.();
        if (orphanedRes && 'Ok' in orphanedRes) orphaned = orphanedRes.Ok;
      } catch (e) { console.warn(`${gameName} missing orphaned funds API`) }

      try {
        const balanceRes = await actor.admin_get_all_balances?.(BigInt(0), BigInt(50));
        if (balanceRes && 'Ok' in balanceRes) balances = balanceRes.Ok;
      } catch (e) { console.warn(`${gameName} missing balances API`) }

      try {
        const lpRes = await actor.admin_get_all_lp_positions?.(BigInt(0), BigInt(50));
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

  // NEW: Fetch all game data in parallel
  const fetchAllData = useCallback(async () => {
    if (!isAdmin || !isAuthenticated) return;
    setLoading(true);

    await Promise.all([
      fetchGameData(diceActor, setDiceData, 'Dice'),
      fetchGameData(plinkoActor, setPlinkoData, 'Plinko'),
    ]);

    setLastRefresh(new Date());
    setLoading(false);
  }, [diceActor, plinkoActor, isAdmin, isAuthenticated]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    if (isAdmin && isAuthenticated) {
      fetchAllData();
      const interval = setInterval(fetchAllData, AUTO_REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [fetchAllData, isAdmin, isAuthenticated]);

  // Access control (keep existing logic)
  if (!isAdmin) {
    return /* existing access denied UI */;
  }

  // Calculate platform-wide metrics
  const totalTVL = (diceData.health?.pool_reserve || 0n) +
                   (plinkoData.health?.pool_reserve || 0n);
  const activeGames = [diceData.health, plinkoData.health].filter(h => h).length;
  const overallHealthy = [diceData.health, plinkoData.health]
    .every(h => !h || h.is_healthy);

  // Combine pending withdrawals from all games
  const allPendingWithdrawals = [
    ...diceData.pendingWithdrawals.map(w => ({ ...w, game: 'Dice' })),
    ...plinkoData.pendingWithdrawals.map(w => ({ ...w, game: 'Plinko' })),
  ].sort((a, b) => Number(b.created_at - a.created_at)); // Most recent first

  // Combine top balances (merge and re-sort)
  const allUserBalances = [
    ...diceData.userBalances,
    ...plinkoData.userBalances,
  ].sort((a, b) => Number(b.balance - a.balance)).slice(0, 10);

  const allLpPositions = [
    ...diceData.lpPositions,
    ...plinkoData.lpPositions,
  ].sort((a, b) => Number(b.shares - a.shares)).slice(0, 10);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="text-gray-400 text-xs mb-1">Total Value Locked</div>
            <div className="text-2xl font-mono text-white">${formatUSDT(totalTVL)}</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="text-gray-400 text-xs mb-1">Active Games</div>
            <div className="text-2xl font-mono text-white">{activeGames}/4</div>
            <div className="text-xs text-gray-500 mt-1">Dice, Plinko operational</div>
          </div>
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="text-gray-400 text-xs mb-1">Platform Status</div>
            <div className={`text-2xl font-bold ${overallHealthy ? 'text-green-400' : 'text-red-400'}`}>
              {overallHealthy ? 'HEALTHY ✓' : 'ISSUES ⚠️'}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Game Health Cards (Side by Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Dice Game Card */}
        <GameHealthCard
          gameName="Dice"
          data={diceData}
          canisterId="whchi-hyaaa-aaaao-a4ruq-cai"
        />

        {/* Plinko Game Card */}
        <GameHealthCard
          gameName="Plinko"
          data={plinkoData}
          canisterId="weupr-2qaaa-aaaap-abl3q-cai"
        />
      </div>

      {/* SECTION 3: System Resources */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-300">System Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-900/50 p-3 rounded">
            <div className="font-semibold text-blue-400 mb-2">Dice Backend</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Heap Memory:</span>
                <span className="font-mono">
                  {diceData.health
                    ? (Number(diceData.health.heap_memory_bytes) / 1024 / 1024).toFixed(2) + ' MB'
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stable Memory:</span>
                <span className="font-mono">
                  {diceData.health?.stable_memory_pages?.toString() || 'N/A'} pages
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 p-3 rounded">
            <div className="font-semibold text-purple-400 mb-2">Plinko Backend</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Heap Memory:</span>
                <span className="font-mono">
                  {plinkoData.health
                    ? (Number(plinkoData.health.heap_memory_bytes) / 1024 / 1024).toFixed(2) + ' MB'
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stable Memory:</span>
                <span className="font-mono">
                  {plinkoData.health?.stable_memory_pages?.toString() || 'N/A'} pages
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: Pending Withdrawals (All Games Combined) */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg mb-6 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-300">
            Pending Withdrawals ({allPendingWithdrawals.length})
          </h2>
          <div className="text-sm text-gray-400">
            Dice: {diceData.pendingWithdrawals.length} • Plinko: {plinkoData.pendingWithdrawals.length}
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
                {allPendingWithdrawals.map((w, i) => (
                  <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-xs" title={w.user.toString()}>
                      {truncatePrincipal(w.user.toString())}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        w.game === 'Dice' ? 'bg-blue-900/30 text-blue-400' : 'bg-purple-900/30 text-purple-400'
                      }`}>
                        {w.game}
                      </span>
                    </td>
                    <td className="px-4 py-3">{w.withdrawal_type}</td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {formatUSDT(w.amount)} USDT
                    </td>
                    <td className="px-4 py-3 text-right">{formatTimeAgo(w.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 5: Orphaned Funds Summary */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Orphaned Funds</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <OrphanedFundsCard gameName="Dice" report={diceData.orphanedReport} />
          <OrphanedFundsCard gameName="Plinko" report={plinkoData.orphanedReport} />
        </div>
      </div>

      {/* SECTION 6: Top Balances & LP Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top User Balances (All Games) */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-gray-300">Top User Balances</h2>
            <p className="text-xs text-gray-500 mt-1">Combined across all games</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                {allUserBalances.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-4 text-center">No balances</td></tr>
                ) : allUserBalances.map((u, i) => (
                  <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-xs" title={u.user.toString()}>
                      {truncatePrincipal(u.user.toString())}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {formatUSDT(u.balance)} USDT
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top LP Positions (All Games) */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-gray-300">Top LP Positions</h2>
            <p className="text-xs text-gray-500 mt-1">Combined across all games</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left">LP</th>
                  <th className="px-4 py-3 text-right">Shares</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                {allLpPositions.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-4 text-center">No LP positions</td></tr>
                ) : allLpPositions.map((p, i) => (
                  <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-xs" title={p.user.toString()}>
                      {truncatePrincipal(p.user.toString())}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {formatUSDT(p.shares)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// NEW: Reusable component for game health display
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

  const h = data.health;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
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

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">Pool Reserve</div>
          <div className="font-mono text-white text-sm">{formatUSDT(h.pool_reserve)} USDT</div>
        </div>
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">User Deposits</div>
          <div className="font-mono text-white text-sm">{formatUSDT(h.total_deposits)} USDT</div>
        </div>
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">Pending W/D</div>
          <div className="font-mono text-white text-sm">
            {h.pending_withdrawals_count.toString()} ({formatUSDT(h.pending_withdrawals_total_amount)} USDT)
          </div>
        </div>
        <div className="bg-gray-900/50 p-2 rounded">
          <div className="text-gray-400 mb-1">Excess</div>
          <div className={`font-mono text-sm ${
            Number(h.excess) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {Number(h.excess) >= 0 ? '+' : ''}{formatUSDT(h.excess)} USDT
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

      {data.error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-500 rounded text-xs text-red-400">
          Error: {data.error}
        </div>
      )}
    </div>
  );
};

// NEW: Reusable component for orphaned funds display
const OrphanedFundsCard: React.FC<{
  gameName: string;
  report: OrphanedFundsReport | null;
}> = ({ gameName, report }) => {
  if (!report) {
    return (
      <div className="bg-gray-900/50 p-3 rounded">
        <div className="font-semibold text-sm mb-1">{gameName}</div>
        <div className="text-gray-500 text-xs">No data</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 p-3 rounded">
      <div className="font-semibold text-sm mb-2">{gameName}</div>
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xs text-gray-400">Total Abandoned</div>
          <div className="font-mono text-yellow-500 text-lg">
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
    </div>
  );
};

// HELPER FUNCTIONS

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
```

## Deployment Notes

### Affected Components
- **Frontend Only**: `openhouse_frontend/src/pages/Admin.tsx`
- **No backend changes required** (uses existing admin APIs)

### Deployment Steps
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

### Testing Checklist (Manual on Mainnet)
1. Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/admin
2. Verify access control (non-admin should see denial)
3. Check that both Dice and Plinko data loads
4. Verify Platform Overview metrics match game cards
5. Check pending withdrawals table combines both games correctly
6. Verify orphaned funds shows data from both games
7. Check top balances/LP positions are sorted correctly
8. Test auto-refresh (wait 30 seconds, verify timestamp updates)
9. Test manual refresh button
10. Verify responsive layout on different screen sizes

## Key Implementation Notes

### Multi-Game Architecture
- Uses both `useDiceActor` and `usePlinkoActor` hooks
- Gracefully handles missing admin functions with try/catch
- Each game has independent error states
- Parallel data fetching with Promise.all

### Auto-Refresh Strategy
- 30-second interval via setInterval
- Shows "Last updated: Xs ago" timestamp
- Manual refresh button for immediate updates
- Cleanup interval on component unmount

### Information Density Optimizations
- 12-column responsive grid system
- Compact text sizes (text-xs, text-sm)
- Truncated principals with hover tooltips
- Color-coded status indicators (green/red/yellow)
- Relative timestamps (2h ago vs full date)

### Visual Hierarchy
1. **Platform Overview** (top) - Most important aggregate metrics
2. **Game Health Cards** - Side-by-side comparison
3. **System Resources** - Technical metrics
4. **Pending Withdrawals** - Action items
5. **Orphaned Funds** - Warning indicators
6. **Top Balances/LPs** - Historical data

### Accessibility
- All tables have proper thead/tbody structure
- Color indicators also use text/icons (not just color)
- Full principal visible on hover (title attribute)
- Loading states for all async operations

## Future Enhancements (Out of Scope)
- Add Crash and Blackjack games when they have admin APIs
- Export data to CSV/JSON
- Historical charts (TVL over time, etc.)
- Alert system for critical thresholds
- WebSocket for real-time updates (instead of polling)
- Search/filter functionality for large tables
- Pagination for balances/LP positions
