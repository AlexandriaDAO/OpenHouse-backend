# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-unified-accounting"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-unified-accounting`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build all backends
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend (declarations will update)
   cd openhouse_frontend && npm run build && cd ..

   # Deploy everything to mainnet
   ./deploy.sh
   ```

4. **Verify deployment**:
   ```bash
   # Test critical methods on each backend
   dfx canister --network ic call weupr-2qaaa-aaaap-abl3q-cai get_house_balance
   dfx canister --network ic call wvrcw-3aaaa-aaaah-arm4a-cai get_house_balance

   # Check frontend loads without errors
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/blackjack"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix: unify defi_accounting API exposure across all game backends

- Add missing get_house_balance() to plinko and blackjack
- Add missing get_max_allowed_payout() to plinko and blackjack
- Add missing admin/LP methods to all backends
- Standardize withdrawal status method name
- Update .did files for all affected backends
- Fixes browser crash in plinko/blackjack due to missing get_house_balance()"

   git push -u origin feature/unified-accounting-apis

   gh pr create --title "Fix: Unify defi_accounting API exposure across all game backends" --body "Implements PLAN_UNIFIED_ACCOUNTING_APIS.md

## Problem
Browser crashes in Plinko and Blackjack games due to missing \`get_house_balance()\` method. Frontend's \`GameBalanceProvider\` tries to call this method on all games, but it's not exposed in plinko/blackjack backends.

## Root Cause
Inconsistent API exposure:
- **Dice backend**: 23 defi_accounting methods exposed
- **Plinko backend**: 13 methods (missing 10)
- **Blackjack backend**: 13 methods (missing 10)
- **Crash backend**: No defi_accounting (legacy)

All three backends (dice, plinko, blackjack) share the SAME \`defi_accounting/\` module code, but expose different subsets of its API.

## Solution
Standardize API exposure to match dice_backend (the reference implementation):

### Critical Methods (Fix Browser Crash):
- \`get_house_balance()\` - Returns pool reserve
- \`get_max_allowed_payout()\` - Returns max bet limit

### LP Provider UX:
- \`calculate_shares_preview()\` - Preview shares before deposit
- \`can_accept_bets()\` - Check if pool can accept bets

### Admin/Monitoring:
- \`admin_get_all_balances()\` and \`admin_get_all_balances_complete()\`
- \`admin_get_all_lp_positions()\` and \`admin_get_all_lp_positions_complete()\`
- \`admin_get_orphaned_funds_report_full()\`

### Statistics:
- \`get_stats_range()\` - Stats for date range
- \`get_stats_count()\` - Total snapshot count

### Naming Consistency:
- Rename plinko's \`get_pending_withdrawal()\` → \`get_my_withdrawal_status()\` to match dice/blackjack

## Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Plinko Backend: weupr-2qaaa-aaaap-abl3q-cai
- Blackjack Backend: wvrcw-3aaaa-aaaah-arm4a-cai
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai (reference - unchanged)

## Testing
1. Visit plinko game - should load without browser crash
2. Visit blackjack game - should load without browser crash
3. Check balances display correctly in both games
4. Admin dashboard should show unified data across all games"
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

**Branch:** `feature/unified-accounting-apis`
**Worktree:** `/home/theseus/alexandria/openhouse-unified-accounting`

---

# Implementation Plan: Unified defi_accounting API Exposure

## Problem Statement

**Browser Crash**: Plinko and Blackjack games crash the browser with error:
```
TypeError: can't convert 6.52 to BigInt
Failed to load game data: TypeError: can't convert 6.52 to BigInt
```

**Root Cause**: Frontend's `GameBalanceProvider.tsx` calls `get_house_balance()` on ALL games:
```typescript
// Line 114-117 in GameBalanceProvider.tsx
[gameBalance, houseBalance] = await Promise.all([
  (plinkoActor as any).get_my_balance(),
  (plinkoActor as any).get_house_balance(),  // ❌ FAILS - method doesn't exist!
]);
```

**Why It Fails**:
- Dice backend: ✅ Has `get_house_balance()`
- Plinko backend: ❌ Missing `get_house_balance()`
- Blackjack backend: ❌ Missing `get_house_balance()`
- All three share the SAME `defi_accounting/` module, but expose different APIs

## Current State Analysis

### Backend Comparison

| Backend | defi_accounting | Query Methods | Update Methods |
|---------|----------------|---------------|----------------|
| **Dice** (reference) | ✅ | 27 | 7 |
| **Plinko** | ✅ | 17 | 6 |
| **Blackjack** | ✅ | 19 | 4 |
| **Crash** | ❌ | 5 | 1 |

### API Gaps (vs Dice Reference)

**Plinko Missing (10 methods)**:
1. ❌ `get_house_balance()` - **CRITICAL** (causes crash)
2. ❌ `get_max_allowed_payout()` - **CRITICAL** (needed for bet validation)
3. ❌ `calculate_shares_preview()` - LP UX
4. ❌ `can_accept_bets()` - Game availability check
5. ❌ `get_stats_range()` - Admin stats
6. ❌ `get_stats_count()` - Admin stats
7. ❌ `admin_get_all_balances()` - Admin audit
8. ❌ `admin_get_all_balances_complete()` - Admin audit
9. ❌ `admin_get_all_lp_positions()` - Admin audit
10. ❌ `admin_get_all_lp_positions_complete()` - Admin audit
11. ❌ `admin_get_orphaned_funds_report_full()` - Admin audit

**Plinko Naming Inconsistency**:
- Has: `get_pending_withdrawal()`
- Should be: `get_my_withdrawal_status()` (match dice/blackjack)

**Blackjack Missing (10 methods)**:
1. ❌ `get_house_balance()` - **CRITICAL** (causes crash)
2. ❌ `get_max_allowed_payout()` - **CRITICAL** (already has this! just not exposed in .did)
3. ❌ `calculate_shares_preview()` - LP UX
4. ❌ `can_accept_bets()` - Game availability check
5. ❌ `admin_get_all_pending_withdrawals()` - Admin audit
6. ❌ `admin_get_all_balances()` - Admin audit
7. ❌ `admin_get_all_balances_complete()` - Admin audit
8. ❌ `admin_get_all_lp_positions()` - Admin audit
9. ❌ `admin_get_all_lp_positions_complete()` - Admin audit
10. ❌ `admin_get_orphaned_funds_report()` - Admin audit
11. ❌ `admin_get_orphaned_funds_report_full()` - Admin audit

**Blackjack Missing Updates**:
- ❌ `deposit()` - User deposit
- ❌ `withdraw_all()` - User withdrawal
- ❌ `retry_withdrawal()` - Recovery
- ❌ `deposit_liquidity()` - LP deposit
- ❌ `withdraw_all_liquidity()` - LP withdrawal
- ❌ `admin_health_check()` - Admin diagnostic

### Why Unification Matters

1. **Frontend Consistency**: `GameBalanceProvider` expects same API across all games
2. **Admin Tooling**: Monitoring dashboards need uniform data access
3. **LP Experience**: Liquidity providers should see same features in all games
4. **Maintainability**: One reference API = easier to update all games
5. **User Trust**: Consistent behavior builds confidence

## Implementation Strategy

### Phase 1: Add Missing Methods to Plinko (plinko_backend/src/lib.rs)

**Location**: After `get_my_balance()` at line ~250

```rust
// PSEUDOCODE - Add after get_my_balance()

