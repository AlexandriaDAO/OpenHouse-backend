# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-cleanup-archival"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-cleanup-archival`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Backend changes only (dice backend)
   cargo build --target wasm32-unknown-unknown --release
   ./deploy.sh --dice-only
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status whchi-hyaaa-aaaao-a4ruq-cai

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor: Remove ICP archival code after ckUSDT migration

- Delete emergency_withdraw_all() function (65 lines)
- Remove commented ICP ledger imports
- Replace ic-ledger-types::BlockIndex with u64
- Update stale ICP comments to reference USDT
- Remove ic-ledger-types dependency from Cargo.toml

This completes the code cleanup after the ckUSDT migration (PR #91, #93).
All ICP-specific code has been fully removed from the dice backend.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
   git push -u origin feature/cleanup-archival-code
   gh pr create --title "refactor: Remove ICP Archival Code" --body "Implements PLAN_REMOVE_ICP_ARCHIVAL_CODE.md

## Summary
Removes all commented-out ICP archival code from the dice backend after successful ckUSDT migration.

## Changes
- **Delete commented emergency_withdraw_all()** - 65 lines of old ICP withdrawal code (dice_backend/src/lib.rs:127-191)
- **Remove commented ICP imports** - Old ic_ledger_types imports (dice_backend/src/defi_accounting/accounting.rs:9-12)
- **Replace BlockIndex type** - Change from ic-ledger-types::BlockIndex to u64 for internal use
- **Remove Cargo dependency** - Delete ic-ledger-types from dice_backend/Cargo.toml
- **Update stale comments** - Fix references to 'ICP' that should say 'USDT'

## Impact
- **LOC Removed**: ~70 lines
- **Dependencies Removed**: 1 (ic-ledger-types)
- **Affected Canister**: Dice backend only
- **Risk**: Low - only removing dead code

## Context
The ICP to ckUSDT migration was completed in:
- PR #91: Initial ckUSDT implementation
- PR #93: Cleanup of ICP references
- PR #94: ckUSDT fee accounting fixes

This PR removes the final remnants - commented-out code that was left for reference during the migration.

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai"
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

**Branch:** `feature/cleanup-archival-code`
**Worktree:** `/home/theseus/alexandria/openhouse-cleanup-archival`

---

# Implementation Plan

## Context

The OpenHouse casino successfully migrated from ICP to ckUSDT as the in-game asset:
- **PR #91** (Nov 2024): Replaced ICP with ckUSDT for stable-value betting
- **PR #93** (Nov 2024): Cleaned up 25 remaining ICP references in UI and docs
- **PR #94** (Nov 2024): Fixed ckUSDT fee accounting bugs

However, commented-out archival code remains in the dice backend. This code was kept during the migration for reference but is no longer needed now that the system is stable and functioning correctly.

## Current State

### Archival Code Inventory

#### 1. Emergency Withdrawal Function (dice_backend/src/lib.rs:127-191)
**65 lines** of commented-out code:
```rust
// // =============================================================================
// // TEMPORARY EMERGENCY FUNCTION - TO BE REMOVED
// // =============================================================================
// // DEPRECATED: Old ICP emergency withdrawal (no longer used)
// // WARNING: This function transfers ALL ICP to admin for emergency recovery
// // Admin account: ifuqo-idvcc-eaaea-fpgnw-f52vs-glhdb-55jtt-glws3-jleqc-7nmkd-pae
// // TODO: Remove this function after emergency withdrawal and canister reinstall
// #[update]
// async fn emergency_withdraw_all() -> Result<u64, String> {
//     use ic_ledger_types::{
//         AccountIdentifier, TransferArgs, Tokens, DEFAULT_SUBACCOUNT,
//         MAINNET_LEDGER_CANISTER_ID, Memo, AccountBalanceArgs, Timestamp,
//     };
//     use candid::Principal;
//
//     // Admin principal
//     let admin = Principal::from_text("ifuqo-idvcc-eaaea-fpgnw-f52vs-glhdb-55jtt-glws3-jleqc-7nmkd-pae")
//         .map_err(|e| format!("Invalid admin principal: {:?}", e))?;
//
//     // ... 40+ more lines of ICP withdrawal logic
// }
```

**Why it exists**: Emergency mechanism to withdraw ICP funds during the migration
**Why remove it**: Migration complete, function never called, uses deprecated ICP ledger

#### 2. Commented ICP Imports (dice_backend/src/defi_accounting/accounting.rs:9-12)
```rust
// Note: This module now uses ckUSDT (ICRC-2), not ICP ledger
// ckUSDT types defined in types.rs
// use ic_ledger_types::{
//     AccountIdentifier, TransferArgs, Tokens, DEFAULT_SUBACCOUNT,
//     MAINNET_LEDGER_CANISTER_ID, Memo, AccountBalanceArgs, BlockIndex, Timestamp,
// };
use ic_ledger_types::BlockIndex; // Still used for TransferResult
```

**Why it exists**: Original ICP ledger imports, kept for reference during migration
**Why remove it**: All ICP code gone, only BlockIndex still in use (will be replaced)

#### 3. Active ic-ledger-types Usage (dice_backend/src/defi_accounting/accounting.rs:13,71-74)
```rust
use ic_ledger_types::BlockIndex; // Still used for TransferResult

enum TransferResult {
    Success(BlockIndex),  // <- Only usage of BlockIndex
    DefiniteError(String),
    UncertainError(String),
}
```

**Why it exists**: Internal enum to classify ICRC-2 transfer results
**Why it's problematic**: Requires entire ic-ledger-types dependency just for this one type
**Solution**: Replace `BlockIndex` with `u64` (equivalent for our purposes)

#### 4. ic-ledger-types Dependency (dice_backend/Cargo.toml:17)
```toml
ic-ledger-types = "0.16.0-beta.1"
```

**Why it exists**: Was needed for ICP ledger operations
**Why remove it**: After BlockIndex replacement, dependency is completely unused

#### 5. Stale Comments
- `dice_backend/src/defi_accounting/liquidity_pool.rs:404`
  - Says: `// 1 ICP initial price`
  - Should say: `// 1 USDT initial price`

## Implementation

### Step 1: Delete Emergency Withdrawal Function

**File**: `dice_backend/src/lib.rs`
**Lines to delete**: 127-191 (entire commented block including header comments)

```rust
// PSEUDOCODE - Delete these lines
// DELETE FROM LINE 127:
// // =============================================================================
// // TEMPORARY EMERGENCY FUNCTION - TO BE REMOVED
// ...
// TO LINE 191:
// // }

// RESULT: Clean file with no commented function
```

### Step 2: Remove Commented ICP Imports

**File**: `dice_backend/src/defi_accounting/accounting.rs`
**Lines to delete**: 9-12

```rust
// PSEUDOCODE - Before
use candid::{CandidType, Deserialize, Principal, Nat};
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::{StableBTreeMap, StableVec};
use std::cell::RefCell;
use std::time::Duration;
// Note: This module now uses ckUSDT (ICRC-2), not ICP ledger
// ckUSDT types defined in types.rs
// use ic_ledger_types::{              // DELETE THIS LINE
//     AccountIdentifier, TransferArgs, Tokens, DEFAULT_SUBACCOUNT,  // DELETE
//     MAINNET_LEDGER_CANISTER_ID, Memo, AccountBalanceArgs, BlockIndex, Timestamp,  // DELETE
// };                                   // DELETE THIS LINE
use ic_ledger_types::BlockIndex; // Still used for TransferResult
use crate::types::{Account, TransferFromArgs, TransferFromError, TransferArg, TransferError, CKUSDT_CANISTER_ID, CKUSDT_TRANSFER_FEE};

// PSEUDOCODE - After
use candid::{CandidType, Deserialize, Principal, Nat};
use ic_cdk::{query, update};
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::{StableBTreeMap, StableVec};
use std::cell::RefCell;
use std::time::Duration;
// Note: This module now uses ckUSDT (ICRC-2), not ICP ledger
// ckUSDT types defined in types.rs
use crate::types::{Account, TransferFromArgs, TransferFromError, TransferArg, TransferError, CKUSDT_CANISTER_ID, CKUSDT_TRANSFER_FEE};
```

### Step 3: Replace BlockIndex with u64

**File**: `dice_backend/src/defi_accounting/accounting.rs`

**Change 1** - Remove import (line 13):
```rust
// PSEUDOCODE - Delete this line
use ic_ledger_types::BlockIndex; // Still used for TransferResult
```

**Change 2** - Update TransferResult enum (line 71-75):
```rust
// PSEUDOCODE - Before
enum TransferResult {
    Success(BlockIndex),
    DefiniteError(String),
    UncertainError(String),
}

// PSEUDOCODE - After
enum TransferResult {
    Success(u64),  // Block index as u64 (sufficient for our internal use)
    DefiniteError(String),
    UncertainError(String),
}
```

**Justification**:
- ckUSDT ledger returns `Nat` for block indices
- `BlockIndex` from ic-ledger-types is just a type alias for `u64`
- We only use it internally to track transfer results
- No need for the entire dependency just for this one type alias

### Step 4: Remove ic-ledger-types Dependency

**File**: `dice_backend/Cargo.toml`
**Line to delete**: 17

```toml
# PSEUDOCODE - Before
[dependencies]
candid = "0.10"
ic-cdk = "0.19"
ic-cdk-timers = "1.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
sha2 = "0.10"
ic-stable-structures = "0.7"
ic-ledger-types = "0.16.0-beta.1"  # DELETE THIS LINE

num-bigint = "0.4"
num-traits = "0.2"

# PSEUDOCODE - After
[dependencies]
candid = "0.10"
ic-cdk = "0.19"
ic-cdk-timers = "1.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
sha2 = "0.10"
ic-stable-structures = "0.7"

num-bigint = "0.4"
num-traits = "0.2"
```

### Step 5: Update Stale Comment

**File**: `dice_backend/src/defi_accounting/liquidity_pool.rs`
**Line**: 404

```rust
// PSEUDOCODE - Before
let share_price = if total_shares == Nat::from(0u64) {
    Nat::from(100_000_000u64) // 1 ICP initial price
} else if pool_reserve == Nat::from(0u64) {

// PSEUDOCODE - After
let share_price = if total_shares == Nat::from(0u64) {
    Nat::from(100_000_000u64) // 1 USDT initial price (100M decimals = 1.00 USDT)
} else if pool_reserve == Nat::from(0u64) {
```

## Testing & Verification

### Build Check
```bash
# Verify Rust compilation
cd dice_backend
cargo build --target wasm32-unknown-unknown --release

# Should succeed with no errors about missing BlockIndex or ic_ledger_types
```

### Deployment
```bash
# Deploy dice backend to mainnet
./deploy.sh --dice-only
```

### Smoke Tests (Manual)
```bash
# 1. Check canister is healthy
dfx canister --network ic status whchi-hyaaa-aaaao-a4ruq-cai

# 2. Test core game functionality still works
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_stats

# 3. Verify frontend dice game works
# Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
# - Can place bets
# - Deposits work
# - Withdrawals work
# - LP deposits work
# - LP withdrawals work
```

## Risk Assessment

**Impact**: LOW
- Only removing dead code (commented out, never executed)
- BlockIndex type replacement is semantically identical (both u64)
- No logic changes to active code paths

**Rollback**: Not needed
- If any issues arise, they'll be caught in build/deployment
- No database migrations or state changes

## Success Criteria

- ✅ All commented ICP code removed
- ✅ ic-ledger-types dependency removed from Cargo.toml
- ✅ dice_backend compiles successfully
- ✅ Dice backend deploys to mainnet successfully
- ✅ Core dice game functions work (get_stats, play_dice)
- ✅ PR created and awaiting review

## Related Work

- PR #91: Initial ICP → ckUSDT migration
- PR #93: Cleaned up UI/docs ICP references (25 locations)
- PR #94: Fixed ckUSDT fee accounting bugs
- This PR: Final cleanup - removes commented archival code

## Affected Canister

- **Dice Backend**: `whchi-hyaaa-aaaao-a4ruq-cai` (ONLY canister with changes)
- **No changes to**: Crash, Plinko, Mines, or Frontend canisters
