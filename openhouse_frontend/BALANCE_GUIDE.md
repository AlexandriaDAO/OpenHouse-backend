# ckUSDT Balance Management Guide

This guide explains how the OpenHouse frontend interacts with the centralized ckUSDT balance management system in the backend.

## Overview

OpenHouse uses a **centralized ckUSDT treasury** model for each game:
1. **House Balance**: The total pool of funds available for payouts (Liquidity Pool)
2. **User Game Balance**: Funds deposited by the user into the game canister for betting
3. **Wallet Balance**: Funds in the user's main wallet (ckUSDT Ledger)

Each game runs in its own canister and manages its own treasury.

## Ledger Connection

The frontend connects to the ckUSDT Ledger canister (`cngnf-vqaaa-aaaar-qag4q-cai`) on the IC mainnet.

### Ledger Actor Setup
Using `useLedgerActor` hook:
```typescript
// src/hooks/actors/useLedgerActor.ts
import { createActorHook } from 'ic-use-actor';
import { ckUSDTLedgerService } from '../../types/ledger';
import { ledgerIdlFactory } from '../../utils/ledgerIdl';

const CKUSDT_LEDGER_CANISTER_ID = 'cngnf-vqaaa-aaaar-qag4q-cai';

const useLedgerActor = createActorHook<ckUSDTLedgerService>({
  canisterId: CKUSDT_LEDGER_CANISTER_ID,
  idlFactory: ledgerIdlFactory,
});
```

## Types & Interfaces

### Balance Types
Defined in `src/types/balance.ts`:

```typescript
// 1 ckUSDT = 1,000,000 decimals (6 decimal places)
export const DECIMALS_PER_CKUSDT = 1_000_000;

export interface GameBalance {
  wallet: bigint;  // Balance in user's main wallet (ckUSDT Ledger)
  game: bigint;    // Balance deposited in game canister
  house: bigint;   // Total liquidity available for payouts
}
```

### Ledger Service Interface
Defined in `src/types/ledger.ts`:

```typescript
export interface ckUSDTLedgerService {
  // ICRC-1 standard method
  icrc1_balance_of: (account: Account) => Promise<bigint>;

  // ICRC-2 standard method
  icrc2_approve: (args: ApproveArgs) => Promise<ApproveResult>;

  // Legacy method (backup)
  account_balance: (args: { account: Uint8Array }) => Promise<Tokens>;
}
```

## Balance Provider

The `GameBalanceProvider` manages state for all game types:

```typescript
// src/providers/GameBalanceProvider.tsx

export const GameBalanceProvider: React.FC = ({ children }) => {
  // State holds balances for each game type
  const [state, setState] = useState<BalanceProviderState>({
    balances: {
      dice: { wallet: 0n, game: 0n, house: 0n },
      crash: { wallet: 0n, game: 0n, house: 0n },
      // ... other games
    },
    // ... status tracking
  });

  // Fetch logic fetches all 3 balances in parallel
  const fetchBalances = async (game: GameType) => {
    // 1. Fetch Game & House Balance from Game Backend
    const [gameBal, houseBal] = await Promise.all([
      gameActor.get_my_balance(),
      gameActor.get_house_balance()
    ]);

    // 2. Fetch Wallet Balance from Ledger
    const walletBal = await ledgerActor.icrc1_balance_of({
      owner: principal,
      subaccount: []
    });

    return { wallet: walletBal, game: gameBal, house: houseBal };
  };
}
```

## Displaying Balances

Use the `formatUSDT` helper for consistent formatting:

```typescript
// src/types/ledger.ts
export function decimalsToUSDT(decimals: bigint): number {
  return Number(decimals) / 1_000_000;
}

export function formatUSDT(decimals: bigint): string {
  const usdt = decimalsToUSDT(decimals);
  return `$${usdt.toFixed(2)} USDT`;
}
```

**Example Usage:**
```typescript
import { formatUSDT } from '../../types/ledger';

// Display: "$10.50 USDT"
<span>{formatUSDT(balance.game)}</span>
```

## Deposit Flow (ICRC-2)

Depositing requires a 2-step ICRC-2 "Approve & Transfer From" flow:

1. **Approve**: User authorizes game canister to spend ckUSDT
2. **Deposit**: User calls game canister to pull the funds

```typescript
// 1. Approve (Frontend -> Ledger)
await ledgerActor.icrc2_approve({
  spender: { owner: GAME_CANISTER_ID, subaccount: [] },
  amount: depositAmount + FEE,
});

// 2. Deposit (Frontend -> Game Backend)
// Backend calls icrc2_transfer_from to pull funds
await gameActor.deposit(depositAmount);
```

## Withdrawal Flow

Withdrawals are handled directly by the game canister:

```typescript
// Frontend -> Game Backend
// Backend sends funds via icrc1_transfer
await gameActor.withdraw_all();
```

## Implementation Checklist

When adding a new game:

1. **Add Game Type**: Update `GameType` in `src/types/balance.ts`
2. **Add Actor Hook**: Create `useNewGameActor.ts`
3. **Update Provider**: Add case to `fetchBalances` in `GameBalanceProvider.tsx`
4. **Add UI**: Create `NewGame.tsx` using `useGameBalance('newgame')`

## Common Issues & Solutions

### 1. Decimals Mismatch
- **Issue**: Backend returns 1_000_000 but frontend divides by 100_000_000 (old ICP code).
- **Fix**: Ensure all frontend calculations use `1_000_000` or `DECIMALS_PER_CKUSDT`.

### 2. Wallet Balance Not Updating
- **Issue**: Ledger queries are fast, but block propagation can take 1-2s.
- **Fix**: `GameBalanceProvider` includes optimistic updates and polling.

### 3. House Balance = 0
- **Issue**: Canister ran out of cycles or liquidity.
- **Fix**: Check `dfx canister status` and top up liquidity.

## Reference Values

- **ckUSDT Decimals**: 6
- **Transfer Fee**: 10,000 decimals (0.01 USDT)
- **Balance Unit**: decimals (1 USDT = 1,000,000 decimals)