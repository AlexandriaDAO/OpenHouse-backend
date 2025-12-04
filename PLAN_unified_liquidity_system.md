# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-unified-liquidity"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-unified-liquidity`
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
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko/liquidity"
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/blackjack/liquidity"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: unified config-driven liquidity system for all games"
   git push -u origin feature/unified-liquidity-system
   gh pr create --title "Unified Liquidity System" --body "$(cat <<'EOF'
   ## Summary
   - Config-driven liquidity system for Dice, Plinko, and Blackjack
   - Single `GameLiquidity` component works for all games
   - Add new game liquidity = add config entry
   - Type-safe actor interface abstraction
   - Per-game theming support

   ## Changes
   - New: `src/config/gameRegistry.ts` - Central game configuration
   - New: `src/types/liquidity.ts` - Shared types + actor interface
   - New: `src/hooks/liquidity/` - Parameterized hooks
   - New: `src/components/liquidity/` - Shared components
   - New: `/plinko/liquidity` and `/blackjack/liquidity` routes
   - Refactored: DiceLiquidity now uses shared components

   ## Test Plan
   - [ ] Visit /dice/liquidity - verify existing functionality
   - [ ] Visit /plinko/liquidity - verify new page works
   - [ ] Visit /blackjack/liquidity - verify new page works
   - [ ] Test deposit flow on each game
   - [ ] Test withdrawal flow on each game
   - [ ] Verify statistics charts load for all games

   Deployed to mainnet:
   - Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io

   Generated with Claude Code
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

**Branch:** `feature/unified-liquidity-system`
**Worktree:** `/home/theseus/alexandria/openhouse-unified-liquidity`

---

# Implementation Plan: Unified Config-Driven Liquidity System

## Executive Summary

Create a config-driven, type-safe liquidity system that allows adding new game liquidity pages by simply adding a config entry. Covers Dice, Plinko, and Blackjack (Crash excluded - no liquidity backend).

**Key Design Decisions:**
- Config-driven registry for scalability
- Type-safe actor interface abstraction (not `any`)
- Per-game theming for visual continuity
- Statistics required for all games (all backends have APY endpoints)

---

## 1. Current State

### Existing Files
```
openhouse_frontend/src/
  pages/
    dice/
      DiceLayout.tsx              # Layout with Outlet (15 lines)
      DiceGame.tsx                # Game page
      DiceLiquidity.tsx           # Full liquidity page (532 lines) - TEMPLATE
      index.ts                    # Barrel export
    Plinko.tsx                    # Single file game (526 lines) - NO LIQUIDITY
    Blackjack.tsx                 # Single file game - NO LIQUIDITY
    Crash.tsx                     # Single file game - NO LIQUIDITY BACKEND

  hooks/actors/
    useDiceActor.ts               # Canister: whchi-hyaaa-aaaao-a4ruq-cai
    usePlinkoActor.ts             # Canister: weupr-2qaaa-aaaap-abl3q-cai
    useBlackjackActor.ts          # Canister: wvrcw-3aaaa-aaaah-arm4a-cai
    useCrashActor.ts              # Canister: fws6k-tyaaa-aaaap-qqc7q-cai
    useLedgerActor.ts             # ckUSDT ledger

  components/game-specific/dice/
    statistics/
      DiceStatistics.tsx          # Chart container
      StatsCharts.tsx             # Recharts components (reusable)
      useApyData.ts               # Dice-specific APY hook
      useStatsData.ts             # Dice-specific stats hook
    PendingWithdrawalRecovery.tsx # Dice-specific recovery (255 lines)
```

### Backend API Verification (All Three Have Identical Methods)
```
Dice:      get_pool_stats, get_my_lp_position, deposit_liquidity, withdraw_all_liquidity, get_pool_apy, get_daily_stats
Plinko:    get_pool_stats, get_my_lp_position, deposit_liquidity, withdraw_all_liquidity, get_pool_apy, get_daily_stats
Blackjack: get_pool_stats, get_my_lp_position, deposit_liquidity, withdraw_all_liquidity, get_pool_apy, get_daily_stats
```

---

## 2. Target File Structure

```
openhouse_frontend/src/
  config/
    gameRegistry.ts                    # NEW - Central game configuration

  types/
    liquidity.ts                       # NEW - Shared types + actor interface

  hooks/
    actors/
      useGameActor.ts                  # NEW - Type-safe actor selector
    liquidity/
      index.ts                         # NEW - Barrel export
      usePoolStats.ts                  # NEW - Pool stats + LP position
      useApyData.ts                    # NEW - APY data (parameterized)
      useStatsData.ts                  # NEW - Stats for charts (parameterized)
      useDepositFlow.ts                # NEW - ICRC-2 deposit flow
      useWithdrawalFlow.ts             # NEW - Withdrawal flow

  components/
    liquidity/
      index.ts                         # NEW - Barrel export
      GameLiquidity.tsx                # NEW - Main config-driven component
      LiquidityStatsBar.tsx            # NEW - Header stats (3 columns)
      LiquidityRiskReturns.tsx         # NEW - Collapsible explainer
      LiquidityPosition.tsx            # NEW - User position display
      LiquidityActions.tsx             # NEW - Deposit/Withdraw tabs
      PendingWithdrawalRecovery.tsx    # NEW - Game-agnostic recovery
    statistics/
      index.ts                         # NEW - Barrel export
      GameStatistics.tsx               # NEW - Config-driven statistics
      StatsCharts.tsx                  # MOVE from dice/statistics
      ApyCard.tsx                      # NEW - Reusable APY card

  pages/
    dice/
      DiceLiquidity.tsx                # MODIFY - Use GameLiquidity component
    plinko/
      index.ts                         # NEW
      PlinkoLayout.tsx                 # NEW - Layout with Outlet
      PlinkoGame.tsx                   # NEW - Renamed from Plinko.tsx
      PlinkoLiquidity.tsx              # NEW - Uses GameLiquidity
    blackjack/
      index.ts                         # NEW
      BlackjackLayout.tsx              # NEW - Layout with Outlet
      BlackjackGame.tsx                # NEW - Renamed from Blackjack.tsx
      BlackjackLiquidity.tsx           # NEW - Uses GameLiquidity

  App.tsx                              # MODIFY - Add nested routes
```

