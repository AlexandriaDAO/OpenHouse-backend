# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-liquidity-metrics"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-liquidity-metrics`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend && npm run build && cd ..
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix(frontend): show accurate house profit from share price changes"
   git push -u origin feature/accurate-liquidity-metrics
   gh pr create --title "Fix: Accurate House Profit & APY Metrics" --body "$(cat <<'EOF'
## Summary
Fixes misleading liquidity pool metrics that were showing reserve changes (including deposits/withdrawals) as "profit."

**The Problem:**
- "Daily Profit/Loss" chart showed reserve changes, not actual house performance
- A day could show +500 USDT "profit" when the house actually lost money (masked by LP deposits)
- APY calculations were inflated by deposit activity

**The Fix:**
- Calculate true house profit from share price changes (share price only moves from game outcomes)
- Rename misleading metrics to be accurate
- Add proper tooltips explaining what each metric means

**User Impact:**
- LPs now see accurate performance data
- No more confusion when profit shows green but share price drops

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
EOF
)"
   ```

6. **Iterate autonomously** - Check for review feedback

## CRITICAL RULES
- NO questions ("should I?", "want me to?")
- NO skipping PR creation - it's MANDATORY
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/accurate-liquidity-metrics`
**Worktree:** `/home/theseus/alexandria/openhouse-liquidity-metrics`

---

# Implementation Plan: Accurate Liquidity Pool Metrics

## Problem Statement

The liquidity pool statistics are **misleading users**:

| What Users See | What It Actually Shows | What Users Think It Means |
|----------------|------------------------|---------------------------|
| "Daily Profit: +564 USDT" | Reserve change (games + deposits - withdrawals) | House won 564 USDT |
| "APY: 74,674%" | Based on reserve changes | Incredible returns! |
| Share Price dropped 40% | True house performance | (Often ignored) |

**Real Example from Dec 3:**
- Chart showed: **+564 USDT profit** (green bar)
- Reality: House **lost ~1,123 USDT** (share price dropped 40%)
- Why: A large LP deposit (~1,687 USDT) masked the losses

## The Solution

**Share price is the true profit indicator** because:
- Deposits/withdrawals do NOT change share price (you get proportional shares)
- Only game wins/losses change share price
- Share price up = house won, Share price down = house lost

We will:
1. Calculate **true house profit** from share price changes
2. Rename the misleading "profit" field to "Net Flow" (what it actually is)
3. Calculate **accurate APY** from share price returns
4. Add clear tooltips explaining each metric

---

## Current State

### Files to Modify

| File | Purpose |
|------|---------|
| `openhouse_frontend/src/types/liquidity.ts` | Add new fields to ChartDataPoint |
| `openhouse_frontend/src/hooks/liquidity/useStatsData.ts` | Calculate true profit from share price |
| `openhouse_frontend/src/components/statistics/StatsCharts.tsx` | Update chart labels and add House P&L chart |
| `openhouse_frontend/src/components/statistics/ApyCard.tsx` | Show share-price-based APY |
| `openhouse_frontend/src/components/statistics/GameStatistics.tsx` | Update chart layout |
| `openhouse_frontend/src/components/game-specific/dice/statistics/useStatsData.ts` | Same fix for dice-specific hook |

---

## Implementation

### Step 1: Update Types (`types/liquidity.ts`)

```typescript
// PSEUDOCODE - Update ChartDataPoint interface
export interface ChartDataPoint {
  date: Date;
  dateLabel: string;
  poolReserve: number;
  volume: number;

  // RENAMED: This is reserve change, NOT profit
  netFlow: number;  // Was: profit

  // NEW: True house profit from share price change
  houseProfit: number;
  houseProfitPercent: number;  // For APY calculation

  sharePrice: number;
  sharePriceChange: number;  // NEW: Absolute change
  sharePriceChangePercent: number;  // NEW: Percentage change
}
```

### Step 2: Calculate True Profit (`hooks/liquidity/useStatsData.ts`)

