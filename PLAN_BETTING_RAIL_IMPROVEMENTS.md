# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-betting-rail"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-betting-rail`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Frontend changes:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh
     ```
4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status openhouse_frontend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(betting-rail): Add house balance, refresh button, and fix limit accuracy"
   git push -u origin feature/betting-rail-improvements
   gh pr create --title "Betting Rail: House Balance + Refresh + Accurate Limits" --body "$(cat <<'EOF'
## Summary
- Display house balance in betting rail alongside Chips and Wallet balances
- Add subtle refresh button for manual balance refresh
- Fix "exceeded limit" false positives by syncing balance state properly

## Test plan
- [ ] Verify house balance displays correctly on desktop and mobile
- [ ] Test refresh button triggers balance update
- [ ] Confirm "limit exceeded" only appears when bet truly exceeds house capacity
- [ ] Check that after wins/losses the limit status updates correctly

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

**Branch:** `feature/betting-rail-improvements`
**Worktree:** `/home/theseus/alexandria/openhouse-betting-rail`

---

# Implementation Plan

## Problem Analysis

### User Request
1. Show **House balance** alongside `Chips` and `Wallet` in betting rail
2. Add a **subtle refresh button** for all balances
3. Fix **"exceeded limit" inaccuracy** - shows limit exceeded when bet is still allowed

### Root Cause Analysis

**"Exceeded Limit" False Positives:**

1. **Stale House Balance**: `houseBalance` prop is only refreshed:
   - Every 30 seconds via interval (DiceGame.tsx:125-127)
   - After each game completes (async, may have latency)
   - On window focus

2. **Timing Issue**: The `houseLimitStatus` calculation in BettingRail.tsx uses:
   ```typescript
   const maxAllowedPayout = houseBalanceUSDT * 0.1;
   const currentPotentialPayout = betAmount * multiplier;
   ```
   But this uses **client-side houseBalance** which may be outdated after wins add to house or losses subtract from house.

3. **Threshold Too Aggressive**: Currently shows warning at 70% utilization, danger at 90%. Since house balance fluctuates with each game, these thresholds trigger frequently.

### Solution Approach

**Conservative Fix (Recommended)**:
- Remove the client-side limit warning entirely - rely on backend rejection
- The backend `get_max_allowed_payout()` is authoritative
- Show error only when backend explicitly rejects

**Alternative (If warning is desired)**:
- Refresh house balance after EVERY game (already done)
- Use `maxBet` from `get_max_allowed_payout()` which is already fetched
- Only show "exceeded" when `betAmount > maxBet` (authoritative from backend)

---

## Current State

### File: `openhouse_frontend/src/components/game-ui/BettingRail.tsx`

**Balance Display (Desktop - lines 235-248):**
```typescript
<div className="flex flex-col gap-1 text-xs w-40">
  <div className="text-gray-500">
    Chips: <span className="text-white font-mono">${formatUSDT(gameBalance)}</span>
  </div>
  <div className="text-gray-600">
    Wallet: <span className="text-gray-400 font-mono">${formatUSDT(walletBalance)}</span>
  </div>
  {houseLimitStatus !== 'healthy' && (
    <div className={`text-[10px] ${houseLimitStatus === 'danger' ? 'text-red-500' : 'text-yellow-500'}`}>
      {houseLimitStatus === 'danger' ? 'limit exceeded' : 'near limit'}
    </div>
  )}
