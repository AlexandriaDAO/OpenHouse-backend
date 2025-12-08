import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface AbandonedEntry {
  'user' : Principal,
  'timestamp' : bigint,
  'amount' : bigint,
}
export interface ApyInfo {
  'days_calculated' : number,
  'total_volume' : bigint,
  'expected_apy_percent' : number,
  'actual_apy_percent' : number,
  'total_profit' : bigint,
}
export interface AuditEntry { 'event' : AuditEvent, 'timestamp' : bigint }
export type AuditEvent = {
    'BalanceCredited' : {
      'user' : Principal,
      'new_balance' : bigint,
      'amount' : bigint,
    }
  } |
  { 'WithdrawalInitiated' : { 'user' : Principal, 'amount' : bigint } } |
  {
    'SlippageProtectionTriggered' : {
      'deposit_amount' : bigint,
      'user' : Principal,
      'actual_shares' : bigint,
      'expected_min_shares' : bigint,
    }
  } |
  { 'BalanceRestored' : { 'user' : Principal, 'amount' : bigint } } |
  { 'WithdrawalCompleted' : { 'user' : Principal, 'amount' : bigint } } |
  { 'ParentFeeCredited' : { 'amount' : bigint } } |
  { 'SystemError' : { 'error' : string } } |
  { 'WithdrawalAbandoned' : { 'user' : Principal, 'amount' : bigint } } |
  { 'WithdrawalExpired' : { 'user' : Principal, 'amount' : bigint } } |
  { 'ParentFeeFallback' : { 'amount' : bigint, 'reason' : string } } |
  { 'WithdrawalFailed' : { 'user' : Principal, 'amount' : bigint } } |
  { 'LPRestored' : { 'user' : Principal, 'amount' : bigint } } |
  { 'SystemInfo' : { 'message' : string } } |
  {
    'SystemRefundCredited' : {
      'user' : Principal,
      'new_balance' : bigint,
      'amount' : bigint,
    }
  };
export interface DailySnapshot {
  'day_timestamp' : bigint,
  'daily_volume' : bigint,
  'share_price' : bigint,
  'pool_reserve_end' : bigint,
  'daily_pool_profit' : bigint,
}
export interface HealthCheck {
  'stable_memory_pages' : bigint,
  'total_deposits' : bigint,
  'is_healthy' : boolean,
  'calculated_total' : bigint,
  'heap_memory_bytes' : bigint,
  'is_solvent' : boolean,
  'total_abandoned_amount' : bigint,
  'health_status' : string,
  'unique_lps' : bigint,
  'unique_users' : bigint,
  'pool_reserve' : bigint,
  'timestamp' : bigint,
  'excess' : bigint,
  'excess_usdt' : number,
  'pending_withdrawals_count' : bigint,
  'canister_balance' : bigint,
  'pending_withdrawals_total_amount' : bigint,
}
export interface LPPosition {
  'shares' : bigint,
  'pool_ownership_percent' : number,
  'redeemable_usdt' : bigint,
}
export interface LPPositionInfo { 'shares' : bigint, 'user' : Principal }
export interface MinimalGameResult {
  'server_seed' : Uint8Array | number[],
  'client_seed' : string,
  'is_win' : boolean,
  'server_seed_hash' : string,
  'nonce' : bigint,
  'rolled_number' : number,
  'payout' : bigint,
}
export interface MultiDiceGameResult {
  'server_seed' : Uint8Array | number[],
  'net_result' : bigint,
  'total_payout' : bigint,
  'client_seed' : string,
  'dice_count' : number,
  'total_bet' : bigint,
  'total_wins' : number,
  'server_seed_hash' : string,
  'nonce' : bigint,
  'dice_results' : Array<SingleDiceResult>,
}
export interface OrphanedFundsReport {
  'abandoned_count' : bigint,
  'total_abandoned_amount' : bigint,
  'recent_abandonments' : Array<AbandonedEntry>,
}
export interface PendingWithdrawal {
  'created_at' : bigint,
  'withdrawal_type' : WithdrawalType,
}
export interface PendingWithdrawalInfo {
  'user' : Principal,
  'created_at' : bigint,
  'amount' : bigint,
  'withdrawal_type' : string,
}
export interface PoolStats {
  'total_shares' : bigint,
  'share_price' : bigint,
  'pool_reserve' : bigint,
  'total_liquidity_providers' : bigint,
  'is_initialized' : boolean,
  'minimum_liquidity_burned' : bigint,
}
export type RollDirection = { 'Over' : null } |
  { 'Under' : null };
export interface SingleDiceResult {
  'is_win' : boolean,
  'rolled_number' : number,
  'payout' : bigint,
}
export interface UserBalance { 'balance' : bigint, 'user' : Principal }
export type WithdrawalType = {
    'LP' : { 'shares' : bigint, 'reserve' : bigint, 'amount' : bigint }
  } |
  { 'User' : { 'amount' : bigint } };