#[query]
fn get_house_balance() -> u64 {
    // Returns pool reserve
    // WHY: Frontend GameBalanceProvider expects this on all games
    // IMPACT: Fixes browser crash
    defi_accounting::query::get_house_balance()
}

#[query]
fn get_max_allowed_payout() -> u64 {
    // Returns 15% of pool balance (max payout per bet)
    // WHY: Frontend needs this for bet validation
    // IMPACT: Enables proper max bet calculations
    defi_accounting::query::get_max_allowed_payout()
}
```

**Location**: After `get_my_lp_position()` at line ~278

```rust
// PSEUDOCODE - LP UX improvements

#[query]
fn calculate_shares_preview(amount: u64) -> Result<candid::Nat, String> {
    // Preview LP shares before depositing
    // WHY: LPs want to see share calculation before committing funds
    // IMPACT: Better LP UX, reduces surprises
    defi_accounting::liquidity_pool::calculate_shares_preview(amount)
}

#[query]
fn can_accept_bets() -> bool {
    // Check if pool has enough liquidity for bets
    // WHY: Frontend can disable game if pool too low
    // IMPACT: Prevents bet rejections, better UX
    defi_accounting::liquidity_pool::can_accept_bets()
}
```

**Location**: After `admin_get_orphaned_funds_report()` at line ~302

```rust
// PSEUDOCODE - Admin audit tools

