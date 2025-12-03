# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-admin-solvency-ui"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-admin-solvency-ui`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build frontend
   cd openhouse_frontend
   npm run build
   cd ..

   # Deploy frontend to mainnet
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   # Check admin page
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/admin"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(admin): enhance dashboard with solvency checks and unlimited data views

- Display new is_solvent flag and calculated_total field
- Show explicit canister balance vs obligations breakdown
- Use unlimited query functions for complete data access
- Add detailed orphaned funds view with recent abandonments
- Improve health status visualization with solvency warnings"

   git push -u origin feature/admin-solvency-ui

   gh pr create --title "feat(admin): Enhanced Dashboard with Solvency Checks" --body "Implements PLAN_ADMIN_SOLVENCY_UI.md

## Changes
- ✅ Uses new \`is_solvent\` field from PR #144
- ✅ Displays explicit canister accounting breakdown (balance vs obligations)
- ✅ Calls \`admin_get_all_balances_complete()\` and \`admin_get_all_lp_positions_complete()\` for unlimited data
- ✅ Calls \`admin_get_orphaned_funds_report_full()\` to show all abandonments
- ✅ Enhanced solvency status visualization (red alert when insolvent)
- ✅ Shows calculated_total field for transparency

## Deployed to Mainnet
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/admin

## Testing
Manual verification on mainnet admin dashboard:
- Solvency indicators display correctly
- All user balances and LP positions load without pagination limits
- Orphaned funds show complete history
- Canister balance breakdown is clear and accurate"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
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

**Branch:** `feature/admin-solvency-ui`
**Worktree:** `/home/theseus/alexandria/openhouse-admin-solvency-ui`

---

# Implementation Plan: Admin Dashboard Enhancements for Solvency Checks

## Context & Motivation

PR #144 added backend solvency checks and unlimited admin query capabilities to both **Dice** and **Plinko** backends:

### Backend Changes (PR #144)
1. **New Health Check Fields:**
   - `calculated_total: u64` - Explicit sum of pool_reserve + total_deposits
   - `is_solvent: bool` - True if canister_balance >= calculated_total

2. **New Admin Query Functions:**
   - `admin_get_all_balances_complete()` - Returns ALL user balances (no 50-entry limit)
   - `admin_get_all_lp_positions_complete()` - Returns ALL LP positions (no 50-entry limit)
   - `admin_get_orphaned_funds_report_full()` - Returns ALL abandonments (no 50-entry limit)

3. **Modified Function Signatures:**
   - `admin_get_orphaned_funds_report(recent_limit: Option<u64>)` - Now accepts optional limit parameter

### Current Frontend Issues
The admin page (`openhouse_frontend/src/pages/Admin.tsx`) currently:
- ❌ Calls old pagination-limited functions (50 entries max)
- ❌ Doesn't use new `is_solvent` field
- ❌ Doesn't display `calculated_total` field
- ❌ Doesn't show canister balance vs obligations breakdown
- ❌ Limited orphaned funds view (no detail)

---

## Current State Analysis

### File: `openhouse_frontend/src/pages/Admin.tsx`

**Lines 100-113: Data Fetching (NEEDS UPDATE)**
```typescript
// CURRENT - Lines 100-113
try {
  const orphanedRes = await actor.admin_get_orphaned_funds_report?.();  // ❌ No parameter
  if (orphanedRes && 'Ok' in orphanedRes) orphaned = orphanedRes.Ok;
} catch (e) { console.warn(`${gameName} missing orphaned funds API`) }

try {
  const balanceRes = await actor.admin_get_all_balances?.(BigInt(0), BigInt(50));  // ❌ Limited to 50
  if (balanceRes && 'Ok' in balanceRes) balances = balanceRes.Ok;
} catch (e) { console.warn(`${gameName} missing balances API`) }

try {
  const lpRes = await actor.admin_get_all_lp_positions?.(BigInt(0), BigInt(50));  // ❌ Limited to 50
  if (lpRes && 'Ok' in lpRes) lps = lpRes.Ok;
} catch (e) { console.warn(`${gameName} missing LP positions API`) }
```

**Lines 427-497: GameHealthCard Component (NEEDS ENHANCEMENT)**
```typescript
// CURRENT - Lines 457-488
<div className="grid grid-cols-2 gap-3 text-xs">
  <div className="bg-gray-900/50 p-2 rounded">
    <div className="text-gray-400 mb-1">Pool Reserve</div>
    <div className="font-mono text-white text-sm">{formatUSDT(h.pool_reserve)} USDT</div>
  </div>
  <div className="bg-gray-900/50 p-2 rounded">
    <div className="text-gray-400 mb-1">User Deposits</div>
    <div className="font-mono text-white text-sm">{formatUSDT(h.total_deposits)} USDT</div>
  </div>
  {/* ... other metrics ... */}
