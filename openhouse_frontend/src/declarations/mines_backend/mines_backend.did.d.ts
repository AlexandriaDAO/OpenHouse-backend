import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface MultiBallResult {
  'total_multiplier' : number,
  'ball_count' : number,
  'balls' : Array<PlinkoResult>,
  'average_multiplier' : number,
}
export interface PlinkoResult {
  'win' : boolean,
  'multiplier' : number,
  'path' : Array<boolean>,
  'final_position' : number,
}
export type Result = { 'ok' : MultiBallResult } |
  { 'err' : string };
export type Result_1 = { 'ok' : PlinkoResult } |
  { 'err' : string };
export interface _SERVICE {
  'drop_ball' : ActorMethod<[], Result_1>,
  'drop_balls' : ActorMethod<[number], Result>,
  'get_expected_value' : ActorMethod<[], number>,
  'get_formula' : ActorMethod<[], string>,
  'get_multipliers' : ActorMethod<[], Array<number>>,
  'greet' : ActorMethod<[string], string>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
