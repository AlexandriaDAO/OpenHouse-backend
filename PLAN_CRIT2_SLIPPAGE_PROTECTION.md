# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-crit2-slippage"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-crit2-slippage`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build affected backend
   cargo build --target wasm32-unknown-unknown --release

   # Deploy dice backend to mainnet
   ./deploy.sh --dice-only
   ```
4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the new function exists
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai calculate_shares_preview '(1000000 : nat64)'
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix(dice): Add slippage protection for LP deposits (CRIT-2)"
   git push -u origin feature/crit2-slippage-protection
   gh pr create --title "fix(dice): Add slippage protection for LP deposits (CRIT-2)" --body "$(cat <<'EOF'
## Summary
Addresses CRIT-2 from security audit: LP Share Dilution via Concurrent Deposit Race Condition

### Changes
- Add `min_shares_expected: Option<Nat>` parameter to `deposit_liquidity`
- If actual shares < min_shares, credit amount to user's betting balance (safe refund)
- Add `calculate_shares_preview` query for frontends
- Add `credit_balance` helper function in accounting.rs
- Backward compatible: existing calls without parameter continue to work

### Security
- Protects against front-running attacks during LP deposits
- Safe refund mechanism: funds credited to betting balance, not trapped
- User can withdraw via normal flow if slippage exceeded

### Testing
- Deploy to mainnet and verify with dfx calls
- Test backward compatibility (no min_shares param)
- Test slippage exceeded scenario

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai

Fixes audit CRIT-2
EOF
)"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- After sleep: IMMEDIATELY continue (no pause)
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/crit2-slippage-protection`
**Worktree:** `/home/theseus/alexandria/openhouse-crit2-slippage`

---

# Implementation Plan: CRIT-2 Slippage Protection

## Problem Summary

The `deposit_liquidity` function calculates shares twice:
1. **Pre-flight** (line 180): Before transfer, to validate minimum shares
2. **Post-transfer** (line 193): After transfer, to mint actual shares

Between these points, other operations (game wins, LP withdrawals with 1% fee) can change the pool's share/reserve ratio, causing users to receive fewer shares than expected. This enables front-running attacks.

## Solution: Slippage Protection with Safe Refund

Add `min_shares_expected: Option<Nat>` parameter. If actual shares fall below this threshold:
1. **DO NOT mint shares**
2. **Credit the deposit amount to user's betting balance** (safe refund)
3. **Return error** explaining slippage exceeded

This is safer than trapping because the transfer has already completed - trapping would leave funds stuck.

---

## Files to Modify

### 1. `dice_backend/src/defi_accounting/accounting.rs`

**Add credit_balance helper function** (around line 490, after `update_balance`):

```rust
// PSEUDOCODE
/// Credits amount to user's balance (adds to existing balance).
/// Used for slippage protection refunds.
pub fn credit_balance(user: Principal, amount: u64) -> Result<(), String> {
    // Check user doesn't have pending withdrawal
    if PENDING_WITHDRAWALS contains user {
        return Err("Cannot credit: withdrawal pending")
    }

    // Get current balance and add amount
    let current = USER_BALANCES_STABLE.get(user).unwrap_or(0)
    let new_balance = current.checked_add(amount)
        .ok_or("Balance overflow")?

    USER_BALANCES_STABLE.insert(user, new_balance)

    log_audit(AuditEvent::BalanceCredited { user, amount, new_balance })

    Ok(())
}
```

### 2. `dice_backend/src/defi_accounting/types.rs`

**Add new audit event variant** (in AuditEvent enum):

```rust
// PSEUDOCODE - add to existing enum
BalanceCredited {
    user: Principal,
    amount: u64,
    new_balance: u64,
},
SlippageProtectionTriggered {
    user: Principal,
    deposit_amount: u64,
    expected_min_shares: Nat,
    actual_shares: Nat,
},
```

### 3. `dice_backend/src/defi_accounting/liquidity_pool.rs`

