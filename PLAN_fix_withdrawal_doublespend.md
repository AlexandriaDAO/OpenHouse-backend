# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-fix-withdrawal-doublespend"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-fix-withdrawal-doublespend`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ./deploy.sh --dice-only
   ```
4. **Verify deployment**:
   ```bash
   dfx canister --network ic status dice_backend
   # Test withdrawal status query
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_withdrawal_status '()'
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix(dice): Eliminate withdrawal double-spend vulnerability

   - Remove automatic timer-based retry system
   - Add user-initiated retry_withdrawal() function
   - Add abandon_withdrawal() escape hatch (no balance restore)
   - System never auto-rollbacks after uncertain state

   Security: Eliminates critical double-spend vector identified in audit"
   git push -u origin feature/fix-withdrawal-doublespend
   gh pr create --title "fix(dice): Eliminate withdrawal double-spend vulnerability" --body "## Summary
   - Removes automatic retry timer that could cause double-spend after TooOld error
   - Adds user-initiated \`retry_withdrawal()\` for manual retries
   - Adds \`abandon_withdrawal()\` escape hatch that does NOT restore balance
   - System is now provably solvent under all failure scenarios

   ## Security Analysis
   See: \`dice_backend/src/defi_accounting/audits/gemini_audit_v3.md\` Section 1.1

   ## Test Plan
   - [ ] Deploy to mainnet
   - [ ] Verify \`get_withdrawal_status()\` returns None for users without pending
   - [ ] Verify existing functionality unaffected

   Deployed to mainnet:
   - Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai"
   ```
6. **Iterate autonomously** - Check for P0 issues, fix, repeat up to 5 times

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/fix-withdrawal-doublespend`
**Worktree:** `/home/theseus/alexandria/openhouse-fix-withdrawal-doublespend`

---

# Implementation Plan: Fix Withdrawal Double-Spend Vulnerability

## Problem Summary

**Severity: CRITICAL** (from Gemini Audit v3, Section 1.1)

The withdrawal system has a double-spend vulnerability:

1. User initiates withdrawal -> balance zeroed, `PendingWithdrawal` created with `created_at = T`
2. Transfer succeeds on ledger but response lost -> `UncertainError`
3. Timer retries for ~24h using same `created_at = T`
4. After 24h, ledger returns `TooOld` (timestamp expired from dedup window)
5. Code treats `TooOld` as `DefiniteError` -> calls `rollback_withdrawal()`
6. User's balance restored -> **DOUBLE SPEND** (funds on-chain AND internal balance)

## Solution: User-Initiated Retries + No Auto-Rollback

Replace automatic timer-based retries with user-initiated retries. Never restore balance after uncertain state.

### Design Tradeoffs (FOR AUDITORS)

```
TRADEOFF #1: User Agency vs Convenience
─────────────────────────────────────────
CHOSEN: User must manually retry/abandon stuck withdrawals
REJECTED: Automatic retry timer

WHY: Automatic systems cannot safely determine if a transaction succeeded
after UncertainError. Only the user can verify their on-chain balance and
make an informed decision. The 1-in-30-billion edge case risk belongs to
the user (who can verify), not the protocol (which cannot).

TRADEOFF #2: Orphaned Funds vs Double-Spend
───────────────────────────────────────────
CHOSEN: abandon_withdrawal() does NOT restore balance
REJECTED: Restore balance on abandon

WHY: If we restore balance on abandon, and the original transfer actually
succeeded, we create double-spend. If we don't restore, and the transfer
failed, user loses funds (orphaned in canister). We accept "user might lose"
over "house loses twice" because:
- Orphaned funds stay in canister (system solvent)
- User made the choice with full information
- Edge case is astronomically rare (~1 in 30 billion)

TRADEOFF #3: Initial DefiniteError Rollback
───────────────────────────────────────────
CHOSEN: Still rollback on INITIAL attempt DefiniteError
WHY SAFE: Fresh timestamp means TooOld is impossible. DefiniteError on
initial attempt = ledger definitely rejected it. No prior uncertain state
= we KNOW it never succeeded.
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `dice_backend/src/defi_accounting/accounting.rs` | MODIFY | Remove timer, add retry/abandon functions |
| `dice_backend/src/defi_accounting/types.rs` | MODIFY | Simplify PendingWithdrawal, add audit event |
| `dice_backend/src/defi_accounting/mod.rs` | MODIFY | Export new functions |
| `dice_backend/dice_backend.did` | MODIFY | Add new function signatures |

## Current State

