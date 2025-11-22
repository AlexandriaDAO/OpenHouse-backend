# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-fix-withdraw-race"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-fix-withdraw-race`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build affected backend(s)
     cargo build --target wasm32-unknown-unknown --release -p dice_backend

     # Deploy to mainnet
     ./deploy.sh --dice-only
     ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix(dice_backend): block balance updates during pending withdrawal to prevent race condition"
   git push -u origin feature/fix-withdraw-race
   gh pr create --title "fix(dice_backend): Prevent Race Condition in Pending Withdrawals" --body "Implements PLAN_FIX_WITHDRAW_RACE.md

   ## Security Fix: Withdrawal/Win Race Condition
   - **Vulnerability**: Users with pending withdrawals (due to Uncertain/Timeout state) could win games. If the withdrawal eventually failed and rolled back, it would overwrite the win balance with the old balance + refund.
   - **Fix**: `update_balance` now checks for pending withdrawals and blocks the update.
   - **Effect**: Prevents double-spending or balance corruption during the 'Uncertain' state window.

   Deployed to mainnet:
   - Affected canister: dice_backend"
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

**Branch:** `feature/fix-withdraw-race`
**Worktree:** `/home/theseus/alexandria/openhouse-fix-withdraw-race`

---

# Implementation Plan: Fix Withdrawal Race Condition

## 1. Current State & Vulnerability
**File:** `dice_backend/src/defi_accounting/accounting.rs`

Currently, `update_balance` (called when a user wins a game) blindly overwrites the user's balance.
```rust
pub fn update_balance(user: Principal, new_balance: u64) -> Result<(), String> {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, new_balance);
    });
    Ok(())
}
```

**The Race:**
1. User withdraws 100. Pending state = Uncertain. Balance = 0.
2. User wins 200. Balance = 200.
3. Withdrawal fails (definitively). Rollback runs: `balance = current (200) + refund (100) = 300`.
**Result:** User gets Refund + Winnings. (Double Spend / State Corruption).

## 2. Implementation Details

### Modify `dice_backend/src/defi_accounting/accounting.rs`

We need to prevent any balance updates if the user is in the `PENDING_WITHDRAWALS` list.

```rust
// PSEUDOCODE for update_balance
pub fn update_balance(user: Principal, new_balance: u64) -> Result<(), String> {
    // FIX: Check lock first
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Cannot update balance: withdrawal pending".to_string());
    }

    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, new_balance);
    });
    Ok(())
}
```

## 3. Deployment Strategy
This change affects only the **Dice Backend**.

```bash
# 1. Build
cargo build --target wasm32-unknown-unknown --release -p dice_backend

# 2. Deploy
./deploy.sh --dice-only
```

## 4. Verification
- Verify `dice_backend` is running.
- Logic verification: A user with a pending withdrawal (simulated or real) cannot receive game winnings. Game will likely error out (which is correct behavior - "Game cancelled: withdrawal in progress").

```