export interface _SERVICE {
  'abandon_withdrawal' : ActorMethod<
    [],
    { 'Ok' : bigint } |
      { 'Err' : string }
  >,
  'admin_get_all_balances' : ActorMethod<
    [bigint, bigint],
    { 'Ok' : Array<UserBalance> } |
      { 'Err' : string }
  >,
  'admin_get_all_balances_complete' : ActorMethod<
    [],
    { 'Ok' : Array<UserBalance> } |
      { 'Err' : string }
  >,
  'admin_get_all_lp_positions' : ActorMethod<
    [bigint, bigint],
    { 'Ok' : Array<LPPositionInfo> } |
      { 'Err' : string }
  >,
  'admin_get_all_lp_positions_complete' : ActorMethod<
    [],
    { 'Ok' : Array<LPPositionInfo> } |
      { 'Err' : string }
  >,
  'admin_get_all_pending_withdrawals' : ActorMethod<
    [],
    { 'Ok' : Array<PendingWithdrawalInfo> } |
      { 'Err' : string }
  >,
  'admin_get_audit_log' : ActorMethod<
    [bigint, bigint],
    { 'Ok' : Array<AuditEntry> } |
      { 'Err' : string }
  >,
  'admin_get_audit_log_count' : ActorMethod<
    [],
    { 'Ok' : bigint } |
      { 'Err' : string }
  >,
  'admin_get_orphaned_funds_report' : ActorMethod<
    [[] | [bigint]],
    { 'Ok' : OrphanedFundsReport } |
      { 'Err' : string }
  >,
  'admin_get_orphaned_funds_report_full' : ActorMethod<
    [],
    { 'Ok' : OrphanedFundsReport } |
      { 'Err' : string }
  >,
  'admin_health_check' : ActorMethod<
    [],
    { 'Ok' : HealthCheck } |
      { 'Err' : string }
  >,
  'calculate_payout_info' : ActorMethod<
    [number, RollDirection],
    { 'Ok' : [number, number] } |
      { 'Err' : string }
  >,
  'calculate_shares_preview' : ActorMethod<
    [bigint],
    { 'Ok' : bigint } |
      { 'Err' : string }
  >,
  'can_accept_bets' : ActorMethod<[], boolean>,
  'deposit' : ActorMethod<[bigint], { 'Ok' : bigint } | { 'Err' : string }>,
  'deposit_liquidity' : ActorMethod<
    [bigint, [] | [bigint]],
    { 'Ok' : bigint } |
      { 'Err' : string }
  >,
  'get_balance' : ActorMethod<[Principal], bigint>,
  'get_daily_stats' : ActorMethod<[number], Array<DailySnapshot>>,
  'get_house_balance' : ActorMethod<[], bigint>,
  'get_house_mode' : ActorMethod<[], string>,
  'get_lp_position' : ActorMethod<[Principal], LPPosition>,
  'get_max_allowed_payout' : ActorMethod<[], bigint>,
  'get_max_bet_per_dice' : ActorMethod<
    [number, number, RollDirection],
    { 'Ok' : bigint } |
      { 'Err' : string }
  >,
  'get_my_balance' : ActorMethod<[], bigint>,
  'get_my_lp_position' : ActorMethod<[], LPPosition>,
  'get_my_withdrawal_status' : ActorMethod<[], [] | [PendingWithdrawal]>,
  'get_pool_apy' : ActorMethod<[[] | [number]], ApyInfo>,
  'get_pool_stats' : ActorMethod<[], PoolStats>,
  'get_stats_count' : ActorMethod<[], bigint>,
  'get_stats_range' : ActorMethod<[bigint, bigint], Array<DailySnapshot>>,
  'greet' : ActorMethod<[string], string>,
  'play_dice' : ActorMethod<
    [bigint, number, RollDirection, string],
    { 'Ok' : MinimalGameResult } |
      { 'Err' : string }
  >,
  'play_multi_dice' : ActorMethod<
    [number, bigint, number, RollDirection, string],
    { 'Ok' : MultiDiceGameResult } |
      { 'Err' : string }
  >,
  'retry_withdrawal' : ActorMethod<[], { 'Ok' : bigint } | { 'Err' : string }>,
  'verify_game_result' : ActorMethod<
    [Uint8Array | number[], string, bigint, number],
    { 'Ok' : boolean } |
      { 'Err' : string }
  >,
  'verify_multi_dice_result' : ActorMethod<
    [Uint8Array | number[], string, bigint, Uint8Array | number[]],
    { 'Ok' : boolean } |
      { 'Err' : string }
  >,
  'withdraw_all' : ActorMethod<[], { 'Ok' : bigint } | { 'Err' : string }>,
  'withdraw_all_liquidity' : ActorMethod<
    [],
    { 'Ok' : bigint } |
      { 'Err' : string }
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
