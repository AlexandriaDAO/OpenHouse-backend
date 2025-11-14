# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-accounting"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-accounting`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build dice backend
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet (deploys all canisters - simplest approach)
     ./deploy.sh
     ```
   - Frontend changes:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh
     ```
   - Both backend + frontend:
     ```bash
     cargo build --target wasm32-unknown-unknown --release
     cd openhouse_frontend && npm run build && cd ..
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): add internal accounting with deposit/withdraw

Implements internal accounting system for dice game canister:
- Deposit/withdraw ICP via ICRC-1 standard
- Internal balance tracking per user
- House balance = canister balance - user deposits
- Max bet capped by house balance
- Audit functions for balance verification
- Frontend UI for deposit/withdraw operations

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
   git push -u origin feature/dice-internal-accounting
   gh pr create --title "[Feature]: Dice Internal Accounting" --body "Implements DICE_INTERNAL_ACCOUNTING_PLAN.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: dice_backend (whchi-hyaaa-aaaao-a4ruq-cai)"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
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

**Branch:** `feature/dice-internal-accounting`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-accounting`

---

# Implementation Plan: Dice Internal Accounting

## Feature Overview

Add complete internal accounting to the dice_backend canister, making it the reference implementation for other games to follow. This system enables users to deposit ICP into the dice game, play with internal balances (no ICP transfers during gameplay), and withdraw winnings.

### Key Design Principles

1. **Isolation**: Each game manages its own funds - if exploited, only that game's funds are at risk
2. **No Subaccounts**: All ICP goes to canister's default account (simplest approach)
3. **Internal Tracking**: HashMap<Principal, u64> tracks user balances in e8s
4. **Implicit House Balance**: house_balance = total_canister_icp - sum(user_deposits)
5. **Dynamic Max Bet**: Capped by current house balance (prevent insolvency)
6. **ICRC-1 Standard**: Use official ICP ledger for deposits/withdrawals

---

## Current State Analysis

### Backend: `dice_backend/src/lib.rs` (651 lines)

**Existing Features:**
- ✅ Dice game logic complete (lines 319-422)
- ✅ VRF-based randomness with seed rotation (lines 166-232)
- ✅ Stats tracking: total_games, volume, payouts, house_profit (lines 123-129, 398-404)
- ✅ Game history stored in StableBTreeMap (lines 143-156)
- ✅ Provable fairness verification (lines 590-650)
- ✅ TODO comment at line 417: "Actually transfer ICP for bet and payout"

**Current Constants:**
- MIN_BET = 100_000_000 (1 ICP) - line 92
- MAX_BET = 10_000_000_000 (100 ICP) - line 93
- HOUSE_EDGE = 0.03 (3%) - line 94

**Missing Features:**
- ❌ No deposit() function
- ❌ No withdraw() function
- ❌ No user balance tracking
- ❌ No ICP transfer capability
- ❌ No house balance calculation
- ❌ No max bet enforcement based on house funds

### Frontend: `openhouse_frontend/src/pages/Dice.tsx` (225 lines)

**Existing Features:**
- ✅ Complete dice game UI (lines 1-225)
- ✅ Wallet balance display via BalanceProvider (imported but not used for deposits)
- ✅ Bet amount input (lines 157-163)
- ✅ Practice mode toggle (lines 153)

**Missing Features:**
- ❌ No deposit UI
- ❌ No withdraw UI
- ❌ No dice game balance display (separate from wallet balance)
- ❌ No balance transfer flow

### Frontend: `openhouse_frontend/src/providers/BalanceProvider.tsx` (85 lines)

**Existing Features:**
- ✅ Fetches wallet ICP balance from ledger (lines 23-53)
- ✅ Context provides: balance, isLoading, error, refreshBalance
- ✅ ICRC-1 integration already implemented

---

## File Structure Changes

### New Files
```
dice_backend/
  src/
    accounting.rs          [NEW] - Deposit/withdraw logic, balance tracking
    icp_transfer.rs        [NEW] - ICRC-1 transfer utilities

openhouse_frontend/
  src/
    components/
      game-specific/
        dice/
          DiceAccountingPanel.tsx  [NEW] - Deposit/withdraw UI
```

### Modified Files
```
dice_backend/
  src/
    lib.rs                 [MODIFY] - Import accounting, update play_dice
  dice_backend.did         [MODIFY] - Add new public methods
  Cargo.toml               [MODIFY] - Add dependencies

openhouse_frontend/
  src/
    pages/
      Dice.tsx             [MODIFY] - Add accounting panel
    hooks/
      actors/
        useDiceActor.ts    [MODIFY] - Add new method types
```

