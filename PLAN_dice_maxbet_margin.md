# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-maxbet-margin"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-maxbet-margin`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build dice backend
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend
   cd openhouse_frontend && npm run build && cd ..

   # Deploy both
   ./deploy.sh --dice-only
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix(dice): Add safety margin between backend/frontend max bet limits"
   git push -u origin feature/dice-maxbet-margin
   gh pr create --title "Fix: Dice max bet race condition with 15%/10% safety margin" --body "Fixes race condition where winning at max bet causes next bet rejection.

## Problem
When a player wins with max bet, the house balance decreases, lowering the max allowed payout. The same bet amount then exceeds the new limit, causing rejection.

## Solution
- Backend: Increased max payout limit from 10% to 15% of house balance
- Frontend: Continues showing 10% limit to users
- This creates a 50% buffer that absorbs typical win fluctuations

## Changes
- \`dice_backend/src/defi_accounting/accounting.rs\`: Changed 10 -> 15 in max payout calculation
- \`dice_backend/src/game.rs\`: Updated error message to reflect 15% limit
- \`openhouse_frontend/src/pages/dice/DiceGame.tsx\`: Kept at 10% (no change needed)

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai"
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

**Branch:** `feature/dice-maxbet-margin`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-maxbet-margin`

---

# Implementation Plan

## Problem Statement

Race condition in dice game max bet validation:
1. Player uses max bet (calculated as 10% of house balance / multiplier)
2. Player wins, house balance decreases
3. Max bet recalculates to lower value
4. Same bet amount now rejected as "exceeds house limit"

## Solution: Backend 15%, Frontend 10%

Create a 50% safety buffer by:
- Backend allows payouts up to **15%** of house balance
- Frontend calculates max bet based on **10%** of house balance
- Buffer absorbs typical win/loss fluctuations between UI refreshes

## Files to Modify

### 1. Backend: `dice_backend/src/defi_accounting/accounting.rs` (line 524-527)

**Current:**
```rust
pub(crate) fn get_max_allowed_payout_internal() -> u64 {
    let house_balance = liquidity_pool::get_pool_reserve();
    (house_balance * 10) / 100
}
```

**Change to:**
```rust
pub(crate) fn get_max_allowed_payout_internal() -> u64 {
    let house_balance = liquidity_pool::get_pool_reserve();
    (house_balance * 15) / 100  // Backend allows 15%, frontend shows 10% for safety margin
}
```

### 2. Backend: `dice_backend/src/game.rs` (line 99-103)

**Current error message:**
```rust
return Err(format!(
    "Max payout of {} USDT exceeds house limit of {} USDT (10% of house balance)",
    max_payout as f64 / DECIMALS_PER_CKUSDT as f64,
    max_allowed as f64 / DECIMALS_PER_CKUSDT as f64
));
```

**Change to:**
```rust
return Err(format!(
    "Max payout of {} USDT exceeds house limit of {} USDT (15% of house balance)",
    max_payout as f64 / DECIMALS_PER_CKUSDT as f64,
    max_allowed as f64 / DECIMALS_PER_CKUSDT as f64
));
```

### 3. Frontend: `openhouse_frontend/src/pages/dice/DiceGame.tsx` (lines 88-96)

**Current (fetches from backend which will now return 15%):**
```typescript
try {
  const maxPayoutE8s = await actor.get_max_allowed_payout();
  const maxPayoutUSDT = Number(maxPayoutE8s) / DECIMALS_PER_CKUSDT;
  const maxBetUSDT = mult > 0 ? maxPayoutUSDT / mult : 0;
  setMaxBet(maxBetUSDT);
  ...
}
```

**Change to (calculate 10% locally for UI):**
```typescript
try {
  // Fetch house balance and calculate 10% for UI (backend allows 15% for safety margin)
  const balances = await actor.get_balances();
  const houseBalanceUSDT = Number(balances.house) / DECIMALS_PER_CKUSDT;
  const maxPayoutUSDT = houseBalanceUSDT * 0.10;  // UI shows 10% limit
  const maxBetUSDT = mult > 0 ? maxPayoutUSDT / mult : 0;
  setMaxBet(maxBetUSDT);
  ...
}
```

### 4. Frontend: `openhouse_frontend/src/pages/dice/DiceGame.tsx` (lines 145-151)

**Current validation:**
```typescript
const maxPayout = BigInt(Math.floor(betAmount * multiplier * DECIMALS_PER_CKUSDT));
const maxAllowedPayout = (balance.house * BigInt(10)) / BigInt(100);
if (maxPayout > maxAllowedPayout) {
  setGameError('Potential payout exceeds house limit.');
  return;
}
```

This already uses 10% - **NO CHANGE NEEDED** here.

## Deployment

1. Deploy dice backend: `./deploy.sh --dice-only`
2. Deploy frontend: `./deploy.sh --frontend-only`
3. Verify at https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

## Verification

After deployment, test by:
1. Check max bet displayed in UI
2. Win at max bet
3. Verify next bet attempt succeeds (within buffer)
