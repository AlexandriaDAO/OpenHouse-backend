# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-liquidity-ui-overhaul"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-liquidity-ui-overhaul`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend && npm run build && cd ..
   ./deploy.sh --frontend-only
   ```
4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice/liquidity"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): overhaul liquidity UI to match game simplicity"
   git push -u origin feature/liquidity-ui-overhaul
   gh pr create --title "Dice Liquidity UI Overhaul - Match Game Simplicity" --body "$(cat <<'EOF'
## Summary
- Completely redesigned "Become an Owner" tab to match the clean DiceGame aesthetic
- Removed information overload (6 sections -> single focused view)
- Moved educational content to modals/tooltips
- Hero display for pool/position with compact action controls

## Test Plan
- [ ] Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice/liquidity
- [ ] Verify pool stats display correctly
- [ ] Test deposit flow still works
- [ ] Test withdraw flow still works
- [ ] Verify responsive design on mobile
- [ ] Check tooltips/modals for educational content

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- After sleep: IMMEDIATELY continue (no pause)
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/liquidity-ui-overhaul`
**Worktree:** `/home/theseus/alexandria/openhouse-liquidity-ui-overhaul`

---

# Implementation Plan: Liquidity UI Overhaul

## Task Classification
**REFACTORING** - Improve existing UI with subtractive + targeted redesign approach.

## Problem Statement

The "Become an Owner" tab (DiceLiquidity) is a catastrophic mess compared to the clean, beautiful "Play Game" tab (DiceGame):

### Current DiceGame (GOOD - The Model)
- Single large interactive element (dice animation) - CENTERPIECE
- Simple controls underneath
- Stats in a single compact row
- Action button fixed at bottom (BettingRail)
- Minimal text, progressive disclosure via modals

### Current DiceLiquidity (BAD - The Problem)
- **6 competing sections** overwhelming the user:
  1. Header + tooltip
  2. "How It Works" educational section (2-column grid with walls of text)
  3. "Fee Structure" section (3 rows + bonus paragraph)
  4. DiceStatistics (expandable charts)
  5. DiceLiquidityPanel (pool stats + position + deposit/withdraw)
  6. HealthDashboard (expandable detailed metrics)
  7. Risk disclaimer
- **Redundant data display** - Pool Reserve and Share Price shown in multiple places
- **Confusing hierarchy** - The actual ACTION (deposit/withdraw) is buried in the middle
- **Visual chaos** - Different colored cards (blue, purple, yellow, green)
- **Walls of text** - Educational content should be optional, not mandatory reading

## Solution: Match DiceGame Philosophy

Transform the page into a **single-screen focused experience**:

```
+----------------------------------------+
|         POOL VALUE  $1,234.56          |  <- Hero metric (like dice number)
|         Your Position: $50.00          |
|         Ownership: 4.05%               |
+----------------------------------------+
|    [___100___] USDT    [DEPOSIT]       |  <- Simple controls
|           [WITHDRAW ALL]               |
+----------------------------------------+
| Reserve | Share Price | LPs  | APY     |  <- Compact stats row
| $1,234  | $1.0023     | 12   | +12.5%  |
+----------------------------------------+
|   [?] How it works    [Health Check]   |  <- Optional modals
+----------------------------------------+
```

## Current State - Files to Modify

### File Tree
```
openhouse_frontend/src/
├── pages/dice/
│   ├── DiceLiquidity.tsx          # REWRITE - Main page (120 lines -> ~80 lines)
│   └── DiceLayout.tsx             # KEEP AS-IS
├── components/game-specific/dice/
│   ├── DiceLiquidityPanel.tsx     # SIMPLIFY - Remove redundant pool stats
│   ├── HealthDashboard.tsx        # KEEP - Move to modal trigger
│   └── statistics/
│       └── DiceStatistics.tsx     # KEEP - Make more accessible
```

## Implementation Sections

---

### Section 1: Rewrite DiceLiquidity.tsx (Main Page)

**File:** `openhouse_frontend/src/pages/dice/DiceLiquidity.tsx`
**Action:** REWRITE

