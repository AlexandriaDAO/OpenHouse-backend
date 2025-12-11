# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-crash-defi"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-crash-defi`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release -p crash_backend
   ./deploy.sh --crash-only
   ```
4. **Verify deployment**:
   ```bash
   dfx canister --network ic status crash_backend
   dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai greet '("Test")'
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: integrate defi_accounting into crash backend for real ckUSDT betting"
   git push -u origin feature/crash-defi-integration
   gh pr create --title "feat: Crash DeFi Integration - Real ckUSDT Betting" --body "$(cat <<'EOF'
## Summary
Integrates the audited defi_accounting module into crash_backend for real ckUSDT betting.

- Add bet_amount parameter to play_crash() and play_crash_multi()
- User deposits/withdrawals with ckUSDT
- Liquidity pool for house bankroll
- All plinko defi endpoints ported to crash

## Breaking Changes
- `play_crash(target_multiplier)` -> `play_crash(bet_amount, target_multiplier)`
- `play_crash_multi(target, count)` -> `play_crash_multi(bet_amount, target, count)`
- MIN_BET: 0.1 USDT (100,000 decimals)

## Affected Canister
- Crash Backend: `fws6k-tyaaa-aaaap-qqc7q-cai`

## Test Plan
- [ ] Verify canister deploys successfully
- [ ] Test greet() returns expected message
- [ ] Test get_crash_formula() returns formula
- [ ] Verify deposit_liquidity works with real ckUSDT
- [ ] Verify deposit/withdraw_all flow works

Deployed to mainnet.

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
   ```
6. **Iterate autonomously** - Fix P0 issues, commit, push, repeat until approved

## CRITICAL RULES
- NO questions ("should I?", "want me to?")
- NO skipping PR creation - it's MANDATORY
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/crash-defi-integration`
**Worktree:** `/home/theseus/alexandria/openhouse-crash-defi`

---

# Implementation Plan

## Task: NEW FEATURE
Integrate defi_accounting module into crash_backend for real ckUSDT betting.

## Design Decisions
- **Bet parameter**: Add `bet_amount` to `play_crash()` and `play_crash_multi()`
- **MIN_BET**: 0.1 USDT (100,000 in 6-decimal format)
- **MAX_CRASH**: Keep at 100x
- **Remove**: `simulate_crash()` (deprecated)

---

## Current State

### crash_backend/Cargo.toml
```toml
[dependencies]
candid = "0.10"
ic-cdk = "0.19"
serde = "1.0"
sha2 = "0.10"
```

### crash_backend/src/lib.rs
- Has game logic inline (play_crash, play_crash_multi)
- No defi_accounting integration
- Fixed 1 USDT bets hardcoded
- Empty init/post_upgrade hooks

### crash_backend/src/defi_accounting/
- Already copied from plinko (audited)
- Fully functional module ready to use

---

## Step 1: Update Cargo.toml

**File**: `crash_backend/Cargo.toml`

```toml
# PSEUDOCODE - Add these dependencies
[dependencies]
candid = "0.10"
ic-cdk = "0.19"
ic-cdk-timers = "1.0"              # ADD - async timers
serde = { version = "1.0", features = ["derive"] }  # UPDATE - add derive feature
serde_json = "1.0"                  # ADD - JSON serialization
sha2 = "0.10"
ic-stable-structures = "0.7"        # ADD - stable storage
num-bigint = "0.4"                  # ADD - Nat conversions
num-traits = "0.2"                  # ADD - ToPrimitive
```

---

## Step 2: Create types.rs

**File**: `crash_backend/src/types.rs` (NEW)

```rust
// PSEUDOCODE
use candid::{CandidType, Deserialize, Principal};
use serde::Serialize;

// Constants
pub const DECIMALS_PER_CKUSDT: u64 = 1_000_000;  // 6 decimals
pub const MIN_BET: u64 = 100_000;                 // 0.1 USDT
pub const CKUSDT_CANISTER_ID: &str = "cngnf-vqaaa-aaaar-qag4q-cai";
pub const CKUSDT_TRANSFER_FEE: u64 = 10_000;     // 0.01 USDT

// ICRC-2 Account type
pub struct Account {
    pub owner: Principal,
    pub subaccount: Option<[u8; 32]>,
}

// Copy remaining ICRC-2 types from plinko_backend/src/types.rs:
// - TransferFromArgs
// - TransferFromError
// - TransferArg
// - TransferError
```

---

## Step 3: Create game.rs

**File**: `crash_backend/src/game.rs` (NEW)