---

## 3. Implementation Details

### 3.1 Game Registry Configuration

**File:** `src/config/gameRegistry.ts`

```typescript
// PSEUDOCODE
import { GameType } from '../types/balance';

export interface GameTheme {
  primary: string;      // Tailwind color class: 'dfinity-turquoise', 'orange-500', 'purple-500'
  accent: string;       // Secondary color
  gradient: string;     // Gradient for backgrounds
}

export interface GameConfig {
  // Identification
  id: GameType;
  name: string;
  icon: string;

  // Backend
  canisterId: string;

  // Routes
  routes: {
    base: string;
    liquidity: string;
  };

  // Liquidity config
  liquidity: {
    enabled: boolean;
    minDeposit: number;
    hasStatistics: boolean;
    withdrawalFeePercent: number;
  };

  // Visual theming
  theme: GameTheme;
}

export const GAME_REGISTRY: Record<string, GameConfig> = {
  dice: {
    id: 'dice',
    name: 'Dice',
    icon: '🎲',
    canisterId: 'whchi-hyaaa-aaaao-a4ruq-cai',
    routes: { base: '/dice', liquidity: '/dice/liquidity' },
    liquidity: { enabled: true, minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'dfinity-turquoise',
      accent: 'purple-400',
      gradient: 'from-dfinity-turquoise/5 to-transparent',
    },
  },
  plinko: {
    id: 'plinko',
    name: 'Plinko',
    icon: '🔴',
    canisterId: 'weupr-2qaaa-aaaap-abl3q-cai',
    routes: { base: '/plinko', liquidity: '/plinko/liquidity' },
    liquidity: { enabled: true, minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'orange-500',
      accent: 'yellow-400',
      gradient: 'from-orange-500/5 to-transparent',
    },
  },
  blackjack: {
    id: 'blackjack',
    name: 'Blackjack',
    icon: '🃏',
    canisterId: 'wvrcw-3aaaa-aaaah-arm4a-cai',
    routes: { base: '/blackjack', liquidity: '/blackjack/liquidity' },
    liquidity: { enabled: true, minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'green-500',
      accent: 'emerald-400',
      gradient: 'from-green-500/5 to-transparent',
    },
  },
};

// Helper functions
export const getGameConfig = (gameId: GameType): GameConfig | undefined => GAME_REGISTRY[gameId];
export const getLiquidityGames = (): GameConfig[] => Object.values(GAME_REGISTRY).filter(g => g.liquidity.enabled);
```

### 3.2 Type-Safe Actor Interface (CRITICAL)

**File:** `src/types/liquidity.ts`

```typescript
// PSEUDOCODE
import { GameType } from './balance';

// ========================================
// BACKEND RESPONSE TYPES (identical across all games)
// ========================================

export interface PoolStats {
  total_shares: bigint;
  pool_reserve: bigint;
  share_price: bigint;
  total_liquidity_providers: bigint;
  minimum_liquidity_burned: bigint;
  is_initialized: boolean;
}

export interface LPPosition {
  shares: bigint;
  pool_ownership_percent: number;
  redeemable_icp: bigint;
}

export interface ApyInfo {
  days_calculated: number;
  total_volume: bigint;
  expected_apy_percent: number;
  actual_apy_percent: number;
  total_profit: bigint;
}

export interface DailySnapshot {
  day_timestamp: bigint;
  daily_volume: bigint;
  share_price: bigint;
  pool_reserve_end: bigint;
  daily_pool_profit: bigint;
}

export interface PendingWithdrawal {
  created_at: bigint;
  withdrawal_type: { User: { amount: bigint } } | { LP: { amount: bigint; shares: bigint } };
}

// ========================================
// TYPE-SAFE ACTOR INTERFACE
// ========================================

// Define the common liquidity methods that all game actors share
// This allows us to use a single interface regardless of which game actor we're using
export interface LiquidityActorInterface {
  // Pool queries
  get_pool_stats: () => Promise<PoolStats>;
  get_my_lp_position: () => Promise<LPPosition>;
  get_pool_apy: (days: [number] | []) => Promise<ApyInfo>;
  get_daily_stats: (limit: number) => Promise<DailySnapshot[]>;

  // Liquidity operations
  deposit_liquidity: (amount: bigint, minShares: [] | [bigint]) => Promise<{ Ok: bigint } | { Err: string }>;
  withdraw_all_liquidity: () => Promise<{ Ok: bigint } | { Err: string }>;

  // Pending withdrawal operations
  get_my_withdrawal_status: () => Promise<[] | [PendingWithdrawal]>;
  retry_withdrawal: () => Promise<{ Ok: bigint } | { Err: string }>;
  abandon_withdrawal: () => Promise<{ Ok: bigint } | { Err: string }>;
}

// Type guard to verify an actor implements the liquidity interface
export function isLiquidityActor(actor: unknown): actor is LiquidityActorInterface {
  if (!actor || typeof actor !== 'object') return false;
  const a = actor as Record<string, unknown>;
  return (
    typeof a.get_pool_stats === 'function' &&
    typeof a.get_my_lp_position === 'function' &&
    typeof a.deposit_liquidity === 'function' &&
    typeof a.withdraw_all_liquidity === 'function'
  );
}

// Chart data point (processed from DailySnapshot)
export interface ChartDataPoint {
  date: Date;
  dateLabel: string;
  poolReserve: number;
  volume: number;
  profit: number;
  sharePrice: number;
}
```

