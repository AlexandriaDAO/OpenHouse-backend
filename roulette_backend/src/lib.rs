//! European Roulette Backend with DeFi Integration
//!
//! **Design Philosophy:**
//! European roulette (single zero) with transparent 2.70% house edge,
//! integrated with liquidity pool for real ckUSDT betting.
//!
//! **House Edge:**
//! - European roulette: 1/37 ≈ 2.70% (zero gives house edge on all bets)
//! - All payouts calculated fairly with this edge built in
//!
//! **Transparency & Fairness:**
//! - Randomness: IC VRF (raw_rand) - no fallback
//! - All bet types and payouts clearly documented
//! - Real ckUSDT betting with liquidity pool backing

use candid::Principal;
use ic_cdk::{init, pre_upgrade, post_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;
use std::cell::RefCell;

// ============================================================================
// MODULE DECLARATIONS
// ============================================================================

mod defi_accounting;
mod types;
mod game;
mod board;

pub use types::*;
use board::{RED_NUMBERS, BLACK_NUMBERS};

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

pub type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    pub static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

// ============================================================================
// LIFECYCLE HOOKS
// ============================================================================

#[init]
fn init() {
    ic_cdk::println!("Roulette Backend Initialized with DeFi Accounting - European Roulette (2.70% house edge)");
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::accounting::start_balance_reconciliation_timer();
    defi_accounting::start_stats_timer();

    // Initialize cached balance on fresh install using a one-shot timer
    ic_cdk_timers::set_timer(std::time::Duration::ZERO, async {
        defi_accounting::accounting::refresh_canister_balance().await;
        ic_cdk::println!("Init: balance cache initialized");
    });
}

#[pre_upgrade]
fn pre_upgrade() {
    ic_cdk::println!("Pre-upgrade: state persists automatically");
}

#[post_upgrade]
fn post_upgrade() {
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::accounting::start_balance_reconciliation_timer();
    defi_accounting::start_stats_timer();

    // Initialize cached balance immediately after upgrade
    ic_cdk_timers::set_timer(std::time::Duration::ZERO, async {
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

/// Execute a spin with real ckUSDT bets
/// Bets are deducted from user's deposited balance
#[update]
async fn spin(bets: Vec<Bet>) -> Result<SpinResult, String> {
    if !is_canister_solvent() {
        return Err("Game temporarily paused - insufficient funds.".to_string());
    }
    game::spin_with_betting(bets, ic_cdk::api::msg_caller()).await
}

/// Get maximum bet allowed (based on house balance)
#[query]
fn get_max_bet() -> u64 {
    game::get_max_bet()
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
// ROULETTE-SPECIFIC QUERY ENDPOINTS
// ============================================================================

/// Get the board layout (red and black numbers)
#[query]
fn get_board_layout() -> BoardLayout {
    BoardLayout {
        red_numbers: RED_NUMBERS.to_vec(),
        black_numbers: BLACK_NUMBERS.to_vec(),
    }
}

/// Get payout information for all bet types
#[query]
fn get_payouts() -> Vec<PayoutInfo> {
    vec![
        PayoutInfo {
            bet_type: "Straight".into(),
            payout_multiplier: 35,
            description: "Single number (0-36)".into(),
        },
        PayoutInfo {
            bet_type: "Split".into(),
            payout_multiplier: 17,
            description: "Two adjacent numbers".into(),
        },
        PayoutInfo {
            bet_type: "Street".into(),
            payout_multiplier: 11,
            description: "Three numbers in a row".into(),
        },
        PayoutInfo {
            bet_type: "Corner".into(),
            payout_multiplier: 8,
            description: "Four numbers in a square".into(),
        },
        PayoutInfo {
            bet_type: "Six Line".into(),
            payout_multiplier: 5,
            description: "Six numbers (two rows)".into(),
        },
        PayoutInfo {
            bet_type: "Column".into(),
            payout_multiplier: 2,
            description: "12 numbers in a column".into(),
        },
        PayoutInfo {
            bet_type: "Dozen".into(),
            payout_multiplier: 2,
            description: "12 numbers (1-12, 13-24, 25-36)".into(),
        },
        PayoutInfo {
            bet_type: "Red/Black".into(),
            payout_multiplier: 1,
            description: "18 numbers by color".into(),
        },
        PayoutInfo {
            bet_type: "Even/Odd".into(),
            payout_multiplier: 1,
            description: "18 numbers by parity".into(),
        },
        PayoutInfo {
            bet_type: "Low/High".into(),
            payout_multiplier: 1,
            description: "1-18 or 19-36".into(),
        },
    ]
}

/// Greet a player
#[query]
fn greet(name: String) -> String {
    format!(
        "Welcome to OpenHouse Roulette, {}! European rules, 2.70% house edge. Real USDT betting!",
        name
    )
}

ic_cdk::export_candid!();