</div>
```

**House Limit Calculation (lines 172-180):**
```typescript
const houseLimitStatus: HouseLimitStatus = useMemo(() => {
  const houseBalanceUSDT = Number(houseBalance) / DECIMALS_PER_CKUSDT;
  const maxAllowedPayout = houseBalanceUSDT * 0.1;
  const currentPotentialPayout = betAmount * multiplier;
  const utilizationPct = maxAllowedPayout > 0 ? (currentPotentialPayout / maxAllowedPayout) * 100 : 0;
  if (utilizationPct > 90) return 'danger';
  if (utilizationPct > 70) return 'warning';
  return 'healthy';
}, [houseBalance, betAmount, multiplier]);
```

### File: `openhouse_frontend/src/pages/dice/DiceGame.tsx`

**MaxBet Calculation (lines 103-113):**
```typescript
try {
  const maxPayoutE8s = await actor.get_max_allowed_payout();
  const maxPayoutUSDT = Number(maxPayoutE8s) / DECIMALS_PER_CKUSDT;
  const maxBetUSDT = mult > 0 ? maxPayoutUSDT / mult : 0;
  setMaxBet(maxBetUSDT);
  if (betAmount > maxBetUSDT) {
    setBetAmount(maxBetUSDT);
  }
} catch (e) {
  setMaxBet(10);
}
```

This `maxBet` is authoritative from backend but is separate from the `houseLimitStatus` calculation.

---

## Implementation Steps

### Step 1: Add House Balance Display

**File: `BettingRail.tsx`**

Add new prop to show house balance (already passed as `houseBalance` prop):

```typescript
// PSEUDOCODE - Desktop Balance Section (around line 235)
<div className="flex flex-col gap-1 text-xs w-40">
  <div className="text-gray-500">
    Chips: <span className="text-white font-mono">${formatUSDT(gameBalance)}</span>
  </div>
  <div className="text-gray-600">
    Wallet: <span className="text-gray-400 font-mono">${formatUSDT(walletBalance)}</span>
  </div>
  {/* NEW: House balance display */}
  <div className="text-gray-600">
    House: <span className="text-gray-400 font-mono">${formatUSDT(houseBalance)}</span>
  </div>
  {/* REMOVED: houseLimitStatus warning - rely on backend maxBet instead */}
</div>
```

### Step 2: Add Subtle Refresh Button

**File: `BettingRail.tsx`**

Add a minimal refresh icon button:

```typescript
// PSEUDOCODE - Add refresh icon next to balances
<button
  onClick={onBalanceRefresh}
  className="text-gray-600 hover:text-gray-400 p-1 transition"
  title="Refresh balances"
>
  {/* Simple SVG refresh icon - 12x12 */}
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 12c0-4.4 3.6-8 8-8 3.1 0 5.8 1.8 7.1 4.4M20 12c0 4.4-3.6 8-8 8-3.1 0-5.8-1.8-7.1-4.4"/>
    <path d="M20 4v4h-4M4 20v-4h4"/>
  </svg>
</button>
```

### Step 3: Fix "Exceeded Limit" Logic

**Option A (Recommended): Remove client-side warning**

Remove the `houseLimitStatus` warning entirely. The `maxBet` prop already enforces the limit, and backend will reject if exceeded.

```typescript
// PSEUDOCODE - Remove this entire useMemo block
// const houseLimitStatus: HouseLimitStatus = useMemo(() => { ... });

// Remove the warning display element entirely
// The maxBet validation is sufficient
```

**Option B: Use maxBet for accurate validation**

If we want to keep a warning, compare against the authoritative `maxBet`:

```typescript
// PSEUDOCODE - Replace houseLimitStatus with simpler check
const isNearMaxBet = useMemo(() => {
  // Only warn when bet is within 90% of max allowed bet
  return betAmount > maxBet * 0.9;
}, [betAmount, maxBet]);

const exceedsMaxBet = useMemo(() => {
  return betAmount > maxBet;
}, [betAmount, maxBet]);

// Then in render:
{exceedsMaxBet && (
  <div className="text-red-500 text-[10px]">exceeds max bet</div>
)}
{!exceedsMaxBet && isNearMaxBet && (
  <div className="text-yellow-500 text-[10px]">near max bet</div>
)}
```

### Step 4: Update Mobile View

Apply same changes to mobile section (lines 290-361):

```typescript
// PSEUDOCODE - Mobile Balance Section
<div className="text-gray-500">
  Chips: <span className="text-white font-mono">${formatUSDT(gameBalance)}</span>
  {/* Add refresh button inline */}
  <button onClick={onBalanceRefresh} className="ml-1 text-gray-600 hover:text-gray-400">
    {/* Smaller refresh icon */}
  </button>
</div>
{/* House balance - mobile can be more compact */}
<div className="text-gray-600 text-[10px]">
  House: ${formatUSDT(houseBalance)}
</div>
```

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `openhouse_frontend/src/components/game-ui/BettingRail.tsx` | MODIFY | Add house balance, refresh button, fix limit logic |

---

## Deployment Notes

- **Frontend-only change** - No backend modifications
- **Canisters affected**: `openhouse_frontend` only
- **Deploy command**: `./deploy.sh --frontend-only`

---

## Testing Checklist

Manual verification on mainnet:
- [ ] House balance displays next to Chips and Wallet (desktop)
- [ ] House balance displays on mobile view
- [ ] Refresh button works and updates all three balances
- [ ] No "limit exceeded" false positives when bet is actually allowed
- [ ] Playing games updates balances correctly
- [ ] Chip buttons respect maxBet correctly
