# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-lp-stats"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-lp-stats`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm install recharts
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```
4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   echo "Navigate to 'Become an Owner' tab and expand statistics section"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: Add statistics graphs to LP dashboard"
   git push -u origin feature/lp-statistics-graphs
   gh pr create --title "feat: Add Statistics Graphs to LP Dashboard" --body "$(cat <<'EOF'
## Summary
Adds interactive charts to the Dice 'Become an Owner' LP dashboard showing historical pool performance.

### Features
- Share Price trend (line chart) - most important metric for LPs
- Pool Reserve over time (line chart)
- Daily Volume (bar chart)
- Daily Profit/Loss (bar chart, green/red)
- APY display (7-day and 30-day)
- Period selector: 7d / 30d / 90d
- Collapsible section (collapsed by default)

### Technical
- Uses recharts library for charts
- Fetches data via existing `get_daily_stats` and `get_pool_apy` endpoints
- Follows HealthDashboard collapsible pattern
- DFINITY brand colors for consistency

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
EOF
)"
   ```
6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
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

**Branch:** `feature/lp-statistics-graphs`
**Worktree:** `/home/theseus/alexandria/openhouse-lp-stats`

---

# Implementation Plan: LP Statistics Graphs

## Overview
Add interactive charts to the Dice "Become an Owner" LP dashboard showing historical pool performance using recharts library.

## User Decisions
- **Default state**: Collapsed (consistent with HealthDashboard)
- **Charting library**: recharts
- **Time periods**: 7d / 30d / 90d

---

## Current State

### Backend (Already Complete)
The `dice_backend` canister already has these endpoints:
- `get_daily_stats(limit: nat32) -> Vec<DailySnapshot>` - Last N daily snapshots
- `get_pool_apy(days: opt nat32) -> ApyInfo` - APY calculation

**DailySnapshot type** (already in declarations):
```typescript
interface DailySnapshot {
  day_timestamp: bigint;      // Midnight timestamp (nanoseconds)
  pool_reserve_end: bigint;   // Pool reserve (6 decimals)
  daily_pool_profit: bigint;  // Profit/loss - SIGNED
  daily_volume: bigint;       // Total wagered
  share_price: bigint;        // Pool reserve / total shares (6 decimals)
}
```

**ApyInfo type** (already in declarations):
```typescript
interface ApyInfo {
  actual_apy_percent: number;
  expected_apy_percent: number;
  days_calculated: number;
  total_volume: bigint;
  total_profit: bigint;
}
```

### Frontend Structure
```
openhouse_frontend/src/
├── pages/dice/
│   └── DiceLiquidity.tsx          # Main LP page - ADD import here
├── components/game-specific/dice/
│   ├── DiceLiquidityPanel.tsx     # Deposit/withdraw UI
│   ├── HealthDashboard.tsx        # Collapsible pattern reference
│   └── index.ts                   # Barrel exports - ADD export here
└── hooks/actors/
    └── useDiceActor.ts            # Actor hook - already works
```

---

## Implementation

### Step 1: Install recharts
```bash
cd openhouse_frontend
npm install recharts
```

### Step 2: Create DiceStatisticsSection.tsx

**File:** `openhouse_frontend/src/components/game-specific/dice/DiceStatisticsSection.tsx`

