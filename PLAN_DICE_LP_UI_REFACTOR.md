# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-lp-ui"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-lp-ui`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice/liquidity"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice-ui): separate LP into dedicated route with tooltip

- Move House Liquidity Pool to /dice/liquidity route
- Add subtle 'Become an Owner' CTA in main game
- Add explanatory tooltip about LP mechanics and fees
- Implement nested routes with tab navigation
- Clean separation between game and LP views"

   git push -u origin feature/dice-lp-separate-route
   gh pr create --title "feat(dice-ui): Separate liquidity pool into dedicated route" --body "Implements PLAN_DICE_LP_UI_REFACTOR.md

## Changes
- Created nested routes for dice game (/dice, /dice/liquidity)
- Moved House Liquidity Pool to dedicated page
- Added 'Become an Owner' call-to-action in game view
- Added tooltip explaining LP mechanics and fee structure
- Improved UX with tab navigation

## Testing
Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Test routes: /dice (game) and /dice/liquidity (LP)
- Affected canister: pezw3-laaaa-aaaal-qssoa-cai"
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

**Branch:** `feature/dice-lp-separate-route`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-lp-ui`

---

# Implementation Plan: Dice LP UI Refactoring

## Task Classification
**REFACTORING** - Improve existing code by reorganizing UI structure

## Current State

### File Structure
```
openhouse_frontend/src/
├── App.tsx                              # Flat routing (line 28: /dice route)
├── pages/
│   └── Dice.tsx                         # All-in-one game page (514 lines)
│                                        # Line 324: renders <DiceLiquidityPanel />
└── components/
    └── game-specific/dice/
        ├── DiceAccountingPanel.tsx      # Player deposit/withdrawal
        ├── DiceLiquidityPanel.tsx       # LP UI (275 lines) - TO BE MOVED
        ├── DiceControls.tsx             # Target slider, Over/Under buttons
        ├── DiceAnimation.tsx            # Dice roll animation
        └── index.ts                     # Barrel exports
```

### Current User Flow
1. Navigate to `/dice`
2. See all components in single view:
   - Accounting panel (deposits/withdrawals)
   - **Liquidity pool panel** ← ALWAYS VISIBLE
   - Game controls
   - Animation
   - History

### Problem
- LP panel clutters main game interface
- No clear distinction between "play" and "invest" actions
- Valuable screen real estate used for minority feature

## Liquidity Pool Mechanics (For Tooltip Documentation)

### How It Works
1. **Deposit**: LPs deposit ckUSDT, receive shares proportional to deposit
2. **Share Price**: `pool_reserve / total_shares` (starts at 1 ckUSDT)
3. **Earnings**: When players lose, bet → pool reserve (share price ↑)
4. **Losses**: When players win, payout ← pool reserve (share price ↓)
5. **Withdraw**: Burn shares, receive proportional ckUSDT minus 1% fee

### Fee Structure
- **Withdrawal Fee**: 1% of withdrawn amount
- **Fee Destination**: Parent staker canister (`e454q-riaaa-aaaap-qqcyq-cai`)
- **Fallback**: If parent busy, fee returns to pool (bonus for remaining LPs)
- **House Edge**: 1% from game losses accumulates in pool

### Key Constants (from backend)
```rust
MIN_DEPOSIT: 1 ckUSDT (1_000_000 decimals)
MIN_WITHDRAWAL: 1 ckUSDT (1_000_000 decimals)
LP_WITHDRAWAL_FEE_BPS: 100 (1%)
MIN_OPERATING_BALANCE: 100 ckUSDT (pool won't accept bets below this)
```

## Implementation Plan

### Phase 1: Create Nested Route Structure

#### File: `openhouse_frontend/src/App.tsx` (MODIFY)
**Current (lines 28):**
```typescript
<Route path="/dice" element={<Dice />} />
```

**New (PSEUDOCODE):**
```typescript
// Import Outlet for nested routes
import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';

// Import new components
import { DiceLayout } from './pages/dice/DiceLayout';
import { DiceGame } from './pages/dice/DiceGame';
import { DiceLiquidity } from './pages/dice/DiceLiquidity';

// In Routes section, replace single dice route with nested structure:
<Route path="/dice" element={<DiceLayout />}>
  <Route index element={<DiceGame />} />
  <Route path="liquidity" element={<DiceLiquidity />} />
</Route>
```

### Phase 2: Create Directory Structure

#### New Directory: `openhouse_frontend/src/pages/dice/`
Create new directory to house dice-specific pages

#### File: `openhouse_frontend/src/pages/dice/index.ts` (NEW)
```typescript
// PSEUDOCODE - Barrel exports for dice pages
export { DiceLayout } from './DiceLayout';
export { DiceGame } from './DiceGame';
export { DiceLiquidity } from './DiceLiquidity';
```

### Phase 3: Create Layout Component with Tabs

#### File: `openhouse_frontend/src/pages/dice/DiceLayout.tsx` (NEW)
```typescript
// PSEUDOCODE
import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

export function DiceLayout() {
  const location = useLocation();
  const isLiquidityRoute = location.pathname.includes('/liquidity');

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6 border-b border-gray-700">
        <Link
          to="/dice"
          className={`tab ${!isLiquidityRoute ? 'active' : ''}`}
        >
          🎲 Play Game
        </Link>
        <Link
          to="/dice/liquidity"
          className={`tab ${isLiquidityRoute ? 'active' : ''}`}
        >
          💰 Become an Owner
        </Link>
      </div>

      {/* Render child route (DiceGame or DiceLiquidity) */}
      <Outlet />
    </div>
  );
}