```typescript
// PSEUDOCODE - Complete rewrite of DiceLiquidity.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import useDiceActor from '../../hooks/actors/useDiceActor';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import { DECIMALS_PER_CKUSDT, formatUSDT } from '../../types/balance';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HealthDashboard, DiceStatistics } from '../../components/game-specific/dice';
import { Principal } from '@dfinity/principal';

// Compact tooltip text
const LP_INFO_TOOLTIP = `Deposit USDT → Receive LP shares → Earn from 1% house edge.
Share price grows as players lose. Withdraw anytime (1% fee).`;

const DICE_BACKEND = 'whchi-hyaaa-aaaao-a4ruq-cai';

export function DiceLiquidity() {
  const { isAuthenticated, principal } = useAuth();
  const { actor } = useDiceActor();
  const { actor: ledgerActor } = useLedgerActor();

  // State
  const [poolStats, setPoolStats] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [depositAmount, setDepositAmount] = useState('10');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showHealth, setShowHealth] = useState(false);

  // Load pool stats (same logic as current DiceLiquidityPanel)
  useEffect(() => {
    // Fetch pool stats and position
    // 30s interval refresh
  }, [actor, isAuthenticated]);

  // Deposit handler (ICRC-2 approval flow - keep existing logic)
  const handleDeposit = async () => {
    // ... existing deposit logic from DiceLiquidityPanel
  };

  // Withdraw handler (keep existing logic)
  const handleWithdrawAll = async () => {
    // ... existing withdraw logic from DiceLiquidityPanel
  };

  const formatValue = (val) => (Number(val) / DECIMALS_PER_CKUSDT).toFixed(2);

  return (
    <div className="max-w-xl mx-auto px-4">
      {/* HERO SECTION - Pool Value Display (like the dice animation) */}
      <div className="text-center py-8">
        <div className="text-gray-500 text-xs uppercase tracking-widest mb-2">
          House Liquidity Pool
        </div>

        {/* Main metric - large and prominent */}
        <div className="text-5xl font-black text-white mb-1">
          ${poolStats ? formatValue(poolStats.pool_reserve) : '---'}
        </div>
        <div className="text-gray-500 text-sm">Total Pool Reserve</div>

        {/* Your position - secondary prominence */}
        {isAuthenticated && myPosition && Number(myPosition.shares) > 0 && (
          <div className="mt-4 p-3 bg-dfinity-turquoise/10 rounded-lg inline-block">
            <div className="text-dfinity-turquoise text-2xl font-bold">
              ${formatValue(myPosition.redeemable_icp)}
            </div>
            <div className="text-gray-400 text-xs">
              Your Position ({myPosition.pool_ownership_percent.toFixed(2)}% ownership)
            </div>
          </div>
        )}
      </div>

      {/* ACTION SECTION - Deposit/Withdraw (like the bet controls) */}
      <div className="bg-black/30 rounded-xl p-4 border border-gray-800/50 mb-4">
        {isAuthenticated ? (
          <div className="space-y-3">
            {/* Deposit row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono"
                  placeholder="10"
                  min="10"
                  disabled={isDepositing}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  USDT
                </span>
              </div>
              <button
                onClick={handleDeposit}
                disabled={isDepositing}
                className="px-6 py-3 bg-dfinity-turquoise hover:bg-dfinity-turquoise/80 rounded-lg font-bold text-black disabled:opacity-50 transition"
              >
                {isDepositing ? '...' : 'DEPOSIT'}
              </button>
            </div>

            {/* Withdraw button */}
            <button
              onClick={handleWithdrawAll}
              disabled={isWithdrawing || !myPosition || Number(myPosition.shares) === 0}
              className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg font-bold disabled:opacity-30 transition"
            >
              {isWithdrawing ? 'WITHDRAWING...' : 'WITHDRAW ALL'}
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-4">
            Please log in to become an owner
          </div>
        )}

        {/* Error/Success messages */}
        {error && (
          <div className="mt-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 p-2 bg-green-900/20 border border-green-500/30 rounded text-green-400 text-sm">
            {success}
          </div>
        )}
      </div>

      {/* STATS ROW - Compact single line (like Win Chance | Multiplier | Payout) */}
      <div className="flex justify-between items-center bg-black/20 rounded-lg p-3 border border-gray-800/50 mb-4">
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Share Price</span>
          <span className="text-purple-400 font-mono font-bold">
            ${poolStats ? (Number(poolStats.share_price) / DECIMALS_PER_CKUSDT).toFixed(4) : '---'}
          </span>
        </div>
        <div className="h-6 w-px bg-gray-800"></div>
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">LPs</span>
          <span className="text-blue-400 font-mono font-bold">
            {poolStats ? poolStats.total_liquidity_providers.toString() : '---'}
          </span>
        </div>
        <div className="h-6 w-px bg-gray-800"></div>
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">House Edge</span>
          <span className="text-green-400 font-mono font-bold">1%</span>
        </div>
        <div className="h-6 w-px bg-gray-800"></div>
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Withdraw Fee</span>
          <span className="text-yellow-400 font-mono font-bold">1%</span>
        </div>
        <InfoTooltip content={LP_INFO_TOOLTIP} />
      </div>

      {/* OPTIONAL SECTIONS - Expandable (moved from inline to buttons) */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowStats(!showStats)}
          className="flex-1 py-2 text-sm text-gray-400 hover:text-white bg-black/20 rounded-lg border border-gray-800/50 hover:border-gray-700 transition"
        >
          {showStats ? 'Hide' : 'View'} Performance
        </button>
        <button
          onClick={() => setShowHealth(!showHealth)}
          className="flex-1 py-2 text-sm text-gray-400 hover:text-white bg-black/20 rounded-lg border border-gray-800/50 hover:border-gray-700 transition"
        >
          {showHealth ? 'Hide' : 'System'} Health
        </button>
        <button
          onClick={() => setShowHowItWorks(true)}
          className="py-2 px-4 text-sm text-gray-500 hover:text-white"
          title="How it works"
        >
          ?
        </button>
      </div>

      {/* Expandable Statistics */}
      {showStats && <DiceStatistics />}

      {/* Expandable Health Dashboard */}
      {showHealth && <HealthDashboard inline={true} />}

      {/* Risk disclaimer - minimal */}
      <div className="text-center text-xs text-gray-600 mt-4">
        Risk: You can lose funds if players win big. Only invest what you can afford to lose.
      </div>

      {/* HOW IT WORKS MODAL */}
      {showHowItWorks && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
             onClick={() => setShowHowItWorks(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-700"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">How Liquidity Providing Works</h3>
              <button onClick={() => setShowHowItWorks(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>

            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <h4 className="font-bold text-green-400 mb-1">You Earn When</h4>
                <ul className="text-xs space-y-1">
                  <li>• Players lose bets (1% house edge)</li>
                  <li>• Share price increases as pool grows</li>
                  <li>• Other LPs withdraw (their 1% fee stays)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-red-400 mb-1">You Lose When</h4>
                <ul className="text-xs space-y-1">
                  <li>• Players win big payouts</li>
                  <li>• Share price decreases as pool shrinks</li>
                  <li>• You withdraw (1% fee deducted)</li>
                </ul>
              </div>

              <div className="pt-2 border-t border-gray-700">
                <h4 className="font-bold text-purple-400 mb-1">Share Math</h4>
                <p className="text-xs text-gray-400">
                  shares = (deposit × total_shares) / pool_reserve<br/>
                  Your USDT = (your_shares × pool_reserve) / total_shares
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Key Changes:**
1. Hero section with large pool value (centerpiece like dice)
2. Action controls immediately visible (not buried)
3. Single compact stats row (like game stats)
4. Educational content moved to modal (not inline walls of text)
5. Statistics and Health as optional expandable sections
6. Removed redundant "How It Works" and "Fee Structure" inline sections
7. Removed duplicate pool stats from DiceLiquidityPanel

---

### Section 2: Simplify DiceLiquidityPanel.tsx

**File:** `openhouse_frontend/src/components/game-specific/dice/DiceLiquidityPanel.tsx`
**Action:** DELETE or SIMPLIFY

Since all logic is now in DiceLiquidity.tsx, this component can be either:
- **Option A (Preferred):** Delete entirely and move hooks/logic to parent
- **Option B:** Keep as a presentational component that receives props

For cleaner architecture, **DELETE** this file and consolidate logic in DiceLiquidity.tsx.

```bash
# The new DiceLiquidity.tsx contains all the functionality
# This file becomes redundant
rm openhouse_frontend/src/components/game-specific/dice/DiceLiquidityPanel.tsx
```

Update the index export:
```typescript
// openhouse_frontend/src/components/game-specific/dice/index.ts
// Remove DiceLiquidityPanel from exports
export { HealthDashboard } from './HealthDashboard';
export { DiceStatistics } from './statistics/DiceStatistics';
// ... other exports
```

---

### Section 3: Modify HealthDashboard.tsx

**File:** `openhouse_frontend/src/components/game-specific/dice/HealthDashboard.tsx`
**Action:** ADD `inline` prop for embedded mode

```typescript
// PSEUDOCODE - Add inline prop to HealthDashboard

