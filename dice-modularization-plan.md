# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-refactor"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-refactor`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build affected backend(s)
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet (deploys all canisters - simplest approach)
     ./deploy.sh
     ```
   - Frontend changes:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh
     ```
   - Both backend + frontend:
     ```bash
     cargo build --target wasm32-unknown-unknown --release
     cd openhouse_frontend && npm run build && cd ..
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(dice): modularize dice_backend from 1092 to ~100 lines in lib.rs"
   git push -u origin feature/dice-modularization
   gh pr create --title "Refactor: Modularize dice_backend for maintainability" --body "Implements dice-modularization-plan.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: dice_backend (whchi-hyaaa-aaaao-a4ruq-cai)"
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

**Branch:** `feature/dice-modularization`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-refactor`

---

# Implementation Plan: Dice Backend Modularization

## Current State Documentation

### File Structure (BEFORE)
```
dice_backend/
├── src/
│   ├── lib.rs (1092 lines) - MONOLITH with everything mixed
│   └── accounting.rs (400 lines) - Already well-organized
├── dice_backend.did (83 lines)
└── Cargo.toml
```

### Major Components in lib.rs
- **Lines 20-271**: Seed management structures and initialization (~250 lines)
- **Lines 315-559**: Game logic and play_dice function (~244 lines)
- **Lines 561-703**: Query functions (~142 lines)
- **Lines 589-677**: Analytics/history functions (~88 lines)
- **Lines 903-985**: Heartbeat logic (~82 lines)
- **Lines 987-1092**: Tests (~105 lines)
- Scattered throughout: Types, memory management, constants

### File Structure (AFTER)
```
dice_backend/
├── src/
│   ├── lib.rs (~100 lines) - Clean entry point with API endpoints
│   ├── accounting.rs (400 lines) - UNCHANGED
│   ├── types.rs (~150 lines) - All types and structs
│   ├── seed.rs (~300 lines) - Seed management and randomness
│   ├── game.rs (~250 lines) - Core game logic
│   ├── analytics.rs (~200 lines) - Stats and history
│   └── heartbeat.rs (~100 lines) - Background tasks
├── tests/
│   └── test_game_logic.rs (~105 lines) - Unit tests
├── dice_backend.did (83 lines) - UNCHANGED
└── Cargo.toml - Add test config
```

## Implementation Pseudocode

### Step 1: Create `types.rs` (~150 lines)
```rust
// PSEUDOCODE - dice_backend/src/types.rs
use candid::{CandidType, Deserialize};
use serde::Serialize;
use ic_stable_structures::Storable;
use std::borrow::Cow;

// Export constants
pub const E8S_PER_ICP: u64 = 100_000_000;
pub const MIN_BET: u64 = 1_000_000;
pub const MAX_WIN: u64 = 10 * E8S_PER_ICP;
pub const MAX_NUMBER: u8 = 100;

// Move RollDirection enum
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum RollDirection {
    Over,
    Under,
}

// Move DiceResult struct
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct DiceResult {
    pub game_id: u64,
    pub player: Principal,
    // ... all fields
}

impl Storable for DiceResult {
    // ... implementation
}

// Move GameStats struct
#[derive(CandidType, Deserialize, Clone, Default)]
pub struct GameStats {
    // ... fields
}

// Move DetailedGameHistory struct
#[derive(CandidType, Deserialize, Serialize)]
pub struct DetailedGameHistory {
    // ... fields
}
```

