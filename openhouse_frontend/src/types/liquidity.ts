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
  redeemable_usdt: bigint;
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
  withdrawal_type: { User: { amount: bigint } } | { LP: { amount: bigint; shares: bigint; reserve: bigint } };
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
  get_house_balance: () => Promise<bigint>;
  get_max_allowed_payout: () => Promise<bigint>;
  can_accept_bets: () => Promise<boolean>;
  calculate_shares_preview: (amount: bigint) => Promise<{ Ok: bigint } | { Err: string }>;
  get_stats_range: (start: bigint, end: bigint) => Promise<DailySnapshot[]>;
  get_stats_count: () => Promise<bigint>;

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
    typeof a.get_pool_apy === 'function' &&
    typeof a.get_daily_stats === 'function' &&
    typeof a.deposit_liquidity === 'function' &&
    typeof a.withdraw_all_liquidity === 'function' &&
    typeof a.get_my_withdrawal_status === 'function' &&
    typeof a.retry_withdrawal === 'function' &&
    typeof a.abandon_withdrawal === 'function'
  );
}

// ChartDataPoint (processed from DailySnapshot)
export interface ChartDataPoint {
  date: Date;
  dateLabel: string;
  poolReserve: number;
  volume: number;
  
  // Renamed: This is reserve change (including deposits/withdrawals), NOT profit
  netFlow: number; // Was: profit

  // NEW: True house profit from share price change
  houseProfit: number;
  houseProfitPercent: number; // For APY calculation

  sharePrice: number;
  sharePriceChange: number; // NEW: Absolute change
  sharePriceChangePercent: number; // NEW: Percentage change
}