---

## Backend Implementation

### 1. New File: `dice_backend/src/accounting.rs`

```rust
// PSEUDOCODE - Accounting module for dice game

use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{query, update};
use ic_stable_structures::{StableBTreeMap, DefaultMemoryImpl, memory_manager::{MemoryId, VirtualMemory}};
use std::cell::RefCell;
use std::collections::HashMap;

// Constants
const ICP_LEDGER_CANISTER: &str = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const ICP_TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP in e8s
const MIN_DEPOSIT: u64 = 100_000_000; // 1 ICP
const MIN_WITHDRAW: u64 = 10_000_000; // 0.1 ICP

type Memory = VirtualMemory<DefaultMemoryImpl>;

// User balance tracking (in-memory + stable backup)
thread_local! {
    // In-memory for fast access
    static USER_BALANCES: RefCell<HashMap<Principal, u64>> = RefCell::new(HashMap::new());
    
    // Stable storage for persistence across upgrades
    static USER_BALANCES_STABLE: RefCell<StableBTreeMap<Principal, u64, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(10))), // Use memory ID 10
        )
    );
    
    // Track total user deposits for house balance calculation
    static TOTAL_USER_DEPOSITS: RefCell<u64> = RefCell::new(0);
}

#[derive(CandidType, Deserialize)]
pub struct AccountingStats {
    pub total_user_deposits: u64,
    pub house_balance: u64,
    pub canister_balance: u64,
    pub unique_depositors: u64,
}

// =============================================================================
// DEPOSIT FUNCTION
// =============================================================================

#[update]
pub async fn deposit(amount: u64) -> Result<u64, String> {
    // STEP 1: Validate deposit amount
    if amount < MIN_DEPOSIT {
        return Err(format!("Minimum deposit is {} ICP", MIN_DEPOSIT / 100_000_000));
    }
    
    let caller = ic_cdk::caller();
    
    // STEP 2: Transfer ICP from user to canister using ICRC-1
    // Call icrc1_transfer on ICP ledger canister
    let transfer_args = TransferArgs {
        from_subaccount: None,
        to: Account {
            owner: ic_cdk::id(), // This canister's principal
            subaccount: None,    // Default subaccount
        },
        amount: amount,
        fee: Some(ICP_TRANSFER_FEE),
        memo: None,
        created_at_time: None,
    };
    
    let ledger = Principal::from_text(ICP_LEDGER_CANISTER).unwrap();
    let result: Result<BlockIndex, TransferError> = 
        ic_cdk::call(ledger, "icrc1_transfer", (transfer_args,)).await.map_err(|e| format!("Transfer call failed: {:?}", e))?;
    
    match result {
        Ok(block_index) => {
            // STEP 3: Update user balance
            let new_balance = USER_BALANCES.with(|balances| {
                let mut balances = balances.borrow_mut();
                let current = balances.get(&caller).unwrap_or(&0);
                let new_bal = current + amount;
                balances.insert(caller, new_bal);
                new_bal
            });
            
            // STEP 4: Persist to stable storage
            USER_BALANCES_STABLE.with(|stable| {
                stable.borrow_mut().insert(caller, new_balance);
            });
            
            // STEP 5: Update total deposits
            TOTAL_USER_DEPOSITS.with(|total| {
                *total.borrow_mut() += amount;
            });
            
            ic_cdk::println!("Deposit successful: {} deposited {} e8s (block {})", caller, amount, block_index);
            Ok(new_balance)
        }
        Err(transfer_error) => {
            Err(format!("Transfer failed: {:?}", transfer_error))
        }
    }
}

// =============================================================================
// WITHDRAW FUNCTION
// =============================================================================

#[update]
pub async fn withdraw(amount: u64) -> Result<u64, String> {
    // STEP 1: Validate withdrawal amount
    if amount < MIN_WITHDRAW {
        return Err(format!("Minimum withdrawal is {} ICP", MIN_WITHDRAW / 100_000_000));
    }
    
    let caller = ic_cdk::caller();
    
    // STEP 2: Check user has sufficient balance
    let user_balance = get_balance(caller);
    if user_balance < amount {
        return Err(format!("Insufficient balance. You have {} e8s, trying to withdraw {} e8s", user_balance, amount));
    }
    
    // STEP 3: Deduct from user balance FIRST (prevent re-entrancy)
    let new_balance = USER_BALANCES.with(|balances| {
        let mut balances = balances.borrow_mut();
        let new_bal = user_balance - amount;
        balances.insert(caller, new_bal);
        new_bal
    });
    
    // STEP 4: Persist to stable storage
    USER_BALANCES_STABLE.with(|stable| {
        stable.borrow_mut().insert(caller, new_balance);
    });
    
    // STEP 5: Update total deposits
    TOTAL_USER_DEPOSITS.with(|total| {
        *total.borrow_mut() -= amount;
    });
    
    // STEP 6: Transfer ICP from canister to user
    let transfer_args = TransferArgs {
        from_subaccount: None,
        to: Account {
            owner: caller,
            subaccount: None,
        },
        amount: amount - ICP_TRANSFER_FEE, // Deduct fee from withdrawal
        fee: Some(ICP_TRANSFER_FEE),
        memo: None,
        created_at_time: None,
    };
    
    let ledger = Principal::from_text(ICP_LEDGER_CANISTER).unwrap();
    let result: Result<BlockIndex, TransferError> = 
        ic_cdk::call(ledger, "icrc1_transfer", (transfer_args,)).await.map_err(|e| {
            // ROLLBACK on failure
            USER_BALANCES.with(|balances| {
                balances.borrow_mut().insert(caller, user_balance); // Restore
            });
            USER_BALANCES_STABLE.with(|stable| {
                stable.borrow_mut().insert(caller, user_balance);
            });
            TOTAL_USER_DEPOSITS.with(|total| {
                *total.borrow_mut() += amount;
            });
            format!("Transfer call failed: {:?}", e)
        })?;
    
    match result {
        Ok(block_index) => {
            ic_cdk::println!("Withdrawal successful: {} withdrew {} e8s (block {})", caller, amount, block_index);
            Ok(new_balance)
        }
        Err(transfer_error) => {
            // ROLLBACK on transfer error
            USER_BALANCES.with(|balances| {
                balances.borrow_mut().insert(caller, user_balance);
            });
            USER_BALANCES_STABLE.with(|stable| {
                stable.borrow_mut().insert(caller, user_balance);
            });
            TOTAL_USER_DEPOSITS.with(|total| {
                *total.borrow_mut() += amount;
            });
            Err(format!("Transfer failed: {:?}", transfer_error))
        }
    }
}

// =============================================================================
// BALANCE QUERIES
// =============================================================================

#[query]
pub fn get_balance(user: Principal) -> u64 {
    USER_BALANCES.with(|balances| {
        *balances.borrow().get(&user).unwrap_or(&0)
    })
}

#[query]
pub fn get_my_balance() -> u64 {
    get_balance(ic_cdk::caller())
}

#[query]
pub fn get_house_balance() -> u64 {
    // House balance = Total canister balance - Total user deposits
    let canister_balance = get_canister_balance();
    let total_deposits = TOTAL_USER_DEPOSITS.with(|total| *total.borrow());
    
    if canister_balance > total_deposits {
        canister_balance - total_deposits
    } else {
        0 // Should never happen unless exploited
    }
}

#[query]
pub fn get_canister_balance() -> u64 {
    // Query the canister's ICP balance from ledger
    // NOTE: This is async, so in practice we'd cache this or make it an update call
    // For simplicity, return 0 for now - implement in lib.rs with async call
    0 // Placeholder - implement in lib.rs
}

#[query]
pub fn get_accounting_stats() -> AccountingStats {
    let total_deposits = TOTAL_USER_DEPOSITS.with(|total| *total.borrow());
    let unique_depositors = USER_BALANCES.with(|balances| balances.borrow().len() as u64);
    let canister_balance = get_canister_balance();
    let house_balance = if canister_balance > total_deposits {
        canister_balance - total_deposits
    } else {
        0
    };
    
    AccountingStats {
        total_user_deposits: total_deposits,
        house_balance,
        canister_balance,
        unique_depositors,
    }
}

// =============================================================================
// AUDIT FUNCTIONS
// =============================================================================

#[query]
pub fn audit_balances() -> Result<String, String> {
    // Verify: house_balance + sum(user_balances) = canister_balance
    let total_deposits = TOTAL_USER_DEPOSITS.with(|total| *total.borrow());
    let house_balance = get_house_balance();
    let canister_balance = get_canister_balance();
    
    let calculated_total = house_balance + total_deposits;
    
    if calculated_total == canister_balance {
        Ok(format!("✅ Audit passed: house ({}) + deposits ({}) = canister ({})", 
                   house_balance, total_deposits, canister_balance))
    } else {
        Err(format!("❌ Audit FAILED: house ({}) + deposits ({}) = {} != canister ({})",
                    house_balance, total_deposits, calculated_total, canister_balance))
    }
}

// =============================================================================
// UPGRADE HOOKS
// =============================================================================

pub fn pre_upgrade_accounting() {
    // USER_BALANCES_STABLE already persists data
    // Save TOTAL_USER_DEPOSITS to stable cell
    // TODO: Implement stable cell for total deposits
}

pub fn post_upgrade_accounting() {
    // Restore in-memory HashMap from stable storage
    USER_BALANCES_STABLE.with(|stable| {
        USER_BALANCES.with(|memory| {
            let mut memory = memory.borrow_mut();
            memory.clear();
            
            let mut total = 0u64;
            for (principal, balance) in stable.borrow().iter() {
                memory.insert(principal, balance);
                total += balance;
            }
            
            // Restore total deposits
            TOTAL_USER_DEPOSITS.with(|t| {
                *t.borrow_mut() = total;
            });
        });
    });
}
```