### `accounting.rs` - Lines to DELETE

```rust
// DELETE: Line 23
const MAX_RETRIES: u8 = 250;

// DELETE: Lines 54
static RETRY_TIMER_ID: RefCell<Option<ic_cdk_timers::TimerId>> = RefCell::new(None);

// DELETE: Lines 315-325 (entire function)
pub fn start_retry_timer() { ... }

// DELETE: Lines 371-386 (entire function)
async fn process_pending_withdrawals() { ... }

// DELETE: Lines 388-426 (entire function)
async fn process_single_withdrawal(user: Principal) -> Result<(), String> { ... }
```

### `types.rs` - Lines to DELETE

```rust
// DELETE from PendingWithdrawal struct (lines 14-15)
pub retries: u8,
pub last_error: Option<String>,
```

---

## Implementation Pseudocode

### 1. `types.rs` - Simplified PendingWithdrawal

```rust
// MODIFY: dice_backend/src/defi_accounting/types.rs

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PendingWithdrawal {
    pub withdrawal_type: WithdrawalType,
    pub created_at: u64,
    // REMOVED: retries, last_error - no longer needed with user-initiated retries
    //
    // DESIGN NOTE FOR AUDITORS:
    // We removed automatic retry tracking because the system no longer makes
    // autonomous decisions about transaction outcomes. Users retry manually
    // and can verify on-chain status themselves.
}

impl PendingWithdrawal {
    /// Helper to extract amount regardless of withdrawal type
    pub fn get_amount(&self) -> u64 {
        match &self.withdrawal_type {
            WithdrawalType::User { amount } => *amount,
            WithdrawalType::LP { amount, .. } => *amount,
        }
    }
}

// ADD to AuditEvent enum (after WithdrawalFailed)
#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum AuditEvent {
    // ... existing variants ...

    /// User voluntarily abandoned a stuck withdrawal.
    /// CRITICAL: This does NOT restore balance - funds may be orphaned.
    /// This is intentional to prevent double-spend.
    WithdrawalAbandoned { user: Principal, amount: u64 },
}
```

### 2. `accounting.rs` - Remove Timer Infrastructure

```rust
// MODIFY: dice_backend/src/defi_accounting/accounting.rs

// DELETE these constants and statics:
// - const MAX_RETRIES: u8 = 250;
// - static RETRY_TIMER_ID: RefCell<Option<TimerId>> = RefCell::new(None);

// DELETE these functions entirely:
// - pub fn start_retry_timer()
// - async fn process_pending_withdrawals()
// - async fn process_single_withdrawal()

// DELETE this helper (no longer needed):
// - fn update_pending_error()
```

### 3. `accounting.rs` - Simplified withdraw_internal

```rust
// MODIFY: withdraw_internal function

pub(crate) async fn withdraw_internal(user: Principal) -> Result<u64, String> {
    // Check if already pending (prevents concurrent withdrawals)
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Withdrawal already pending. Call retry_withdrawal() to retry or abandon_withdrawal() to cancel.".to_string());
    }

    let balance = get_balance_internal(user);

    if balance == 0 {
        return Err("No balance to withdraw".to_string());
    }

    if balance < MIN_WITHDRAW {
        return Err(format!("Balance {} decimals is below minimum withdrawal of {} USDT",
                          balance, MIN_WITHDRAW / 1_000_000));
    }

    // ATOMIC: Create pending FIRST, then zero balance
    // This ordering is critical - see original comments
    let created_at = ic_cdk::api::time();
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: balance },
        created_at,
        // REMOVED: retries, last_error
    };

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().insert(user, pending));
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, 0);
    });

    log_audit(AuditEvent::WithdrawalInitiated { user, amount: balance });

    // Attempt transfer immediately
    match attempt_transfer(user, balance, created_at).await {
        TransferResult::Success(_block) => {
            PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&user));
            log_audit(AuditEvent::WithdrawalCompleted { user, amount: balance });
            Ok(balance)
        }
        TransferResult::DefiniteError(err) => {
            // DESIGN NOTE FOR AUDITORS:
            // Rollback on INITIAL DefiniteError is safe because:
            // 1. Fresh timestamp = TooOld impossible
            // 2. DefiniteError = ledger definitely rejected
            // 3. No prior UncertainError = we KNOW it never succeeded
            rollback_withdrawal(user)?;
            log_audit(AuditEvent::WithdrawalFailed { user, amount: balance });
            Err(err)
        }
        TransferResult::UncertainError(msg) => {
            // DESIGN NOTE FOR AUDITORS:
            // DO NOT rollback here! The transfer may have succeeded.
            // User must call retry_withdrawal() or abandon_withdrawal().
            // This is the core fix for the double-spend vulnerability.
            Err(format!(
                "Withdrawal pending (uncertain outcome). \
                 Call retry_withdrawal() to retry or check on-chain balance. \
                 If you received funds, call abandon_withdrawal() to clear pending state. \
                 Error: {}", msg
            ))
        }
    }
}
```