### 3.3 Type-Safe Actor Selector Hook

**File:** `src/hooks/actors/useGameActor.ts`

```typescript
// PSEUDOCODE
import { GameType } from '../../types/balance';
import { LiquidityActorInterface, isLiquidityActor } from '../../types/liquidity';
import useDiceActor from './useDiceActor';
import usePlinkoActor from './usePlinkoActor';
import useBlackjackActor from './useBlackjackActor';

interface UseGameActorResult {
  actor: LiquidityActorInterface | null;
  isReady: boolean;
}

/**
 * Returns the appropriate actor for a given game type, cast to the common LiquidityActorInterface.
 * This allows shared components to be type-safe without using `any`.
 */
export function useGameActor(gameId: GameType): UseGameActorResult {
  const diceResult = useDiceActor();
  const plinkoResult = usePlinkoActor();
  const blackjackResult = useBlackjackActor();

  // Select the appropriate actor based on gameId
  let rawActor: unknown = null;
  switch (gameId) {
    case 'dice':
      rawActor = diceResult.actor;
      break;
    case 'plinko':
      rawActor = plinkoResult.actor;
      break;
    case 'blackjack':
      rawActor = blackjackResult.actor;
      break;
    default:
      console.warn(`No liquidity actor available for game: ${gameId}`);
      return { actor: null, isReady: false };
  }

  // Validate and cast to common interface
  if (rawActor && isLiquidityActor(rawActor)) {
    return { actor: rawActor, isReady: true };
  }

  return { actor: null, isReady: false };
}
```

### 3.4 Shared Pool Stats Hook

**File:** `src/hooks/liquidity/usePoolStats.ts`

```typescript
// PSEUDOCODE
import { useState, useEffect, useCallback } from 'react';
import { GameType } from '../../types/balance';
import { PoolStats, LPPosition } from '../../types/liquidity';
import { useGameActor } from '../actors/useGameActor';
import { useAuth } from '../../providers/AuthProvider';

interface UsePoolStatsResult {
  poolStats: PoolStats | null;
  myPosition: LPPosition | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePoolStats(gameId: GameType, refreshInterval = 30000): UsePoolStatsResult {
  const { actor, isReady } = useGameActor(gameId);
  const { isAuthenticated } = useAuth();

  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [myPosition, setMyPosition] = useState<LPPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!actor || !isReady) return;

    try {
      const stats = await actor.get_pool_stats();
      setPoolStats(stats);

      if (isAuthenticated) {
        const position = await actor.get_my_lp_position();
        setMyPosition(position);
      }
      setError(null);
    } catch (err) {
      console.error(`Failed to load pool stats for ${gameId}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to load pool stats');
    } finally {
      setIsLoading(false);
    }
  }, [actor, isReady, gameId, isAuthenticated]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { poolStats, myPosition, isLoading, error, refresh };
}
```

### 3.5 Shared APY Data Hook

**File:** `src/hooks/liquidity/useApyData.ts`

```typescript
// PSEUDOCODE
import { useState, useEffect } from 'react';
import { GameType } from '../../types/balance';
import { ApyInfo } from '../../types/liquidity';
import { useGameActor } from '../actors/useGameActor';

export function useApyData(gameId: GameType) {
  const [apy7, setApy7] = useState<ApyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { actor, isReady } = useGameActor(gameId);

  useEffect(() => {
    const fetchApy = async () => {
      if (!actor || !isReady) return;

      setIsLoading(true);
      setError(null);
      try {
        const result = await actor.get_pool_apy([7]);
        setApy7(result);
      } catch (err) {
        console.error(`APY fetch error for ${gameId}:`, err);
        setError(err instanceof Error ? err.message : 'Failed to load APY');
      } finally {
        setIsLoading(false);
      }
    };

    fetchApy();
  }, [actor, isReady, gameId]);

  return { apy7, isLoading, error };
}
```

### 3.6 Shared Stats Data Hook

**File:** `src/hooks/liquidity/useStatsData.ts`

```typescript
// PSEUDOCODE
import { useState, useEffect, useCallback, useMemo } from 'react';
import { GameType } from '../../types/balance';
import { DailySnapshot, ApyInfo, ChartDataPoint } from '../../types/liquidity';
import { useGameActor } from '../actors/useGameActor';

export type Period = 7 | 30 | 90;