### 2. Modified File: `dice_backend/src/lib.rs`

**Changes Required:**

```rust
// PSEUDOCODE - Modifications to lib.rs

// STEP 1: Add accounting module (at top of file, around line 10)
mod accounting;
use accounting::*;

// STEP 2: Add ICRC-1 types for transfers (around line 10)
use ic_ledger_types::{
    AccountIdentifier, BlockIndex, Memo, Tokens, TransferArgs, TransferError,
    MAINNET_LEDGER_CANISTER_ID,
};

// STEP 3: Update play_dice function (lines 319-422)
// Replace line 321 with:
async fn play_dice(bet_amount: u64, target_number: u8, direction: RollDirection, client_seed: String) -> Result<DiceResult, String> {
    // NEW: Check user has sufficient internal balance
    let caller = ic_cdk::caller();
    let user_balance = accounting::get_balance(caller);
    
    if user_balance < bet_amount {
        return Err(format!("Insufficient balance. You have {} e8s, need {} e8s. Please deposit more ICP.", 
                          user_balance, bet_amount));
    }
    
    // NEW: Calculate max bet based on house balance
    let house_balance = accounting::get_house_balance();
    let max_payout = (bet_amount as f64 * 100.0) as u64; // Max 100x multiplier
    
    if max_payout > house_balance {
        return Err(format!("Bet too large. House only has {} e8s, max payout would be {} e8s", 
                          house_balance, max_payout));
    }
    
    // ... existing validation code (lines 322-362) ...
    
    // ... existing game logic (lines 363-395) ...
    
    // NEW: Update user balance instead of TODO comment (replace line 417-419)
    if is_win {
        // Add winnings to user balance
        let new_balance = user_balance - bet_amount + payout;
        accounting::update_balance(caller, new_balance)?;
    } else {
        // Deduct bet from user balance
        let new_balance = user_balance - bet_amount;
        accounting::update_balance(caller, new_balance)?;
    }
    
    // ... existing stats and history code (lines 398-416) ...
}

// STEP 4: Add canister balance query (around line 426)
#[update]
async fn get_canister_balance() -> u64 {
    let account = Account {
        owner: ic_cdk::id(),
        subaccount: None,
    };
    
    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let balance: Result<u64, String> = ic_cdk::call(ledger, "icrc1_balance_of", (account,))
        .await
        .map_err(|e| format!("Failed to query balance: {:?}", e));
    
    balance.unwrap_or(0)
}

// STEP 5: Update upgrade hooks (lines 235-252)
#[pre_upgrade]
fn pre_upgrade() {
    // Existing seed state preservation
    // NEW: Add accounting preservation
    accounting::pre_upgrade_accounting();
}

#[post_upgrade]
fn post_upgrade() {
    // Existing seed state restoration
    // NEW: Add accounting restoration
    accounting::post_upgrade_accounting();
}
```