// Tab styles (use existing TailwindCSS patterns):
// - Active tab: border-b-2 border-dfinity-turquoise text-white
// - Inactive tab: text-gray-400 hover:text-gray-300
```

### Phase 4: Extract Game View

#### File: `openhouse_frontend/src/pages/dice/DiceGame.tsx` (NEW - extracted from Dice.tsx)
```typescript
// PSEUDOCODE - This is the SAME as current Dice.tsx but:
// 1. Renamed from Dice to DiceGame
// 2. REMOVE line 324: <DiceLiquidityPanel />
// 3. ADD subtle "Become an Owner" CTA after DiceAccountingPanel

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
// ... all existing imports from Dice.tsx

export function DiceGame() {
  // ... COPY ALL STATE AND LOGIC from current Dice.tsx (lines 1-514)
  // ... EXCEPT remove DiceLiquidityPanel import and rendering

  return (
    <div>
      {/* Game Title */}
      <h1>Dice Game</h1>

      {/* Accounting Panel */}
      <DiceAccountingPanel />

      {/* NEW: Subtle CTA to LP section */}
      <div className="card max-w-2xl mx-auto p-3 mb-4 bg-purple-900/10 border-purple-500/20 hover:bg-purple-900/20 transition-colors">
        <Link to="/dice/liquidity" className="flex items-center justify-between group">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-purple-300">
                Become an Owner
              </p>
              <p className="text-xs text-gray-400">
                Earn from house profits • 1% withdrawal fee
              </p>
            </div>
          </div>
          <span className="text-dfinity-turquoise group-hover:translate-x-1 transition-transform">
            →
          </span>
        </Link>
      </div>

      {/* Game Controls */}
      <DiceControls ... />

      {/* Animation */}
      <DiceAnimation ... />

      {/* History */}
      <GameHistory ... />

      {/* Stats */}
      <GameStats ... />
    </div>
  );
}
```

### Phase 5: Create Dedicated LP Page

#### File: `openhouse_frontend/src/pages/dice/DiceLiquidity.tsx` (NEW)
```typescript
// PSEUDOCODE
import React from 'react';
import { DiceLiquidityPanel } from '../../components/game-specific/dice';
import { InfoTooltip } from '../../components/InfoTooltip'; // We'll create this

