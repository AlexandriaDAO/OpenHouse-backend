# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dead-code-cleanup"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dead-code-cleanup`
2. **Implement changes** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ./deploy.sh
   ```
4. **Verify deployment**:
   ```bash
   dfx canister --network ic status plinko_backend
   dfx canister --network ic status dice_backend
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor: remove dead code from plinko and dice backends"
   git push -u origin feature/dead-code-cleanup
   gh pr create --title "Refactor: Remove dead code from accounting modules" --body "$(cat <<'EOF'
## Summary
- Removes unused `credit_balance` function (replaced by `force_credit_balance_system` after audit)
- Removes orphaned `MAX_RECENT_ABANDONMENTS` constant
- Removes unused `recent` VecDeque variable
- Removes unused `DECIMALS_PER_CKUSDT` import in plinko game.rs

## Context
These items were flagged by clippy and confirmed as truly dead code:
- `credit_balance` was superseded by `force_credit_balance_system` which bypasses pending withdrawal checks for internal refunds
- `MAX_RECENT_ABANDONMENTS` and `recent` VecDeque were orphaned after refactoring the orphaned funds report to use a Vec-based approach

## Test plan
- [x] `cargo clippy --target wasm32-unknown-unknown -p plinko_backend` - no more unused warnings
- [x] `cargo clippy --target wasm32-unknown-unknown -p dice_backend` - no more unused warnings
- [x] Deploy to mainnet successful

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: plinko_backend, dice_backend

Generated with Claude Code
EOF
)"
   ```
6. **Iterate autonomously** until approved or max 5 iterations

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/dead-code-cleanup`
**Worktree:** `/home/theseus/alexandria/openhouse-dead-code-cleanup`

---

# Implementation Plan: Dead Code Cleanup

## Task Classification
**REFACTORING** - Subtractive, targeted removal of confirmed dead code.

## Current State

### Plinko Backend - 5 warnings
| File | Line | Item | Status |
|------|------|------|--------|
| `game.rs` | 3 | `DECIMALS_PER_CKUSDT` import | UNUSED - remove |
| `accounting.rs` | 24 | `MAX_RECENT_ABANDONMENTS` const | DEAD - remove |
| `accounting.rs` | 538 | `credit_balance()` function | DEAD - remove |
| `accounting.rs` | 763 | `recent` VecDeque variable | DEAD - remove |

### Dice Backend - 4 warnings
| File | Line | Item | Status |
|------|------|------|--------|
| `accounting.rs` | 25 | `MAX_RECENT_ABANDONMENTS` const | DEAD - remove |
| `accounting.rs` | 539 | `credit_balance()` function | DEAD - remove |
| `accounting.rs` | 764 | `recent` VecDeque variable | DEAD - remove |

## Implementation

### 1. Plinko: Remove unused import
**File:** `plinko_backend/src/game.rs`

```rust
// BEFORE (line 3):
use crate::types::{DECIMALS_PER_CKUSDT, MIN_BET};

// AFTER:
use crate::types::MIN_BET;
```

### 2. Plinko: Remove dead constant
**File:** `plinko_backend/src/defi_accounting/accounting.rs`

```rust
// DELETE line 24:
const MAX_RECENT_ABANDONMENTS: usize = 50; // Max entries for orphaned funds report
```

### 3. Plinko: Remove dead function
**File:** `plinko_backend/src/defi_accounting/accounting.rs`

```rust
// DELETE lines 536-555 (the entire credit_balance function):
/// Credits amount to user's balance (adds to existing balance).
/// Used for slippage protection refunds.
pub fn credit_balance(user: Principal, amount: u64) -> Result<(), String> {
    // ... entire function body
}
```

### 4. Plinko: Remove dead variable
**File:** `plinko_backend/src/defi_accounting/accounting.rs`

```rust
// DELETE line 763:
let mut recent: VecDeque<super::types::AbandonedEntry> = VecDeque::new();
```

### 5. Dice: Remove dead constant
**File:** `dice_backend/src/defi_accounting/accounting.rs`

```rust
// DELETE line 25:
const MAX_RECENT_ABANDONMENTS: usize = 50; // Max entries for orphaned funds report
```

### 6. Dice: Remove dead function
**File:** `dice_backend/src/defi_accounting/accounting.rs`

```rust
// DELETE lines 537-556 (the entire credit_balance function):
/// Credits amount to user's balance (adds to existing balance).
/// Used for slippage protection refunds.
pub fn credit_balance(user: Principal, amount: u64) -> Result<(), String> {
    // ... entire function body
}
```

### 7. Dice: Remove dead variable
**File:** `dice_backend/src/defi_accounting/accounting.rs`

```rust
// DELETE line 764:
let mut recent: VecDeque<super::types::AbandonedEntry> = VecDeque::new();
```

## Verification

After changes, run:
```bash
cargo clippy --target wasm32-unknown-unknown -p plinko_backend 2>&1 | grep -E "(warning|error)"
cargo clippy --target wasm32-unknown-unknown -p dice_backend 2>&1 | grep -E "(warning|error)"
```

Expected: Only the style warnings (`manual_abs_diff`, `get_first`) should remain - no more dead code warnings.

## Affected Canisters
- `plinko_backend` (weupr-2qaaa-aaaap-abl3q-cai)
- `dice_backend` (whchi-hyaaa-aaaao-a4ruq-cai)

## LOC Impact
- **Deleted:** ~45 lines
- **Added:** 0 lines
- **Net:** -45 lines
