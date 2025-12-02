# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-send-tab"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-send-tab`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Frontend only changes
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   # Check frontend canister status
   dfx canister --network ic status openhouse_frontend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/send"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: add Send tab for ckUSDT transfers"
   git push -u origin feature/send-tab
   gh pr create --title "Feature: Add Send Tab for ckUSDT Transfers" --body "Implements PLAN_SEND_TAB.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- New route: /send
- Allows users to send ckUSDT off the platform

## Features
- Principal ID validation
- Real-time balance display
- Max button (balance - fee)
- Loading/Success/Error modals
- Auto-refresh balance after successful transfer

## Implementation Based On
Alexandria's send tab pattern from alex_frontend"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/send-tab`
**Worktree:** `/home/theseus/alexandria/openhouse-send-tab`

---

# Implementation Plan: Send Tab for ckUSDT Transfers

## Task Classification
**NEW FEATURE** - Build new functionality → additive approach

## Current State Documentation

### Existing File Structure
```
openhouse_frontend/src/
├── App.tsx                              # Main router (needs new /send route)
├── components/
│   ├── Layout.tsx                       # Header with navigation
│   └── AuthButton.tsx                   # Existing auth UI
├── pages/
│   ├── Home.tsx                         # Game selection homepage
│   ├── Dice.tsx, Plinko.tsx, etc.      # Existing game pages
│   └── [NEW] Send.tsx                   # 🆕 Send page to create
├── hooks/actors/
│   └── useLedgerActor.ts                # ✅ Already exists, returns ledger actor
├── providers/
│   ├── BalanceProvider.tsx              # ✅ Already provides balance context
│   └── AuthProvider.tsx                 # ✅ Already provides auth context
├── types/
│   └── ledger.ts                        # ⚠️ Missing icrc1_transfer types
└── utils/
    └── ledgerIdl.ts                     # ⚠️ Missing icrc1_transfer IDL method
```

### Existing Infrastructure (Already Working)
✅ **Authentication**: `useAuth()` hook provides `identity`, `isAuthenticated`, `principal`
✅ **ckUSDT Balance**: `useBalance()` hook provides `balance`, `refreshBalance()`
✅ **Ledger Actor**: `useLedgerActor()` hook provides authenticated actor for ckUSDT canister
✅ **Routing**: React Router setup in App.tsx
✅ **Layout**: Header with navigation already exists

### What's Missing (Need to Add)
❌ **Transfer Types**: `TransferArgs`, `TransferError`, `TransferResult` in `types/ledger.ts`
❌ **Transfer IDL**: `icrc1_transfer` method definition in `utils/ledgerIdl.ts`
❌ **Send Page**: Complete UI for transfer functionality
❌ **Modal Components**: Loading, Success, Error modals for transfer feedback
❌ **Route**: `/send` route in App.tsx
❌ **Navigation Link**: Link to send page from header or home

### Alexandria's Pattern (Reference)
Researched `/home/theseus/alexandria/core/src/alex_frontend/src/features/swap/components/send/sendContent.tsx`:
- 3-step form: Choose token → Enter Principal → Enter Amount
- Real-time principal validation using `Principal.fromText()`
- ICRC1 transfer: `actor.icrc1_transfer({ to, amount, fee: [], memo: [], ... })`
- Three modals: Loading (spinner), Success (checkmark), Error (retry)
- Max button: `balance - fee`
- Auto-refresh balance after success

### ckUSDT Specifics
- **Canister ID**: `cngnf-vqaaa-aaaar-qag4q-cai` (already in useLedgerActor.ts:6)
- **Decimals**: 6 (1 USDT = 1,000,000 e6s)
- **Fee**: ~0.000002 USDT (2 e6s) - need to confirm via canister call
- **Transfer Method**: `icrc1_transfer` (ICRC-1 standard)

---

## Implementation Plan (PSEUDOCODE)

### Step 1: Add Transfer Types to Ledger Interface

**File**: `openhouse_frontend/src/types/ledger.ts` (MODIFY - append to end)

