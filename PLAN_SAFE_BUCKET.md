# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-safe-bucket"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-safe-bucket`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build affected backend(s)
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet (deploys all canisters - simplest approach)
     ./deploy.sh
     ```
4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice_backend): Implement safe-bucket fee mechanism"
   git push -u origin feature/safe-bucket-fees
   gh pr create --title "feat(dice_backend): Safe-Bucket Fee Mechanism" --body "Implements PLAN_SAFE_BUCKET.md

   Replaces broken 'fire-and-forget' fee transfer with atomic internal crediting.
   - Fees are securely credited to Parent Canister's internal balance
   - Funds are segregated from Pool Risk (Safe Bucket)
   - 'Best Effort' logic fallback to Pool Reserve if Parent is busy
   - Auto-withdrawal timer configured for weekly payouts"
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

**Branch:** `feature/safe-bucket-fees`
**Worktree:** `/home/theseus/alexandria/openhouse-safe-bucket`

---

# Implementation Plan

## 1. Current State Analysis
The current implementation of `withdraw_liquidity` in `dice_backend` uses a "fire-and-forget" mechanism to pay the 1% protocol fee.
- It spawns an async task to transfer the fee.
- If this task fails (network/cycles), the fee is lost ("Ghost Funds").
- The fee is removed from the pool reserve but never received by the parent.

## 2. Proposed Solution: Safe Internal Bucket
Instead of transferring ICP immediately, we credit the fee to the Parent Canister's **User Balance** internally.
1. LP requests withdrawal.
2. Fee is calculated in ICP.
3. We attempt to add this fee to `USER_BALANCES[Parent]`.
4. **Safety Check**: If Parent has a pending withdrawal, we CANNOT modify their balance.
   - Fallback: Fee is added back to `POOL_STATE.reserve` (LPs benefit).
   - This ensures `Reserve + Deposits == Balance` always holds.
5. Funds in `USER_BALANCES` are safe from House Risk.
6. A weekly timer automatically withdraws the Parent's balance.

## 3. Implementation Details

### A. `dice_backend/src/defi_accounting/accounting.rs`

**Add Helper Function**:
```rust
// PSEUDOCODE
/// Best-effort fee crediting.
/// Returns true if credited, false if skipped (user has pending withdrawal).
pub fn credit_parent_fee(user: Principal, amount: u64) -> bool {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return false;
    }

    USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&user).unwrap_or(0);
        balances.insert(user, current + amount);
    });
    true
}
```

**Add Timer Logic**:
```rust
// PSEUDOCODE
thread_local! {
    static PARENT_TIMER: RefCell<Option<ic_cdk_timers::TimerId>> = RefCell::new(None);
}

pub fn start_parent_withdrawal_timer() {
    PARENT_TIMER.with(|t| {
        if t.borrow().is_some() { return; }
        
        // Run every 7 days (604,800 seconds)
        let timer_id = ic_cdk_timers::set_timer_interval(Duration::from_secs(604_800), || async {
             crate::defi_accounting::accounting::auto_withdraw_parent().await;
        });
        *t.borrow_mut() = Some(timer_id);
    });
}

async fn auto_withdraw_parent() {
     let parent = crate::defi_accounting::liquidity_pool::get_parent_principal();
     // Reuse standard withdrawal logic, pretending to be the parent
     // Note: Must expose internal logic or use a helper that doesn't check caller
     let balance = get_balance_internal(parent);
     if balance > 100_000_000 { // Min 1 ICP to bother
         let _ = withdraw_amount_internal_helper(parent, balance).await;
     }
}
```
*Note: You may need to refactor `withdraw_all` slightly to allow calling it for a specific principal (internal helper).*

### B. `dice_backend/src/defi_accounting/liquidity_pool.rs`

**Refactor `withdraw_liquidity`**:
```rust
// PSEUDOCODE
// ... inside withdraw_liquidity ...
    // Schedule Safe Withdrawal
    match accounting::schedule_lp_withdrawal(caller, shares_to_burn.clone(), payout_nat.clone(), lp_amount) {
        Ok(_) => {
            // SAFE ACCOUNTING: Credit parent internally
            // No ledger transfer needed, so we save the TRANSFER_FEE.
            if fee_amount > 0 {
                 let parent = get_parent_principal();
                 if !accounting::credit_parent_fee(parent, fee_amount) {
                     // Parent is busy (pending withdrawal).
                     // Return fee to the pool reserve (LPs get the bonus).
                     // This ensures Reserve + Deposits == Canister Balance.
                     POOL_STATE.with(|state| {
                        let mut pool_state = state.borrow().get().clone();
                        pool_state.reserve += Nat::from(fee_amount);
                        state.borrow_mut().set(pool_state);
                    });
                 }
            }

            Ok(lp_amount)
        }
        // ... Err handling remains same ...
    }
```

**Expose Parent Principal**:
Make sure `get_parent_principal` is public or accessible to `accounting.rs` if needed, or handle the principal logic entirely in `accounting.rs`.

### C. `dice_backend/src/lib.rs`

Update Lifecycle Hooks:
```rust
// PSEUDOCODE
#[init]
fn init() {
    // ... existing ...
    defi_accounting::accounting::start_parent_withdrawal_timer();
}

#[post_upgrade]
fn post_upgrade() {
    // ... existing ...
    defi_accounting::accounting::start_parent_withdrawal_timer();
}
```

## 4. Deployment
- **Affected Canister**: `dice_backend`
- **Strategy**: Deploy all backend canisters.

## 5. Verification
- Check `dfx canister status dice_backend`
