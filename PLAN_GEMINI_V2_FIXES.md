# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [[ "$REPO_ROOT" != *"/openhouse-gemini-v2-fixes" ]]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-gemini-v2-fixes"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-gemini-v2-fixes`
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
   git commit -m "Fix: Resolve Gemini Audit V2 findings (DoS prevention + Dust loss)"
   git push -u origin feature/gemini-v2-fixes
   gh pr create --title "Fix: Gemini Audit V2 Security Hardening" --body "Implements PLAN_GEMINI_V2_FIXES.md

Resolves:
- [Medium] Serialization Limit DoS in Audit Log
- [Medium] Zero-Share Deposit (Dust Loss)
- [Low] Unbounded Error in PendingWithdrawal

Deployed to mainnet:
- Dice Backend: $(dfx canister --network ic id dice_backend)"
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

**Branch:** `feature/gemini-v2-fixes`
**Worktree:** `/home/theseus/alexandria/openhouse-gemini-v2-fixes`

---

# Implementation Plan

## 1. Current State
The `dice_backend` accounting module has three identified vulnerabilities from Gemini Audit V2:
1.  **Serialization DoS**: `AuditEntry` (500 bytes) and `PendingWithdrawal` (1000 bytes) have small bounds but store potentially unbounded error strings. A single long error can crash the canister.
2.  **Dust Loss**: `deposit_liquidity` allows users to deposit amounts that result in 0 shares if the share price is high, effectively donating funds to LPs.

## 2. Implementation Details

### A. Fix Serialization DoS & Unbounded Errors
**Target:** `dice_backend/src/defi_accounting/types.rs`

```rust
// PSEUDOCODE

// 1. Add sanitization helper
pub fn sanitize_error(msg: &str) -> String {
    msg.chars().take(256).collect()
}

// 2. Update Storable bounds
impl Storable for PendingWithdrawal {
     const BOUND: Bound = Bound::Bounded {
        max_size: 2048, // Increased from 1000
        is_fixed_size: false,
    };
}

impl Storable for AuditEntry {
    const BOUND: Bound = Bound::Bounded {
        max_size: 2048, // Increased from 500
        is_fixed_size: false,
    };
}
```

**Target:** `dice_backend/src/defi_accounting/accounting.rs`

```rust
// PSEUDOCODE

// 1. In process_single_withdrawal
TransferResult::UncertainError(msg) => {
     let safe_msg = crate::defi_accounting::types::sanitize_error(&msg);
     // ... update pending with safe_msg
}

// 2. In log_audit (if applicable) or wherever SystemError is created
log_audit(AuditEvent::SystemError {
    error: crate::defi_accounting::types::sanitize_error(&error_msg)
})
```

### B. Fix Zero-Share Deposit (Dust Loss)
**Target:** `dice_backend/src/defi_accounting/liquidity_pool.rs`

```rust
// PSEUDOCODE

// Inside deposit_liquidity function
// After calculating shares_to_mint...

if shares_to_mint == Nat::from(0u64) {
    return Err("Deposit too small: results in 0 shares".to_string());
}

// ... proceed with update
```

## 3. Verification
- Build: `cargo build -p dice_backend --target wasm32-unknown-unknown`
- Deploy: `./deploy.sh --dice-only`