### 3. Modified File: `dice_backend/dice_backend.did`

```candid
// PSEUDOCODE - Add new methods to Candid interface

// Add types
type AccountingStats = record {
  total_user_deposits: nat64;
  house_balance: nat64;
  canister_balance: nat64;
  unique_depositors: nat64;
};

// Add to service section
service : {
  // ... existing methods ...
  
  // NEW: Accounting methods
  deposit: (nat64) -> (variant { Ok: nat64; Err: text });
  withdraw: (nat64) -> (variant { Ok: nat64; Err: text });
  get_balance: (principal) -> (nat64) query;
  get_my_balance: () -> (nat64) query;
  get_house_balance: () -> (nat64) query;
  get_canister_balance: () -> (nat64);
  get_accounting_stats: () -> (AccountingStats) query;
  audit_balances: () -> (variant { Ok: text; Err: text }) query;
}
```

### 4. Modified File: `dice_backend/Cargo.toml`

```toml
# PSEUDOCODE - Add dependencies

[dependencies]
# ... existing dependencies ...
ic-ledger-types = "0.10"
```

---

## Frontend Implementation

### 1. New File: `openhouse_frontend/src/components/game-specific/dice/DiceAccountingPanel.tsx`

```typescript
// PSEUDOCODE - Deposit/Withdraw UI component

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../providers/AuthProvider';
import { useBalance } from '../../../providers/BalanceProvider';
import useDiceActor from '../../../hooks/actors/useDiceActor';

interface DiceAccountingPanelProps {
  gameBalance: bigint | null;
  onBalanceChange: () => void;
}

export const DiceAccountingPanel: React.FC<DiceAccountingPanelProps> = ({
  gameBalance,
  onBalanceChange,
}) => {
  const { isAuthenticated } = useAuth();
  const { balance: walletBalance, refreshBalance } = useBalance();
  const { actor } = useDiceActor();
  
  const [depositAmount, setDepositAmount] = useState('1');
  const [withdrawAmount, setWithdrawAmount] = useState('1');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // STEP 1: Handle deposit
  const handleDeposit = async () => {
    if (!actor || !isAuthenticated) return;
    
    setIsDepositing(true);
    setError(null);
    setSuccess(null);
    
    try {
      const amountE8s = BigInt(Math.floor(parseFloat(depositAmount) * 100_000_000));
      
      // Validate amount
      if (amountE8s < BigInt(100_000_000)) {
        setError('Minimum deposit is 1 ICP');
        setIsDepositing(false);
        return;
      }
      
      if (walletBalance && amountE8s > walletBalance) {
        setError('Insufficient wallet balance');
        setIsDepositing(false);
        return;
      }
      
      // Call deposit
      const result = await actor.deposit(amountE8s);
      
      if ('Ok' in result) {
        const newBalance = result.Ok;
        setSuccess(`Deposited ${depositAmount} ICP! New balance: ${Number(newBalance) / 100_000_000} ICP`);
        setDepositAmount('1');
        
        // Refresh balances
        await refreshBalance(); // Wallet balance
        onBalanceChange(); // Game balance
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
    }
  };
  
  // STEP 2: Handle withdraw
  const handleWithdraw = async () => {
    if (!actor || !isAuthenticated) return;
    
    setIsWithdrawing(true);
    setError(null);
    setSuccess(null);
    
    try {
      const amountE8s = BigInt(Math.floor(parseFloat(withdrawAmount) * 100_000_000));
      
      // Validate amount
      if (amountE8s < BigInt(10_000_000)) {
        setError('Minimum withdrawal is 0.1 ICP');
        setIsWithdrawing(false);
        return;
      }
      
      if (gameBalance && amountE8s > gameBalance) {
        setError('Insufficient game balance');
        setIsWithdrawing(false);
        return;
      }
      
      // Call withdraw
      const result = await actor.withdraw(amountE8s);
      
      if ('Ok' in result) {
        const newBalance = result.Ok;
        setSuccess(`Withdrew ${withdrawAmount} ICP! New balance: ${Number(newBalance) / 100_000_000} ICP`);
        setWithdrawAmount('1');
        
        // Refresh balances
        await refreshBalance(); // Wallet balance
        onBalanceChange(); // Game balance
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };
  
  // STEP 3: Format balances
  const formatBalance = (e8s: bigint | null): string => {
    if (e8s === null) return 'Loading...';
    return (Number(e8s) / 100_000_000).toFixed(8);
  };
  
  if (!isAuthenticated) {
    return (
      <div className="card max-w-2xl mx-auto">
        <p className="text-center text-gray-400">Please log in to manage funds</p>
      </div>
    );
  }
  
  return (
    <div className="card max-w-2xl mx-auto">
      <h3 className="text-xl font-bold mb-4 text-center">💰 Manage Funds</h3>
      
      {/* Balance Display */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-purple-900/20 p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-gray-400 mb-1">Wallet Balance</p>
          <p className="text-2xl font-bold text-purple-400">{formatBalance(walletBalance)} ICP</p>
        </div>
        <div className="bg-green-900/20 p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-gray-400 mb-1">Dice Balance</p>
          <p className="text-2xl font-bold text-green-400">{formatBalance(gameBalance)} ICP</p>
        </div>
      </div>
      
      {/* Deposit Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Deposit to Dice Game</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2"
            placeholder="Amount in ICP"
            min="1"
            step="0.1"
            disabled={isDepositing}
          />
          <button
            onClick={handleDeposit}
            disabled={isDepositing}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded font-bold disabled:opacity-50"
          >
            {isDepositing ? 'Depositing...' : 'Deposit'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Minimum: 1 ICP</p>
      </div>
      
      {/* Withdraw Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Withdraw from Dice Game</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2"
            placeholder="Amount in ICP"
            min="0.1"
            step="0.1"
            disabled={isWithdrawing}
          />
          <button
            onClick={handleWithdraw}
            disabled={isWithdrawing}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded font-bold disabled:opacity-50"
          >
            {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Minimum: 0.1 ICP (fee: 0.0001 ICP)</p>
      </div>
      
      {/* Messages */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/20 border border-green-500 text-green-400 px-4 py-3 rounded">
          {success}
        </div>
      )}
    </div>
  );
};
```