export function DiceLiquidity() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Page Header with Tooltip */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">House Liquidity Pool</h1>
          <InfoTooltip content={LP_INFO_TEXT} />
        </div>
        <p className="text-gray-400 text-sm">
          Become a house owner and earn from player losses
        </p>
      </div>

      {/* Educational Section */}
      <div className="card p-4 mb-6 bg-blue-900/10 border-blue-500/20">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          📊 How It Works
          <InfoTooltip content={HOW_IT_WORKS_DETAILS} />
        </h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-bold text-green-400 mb-1">✅ You Earn When</h3>
            <ul className="text-gray-300 space-y-1 text-xs">
              <li>• Players lose their bets (1% house edge)</li>
              <li>• Share price increases as pool grows</li>
              <li>• Other LPs withdraw (1% fee stays in pool)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-red-400 mb-1">⚠️ You Lose When</h3>
            <ul className="text-gray-300 space-y-1 text-xs">
              <li>• Players win big payouts</li>
              <li>• Share price decreases as pool shrinks</li>
              <li>• You withdraw (1% fee deducted)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Fee Breakdown Card */}
      <div className="card p-4 mb-6 bg-purple-900/10 border-purple-500/20">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          💸 Fee Structure
          <InfoTooltip content={FEE_DETAILS} />
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded">
            <span className="text-gray-300">Withdrawal Fee</span>
            <span className="font-bold text-yellow-400">1% of amount</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded">
            <span className="text-gray-300">Fee Destination</span>
            <span className="font-mono text-xs text-gray-400">Parent Staker</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded">
            <span className="text-gray-300">House Edge (Games)</span>
            <span className="font-bold text-green-400">1%</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 p-2 bg-gray-800/30 rounded">
          💡 <strong>Bonus:</strong> If the parent staker can't accept fees (busy),
          they return to the pool as a bonus for remaining LPs!
        </p>
      </div>

      {/* Main LP Panel */}
      <DiceLiquidityPanel />

      {/* Risk Disclaimer */}
      <div className="card p-3 mt-6 bg-yellow-900/10 border-yellow-500/20">
        <p className="text-xs text-yellow-200">
          ⚠️ <strong>Risk Warning:</strong> Liquidity providing carries risk.
          You can lose funds if players have a lucky streak. Only invest what you can afford to lose.
        </p>
      </div>
    </div>
  );
}

// Tooltip content constants
const LP_INFO_TEXT = `
Liquidity Pool Mechanics:
• Deposit ckUSDT to receive LP shares
• Share price = Total Reserve / Total Shares
• Earn as players lose (1% house edge)
• Withdraw anytime (1% fee applies)
• Minimum deposit: 1 ckUSDT
• Minimum withdrawal: 1 ckUSDT
`;

const HOW_IT_WORKS_DETAILS = `
Share Price Calculation:
1. Initial deposit: 1 share = 1 ckUSDT
2. Subsequent: shares = (deposit × total_shares) / pool_reserve
3. Redemption: ckUSDT = (your_shares × pool_reserve) / total_shares

When You Profit:
• Player loses 10 ckUSDT bet → +10 ckUSDT to pool → share price ↑
• 1% house edge ensures long-term profitability

When You Lose:
• Player wins 100 ckUSDT → -100 ckUSDT from pool → share price ↓
`;

const FEE_DETAILS = `
Withdrawal Fee Breakdown:
• Fee: 1% of withdrawal amount (100 basis points)
• Example: Withdraw 10 ckUSDT → 0.1 ckUSDT fee, receive 9.9 ckUSDT
• Fee goes to: Parent staker canister (e454q-riaaa-aaaap-qqcyq-cai)
• Fallback: If parent busy, fee returns to pool (you benefit!)

House Edge Flow:
• Dice game has 1% house edge
• Player bets 100 ckUSDT, loses → 100 ckUSDT to pool
• Expected long-term: +1 ckUSDT per 100 ckUSDT wagered
`;
```

### Phase 6: Create InfoTooltip Component

#### File: `openhouse_frontend/src/components/InfoTooltip.tsx` (NEW)
```typescript
// PSEUDOCODE
import React, { useState } from 'react';