export function useStatsData(gameId: GameType, isExpanded: boolean) {
  const [period, setPeriod] = useState<Period>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [apy7, setApy7] = useState<ApyInfo | null>(null);
  const [apy30, setApy30] = useState<ApyInfo | null>(null);

  const { actor, isReady } = useGameActor(gameId);

  const fetchData = useCallback(async () => {
    if (!actor || !isReady) return;

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
      console.error(`Error fetching stats for ${gameId}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  }, [actor, isReady, gameId, period]);

  useEffect(() => {
    if (isExpanded) {
      fetchData();
    }
  }, [isExpanded, fetchData]);

  // Transform snapshots to chart data points
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!snapshots) return [];
    return snapshots.map(s => {
      const dateMs = Number(s.day_timestamp / 1_000_000n);
      const currencyDecimals = 1_000_000;
      const sharePriceDecimals = 100_000_000;

      // Apply bugfix for old data (share price stored incorrectly)
      let sharePriceRaw = Number(s.share_price);
      if (sharePriceRaw > 0 && sharePriceRaw < 50) {
        sharePriceRaw = sharePriceRaw * 100;
      }

      return {
        date: new Date(dateMs),
        dateLabel: new Date(dateMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        poolReserve: Number(s.pool_reserve_end) / currencyDecimals,
        volume: Number(s.daily_volume) / currencyDecimals,
        profit: Number(s.daily_pool_profit) / currencyDecimals,
        sharePrice: sharePriceRaw / sharePriceDecimals,
      };
    });
  }, [snapshots]);

  return {
    period,
    setPeriod,
    isLoading,
    error,
    chartData,
    apy7,
    apy30,
    hasData: chartData.length >= 1,
    refetch: fetchData
  };
}
```

### 3.7 Shared Deposit Flow Hook

**File:** `src/hooks/liquidity/useDepositFlow.ts`

```typescript
// PSEUDOCODE
import { useState, useCallback } from 'react';
import { Principal } from '@dfinity/principal';
import { GameType, DECIMALS_PER_CKUSDT, TRANSFER_FEE } from '../../types/balance';
import { useGameActor } from '../actors/useGameActor';
import useLedgerActor from '../actors/useLedgerActor';
import { useAuth } from '../../providers/AuthProvider';
import { getGameConfig } from '../../config/gameRegistry';

export function useDepositFlow(gameId: GameType, onSuccess?: () => void) {
  const config = getGameConfig(gameId);
  const { actor: gameActor, isReady } = useGameActor(gameId);
  const { actor: ledgerActor } = useLedgerActor();
  const { principal } = useAuth();

  const [depositAmount, setDepositAmount] = useState('10');
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const handleMaxClick = useCallback((walletBalance: bigint) => {
    const twoFees = BigInt(2 * TRANSFER_FEE);
    const maxAmount = walletBalance > twoFees ? walletBalance - twoFees : BigInt(0);
    const maxUSDT = Number(maxAmount) / DECIMALS_PER_CKUSDT;
    setDepositAmount(maxUSDT.toFixed(2));
  }, []);

  const handleDeposit = useCallback(async () => {
    if (!gameActor || !isReady || !ledgerActor || !principal || !config) return;

    setIsDepositing(true);
    clearMessages();

    try {
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * DECIMALS_PER_CKUSDT));
      const minDeposit = BigInt(config.liquidity.minDeposit * DECIMALS_PER_CKUSDT);

      if (amount < minDeposit) {
        setError(`Minimum LP deposit is ${config.liquidity.minDeposit} USDT`);
        setIsDepositing(false);
        return;
      }

      // Step 1: ICRC-2 Approval
      const backendPrincipal = Principal.fromText(config.canisterId);
      const approvalAmount = amount + BigInt(TRANSFER_FEE);

      const approveArgs = {
        spender: { owner: backendPrincipal, subaccount: [] as [] },
        amount: approvalAmount,
        fee: [] as [],
        memo: [] as [],
        from_subaccount: [] as [],
        created_at_time: [] as [],
        expected_allowance: [] as [],
        expires_at: [] as [],
      };

      const approveResult = await ledgerActor.icrc2_approve(approveArgs);
      if ('Err' in approveResult) {
        throw new Error(`Approval failed: ${JSON.stringify(approveResult.Err)}`);
      }

      // Step 2: Deposit liquidity
      const result = await gameActor.deposit_liquidity(amount, []);

      if ('Ok' in result) {
        const shares = result.Ok;
        setSuccess(`Deposited ${depositAmount} USDT! Received ${shares.toString()} shares`);
        setDepositAmount('10');
        onSuccess?.();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
    }
  }, [gameActor, isReady, ledgerActor, principal, config, depositAmount, clearMessages, onSuccess]);

  return {
    depositAmount,
    setDepositAmount,
    isDepositing,
    error,
    success,
    handleDeposit,
    handleMaxClick,
    clearMessages,
  };
}
```

### 3.8 Shared Withdrawal Flow Hook

**File:** `src/hooks/liquidity/useWithdrawalFlow.ts`

```typescript
// PSEUDOCODE
import { useState, useCallback } from 'react';
import { GameType, DECIMALS_PER_CKUSDT } from '../../types/balance';
import { useGameActor } from '../actors/useGameActor';

export function useWithdrawalFlow(gameId: GameType, onSuccess?: () => void) {
  const { actor, isReady } = useGameActor(gameId);

  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const handleWithdrawAll = useCallback(async () => {
    if (!actor || !isReady) return;

    setIsWithdrawing(true);
    clearMessages();

    try {
      const result = await actor.withdraw_all_liquidity();

      if ('Ok' in result) {
        const amount = result.Ok;
        const amountUSDT = Number(amount) / DECIMALS_PER_CKUSDT;
        setSuccess(`Withdrew ${amountUSDT.toFixed(2)} USDT!`);
        onSuccess?.();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  }, [actor, isReady, clearMessages, onSuccess]);

  return {
    isWithdrawing,
    error,
    success,
    handleWithdrawAll,
    clearMessages,
  };
}
```

### 3.9 Main GameLiquidity Component

**File:** `src/components/liquidity/GameLiquidity.tsx`

```typescript
// PSEUDOCODE
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameType } from '../../types/balance';
import { getGameConfig } from '../../config/gameRegistry';
import { useAuth } from '../../providers/AuthProvider';
import { useBalance } from '../../providers/BalanceProvider';

// Sub-components
import { LiquidityStatsBar } from './LiquidityStatsBar';
import { LiquidityRiskReturns } from './LiquidityRiskReturns';
import { LiquidityPosition } from './LiquidityPosition';
import { LiquidityActions } from './LiquidityActions';
import { PendingWithdrawalRecovery } from './PendingWithdrawalRecovery';
import { GameStatistics } from '../statistics/GameStatistics';

// Hooks
import { usePoolStats } from '../../hooks/liquidity/usePoolStats';
import { useApyData } from '../../hooks/liquidity/useApyData';
import { useDepositFlow } from '../../hooks/liquidity/useDepositFlow';
import { useWithdrawalFlow } from '../../hooks/liquidity/useWithdrawalFlow';

interface Props {
  gameId: GameType;
}

export function GameLiquidity({ gameId }: Props) {
  const navigate = useNavigate();
  const config = getGameConfig(gameId);
  const { isAuthenticated } = useAuth();
  const { balance: walletBalance } = useBalance();

  if (!config || !config.liquidity.enabled) {
    return <div className="text-center text-gray-400 py-12">Liquidity not available for this game</div>;
  }

  // Get theme colors from config
  const { theme } = config;

  // Hooks
  const { poolStats, myPosition, refresh: refreshStats } = usePoolStats(gameId);
  const { apy7, isLoading: apyLoading, error: apyError } = useApyData(gameId);

  const handleRefresh = useCallback(async () => {
    await refreshStats();
  }, [refreshStats]);

  const deposit = useDepositFlow(gameId, handleRefresh);
  const withdrawal = useWithdrawalFlow(gameId, handleRefresh);

  // UI State
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showRiskReturns, setShowRiskReturns] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12">
      {/* Back to Game Button - uses theme color */}
      <div className="pt-4 pb-2">
        <button
          onClick={() => navigate(config.routes.base)}
          className={`text-${theme.primary} hover:text-${theme.primary}/80 text-sm font-medium flex items-center gap-2 transition`}
        >
          <span>&larr;</span>
          <span>{config.icon} Back to Game</span>
        </button>
      </div>

      {/* Hero Section */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
          BE THE <span className={`text-${theme.primary}`}>HOUSE</span>
        </h1>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Provide liquidity to the {config.name} bankroll. You take the House's risk and earn the House's 1% statistical edge.
        </p>
      </div>

      {/* Pending Withdrawal Recovery */}
      {isAuthenticated && (
        <PendingWithdrawalRecovery gameId={gameId} onResolved={handleRefresh} />
      )}

      {/* Main Card */}
      <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
        {/* Stats Bar */}
        <LiquidityStatsBar
          poolStats={poolStats}
          apy7={apy7}
          apyLoading={apyLoading}
          apyError={apyError}
          theme={theme}
        />

        {/* Risk & Returns Section */}
        <LiquidityRiskReturns
          isExpanded={showRiskReturns}
          onToggle={() => setShowRiskReturns(!showRiskReturns)}
          withdrawalFeePercent={config.liquidity.withdrawalFeePercent}
        />

        {/* Key Concepts + Position + Actions */}
        <div className={`p-6 bg-gradient-to-b ${theme.gradient}`}>
          {/* Key Concepts Grid - uses theme colors */}
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className={`text-${theme.primary} font-bold mb-1 text-sm`}>Be The House</div>
              <div className="text-xs text-gray-400">Your deposit becomes house money.</div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className="text-green-400 font-bold mb-1 text-sm">1% House Edge</div>
              <div className="text-xs text-gray-400">Statistical advantage ensures long-term growth.</div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className="text-yellow-400 font-bold mb-1 text-sm">1% Withdrawal Fee</div>
              <div className="text-xs text-gray-400">Fee charged on profit + principal when withdrawing.</div>
            </div>
          </div>

          {/* User Position */}
          {isAuthenticated && myPosition && Number(myPosition.shares) > 0 && (
            <LiquidityPosition position={myPosition} theme={theme} />
          )}

          {/* Actions (Deposit/Withdraw) */}
          <LiquidityActions
            isAuthenticated={isAuthenticated}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            deposit={deposit}
            withdrawal={withdrawal}
            myPosition={myPosition}
            walletBalance={walletBalance}
            showWithdrawConfirm={showWithdrawConfirm}
            setShowWithdrawConfirm={setShowWithdrawConfirm}
            config={config}
            theme={theme}
          />

          {/* Feedback Messages */}
          {(deposit.error || withdrawal.error) && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
              {deposit.error || withdrawal.error}
            </div>
          )}
          {(deposit.success || withdrawal.success) && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg text-green-400 text-sm text-center">
              {deposit.success || withdrawal.success}
            </div>
          )}
        </div>

        {/* Statistics Section */}
        {config.liquidity.hasStatistics && (
          <div className="border-t border-gray-700/50">
            <div className="p-4 bg-black/20 border-b border-gray-700/50">
              <span className="text-gray-400 font-bold text-sm">Historical Performance & Charts</span>
            </div>
            <div className="bg-black/10">
              <GameStatistics gameId={gameId} />
            </div>
          </div>
        )}
      </div>

      {/* Withdraw Confirmation Modal */}
      {showWithdrawConfirm && (
        <WithdrawConfirmModal
          onConfirm={() => {
            setShowWithdrawConfirm(false);
            withdrawal.handleWithdrawAll();
          }}
          onCancel={() => setShowWithdrawConfirm(false)}
          withdrawalFeePercent={config.liquidity.withdrawalFeePercent}
        />
      )}
    </div>
  );
}

// Withdraw confirmation modal component
function WithdrawConfirmModal({ onConfirm, onCancel, withdrawalFeePercent }: {
  onConfirm: () => void;
  onCancel: () => void;
  withdrawalFeePercent: number;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-red-500/30 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-black text-white mb-4">Confirm Withdrawal</h3>
        <div className="space-y-4 text-sm text-gray-300 mb-6">
          <p>You are about to withdraw <strong>ALL</strong> your liquidity from the pool.</p>
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p className="text-red-400 font-bold mb-1">{withdrawalFeePercent}% Fee Applies</p>
            <p className="text-xs">A {withdrawalFeePercent}% fee will be deducted and distributed to $ALEX stakers.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition">Confirm Withdraw</button>
        </div>
      </div>
    </div>
  );
}
```

### 3.10 PendingWithdrawalRecovery (Game-Agnostic)

**File:** `src/components/liquidity/PendingWithdrawalRecovery.tsx`

```typescript
// PSEUDOCODE
import { useState, useEffect, useRef } from 'react';
import { GameType } from '../../types/balance';
import { PendingWithdrawal } from '../../types/liquidity';
import { useGameActor } from '../../hooks/actors/useGameActor';
import { formatUSDT } from '../../types/balance';

interface Props {
  gameId: GameType;
  onResolved: () => void;
}

export function PendingWithdrawalRecovery({ gameId, onResolved }: Props) {
  const { actor, isReady } = useGameActor(gameId);
  const [pending, setPending] = useState<PendingWithdrawal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check for pending withdrawal on mount and poll
  useEffect(() => {
    if (!actor || !isReady) return;

    const checkPending = async () => {
      try {
        const result = await actor.get_my_withdrawal_status();
        if (result.length > 0) {
          setPending(result[0]);
        } else {
          setPending(null);
        }
      } catch (err) {
        console.error(`Error checking pending withdrawal for ${gameId}:`, err);
      } finally {
        setIsLoading(false);
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 10000);
    return () => clearInterval(interval);
  }, [actor, isReady, gameId]);

  const handleRetry = async () => {
    if (!actor || !isReady) return;
    setIsRetrying(true);
    setError(null);
    try {
      const result = await actor.retry_withdrawal();
      if ('Ok' in result) {
        setSuccess(`Withdrawal completed! Received ${formatUSDT(result.Ok)} USDT`);
        setPending(null);
        onResolved();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAbandon = async () => {
    if (!actor || !isReady) return;
    setIsAbandoning(true);
    setError(null);
    try {
      const result = await actor.abandon_withdrawal();
      if ('Ok' in result) {
        setSuccess(`Funds returned to pool. ${formatUSDT(result.Ok)} USDT restored.`);
        setPending(null);
        onResolved();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abandon failed');
    } finally {
      setIsAbandoning(false);
    }
  };

  if (isLoading || !pending) return null;

  // Render recovery UI with retry/abandon buttons
  return (
    <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
      <h4 className="text-yellow-400 font-bold mb-2">Pending Withdrawal Detected</h4>
      <p className="text-sm text-gray-400 mb-4">
        A previous withdrawal timed out. Check your wallet - if funds arrived, click "Confirm Receipt".
        If not, click "Retry Transfer".
      </p>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {success && <p className="text-green-400 text-sm mb-2">{success}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleAbandon}
          disabled={isAbandoning || isRetrying}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {isAbandoning ? 'Processing...' : 'Confirm Receipt'}
        </button>
        <button
          onClick={handleRetry}
          disabled={isRetrying || isAbandoning}
          className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {isRetrying ? 'Retrying...' : 'Retry Transfer'}
        </button>
      </div>
    </div>
  );
}
```

### 3.11 Sub-Components (Extracted from DiceLiquidity)

**LiquidityStatsBar, LiquidityRiskReturns, LiquidityPosition, LiquidityActions**

These are extracted directly from DiceLiquidity.tsx lines 224-478. The key changes:
- Accept `theme` prop for color customization
- Replace hardcoded `dfinity-turquoise` with `theme.primary`
- Replace hardcoded gradient with `theme.gradient`

### 3.12 GameStatistics Component

**File:** `src/components/statistics/GameStatistics.tsx`

```typescript
// PSEUDOCODE
import { GameType } from '../../types/balance';
import { useStatsData, Period } from '../../hooks/liquidity/useStatsData';
import { SharePriceChart, PoolReserveChart, VolumeChart, ProfitLossChart } from './StatsCharts';
import { ApyCard } from './ApyCard';

interface Props {
  gameId: GameType;
}

export function GameStatistics({ gameId }: Props) {
  const {
    period, setPeriod,
    isLoading, error,
    chartData, apy7, apy30,
    hasData
  } = useStatsData(gameId, true);

  // Render loading/error/empty states
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error} />;
  if (!hasData) return <EmptyState message="No historical data yet" />;

  return (
    <div className="p-4 space-y-6">
      {/* Period selector */}
      <div className="flex justify-between items-center">
        <h3 className="text-gray-400 text-xs uppercase tracking-widest font-bold">
          Historical Performance
        </h3>
        <div className="flex bg-black/30 p-1 rounded-lg">
          {([7, 30, 90] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1 rounded-md font-mono text-xs transition ${
                period === p
                  ? 'bg-dfinity-turquoise text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {p}D
            </button>
          ))}
        </div>
      </div>

      {/* APY Cards */}
      {apy7 && apy30 && (
        <div className="grid grid-cols-2 gap-4">
          <ApyCard label="7-Day APY" info={apy7} />
          <ApyCard label="30-Day APY" info={apy30} />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <SharePriceChart data={chartData} height={250} />
        </div>
        <PoolReserveChart data={chartData} />
        <VolumeChart data={chartData} />
        <div className="md:col-span-2">
          <ProfitLossChart data={chartData} height={180} />
        </div>
      </div>
    </div>
  );
}
```

### 3.13 Route Updates

**File:** `src/App.tsx` (MODIFY)

```typescript
// PSEUDOCODE - Add these imports and routes

// New imports
import { PlinkoLayout, PlinkoGame, PlinkoLiquidity } from './pages/plinko';
import { BlackjackLayout, BlackjackGame, BlackjackLiquidity } from './pages/blackjack';

// Routes section - replace single Plinko/Blackjack routes with nested:
<Routes>
  <Route path="/" element={<Home />} />

  {/* Dice - existing */}
  <Route path="/dice" element={<DiceLayout />}>
    <Route index element={<DiceGame />} />
    <Route path="liquidity" element={<DiceLiquidity />} />
  </Route>

  {/* Plinko - NEW nested routes */}
  <Route path="/plinko" element={<PlinkoLayout />}>
    <Route index element={<PlinkoGame />} />
    <Route path="liquidity" element={<PlinkoLiquidity />} />
  </Route>

  {/* Blackjack - NEW nested routes */}
  <Route path="/blackjack" element={<BlackjackLayout />}>
    <Route index element={<BlackjackGame />} />
    <Route path="liquidity" element={<BlackjackLiquidity />} />
  </Route>

  {/* Crash - NO liquidity route */}
  <Route path="/crash" element={<Crash />} />

  <Route path="/wallet" element={<Wallet />} />
  <Route path="/admin" element={<Admin />} />
</Routes>
```

### 3.14 Plinko Layout and Pages

**File:** `src/pages/plinko/PlinkoLayout.tsx`

```typescript
// PSEUDOCODE - Copy pattern from DiceLayout
import { Outlet, useLocation } from 'react-router-dom';

export function PlinkoLayout() {
  const location = useLocation();
  const isPlayRoute = !location.pathname.includes('/liquidity');

  return (
    <div className={`h-full flex flex-col ${isPlayRoute ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      <div className={`flex-1 ${isPlayRoute ? 'overflow-hidden min-h-0' : 'overflow-y-auto'}`}>
        <Outlet />
      </div>
    </div>
  );
}
```

**File:** `src/pages/plinko/PlinkoGame.tsx`

```typescript
// PSEUDOCODE - Rename from Plinko.tsx, no changes to content
// Just rename the file and update exports
export { Plinko as PlinkoGame } from './PlinkoGame';
// OR copy entire Plinko.tsx content and rename component
```

**File:** `src/pages/plinko/PlinkoLiquidity.tsx`

```typescript
// PSEUDOCODE - Simple wrapper
import { GameLiquidity } from '../../components/liquidity';

export function PlinkoLiquidity() {
  return <GameLiquidity gameId="plinko" />;
}
```

**File:** `src/pages/plinko/index.ts`

```typescript
export { PlinkoLayout } from './PlinkoLayout';
export { PlinkoGame } from './PlinkoGame';
export { PlinkoLiquidity } from './PlinkoLiquidity';
```

### 3.15 Blackjack Layout and Pages

Same pattern as Plinko - create BlackjackLayout, rename Blackjack.tsx to BlackjackGame.tsx, create BlackjackLiquidity wrapper.

### 3.16 Refactor DiceLiquidity

**File:** `src/pages/dice/DiceLiquidity.tsx` (MODIFY)

```typescript
// PSEUDOCODE - Replace entire 532-line file with:
import { GameLiquidity } from '../../components/liquidity';

export function DiceLiquidity() {
  return <GameLiquidity gameId="dice" />;
}
```

---

## 4. Implementation Phases

### Phase 1: Foundation (No Breaking Changes)
Files to create:
- `src/config/gameRegistry.ts`
- `src/types/liquidity.ts`
- `src/hooks/actors/useGameActor.ts`
- `src/hooks/liquidity/index.ts`
- `src/hooks/liquidity/usePoolStats.ts`
- `src/hooks/liquidity/useApyData.ts`
- `src/hooks/liquidity/useStatsData.ts`
- `src/hooks/liquidity/useDepositFlow.ts`
- `src/hooks/liquidity/useWithdrawalFlow.ts`

**Verify:** Run `npm run build` - should pass with no errors

### Phase 2: Shared Components
Files to create:
- `src/components/liquidity/index.ts`
- `src/components/liquidity/GameLiquidity.tsx`
- `src/components/liquidity/LiquidityStatsBar.tsx`
- `src/components/liquidity/LiquidityRiskReturns.tsx`
- `src/components/liquidity/LiquidityPosition.tsx`
- `src/components/liquidity/LiquidityActions.tsx`
- `src/components/liquidity/PendingWithdrawalRecovery.tsx`
- `src/components/statistics/index.ts`
- `src/components/statistics/GameStatistics.tsx`
- `src/components/statistics/ApyCard.tsx`

Files to move:
- `src/components/game-specific/dice/statistics/StatsCharts.tsx` -> `src/components/statistics/StatsCharts.tsx`

**Verify:** Run `npm run build` - should pass

### Phase 3: Refactor Dice Liquidity
Files to modify:
- `src/pages/dice/DiceLiquidity.tsx` - Replace with GameLiquidity wrapper

**Verify:**
- Run `npm run build`
- Deploy: `./deploy.sh --frontend-only`
- Test: Visit /dice/liquidity - all features should work

### Phase 4: Add Plinko Liquidity
Files to create:
- `src/pages/plinko/index.ts`
- `src/pages/plinko/PlinkoLayout.tsx`
- `src/pages/plinko/PlinkoLiquidity.tsx`

Files to rename:
- `src/pages/Plinko.tsx` -> `src/pages/plinko/PlinkoGame.tsx`

Files to modify:
- `src/App.tsx` - Add nested Plinko routes

**Verify:**
- Run `npm run build`
- Deploy: `./deploy.sh --frontend-only`
- Test: Visit /plinko and /plinko/liquidity

### Phase 5: Add Blackjack Liquidity
Files to create:
- `src/pages/blackjack/index.ts`
- `src/pages/blackjack/BlackjackLayout.tsx`
- `src/pages/blackjack/BlackjackLiquidity.tsx`

Files to rename:
- `src/pages/Blackjack.tsx` -> `src/pages/blackjack/BlackjackGame.tsx`

Files to modify:
- `src/App.tsx` - Add nested Blackjack routes

**Verify:**
- Run `npm run build`
- Deploy: `./deploy.sh --frontend-only`
- Test: Visit /blackjack and /blackjack/liquidity

### Phase 6: Cleanup
Files to delete (after verifying all works):
- `src/components/game-specific/dice/statistics/useApyData.ts` (replaced by shared hook)
- `src/components/game-specific/dice/statistics/useStatsData.ts` (replaced by shared hook)
- `src/components/game-specific/dice/PendingWithdrawalRecovery.tsx` (replaced by shared component)

---

## 5. Files Summary

### Create (27 files)
| File | Lines (est) |
|------|-------------|
| `src/config/gameRegistry.ts` | 80 |
| `src/types/liquidity.ts` | 100 |
| `src/hooks/actors/useGameActor.ts` | 40 |
| `src/hooks/liquidity/index.ts` | 10 |
| `src/hooks/liquidity/usePoolStats.ts` | 50 |
| `src/hooks/liquidity/useApyData.ts` | 35 |
| `src/hooks/liquidity/useStatsData.ts` | 80 |
| `src/hooks/liquidity/useDepositFlow.ts` | 80 |
| `src/hooks/liquidity/useWithdrawalFlow.ts` | 45 |
| `src/components/liquidity/index.ts` | 10 |
| `src/components/liquidity/GameLiquidity.tsx` | 180 |
| `src/components/liquidity/LiquidityStatsBar.tsx` | 60 |
| `src/components/liquidity/LiquidityRiskReturns.tsx` | 80 |
| `src/components/liquidity/LiquidityPosition.tsx` | 30 |
| `src/components/liquidity/LiquidityActions.tsx` | 120 |
| `src/components/liquidity/PendingWithdrawalRecovery.tsx` | 100 |
| `src/components/statistics/index.ts` | 5 |
| `src/components/statistics/GameStatistics.tsx` | 80 |
| `src/components/statistics/ApyCard.tsx` | 40 |
| `src/pages/plinko/index.ts` | 5 |
| `src/pages/plinko/PlinkoLayout.tsx` | 15 |
| `src/pages/plinko/PlinkoGame.tsx` | (rename) |
| `src/pages/plinko/PlinkoLiquidity.tsx` | 10 |
| `src/pages/blackjack/index.ts` | 5 |
| `src/pages/blackjack/BlackjackLayout.tsx` | 15 |
| `src/pages/blackjack/BlackjackGame.tsx` | (rename) |
| `src/pages/blackjack/BlackjackLiquidity.tsx` | 10 |

### Modify (3 files)
| File | Changes |
|------|---------|
| `src/App.tsx` | Add nested routes for Plinko/Blackjack |
| `src/pages/dice/DiceLiquidity.tsx` | Replace with GameLiquidity wrapper (~520 lines deleted) |
| `src/components/statistics/StatsCharts.tsx` | Move from dice/statistics |

### Delete (3 files after verification)
| File | Reason |
|------|--------|
| `src/pages/Plinko.tsx` | Renamed to plinko/PlinkoGame.tsx |
| `src/pages/Blackjack.tsx` | Renamed to blackjack/BlackjackGame.tsx |
| Old dice-specific hooks | Replaced by shared hooks |

---

## 6. Critical Reference Files

For implementation, reference these existing files:

1. **`/home/theseus/alexandria/openhouse-unified-liquidity/openhouse_frontend/src/pages/dice/DiceLiquidity.tsx`**
   - Template for GameLiquidity component structure
   - Lines 188-529 contain the full UI to extract

2. **`/home/theseus/alexandria/openhouse-unified-liquidity/openhouse_frontend/src/pages/dice/DiceLayout.tsx`**
   - Simple layout pattern with Outlet to replicate

3. **`/home/theseus/alexandria/openhouse-unified-liquidity/openhouse_frontend/src/components/game-specific/dice/statistics/StatsCharts.tsx`**
   - Recharts components to move to shared location

4. **`/home/theseus/alexandria/openhouse-unified-liquidity/openhouse_frontend/src/components/game-specific/dice/PendingWithdrawalRecovery.tsx`**
   - Recovery logic to generalize

5. **`/home/theseus/alexandria/openhouse-unified-liquidity/openhouse_frontend/src/hooks/actors/useDiceActor.ts`**
   - Pattern for actor hooks to reference in useGameActor

---

## 7. Deployment Notes

**Affected Canisters:** Frontend only (`pezw3-laaaa-aaaal-qssoa-cai`)

**No Backend Changes Required** - All three backends already have identical liquidity APIs.

**Deployment Command:**
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

**Verification URLs:**
- https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice/liquidity (existing)
- https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko/liquidity (new)
- https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/blackjack/liquidity (new)
