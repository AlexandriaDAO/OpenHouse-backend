# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-storage-refactor"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-storage-refactor`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build dice backend
   cargo build --target wasm32-unknown-unknown --release

   # Deploy to mainnet
   ./deploy.sh --dice-only
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test basic functions
   dfx canister --network ic call dice_backend greet '("Test")'
   dfx canister --network ic call dice_backend get_stats
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(dice): remove dual storage redundancy in accounting"
   git push -u origin refactor/dice-remove-dual-storage
   gh pr create --title "Refactor: Remove Dual Storage from Dice Accounting" --body "Implements REMOVE_DUAL_STORAGE.md

   **Changes:**
   - Removed redundant HashMap (USER_BALANCES)
   - Use only StableBTreeMap for user balances
   - Simplified upgrade hooks (no sync needed)
   - Reduced accounting.rs by ~80 lines

   **Impact:**
   - Same functionality, cleaner code
   - Better maintainability
   - No performance degradation (StableBTreeMap is fast enough)

   Deployed to mainnet:
   - Dice backend: whchi-hyaaa-aaaao-a4ruq-cai"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
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

**Branch:** `refactor/dice-remove-dual-storage`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-storage-refactor`

---

# Implementation Plan: Remove Dual Storage Redundancy

## Task Classification
**REFACTORING**: Improve existing code → subtractive + targeted fixes

## Current State

### Problem
`dice_backend/src/accounting.rs` maintains BOTH in-memory HashMap AND StableBTreeMap for user balances:

```rust
// Lines 45-54
thread_local! {
    // In-memory for "fast access"
    static USER_BALANCES: RefCell<HashMap<Principal, u64>> = ...

    // Stable storage for persistence
    static USER_BALANCES_STABLE: RefCell<StableBTreeMap<Principal, u64, Memory>> = ...
}
```

**Every balance operation writes to BOTH structures:**
- `deposit()` - lines 165-177
- `withdraw()` - lines 219-229
- `update_balance()` - lines 391-401
- `post_upgrade_accounting()` - lines 413-431 (syncs stable → volatile)

**Cost:** ~80 lines of redundant code

### Why This Exists
Supposed "performance optimization" - HashMap for fast queries vs StableBTreeMap.

### Why It's Wrong
- StableBTreeMap is O(log n) for queries, already fast
- Current depositors: 1 (maybe hundreds eventually) - negligible difference
- Adds complexity: double writes, sync logic, upgrade hooks
- Risk: state can diverge if sync fails

## Implementation

### File: `dice_backend/src/accounting.rs`

```rust
// PSEUDOCODE - Remove dual storage

// ============================================================================
// STEP 1: Remove in-memory HashMap (DELETE lines 46-47)
// ============================================================================
thread_local! {
    // DELETE THIS:
    // static USER_BALANCES: RefCell<HashMap<Principal, u64>> = ...

    // KEEP ONLY THIS:
    static USER_BALANCES_STABLE: RefCell<StableBTreeMap<Principal, u64, Memory>> = ...

    // Keep these (unchanged):
    static TOTAL_USER_DEPOSITS: RefCell<u64> = ...
    static CACHED_CANISTER_BALANCE: RefCell<u64> = ...
    static LAST_BALANCE_REFRESH: RefCell<u64> = ...
}

// ============================================================================
// STEP 2: Update get_balance() to use only StableBTreeMap (lines 320-325)
// ============================================================================
#[query]
pub fn get_balance(user: Principal) -> u64 {
    // OLD (delete):
    // USER_BALANCES.with(|balances| *balances.borrow().get(&user).unwrap_or(&0))

    // NEW (single source of truth):
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow().get(&user).unwrap_or(0)
    })
}

