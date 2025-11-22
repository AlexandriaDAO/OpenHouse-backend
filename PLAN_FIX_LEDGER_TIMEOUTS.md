# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-fix-ledger-timeouts"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-fix-ledger-timeouts`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build affected backend(s)
     cargo build --target wasm32-unknown-unknown --release -p dice_backend

     # Deploy to mainnet (deploys all canisters - simplest approach)
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
   git commit -m "fix(dice_backend): handle ledger timeouts as uncertain errors to prevent double spend"
   git push -u origin feature/fix-ledger-timeouts
   gh pr create --title "fix(dice_backend): Prevent Double Spend via Ledger Timeout Handling" --body "Implements PLAN_FIX_LEDGER_TIMEOUTS.md

   ## Critical Security Fix
   - **Vulnerability**: Double Spend via Ledger Timeout.
   - **Fix**: Classify Ledger system errors (timeouts) as `UncertainError` instead of `DefiniteError`.
   - **Effect**: Prevents automatic rollback (refunding user) when the transfer status is unknown.

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

**Branch:** `feature/fix-ledger-timeouts`
**Worktree:** `/home/theseus/alexandria/openhouse-fix-ledger-timeouts`

---

# Implementation Plan: Fix Ledger Timeout Handling (Double Spend)

## 1. Current State & Vulnerability
**File:** `dice_backend/src/defi_accounting/accounting.rs`

The `attempt_transfer` function currently treats **all** errors from the Ledger canister as `DefiniteError`.
```rust
// Current Vulnerable Implementation
Err(e) => {
    // Treated as DefiniteError -> Triggers rollback_withdrawal() 
    // If 'e' is a Timeout, money might have moved, but we refund the user anyway.
    TransferResult::DefiniteError(format!("{:?}", e))
}
```

## 2. Implementation Details

### Modify `dice_backend/src/defi_accounting/accounting.rs`

We need to map the `Err` variant of the inter-canister call to `TransferResult::UncertainError`.

```rust
// PSEUDOCODE for attempt_transfer
async fn attempt_transfer(user: Principal, amount: u64, created_at: u64) -> TransferResult {
    // ... args setup ...

    match ic_ledger_types::transfer(MAINNET_LEDGER_CANISTER_ID, &args).await {
        Ok(Ok(block)) => TransferResult::Success(block),
        Ok(Err(e)) => {
             // Ledger Application Error (e.g. InsufficientFunds)
             // The Ledger definitely rejected it.
             TransferResult::DefiniteError(format!("{:?}", e))
        }
        Err((code, msg)) => {
            // System Error (Timeout, CanisterError, etc.)
            // The request might have been processed.
            // CRITICAL: Return UncertainError. Do NOT rollback.
            TransferResult::UncertainError(code, msg)
        }
    }
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
- (No manual test possible for timeout simulation on mainnet without risking funds/complex setup, rely on logic correctness).

```