```typescript
// PSEUDOCODE - Add after existing ApproveResult export

// ICRC-1 Transfer Types
export interface TransferArgs {
  to: Account;
  amount: bigint;
  fee?: [] | [bigint];
  memo?: [] | [Uint8Array];
  from_subaccount?: [] | [Uint8Array];
  created_at_time?: [] | [bigint];
}

export type TransferError =
  | { BadFee: { expected_fee: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } };

export type TransferResult = { Ok: bigint } | { Err: TransferError };

// Update ckUSDTLedgerService interface to add icrc1_transfer
export interface ckUSDTLedgerService {
  // ICRC-1 standard methods
  icrc1_balance_of: (account: Account) => Promise<bigint>;
  icrc1_transfer: (args: TransferArgs) => Promise<TransferResult>; // 🆕 ADD THIS

  // ICRC-2 standard method
  icrc2_approve: (args: ApproveArgs) => Promise<ApproveResult>;

  // Legacy method (backup)
  account_balance: (args: { account: Uint8Array }) => Promise<Tokens>;
}
```

### Step 2: Add Transfer Method to Ledger IDL

**File**: `openhouse_frontend/src/utils/ledgerIdl.ts` (MODIFY)

```typescript
// PSEUDOCODE - Add TransferArgs, TransferError, and icrc1_transfer method

export const ledgerIdlFactory = ({ IDL }: any) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });

  // ... existing Tokens, ApproveArgs, ApproveError ...

  // 🆕 ADD: ICRC-1 Transfer Types
  const TransferArgs = IDL.Record({
    to: Account,
    amount: IDL.Nat,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
  });

  const TransferError = IDL.Variant({
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    TooOld: IDL.Null,
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
  });

  return IDL.Service({
    // ICRC-1 standard
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ['query']),

    // 🆕 ADD: icrc1_transfer method
    icrc1_transfer: IDL.Func(
      [TransferArgs],
      [IDL.Variant({ Ok: IDL.Nat, Err: TransferError })],
      []
    ),

    // ICRC-2 standard
    icrc2_approve: IDL.Func(
      [ApproveArgs],
      [IDL.Variant({ Ok: IDL.Nat, Err: ApproveError })],
      []
    ),

    // Legacy method
    account_balance: IDL.Func(
      [IDL.Record({ account: IDL.Vec(IDL.Nat8) })],
      [Tokens],
      ['query']
    ),
  });
};
```

### Step 3: Create Modal Components

**File**: `openhouse_frontend/src/components/modals/LoadingModal.tsx` (NEW)

```typescript
// PSEUDOCODE - Loading modal with spinner

import React from 'react';

interface LoadingModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
}

export const LoadingModal: React.FC<LoadingModalProps> = ({
  isOpen,
  title = "Processing...",
  message = "Please wait while we process your transaction."
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-8 max-w-md w-full mx-4">
        {/* Animated spinner */}
        <div className="flex justify-center mb-4">
          <div className="animate-spin h-12 w-12 border-4 border-dfinity-turquoise border-t-transparent rounded-full" />
        </div>

        <h3 className="text-xl font-bold text-pure-white text-center mb-2">{title}</h3>
        <p className="text-gray-400 text-center">{message}</p>
      </div>
    </div>
  );
};
```

**File**: `openhouse_frontend/src/components/modals/SuccessModal.tsx` (NEW)

```typescript
// PSEUDOCODE - Success modal with checkmark

import React from 'react';

interface SuccessModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
}

export const SuccessModal: React.FC<SuccessModalProps> = ({
  isOpen,
  title = "Success!",
  message = "Transaction completed successfully.",
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-8 max-w-md w-full mx-4">
        {/* Checkmark icon */}
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <h3 className="text-xl font-bold text-pure-white text-center mb-2">{title}</h3>
        <p className="text-gray-400 text-center mb-6">{message}</p>

        <button
          onClick={onClose}
          className="w-full py-3 bg-dfinity-turquoise hover:bg-dfinity-turquoise/80 text-pure-black font-bold rounded transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
```