```typescript
// PSEUDOCODE - Full component structure

import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import useDiceActor from '../../../hooks/actors/useDiceActor';
import type { DailySnapshot, ApyInfo } from '../../../declarations/dice_backend/dice_backend.did';

// DFINITY brand colors
const COLORS = {
  primary: '#29ABE2',    // Turquoise
  positive: '#00E19B',   // Green
  negative: '#ED0047',   // Red
  grid: 'rgba(255,255,255,0.1)',
  text: '#E6E6E6',
};

// Period options
type Period = 7 | 30 | 90;

// Transform bigint data for charts
const transformData = (snapshots: DailySnapshot[]) => {
  return [...snapshots].reverse().map(s => ({
    date: new Date(Number(s.day_timestamp) / 1_000_000),
    dateLabel: new Date(Number(s.day_timestamp) / 1_000_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    poolReserve: Number(s.pool_reserve_end) / 1_000_000,
    volume: Number(s.daily_volume) / 1_000_000,
    profit: Number(s.daily_pool_profit) / 1_000_000,
    sharePrice: Number(s.share_price) / 1_000_000,
  }));
};

export const DiceStatisticsSection: React.FC = () => {
  // State
  const [isExpanded, setIsExpanded] = useState(false);
  const [period, setPeriod] = useState<Period>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [apy7, setApy7] = useState<ApyInfo | null>(null);
  const [apy30, setApy30] = useState<ApyInfo | null>(null);

  const { actor } = useDiceActor();

  // Fetch data when expanded or period changes
  useEffect(() => {
    if (!isExpanded || !actor) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [stats, apy7Result, apy30Result] = await Promise.all([
          actor.get_daily_stats(period),
          actor.get_pool_apy([7]),
          actor.get_pool_apy([30]),
        ]);
        setSnapshots(stats);
        setApy7(apy7Result);
        setApy30(apy30Result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statistics');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isExpanded, period, actor]);

  const chartData = transformData(snapshots);
  const hasData = chartData.length >= 3;

  // Render component
  return (
    <div className="card p-4 mt-6 bg-gray-900/30 border border-gray-700">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600/80 hover:bg-cyan-600 rounded text-white font-mono transition-colors"
      >
        <span>📈</span>
        <span>{isExpanded ? 'Hide' : 'Show'} Pool Statistics</span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Period Selector */}
          <div className="flex gap-2 justify-center">
            {([7, 30, 90] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded font-mono text-sm transition-colors ${
                  period === p
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {p}d
              </button>
            ))}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center text-gray-400 py-8">Loading statistics...</div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center text-red-400 py-4">{error}</div>
          )}

          {/* Empty State */}
          {!isLoading && !error && !hasData && (
            <div className="text-center text-gray-400 py-8">
              Collecting data... Statistics will appear after a few days of pool activity.
            </div>
          )}

          {/* APY Display */}
          {!isLoading && !error && hasData && apy7 && apy30 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">7-Day APY</div>
                <div className={`text-xl font-mono ${apy7.actual_apy_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {apy7.actual_apy_percent >= 0 ? '+' : ''}{apy7.actual_apy_percent.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500">
                  Expected: {apy7.expected_apy_percent.toFixed(2)}%
                </div>
              </div>
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">30-Day APY</div>
                <div className={`text-xl font-mono ${apy30.actual_apy_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {apy30.actual_apy_percent >= 0 ? '+' : ''}{apy30.actual_apy_percent.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500">
                  Expected: {apy30.expected_apy_percent.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          {/* Charts Grid */}
          {!isLoading && !error && hasData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Share Price Chart - Hero metric */}
              <div className="bg-gray-800/50 rounded p-3 md:col-span-2">
                <div className="text-xs text-gray-400 mb-2">Share Price (USDT)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="dateLabel" tick={{ fill: COLORS.text, fontSize: 10 }} />
                    <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: '#1f2937', border: 'none' }}
                      labelStyle={{ color: COLORS.text }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sharePrice"
                      stroke={COLORS.primary}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Pool Reserve Chart */}
              <div className="bg-gray-800/50 rounded p-3">
                <div className="text-xs text-gray-400 mb-2">Pool Reserve (USDT)</div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="dateLabel" tick={{ fill: COLORS.text, fontSize: 10 }} />
                    <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1f2937', border: 'none' }} />
                    <Line type="monotone" dataKey="poolReserve" stroke={COLORS.primary} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Daily Volume Chart */}
              <div className="bg-gray-800/50 rounded p-3">
                <div className="text-xs text-gray-400 mb-2">Daily Volume (USDT)</div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="dateLabel" tick={{ fill: COLORS.text, fontSize: 10 }} />
                    <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1f2937', border: 'none' }} />
                    <Bar dataKey="volume" fill={COLORS.primary} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Daily Profit/Loss Chart */}
              <div className="bg-gray-800/50 rounded p-3 md:col-span-2">
                <div className="text-xs text-gray-400 mb-2">Daily Profit/Loss (USDT)</div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="dateLabel" tick={{ fill: COLORS.text, fontSize: 10 }} />
                    <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1f2937', border: 'none' }} />
                    <Bar dataKey="profit">
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.profit >= 0 ? COLORS.positive : COLORS.negative} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiceStatisticsSection;
```

### Step 3: Update barrel export

**File:** `openhouse_frontend/src/components/game-specific/dice/index.ts`

Add export:
```typescript
export { DiceStatisticsSection } from './DiceStatisticsSection';
```

### Step 4: Integrate into DiceLiquidity page

**File:** `openhouse_frontend/src/pages/dice/DiceLiquidity.tsx`

1. Add import at top:
```typescript
import { DiceLiquidityPanel, HealthDashboard, DiceStatisticsSection } from '../../components/game-specific/dice';
```

2. Add component after Fee Structure section, before DiceLiquidityPanel:
```tsx
{/* Fee Structure Card */}
<div className="card p-4 border-dfinity-purple/30 bg-dfinity-purple/5">
  ...
</div>

{/* NEW: Statistics Section */}
<DiceStatisticsSection />

{/* Main LP Panel */}
<DiceLiquidityPanel />
```

---

## Files to Modify

| File | Action |
|------|--------|
| `openhouse_frontend/package.json` | Add recharts dependency (via npm install) |
| `openhouse_frontend/src/components/game-specific/dice/DiceStatisticsSection.tsx` | CREATE |
| `openhouse_frontend/src/components/game-specific/dice/index.ts` | ADD export |
| `openhouse_frontend/src/pages/dice/DiceLiquidity.tsx` | ADD import and component |

## Files to Reference

| File | Purpose |
|------|---------|
| `openhouse_frontend/src/components/game-specific/dice/HealthDashboard.tsx` | Collapsible pattern |
| `openhouse_frontend/src/declarations/dice_backend/dice_backend.did.d.ts` | TypeScript types |
| `openhouse_frontend/src/hooks/actors/useDiceActor.ts` | Actor hook usage |
| `openhouse_frontend/tailwind.config.js` | DFINITY color definitions |

---

## Deployment

```bash
cd /home/theseus/alexandria/openhouse-lp-stats
cd openhouse_frontend
npm install recharts
npm run build
cd ..
./deploy.sh --frontend-only
```

Test at: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
Navigate to "Become an Owner" tab and expand the statistics section.

---

## Success Criteria

1. Charts render correctly with real data from canister
2. Period selector switches between 7d/30d/90d views
3. APY displayed prominently with color coding (green/red)
4. Share price chart is visually prominent (spans full width)
5. Mobile responsive (charts stack vertically)
6. Empty state handled gracefully (< 3 days of data)
7. Collapsed by default, expands on click
