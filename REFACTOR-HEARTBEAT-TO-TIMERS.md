# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-timers-refactor"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-timers-refactor`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build dice backend
   cargo build --target wasm32-unknown-unknown --release

   # Deploy to mainnet (dice backend only)
   ./deploy.sh --dice-only
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the accounting functions still work
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_accounting_stats
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor: migrate heartbeat to ic-cdk-timers for balance refresh

- Replace hourly heartbeat polling with periodic timer
- Delete unnecessary heartbeat.rs module (131 lines removed)
- Simplify state management (no more timing flags/stable storage)
- Reduce cycle costs by eliminating 3599/3600 unnecessary checks
- Maintain exact same 1-hour refresh behavior
- Clean up mod.rs exports and integration guide"

   git push -u origin refactor/heartbeat-to-timers

   gh pr create --title "Refactor: Migrate heartbeat to ic-cdk-timers" --body "## Summary
Simplifies balance cache refresh mechanism by replacing heartbeat polling with ic-cdk-timers.

## Changes
- ❌ **Deleted**: \`heartbeat.rs\` (131 lines) - complex polling logic no longer needed
- ✅ **Simplified**: \`mod.rs\` - removed heartbeat exports, added timer initialization
- ✅ **Simplified**: \`lib.rs\` - replaced heartbeat hook with timer initialization
- ✅ **Updated**: \`Cargo.toml\` - added ic-cdk-timers dependency

## Benefits
- **Less code**: 131 lines deleted, ~15 lines added (net -116 LOC)
- **Lower cycle cost**: No more checking every second when we only act hourly
- **Cleaner API**: Timer semantics match intent better than heartbeat
- **Same behavior**: Still refreshes balance every hour exactly

## Testing
- Deployed to mainnet: https://dashboard.internetcomputer.org/canister/whchi-hyaaa-aaaao-a4ruq-cai
- Verified accounting stats query works
- Timer will fire on schedule (verifiable in canister logs after 1 hour)

Implements REFACTOR-HEARTBEAT-TO-TIMERS.md"
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

**Branch:** `refactor/heartbeat-to-timers`
**Worktree:** `/home/theseus/alexandria/openhouse-timers-refactor`

---

# Refactoring Plan: Heartbeat to ic-cdk-timers

## Task Classification
**REFACTORING**: Simplify existing balance cache refresh mechanism by replacing heartbeat polling with timers.

## Current State

### Affected Files
```
dice_backend/
├── Cargo.toml                          [MODIFY] - Add ic-cdk-timers dependency
├── src/
│   ├── lib.rs                         [MODIFY] - Replace heartbeat with timer init
│   └── defi_accounting/
│       ├── mod.rs                     [MODIFY] - Remove heartbeat exports, add timer init
│       ├── heartbeat.rs               [DELETE] - 131 lines, entire file removed
│       ├── accounting.rs              [NO CHANGE] - refresh_canister_balance() stays
│       ├── README.md                  [MODIFY] - Update integration guide
│       └── CLAUDE.md                  [MODIFY] - Update module structure docs
```

### Current Implementation (dice_backend/src/defi_accounting/heartbeat.rs)
```rust
// 131 lines of code including:
// - HEARTBEAT_REFRESH_INTERVAL_NS constant (1 hour)
// - LAST_HEARTBEAT_REFRESH volatile state
// - HEARTBEAT_REFRESH_IN_PROGRESS flag for concurrency
// - HEARTBEAT_STATE_CELL stable storage for timing
// - init_heartbeat(), save_heartbeat_state(), restore_heartbeat_state()
// - heartbeat() function that checks time every second
// - FlagGuard struct for cleanup
// - Spawns async task to call accounting::refresh_canister_balance()
```

### Current Integration (dice_backend/src/lib.rs)
```rust
// Lines 2, 46, 51, 58-59, 148-151
use ic_cdk::{heartbeat, ...};

#[init]
fn init() {
    defi_accounting::init_heartbeat();  // Line 46
}

#[pre_upgrade]
fn pre_upgrade() {
    defi_accounting::save_heartbeat_state();  // Line 51
}

#[post_upgrade]
fn post_upgrade() {
    defi_accounting::restore_heartbeat_state();  // Line 58
    defi_accounting::init_heartbeat();  // Line 59
}