### 4. `accounting.rs` - New retry_withdrawal Function

```rust
// ADD: New function after withdraw_internal

/// Retry a pending withdrawal.
///
/// # Design Rationale (FOR AUDITORS)
///
/// Users can retry indefinitely - there's no MAX_RETRIES limit. This is safe because:
/// - Same `created_at` = same dedup key on ledger = idempotent
/// - Even after TooOld, retries just fail harmlessly (no state change)
/// - System never makes rollback decisions automatically
///
/// ## What happens with TooOld?
/// After ~24 hours, the ledger returns TooOld because `created_at` is expired.
/// This does NOT mean the transfer failed - it means we can't retry anymore.
/// The user should:
/// 1. Check their ckUSDT balance on-chain
/// 2. If they received funds -> call `abandon_withdrawal()` to unfreeze account
/// 3. If they didn't -> they can keep retrying (harmless) or `abandon_withdrawal()`
///
/// ## Why no automatic rollback on TooOld?
/// TooOld only means "I can't process THIS retry" - it says nothing about whether
/// a PRIOR attempt succeeded. Auto-rollback here would cause double-spend if the
/// original transfer actually went through.
#[update]
pub async fn retry_withdrawal() -> Result<u64, String> {
    let caller = ic_cdk::caller();

    let pending = PENDING_WITHDRAWALS.with(|p| p.borrow().get(&caller))
        .ok_or("No pending withdrawal to retry")?;

    let amount = pending.get_amount();

    // Retry with original created_at - ledger deduplication handles idempotency
    match attempt_transfer(caller, amount, pending.created_at).await {
        TransferResult::Success(_) => {
            PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&caller));
            log_audit(AuditEvent::WithdrawalCompleted { user: caller, amount });
            Ok(amount)
        }
        TransferResult::DefiniteError(e) => {
            // DESIGN NOTE FOR AUDITORS:
            // DO NOT rollback here! This might be TooOld, which doesn't mean
            // the original transfer failed. Stay pending, let user decide.
            Err(format!(
                "Transfer failed: {}. \
                 Check your on-chain ckUSDT balance. \
                 If you received funds, call abandon_withdrawal(). \
                 Otherwise, you may retry again or abandon.", e
            ))
        }
        TransferResult::UncertainError(msg) => {
            Err(format!("Transfer uncertain: {}. Please retry.", msg))
        }
    }
}
```

### 5. `accounting.rs` - New abandon_withdrawal Function

```rust
// ADD: New function after retry_withdrawal

/// Abandon a pending withdrawal WITHOUT restoring balance.
///
/// # Design Rationale (FOR AUDITORS)
///
/// This is the escape hatch for stuck withdrawals. It does NOT restore the user's
/// balance because we cannot know if the original transfer succeeded.
///
/// ## Before calling this, users MUST check their on-chain ckUSDT balance:
/// - If they received the funds -> abandon is correct, just clears frozen state
/// - If they didn't receive funds -> they are accepting the loss
///
/// ## Why No Double-Spend Is Possible
/// Since we NEVER restore balance on abandon, the worst case scenarios are:
///
/// | Scenario                          | On-Chain | Internal | Result           |
/// |-----------------------------------|----------|----------|------------------|
/// | Abandon after receiving funds     | +amount  | 0        | Correct          |
/// | Abandon without receiving funds   | 0        | 0        | User loses       |
///
/// We accept "user might lose" over "house might lose twice" because:
/// - Orphaned funds stay in canister (system remains solvent)
/// - User made the choice with full information (they can check on-chain first)
/// - The edge case is astronomically rare (~1 in 30 billion)
/// - The user has agency - they're not forced to abandon
///
/// ## What happens to orphaned funds?
/// If a user abandons without receiving funds, those funds remain in the canister's
/// ckUSDT balance but are not credited to any user. This is a "surplus" that keeps
/// the system solvent. An admin recovery mechanism could be added later if needed.
#[update]
pub fn abandon_withdrawal() -> Result<u64, String> {
    let caller = ic_cdk::caller();

    let pending = PENDING_WITHDRAWALS.with(|p| p.borrow().get(&caller))
        .ok_or("No pending withdrawal to abandon")?;

    let amount = pending.get_amount();

    // Remove pending state - DO NOT restore balance
    // This is the critical safety property that prevents double-spend
    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().remove(&caller));
    log_audit(AuditEvent::WithdrawalAbandoned { user: caller, amount });

    Ok(amount) // Returns amount for user's records
}
```