#[query]
fn admin_get_orphaned_funds_report_full() -> Result<defi_accounting::types::OrphanedFundsReport, String> {
    // Get complete orphaned funds list (no limit)
    // WHY: Admin needs to audit all abandoned withdrawals
    // IMPACT: Better accounting transparency
    defi_accounting::admin_query::get_orphaned_funds_report_full()
}

#[query]
fn admin_get_all_balances(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    // Paginated user balance list
    // WHY: Admin dashboard needs to iterate all users
    // IMPACT: Enables user balance auditing
    defi_accounting::admin_query::get_all_balances(offset, limit)
}

#[query]
fn admin_get_all_balances_complete() -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    // Get all user balances in one call
    // WHY: Quick audit of total user deposits
    // IMPACT: Enables solvency checks
    defi_accounting::admin_query::get_all_balances_complete()
}

#[query]
fn admin_get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    // Paginated LP position list
    // WHY: Admin needs to see all liquidity providers
    // IMPACT: Enables LP accounting audits
    defi_accounting::admin_query::get_all_lp_positions(offset, limit)
}

#[query]
fn admin_get_all_lp_positions_complete() -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    // Get all LP positions in one call
    // WHY: Quick audit of total pool ownership
    // IMPACT: Enables LP share verification
    defi_accounting::admin_query::get_all_lp_positions_complete()
}
```

**Location**: After `get_pool_apy()` at line ~316

```rust
// PSEUDOCODE - Statistics enhancements

#[query]
fn get_stats_range(start_ts: u64, end_ts: u64) -> Vec<defi_accounting::DailySnapshot> {
    // Get daily stats for specific date range
    // WHY: Admin/analytics need historical data slices
    // IMPACT: Enables performance analysis over time
    defi_accounting::get_snapshots_range(start_ts, end_ts)
}

#[query]
fn get_stats_count() -> u64 {
    // Get total number of daily snapshots
    // WHY: Pagination needs total count
    // IMPACT: Enables proper stats iteration
    defi_accounting::get_snapshot_count()
}
```

**Location**: Rename existing method at line ~238

```rust
// PSEUDOCODE - Consistency fix

// BEFORE:
#[query]
fn get_pending_withdrawal() -> Option<defi_accounting::types::PendingWithdrawal> {
    defi_accounting::accounting::get_withdrawal_status()
}

// AFTER:
#[query]
fn get_my_withdrawal_status() -> Option<defi_accounting::types::PendingWithdrawal> {
    // WHY: Match naming convention used in dice and blackjack
    // IMPACT: Consistent API across all games
    defi_accounting::accounting::get_withdrawal_status()
}
```

### Phase 2: Add Missing Methods to Blackjack (blackjack_backend/src/lib.rs)

**Location**: After `get_my_balance()` at line ~188

```rust
// PSEUDOCODE - Critical missing methods

#[query]
fn get_house_balance() -> u64 {
    // Returns pool reserve
    // WHY: Frontend GameBalanceProvider expects this on all games
    // IMPACT: Fixes browser crash in blackjack
    defi_accounting::query::get_house_balance()
}

// NOTE: get_max_allowed_payout() already exists at line 191!
// Just verify it's properly exposed in .did file
```

**Location**: After `get_my_lp_position()` at line ~213

```rust
// PSEUDOCODE - LP and game availability

#[query]
fn calculate_shares_preview(amount: u64) -> Result<candid::Nat, String> {
    // Preview LP shares before depositing
    // WHY: LPs want to see share calculation before committing funds
    // IMPACT: Better LP UX in blackjack
    defi_accounting::liquidity_pool::calculate_shares_preview(amount)
}

#[query]
fn can_accept_bets() -> bool {
    // Check if pool has enough liquidity for bets
    // WHY: Frontend can disable blackjack if pool too low
    // IMPACT: Prevents bet rejections
    defi_accounting::liquidity_pool::can_accept_bets()
}
```

**Location**: Add complete admin section (blackjack currently has NONE)

```rust
// PSEUDOCODE - Add after LP section, before statistics

// =============================================================================
// ADMIN DIAGNOSTIC ENDPOINTS
// =============================================================================