**File**: `openhouse_frontend/src/components/modals/ErrorModal.tsx` (NEW)

```typescript
// PSEUDOCODE - Error modal with retry option

import React from 'react';

interface ErrorModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  title = "Error",
  message,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 border border-red-500/30 rounded-lg p-8 max-w-md w-full mx-4">
        {/* Error icon */}
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>

        <h3 className="text-xl font-bold text-pure-white text-center mb-2">{title}</h3>
        <p className="text-gray-400 text-center mb-6">{message}</p>

        <button
          onClick={onClose}
          className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 font-bold rounded transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
```

**File**: `openhouse_frontend/src/components/modals/index.ts` (NEW)

```typescript
// PSEUDOCODE - Export all modals

export { LoadingModal } from './LoadingModal';
export { SuccessModal } from './SuccessModal';
export { ErrorModal } from './ErrorModal';
```

### Step 4: Create Send Page Component

**File**: `openhouse_frontend/src/pages/Send.tsx` (NEW)

```typescript
// PSEUDOCODE - Main send page with complete transfer logic

import React, { useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { useAuth } from '../providers/AuthProvider';
import { useBalance } from '../providers/BalanceProvider';
import useLedgerActor from '../hooks/actors/useLedgerActor';
import { LoadingModal, SuccessModal, ErrorModal } from '../components/modals';
import { TransferArgs, TransferResult, decimalsToUSDT } from '../types/ledger';

const CKUSDT_FEE = 2n; // 0.000002 USDT fee (need to confirm actual fee)

export const Send: React.FC = () => {
  // Hooks
  const { identity, isAuthenticated, principal } = useAuth();
  const { balance, refreshBalance } = useBalance();
  const { actor: ledgerActor } = useLedgerActor();

  // Form state
  const [destinationPrincipal, setDestinationPrincipal] = useState('');
  const [amount, setAmount] = useState('');
  const [principalError, setPrincipalError] = useState('');

  // Modal state
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Principal validation
  const validatePrincipal = (principalText: string): boolean => {
    if (!principalText) {
      setPrincipalError("Principal ID is required");
      return false;
    }

    try {
      Principal.fromText(principalText);
      setPrincipalError("");
      return true;
    } catch (error) {
      setPrincipalError("Invalid Principal ID format");
      return false;
    }
  };

  // Handle principal input change
  const handlePrincipalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDestinationPrincipal(value);
    if (value) validatePrincipal(value);
  };

  // Handle amount input change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  // Max button - sets amount to balance minus fee
  const handleMaxClick = () => {
    if (!balance) return;

    const maxAmount = balance - CKUSDT_FEE;
    if (maxAmount <= 0n) {
      setAmount('0');
      return;
    }

    // Convert to USDT (6 decimals)
    const maxUSDT = decimalsToUSDT(maxAmount);
    setAmount(maxUSDT.toString());
  };

  // Transfer submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!isAuthenticated || !ledgerActor || !identity) {
      setErrorMessage("Please connect your wallet first");
      setShowError(true);
      return;
    }

    if (!validatePrincipal(destinationPrincipal)) {
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage("Please enter a valid amount");
      setShowError(true);
      return;
    }

    // Convert USDT to e6s (6 decimals)
    const amountE6s = BigInt(Math.floor(amountNum * 1_000_000));

    if (!balance || amountE6s > balance) {
      setErrorMessage("Insufficient balance");
      setShowError(true);
      return;
    }

    // Show loading modal
    setIsLoading(true);

    try {
      // Prepare transfer args
      const transferArgs: TransferArgs = {
        to: {
          owner: Principal.fromText(destinationPrincipal),
          subaccount: [], // No subaccount
        },
        amount: amountE6s,
        fee: [], // Use default fee
        memo: [], // No memo
        from_subaccount: [], // Default subaccount
        created_at_time: [], // Let ledger set timestamp
      };

      // Execute transfer
      const result: TransferResult = await ledgerActor.icrc1_transfer(transferArgs);

      // Handle result
      if ('Ok' in result) {
        // Success - result.Ok contains block index
        setIsLoading(false);
        setShowSuccess(true);

        // Refresh balance
        await refreshBalance();

        // Reset form
        setDestinationPrincipal('');
        setAmount('');
      } else {
        // Error - parse error type
        const error = result.Err;
        let errorMsg = "Transfer failed";

        if ('InsufficientFunds' in error) {
          errorMsg = `Insufficient funds. Balance: ${decimalsToUSDT(error.InsufficientFunds.balance)} USDT`;
        } else if ('BadFee' in error) {
          errorMsg = `Incorrect fee. Expected: ${decimalsToUSDT(error.BadFee.expected_fee)} USDT`;
        } else if ('GenericError' in error) {
          errorMsg = error.GenericError.message;
        } else if ('TemporarilyUnavailable' in error) {
          errorMsg = "Service temporarily unavailable. Please try again.";
        }

        setIsLoading(false);
        setErrorMessage(errorMsg);
        setShowError(true);
      }
    } catch (error) {
      console.error('Transfer error:', error);
      setIsLoading(false);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setShowError(true);
    }
  };

  // Calculate available balance display
  const availableBalanceUSDT = balance ? decimalsToUSDT(balance) : 0;
  const isFormValid = destinationPrincipal && amount && !principalError && parseFloat(amount) > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-pure-white mb-6">Send ckUSDT</h1>

      {!isAuthenticated ? (
        <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">Please connect your wallet to send ckUSDT</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form - Left Side */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-gray-900 border border-pure-white/20 rounded-lg p-6">
              {/* Step 1: Token Display */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-dfinity-turquoise text-pure-black text-xs font-bold mr-2">1</span>
                  Token
                </label>
                <div className="bg-gray-800 border border-pure-white/10 rounded p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-pure-white font-bold">
                      $
                    </div>
                    <div>
                      <div className="text-pure-white font-bold">ckUSDT</div>
                      <div className="text-xs text-gray-400">Fee: ~0.000002 USDT</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Destination Principal */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-dfinity-turquoise text-pure-black text-xs font-bold mr-2">2</span>
                  Recipient Principal ID
                </label>
                <input
                  type="text"
                  value={destinationPrincipal}
                  onChange={handlePrincipalChange}
                  placeholder="Enter recipient's Principal ID"
                  className={`w-full bg-gray-800 border ${principalError ? 'border-red-500' : 'border-pure-white/10'} rounded px-4 py-3 text-pure-white placeholder-gray-500 focus:outline-none focus:border-dfinity-turquoise`}
                />
                {principalError && (
                  <p className="text-red-500 text-sm mt-2">{principalError}</p>
                )}
              </div>

              {/* Step 3: Amount */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-dfinity-turquoise text-pure-black text-xs font-bold mr-2">3</span>
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    step="0.000001"
                    min="0"
                    className="w-full bg-gray-800 border border-pure-white/10 rounded px-4 py-3 pr-20 text-pure-white placeholder-gray-500 focus:outline-none focus:border-dfinity-turquoise"
                  />
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-dfinity-turquoise/20 hover:bg-dfinity-turquoise/30 text-dfinity-turquoise text-sm font-bold rounded transition-colors"
                  >
                    MAX
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-pure-white text-xs font-bold">
                    $
                  </div>
                  <span>Available: {availableBalanceUSDT.toFixed(6)} USDT</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid}
                className="w-full py-4 bg-dfinity-turquoise hover:bg-dfinity-turquoise/80 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-pure-black font-bold rounded transition-colors"
              >
                Send ckUSDT
              </button>
            </form>
          </div>

          {/* Transaction Summary - Right Side */}
          <div className="lg:col-span-1">
            <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-6 sticky top-4">
              <h3 className="text-lg font-bold text-pure-white mb-4">Transaction Summary</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Send Amount</span>
                  <span className="text-pure-white font-mono">
                    {amount || '0.00'} USDT
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Network Fee</span>
                  <span className="text-pure-white font-mono">
                    ~0.000002 USDT
                  </span>
                </div>

                <div className="border-t border-pure-white/10 pt-3 flex justify-between">
                  <span className="text-gray-400">Send To</span>
                  <span className="text-pure-white font-mono text-xs truncate ml-2 max-w-[150px]" title={destinationPrincipal}>
                    {destinationPrincipal || '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <LoadingModal
        isOpen={isLoading}
        title="Transfer in Progress"
        message="Your transaction is being processed on the Internet Computer..."
      />

      <SuccessModal
        isOpen={showSuccess}
        title="Transfer Successful!"
        message="Your ckUSDT has been sent successfully."
        onClose={() => setShowSuccess(false)}
      />

      <ErrorModal
        isOpen={showError}
        title="Transfer Failed"
        message={errorMessage}
        onClose={() => setShowError(false)}
      />
    </div>
  );
};
```