### 6. `accounting.rs` - Simplify schedule_lp_withdrawal

```rust
// MODIFY: schedule_lp_withdrawal function

pub fn schedule_lp_withdrawal(user: Principal, shares: Nat, reserve: Nat, amount: u64) -> Result<(), String> {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Withdrawal already pending".to_string());
    }

    let created_at = ic_cdk::api::time();
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::LP { shares, reserve, amount },
        created_at,
        // REMOVED: retries, last_error
    };

    PENDING_WITHDRAWALS.with(|p| p.borrow_mut().insert(user, pending));
    log_audit(AuditEvent::WithdrawalInitiated { user, amount });

    // REMOVED: ic_cdk::futures::spawn() call
    // LP users now also use retry_withdrawal() manually
    // The immediate attempt happens in withdraw_liquidity() which calls this
    // after burning shares, then calls attempt_transfer directly

    Ok(())
}
```

### 7. `mod.rs` - Export New Functions

```rust
// MODIFY: dice_backend/src/defi_accounting/mod.rs

pub use accounting::{
    deposit,
    withdraw_all,
    retry_withdrawal,      // ADD
    abandon_withdrawal,    // ADD
    get_withdrawal_status,
    // ... other existing exports
};

// REMOVE from exports:
// - start_retry_timer (deleted)
```

### 8. `dice_backend.did` - Add Function Signatures

```candid
// MODIFY: dice_backend/dice_backend.did

// ADD these new functions:
retry_withdrawal : () -> (variant { Ok : nat64; Err : text });
abandon_withdrawal : () -> (variant { Ok : nat64; Err : text });
```

### 9. `lib.rs` - Remove Timer Start Call

```rust
// MODIFY: dice_backend/src/lib.rs

// In init() or post_upgrade(), REMOVE the call to:
// defi_accounting::start_retry_timer();

// The parent withdrawal timer can stay - it uses withdraw_internal()
// which now handles uncertain errors correctly
```

---

## Accounting Invariant Proof

**Invariant:** `canister_ckUSDT_balance >= pool_reserve + sum(user_balances)`

| State Transition | Balance Change | Invariant Status |
|------------------|----------------|------------------|
| Withdrawal initiated | user_balance -> 0, pending created | Surplus (funds still in canister) |
| Success | pending removed, ckUSDT leaves | Balanced |
| Uncertain -> retry -> success | pending removed, ckUSDT leaves | Balanced |
| Uncertain -> abandon (received) | pending removed, ckUSDT already left | Balanced |
| Uncertain -> abandon (not received) | pending removed, ckUSDT stays | Surplus (orphaned) |
| Uncertain -> retry forever | pending stays | Surplus or Balanced |

**No path leads to deficit. System always solvent.**

---

## Testing Checklist

After deployment:
- [ ] `get_withdrawal_status()` returns `null` for users without pending withdrawals
- [ ] New withdrawal creates pending state correctly
- [ ] Successful withdrawal clears pending state
- [ ] `retry_withdrawal()` works for stuck withdrawals
- [ ] `abandon_withdrawal()` clears pending without restoring balance
- [ ] Audit log contains `WithdrawalAbandoned` events when abandon is called

---

## Summary of Changes

| Change | Lines |
|--------|-------|
| Delete MAX_RETRIES, RETRY_TIMER_ID | -4 |
| Delete start_retry_timer() | -10 |
| Delete process_pending_withdrawals() | -16 |
| Delete process_single_withdrawal() | -38 |
| Delete update_pending_error() | -9 |
| Delete retries, last_error from PendingWithdrawal | -2 |
| Modify withdraw_internal() | +5 (comments) |
| Modify schedule_lp_withdrawal() | -3 |
| Add retry_withdrawal() | +35 |
| Add abandon_withdrawal() | +30 |
| Add WithdrawalAbandoned audit event | +1 |
| Add PendingWithdrawal::get_amount() | +6 |
| Update mod.rs exports | +2 |
| Update .did file | +2 |

**Net change: ~-50 lines (simpler codebase)**