### 2. Modified File: `openhouse_frontend/src/pages/Dice.tsx`

```typescript
// PSEUDOCODE - Add accounting panel to Dice page

// STEP 1: Import new component (add to imports at top)
import { DiceAccountingPanel } from '../components/game-specific/dice/DiceAccountingPanel';

// STEP 2: Add state for game balance (around line 42)
const [gameBalance, setGameBalance] = useState<bigint | null>(null);

// STEP 3: Load game balance on mount (add to useEffect around line 88)
useEffect(() => {
  const loadGameBalance = async () => {
    if (!actor) return;
    
    try {
      const balance = await actor.get_my_balance();
      setGameBalance(balance);
    } catch (err) {
      console.error('Failed to load game balance:', err);
    }
  };
  
  loadGameBalance();
}, [actor]);

// STEP 4: Refresh callback for accounting panel
const handleBalanceChange = async () => {
  if (!actor) return;
  
  try {
    const balance = await actor.get_my_balance();
    setGameBalance(balance);
  } catch (err) {
    console.error('Failed to refresh game balance:', err);
  }
};

// STEP 5: Add accounting panel to JSX (insert before betting controls, around line 155)
return (
  <GameLayout ...>
    <GameModeToggle {...gameMode} />
    
    {/* NEW: Accounting Panel */}
    <DiceAccountingPanel 
      gameBalance={gameBalance}
      onBalanceChange={handleBalanceChange}
    />
    
    {/* Existing betting controls */}
    <div className="card max-w-2xl mx-auto">
      ...
    </div>
    ...
  </GameLayout>
);
```