```rust
// PSEUDOCODE - Move game logic from lib.rs with defi integration
use crate::defi_accounting::{self as accounting, liquidity_pool};
use crate::types::MIN_BET;

const MAX_CRASH: f64 = 100.0;

pub struct PlayCrashResult {
    // Same as current but add bet_amount, payout, profit fields
}

pub async fn play_crash(bet_amount: u64, target_multiplier: f64, caller: Principal)
    -> Result<PlayCrashResult, String>
{
    // 1. Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount { return Err("INSUFFICIENT_BALANCE") }

    // 2. Validate minimum bet
    if bet_amount < MIN_BET { return Err("minimum is 0.1 USDT") }

    // 3. Validate target multiplier (existing logic)
    if target_multiplier < 1.01 || target_multiplier > MAX_CRASH { return Err(...) }

    // 4. Check max payout against house limit
    let max_potential_payout = (target_multiplier * bet_amount as f64) as u64;
    let max_allowed = accounting::get_max_allowed_payout();
    if max_potential_payout > max_allowed { return Err("exceeds house limit") }

    // 5. Get VRF randomness BEFORE deducting (fail-safe)
    let random_bytes = raw_rand().await?;

    // 6. Deduct bet from balance
    let balance_after = user_balance.checked_sub(bet_amount)?;
    accounting::update_balance(caller, balance_after)?;

    // 7. Record volume for statistics
    crate::defi_accounting::record_bet_volume(bet_amount);

    // 8. Calculate crash point (existing logic)
    let random = bytes_to_float(&random_bytes)?;
    let crash_point = calculate_crash_point(random);

    // 9. Determine outcome
    let won = crash_point >= target_multiplier;
    let payout = if won { (target_multiplier * bet_amount as f64) as u64 } else { 0 };
    let profit = (payout as i64) - (bet_amount as i64);

    // 10. Credit payout to user
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(payout)?;
    accounting::update_balance(caller, new_balance)?;

    // 11. Settle with pool (CRITICAL)
    if let Err(e) = liquidity_pool::settle_bet(bet_amount, payout) {
        // Rollback on failure
        let refund = current_balance.checked_add(bet_amount)?;
        accounting::update_balance(caller, refund)?;
        return Err(format!("Settlement failed: {}", e));
    }

    // 12. Return result with randomness hash
    let randomness_hash = create_randomness_hash(&random_bytes);
    Ok(PlayCrashResult { crash_point, won, target_multiplier, payout, profit, bet_amount, randomness_hash })
}

pub async fn play_crash_multi(bet_amount: u64, target_multiplier: f64, rocket_count: u8, caller: Principal)
    -> Result<MultiCrashResult, String>
{
    // Same pattern as play_crash but:
    // - Validate rocket_count (1-10)
    // - Total bet = bet_amount * rocket_count (this is bet per rocket)
    // - Check total bet against balance
    // - Check max total payout against house limit
    // - Process each rocket with derive_rocket_random()
    // - Single settle_bet call with total_bet, total_payout
}

// Helper functions - move from lib.rs:
// - bytes_to_float()
// - derive_rocket_random()
// - calculate_crash_point()
// - create_randomness_hash()
```

---

## Step 4: Update lib.rs

**File**: `crash_backend/src/lib.rs` (MODIFY)

### 4a. Module declarations and imports
```rust
// PSEUDOCODE - Add at top
mod defi_accounting;
pub mod types;
pub mod game;

use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;

pub type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    pub static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}
```

### 4b. Update lifecycle hooks
```rust
// PSEUDOCODE
#[init]
fn init() {
    ic_cdk::println!("Crash Backend Initialized with DeFi Accounting");
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::accounting::start_balance_reconciliation_timer();
    defi_accounting::start_stats_timer();

    ic_cdk_timers::set_timer(Duration::ZERO, async {
        defi_accounting::accounting::refresh_canister_balance().await;
    });
}

#[post_upgrade]
fn post_upgrade() {
    // Same timer setup as init()
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::accounting::start_balance_reconciliation_timer();
    defi_accounting::start_stats_timer();

    ic_cdk_timers::set_timer(Duration::ZERO, async {
        defi_accounting::accounting::refresh_canister_balance().await;
    });
}
```

### 4c. Add solvency check
```rust
// PSEUDOCODE
fn is_canister_solvent() -> bool {
    let pool_reserve = defi_accounting::liquidity_pool::get_pool_reserve();
    let total_deposits = defi_accounting::accounting::calculate_total_deposits_internal();
    let canister_balance = defi_accounting::accounting::get_cached_canister_balance_internal();

    let obligations = pool_reserve.checked_add(total_deposits).unwrap_or(u64::MAX);
    canister_balance >= obligations
}
```

### 4d. Update game endpoints (BREAKING CHANGE)
```rust
// PSEUDOCODE
#[update]
async fn play_crash(bet_amount: u64, target_multiplier: f64) -> Result<PlayCrashResult, String> {
    if !is_canister_solvent() {
        return Err("Game temporarily paused - insufficient funds.");
    }
    game::play_crash(bet_amount, target_multiplier, ic_cdk::api::msg_caller()).await
}

#[update]
async fn play_crash_multi(bet_amount: u64, target_multiplier: f64, rocket_count: u8)
    -> Result<MultiCrashResult, String>
{
    if !is_canister_solvent() {
        return Err("Game temporarily paused - insufficient funds.");
    }
    game::play_crash_multi(bet_amount, target_multiplier, rocket_count, ic_cdk::api::msg_caller()).await
}
```

