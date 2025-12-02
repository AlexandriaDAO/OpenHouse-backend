# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-defi-cleanup"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-defi-cleanup`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build plinko backend
   cargo build --target wasm32-unknown-unknown --release

   # Deploy to mainnet
   ./deploy.sh --plinko-only
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status plinko_backend
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(plinko): clean up legacy dice_backend references in defi_accounting"
   git push -u origin feature/plinko-defi-cleanup
   gh pr create --title "Refactor: Clean up plinko defi_accounting legacy baggage" --body "Implements PLAN_plinko_defi_cleanup.md

## Summary
Removes legacy dice_backend references, ICP terminology, and audit history comments from plinko_backend/src/defi_accounting/

## Changes
- Renamed \`redeemable_icp\` → \`redeemable_usdt\`
- Fixed e8s (8 decimals) → decimals (6 decimals for ckUSDT)
- Removed Gemini Audit V4 references
- Removed historical migration comments
- Updated documentation

Deployed to mainnet:
- Plinko Backend: weupr-2qaaa-aaaap-abl3q-cai"
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

**Branch:** `feature/plinko-defi-cleanup`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-defi-cleanup`

---

# Implementation Plan: Plinko DeFi Accounting Cleanup

## Overview
Clean up legacy baggage from dice_backend in the replicated `plinko_backend/src/defi_accounting/` folder. Since plinko_backend is not yet deployed, we can freely modify/remove historical migration comments and fix naming issues.

---

## Category 1: ICP → ckUSDT Naming Issues

### 1.1 Field Name: `redeemable_icp` → `redeemable_usdt`
**File:** `plinko_backend/src/defi_accounting/liquidity_pool.rs`

```rust
// Line 112: Change struct field
pub redeemable_usdt: Nat,  // was: redeemable_icp

// Line 432: Update usage
let (ownership_percent, redeemable_usdt) = if total_shares == 0u64 {

// Line 452: Update struct instantiation
redeemable_usdt,
```

### 1.2 Fix `e8s` Terminology (ckUSDT uses 6 decimals, not 8)

| File | Line | Change |
|------|------|--------|
| `liquidity_pool.rs` | 228 | `Your {} e8s has been credited` → `Your {} has been credited` |
| `liquidity_pool.rs` | 330 | `Minimum withdrawal is {} e8s` → `Minimum withdrawal is {}` |
| `liquidity_pool.rs` | 545 | Remove "e8s" from error message |
| `liquidity_pool.rs` | 571-572 | Change docstring "e8s" → "smallest units" |
| `liquidity_pool.rs` | 606 | Remove "e8s" from error message |
| `accounting.rs` | 378, 380 | `{} e8s to parent` → `{}` |

### 1.3 Remove Legacy ICP Comment
**File:** `plinko_backend/src/defi_accounting/accounting.rs:6`
```rust
// DELETE this line:
// Note: This module now uses ckUSDT (ICRC-2), not ICP ledger
```

---

## Category 2: Remove Audit References (Full Cleanup)

### 2.1 Gemini Audit V4 Reference
**File:** `plinko_backend/src/defi_accounting/liquidity_pool.rs:379`
```rust
// DELETE this comment:
// (Gemini Audit V4, Finding 1 fix)
```

### 2.2 Test File: test_serialization.rs
**File:** `plinko_backend/src/defi_accounting/tests/test_serialization.rs`

Replace lines 1-14 with:
```rust
// Tests serialization integrity of DeFi accounting types.
// Verifies unbounded serialization works with large Nat values.
```

Replace line 34 comment:
```rust
// Test that PendingWithdrawal uses unbounded serialization
```

Replace line 55 comment:
```rust
// Verify serialization doesn't panic with large values
```

### 2.3 Test File: test_slippage_audit.rs
**File:** `plinko_backend/src/defi_accounting/tests/test_slippage_audit.rs`

Replace lines 1-17 with:
```rust
// Test: Slippage Protection Accounting Correctness
//
// Verifies that when slippage refund occurs:
// 1. Function returns early (no shares minted)
// 2. Pool reserve is NOT increased
// 3. System remains solvent (Assets == Liabilities)
```

