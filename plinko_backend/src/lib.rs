//! Pure Mathematical Plinko - Transparent Formula Casino Game
//!
//! **Design Philosophy:**
//! Every multiplier is derived from a single transparent mathematical formula.
//! Integer-precision calculations ensure exact values for DeFi integration.
//!
//! **The Formula:**
//! - Display: M(k) = 0.2 + 6.32 × ((k - 4) / 4)²
//! - Internal: M_bp(k) = 2000 + 3950 × d² (basis points, d = distance from center)
//!
//! Where:
//! - k is the position (0 to 8 for 8 rows)
//! - 10000 BP = 1.0x multiplier (no floating-point errors)
//! - The quadratic curve mirrors the binomial probability distribution
//!
//! **Transparency & Fairness:**
//! - Randomness: IC VRF (raw_rand) - no fallback
//! - Expected value: Exactly 0.99 (1% house edge)
//! - All multipliers calculable by players
//! - No hidden mechanics or arbitrary values

use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{init, pre_upgrade, post_upgrade, query, update};
use ic_cdk::management_canister::raw_rand;
use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;
use std::cell::RefCell;

// ============================================================================
// MODULE DECLARATIONS
// ============================================================================

mod defi_accounting;
pub mod types;
pub mod game;

pub use game::{PlinkoGameResult, MultiBallGameResult};

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