// ============================================================================
// STEP 3: Update deposit() - single write (lines 165-177)
// ============================================================================
#[update]
pub async fn deposit(amount: u64) -> Result<u64, String> {
    // ... validation and ICP transfer (unchanged) ...

    // Credit user - SINGLE WRITE
    let new_balance = USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&caller).unwrap_or(0);
        let new_bal = current + amount;
        balances.insert(caller, new_bal);
        new_bal
    });

    // Update total deposits (unchanged)
    TOTAL_USER_DEPOSITS.with(|total| *total.borrow_mut() += amount);

    // Refresh cached canister balance (unchanged)
    refresh_canister_balance().await;

    Ok(new_balance)
}

// ============================================================================
// STEP 4: Update withdraw() - single write + rollback (lines 219-290)
// ============================================================================
#[update]
pub async fn withdraw(amount: u64) -> Result<u64, String> {
    // ... validation (unchanged) ...

    let caller = ic_cdk::caller();
    let user_balance = get_balance(caller);

    // ... balance check (unchanged) ...

    // Deduct from user balance - SINGLE WRITE
    let new_balance = USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let new_bal = user_balance - amount;
        balances.insert(caller, new_bal);
        new_bal
    });

    // Update total deposits (unchanged)
    TOTAL_USER_DEPOSITS.with(|total| *total.borrow_mut() -= amount);

    // Transfer ICP (unchanged)
    let result = /* ... ICP transfer logic ... */;

    match result {
        Ok(_) => {
            refresh_canister_balance().await;
            Ok(new_balance)
        }
        Err(e) => {
            // ROLLBACK - single write
            USER_BALANCES_STABLE.with(|balances| {
                balances.borrow_mut().insert(caller, user_balance);
            });
            TOTAL_USER_DEPOSITS.with(|total| *total.borrow_mut() += amount);
            Err(e)
        }
    }
}

// ============================================================================
// STEP 5: Update update_balance() - single write (lines 391-401)
// ============================================================================
pub fn update_balance(user: Principal, new_balance: u64) -> Result<(), String> {
    // Single write to stable storage only
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, new_balance);
    });
    Ok(())
}

// ============================================================================
// STEP 6: Simplify post_upgrade_accounting() (lines 412-431)
// ============================================================================
pub fn post_upgrade_accounting() {
    // Recalculate total deposits from stable storage
    let mut total = 0u64;

    USER_BALANCES_STABLE.with(|stable| {
        for (_principal, balance) in stable.borrow().iter() {
            total += balance;
        }
    });

    TOTAL_USER_DEPOSITS.with(|t| {
        *t.borrow_mut() = total;
    });

    // No sync needed - already in stable storage!
}

// ============================================================================
// STEP 7: Simplify pre_upgrade_accounting() (lines 407-410)
// ============================================================================
pub fn pre_upgrade_accounting() {
    // Nothing needed - StableBTreeMap handles persistence automatically
}
```

### File: `dice_backend/src/lib.rs`

No changes needed - accounting module interface remains the same.

## Lines of Code Impact

**Before:** 432 lines
**After:** ~350 lines
**Reduction:** ~80 lines (18% smaller, much cleaner)

## Testing After Deployment

```bash
# Test deposit
dfx canister --network ic call dice_backend deposit '(100_000_000 : nat64)'

# Test balance query
dfx canister --network ic call dice_backend get_my_balance

# Test withdraw
dfx canister --network ic call dice_backend withdraw '(50_000_000 : nat64)'

# Verify accounting stats
dfx canister --network ic call dice_backend get_accounting_stats
dfx canister --network ic call dice_backend audit_balances
```

## Deployment Notes

**Affected canister:** `whchi-hyaaa-aaaao-a4ruq-cai` (dice_backend only)

**Data migration:** None needed - StableBTreeMap already contains all data.

**Upgrade safety:**
- Existing USER_BALANCES_STABLE data persists through upgrade
- post_upgrade_accounting() will recalculate totals correctly
- No risk of data loss

## Success Criteria

- ✅ Dice backend builds successfully
- ✅ Deployment succeeds
- ✅ Balance queries work
- ✅ Deposit/withdraw work
- ✅ Audit passes
- ✅ ~80 lines removed from accounting.rs
- ✅ PR created and merged
