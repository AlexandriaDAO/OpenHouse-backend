use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;
use std::cell::RefCell;

mod defi_accounting;
pub mod types;
pub mod seed;
pub mod game;

pub use types::{Card, Hand, GameResult, GameAction, GameStartResult, ActionResult, GameStats, BlackjackGame};

// =============================================================================
// MEMORY MANAGEMENT
// =============================================================================

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

#[init]
fn init() {
    ic_cdk::println!("Blackjack Backend Initialized");
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::start_stats_timer();
}

#[pre_upgrade]
fn pre_upgrade() {
    // StableBTreeMap persists automatically
}

#[post_upgrade]
fn post_upgrade() {
    seed::restore_seed_state();
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::start_stats_timer();
}

// === GAME ENDPOINTS ===

#[update]
async fn start_game(bet_amount: u64, client_seed: String) -> Result<GameStartResult, String> {
    game::start_game(bet_amount, client_seed, ic_cdk::api::msg_caller()).await
}

#[update]
async fn hit(game_id: u64) -> Result<ActionResult, String> {
    game::hit(game_id, ic_cdk::api::msg_caller()).await
}

#[update]
async fn stand(game_id: u64) -> Result<ActionResult, String> {
    game::stand(game_id, ic_cdk::api::msg_caller()).await
}

#[update]
async fn double_down(game_id: u64) -> Result<ActionResult, String> {
    game::double_down(game_id, ic_cdk::api::msg_caller()).await
}

#[update]
async fn split(game_id: u64) -> Result<ActionResult, String> {
    game::split(game_id, ic_cdk::api::msg_caller()).await
}

#[query]
fn get_game(game_id: u64) -> Option<BlackjackGame> {
    game::get_game(game_id)
}

#[query]
fn get_stats() -> GameStats {
    game::get_stats()
}

// === PROVABLY FAIR ===

#[query]
fn get_current_seed_hash() -> String {
    seed::get_current_seed_hash()
}

#[query]
fn get_seed_info() -> (String, u64, u64) {
    seed::get_seed_info()
}

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Blackjack, {}! Hit or Stand?", name)
}

// === ACCOUNTING ENDPOINTS ===

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

#[update]
async fn get_canister_balance() -> u64 {
    defi_accounting::accounting::refresh_canister_balance().await
}

#[update]
async fn admin_health_check() -> Result<defi_accounting::types::HealthCheck, String> {
    defi_accounting::admin_query::admin_health_check().await
}

#[query]
fn admin_get_all_pending_withdrawals() -> Result<Vec<defi_accounting::types::PendingWithdrawalInfo>, String> {
    defi_accounting::admin_query::get_all_pending_withdrawals()
}

#[query]
fn admin_get_orphaned_funds_report(recent_limit: Option<u64>) -> Result<defi_accounting::types::OrphanedFundsReport, String> {
    defi_accounting::admin_query::get_orphaned_funds_report(recent_limit)
}

#[query]
fn admin_get_orphaned_funds_report_full() -> Result<defi_accounting::types::OrphanedFundsReport, String> {
    defi_accounting::admin_query::get_orphaned_funds_report_full()
}

#[query]
fn admin_get_all_balances(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    defi_accounting::admin_query::get_all_balances(offset, limit)
}

#[query]
fn admin_get_all_balances_complete() -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    defi_accounting::admin_query::get_all_balances_complete()
}

#[query]
fn admin_get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    defi_accounting::admin_query::get_all_lp_positions(offset, limit)
}

#[query]
fn admin_get_all_lp_positions_complete() -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    defi_accounting::admin_query::get_all_lp_positions_complete()
}

#[update]
async fn refresh_canister_balance() -> u64 {
    defi_accounting::accounting::refresh_canister_balance().await
}

// === LIQUIDITY POOL ENDPOINTS ===

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

// === DAILY STATISTICS ENDPOINTS ===

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

ic_cdk::export_candid!();