### Step 2: Create `seed.rs` (~300 lines)
```rust
// PSEUDOCODE - dice_backend/src/seed.rs
use crate::types::MAX_NUMBER;
use crate::{MEMORY_MANAGER, Memory};
use candid::{CandidType, Deserialize};
use ic_cdk::api::management_canister::main::raw_rand;
use ic_stable_structures::{StableCell, StableBTreeMap, Storable};
use sha2::{Digest, Sha256};
use std::cell::RefCell;

// Constants
pub const SEED_ROTATION_INTERVAL_NS: u64 = 300_000_000_000;
pub const MAX_GAMES_PER_SEED: u64 = 10_000;

// Move RandomnessSeed struct
#[derive(Clone, Debug, Serialize, Deserialize, CandidType, Default)]
pub struct RandomnessSeed {
    // ... fields
}

impl Storable for RandomnessSeed {
    // ... implementation
}

// Move SeedRotationRecord struct
#[derive(Clone, Debug, Serialize, Deserialize, CandidType)]
pub struct SeedRotationRecord {
    // ... fields
}

impl Storable for SeedRotationRecord {
    // ... implementation
}

// Thread locals for seed management
thread_local! {
    static SEED_STATE: RefCell<Option<RandomnessSeed>> = RefCell::new(None);
    static SEED_INIT_LOCK: RefCell<bool> = RefCell::new(false);

    static SEED_CELL: RefCell<StableCell<RandomnessSeed, Memory>> = // ...
    static LAST_ROTATION_CELL: RefCell<StableCell<u64, Memory>> = // ...
    static ROTATION_HISTORY: RefCell<StableBTreeMap<u64, SeedRotationRecord, Memory>> = // ...
    static NEXT_ROTATION_ID: RefCell<u64> = RefCell::new(0);
}

// Public functions
pub async fn initialize_seed() {
    // ... implementation from lines 205-271
}

pub fn restore_seed_state() {
    // Extract from post_upgrade
    let seed = SEED_CELL.with(|cell| cell.borrow().get().clone());
    if seed.creation_time > 0 {
        SEED_STATE.with(|s| {
            *s.borrow_mut() = Some(seed);
        });
    }
}

pub fn generate_dice_roll_instant(client_seed: &str) -> Result<(u8, u64, String), String> {
    // ... implementation from lines 363-399
}

pub fn maybe_schedule_seed_rotation() {
    // ... implementation from lines 735-766
}

pub async fn rotate_seed_async() {
    // ... implementation from lines 769-838
}

pub fn get_current_seed_hash() -> String {
    // ... implementation
}

pub fn verify_game_result(
    server_seed: [u8; 32],
    client_seed: String,
    nonce: u64,
    expected_roll: u8
) -> Result<bool, String> {
    // ... implementation
}

pub fn get_seed_info() -> (String, u64, u64) {
    // ... implementation
}

pub fn get_rotation_history(limit: u32) -> Vec<(u64, SeedRotationRecord)> {
    // ... implementation
}
```

### Step 3: Create `game.rs` (~250 lines)
```rust
// PSEUDOCODE - dice_backend/src/game.rs
use crate::types::{DiceResult, GameStats, RollDirection, E8S_PER_ICP, MIN_BET, MAX_WIN, MAX_NUMBER};
use crate::seed::{generate_dice_roll_instant, maybe_schedule_seed_rotation};
use crate::accounting;
use candid::Principal;
use ic_stable_structures::StableBTreeMap;
use std::cell::RefCell;

thread_local! {
    static GAME_STATS: RefCell<GameStats> = RefCell::new(GameStats::default());
    static GAME_HISTORY: RefCell<StableBTreeMap<u64, DiceResult, Memory>> = // ...
    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(0);
}

// Calculate functions
pub fn calculate_win_chance(target: u8, direction: &RollDirection) -> f64 {
    // ... implementation from lines 317-332
}

pub fn calculate_multiplier_direct(target: u8, direction: &RollDirection) -> f64 {
    // ... implementation from lines 337-348
}

pub fn calculate_max_bet(target_number: u8, direction: &RollDirection) -> u64 {
    // ... implementation from lines 351-359
}

// Main game logic
pub async fn play_dice(
    bet_amount: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String,
    caller: Principal
) -> Result<DiceResult, String> {
    // Extract core logic from lines 403-558
    // 1. Balance cache check
    // 2. Validate user balance
    // 3. Validate bet amount
    // 4. Validate target number
    // 5. Calculate odds
    // 6. Check house balance
    // 7. Deduct bet
    // 8. Generate roll
    // 9. Determine win
    // 10. Update stats
    // 11. Store history
    // 12. Update balance
}

// Query functions
pub fn get_stats() -> GameStats {
    GAME_STATS.with(|stats| stats.borrow().clone())
}

pub fn get_recent_games(limit: u32) -> Vec<DiceResult> {
    // ... implementation
}

pub fn get_game(game_id: u64) -> Option<DiceResult> {
    // ... implementation
}

pub fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
    // ... implementation
}
```