```typescript
// PSEUDOCODE - Transform snapshots to chart data
const chartData = useMemo((): ChartDataPoint[] => {
  if (!snapshots || snapshots.length === 0) return [];

  return snapshots.map((s, index) => {
    // ... existing date/currency conversions ...

    // Get previous day's share price (or current if first day)
    const prevSnapshot = index > 0 ? snapshots[index - 1] : s;
    const prevSharePrice = /* convert prevSnapshot.share_price */;
    const currentSharePrice = /* convert s.share_price */;

    // Calculate share price change
    const sharePriceChange = currentSharePrice - prevSharePrice;
    const sharePriceChangePercent = prevSharePrice > 0
      ? (sharePriceChange / prevSharePrice) * 100
      : 0;

    // Calculate true house profit
    // Method: share_price_change * estimated_shares
    // Shares = pool_reserve / share_price
    const estimatedShares = currentSharePrice > 0
      ? poolReserve / currentSharePrice
      : 0;
    const houseProfit = sharePriceChange * estimatedShares;

    return {
      date,
      dateLabel,
      poolReserve,
      volume,
      netFlow: Number(s.daily_pool_profit) / currencyDecimals,  // RENAMED
      houseProfit,
      houseProfitPercent: sharePriceChangePercent,
      sharePrice: currentSharePrice,
      sharePriceChange,
      sharePriceChangePercent,
    };
  });
}, [snapshots]);

// NEW: Calculate accurate APY from share price returns
const accurateApy = useMemo(() => {
  if (chartData.length < 2) return { apy7: 0, apy30: 0 };

  // 7-day APY
  const days7 = Math.min(7, chartData.length);
  const startIdx7 = chartData.length - days7;
  const startPrice7 = chartData[startIdx7]?.sharePrice || 0;
  const endPrice = chartData[chartData.length - 1]?.sharePrice || 0;
  const return7 = startPrice7 > 0 ? (endPrice - startPrice7) / startPrice7 : 0;
  const apy7 = return7 * (365 / days7) * 100;

  // 30-day APY (similar calculation)
  const days30 = Math.min(30, chartData.length);
  const startIdx30 = chartData.length - days30;
  const startPrice30 = chartData[startIdx30]?.sharePrice || 0;
  const return30 = startPrice30 > 0 ? (endPrice - startPrice30) / startPrice30 : 0;
  const apy30 = return30 * (365 / days30) * 100;

  return { apy7, apy30 };
}, [chartData]);

// Return both backend APY (for reference) and accurate APY
return {
  // ... existing returns ...
  backendApy7: apy7,   // Keep for debugging/comparison
  backendApy30: apy30,
  accurateApy,         // NEW: Use this for display
};
```

### Step 3: Update Charts (`components/statistics/StatsCharts.tsx`)

```typescript
// PSEUDOCODE - Rename ProfitLossChart to NetFlowChart
export const NetFlowChart: React.FC<ChartProps> = ({ data, height = 160 }) => (
  <div className="...">
    <div className="flex items-center gap-2">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        Daily Net Flow
      </div>
      <InfoTooltip
        variant="badge"
        content="Net Flow = Pool Reserve Change

This shows how much the pool's total reserves changed each day.

INCLUDES:
+ LP deposits (new liquidity added)
+ House wins (players lost bets)
- LP withdrawals (liquidity removed)
- House losses (players won bets)

NOTE: This is NOT the same as house profit!
For actual house performance, see the Share Price chart."
      />
    </div>
    {/* Bar chart using netFlow field */}
  </div>
);

// NEW: True House Profit Chart
export const HouseProfitChart: React.FC<ChartProps> = ({ data, height = 160 }) => (
  <div className="...">
    <div className="flex items-center gap-2">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        House Profit/Loss
      </div>
      <InfoTooltip
        variant="badge"
        content="True House Performance

Calculated from share price changes.

Share price ONLY changes from game outcomes:
- Players lose bet = share price UP = house profit
- Players win bet = share price DOWN = house loss

LP deposits and withdrawals do NOT affect share price, so this shows pure gambling performance."
      />
    </div>
    {/* Bar chart using houseProfit field */}
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        {/* ... axes config ... */}
        <Bar dataKey="houseProfit" name="House P&L" radius={[2, 2, 2, 2]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.houseProfit >= 0 ? COLORS.positive : COLORS.negative}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);
```

### Step 4: Update APY Display (`components/statistics/ApyCard.tsx`)

