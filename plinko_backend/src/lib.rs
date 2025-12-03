//! Pure Mathematical Plinko - Transparent Formula Casino Game
//!
//! **Design Philosophy:**
//! Every multiplier is derived from a single transparent mathematical formula,
//! not arbitrary values. This ensures complete transparency and verifiability.
//!
//! **The Formula:**
//! M(k) = 0.2 + 6.32 × ((k - 4) / 4)²
//!
//! Where:
//! - k is the position (0 to 8 for 8 rows)
//! - 0.2 is the center multiplier (80% loss at most probable position)
//! - 6.32 is the scaling factor to achieve exactly 0.99 expected value
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
    const ROWS: u8 = 8;

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
    let multiplier = calculate_multiplier(final_position);
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
    const ROWS: u8 = 8;
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
        let multiplier = calculate_multiplier(final_position);
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



/// Get all multipliers for display
/// Returns exactly 9 values for positions 0-8
#[query]
fn get_multipliers() -> Vec<f64> {
    (0..=8).map(calculate_multiplier).collect()
}

/// Get the mathematical formula as a string
/// Allows frontend to display the formula
#[query]
fn get_formula() -> String {
    "M(k) = 0.2 + 6.32 × ((k - 4) / 4)²".to_string()
}

/// Get expected value for transparency
/// Should always return 0.99 (1% house edge)
#[query]
fn get_expected_value() -> f64 {
    // Binomial coefficients for 8 rows
    let coefficients = [1, 8, 28, 56, 70, 56, 28, 8, 1];
    let total_paths = 256.0;

    coefficients.iter()
        .enumerate()
        .map(|(pos, &coeff)| {
            let probability = coeff as f64 / total_paths;
            let multiplier = calculate_multiplier(pos as u8);
            probability * multiplier
        })
        .sum()
}

/// Calculate multiplier using pure mathematical formula
/// M(k) = 0.2 + 6.32 × ((k - 4) / 4)²
///
/// This formula creates a quadratic distribution where:
/// - Center (k=4) has minimum multiplier of 0.2 (80% loss)
/// - Edges (k=0,8) have maximum multiplier of 6.52 (big win)
/// - Expected value is exactly 0.99 (1% house edge)
pub fn calculate_multiplier(position: u8) -> f64 {
    // Validate position
    if position > 8 {
        return 0.0; // Invalid position
    }

    // Pure mathematical formula
    let k = position as f64;
    let center = 4.0;
    let distance = (k - center).abs();
    let normalized = distance / 4.0; // Normalize to [0, 1]

    // Quadratic formula with precise constants
    0.2 + 6.32 * normalized * normalized
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
        fn test_exact_multipliers() {
            // Test each position matches expected values
            let expected = [6.52, 3.755, 1.78, 0.595, 0.2, 0.595, 1.78, 3.755, 6.52];

            for (pos, &expected_mult) in expected.iter().enumerate() {
                let calculated = calculate_multiplier(pos as u8);
                assert!(
                    (calculated - expected_mult).abs() < 0.001,
                    "Position {}: expected {}, got {}",
                    pos, expected_mult, calculated
                );
            }
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
                let left = calculate_multiplier(i);
                let right = calculate_multiplier(8 - i);
                assert!(
                    (left - right).abs() < 0.0001,
                    "Asymmetry at position {}: {} != {}",
                    i, left, right
                );
            }
        }

        #[test]
        fn test_win_loss_positions() {
            let multipliers = get_multipliers();

            // Count winning and losing positions
            let winners = multipliers.iter().filter(|&&m| m >= 1.0).count();
            let losers = multipliers.iter().filter(|&&m| m < 1.0).count();

            assert_eq!(winners, 6, "Should have 6 winning positions");
            assert_eq!(losers, 3, "Should have 3 losing positions");
        }

        #[test]
        fn test_variance_ratio() {
            let multipliers = get_multipliers();
            let max = multipliers.iter().fold(0.0_f64, |a, &b| a.max(b));
            let min = multipliers.iter().fold(f64::MAX, |a, &b| a.min(b));

            let variance_ratio = max / min;
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
            let multiplier = calculate_multiplier(final_position);

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