### 4e. Add accounting endpoints
```rust
// PSEUDOCODE - Copy pattern from plinko_backend/src/lib.rs lines 248-271
#[update] async fn deposit(amount: u64) -> Result<u64, String>
#[update] async fn withdraw_all() -> Result<u64, String>
#[update] async fn retry_withdrawal() -> Result<u64, String>
#[update] fn abandon_withdrawal() -> Result<u64, String>
#[query] fn get_my_withdrawal_status() -> Option<PendingWithdrawal>
```

### 4f. Add balance query endpoints
```rust
// PSEUDOCODE - Copy pattern from plinko_backend/src/lib.rs lines 273-291
#[query] fn get_balance(principal: Principal) -> u64
#[query] fn get_my_balance() -> u64
#[query] fn get_house_balance() -> u64
#[query] fn get_max_allowed_payout() -> u64
```

### 4g. Add liquidity pool endpoints
```rust
// PSEUDOCODE - Copy pattern from plinko_backend/src/lib.rs lines 297-335
#[update] async fn deposit_liquidity(amount: u64, min_shares: Option<Nat>) -> Result<Nat, String>
#[update] async fn withdraw_all_liquidity() -> Result<u64, String>
#[query] fn get_pool_stats() -> PoolStats
#[query] fn get_lp_position(principal: Principal) -> LPPosition
#[query] fn get_my_lp_position() -> LPPosition
#[query] fn calculate_shares_preview(amount: u64) -> Result<Nat, String>
#[query] fn can_accept_bets() -> bool
#[query] fn get_house_mode() -> String
```

### 4h. Add admin endpoints
```rust
// PSEUDOCODE - Copy pattern from plinko_backend/src/lib.rs lines 341-389
#[update] async fn admin_health_check() -> Result<HealthCheck, String>
#[query] fn admin_get_all_pending_withdrawals() -> Result<Vec<PendingWithdrawalInfo>, String>
#[query] fn admin_get_orphaned_funds_report(...) -> Result<OrphanedFundsReport, String>
#[query] fn admin_get_all_balances(...) -> Result<Vec<UserBalance>, String>
#[query] fn admin_get_all_lp_positions(...) -> Result<Vec<LPPositionInfo>, String>
#[query] fn admin_get_audit_log(...) -> Result<Vec<AuditEntry>, String>
```

### 4i. Add statistics endpoints
```rust
// PSEUDOCODE - Copy pattern from plinko_backend/src/lib.rs lines 395-413
#[query] fn get_daily_stats(limit: u32) -> Vec<DailySnapshot>
#[query] fn get_pool_apy(days: Option<u32>) -> ApyInfo
#[query] fn get_stats_range(start: u64, end: u64) -> Vec<DailySnapshot>
#[query] fn get_stats_count() -> u64
```

### 4j. Remove deprecated
```rust
// DELETE: simulate_crash() function
```

### 4k. Keep existing query functions (no changes)
- get_crash_formula()
- get_expected_value()
- get_win_probability()
- get_probability_table()
- greet()

---

## Step 5: Update crash_backend.did

**File**: `crash_backend/crash_backend.did` (MODIFY)

```candid
// PSEUDOCODE - Add types and methods
// Copy type definitions from plinko_backend/plinko_backend.did:
// - PoolStats, LPPosition, HealthCheck, PendingWithdrawal, etc.

// Update service with new signatures:
service : {
    // UPDATED signatures
    play_crash : (nat64, float64) -> (variant { Ok : PlayCrashResult; Err : text });
    play_crash_multi : (nat64, float64, nat8) -> (variant { Ok : MultiCrashResult; Err : text });

    // NEW accounting endpoints
    deposit : (nat64) -> (variant { Ok : nat64; Err : text });
    withdraw_all : () -> (variant { Ok : nat64; Err : text });
    // ... all other endpoints from plinko_backend.did
}
```

---

## Reference: Plinko Files to Copy From

When implementing, use these as reference:
- `plinko_backend/src/lib.rs` - All endpoint patterns
- `plinko_backend/src/types.rs` - ICRC-2 types (copy entirely)
- `plinko_backend/src/game.rs` - Game logic integration pattern
- `plinko_backend/plinko_backend.did` - Candid types and service definition

---

## Deployment

```bash
# Build
cargo build --target wasm32-unknown-unknown --release -p crash_backend

# Deploy to mainnet
./deploy.sh --crash-only

# Verify
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai greet '("Test")'
dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai get_crash_formula
```