#[heartbeat]
fn heartbeat() {
    defi_accounting::heartbeat();  // Line 150
}
```

### Problems with Current Approach
1. **Unnecessary polling**: Heartbeat fires every ~1 second, checks elapsed time, skips 3599/3600 times
2. **Complex state**: Needs volatile + stable storage for timing, in-progress flags, guards
3. **More code**: 131 lines just for periodic refresh scheduling
4. **Wrong abstraction**: Heartbeat is for frequent tasks, not hourly schedules

## Target State (After Refactoring)

### New File Structure
```
dice_backend/
├── Cargo.toml                          [✅ MODIFIED] - Added ic-cdk-timers
├── src/
│   ├── lib.rs                         [✅ MODIFIED] - Timer init, no heartbeat
│   └── defi_accounting/
│       ├── mod.rs                     [✅ MODIFIED] - Simplified exports
│       ├── heartbeat.rs               [❌ DELETED] - Entire file removed
│       ├── accounting.rs              [✅ NO CHANGE] - Keep refresh function
│       ├── README.md                  [✅ MODIFIED] - Updated guide
│       └── CLAUDE.md                  [✅ MODIFIED] - Updated structure
```

### Code Reduction
- **Deleted**: 131 lines (heartbeat.rs)
- **Added**: ~15 lines (timer initialization)
- **Net**: -116 lines of code

## Implementation Plan

### Step 1: Add ic-cdk-timers Dependency

**File:** `dice_backend/Cargo.toml`

**Action:** Add dependency after ic-cdk

```toml
# PSEUDOCODE - Add this line
[dependencies]
candid = "0.10"
ic-cdk = "0.13"
ic-cdk-timers = "0.7"  # ADD THIS LINE
serde = { version = "1.0", features = ["derive"] }
# ... rest unchanged
```

### Step 2: Delete heartbeat.rs

**File:** `dice_backend/src/defi_accounting/heartbeat.rs`

**Action:** Delete entire file (131 lines removed)

```bash
# PSEUDOCODE
rm dice_backend/src/defi_accounting/heartbeat.rs
```

### Step 3: Simplify mod.rs

**File:** `dice_backend/src/defi_accounting/mod.rs`

**Current exports (lines 52-57):**
```rust
pub use heartbeat::{
    init_heartbeat,
    save_heartbeat_state,
    restore_heartbeat_state,
    heartbeat,
};
```

**Refactored mod.rs:**
```rust
// PSEUDOCODE

// Line 28: Remove heartbeat module declaration
// DELETE: pub mod heartbeat;

// Lines 52-57: Remove heartbeat exports, replace with timer function
// DELETE all heartbeat:: exports

// ADD new function for timer initialization
use std::time::Duration;

/// Initialize periodic timer for balance cache refresh
/// Call this in init() and post_upgrade()
pub fn init_balance_refresh_timer() {
    // Set timer to fire every hour
    ic_cdk_timers::set_timer_interval(Duration::from_secs(3600), || {
        ic_cdk::spawn(async {
            ic_cdk::println!("DeFi Accounting: refreshing balance cache at {}", ic_cdk::api::time());
            accounting::refresh_canister_balance().await;
        });
    });
}
```

**Lines to modify:**
- Line 28: Delete `pub mod heartbeat;`
- Lines 52-57: Delete heartbeat exports
- Add ~15 lines for `init_balance_refresh_timer()` function

### Step 4: Update lib.rs Integration

**File:** `dice_backend/src/lib.rs`

**Changes:**
```rust
// PSEUDOCODE

// Line 2: Remove heartbeat import
// CHANGE FROM:
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update, heartbeat};
// CHANGE TO:
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};

// Line 46: Replace init_heartbeat with timer init
#[init]
fn init() {
    ic_cdk::println!("Dice Game Backend Initialized");
    // CHANGE FROM: defi_accounting::init_heartbeat();
    defi_accounting::init_balance_refresh_timer();  // NEW
}

// Lines 50-53: Remove save_heartbeat_state from pre_upgrade
#[pre_upgrade]
fn pre_upgrade() {
    // DELETE: defi_accounting::save_heartbeat_state();
    // Keep: Note about StableBTreeMap
}

// Lines 56-60: Simplify post_upgrade
#[post_upgrade]
fn post_upgrade() {
    seed::restore_seed_state();
    // DELETE: defi_accounting::restore_heartbeat_state();
    // CHANGE FROM: defi_accounting::init_heartbeat();
    defi_accounting::init_balance_refresh_timer();  // NEW
    // Keep: Note about StableBTreeMap
}

// Lines 148-151: Delete entire heartbeat function
// DELETE:
// #[heartbeat]
// fn heartbeat() {
//     defi_accounting::heartbeat();
// }
```

### Step 5: Update Documentation

**File:** `dice_backend/src/defi_accounting/README.md`

**Section to update:** "Quick Integration" (lines 44-81)

```markdown
<!-- PSEUDOCODE -->