#[update]
async fn admin_health_check() -> Result<defi_accounting::types::HealthCheck, String> {
    // WHY: Critical for monitoring solvency and system health
    // IMPACT: Enables proactive issue detection
    defi_accounting::admin_query::admin_health_check().await
}

#[query]
fn admin_get_all_pending_withdrawals() -> Result<Vec<defi_accounting::types::PendingWithdrawalInfo>, String> {
    // WHY: Admin needs to monitor stuck withdrawals
    // IMPACT: Better customer support
    defi_accounting::admin_query::get_all_pending_withdrawals()
}

#[query]
fn admin_get_orphaned_funds_report(recent_limit: Option<u64>) -> Result<defi_accounting::types::OrphanedFundsReport, String> {
    // WHY: Track abandoned withdrawals (accounting accuracy)
    // IMPACT: Enables recovery of orphaned funds
    defi_accounting::admin_query::get_orphaned_funds_report(recent_limit)
}

#[query]
fn admin_get_orphaned_funds_report_full() -> Result<defi_accounting::types::OrphanedFundsReport, String> {
    // WHY: Complete audit of all abandoned funds
    // IMPACT: Financial transparency
    defi_accounting::admin_query::get_orphaned_funds_report_full()
}

#[query]
fn admin_get_all_balances(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    // WHY: Paginated user audit capability
    // IMPACT: Enables solvency verification
    defi_accounting::admin_query::get_all_balances(offset, limit)
}

#[query]
fn admin_get_all_balances_complete() -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    // WHY: Quick total user deposits check
    // IMPACT: Solvency monitoring
    defi_accounting::admin_query::get_all_balances_complete()
}

#[query]
fn admin_get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    // WHY: LP accounting audit
    // IMPACT: Verify share ownership
    defi_accounting::admin_query::get_all_lp_positions(offset, limit)
}

#[query]
fn admin_get_all_lp_positions_complete() -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    // WHY: Complete LP ownership verification
    // IMPACT: Pool transparency
    defi_accounting::admin_query::get_all_lp_positions_complete()
}
```

**Location**: Add missing user operations (blackjack has NO deposit/withdraw!)

```rust
// PSEUDOCODE - Add accounting endpoints section

// =============================================================================
// ACCOUNTING ENDPOINTS
// =============================================================================

#[update]
async fn deposit(amount: u64) -> Result<u64, String> {
    // WHY: Users need to deposit ckUSDT to play blackjack
    // IMPACT: Critical for gameplay funding
    defi_accounting::accounting::deposit(amount).await
}

#[update]
async fn withdraw_all() -> Result<u64, String> {
    // WHY: Users need to cash out winnings
    // IMPACT: Critical for fund recovery
    defi_accounting::accounting::withdraw_all().await
}

#[update]
async fn retry_withdrawal() -> Result<u64, String> {
    // WHY: Handle timeout scenarios (1 in 30B chance)
    // IMPACT: User fund safety
    defi_accounting::accounting::retry_withdrawal().await
}

#[query]
fn get_my_withdrawal_status() -> Option<defi_accounting::types::PendingWithdrawal> {
    // WHY: User needs to track withdrawal progress
    // IMPACT: Transparency during payouts
    defi_accounting::accounting::get_withdrawal_status()
}
```

**Location**: Add missing LP operations

```rust
// PSEUDOCODE - Add to LP section

#[update]
async fn deposit_liquidity(amount: u64, min_shares_expected: Option<candid::Nat>) -> Result<candid::Nat, String> {
    // WHY: LPs need to add liquidity to blackjack pool
    // IMPACT: Pool funding mechanism
    defi_accounting::liquidity_pool::deposit_liquidity(amount, min_shares_expected).await
}

#[update]
async fn withdraw_all_liquidity() -> Result<u64, String> {
    // WHY: LPs need to exit positions
    // IMPACT: LP fund recovery
    defi_accounting::liquidity_pool::withdraw_all_liquidity().await
}
```

**Location**: Enhance statistics section

```rust
// PSEUDOCODE - Add to statistics section after get_stats_count()

#[query]
fn get_stats_range(start_ts: u64, end_ts: u64) -> Vec<defi_accounting::DailySnapshot> {
    // WHY: Time-based analytics
    // IMPACT: Performance tracking over periods
    defi_accounting::get_snapshots_range(start_ts, end_ts)
}
```

### Phase 3: Update Candid Interface Files

**File**: `plinko_backend/plinko_backend.did`

```candid
// PSEUDOCODE - Add these to service definition

