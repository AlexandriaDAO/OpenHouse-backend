import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface CrashResult {
  'randomness_hash' : string,
  'crash_point' : number,
}
export interface PlayCrashResult {
  'won' : boolean,
  'randomness_hash' : string,
  'target_multiplier' : number,
  'crash_point' : number,
  'payout' : bigint,
}
export interface _SERVICE {
  'get_crash_formula' : ActorMethod<[], string>,
  'get_expected_value' : ActorMethod<[], number>,
  'get_probability_table' : ActorMethod<[], Array<[number, number]>>,
  'get_win_probability' : ActorMethod<
    [number],
    { 'Ok' : number } |
      { 'Err' : string }
  >,
  'greet' : ActorMethod<[string], string>,
  'play_crash' : ActorMethod<
    [number],
    { 'Ok' : PlayCrashResult } |
      { 'Err' : string }
  >,
  'simulate_crash' : ActorMethod<
    [],
    { 'Ok' : CrashResult } |
      { 'Err' : string }
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
