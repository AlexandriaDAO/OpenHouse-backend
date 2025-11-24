import { Principal } from '@dfinity/principal';

// ICRC-1 Standard Types
export interface Account {
  owner: Principal;
  subaccount: [] | [Uint8Array];
}

export interface Tokens {
  e8s: bigint;
}

// ICRC-2 Standard Types
export interface ApproveArgs {
  spender: Account;
  amount: bigint;
  fee?: [] | [bigint];
  memo?: [] | [Uint8Array];
  from_subaccount?: [] | [Uint8Array];
  created_at_time?: [] | [bigint];
  expected_allowance?: [] | [bigint];
  expires_at?: [] | [bigint];
}

export type ApproveError =
  | { BadFee: { expected_fee: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { AllowanceChanged: { current_allowance: bigint } }
  | { Expired: { ledger_time: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } };

export type ApproveResult = { Ok: bigint } | { Err: ApproveError };

// ckUSDT Ledger Service Interface (ICRC-1 and ICRC-2 methods)
export interface ckUSDTLedgerService {
  // ICRC-1 standard method
  icrc1_balance_of: (account: Account) => Promise<bigint>;

  // ICRC-2 standard method
  icrc2_approve: (args: ApproveArgs) => Promise<ApproveResult>;

  // Legacy method (backup)
  account_balance: (args: { account: Uint8Array }) => Promise<Tokens>;
}

// Helper to convert ckUSDT decimals to USDT amount
export function decimalsToUSDT(decimals: bigint): number {
  return Number(decimals) / 1_000_000; // 6 decimals for ckUSDT
}

// Helper to format USDT balance
export function formatUSDT(decimals: bigint): string {
  const usdt = decimalsToUSDT(decimals);
  return `$${usdt.toFixed(2)} USDT`;
}

/** @deprecated Use decimalsToUSDT instead */
export const e8sToIcp = decimalsToUSDT;

/** @deprecated Use formatUSDT instead */
export const formatIcp = formatUSDT;