### Step 5: Add Send Route to App

**File**: `openhouse_frontend/src/App.tsx` (MODIFY)

```typescript
// PSEUDOCODE - Add import and route for Send page

// Add to imports at top
import { Send } from './pages/Send';

// Add route in Routes component (after line 32)
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/dice" element={<DiceLayout />}>
    <Route index element={<DiceGame />} />
    <Route path="liquidity" element={<DiceLiquidity />} />
  </Route>
  <Route path="/plinko" element={<Plinko />} />
  <Route path="/crash" element={<Crash />} />
  <Route path="/blackjack" element={<Blackjack />} />
  <Route path="/send" element={<Send />} />  {/* 🆕 ADD THIS LINE */}
  <Route path="/admin" element={<Admin />} />
</Routes>
```

### Step 6: Add Send Link to Layout Navigation

**File**: `openhouse_frontend/src/components/Layout.tsx` (MODIFY)

```typescript
// PSEUDOCODE - Add Send link to header navigation

// In the header section (around line 40), add a Send link next to AuthButton
<div className="flex items-center gap-4">
  <div className="flex items-center gap-4">
    <Link to="/" className="hover:opacity-80 transition-opacity">
      <img
        src="/logos/logo_icon.png"
        alt="OpenHouse"
        className="w-24 h-24 pixelated"
        style={{ imageRendering: 'pixelated' }}
      />
    </Link>
    <button
      onClick={() => setShowModal(true)}
      className="text-gray-500 hover:text-gray-300 text-[10px] transition-colors hidden sm:flex flex-col items-start leading-tight whitespace-nowrap"
    >
      <span>Player-owned.</span>
      <span>Provably fair.</span>
      <span className="text-dfinity-turquoise">Learn more</span>
    </button>
  </div>

  {/* 🆕 ADD: Send link */}
  <div className="flex items-center gap-3">
    <Link
      to="/send"
      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-pure-white text-sm font-medium rounded border border-pure-white/10 transition-colors"
    >
      Send
    </Link>
    <AuthButton />
  </div>
</div>
```

