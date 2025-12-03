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

// =============================================================================
// RE-EXPORTS
// =============================================================================

pub use types::{RollDirection, MinimalGameResult};

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

    // Start parent auto-withdrawal timer (weekly fee collection)
    defi_accounting::accounting::start_parent_withdrawal_timer();

    // Start daily statistics timer
    defi_accounting::start_stats_timer();
}

#[pre_upgrade]
fn pre_upgrade() {
    // Note: StableBTreeMap persists automatically, no special handling needed
}

#[post_upgrade]
fn post_upgrade() {
    // Start parent auto-withdrawal timer (weekly fee collection)
    // NOTE: We removed start_retry_timer() - users now retry manually via retry_withdrawal()
    // This eliminates the double-spend vulnerability from automatic TooOld rollbacks
    defi_accounting::accounting::start_parent_withdrawal_timer();

    // Start daily statistics timer
    defi_accounting::start_stats_timer();
    // Note: StableBTreeMap restores automatically, no accounting restore needed
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

#[update]
async fn play_dice(bet_amount: u64, target_number: u8, direction: RollDirection, client_seed: String) -> Result<MinimalGameResult, String> {
    game::play_dice(bet_amount, target_number, direction, client_seed, ic_cdk::api::msg_caller()).await
}

#[query]
fn verify_game_result(server_seed: [u8; 32], client_seed: String, nonce: u64, expected_roll: u8) -> Result<bool, String> {
    seed::verify_game_result(server_seed, client_seed, nonce, expected_roll)
}

#[query]
fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
    game::calculate_payout_info(target_number, direction)
}

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Dice, {}! Roll the dice and test your luck!", name)
}

// =============================================================================
// ACCOUNTING ENDPOINTS
// =============================================================================

#[update]
async fn deposit(amount: u64) -> Result<u64, String> {
    defi_accounting::accounting::deposit(amount).await
}

#[update]
async fn withdraw_all() -> Result<u64, String> {
    defi_accounting::accounting::withdraw_all().await
}

#[update]
async fn retry_withdrawal() -> Result<u64, String> {
    defi_accounting::accounting::retry_withdrawal().await
}

#[update]
fn abandon_withdrawal() -> Result<u64, String> {
    defi_accounting::accounting::abandon_withdrawal()
}

#[query]
fn get_my_withdrawal_status() -> Option<defi_accounting::types::PendingWithdrawal> {
    defi_accounting::accounting::get_withdrawal_status()
}

#[query]
fn get_balance(principal: candid::Principal) -> u64 {
    defi_accounting::query::get_balance(principal)
}

#[query]
fn get_my_balance() -> u64 {
    defi_accounting::query::get_my_balance()
}

#[query]
fn get_house_balance() -> u64 {
    defi_accounting::query::get_house_balance()
}

#[query]
fn get_max_allowed_payout() -> u64 {
    defi_accounting::query::get_max_allowed_payout()
}

// =============================================================================
// ADMIN DIAGNOSTIC ENDPOINTS
// =============================================================================

#[update]
async fn admin_health_check() -> Result<defi_accounting::types::HealthCheck, String> {
    defi_accounting::admin_query::admin_health_check().await
}

#[query]
fn admin_get_all_pending_withdrawals() -> Result<Vec<defi_accounting::types::PendingWithdrawalInfo>, String> {
    defi_accounting::admin_query::get_all_pending_withdrawals()
}

#[query]
fn admin_get_orphaned_funds_report() -> Result<defi_accounting::types::OrphanedFundsReport, String> {
    defi_accounting::admin_query::get_orphaned_funds_report()
}

#[query]
fn admin_get_all_balances(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    defi_accounting::admin_query::get_all_balances(offset, limit)
}

#[query]
fn admin_get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    defi_accounting::admin_query::get_all_lp_positions(offset, limit)
}

// =============================================================================
// LIQUIDITY POOL ENDPOINTS
// =============================================================================

#[update]
async fn deposit_liquidity(amount: u64, min_shares_expected: Option<candid::Nat>) -> Result<candid::Nat, String> {
    defi_accounting::liquidity_pool::deposit_liquidity(amount, min_shares_expected).await
}

#[update]
async fn withdraw_all_liquidity() -> Result<u64, String> {
    defi_accounting::liquidity_pool::withdraw_all_liquidity().await
}

#[query]
fn calculate_shares_preview(amount: u64) -> Result<candid::Nat, String> {
    defi_accounting::liquidity_pool::calculate_shares_preview(amount)
}

#[query]
fn get_lp_position(principal: candid::Principal) -> defi_accounting::liquidity_pool::LPPosition {
    defi_accounting::query::get_lp_position(principal)
}

#[query]
fn get_my_lp_position() -> defi_accounting::liquidity_pool::LPPosition {
    defi_accounting::query::get_my_lp_position()
}

#[query]
fn get_pool_stats() -> defi_accounting::liquidity_pool::PoolStats {
    defi_accounting::query::get_pool_stats()
}

#[query]
fn get_house_mode() -> String {
    defi_accounting::query::get_house_mode()
}

#[query]
fn can_accept_bets() -> bool {
    defi_accounting::liquidity_pool::can_accept_bets()
}

// =============================================================================
// DAILY STATISTICS ENDPOINTS
// =============================================================================

#[query]
fn get_daily_stats(limit: u32) -> Vec<defi_accounting::DailySnapshot> {
    defi_accounting::get_daily_snapshots(limit)
}

#[query]
fn get_stats_range(start_ts: u64, end_ts: u64) -> Vec<defi_accounting::DailySnapshot> {
    defi_accounting::get_snapshots_range(start_ts, end_ts)
}

#[query]
fn get_stats_count() -> u64 {
    defi_accounting::get_snapshot_count()
}

#[query]
fn get_pool_apy(days: Option<u32>) -> defi_accounting::ApyInfo {
    defi_accounting::get_apy_info(days)
}