### 3. Modified File: `openhouse_frontend/src/hooks/actors/useDiceActor.ts`

```typescript
// PSEUDOCODE - Add new method types

// STEP 1: Add to DiceActor interface
export interface DiceActor {
  // ... existing methods ...
  
  // NEW: Accounting methods
  deposit: (amount: bigint) => Promise<{ Ok: bigint } | { Err: string }>;
  withdraw: (amount: bigint) => Promise<{ Ok: bigint } | { Err: string }>;
  get_balance: (user: Principal) => Promise<bigint>;
  get_my_balance: () => Promise<bigint>;
  get_house_balance: () => Promise<bigint>;
  get_canister_balance: () => Promise<bigint>;
  get_accounting_stats: () => Promise<AccountingStats>;
  audit_balances: () => Promise<{ Ok: string } | { Err: string }>;
}

// STEP 2: Add AccountingStats type
export interface AccountingStats {
  total_user_deposits: bigint;
  house_balance: bigint;
  canister_balance: bigint;
  unique_depositors: bigint;
}
```

---

## Testing Plan (Mainnet)

### Phase 1: Backend Testing (via dfx CLI)

```bash
# 1. Deploy updated canister
./deploy.sh --dice-only

# 2. Check initial state
dfx canister --network ic call dice_backend get_accounting_stats

# 3. Test deposit (requires ICP in wallet)
dfx canister --network ic call dice_backend deposit '(100000000)' # 1 ICP

# 4. Check balance
dfx canister --network ic call dice_backend get_my_balance

# 5. Test play (should deduct from internal balance)
dfx canister --network ic call dice_backend play_dice '(100000000, 50, variant { Over }, "test-seed")'

# 6. Check balance after game
dfx canister --network ic call dice_backend get_my_balance

# 7. Test withdraw
dfx canister --network ic call dice_backend withdraw '(50000000)' # 0.5 ICP

# 8. Audit balances
dfx canister --network ic call dice_backend audit_balances
```

