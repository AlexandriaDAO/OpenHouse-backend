import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface AccountingStats {
  'total_user_deposits' : bigint,
  'unique_depositors' : bigint,
  'house_balance' : bigint,
  'canister_balance' : bigint,
}
export interface ApyInfo {
  'days_calculated' : number,
  'total_volume' : bigint,
  'expected_apy_percent' : number,
  'actual_apy_percent' : number,
  'total_profit' : bigint,
}
export interface DailySnapshot {
  'day_timestamp' : bigint,
  'daily_volume' : bigint,
  'share_price' : bigint,
  'pool_reserve_end' : bigint,
  'daily_pool_profit' : bigint,
}
export interface LPPosition {
  'shares' : bigint,
  'redeemable_icp' : bigint,
  'pool_ownership_percent' : number,
}
export interface MinimalGameResult {
  'is_win' : boolean,
  'rolled_number' : number,
  'payout' : bigint,
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
export interface _SERVICE {
  'audit_balances' : ActorMethod<[], { 'Ok' : string } | { 'Err' : string }>,
  'calculate_payout_info' : ActorMethod<
    [number, RollDirection],
    { 'Ok' : [number, number] } |
      { 'Err' : string }
  >,
  'can_accept_bets' : ActorMethod<[], boolean>,
  'deposit' : ActorMethod<[bigint], { 'Ok' : bigint } | { 'Err' : string }>,
  'deposit_liquidity' : ActorMethod<
    [bigint],
    { 'Ok' : bigint } |
      { 'Err' : string }
  >,
  'get_accounting_stats' : ActorMethod<[], AccountingStats>,
  'get_balance' : ActorMethod<[Principal], bigint>,
  'get_canister_balance' : ActorMethod<[], bigint>,
  'get_current_seed_hash' : ActorMethod<[], string>,
  'get_daily_stats' : ActorMethod<[number], Array<DailySnapshot>>,
  'get_house_balance' : ActorMethod<[], bigint>,
  'get_house_mode' : ActorMethod<[], string>,
  'get_lp_position' : ActorMethod<[Principal], LPPosition>,
  'get_max_allowed_payout' : ActorMethod<[], bigint>,
  'get_my_balance' : ActorMethod<[], bigint>,
  'get_my_lp_position' : ActorMethod<[], LPPosition>,
  'get_pool_apy' : ActorMethod<[[] | [number]], ApyInfo>,
  'get_pool_stats' : ActorMethod<[], PoolStats>,
  'get_seed_info' : ActorMethod<[], [string, bigint, bigint]>,
  'get_stats_count' : ActorMethod<[], bigint>,
  'get_stats_range' : ActorMethod<[bigint, bigint], Array<DailySnapshot>>,
  'greet' : ActorMethod<[string], string>,
  'play_dice' : ActorMethod<
    [bigint, number, RollDirection, string],
    { 'Ok' : MinimalGameResult } |
      { 'Err' : string }
  >,
  'refresh_canister_balance' : ActorMethod<[], bigint>,
  'verify_game_result' : ActorMethod<
    [Uint8Array | number[], string, bigint, number],
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
