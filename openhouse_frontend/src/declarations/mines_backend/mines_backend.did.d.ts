import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Bankroll {
  'total_paid_out' : bigint,
  'balance' : bigint,
  'total_wagered' : bigint,
  'house_profit' : bigint,
}
export interface GameInfo {
  'player' : Principal,
  'current_multiplier' : number,
  'revealed' : Array<boolean>,
  'num_mines' : number,
  'is_active' : boolean,
}
export interface GameStats {
  'total_games' : bigint,
  'total_busted' : bigint,
  'total_completed' : bigint,
}
export interface GameSummary {
  'num_mines' : number,
  'game_id' : bigint,
  'timestamp' : bigint,
  'is_active' : boolean,
}
export interface RevealResult { 'multiplier' : number, 'busted' : boolean }
export interface _SERVICE {
  'cash_out' : ActorMethod<[bigint], { 'Ok' : bigint } | { 'Err' : string }>,
  'deposit_to_bankroll' : ActorMethod<
    [bigint],
    { 'Ok' : null } |
      { 'Err' : string }
  >,
  'get_bankroll' : ActorMethod<[], Bankroll>,
  'get_game' : ActorMethod<[bigint], { 'Ok' : GameInfo } | { 'Err' : string }>,
  'get_recent_games' : ActorMethod<[number], Array<GameSummary>>,
  'get_stats' : ActorMethod<[], GameStats>,
  'greet' : ActorMethod<[string], string>,
  'reveal_tile' : ActorMethod<
    [bigint, number],
    { 'Ok' : RevealResult } |
      { 'Err' : string }
  >,
  'start_game' : ActorMethod<[bigint], { 'Ok' : bigint } | { 'Err' : string }>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