### Step 4: Create `analytics.rs` (~200 lines)
```rust
// PSEUDOCODE - dice_backend/src/analytics.rs
use crate::types::{DiceResult, DetailedGameHistory, RollDirection, E8S_PER_ICP};
use crate::game::{GAME_HISTORY};

pub fn get_detailed_history(limit: u32) -> Vec<DetailedGameHistory> {
    // ... implementation from lines 609-647
    GAME_HISTORY.with(|history| {
        history.borrow()
            .iter()
            .rev()
            .take(limit as usize)
            .map(|(game_id, game)| {
                DetailedGameHistory {
                    // ... field mappings
                }
            })
            .collect()
    })
}

pub fn export_history_csv(limit: u32) -> String {
    // ... implementation from lines 652-676
    let history = get_detailed_history(limit);
    let mut csv = String::from("game_id,player,bet_icp,...\n");
    for game in history {
        csv.push_str(&format!("{},{},{:.4},...\n", /* fields */));
    }
    csv
}
```

### Step 5: Create `heartbeat.rs` (~100 lines)
```rust
// PSEUDOCODE - dice_backend/src/heartbeat.rs
use crate::accounting;
use crate::{MEMORY_MANAGER, Memory};
use ic_stable_structures::StableCell;
use std::cell::RefCell;

thread_local! {
    static LAST_HEARTBEAT_REFRESH: RefCell<u64> = RefCell::new(0);
    static HEARTBEAT_REFRESH_IN_PROGRESS: RefCell<bool> = RefCell::new(false);
    static HEARTBEAT_STATE_CELL: RefCell<StableCell<u64, Memory>> = // ... Memory ID 5
}

pub fn init_heartbeat() {
    // Force immediate balance refresh on first heartbeat
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(0).expect("Failed to reset heartbeat state");
    });
}

pub fn save_heartbeat_state() {
    // For pre_upgrade
    let last_refresh = LAST_HEARTBEAT_REFRESH.with(|lr| *lr.borrow());
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(last_refresh).expect("Failed to save heartbeat state");
    });
}

pub fn restore_heartbeat_state() {
    // For post_upgrade
    let last_heartbeat = HEARTBEAT_STATE_CELL.with(|cell| cell.borrow().get().clone());
    LAST_HEARTBEAT_REFRESH.with(|lr| {
        *lr.borrow_mut() = last_heartbeat;
    });
}

pub fn heartbeat() {
    // ... implementation from lines 926-985
    const HEARTBEAT_REFRESH_INTERVAL_NS: u64 = 30_000_000_000;

    // Check and set in-progress flag
    // Schedule refresh if needed
    // Spawn async task with cleanup guard
}
```

### Step 6: Move tests to `tests/test_game_logic.rs`
```rust
// PSEUDOCODE - dice_backend/tests/test_game_logic.rs
use dice_backend::game::{calculate_max_bet, calculate_multiplier_direct};
use dice_backend::types::{RollDirection, MAX_WIN};

#[test]
fn test_max_bet_high_multiplier() {
    // ... test from lines 992-997
}

#[test]
fn test_max_bet_medium_multiplier() {
    // ... test from lines 999-1005
}

#[test]
fn test_max_bet_low_multiplier() {
    // ... test from lines 1007-1013
}

#[test]
fn test_max_bet_edge_cases() {
    // ... test from lines 1015-1024
}

#[test]
fn test_max_bet_never_exceeds_max_win() {
    // ... test from lines 1026-1041
}

#[test]
fn test_round_multipliers() {
    // ... test from lines 1043-1053
}

#[test]
fn test_house_hit_detection() {
    // ... test from lines 1055-1091
}
```