</div>
```
**Missing:**
- No `is_solvent` indicator
- No `calculated_total` display
- No `canister_balance` vs `calculated_total` comparison
- No visual solvency alert

**Lines 499-532: OrphanedFundsCard Component (NEEDS ENHANCEMENT)**
```typescript
// CURRENT - Lines 513-531
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
```
**Missing:**
- No list of recent abandonments
- No expandable detail view
- No timestamp information

---

## Implementation Plan

### Change 1: Update Data Fetching Functions

**File:** `openhouse_frontend/src/pages/Admin.tsx`

**Lines 100-113: Replace with unlimited query functions**

```typescript
// PSEUDOCODE - Update data fetching

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

    // NEW: Use unlimited query functions
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
```

---

### Change 2: Enhance GameHealthCard Component

**File:** `openhouse_frontend/src/pages/Admin.tsx`

**Lines 427-497: Add solvency visualization**

```typescript
// PSEUDOCODE - Enhanced GameHealthCard component

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
```

---

### Change 3: Enhance OrphanedFundsCard Component

**File:** `openhouse_frontend/src/pages/Admin.tsx`

**Lines 499-532: Add detailed view with recent abandonments**

```typescript
// PSEUDOCODE - Enhanced OrphanedFundsCard component

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
      {hasAbandonments && report.recent_abandonments && report.recent_abandonments.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            {expanded ? '▼ Hide' : '▶'} Recent Abandonments ({report.recent_abandonments.length})
          </button>

          {expanded && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {report.recent_abandonments.map((entry, i) => (
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
```

---

### Change 4: Update Platform Overview Section

**File:** `openhouse_frontend/src/pages/Admin.tsx`

**Lines 212-232: Add solvency status to platform overview**

```typescript
// PSEUDOCODE - Enhanced Platform Overview

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
      <div className="text-2xl font-mono text-white">{activeGames}/4</div>
      <div className="text-xs text-gray-500 mt-1">Dice, Plinko operational</div>
    </div>
    <div className="bg-gray-900/50 p-3 rounded">
      <div className="text-gray-400 text-xs mb-1">Platform Status</div>
      <div className={`text-2xl font-bold ${overallHealthy ? 'text-green-400' : 'text-red-400'}`}>
        {overallHealthy ? 'HEALTHY ✓' : 'ISSUES ⚠️'}
      </div>
    </div>

    {/* NEW: Solvency Status */}
    <div className="bg-gray-900/50 p-3 rounded">
      <div className="text-gray-400 text-xs mb-1">Solvency Status</div>
      {(() => {
        const allSolvent = [diceData.health, plinkoData.health]
          .every(h => !h || h.is_solvent !== false);
        return (
          <div className={`text-2xl font-bold ${allSolvent ? 'text-green-400' : 'text-red-400'}`}>
            {allSolvent ? 'SOLVENT ✓' : 'DEFICIT ⚠️'}
          </div>
        );
      })()}
    </div>
  </div>
</div>
```

---

## TypeScript Interface Updates

**File:** `openhouse_frontend/src/pages/Admin.tsx`

**Lines 4-10: Import types should already include new fields from backend**

The backend `.did` files should already export the updated types from PR #144. No changes needed here unless types are manually defined.

If types need manual update:
```typescript
// PSEUDOCODE - Only if manual type definition exists

interface HealthCheck {
  // Existing fields
  pool_reserve: bigint;
  total_deposits: bigint;
  canister_balance: bigint;
  excess: bigint;
  excess_usdt: number;
  is_healthy: boolean;
  health_status: string;
  timestamp: bigint;
  pending_withdrawals_count: bigint;
  pending_withdrawals_total_amount: bigint;
  heap_memory_bytes: bigint;
  stable_memory_pages: bigint;
  total_abandoned_amount: bigint;
  unique_users: bigint;
  unique_lps: bigint;

  // NEW fields from PR #144
  calculated_total: bigint;  // NEW
  is_solvent: boolean;       // NEW
}
```

---

## Testing Strategy

### Manual Testing on Mainnet

After deployment, verify the following on https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/admin:

#### Test 1: Solvency Display
1. Navigate to admin dashboard
2. Verify each game card shows:
   - ✅ "Canister Accounting" section with breakdown
   - ✅ Actual Balance, Total Obligations, Unallocated Balance
   - ✅ Solvency Status indicator (✓ SOLVENT or ✗ INSOLVENT)
3. If any game is insolvent:
   - ✅ Red alert banner should appear
   - ✅ Status should show "INSOLVENCY ALERT"

#### Test 2: Unlimited Data Loading
1. Verify user balances section shows more than 50 entries (if available)
2. Verify LP positions section shows more than 50 entries (if available)
3. Check browser console for successful API calls to:
   - `admin_get_all_balances_complete()`
   - `admin_get_all_lp_positions_complete()`

#### Test 3: Orphaned Funds Detail
1. If orphaned funds exist:
   - ✅ Yellow warning appears
   - ✅ "▶ Recent Abandonments" button is clickable
   - ✅ Expandable list shows individual abandonment entries with timestamps
2. Call backend manually to verify full data:
   ```bash
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai admin_get_orphaned_funds_report_full
   ```

#### Test 4: Platform Overview
1. Verify "Solvency Status" tile shows correct state
2. Should be "SOLVENT ✓" if all games solvent
3. Should be "DEFICIT ⚠️" if any game insolvent

---

## Deployment Notes

### Affected Components
- **Frontend Only:** `openhouse_frontend/src/pages/Admin.tsx`
- **Backend:** No changes (uses existing APIs from PR #144)

### Deployment Command
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

### Canister IDs
- **Frontend:** `pezw3-laaaa-aaaal-qssoa-cai`
- **Dice Backend:** `whchi-hyaaa-aaaao-a4ruq-cai` (unchanged)
- **Plinko Backend:** `weupr-2qaaa-aaaap-abl3q-cai` (unchanged)

### Rollback Plan
If issues occur:
1. Git revert commit
2. Run `npm run build` in `openhouse_frontend/`
3. Redeploy with `./deploy.sh --frontend-only`

---

## Success Criteria

After deployment, the admin dashboard should:

1. ✅ Display explicit solvency status for each game
2. ✅ Show canister balance vs obligations breakdown
3. ✅ Load ALL user balances and LP positions (no 50-entry limit)
4. ✅ Show complete orphaned funds history with expandable details
5. ✅ Display red alert banner when any game is insolvent
6. ✅ Calculate platform-wide solvency status correctly
7. ✅ Auto-refresh every 30 seconds with new data
8. ✅ No TypeScript errors during build
9. ✅ No console errors when loading admin page

---

## File Summary

### Files Modified (1 file)

**`openhouse_frontend/src/pages/Admin.tsx`**
- Lines 100-113: Update to call unlimited query functions
- Lines 212-232: Add solvency status to platform overview
- Lines 427-497: Enhance GameHealthCard with solvency visualization
- Lines 499-532: Enhance OrphanedFundsCard with expandable detail view

**Net Changes:** ~150 lines modified/added

---

## Implementation Checklist

- [ ] Verify worktree isolation
- [ ] Update data fetching to call `admin_get_all_balances_complete()`
- [ ] Update data fetching to call `admin_get_all_lp_positions_complete()`
- [ ] Update data fetching to call `admin_get_orphaned_funds_report_full()`
- [ ] Add "Canister Accounting" breakdown to GameHealthCard
- [ ] Add solvency indicator to GameHealthCard
- [ ] Add red alert banner for insolvency to GameHealthCard
- [ ] Add expandable orphaned funds detail to OrphanedFundsCard
- [ ] Add solvency status tile to Platform Overview
- [ ] Build frontend (`npm run build`)
- [ ] Deploy to mainnet (`./deploy.sh --frontend-only`)
- [ ] Test on live admin page
- [ ] Create PR with deployment verification

---

## Notes for Implementer

- All backend APIs already exist from PR #144 - no backend changes needed
- TypeScript types should auto-update from `.did` declarations
- Focus on UI clarity - solvency is critical safety info
- Use conditional rendering for `is_solvent` field (backward compatibility)
- Expandable lists improve UX without cluttering default view
- Color coding: Green = healthy/solvent, Red = unhealthy/insolvent, Yellow = warning/orphaned

---

## Risk Assessment: LOW ✅

**Why Low Risk:**
- Frontend-only changes (no smart contract modification)
- No state changes (pure data visualization)
- Backward compatible (checks for field existence)
- Can quickly rollback via git revert + redeploy
- Changes only affect admin page (not user-facing games)

**Potential Issues:**
1. TypeScript type mismatches - Mitigated by importing from `.did` files
2. Missing fields on old backend - Mitigated by optional chaining (`?.`)
3. Large data sets causing UI lag - Mitigated by pagination still available if needed

---

**END OF PLAN**