service : {
  // ... existing methods ...

  // NEW: Critical query methods
  get_house_balance: () -> (nat64) query;
  get_max_allowed_payout: () -> (nat64) query;

  // NEW: LP preview
  calculate_shares_preview: (nat64) -> (variant { Ok: nat; Err: text }) query;
  can_accept_bets: () -> (bool) query;

  // NEW: Admin audit
  admin_get_all_balances: (nat64, nat64) -> (variant { Ok: vec UserBalance; Err: text }) query;
  admin_get_all_balances_complete: () -> (variant { Ok: vec UserBalance; Err: text }) query;
  admin_get_all_lp_positions: (nat64, nat64) -> (variant { Ok: vec LPPositionInfo; Err: text }) query;
  admin_get_all_lp_positions_complete: () -> (variant { Ok: vec LPPositionInfo; Err: text }) query;
  admin_get_orphaned_funds_report_full: () -> (variant { Ok: OrphanedFundsReport; Err: text }) query;

  // NEW: Stats
  get_stats_range: (nat64, nat64) -> (vec DailySnapshot) query;
  get_stats_count: () -> (nat64) query;

  // RENAMED: Consistency
  get_my_withdrawal_status: () -> (opt PendingWithdrawal) query;
  // REMOVED: get_pending_withdrawal (renamed above)
}

// WHY: .did file must match lib.rs exports
// IMPACT: Frontend can generate correct TypeScript bindings
```

**File**: `blackjack_backend/blackjack_backend.did`

```candid
// PSEUDOCODE - Add these to service definition

// Add missing type definitions (copy from dice_backend.did):
type UserBalance = record {
  user: principal;
  balance: nat64;
};

type LPPositionInfo = record {
  user: principal;
  shares: nat;
  pool_ownership_percent: float64;
  redeemable_icp: nat;
};

service : {
  // ... existing methods ...

  // NEW: Critical accounting
  deposit: (nat64) -> (variant { Ok: nat64; Err: text });
  withdraw_all: () -> (variant { Ok: nat64; Err: text });
  retry_withdrawal: () -> (variant { Ok: nat64; Err: text });
  get_my_withdrawal_status: () -> (opt PendingWithdrawal) query;
  get_house_balance: () -> (nat64) query;

  // NEW: LP operations
  deposit_liquidity: (nat64, opt nat) -> (variant { Ok: nat; Err: text });
  withdraw_all_liquidity: () -> (variant { Ok: nat64; Err: text });
  calculate_shares_preview: (nat64) -> (variant { Ok: nat; Err: text }) query;
  can_accept_bets: () -> (bool) query;

  // NEW: Admin
  admin_health_check: () -> (variant { Ok: HealthCheck; Err: text });
  admin_get_all_pending_withdrawals: () -> (variant { Ok: vec PendingWithdrawalInfo; Err: text }) query;
  admin_get_all_balances: (nat64, nat64) -> (variant { Ok: vec UserBalance; Err: text }) query;
  admin_get_all_balances_complete: () -> (variant { Ok: vec UserBalance; Err: text }) query;
  admin_get_all_lp_positions: (nat64, nat64) -> (variant { Ok: vec LPPositionInfo; Err: text }) query;
  admin_get_all_lp_positions_complete: () -> (variant { Ok: vec LPPositionInfo; Err: text }) query;
  admin_get_orphaned_funds_report: (opt nat64) -> (variant { Ok: OrphanedFundsReport; Err: text }) query;
  admin_get_orphaned_funds_report_full: () -> (variant { Ok: OrphanedFundsReport; Err: text }) query;

  // NEW: Stats
  get_stats_range: (nat64, nat64) -> (vec DailySnapshot) query;
}

