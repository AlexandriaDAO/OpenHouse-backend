import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface MultiBallResult {
  'total_balls' : number,
  'results' : Array<PlinkoResult>,
  'total_wins' : number,
  'average_multiplier' : number,
}
export interface PlinkoResult {
  'win' : boolean,
  'multiplier' : number,
  'path' : Array<boolean>,
  'final_position' : number,
}
export interface _SERVICE {
  'drop_ball' : ActorMethod<[], { 'Ok' : PlinkoResult } | { 'Err' : string }>,
  'drop_multiple_balls' : ActorMethod<
    [number],
    { 'Ok' : MultiBallResult } |
      { 'Err' : string }
  >,
  'get_expected_value' : ActorMethod<[], number>,
  'get_formula' : ActorMethod<[], string>,
  'get_multipliers_bp' : ActorMethod<[], BigUint64Array | bigint[]>,
  'greet' : ActorMethod<[string], string>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
