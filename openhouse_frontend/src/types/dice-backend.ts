/**
 * Type definitions for Dice Backend API
 * These types match the backend canister's query function responses
 */

/**
 * Accounting statistics from get_accounting_stats()
 */
export interface AccountingStats {
  /** Total ICP deposited by all users (in e8s) */
  total_user_deposits: bigint;
  /** Number of unique users who have deposited */
  unique_depositors: bigint;
  /** House/pool balance (in e8s) */
  house_balance: bigint;
  /** Actual canister balance (in e8s) */
  canister_balance: bigint;
}

/**
 * Liquidity pool statistics from get_pool_stats()
 */
export interface PoolStats {
  /** Total LP shares issued */
  total_shares: bigint;
  /** Pool reserve amount (in e8s) */
  pool_reserve: bigint;
  /** Current share price (in e8s) */
  share_price: bigint;
  /** Number of liquidity providers */
  total_liquidity_providers: bigint;
  /** Minimum liquidity burned on pool initialization */
  minimum_liquidity_burned: bigint;
  /** Whether pool has been initialized */
  is_initialized: boolean;
}

/**
 * Game performance statistics from get_stats()
 */
export interface GameStats {
  /** Total number of games played */
  total_games: bigint;
  /** Total betting volume (in e8s) */
  total_volume: bigint;
  /** Total payouts to winners (in e8s) */
  total_payouts: bigint;
  /** House profit/loss (in e8s) */
  house_profit: bigint;
  /** Number of games won by players */
  games_won: bigint;
  /** Number of games lost by players */
  games_lost: bigint;
}

/**
 * LP position information from get_lp_position() or get_my_lp_position()
 */
export interface LPPosition {
  /** Number of LP shares owned */
  shares: bigint;
  /** Current value of shares (in e8s) */
  value: bigint;
}

/**
 * Pending withdrawal information from get_withdrawal_status()
 */
export interface PendingWithdrawal {
  /** Amount being withdrawn (in e8s) */
  amount: bigint;
  /** Timestamp when withdrawal was initiated */
  timestamp: bigint;
  /** User's principal */
  user: string;
}

/**
 * Audit log entry from get_audit_log()
 */
export interface AuditEntry {
  /** Timestamp of the event */
  timestamp: bigint;
  /** Type of event (deposit, withdrawal, bet, etc.) */
  event_type: string;
  /** User involved in the event */
  user: string;
  /** Amount involved (in e8s) */
  amount: bigint;
  /** Additional details */
  details: string;
}

/**
 * Dice game result from play_dice(), get_game(), or get_recent_games()
 */
export interface DiceResult {
  /** Unique game ID */
  game_id: bigint;
  /** Player's principal */
  player: string;
  /** Bet amount (in e8s) */
  bet_amount: bigint;
  /** Target number (0-100) */
  target_number: number;
  /** Roll direction (Over or Under) */
  direction: RollDirection;
  /** Actual roll result (0-100) */
  roll: number;
  /** Whether player won */
  won: boolean;
  /** Payout amount (in e8s), 0 if lost */
  payout: bigint;
  /** Timestamp of the game */
  timestamp: bigint;
}

/**
 * Roll direction for dice game
 */
export enum RollDirection {
  Over = 'Over',
  Under = 'Under'
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E> =
  | { Ok: T }
  | { Err: E };

/**
 * Audit balance check result from audit_balances()
 */
export type AuditResult = Result<string, string>;