### Step 7: Refactor `lib.rs` (~100 lines)
```rust
// PSEUDOCODE - dice_backend/src/lib.rs
use candid::{CandidType, Deserialize, Nat, Principal};
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update, heartbeat};
use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;
use std::cell::RefCell;

// Module declarations
mod accounting;
mod types;
mod seed;
mod game;
mod analytics;
mod heartbeat as heartbeat_mod;

// Re-exports
pub use accounting::{
    deposit, withdraw, withdraw_all, get_balance, get_my_balance,
    get_house_balance, get_accounting_stats, audit_balances,
    refresh_canister_balance, AccountingStats, Account,
};
pub use types::{RollDirection, DiceResult, GameStats, DetailedGameHistory};
pub use game::{calculate_payout_info, get_max_bet};

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

#[init]
fn init() {
    ic_cdk::println!("Dice Game Backend Initialized");
    heartbeat_mod::init_heartbeat();
}

#[pre_upgrade]
fn pre_upgrade() {
    heartbeat_mod::save_heartbeat_state();
    accounting::pre_upgrade_accounting();
}

#[post_upgrade]
fn post_upgrade() {
    seed::restore_seed_state();
    heartbeat_mod::restore_heartbeat_state();
    accounting::post_upgrade_accounting();
    heartbeat_mod::init_heartbeat();
}

// API Endpoints - delegate to modules
#[update]
async fn play_dice(bet_amount: u64, target_number: u8, direction: RollDirection, client_seed: String) -> Result<DiceResult, String> {
    game::play_dice(bet_amount, target_number, direction, client_seed, ic_cdk::caller()).await
}

#[query]
fn get_stats() -> GameStats {
    game::get_stats()
}

#[query]
fn get_recent_games(limit: u32) -> Vec<DiceResult> {
    game::get_recent_games(limit)
}

#[query]
fn get_game(game_id: u64) -> Option<DiceResult> {
    game::get_game(game_id)
}

#[query]
fn get_detailed_history(limit: u32) -> Vec<DetailedGameHistory> {
    analytics::get_detailed_history(limit)
}

#[query]
fn export_history_csv(limit: u32) -> String {
    analytics::export_history_csv(limit)
}

#[query]
fn get_current_seed_hash() -> String {
    seed::get_current_seed_hash()
}

#[query]
fn verify_game_result(server_seed: [u8; 32], client_seed: String, nonce: u64, expected_roll: u8) -> Result<bool, String> {
    seed::verify_game_result(server_seed, client_seed, nonce, expected_roll)
}

#[query]
fn get_seed_info() -> (String, u64, u64) {
    seed::get_seed_info()
}

#[query]
fn get_rotation_history(limit: u32) -> Vec<(u64, seed::SeedRotationRecord)> {
    seed::get_rotation_history(limit)
}

#[update]
async fn get_canister_balance() -> u64 {
    // Implementation stays here since it's a simple wrapper
    let account = Account {
        owner: ic_cdk::id(),
        subaccount: None,
    };
    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let result: Result<(Nat,), _> = ic_cdk::call(ledger, "icrc1_balance_of", (account,)).await;
    match result {
        Ok((balance,)) => balance.0.try_into().unwrap_or(0),
        Err(e) => {
            ic_cdk::println!("Failed to query canister balance: {:?}", e);
            0
        }
    }
}

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Dice, {}! Roll the dice and test your luck!", name)
}

#[heartbeat]
fn heartbeat() {
    heartbeat_mod::heartbeat();
}
```

### Step 8: Update Cargo.toml
```toml
# PSEUDOCODE - Add to dice_backend/Cargo.toml
[dev-dependencies]
# Ensure test dependencies are present

[[test]]
name = "test_game_logic"
path = "tests/test_game_logic.rs"
```

## Summary of Changes

### Lines of Code Distribution (AFTER)
- **lib.rs**: ~100 lines (down from 1092!)
- **accounting.rs**: 400 lines (unchanged)
- **types.rs**: ~150 lines (NEW)
- **seed.rs**: ~300 lines (NEW)
- **game.rs**: ~250 lines (NEW)
- **analytics.rs**: ~200 lines (NEW)
- **heartbeat.rs**: ~100 lines (NEW)
- **tests/test_game_logic.rs**: ~105 lines (moved from lib.rs)

### Total: ~1605 lines (from ~1492 lines)
The slight increase is due to module boilerplate and imports, but now:
- Each file has a single responsibility
- Easy to navigate and maintain
- Tests are properly separated
- Similar structure to other backends

## Benefits
1. **Clean separation of concerns** - Each module has one job
2. **Better testability** - Can test modules in isolation
3. **Easier maintenance** - Find code by function, not line number
4. **Consistent with Rust best practices** - Proper module organization
5. **Maintains ALL functionality** - Nothing removed, just reorganized

## Deployment Notes
- **Affected canister**: dice_backend (whchi-hyaaa-aaaao-a4ruq-cai)
- **Risk level**: Low - pure refactoring, no logic changes
- **Testing**: Run cargo test after refactoring
- **Deployment**: Standard deployment with ./deploy.sh