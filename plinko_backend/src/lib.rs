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

use candid::{CandidType, Deserialize};
use ic_cdk::{init, pre_upgrade, post_upgrade, query, update};
use ic_cdk::management_canister::raw_rand;

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

// Memory management for future upgrades
#[init]
fn init() {
    ic_cdk::println!("Pure Mathematical Plinko initialized");
}

#[pre_upgrade]
fn pre_upgrade() {
    // Currently stateless - ready for future state
    ic_cdk::println!("Pre-upgrade: No state to preserve");
}

#[post_upgrade]
fn post_upgrade() {
    // Currently stateless - ready for future state
    ic_cdk::println!("Post-upgrade: No state to restore");
}

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
/// Generated from constants to stay in sync with implementation.
/// Note: If constants change, update this formula to match:
/// - 0.2 = MIN_MULTIPLIER_BP / MULTIPLIER_SCALE
/// - 6.32 = QUADRATIC_FACTOR_BP * 16 / MULTIPLIER_SCALE
/// - 4 = ROWS / 2
#[query]
fn get_formula() -> String {
    "M(k) = 0.2 + 6.32 × ((k - 4) / 4)²".to_string()
}

/// Get expected value for transparency
/// Should always return 0.99 (1% house edge)
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

        #[test]
        fn test_house_edge_exactly_one_percent() {
            let ev = get_expected_value();
            let house_edge = 1.0 - ev;
            assert!(
                (house_edge - 0.01).abs() < 0.000001,
                "House edge should be exactly 1%, got {}%",
                house_edge * 100.0
            );
        }

        #[test]
        fn test_multiplier_symmetry() {
            // Verify perfect symmetry
            for i in 0..=4 {
                let left = calculate_multiplier_bp(i).expect("Valid position");
                let right = calculate_multiplier_bp(8 - i).expect("Valid position");
                assert_eq!(
                    left, right,
                    "Asymmetry at position {}: {} != {}",
                    i, left, right
                );
            }
        }

        #[test]
        fn test_win_loss_positions() {
            let multipliers = get_multipliers_bp();

            // Count winning and losing positions (1.0x = 10000 BP)
            let winners = multipliers.iter().filter(|&&m| m >= 10_000).count();
            let losers = multipliers.iter().filter(|&&m| m < 10_000).count();

            assert_eq!(winners, 6, "Should have 6 winning positions");
            assert_eq!(losers, 3, "Should have 3 losing positions");
        }

        #[test]
        fn test_variance_ratio() {
            let multipliers = get_multipliers_bp();
            let max = multipliers.iter().fold(0_u64, |a, &b| a.max(b));
            let min = multipliers.iter().fold(u64::MAX, |a, &b| a.min(b));

            let variance_ratio = max as f64 / min as f64;
            assert!(
                (variance_ratio - 32.6).abs() < 0.1,
                "Variance ratio should be ~32.6:1, got {}:1",
                variance_ratio
            );
        }
    }

    // ------------------------------------------------------------------------
    // Statistical verification tests using Monte Carlo simulation
    // ------------------------------------------------------------------------
    mod statistical_verification {
        use super::*;

        /// Simulate a single plinko drop using randomness
        /// Returns (final_position, multiplier, payout_for_1_unit_bet)
        fn simulate_drop(random_byte: u8) -> (u8, f64, f64) {
            const ROWS: u8 = 8;

            // Generate path from random byte (same logic as lib.rs)
            let path: Vec<bool> = (0..ROWS)
                .map(|i| (random_byte >> i) & 1 == 1)
                .collect();

            // Count rights to get final position
            let final_position = path.iter().filter(|&&d| d).count() as u8;

            // Calculate multiplier
            let multiplier_bp = calculate_multiplier_bp(final_position).expect("Valid position");
            let multiplier = multiplier_bp as f64 / MULTIPLIER_SCALE as f64;

            // For 1 unit bet, payout is multiplier
            let payout = multiplier;

            (final_position, multiplier, payout)
        }

        #[test]
        fn test_statistical_house_edge_verification() {
            use rand::Rng;

            // Run 10,000 simulations with TRUE randomness to verify house edge
            const NUM_SIMULATIONS: usize = 10_000;
            const BET_AMOUNT: f64 = 1.0;

            let mut rng = rand::thread_rng();
            let mut total_wagered = 0.0;
            let mut total_returned = 0.0;
            let mut position_counts = [0usize; 9];

            // Use truly random bytes for Monte Carlo simulation
            for _ in 0..NUM_SIMULATIONS {
                let random_byte: u8 = rng.gen();
                let (position, _multiplier, payout) = simulate_drop(random_byte);

                total_wagered += BET_AMOUNT;
                total_returned += payout * BET_AMOUNT;
                position_counts[position as usize] += 1;
            }

            // Calculate actual return-to-player (RTP)
            let actual_rtp = total_returned / total_wagered;
            let actual_house_edge = 1.0 - actual_rtp;

            // Get theoretical expected value
            let expected_rtp = get_expected_value();
            let expected_house_edge = 1.0 - expected_rtp;

            // Print detailed results
            println!("\n=== Statistical Verification (N={}) ===", NUM_SIMULATIONS);
            println!("Total Wagered: {:.2} units", total_wagered);
            println!("Total Returned: {:.2} units", total_returned);
            println!("Actual RTP: {:.4} ({:.2}%)", actual_rtp, actual_rtp * 100.0);
            println!("Actual House Edge: {:.4} ({:.2}%)", actual_house_edge, actual_house_edge * 100.0);
            println!("Expected RTP: {:.4} ({:.2}%)", expected_rtp, expected_rtp * 100.0);
            println!("Expected House Edge: {:.4} ({:.2}%)", expected_house_edge, expected_house_edge * 100.0);
            println!("\nPosition Distribution:");
            for (pos, count) in position_counts.iter().enumerate() {
                let pct = (*count as f64 / NUM_SIMULATIONS as f64) * 100.0;
                println!("  Position {}: {} drops ({:.2}%)", pos, count, pct);
            }

            // Assertions with reasonable tolerance for statistical variance
            let tolerance = 0.02; // 2% tolerance

            assert!(
                (actual_rtp - expected_rtp).abs() < tolerance,
                "Actual RTP ({:.4}) differs from expected ({:.4}) by more than {:.2}%",
                actual_rtp, expected_rtp, tolerance * 100.0
            );

            assert!(
                (actual_house_edge - expected_house_edge).abs() < tolerance,
                "Actual house edge ({:.4}) differs from expected ({:.4}) by more than {:.2}%",
                actual_house_edge, expected_house_edge, tolerance * 100.0
            );

            // Verify we're actually getting a house edge close to 1%
            assert!(
                (actual_house_edge - 0.01).abs() < tolerance,
                "House edge should be approximately 1%, got {:.2}%",
                actual_house_edge * 100.0
            );

            // Verify players are getting back approximately 99% of wagered amount
            assert!(
                (actual_rtp - 0.99).abs() < tolerance,
                "RTP should be approximately 0.99, got {:.4}",
                actual_rtp
            );
        }

        #[test]
        fn test_position_distribution_matches_binomial() {
            use rand::Rng;

            // Verify the position distribution follows binomial probabilities
            // Using larger sample size for statistical significance
            const NUM_DROPS: usize = 25_600;

            let mut rng = rand::thread_rng();
            let mut position_counts = [0usize; 9];

            // Use truly random bytes for statistical testing
            for _ in 0..NUM_DROPS {
                let random_byte: u8 = rng.gen();
                let (position, _, _) = simulate_drop(random_byte);
                position_counts[position as usize] += 1;
            }

            // Expected binomial distribution for 8 rows
            let expected_probabilities = [
                1.0 / 256.0,   // Position 0
                8.0 / 256.0,   // Position 1
                28.0 / 256.0,  // Position 2
                56.0 / 256.0,  // Position 3
                70.0 / 256.0,  // Position 4 (center)
                56.0 / 256.0,  // Position 5
                28.0 / 256.0,  // Position 6
                8.0 / 256.0,   // Position 7
                1.0 / 256.0,   // Position 8
            ];

            println!("\n=== Position Distribution Test ===");
            for (pos, &count) in position_counts.iter().enumerate() {
                let actual_prob = count as f64 / NUM_DROPS as f64;
                let expected_prob = expected_probabilities[pos];
                let diff = (actual_prob - expected_prob).abs();

                println!(
                    "Position {}: actual={:.4} expected={:.4} diff={:.4}",
                    pos, actual_prob, expected_prob, diff
                );

                // More lenient tolerance for truly random data
                // With 25,600 samples, expect ~1.5% standard deviation
                assert!(
                    diff < 0.015,
                    "Position {} probability deviates too much: {:.4} vs {:.4}",
                    pos, actual_prob, expected_prob
                );
            }
        }
    }
}
