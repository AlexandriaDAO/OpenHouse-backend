use candid::{CandidType, Nat, Principal};
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;
use std::cell::RefCell;

// =============================================================================
// MODULE DECLARATIONS
// =============================================================================

mod defi_accounting;
pub mod types;
pub mod seed;
pub mod game;
mod analytics;

// =============================================================================
// RE-EXPORTS
// =============================================================================

pub use defi_accounting::{
    deposit, withdraw_all, get_balance, get_my_balance, get_house_balance,
    get_max_allowed_payout, get_accounting_stats, audit_balances, refresh_canister_balance,
    AccountingStats,
    // Liquidity Pool types only
    LPPosition, PoolStats,
};
pub use types::{RollDirection, DiceResult, GameStats, DetailedGameHistory, SeedRotationRecord};

// =============================================================================
// MEMORY MANAGEMENT
// =============================================================================

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

// =============================================================================
// LIFECYCLE HOOKS
// =============================================================================

#[init]
fn init() {
    // Initialize game state
    ic_cdk::println!("Dice Game Backend Initialized");

    // Start retry timer for pending withdrawals
    defi_accounting::accounting::start_retry_timer();
}

#[pre_upgrade]
fn pre_upgrade() {
    // Note: StableBTreeMap persists automatically, no special handling needed
}

#[post_upgrade]
fn post_upgrade() {
    // Restore game state
    seed::restore_seed_state();

    // Start retry timer for pending withdrawals
    defi_accounting::accounting::start_retry_timer();
    // Note: StableBTreeMap restores automatically, no accounting restore needed
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

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
fn get_rotation_history(limit: u32) -> Vec<(u64, SeedRotationRecord)> {
    seed::get_rotation_history(limit)
}

#[query]
fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
    game::calculate_payout_info(target_number, direction)
}

#[update]
async fn get_canister_balance() -> u64 {
    #[derive(CandidType, serde::Serialize)]
    struct Account {
        owner: Principal,
        subaccount: Option<Vec<u8>>,
    }

    let account = Account {
        owner: ic_cdk::id(),
        subaccount: None,
    };

    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let result: Result<(Nat,), _> = ic_cdk::call(ledger, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            balance.0.try_into().unwrap_or(0)
        }
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

// =============================================================================
// LIQUIDITY POOL API ENDPOINTS
// =============================================================================

// Pool initialization

// Liquidity Pool Management

#[update]
async fn deposit_liquidity(amount: u64) -> Result<Nat, String> {
    defi_accounting::deposit_liquidity(amount).await
}

#[update]
async fn withdraw_all_liquidity() -> Result<u64, String> {
    defi_accounting::withdraw_all_liquidity().await
}

// LP Queries

#[query]
fn get_lp_position(user: Principal) -> LPPosition {
    defi_accounting::get_lp_position(user)
}

#[query]
fn get_pool_stats() -> PoolStats {
    defi_accounting::get_pool_stats()
}

#[query]
fn get_house_mode() -> String {
    "liquidity_pool".to_string()
}

#[query]
fn can_accept_bets() -> bool {
    defi_accounting::can_accept_bets()
}

#[query]
fn get_withdrawal_status() -> Option<defi_accounting::types::PendingWithdrawal> {
    defi_accounting::accounting::get_withdrawal_status()
}

#[query]
fn get_audit_log(offset: usize, limit: usize) -> Vec<defi_accounting::types::AuditEntry> {
    defi_accounting::accounting::get_audit_log(offset, limit)
}