**Update function signature** (line 158):

```rust
// BEFORE:
pub async fn deposit_liquidity(amount: u64) -> Result<Nat, String>

// AFTER:
pub async fn deposit_liquidity(amount: u64, min_shares_expected: Option<Nat>) -> Result<Nat, String>
```

**Add slippage check after share calculation** (after line 193):

```rust
// PSEUDOCODE - insert after shares_to_mint calculation
let shares_to_mint = calculate_shares_for_deposit(&amount_nat)?;

// Slippage protection: if shares below minimum, refund to betting balance
if let Some(min_shares) = min_shares_expected {
    if shares_to_mint < min_shares {
        // Log the slippage event
        accounting::log_audit(AuditEvent::SlippageProtectionTriggered {
            user: caller,
            deposit_amount: amount,
            expected_min_shares: min_shares.clone(),
            actual_shares: shares_to_mint.clone(),
        });

        // Refund to user's betting balance (safe - they can withdraw normally)
        accounting::credit_balance(caller, amount)?;

        return Err(format!(
            "Slippage exceeded: expected min {} shares, would receive {}. Amount refunded to betting balance.",
            min_shares, shares_to_mint
        ));
    }
}

// Continue with existing zero-share check...
if shares_to_mint == Nat::from(0u64) {
    ic_cdk::trap("CRITICAL: Share calculation inconsistency");
}
```

**Add calculate_shares_preview query** (at end of file):

```rust
// PSEUDOCODE
#[query]
pub fn calculate_shares_preview(amount: u64) -> Result<Nat, String> {
    calculate_shares_for_deposit(&Nat::from(amount))
}
```

### 4. `dice_backend/dice_backend.did`

**Update deposit_liquidity signature** (line 77):

```candid
// BEFORE:
deposit_liquidity : (nat64) -> (variant { Ok: nat; Err: text });

// AFTER:
deposit_liquidity : (nat64, opt nat) -> (variant { Ok: nat; Err: text });
```

**Add calculate_shares_preview query**:

```candid
calculate_shares_preview : (nat64) -> (variant { Ok: nat; Err: text }) query;
```

---

## Implementation Order

1. Add `BalanceCredited` and `SlippageProtectionTriggered` variants to `types.rs`
2. Add `credit_balance` function to `accounting.rs`
3. Update `deposit_liquidity` signature and add slippage check in `liquidity_pool.rs`
4. Add `calculate_shares_preview` query function in `liquidity_pool.rs`
5. Update `dice_backend.did` with new signatures
6. Build and deploy: `./deploy.sh --dice-only`

---

## Backward Compatibility

- Parameter is `Option<Nat>`, so existing calls with `None`/`[]` continue to work
- No breaking changes to existing integrations
- Frontend can be updated separately (not in scope for this PR)

---

## Testing Commands

After deployment, verify with:

```bash
# Test calculate_shares_preview works
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai calculate_shares_preview '(1000000 : nat64)'

# Test deposit without slippage param (backward compatible)
# Note: requires actual ckUSDT approval first
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai deposit_liquidity '(1000000 : nat64, null)'

# Test deposit with slippage param (should work if shares >= min)
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai deposit_liquidity '(1000000 : nat64, opt (900000 : nat))'
```

---

## Lines of Code Estimate

| File | Changes | Lines |
|------|---------|-------|
| `types.rs` | 2 new enum variants | ~10 |
| `accounting.rs` | `credit_balance` function | ~15 |
| `liquidity_pool.rs` | Signature + check + query | ~20 |
| `dice_backend.did` | 2 signature updates | ~2 |
| **Total** | | **~47 lines** |

---

## Audit Reference

This fix addresses **CRIT-2: LP Share Dilution via Concurrent Deposit Race Condition** from:
`/dice_backend/src/defi_accounting/audits/claude_audit_v3.md`

The slippage protection pattern is industry standard (similar to Uniswap's `amountOutMin`).
