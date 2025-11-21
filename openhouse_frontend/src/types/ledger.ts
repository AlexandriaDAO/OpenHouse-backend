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

// ICP Ledger Service Interface (minimal, just what we need)
export interface ICPLedgerService {
  // ICRC-1 standard method
  icrc1_balance_of: (account: Account) => Promise<bigint>;

  // ICRC-2 standard method
  icrc2_approve: (args: ApproveArgs) => Promise<ApproveResult>;

  // Legacy method (backup)
  account_balance: (args: { account: Uint8Array }) => Promise<Tokens>;
}

// Helper to convert e8s to ICP
export function e8sToIcp(e8s: bigint): number {
  return Number(e8s) / 100_000_000;
}

// Helper to format ICP balance
export function formatIcp(e8s: bigint): string {
  const icp = e8sToIcp(e8s);
  return icp.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}
