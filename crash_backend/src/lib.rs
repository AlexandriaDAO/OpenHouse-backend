//! Simple Crash Game - Transparent Formula Casino Game
//!
//! **Design Philosophy:**
//! Stateless crash point generation using transparent mathematical formula
//! for provably fair 1% house edge.
//!
//! **The Formula:**
//! crash = 0.99 / (1.0 - random)
//!
//! Where:
//! - random is uniform [0.0, 1.0) from IC VRF
//! - Formula mathematically guarantees exactly 1% house edge for ALL multipliers
//! - P(crash ≥ X) = 0.99 / X (constant edge regardless of cash-out strategy)
//!
//! **Transparency & Fairness:**
//! - Randomness: IC VRF (raw_rand) - no fallback
//! - Expected value: Exactly 0.99 (1% house edge)
//! - All crash points independently verifiable
//! - No state, no rounds, no complex mechanics

use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{init, pre_upgrade, post_upgrade, query, update};
use ic_cdk::management_canister::raw_rand;
use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;
use std::cell::RefCell;
use std::time::Duration;

// ============================================================================
// MODULE DECLARATIONS
// ============================================================================

mod defi_accounting;
pub mod types;
pub mod game;

pub use game::{PlayCrashResult, MultiCrashResult};

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

pub type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    pub static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_CRASH: f64 = 100.0;

// ============================================================================
// LIFECYCLE HOOKS
// ============================================================================

#[init]
fn init() {
    ic_cdk::println!("Crash Backend Initialized with DeFi Accounting");
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::accounting::start_balance_reconciliation_timer();
    defi_accounting::start_stats_timer();

    // Initialize cached balance on fresh install using a one-shot timer
    ic_cdk_timers::set_timer(Duration::ZERO, async {
        defi_accounting::accounting::refresh_canister_balance().await;
        ic_cdk::println!("Init: balance cache initialized");
    });
}

#[pre_upgrade]
fn pre_upgrade() {
    // StableBTreeMap persists automatically
    ic_cdk::println!("Pre-upgrade: state persists automatically");
}

#[post_upgrade]
fn post_upgrade() {
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::accounting::start_balance_reconciliation_timer();
    defi_accounting::start_stats_timer();

    // Initialize cached balance immediately after upgrade using a one-shot timer
    ic_cdk_timers::set_timer(Duration::ZERO, async {
        defi_accounting::accounting::refresh_canister_balance().await;
        ic_cdk::println!("Post-upgrade: balance cache initialized");
    });

    ic_cdk::println!("Post-upgrade: timers restarted");
}

// ============================================================================
// SOLVENCY CHECK
// ============================================================================

fn is_canister_solvent() -> bool {
    let pool_reserve = defi_accounting::liquidity_pool::get_pool_reserve();
    let total_deposits = defi_accounting::accounting::calculate_total_deposits_internal();
    let canister_balance = defi_accounting::accounting::get_cached_canister_balance_internal();

    let obligations = match pool_reserve.checked_add(total_deposits) {
        Some(o) => o,
        None => {
            ic_cdk::println!("CRITICAL: Obligations overflow u64::MAX");
            return false;
        }
    };

    canister_balance >= obligations
}

// ============================================================================
// GAME ENDPOINTS (BETTING)
// ============================================================================

#[update]
async fn play_crash(bet_amount: u64, target_multiplier: f64) -> Result<PlayCrashResult, String> {
    if !is_canister_solvent() {
        return Err("Game temporarily paused - insufficient funds.".to_string());
    }
    game::play_crash(bet_amount, target_multiplier, ic_cdk::api::msg_caller()).await
}