// WHY: Blackjack was missing most defi_accounting types
// IMPACT: Complete API parity with dice
```

### Phase 4: Update Frontend Type Declarations (Automatic)

After deployment, run:
```bash
cd openhouse_frontend
dfx generate
```

**WHY**: TypeScript bindings auto-generate from .did files
**IMPACT**: Frontend gets type-safe access to new methods

### Testing Verification

**On Mainnet** (no local testing):

1. **Critical - Browser Crash Fix**:
   ```bash
   # Visit plinko - should load without crash
   echo "Test: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"

   # Visit blackjack - should load without crash
   echo "Test: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/blackjack"

   # Check console - no "can't convert X to BigInt" errors
   ```

2. **API Availability**:
   ```bash
   # Test plinko has new methods
   dfx canister --network ic call weupr-2qaaa-aaaap-abl3q-cai get_house_balance
   dfx canister --network ic call weupr-2qaaa-aaaap-abl3q-cai get_max_allowed_payout
   dfx canister --network ic call weupr-2qaaa-aaaap-abl3q-cai can_accept_bets

   # Test blackjack has new methods
   dfx canister --network ic call wvrcw-3aaaa-aaaah-arm4a-cai get_house_balance
   dfx canister --network ic call wvrcw-3aaaa-aaaah-arm4a-cai deposit '(1000000)'
   dfx canister --network ic call wvrcw-3aaaa-aaaah-arm4a-cai admin_health_check
   ```

3. **Balance Display**:
   - Load plinko game
   - Check "HOUSE" balance displays correctly
   - Load blackjack game
   - Check "HOUSE" balance displays correctly

## Files to Modify

### Backend
1. `plinko_backend/src/lib.rs` - Add 11 methods, rename 1 method
2. `plinko_backend/plinko_backend.did` - Update Candid interface
3. `blackjack_backend/src/lib.rs` - Add 20+ methods (massive gap)
4. `blackjack_backend/blackjack_backend.did` - Update Candid interface, add types

### Frontend (Automatic)
1. `openhouse_frontend/src/declarations/plinko_backend/` - Auto-generated
2. `openhouse_frontend/src/declarations/blackjack_backend/` - Auto-generated

## Deployment Impact

**Affected Canisters**:
- `weupr-2qaaa-aaaap-abl3q-cai` (Plinko)
- `wvrcw-3aaaa-aaaah-arm4a-cai` (Blackjack)
- `pezw3-laaaa-aaaal-qssoa-cai` (Frontend - declarations update)

**Unchanged**:
- `whchi-hyaaa-aaaao-a4ruq-cai` (Dice - reference implementation)
- `fws6k-tyaaa-aaaap-qqc7q-cai` (Crash - no defi_accounting)

**Deployment Strategy**:
```bash
# Simple: Deploy everything
./deploy.sh

# Or targeted:
./deploy.sh --plinko-only
./deploy.sh --blackjack-only
./deploy.sh --frontend-only
```

## Success Criteria

1. ✅ Plinko game loads without browser crash
2. ✅ Blackjack game loads without browser crash
3. ✅ All three backends (dice/plinko/blackjack) expose identical defi_accounting APIs
4. ✅ Frontend balance display works for all games
5. ✅ Admin can query health/balances/LPs uniformly across games
6. ✅ LP providers see consistent features in all games

## Why This Matters

**User Impact**:
- Games that were crashing now work
- Consistent UX across all games
- Better transparency (admin endpoints)

**Developer Impact**:
- One reference API to maintain (dice)
- Easy to add new games (copy dice pattern)
- Simpler frontend code (same provider for all)

**Business Impact**:
- Liquidity providers get better tooling
- Admin gets unified monitoring
- Scales to future games easily

## Rationale for Each Addition

### Critical Methods (Fix Crash)
- `get_house_balance()`: Frontend EXPECTS this on all games. Missing = crash.
- `get_max_allowed_payout()`: Needed for bet validation. Missing = can't check limits.

### LP Provider UX
- `calculate_shares_preview()`: LPs want to see what they'll get BEFORE depositing
- `can_accept_bets()`: Frontend can show "pool empty" message instead of bet rejection

### Admin/Monitoring
- All `admin_*` methods: Enable unified admin dashboard across games
- Without these: Admin must manually query each canister differently

### Statistics
- `get_stats_range()`: Time-series analysis (e.g., "show last 30 days")
- `get_stats_count()`: Pagination support

### Naming Consistency
- `get_my_withdrawal_status()`: Match dice/blackjack naming convention
- Makes API predictable across all games

## Reference Implementation

**Dice Backend** (`dice_backend/src/lib.rs`) is the reference. It has:
- Complete defi_accounting API exposure
- Proper separation of concerns
- All admin/LP/stats methods
- Consistent naming

Copy its pattern to plinko and blackjack.