interface HealthDashboardProps {
  inline?: boolean; // When true, skip the toggle button wrapper
}

export const HealthDashboard: React.FC<HealthDashboardProps> = ({ inline = false }) => {
  // ... existing state and logic ...

  // If inline mode, auto-expand and hide toggle
  useEffect(() => {
    if (inline) {
      setShowHealthCheck(true);
    }
  }, [inline]);

  return (
    <div className={inline ? "" : "card p-4 mt-6 bg-gray-900/30 border border-gray-700"}>
      {/* Only show toggle button if not inline */}
      {!inline && (
        <button onClick={() => setShowHealthCheck(!showHealthCheck)} /* ... */ >
          {/* ... existing toggle button ... */}
        </button>
      )}

      {/* Rest of dashboard content (already conditional on showHealthCheck) */}
      {showHealthCheck && (
        // ... existing health dashboard content ...
      )}
    </div>
  );
};
```

---

### Section 4: Update Component Exports

**File:** `openhouse_frontend/src/components/game-specific/dice/index.ts`
**Action:** MODIFY

```typescript
// PSEUDOCODE - Updated exports

export { DiceAnimation, type DiceDirection } from './DiceAnimation';
export { DiceControls } from './DiceControls';
export { HealthDashboard } from './HealthDashboard';
export { DiceStatistics } from './statistics/DiceStatistics';
// REMOVED: export { DiceLiquidityPanel } from './DiceLiquidityPanel';
```

---

## Deployment Notes

**Affected Components:**
- Frontend only (no backend changes)

**Deploy Command:**
```bash
cd openhouse_frontend && npm run build && cd ..
./deploy.sh --frontend-only
```

**Verification:**
1. Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
2. Click "Become an Owner" tab
3. Verify clean, simplified layout
4. Test deposit flow (ICRC-2 approval)
5. Test withdraw flow
6. Verify "View Performance" expands statistics
7. Verify "System Health" expands health dashboard
8. Verify "?" opens educational modal

---

## Before/After Comparison

### Before (Current State)
```
+------------------------------------------+
| House Liquidity Pool  [?]                | <- Header
+------------------------------------------+
| How It Works                      [?]    | <- Education section (verbose)
| +----------------+  +----------------+   |
| | You Earn When  |  | You Lose When  |   |
| | • bullet       |  | • bullet       |   |
| | • bullet       |  | • bullet       |   |
| | • bullet       |  | • bullet       |   |
| +----------------+  +----------------+   |
+------------------------------------------+
| Fee Structure                     [?]    | <- Fee section (verbose)
| +--------------------------------------+ |
| | Withdrawal Fee        |     1%       | |
| | Fee Destination       | Parent Staker| |
| | House Edge           |     1%        | |
| +--------------------------------------+ |
| Bonus: If parent staker can't accept... | |
+------------------------------------------+
| [Show] Pool Performance                  | <- Statistics toggle
+------------------------------------------+
| House Liquidity Pool                     | <- DUPLICATE HEADER
| +-------------------+-------------------+|
| | Total Pool Reserve| Share Price      ||
| | $1,234 USDT      | $1.0023 USDT     ||
| +-------------------+-------------------+|
| | Total LPs        | Your Ownership    ||
| | 12               | 4.05%            ||
| +-------------------+-------------------+|
| Your Position                           ||
| Shares: 50000    Redeemable: $50.00    ||
| [____10____]        [Deposit LP]       ||
| [      Withdraw All Liquidity      ]   ||
| How it works: Deposit USDT to earn... ||
+------------------------------------------+
| [Show] System Health Check               | <- Health toggle
+------------------------------------------+
| Risk Warning: Liquidity providing...     | <- Disclaimer
+------------------------------------------+
```
**Problems:** 6+ sections, redundant data, buried actions, walls of text

### After (New Design)
```
+------------------------------------------+
|         House Liquidity Pool             |
|                                          |
|              $1,234.56                   | <- HERO (large, centered)
|          Total Pool Reserve              |
|                                          |
|     +----------------------------+       |
|     |         $50.00             |       | <- Your position (prominent)
|     |   4.05% ownership          |       |
|     +----------------------------+       |
+------------------------------------------+
| [____10____] USDT        [DEPOSIT]      | <- Actions (immediate)
| [         WITHDRAW ALL            ]      |
+------------------------------------------+
| Share | LPs | House Edge | Fee    [?]   | <- Compact stats row
| $1.00 | 12  |    1%     | 1%            |
+------------------------------------------+
| [View Performance]  [System Health]  [?] | <- Optional sections
+------------------------------------------+
|   Risk disclaimer (one line)             |
+------------------------------------------+
```
**Improvements:** Single focus, actions first, stats condensed, optional details

---

## Checklist

- [x] Worktree created first
- [x] Orchestrator header EMBEDDED at top of plan
- [x] Current state documented
- [x] Affected games/canisters identified (Frontend only)
- [x] Implementation in pseudocode
- [x] Deployment strategy noted (--frontend-only)
- [ ] Plan committed to feature branch (NEXT STEP)
- [ ] Handoff command provided with PR creation reminder (FINAL STEP)
