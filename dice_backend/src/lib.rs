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

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Dice, {}! Roll the dice and test your luck!", name)
}