# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-liquidity"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-liquidity`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build backend
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend
   cd openhouse_frontend
   npm run build
   cd ..

   # Deploy to mainnet
   ./deploy.sh
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test LP methods
   dfx canister --network ic call dice_backend get_pool_stats

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): Add liquidity pool UI and ICRC-2 integration"
   git push -u origin feature/dice-liquidity-integration
   gh pr create --title "Feature: Dice Liquidity Pool Integration" --body "Implements DICE_LIQUIDITY_INTEGRATION_PLAN.md

## Summary
- ✅ Liquidity Pool UI Dashboard
- ✅ ICRC-2 Approval Flow for deposits
- ✅ Withdraw All Liquidity feature
- ✅ Backend lifecycle hooks verified
- ✅ DID interface cleanup

## Testing
Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
- Backend: dice_backend (whchi-hyaaa-aaaao-a4ruq-cai)

## Changes
- Added DiceLiquidityPanel component with LP dashboard
- Implemented ICRC-2 icrc2_approve flow before deposit_liquidity
- Added get_my_lp_position query method for convenience
- Fixed DID interface (removed non-existent withdraw method)
- Backend game loop already integrated (no changes needed)"
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

**Branch:** `feature/dice-liquidity-integration`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-liquidity`

---

# Implementation Plan: Dice Liquidity Pool Integration

## Task Classification

**TYPE**: NEW FEATURE - Add liquidity pool UI to Dice frontend

## Current State Analysis

### ✅ Already Implemented (Backend)

**Game Loop Integration** (dice_backend/src/game.rs):
- Line 147: `get_max_allowed_payout()` - Already checking max bet limits ✓
- Line 246: `update_pool_on_win(profit)` - Already updating pool on wins ✓
- Line 248: `update_pool_on_loss(bet_amount)` - Already updating pool on losses ✓

**Lifecycle Hooks** (dice_backend/src/lib.rs):
- Line 51: `start_retry_timer()` called in `init()` ✓
- Line 65: `start_retry_timer()` called in `post_upgrade()` ✓

**DID Interface** (dice_backend/dice_backend.did):
- Lines 96-103: All LP methods exposed ✓
  - `deposit_liquidity(amount)` ✓
  - `withdraw_all_liquidity()` ✓
  - `get_lp_position(principal)` ✓
  - `get_pool_stats()` ✓
  - `can_accept_bets()` ✓

**DeFi Accounting Module** (dice_backend/src/defi_accounting/):
- `liquidity_pool.rs`: Full LP implementation with ICRC-2 ✓
- `accounting.rs`: Pending withdrawal retry system ✓
- `query.rs`: LP query functions ✓
- `types.rs`: LP types and structures ✓

### ❌ Missing Components

1. **Frontend Liquidity Pool UI**
   - No LP dashboard in DiceAccountingPanel
   - No ICRC-2 approval flow before deposit_liquidity
   - No withdraw liquidity UI

2. **Small Backend Issues**
   - DID file line 84: `withdraw: (nat64)` method doesn't exist in lib.rs (only `withdraw_all` exists)
   - Missing convenience method: `get_my_lp_position()` (currently requires passing principal)

## File Structure

### Affected Files

```
dice_backend/
├── dice_backend.did                    # FIX: Remove non-existent withdraw method
├── src/
│   └── lib.rs                          # ADD: get_my_lp_position query method

openhouse_frontend/
└── src/
    ├── components/
    │   └── game-specific/
    │       └── dice/
    │           ├── DiceAccountingPanel.tsx    # MODIFY: Add LP section
    │           └── DiceLiquidityPanel.tsx     # NEW: LP dashboard component
    ├── hooks/
    │   └── actors/
    │       └── useDiceActor.ts                # VERIFY: Ensure ledger actor available
    └── pages/
        └── Dice.tsx                           # MODIFY: Include DiceLiquidityPanel
```

## Implementation Details

### 1. Backend: Fix DID Interface

**File:** `dice_backend/dice_backend.did`

**Issue:** Line 84 has `withdraw: (nat64) -> (variant { Ok: nat64; Err: text });` but this method doesn't exist in lib.rs.

**Action:** Remove this line. Only `withdraw_all` exists.

```candid
// REMOVE THIS LINE (does not exist in implementation):
withdraw: (nat64) -> (variant { Ok: nat64; Err: text });