### Phase 2: Frontend Testing

1. Navigate to https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
2. Log in with Internet Identity
3. Verify wallet balance displays
4. Test deposit: 1 ICP → Dice game
5. Verify dice balance increases
6. Play a few games (internal balance should update)
7. Test withdraw: 0.5 ICP → Wallet
8. Verify wallet balance increases

### Phase 3: Edge Cases

```bash
# 1. Insufficient balance
dfx canister --network ic call dice_backend play_dice '(999999999999, 50, variant { Over }, "seed")'
# Expected: Error "Insufficient balance"

# 2. Bet exceeds house balance
# (Deposit small amount to house, try large bet)
# Expected: Error "Bet too large"

# 3. Minimum deposit validation
dfx canister --network ic call dice_backend deposit '(1000000)' # 0.01 ICP
# Expected: Error "Minimum deposit is 1 ICP"

# 4. Withdraw more than balance
dfx canister --network ic call dice_backend withdraw '(999999999999)'
# Expected: Error "Insufficient balance"
```

---

## Security Considerations

### 1. Re-entrancy Protection
- **Issue**: User could call withdraw() again before first transfer completes
- **Solution**: Deduct balance BEFORE making transfer (accounting.rs line 93-102)
- **Rollback**: If transfer fails, restore balance (accounting.rs line 117-128)

### 2. Integer Overflow
- **Issue**: Balance addition could overflow u64
- **Solution**: Use checked arithmetic in production
- **Pseudocode**: Replace `user_balance + amount` with `user_balance.checked_add(amount).ok_or("Overflow")?`

### 3. Isolation Guarantee
- **Implementation**: Each canister manages own funds
- **Benefit**: If dice is exploited, other games (crash, plinko, mines) are unaffected
- **Trade-off**: House must fund each game separately

### 4. Audit Trail
- **Function**: `audit_balances()` verifies invariant
- **Invariant**: `house_balance + sum(user_balances) = canister_balance`
- **Usage**: Call periodically to detect exploits

---

## Deployment Strategy

### Step 1: Backend Deployment

```bash
# In worktree: /home/theseus/alexandria/openhouse-dice-accounting

# Build Rust backend
cargo build --target wasm32-unknown-unknown --release

# Deploy to mainnet (dice canister: whchi-hyaaa-aaaao-a4ruq-cai)
./deploy.sh --dice-only
```

### Step 2: Frontend Deployment

```bash
# Build React frontend
cd openhouse_frontend
npm run build
cd ..

# Deploy frontend
./deploy.sh --frontend-only
```

### Step 3: Verification

```bash
# Check dice canister status
dfx canister --network ic status dice_backend

# Test new methods exist
dfx canister --network ic call dice_backend get_my_balance

# Visit live site
echo "https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
```

---

## Success Criteria

### Backend
- [ ] `deposit()` transfers ICP from user to canister
- [ ] `withdraw()` transfers ICP from canister to user
- [ ] `get_balance()` returns correct user balance
- [ ] `get_house_balance()` calculates correctly (canister - deposits)
- [ ] `play_dice()` deducts/adds to internal balance (no ICP transfer)
- [ ] Max bet enforced based on house balance
- [ ] `audit_balances()` passes (no discrepancies)
- [ ] Balances persist across canister upgrades

### Frontend
- [ ] Accounting panel displays wallet + game balances
- [ ] Deposit UI transfers ICP and updates balances
- [ ] Withdraw UI transfers ICP and updates balances
- [ ] Error messages display for insufficient funds
- [ ] Success messages confirm transactions
- [ ] Balances refresh after deposit/withdraw

### Integration
- [ ] Can deposit ICP from wallet → dice game
- [ ] Can play multiple games with internal balance
- [ ] Can withdraw winnings → wallet
- [ ] Wallet balance and game balance stay in sync
- [ ] No ICP transfers during gameplay (gas efficient)

---

## Future Enhancements (Not in This PR)

1. **Transaction History**: Track deposit/withdraw events
2. **Subaccounts**: Allow users to create game-specific subaccounts
3. **Auto-withdraw**: Automatically withdraw winnings above threshold
4. **Multi-game Wallet**: Unified balance across all OpenHouse games
5. **ICRC-2 Approve**: Allow canister to pull funds (instead of push)
6. **Circuit Breaker**: Pause deposits if house balance too low

