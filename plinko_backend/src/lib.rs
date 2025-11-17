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
use ic_cdk::api::management_canister::main::raw_rand;

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlinkoResult {
    pub path: Vec<bool>,        // true = right, false = left
    pub final_position: u8,     // 0 to 8
    pub multiplier: f64,
    pub win: bool,              // true if multiplier >= 1.0
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct MultiBallResult {
    pub balls: Vec<PlinkoResult>,     // Individual results for each ball
    pub total_multiplier: f64,        // Sum of all multipliers
    pub average_multiplier: f64,      // Average multiplier across balls
    pub ball_count: u8,               // Number of balls dropped
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
        .0;

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

/// Drop multiple balls down the 8-row Plinko board (1-10 balls)
/// Uses single VRF call for efficiency
/// Returns aggregate statistics along with individual results
#[update]
async fn drop_balls(num_balls: u8) -> Result<MultiBallResult, String> {
    const ROWS: u8 = 8;

    // Validate input
    if num_balls == 0 || num_balls > 10 {
        return Err("Number of balls must be between 1 and 10".to_string());
    }

    // Get random bytes for all balls (single VRF call)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?
        .0;

    // Ensure we have enough bytes
    if random_bytes.len() < num_balls as usize {
        return Err("Insufficient randomness".to_string());
    }

    // Process each ball using sequential bytes
    let mut balls = Vec::new();
    let mut total_multiplier = 0.0;

    for ball_index in 0..num_balls {
        // Use byte at index for this ball (bytes 0-9 for balls 0-9)
        let random_byte = random_bytes[ball_index as usize];

        // Generate 8-step path from byte (8 bits for 8 rows)
        let path: Vec<bool> = (0..ROWS)
            .map(|bit| (random_byte >> bit) & 1 == 1)
            .collect();

        // Calculate final position (count rights)
        let final_position = path.iter().filter(|&&direction| direction).count() as u8;

        // Get multiplier using existing formula
        let multiplier = calculate_multiplier(final_position);

        // Create result for this ball
        let ball_result = PlinkoResult {
            path,
            final_position,
            multiplier,
            win: multiplier >= 1.0,
        };

        balls.push(ball_result);
        total_multiplier += multiplier;
    }

    // Calculate aggregate stats
    let average_multiplier = total_multiplier / num_balls as f64;

    Ok(MultiBallResult {
        balls,
        total_multiplier,
        average_multiplier,
        ball_count: num_balls,
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
fn calculate_multiplier(position: u8) -> f64 {
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
    format!("Pure Mathematical Plinko: Transparent odds, {} wins or loses fairly!", name)
}

#[cfg(test)]
mod tests {
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

        assert_eq!(winners, 4, "Should have 4 winning positions");
        assert_eq!(losers, 5, "Should have 5 losing positions");
    }

    #[test]
    fn test_variance_ratio() {
        let multipliers = get_multipliers();
        let max = multipliers.iter().fold(0.0, |a, &b| a.max(b));
        let min = multipliers.iter().fold(f64::MAX, |a, &b| a.min(b));

        let variance_ratio = max / min;
        assert!(
            (variance_ratio - 32.6).abs() < 0.1,
            "Variance ratio should be ~32.6:1, got {}:1",
            variance_ratio
        );
    }
}