---

## Testing Plan (Manual Verification on Mainnet)

### Pre-Deployment Checks
```bash
# 1. Build frontend to check for TypeScript errors
cd openhouse_frontend
npm run build

# Should complete without errors
```

### Post-Deployment Manual Tests

#### Test 1: Visit Send Page
```bash
# Open browser to:
https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/send

# Expected: Send page loads with 3-step form
```

#### Test 2: Authentication Check
```
1. Visit /send while NOT logged in
   Expected: "Please connect your wallet" message

2. Click "Connect Wallet" in header
   Expected: Internet Identity login flow

3. After login, return to /send
   Expected: Form is now active with balance displayed
```

#### Test 3: Principal Validation
```
1. Enter invalid principal: "abc123"
   Expected: Red error message "Invalid Principal ID format"

2. Enter valid principal: "aaaaa-aa" (IC management canister)
   Expected: Error clears, form becomes valid
```

#### Test 4: Amount Input
```
1. Enter amount greater than balance
   Expected: Submit shows error "Insufficient balance"

2. Click "MAX" button
   Expected: Amount field populates with (balance - 0.000002) USDT

3. Enter amount: 0.01 USDT
   Expected: Transaction summary updates on right side
```

#### Test 5: Send Transaction (REAL MAINNET TEST)
```
⚠️ WARNING: This will send REAL ckUSDT on mainnet!

1. Ensure you have ckUSDT balance
2. Enter recipient principal (use your own test principal)
3. Enter small amount: 0.01 USDT
4. Click "Send ckUSDT"
   Expected:
   - Loading modal appears with spinner
   - After 2-5 seconds, success modal appears
   - Balance refreshes automatically
   - Form clears

5. Verify recipient received funds:
   dfx canister --network ic call cngnf-vqaaa-aaaar-qag4q-cai icrc1_balance_of \
     '(record { owner = principal "RECIPIENT_PRINCIPAL"; subaccount = null })'
```