interface InfoTooltipProps {
  content: string;
}

export function InfoTooltip({ content }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="text-gray-400 hover:text-gray-300 cursor-help"
        type="button"
      >
        ⓘ
      </button>

      {isVisible && (
        <div className="absolute z-50 left-0 top-6 w-64 p-3 bg-gray-900 border border-gray-700 rounded shadow-lg text-xs text-gray-300 whitespace-pre-line">
          {content}
          <div className="absolute -top-1 left-2 w-2 h-2 bg-gray-900 border-l border-t border-gray-700 transform rotate-45" />
        </div>
      )}
    </div>
  );
}
```

### Phase 7: Update Original Dice.tsx

#### File: `openhouse_frontend/src/pages/Dice.tsx` (MODIFY)
```typescript
// PSEUDOCODE - Replace entire file with re-export
export { DiceGame as Dice } from './dice/DiceGame';

// This maintains backward compatibility if anything imports Dice directly
// But the main route will use DiceLayout → DiceGame via nested routes
```

### Phase 8: Update Component Exports

#### File: `openhouse_frontend/src/components/index.ts` (MODIFY - if exists)
```typescript
// PSEUDOCODE - Add InfoTooltip export
export { InfoTooltip } from './InfoTooltip';
```

## File Change Summary

### New Files (7)
1. `openhouse_frontend/src/pages/dice/index.ts` - Barrel exports
2. `openhouse_frontend/src/pages/dice/DiceLayout.tsx` - Tab navigation wrapper
3. `openhouse_frontend/src/pages/dice/DiceGame.tsx` - Extracted game view
4. `openhouse_frontend/src/pages/dice/DiceLiquidity.tsx` - Dedicated LP page
5. `openhouse_frontend/src/components/InfoTooltip.tsx` - Tooltip component

### Modified Files (2)
1. `openhouse_frontend/src/App.tsx` - Update routing to nested structure
2. `openhouse_frontend/src/pages/Dice.tsx` - Convert to re-export

### Unchanged Components
- `DiceLiquidityPanel.tsx` - NO CHANGES (just rendered in new location)
- `DiceAccountingPanel.tsx` - NO CHANGES
- `DiceControls.tsx` - NO CHANGES
- `DiceAnimation.tsx` - NO CHANGES

## Testing Checklist

### Manual Testing (Mainnet)
- [ ] Navigate to https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
- [ ] Verify game works (place bet, see animation, view history)
- [ ] Click "Become an Owner" CTA → should navigate to /dice/liquidity
- [ ] Verify LP panel works (deposit, withdraw, see stats)
- [ ] Click "Play Game" tab → should return to /dice
- [ ] Hover over ⓘ tooltips → verify content displays
- [ ] Test browser back/forward buttons
- [ ] Verify all context providers still work (Auth, Balance, GameBalance)

### Visual Checks
- [ ] Tabs highlight correctly based on current route
- [ ] "Become an Owner" CTA is subtle but visible
- [ ] LP page has clear educational content
- [ ] Tooltips are readable and positioned correctly
- [ ] Mobile responsive (tabs stack properly)

## Deployment Notes

**Affected Canister:** `pezw3-laaaa-aaaal-qssoa-cai` (Frontend only)

**Deployment Command:**
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

**No Backend Changes** - This is purely a frontend UI refactoring

## Rollback Plan

If routing breaks:
1. Revert `App.tsx` to flat routing
2. Revert `Dice.tsx` to include `<DiceLiquidityPanel />`
3. Delete new `pages/dice/` directory
4. Redeploy frontend

## Success Metrics

- LP section no longer clutters main game view
- Clear separation between "play" and "invest" actions
- Educational content helps users understand LP mechanics
- Tooltip provides detailed fee structure explanation
- Navigation feels natural (tabs + browser back/forward)

---

**End of Plan**