pub type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    pub static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlinkoResult {
    pub path: Vec<bool>,        // true = right, false = left
    pub final_position: u8,     // 0 to 8
    pub multiplier: f64,
    pub win: bool,              // true if multiplier >= 1.0
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct MultiBallResult {
    pub results: Vec<PlinkoResult>,
    pub total_balls: u8,
    pub total_wins: u8,
    pub average_multiplier: f64,
}

// ============================================================================
// CONSTANTS
// ============================================================================

/// Multiplier precision: 10000 basis points = 1.0x multiplier
/// Example: 65200 BP = 6.52x, 2000 BP = 0.2x
pub const MULTIPLIER_SCALE: u64 = 10_000;

/// Number of rows in the Plinko board (fixed configuration)
pub const ROWS: u8 = 8;

/// Number of possible final positions (0 to ROWS inclusive)
pub const NUM_POSITIONS: u8 = ROWS + 1;

/// Center position of the board
pub const CENTER_POSITION: u8 = ROWS / 2;

/// Minimum multiplier in basis points (center position = highest loss)
/// 2000 BP = 0.2x (80% loss at most probable position)
pub const MIN_MULTIPLIER_BP: u64 = 2_000;

/// Quadratic scaling factor in basis points
/// Derived: 6.32 * MULTIPLIER_SCALE / (ROWS/2)² = 6.32 * 10000 / 4² = 3950
/// The (ROWS/2)² denominator normalizes distance to [0,1] before squaring
/// This achieves exactly 0.99 expected value (1% house edge)
pub const QUADRATIC_FACTOR_BP: u64 = 3_950;

/// Binomial coefficients for 8 rows (Pascal's triangle row 8)
/// Used for probability calculations and EV verification
pub const BINOMIAL_COEFFICIENTS: [u64; 9] = [1, 8, 28, 56, 70, 56, 28, 8, 1];

/// Total paths through 8-row board (2^8 = 256)
pub const TOTAL_PATHS: u64 = 256;

// ============================================================================
// CORE LOGIC
// ============================================================================

/// Calculate multiplier in basis points using pure integer arithmetic.
/// Returns multiplier scaled by MULTIPLIER_SCALE (10000).
///
/// Formula: M_bp(k) = MIN_MULTIPLIER_BP + QUADRATIC_FACTOR_BP × d²
/// Where d = |k - CENTER_POSITION|
///
/// Example: position 0 → 65200 BP (6.52x)
pub fn calculate_multiplier_bp(position: u8) -> Result<u64, String> {
    if position > ROWS {
        return Err(format!(
            "Invalid position {}: must be 0-{} for {}-row board",
            position, ROWS, ROWS
        ));
    }

    // Distance from center (0-4 for 8-row board)
    let distance = if position > CENTER_POSITION {
        position - CENTER_POSITION
    } else {
        CENTER_POSITION - position
    } as u64;

    // Pure integer formula: no floating point
    // Use checked arithmetic to prevent overflow (though unlikely with current constants)
    let distance_squared = distance.checked_mul(distance)
        .ok_or("Overflow in distance calculation")?;
    
    let quad_term = QUADRATIC_FACTOR_BP.checked_mul(distance_squared)
        .ok_or("Overflow in quadratic term calculation")?;
        
    MIN_MULTIPLIER_BP.checked_add(quad_term)
        .ok_or("Overflow in final multiplier calculation".to_string())
}

// ============================================================================
// LIFECYCLE HOOKS
// ============================================================================

#[init]
fn init() {
    ic_cdk::println!("Plinko Backend Initialized with DeFi Accounting");
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::start_stats_timer();
}

#[pre_upgrade]
fn pre_upgrade() {
    // StableBTreeMap persists automatically
    ic_cdk::println!("Pre-upgrade: state persists automatically");
}

#[post_upgrade]
fn post_upgrade() {
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::start_stats_timer();
    ic_cdk::println!("Post-upgrade: timers restarted");
}

// ============================================================================
// SOLVENCY CHECK
// ============================================================================

fn is_canister_solvent() -> bool {
    let pool_reserve = defi_accounting::liquidity_pool::get_pool_reserve();
    let total_deposits = defi_accounting::accounting::calculate_total_deposits_internal();
    let canister_balance = defi_accounting::accounting::get_cached_canister_balance_internal();

    // Use checked_add to detect impossible overflow scenarios
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
async fn play_plinko(bet_amount: u64) -> Result<PlinkoGameResult, String> {
    // Refresh balance cache before solvency check
    defi_accounting::accounting::refresh_canister_balance().await;
    if !is_canister_solvent() {
        return Err("Game temporarily paused - insufficient funds.".to_string());
    }
    game::play_plinko(bet_amount, ic_cdk::api::msg_caller()).await
}

#[update]
async fn play_multi_plinko(ball_count: u8, bet_per_ball: u64) -> Result<MultiBallGameResult, String> {
    // Refresh balance cache before solvency check
    defi_accounting::accounting::refresh_canister_balance().await;
    if !is_canister_solvent() {
        return Err("Game temporarily paused - insufficient funds.".to_string());
    }
    game::play_multi_plinko(ball_count, bet_per_ball, ic_cdk::api::msg_caller()).await
}

#[query]
fn get_max_bet() -> u64 {
    game::calculate_max_bet()
}

#[query]
fn get_max_bet_per_ball(ball_count: u8) -> Result<u64, String> {
    game::calculate_max_bet_per_ball(ball_count)
}

/// Get the effective max multiplier used for bet validation.
/// Returns (effective_multiplier_bp, actual_max_multiplier_bp).
///
/// For 1-3 balls: effective = actual (6.52x) - high variance
/// For 4+ balls: effective decreases based on Law of Large Numbers
///
/// This allows higher per-ball bets for multi-ball games while
/// maintaining the same actual risk to the house.
#[query]
fn get_effective_multiplier(ball_count: u8) -> (u64, u64) {
    game::get_effective_multiplier_bp(ball_count)
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
// EXISTING PURE GAME LOGIC (PRESERVED)
// ============================================================================

/// Drop a ball down the 8-row Plinko board
/// Uses pure mathematical formula for multipliers
/// No parameters - fixed configuration for simplicity
#[update]
async fn drop_ball() -> Result<PlinkoResult, String> {
    // Get randomness - fail safely if unavailable
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?
;

    // For 8 rows, use single byte (efficient)
    let random_byte = random_bytes.get(0)
        .ok_or("Insufficient randomness")?;

    // Generate path: 8 independent coin flips
    let path: Vec<bool> = (0..ROWS)
        .map(|i| (random_byte >> i) & 1 == 1)
        .collect();

    // Count rights to get final position
    let final_position = path.iter().filter(|&&d| d).count() as u8;

    // Calculate multiplier using pure formula
    // Use integer precision internally, then convert for display
    let multiplier_bp = calculate_multiplier_bp(final_position)
        .map_err(|e| format!("Multiplier calculation failed: {}", e))?;
    
    let multiplier = multiplier_bp as f64 / MULTIPLIER_SCALE as f64;

    let win = multiplier >= 1.0;

    Ok(PlinkoResult {
        path,
        final_position,
        multiplier,
        win,
    })
}

/// Drop multiple balls at once (1-30 balls)
/// Efficient: uses single VRF call for up to 32 balls
#[update]
async fn drop_multiple_balls(count: u8) -> Result<MultiBallResult, String> {
    const MAX_BALLS: u8 = 30;

    // Validation
    if count < 1 {
        return Err("Must drop at least 1 ball".to_string());
    }
    if count > MAX_BALLS {
        return Err(format!("Maximum {} balls allowed", MAX_BALLS));
    }

    // Get randomness - one VRF call gives us 32 bytes
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    if random_bytes.len() < count as usize {
        return Err("Insufficient randomness".to_string());
    }

    // Process each ball using sequential bytes
    let mut results = Vec::with_capacity(count as usize);

    for i in 0..count {
        let random_byte = random_bytes[i as usize];

        // Generate path for this ball
        let path: Vec<bool> = (0..ROWS)
            .map(|bit| (random_byte >> bit) & 1 == 1)
            .collect();

        // Calculate result
        let final_position = path.iter().filter(|&&d| d).count() as u8;
        
        let multiplier_bp = calculate_multiplier_bp(final_position)
            .map_err(|e| format!("Multiplier calculation failed for ball {}: {}", i, e))?;
        
        let multiplier = multiplier_bp as f64 / MULTIPLIER_SCALE as f64;
        
        let win = multiplier >= 1.0;

        results.push(PlinkoResult {
            path,
            final_position,
            multiplier,
            win,
        });
    }

    // Calculate aggregate stats
    let total_wins = results.iter().filter(|r| r.win).count() as u8;
    let sum_multipliers: f64 = results.iter().map(|r| r.multiplier).sum();
    let average_multiplier = sum_multipliers / (count as f64);

    Ok(MultiBallResult {
        results,
        total_balls: count,
        total_wins,
        average_multiplier,
    })
}

/// Get all multipliers in basis points for positions 0-8.
/// Returns exactly 9 values. Panics on invalid state (should never happen).
#[query]
fn get_multipliers_bp() -> Vec<u64> {
    (0..=ROWS)
        .map(|pos| {
            calculate_multiplier_bp(pos)
                .expect("Position 0-8 should always be valid")
        })
        .collect()
}

/// Get the mathematical formula as a string.
#[query]
fn get_formula() -> String {
    "M(k) = 0.2 + 6.32 × ((k - 4) / 4)²".to_string()
}

/// Get expected value for transparency
#[query]
fn get_expected_value() -> f64 {
    BINOMIAL_COEFFICIENTS.iter()
        .enumerate()
        .map(|(pos, &coeff)| {
            let probability = coeff as f64 / TOTAL_PATHS as f64;
            let multiplier_bp = calculate_multiplier_bp(pos as u8).unwrap_or(0);
            let multiplier = multiplier_bp as f64 / MULTIPLIER_SCALE as f64;
            probability * multiplier
        })
        .sum()
}

#[query]
fn greet(name: String) -> String {
    format!("Pure Mathematical Plinko: Transparent odds, {} wins or loses fairly with USDT!", name)
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------------------------
    // Unit tests for multiplier formula and game properties
    // ------------------------------------------------------------------------
    mod multipliers {
        use super::*;

        #[test]
        fn test_exact_multipliers_bp() {
            // Integer basis point values - no floating point tolerance needed
            let expected_bp: [u64; 9] = [65200, 37550, 17800, 5950, 2000, 5950, 17800, 37550, 65200];

            for (pos, &expected) in expected_bp.iter().enumerate() {
                let calculated = calculate_multiplier_bp(pos as u8).expect("Valid position");
                assert_eq!(
                    calculated, expected,
                    "Position {}: expected {} BP, got {} BP",
                    pos, expected, calculated
                );
            }
        }

        #[test]
        fn test_constants_consistency() {
            // Verify constants are internally consistent
            assert_eq!(NUM_POSITIONS as usize, BINOMIAL_COEFFICIENTS.len());
            assert_eq!(TOTAL_PATHS, BINOMIAL_COEFFICIENTS.iter().sum::<u64>());
            assert_eq!(CENTER_POSITION, ROWS / 2);
        }

        #[test]
        fn test_get_multipliers_bp_api() {
            let multipliers = get_multipliers_bp();
            assert_eq!(multipliers.len(), 9);
            assert_eq!(multipliers[0], 65200);
            assert_eq!(multipliers[4], 2000); // Center position
            assert_eq!(multipliers[8], 65200);
        }

        #[test]
        fn test_invalid_position_returns_error() {
            assert!(calculate_multiplier_bp(9).is_err());
            assert!(calculate_multiplier_bp(255).is_err());

            let err = calculate_multiplier_bp(9).unwrap_err();
            assert!(err.contains("Invalid position"));
        }

        #[test]
        fn test_expected_value_exactly_point_99() {
            let ev = get_expected_value();
            assert!(
                (ev - 0.99).abs() < 0.000001,
                "Expected value should be exactly 0.99, got {}",
                ev
            );
        }
    }
}