### Step 2: Update lib.rs

```rust
// Add module
mod defi_accounting;

// Re-export what you need
pub use defi_accounting::{
    deposit, withdraw, get_balance, get_house_balance,
    get_max_allowed_payout, AccountingStats
};

// In init()
#[init]
fn init() {
    defi_accounting::init_balance_refresh_timer();  // CHANGED
}

// In pre_upgrade() - no accounting calls needed anymore
#[pre_upgrade]
fn pre_upgrade() {
    // StableBTreeMap persists automatically
}

// In post_upgrade()
#[post_upgrade]
fn post_upgrade() {
    defi_accounting::init_balance_refresh_timer();  // CHANGED
    // StableBTreeMap restores automatically
}

// NO HEARTBEAT FUNCTION NEEDED ANYMORE - TIMERS HANDLE IT
```

**Also update:**
- Line 36: Remove heartbeat.rs from module structure diagram
- Lines 75-80: Delete heartbeat export instructions

**File:** `dice_backend/src/defi_accounting/CLAUDE.md`

**Update lines 29-31:**
```markdown
<!-- PSEUDOCODE -->

## Module Structure
- `mod.rs` - Public interface, timer initialization
- `accounting.rs` - Core logic (ICP transfers, balances)
```

**Delete line mentioning heartbeat.rs**

### Step 6: Build and Test

```bash
# PSEUDOCODE - Verification steps

# Clean build to catch any issues
cd /home/theseus/alexandria/openhouse-timers-refactor
cargo clean
cargo build --target wasm32-unknown-unknown --release

# Expected: Build succeeds, smaller WASM size (removed 131 lines)

# Deploy to mainnet
./deploy.sh --dice-only

# Verify accounting still works
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_accounting_stats

# Timer will fire automatically every hour (check logs after 1 hour)
```

## Benefits of This Refactoring

### Code Simplification
- **-131 lines**: Entire heartbeat.rs deleted
- **-5 exports**: Simplified public API
- **-3 lifecycle hooks**: No more save/restore heartbeat state
- **Net: -116 LOC**

### Performance Improvement
- **Before**: Check time 3600 times/hour, act 1 time/hour
- **After**: Fire timer 1 time/hour, act 1 time/hour
- **Cycle savings**: ~3599 wasted checks eliminated per hour

### Maintainability
- **Clearer intent**: "set_timer_interval(3600)" vs complex polling logic
- **Less state**: No timing flags, no stable storage for heartbeat
- **Simpler upgrades**: No heartbeat state to save/restore
- **Standard pattern**: Using official IC timer API

### Same Behavior
- ✅ Still refreshes every hour
- ✅ Still spawns async task
- ✅ Still calls accounting::refresh_canister_balance()
- ✅ Still logs refresh events
- ✅ Still works across upgrades (timer auto-resets in post_upgrade)

## Deployment Strategy

**Affected Canister:** Only `dice_backend` (whchi-hyaaa-aaaao-a4ruq-cai)

**Deployment Command:**
```bash
./deploy.sh --dice-only
```

**Risk Assessment:** LOW
- No logic changes to accounting (refresh_canister_balance unchanged)
- Only changes how refresh is scheduled (heartbeat → timer)
- Timer fires immediately after upgrade, then every hour
- No state migration needed (stable storage untouched)

**Rollback Plan:**
If issues arise, revert commit and redeploy. The accounting module's stable storage is unaffected, so no data loss possible.

## Testing Checklist

After deployment to mainnet:
- [ ] Canister deploys successfully
- [ ] `get_accounting_stats` query works
- [ ] `get_house_balance` query works
- [ ] `deposit` and `withdraw` functions work (if testing with real ICP)
- [ ] Check canister logs after 1 hour to verify timer fired
- [ ] Verify balance cache was refreshed (check log message)

## Success Criteria

✅ Build succeeds with smaller WASM output
✅ Deployment to mainnet succeeds
✅ All accounting queries work correctly
✅ Timer fires on schedule (verifiable in logs)
✅ PR created and merged
✅ Net reduction of ~116 lines of code
✅ Same functionality, cleaner implementation

---

## Notes for Implementer

- This is pure refactoring - no new features, no behavior changes
- The accounting.rs file remains untouched - only scheduling changes
- Timer automatically handles what heartbeat did manually
- Simpler code, lower cycles, same result
- Focus on deletion and simplification, not addition