// KEEP THIS (correct method):
withdraw_all: () -> (variant { Ok: nat64; Err: text });
```

### 2. Backend: Add Convenience Query Method

**File:** `dice_backend/src/lib.rs`

Add after line 186 (after `get_pool_stats`):

```rust
// PSEUDOCODE
#[query]
fn get_my_lp_position() -> LPPosition {
    // Get caller's LP position
    let caller = ic_cdk::caller();
    defi_accounting::get_lp_position(caller)
}
```

Update DID file to include:

```candid
// Add after get_lp_position
get_my_lp_position : () -> (LPPosition) query;
```

### 3. Frontend: Create Liquidity Pool Component

**File:** `openhouse_frontend/src/components/game-specific/dice/DiceLiquidityPanel.tsx` (NEW)

```typescript
// PSEUDOCODE
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../providers/AuthProvider';
import useDiceActor from '../../../hooks/actors/useDiceActor';
import { Principal } from '@dfinity/principal';

interface PoolStats {
  total_shares: bigint;
  pool_reserve: bigint;
  share_price: bigint;
  total_liquidity_providers: bigint;
  minimum_liquidity_burned: bigint;
  is_initialized: boolean;
}

interface LPPosition {
  shares: bigint;
  pool_ownership_percent: number;
  redeemable_icp: bigint;
}