#### Test 6: Error Handling
```
1. Disconnect internet, try to send
   Expected: Error modal with network error message

2. Enter amount = 0, try to send
   Expected: Button remains disabled

3. Clear principal field, try to send
   Expected: Validation error prevents submission
```

#### Test 7: UI Responsiveness
```
1. Test on mobile device (or browser responsive mode)
   Expected: Form stacks vertically, remains usable

2. Test summary panel
   Expected: Sticks to top on desktop, flows naturally on mobile
```

---

## Deployment Notes

### Affected Components
- **Frontend Only**: No backend canister changes required
- **Canister**: `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai)
- **External Integration**: ckUSDT Ledger (cngnf-vqaaa-aaaar-qag4q-cai) - read-only, already integrated

### Deployment Command
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

### Rollback Plan (if needed)
```bash
# If critical issues found, revert to previous commit
git revert HEAD
cd openhouse_frontend && npm run build && cd ..
./deploy.sh --frontend-only
```

---

## Success Criteria

✅ Users can navigate to `/send` page
✅ Form validates principal IDs in real-time
✅ Max button correctly calculates balance minus fee
✅ Successful transfers show success modal and refresh balance
✅ Failed transfers show error modal with clear message
✅ UI is responsive on mobile and desktop
✅ No TypeScript compilation errors
✅ Send link visible in header navigation

---

## References

### Alexandria Implementation
- Send Tab: `/home/theseus/alexandria/core/src/alex_frontend/src/features/swap/components/send/sendContent.tsx`
- Transfer Thunk: `/home/theseus/alexandria/core/src/alex_frontend/src/features/swap/thunks/lbryIcrc/transferLBRY.ts`
- Modal Components: `/home/theseus/alexandria/core/src/alex_frontend/src/features/swap/components/`

### OpenHouse Existing Patterns
- Auth Hook: `openhouse_frontend/src/providers/AuthProvider.tsx`
- Balance Hook: `openhouse_frontend/src/providers/BalanceProvider.tsx`
- Ledger Actor: `openhouse_frontend/src/hooks/actors/useLedgerActor.ts`
- Layout: `openhouse_frontend/src/components/Layout.tsx`

### Internet Computer Documentation
- ICRC-1 Standard: https://internetcomputer.org/docs/current/developer-docs/integrations/icrc-1
- ckUSDT Ledger: https://dashboard.internetcomputer.org/canister/cngnf-vqaaa-aaaar-qag4q-cai

---

## Post-PR Review Iteration

After PR creation, the autonomous agent will:
1. Monitor for review comments every 5 minutes
2. Prioritize P0 (blocking) issues
3. Fix issues immediately and push updates
4. Continue until approval or max 5 iterations
5. Escalate to human if issues persist after 5 iterations

Common P0 issues to watch for:
- TypeScript compilation errors
- Transfer failures on mainnet
- UI breaking on mobile
- Principal validation bugs
- Balance not refreshing after transfer