```typescript
// PSEUDOCODE - Show accurate APY with explanation
interface ApyCardProps {
  label: string;
  accurateApy: number;      // From share price returns
  backendApy?: ApyInfo;     // Original (for comparison/debugging)
  showComparison?: boolean; // Show both for transparency
}

export const ApyCard: React.FC<ApyCardProps> = ({
  label,
  accurateApy,
  backendApy,
  showComparison = false
}) => {
  const isPositive = accurateApy >= 0;

  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-4">
      <div className="flex items-center gap-2 justify-center mb-1">
        <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
        <InfoTooltip
          variant="badge"
          content="APY calculated from share price returns.

This shows your annualized return as a liquidity provider, based on how the share price has changed over the period.

Formula: (Price Change %) × (365 / Days) × 100

This is the TRUE return you would have earned as an LP."
        />
      </div>
      <div className={`text-2xl font-mono font-bold ${isPositive ? 'text-dfinity-green' : 'text-dfinity-red'}`}>
        {isPositive ? '+' : ''}{accurateApy.toFixed(2)}%
      </div>

      {/* Optional: Show expected APY based on 1% house edge */}
      {backendApy && (
        <div className="text-[10px] text-gray-600 mt-1">
          Expected (1% edge): {backendApy.expected_apy_percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
};
```

### Step 5: Update Layout (`components/statistics/GameStatistics.tsx`)

```typescript
// PSEUDOCODE - Updated chart layout
return (
  <div className="p-4 space-y-6">
    {/* Period selector - unchanged */}

    {/* APY Cards - now using accurate APY */}
    <div className="grid grid-cols-2 gap-4">
      <ApyCard
        label="7-Day APY"
        accurateApy={accurateApy.apy7}
        backendApy={apy7}
      />
      <ApyCard
        label="30-Day APY"
        accurateApy={accurateApy.apy30}
        backendApy={apy30}
      />
    </div>

    {/* Charts */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Share Price - PRIMARY (shows true performance) */}
      <div className="md:col-span-2">
        <SharePriceChart data={chartData} height={250} />
      </div>

      {/* House Profit - NEW (derived from share price) */}
      <div className="md:col-span-2">
        <HouseProfitChart data={chartData} height={180} />
      </div>

      {/* Supporting metrics */}
      <PoolReserveChart data={chartData} />
      <VolumeChart data={chartData} />

      {/* Net Flow - RENAMED (was "Profit/Loss") */}
      <div className="md:col-span-2">
        <NetFlowChart data={chartData} height={160} />
      </div>
    </div>
  </div>
);
```

### Step 6: Apply Same Fix to Dice-Specific Hook

Apply the same changes to `openhouse_frontend/src/components/game-specific/dice/statistics/useStatsData.ts` since it has a duplicate implementation.

---

## User-Facing Changes Summary

### Before (Misleading)
- "Daily Profit/Loss" chart - Actually showed reserve changes including deposits
- "74,674% APY" - Inflated by deposit activity
- Users confused when "profit" was green but share price dropped

### After (Accurate)
| Metric | What It Shows | User Benefit |
|--------|---------------|--------------|
| **House Profit/Loss** (NEW) | True gambling performance | Know if house is actually winning |
| **Share Price** | LP share value over time | See your real investment growth |
| **Daily Net Flow** (renamed) | Reserve changes (all sources) | Understand pool size changes |
| **APY** (fixed) | Annualized share price return | Accurate expected returns |

### Tooltips Added
Every chart now has an info tooltip explaining:
- What the metric measures
- How it's calculated
- Why it matters to LPs

---

## Testing Checklist

After deployment, verify on https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice/liquidity:

- [ ] Share Price chart still works
- [ ] New House Profit/Loss chart shows data
- [ ] House Profit bars are red/green correctly (matches share price direction)
- [ ] Net Flow chart (formerly Profit/Loss) still shows data
- [ ] APY cards show reasonable numbers (not 74,000%)
- [ ] All tooltips display correctly
- [ ] No console errors

---

## Rollback Plan

If issues occur, the fix is purely frontend. Rollback by:
```bash
git revert HEAD
./deploy.sh --frontend-only
```

Backend data is unchanged and correct.