#[update]
async fn play_crash_multi(bet_amount: u64, target_multiplier: f64, rocket_count: u8) -> Result<MultiCrashResult, String> {
    if !is_canister_solvent() {
        return Err("Game temporarily paused - insufficient funds.".to_string());
    }
    game::play_crash_multi(bet_amount, target_multiplier, rocket_count, ic_cdk::api::msg_caller()).await
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
fn get_balance(principal: Principal) -> u64 {
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
fn get_pool_stats() -> defi_accounting::liquidity_pool::PoolStats {
    defi_accounting::query::get_pool_stats()
}

#[query]
fn get_lp_position(principal: Principal) -> defi_accounting::liquidity_pool::LPPosition {
    defi_accounting::query::get_lp_position(principal)
}

#[query]
fn get_my_lp_position() -> defi_accounting::liquidity_pool::LPPosition {
    defi_accounting::query::get_my_lp_position()
}

#[query]
fn calculate_shares_preview(amount: u64) -> Result<candid::Nat, String> {
    defi_accounting::liquidity_pool::calculate_shares_preview(amount)
}

#[query]
fn can_accept_bets() -> bool {
    defi_accounting::liquidity_pool::can_accept_bets()
}

#[query]
fn get_house_mode() -> String {
    defi_accounting::query::get_house_mode()
}

// =============================================================================
// ADMIN ENDPOINTS
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

#[query]
fn admin_get_audit_log(limit: u64, offset: u64) -> Result<Vec<defi_accounting::types::AuditEntry>, String> {
    defi_accounting::admin_query::get_audit_log(limit, offset)
}

#[query]
fn admin_get_audit_log_count() -> Result<u64, String> {
    defi_accounting::admin_query::get_audit_log_count()
}

// =============================================================================
// STATISTICS ENDPOINTS
// =============================================================================

#[query]
fn get_daily_stats(limit: u32) -> Vec<defi_accounting::DailySnapshot> {
    defi_accounting::get_daily_snapshots(limit)
}

#[query]
fn get_pool_apy(days: Option<u32>) -> defi_accounting::ApyInfo {
    defi_accounting::get_apy_info(days)
}

#[query]
fn get_stats_range(start_ts: u64, end_ts: u64) -> Vec<defi_accounting::DailySnapshot> {
    defi_accounting::get_snapshots_range(start_ts, end_ts)
}

#[query]
fn get_stats_count() -> u64 {
    defi_accounting::get_snapshot_count()
}

// ============================================================================
// EXISTING QUERY FUNCTIONS (PRESERVED)
// ============================================================================

/// Get the crash formula as a string
#[query]
fn get_crash_formula() -> String {
    "crash = 0.99 / (1.0 - random)".to_string()
}

/// Get expected value (should be 0.99)
#[query]
fn get_expected_value() -> f64 {
    0.99  // Theoretical - actual calculation would require integration
}


/// Calculate probability of reaching a specific multiplier
/// Returns P(crash ≥ target)
#[query]
fn get_win_probability(target: f64) -> Result<f64, String> {
    // Validate input is a finite number
    if !target.is_finite() {
        return Err("Target must be a finite number".to_string());
    }

    // If target < 1.0, crash will always be >= target (since min crash is 1.0)
    if target < 1.0 {
        return Ok(1.0);
    }
    // If target exceeds max possible crash, probability is 0
    if target > MAX_CRASH {
        return Ok(0.0);
    }
    // Formula: P(crash ≥ X) = 0.99 / X
    Ok((0.99 / target).min(1.0))
}

/// Get example crash probabilities for common targets
#[query]
fn get_probability_table() -> Vec<(f64, f64)> {
    // Returns (target, probability) pairs
    // Using const array to avoid allocations
    const TARGETS: [f64; 8] = [1.1, 1.5, 2.0, 3.0, 5.0, 10.0, 50.0, 100.0];
    TARGETS.iter()
        .map(|&t| (t, get_win_probability(t).unwrap_or(0.0)))
        .collect()
}

#[query]
fn greet(name: String) -> String {
    format!("Simple Crash: Transparent 1% edge, {} wins or loses fairly with USDT!", name)
}