---

## Implementation Checklist

### Backend Tasks
- [ ] Create `dice_backend/src/accounting.rs`
  - [ ] Implement `deposit()` with ICRC-1 transfer
  - [ ] Implement `withdraw()` with rollback logic
  - [ ] Implement balance queries (user, house, canister)
  - [ ] Implement `audit_balances()`
  - [ ] Add upgrade hooks
- [ ] Modify `dice_backend/src/lib.rs`
  - [ ] Import accounting module
  - [ ] Update `play_dice()` to use internal balances
  - [ ] Add max bet enforcement based on house balance
  - [ ] Add `get_canister_balance()` async query
  - [ ] Update upgrade hooks
- [ ] Modify `dice_backend/dice_backend.did`
  - [ ] Add AccountingStats type
  - [ ] Add deposit/withdraw methods
  - [ ] Add balance query methods
- [ ] Modify `dice_backend/Cargo.toml`
  - [ ] Add `ic-ledger-types` dependency

### Frontend Tasks
- [ ] Create `openhouse_frontend/src/components/game-specific/dice/DiceAccountingPanel.tsx`
  - [ ] Implement deposit UI
  - [ ] Implement withdraw UI
  - [ ] Display wallet + game balances
  - [ ] Handle errors and success messages
- [ ] Modify `openhouse_frontend/src/pages/Dice.tsx`
  - [ ] Import DiceAccountingPanel
  - [ ] Add game balance state
  - [ ] Load game balance on mount
  - [ ] Add balance refresh callback
  - [ ] Insert accounting panel in layout
- [ ] Modify `openhouse_frontend/src/hooks/actors/useDiceActor.ts`
  - [ ] Add accounting method types
  - [ ] Add AccountingStats interface

### Testing Tasks
- [ ] Deploy to mainnet
- [ ] Test deposit via CLI
- [ ] Test withdraw via CLI
- [ ] Test play_dice with internal balance
- [ ] Test audit_balances
- [ ] Test frontend deposit UI
- [ ] Test frontend withdraw UI
- [ ] Test edge cases (insufficient funds, etc.)
- [ ] Verify balances persist after upgrade

---

## Notes for Implementing Agent

1. **ICRC-1 Integration**: The ICP ledger uses ICRC-1 standard. Import types from `ic-ledger-types` crate.

2. **Async Calls**: `deposit()` and `withdraw()` must be `#[update]` (not `#[query]`) because they make inter-canister calls.

3. **Memory IDs**: Use MemoryId(10) for USER_BALANCES_STABLE to avoid conflicts with existing memory allocations (0-3 are used for game state and seed rotation).

4. **Error Handling**: Always rollback state changes if ICP transfer fails (see withdraw() pseudocode).

5. **Frontend Types**: After backend changes, regenerate declarations:
   ```bash
   dfx generate dice_backend
   ```

6. **Testing Priority**: Test deposit/withdraw with small amounts first (0.1-1 ICP) before risking larger sums.

7. **House Seeding**: Before launch, canister needs initial house funds. Deposit 10-100 ICP to house (send to canister principal directly via NNS).

8. **Max Bet Calculation**: Current code caps at 100x multiplier. With 1% win chance, max payout = 100x bet. Ensure house has sufficient funds.

9. **Upgrade Safety**: Test pre_upgrade/post_upgrade hooks thoroughly. Use dfx canister install --mode upgrade.

10. **Audit Function**: Call `audit_balances()` after every major change to verify invariants hold.

---

## Example Usage Flow

```
User Journey:
1. User has 10 ICP in wallet
2. User deposits 5 ICP to dice game
   - Wallet: 10 ICP → 4.9999 ICP (after fee)
   - Dice balance: 0 → 5 ICP
3. User bets 1 ICP on "Over 50" (50% chance, ~1.94x multiplier)
   - Win: Dice balance 5 → 5.94 ICP (no ICP transfer, instant)
   - Lose: Dice balance 5 → 4 ICP (no ICP transfer, instant)
4. User plays 10 more games...
   - Dice balance: 4 → 7.5 ICP (after wins/losses)
5. User withdraws 5 ICP
   - Dice balance: 7.5 → 2.5 ICP
   - Wallet: 4.9999 → 9.9998 ICP (after fee)
```

---

**END OF IMPLEMENTATION PLAN**

This plan is complete and ready for autonomous execution. The implementing agent should verify isolation, implement all checklist items, deploy to mainnet, and create a PR.