export const DiceLiquidityPanel: React.FC = () => {
  const { isAuthenticated, principal } = useAuth();
  const { actor } = useDiceActor();

  // State
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [myPosition, setMyPosition] = useState<LPPosition | null>(null);
  const [depositAmount, setDepositAmount] = useState('1.0');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load pool stats
  useEffect(() => {
    const loadPoolStats = async () => {
      if (!actor) return;

      try {
        const stats = await actor.get_pool_stats();
        setPoolStats(stats);

        if (isAuthenticated) {
          const position = await actor.get_my_lp_position();
          setMyPosition(position);
        }
      } catch (err) {
        console.error('Failed to load pool stats:', err);
      }
    };

    loadPoolStats();

    // Refresh every 30s
    const interval = setInterval(loadPoolStats, 30000);
    return () => clearInterval(interval);
  }, [actor, isAuthenticated]);

  // Handle deposit with ICRC-2 approval flow
  const handleDeposit = async () => {
    if (!actor || !principal) return;

    setIsDepositing(true);
    setError(null);
    setSuccess(null);

    try {
      const amountE8s = BigInt(Math.floor(parseFloat(depositAmount) * 100_000_000));

      // Validate
      if (amountE8s < BigInt(100_000_000)) {
        setError('Minimum deposit is 1 ICP');
        setIsDepositing(false);
        return;
      }

      // CRITICAL: ICRC-2 Approval Flow
      // Step 1: Get ledger actor
      const LEDGER_CANISTER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
      const ledgerActor = /* get ledger actor from context/hook */;

      // Step 2: Approve dice_backend to spend funds
      const diceBackendPrincipal = Principal.fromText('whchi-hyaaa-aaaao-a4ruq-cai');
      const approveArgs = {
        spender: {
          owner: diceBackendPrincipal,
          subaccount: [],
        },
        amount: amountE8s,
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
        expected_allowance: [],
        expires_at: [],
      };

      const approveResult = await ledgerActor.icrc2_approve(approveArgs);

      if ('Err' in approveResult) {
        throw new Error(`Approval failed: ${JSON.stringify(approveResult.Err)}`);
      }

      // Step 3: Call deposit_liquidity (uses transfer_from internally)
      const result = await actor.deposit_liquidity(amountE8s);

      if ('Ok' in result) {
        const shares = result.Ok;
        setSuccess(`Deposited ${depositAmount} ICP! Received ${shares.toString()} shares`);
        setDepositAmount('1.0');

        // Refresh stats
        const stats = await actor.get_pool_stats();
        setPoolStats(stats);
        const position = await actor.get_my_lp_position();
        setMyPosition(position);
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
    }
  };

  // Handle withdraw all
  const handleWithdrawAll = async () => {
    if (!actor) return;

    setIsWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await actor.withdraw_all_liquidity();

      if ('Ok' in result) {
        const amountE8s = result.Ok;
        const amountICP = Number(amountE8s) / 100_000_000;
        setSuccess(`Withdrew ${amountICP.toFixed(4)} ICP!`);

        // Refresh stats
        const stats = await actor.get_pool_stats();
        setPoolStats(stats);
        setMyPosition(null); // Clear position
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Render UI
  return (
    <div className="card max-w-2xl mx-auto p-4 mb-4">
      <h2 className="text-xl font-bold mb-4">🏦 House Liquidity Pool</h2>

      {/* Pool Stats Dashboard */}
      {poolStats && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-blue-900/10 p-2 rounded border border-blue-500/20">
            <p className="text-xs text-gray-400">Total Pool Reserve</p>
            <p className="text-sm font-bold text-blue-400">
              {(Number(poolStats.pool_reserve) / 100_000_000).toFixed(4)} ICP
            </p>
          </div>
          <div className="bg-purple-900/10 p-2 rounded border border-purple-500/20">
            <p className="text-xs text-gray-400">Share Price</p>
            <p className="text-sm font-bold text-purple-400">
              {(Number(poolStats.share_price) / 100_000_000).toFixed(8)} ICP
            </p>
          </div>
          <div className="bg-green-900/10 p-2 rounded border border-green-500/20">
            <p className="text-xs text-gray-400">Total LPs</p>
            <p className="text-sm font-bold text-green-400">
              {poolStats.total_liquidity_providers.toString()}
            </p>
          </div>
          <div className="bg-yellow-900/10 p-2 rounded border border-yellow-500/20">
            <p className="text-xs text-gray-400">Your Ownership</p>
            <p className="text-sm font-bold text-yellow-400">
              {myPosition ? `${myPosition.pool_ownership_percent.toFixed(2)}%` : '0.00%'}
            </p>
          </div>
        </div>
      )}

      {/* My Position */}
      {isAuthenticated && myPosition && Number(myPosition.shares) > 0 && (
        <div className="bg-gray-800 p-3 rounded mb-4">
          <h3 className="text-sm font-bold mb-2">Your Position</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-400">Shares:</span>
              <span className="ml-2 text-white font-mono">{myPosition.shares.toString()}</span>
            </div>
            <div>
              <span className="text-gray-400">Redeemable:</span>
              <span className="ml-2 text-white font-mono">
                {(Number(myPosition.redeemable_icp) / 100_000_000).toFixed(4)} ICP
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {isAuthenticated ? (
        <div className="space-y-2">
          {/* Deposit */}
          <div className="flex gap-2">
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="flex-1 bg-gray-900/50 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Amount (ICP)"
              min="1.0"
              step="0.1"
              disabled={isDepositing}
            />
            <button
              onClick={handleDeposit}
              disabled={isDepositing}
              className="px-4 py-2 bg-blue-600/80 hover:bg-blue-600 rounded text-sm font-bold disabled:opacity-50"
            >
              {isDepositing ? 'Depositing...' : 'Deposit LP'}
            </button>
          </div>

          {/* Withdraw */}
          <button
            onClick={handleWithdrawAll}
            disabled={isWithdrawing || !myPosition || Number(myPosition.shares) === 0}
            className="w-full px-4 py-2 bg-red-600/80 hover:bg-red-600 rounded text-sm font-bold disabled:opacity-50"
          >
            {isWithdrawing ? 'Withdrawing...' : 'Withdraw All Liquidity'}
          </button>
        </div>
      ) : (
        <p className="text-center text-gray-400 text-sm">Please log in to provide liquidity</p>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-red-900/10 border border-red-500/50 text-red-400 px-2 py-1 rounded mt-2 text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/10 border border-green-500/50 text-green-400 px-2 py-1 rounded mt-2 text-xs">
          {success}
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-400 mt-3 p-2 bg-gray-800/50 rounded">
        💡 <strong>How it works:</strong> Deposit ICP to earn from house profits.
        You receive shares representing your pool ownership. Withdraw anytime (1% fee).
        ICRC-2 approval required before deposit.
      </div>
    </div>
  );
};
```

**Export in index.ts:**

```typescript
// File: openhouse_frontend/src/components/game-specific/dice/index.ts
export { DiceLiquidityPanel } from './DiceLiquidityPanel';
```

### 4. Frontend: Integrate into Dice Page

**File:** `openhouse_frontend/src/pages/Dice.tsx`

Add import:
```typescript
import { DiceLiquidityPanel } from '../components/game-specific/dice';
```

Add component after DiceAccountingPanel (around line 316):

```typescript
{/* LIQUIDITY POOL PANEL */}
<DiceLiquidityPanel />
```

### 5. Frontend: Ensure Ledger Actor Available

**File:** `openhouse_frontend/src/hooks/actors/useLedgerActor.ts` (may need to create)

```typescript
// PSEUDOCODE
import { Actor, HttpAgent } from '@dfinity/agent';
import { useAuth } from '../../providers/AuthProvider';

const LEDGER_CANISTER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

// ICRC-2 IDL (minimal)
const ledgerIDL = ({ IDL }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });

  const ApproveArgs = IDL.Record({
    spender: Account,
    amount: IDL.Nat,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
    expected_allowance: IDL.Opt(IDL.Nat),
    expires_at: IDL.Opt(IDL.Nat64),
  });

  const ApproveError = IDL.Variant({
    // ... error variants
  });

  return IDL.Service({
    icrc2_approve: IDL.Func([ApproveArgs], [IDL.Variant({ Ok: IDL.Nat, Err: ApproveError })], []),
  });
};

export const useLedgerActor = () => {
  const { identity } = useAuth();

  // Create actor with user's identity
  const actor = identity ? Actor.createActor(ledgerIDL, {
    agent: new HttpAgent({ identity }),
    canisterId: LEDGER_CANISTER_ID,
  }) : null;

  return { actor };
};
```

### 6. Update DiceLiquidityPanel to Use Ledger Actor

Modify the import section:

```typescript
import { useLedgerActor } from '../../../hooks/actors/useLedgerActor';
```

In component:

```typescript
const { actor: ledgerActor } = useLedgerActor();
```

Use in handleDeposit:

```typescript
if (!ledgerActor) {
  setError('Ledger actor not available');
  setIsDepositing(false);
  return;
}

const approveResult = await ledgerActor.icrc2_approve(approveArgs);
```

## Testing Plan

### Manual Testing on Mainnet

1. **Pool Stats Query**:
   ```bash
   dfx canister --network ic call dice_backend get_pool_stats
   ```

2. **Frontend UI**:
   - Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
   - Log in with wallet
   - Verify LP dashboard shows pool stats
   - Test deposit flow (should trigger ICRC-2 approval)
   - Verify shares received
   - Test withdraw all
   - Verify balances update correctly

3. **ICRC-2 Approval**:
   - Monitor wallet for approval prompt
   - Verify approval amount matches deposit
   - Verify deposit succeeds after approval

## Deployment Strategy

**Affected Canisters:**
- `dice_backend` (whchi-hyaaa-aaaao-a4ruq-cai) - Minor DID fix, add query method
- `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai) - New LP UI

**Deployment Command:**
```bash
# Build backend
cargo build --target wasm32-unknown-unknown --release

# Build frontend
cd openhouse_frontend && npm run build && cd ..

# Deploy all
./deploy.sh
```

## Security Considerations

1. **ICRC-2 Approval**: User explicitly approves dice_backend to spend exact amount
2. **Transfer Safety**: Backend uses `transfer_from` which requires prior approval
3. **Withdrawal Protection**: Only caller can withdraw their own liquidity
4. **Pool Solvency**: Backend already checks pool reserve before accepting bets
5. **Fee Accounting**: 1% withdrawal fee properly handled in fire-and-forget accounting

## Summary of Changes

### Backend Changes (Minimal)
- ✅ Game loop integration: ALREADY DONE
- ✅ Lifecycle hooks: ALREADY DONE
- ✅ DeFi accounting: ALREADY DONE
- 🔧 Fix DID interface: Remove non-existent `withdraw` method
- ➕ Add convenience method: `get_my_lp_position()`

### Frontend Changes (Main Work)
- ➕ New component: `DiceLiquidityPanel.tsx`
- ➕ New hook: `useLedgerActor.ts` (for ICRC-2 approval)
- 🔧 Modify: `Dice.tsx` (add LP panel)
- 🔧 Modify: `dice/index.ts` (export LP panel)

## Risk Assessment

**Low Risk** - Backend is already 95% complete. Only adding UI layer.

- Pool integration already tested in backend
- ICRC-2 is standard approval flow
- No changes to critical game logic
- LP functionality isolated from game betting

## Success Criteria

- [ ] LP dashboard displays on /dice page
- [ ] Pool stats refresh every 30s
- [ ] User can deposit with ICRC-2 approval
- [ ] User can withdraw liquidity
- [ ] Shares and ownership % display correctly
- [ ] Backend builds without errors
- [ ] Frontend builds without errors
- [ ] Deployment succeeds
- [ ] Manual testing on mainnet passes

---

## Notes for Implementer

- The backend liquidity pool is FULLY IMPLEMENTED - you only need UI
- Pay special attention to ICRC-2 approval flow - this is the critical integration point
- Use existing patterns from DiceAccountingPanel for styling consistency
- The LP panel should be ABOVE the betting controls but BELOW the user accounting panel
- All ledger interactions require mainnet testing - no local simulation