### 2.4 stress_tests/tests.rs - "old API" Comment
**File:** `plinko_backend/src/defi_accounting/tests/stress_tests/tests.rs:439`
```rust
// Change from:
// THIS IS THE KEY TEST - old API would incorrectly take full 1 USDT
// To:
// Verifies partial payout handling (0.2x returns 0.2 USDT, pool gains 0.8 USDT)
```

---

## Category 3: Remove Migration/Historical Comments

### 3.1 "We removed" Comment
**File:** `plinko_backend/src/defi_accounting/types.rs:12-17`

Replace with:
```rust
/// # Design Note
/// The system does not auto-retry or auto-rollback transactions.
/// Users must manually call `retry_withdrawal()` or `abandon_withdrawal()`.
/// This prevents double-spend vulnerabilities from uncertain transfer outcomes.
```

### 3.2 Legacy Transfer Comment
**File:** `plinko_backend/src/defi_accounting/liquidity_pool.rs:153-156`

Replace with:
```rust
// Uses ICRC-2 transfer_from (requires prior user approval)
```

### 3.3 Refactoring Comment (KEEP but simplify)
**File:** `plinko_backend/src/defi_accounting/accounting.rs:287-288`
```rust
// Keep as-is (still relevant):
// Refactoring to `Call::unbounded_wait` requires dependency updates and significant changes.
```

---

## Category 4: Documentation Updates

### 4.1 ARCHITECTURE.md dice_backend Reference
**File:** `plinko_backend/src/defi_accounting/ARCHITECTURE.md:796`
```markdown
// Change from:
> For implementation details, refer to the source files in `dice_backend/src/defi_accounting/`.
// To:
> For implementation details, refer to the source files in `plinko_backend/src/defi_accounting/`.
```

### 4.2 Remove Non-existent nat_helpers.rs
**File:** `plinko_backend/src/defi_accounting/CLAUDE.md:39`
```markdown
// DELETE this line:
- `nat_helpers.rs` - Utilities for Nat (arbitrary precision) math
```

**File:** `plinko_backend/src/defi_accounting/README.md:34`
```markdown
// DELETE this line:
├── nat_helpers.rs      # Arbitrary precision math utilities
```

---

## Category 5: Memory ID Cleanup

### 5.1 Remove Abandoned Comment
**File:** `plinko_backend/src/defi_accounting/memory_ids.rs:30`
```rust
// DELETE this line:
// ABANDONED (corrupted, do not reuse): 22, 23
```

---

## Category 6: Parent Canister ✓

**No changes needed** - Plinko uses the same parent canister as Dice (`e454q-riaaa-aaaap-qqcyq-cai`)

---

## Execution Order

1. **Category 1:** ICP→ckUSDT naming fixes (liquidity_pool.rs, accounting.rs)
2. **Category 2:** Remove audit references (liquidity_pool.rs, test files)
3. **Category 3:** Remove migration comments (types.rs, liquidity_pool.rs)
4. **Category 4:** Documentation updates (ARCHITECTURE.md, CLAUDE.md, README.md)
5. **Category 5:** Remove memory IDs comment (memory_ids.rs)

---

## Files to Modify

| File | Changes |
|------|---------|
| `plinko_backend/src/defi_accounting/liquidity_pool.rs` | Rename field, remove e8s, remove audit refs, remove legacy comments |
| `plinko_backend/src/defi_accounting/accounting.rs` | Remove ICP comment, fix e8s usage |
| `plinko_backend/src/defi_accounting/types.rs` | Simplify design note comment |
| `plinko_backend/src/defi_accounting/memory_ids.rs` | Remove abandoned IDs comment |
| `plinko_backend/src/defi_accounting/ARCHITECTURE.md` | Fix dice_backend reference |
| `plinko_backend/src/defi_accounting/CLAUDE.md` | Remove nat_helpers.rs |
| `plinko_backend/src/defi_accounting/README.md` | Remove nat_helpers.rs |
| `plinko_backend/src/defi_accounting/tests/test_serialization.rs` | Simplify audit comments |
| `plinko_backend/src/defi_accounting/tests/test_slippage_audit.rs` | Simplify audit comments |
| `plinko_backend/src/defi_accounting/tests/stress_tests/tests.rs` | Remove "old API" comment |

---

## Verification

After implementation:
```bash
# Ensure code compiles
cargo check -p plinko_backend

# Run tests
cargo test -p plinko_backend
```
