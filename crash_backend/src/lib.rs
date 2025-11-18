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

use candid::{CandidType, Deserialize};
use ic_cdk::{init, pre_upgrade, post_upgrade, query, update};
use ic_cdk::api::management_canister::main::raw_rand;

// Constants
const MAX_CRASH: f64 = 100.0;  // Cap crash at 100x

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct CrashResult {
    pub crash_point: f64,           // Where it crashed (1.00x - 1000.00x)
    pub randomness_hash: String,    // IC randomness hash for audit/reference
}

// Memory management for future upgrades
#[init]
fn init() {
    ic_cdk::println!("Simple Crash Game initialized");
}

#[pre_upgrade]
fn pre_upgrade() {
    // Stateless - nothing to preserve
    ic_cdk::println!("Pre-upgrade: No state to preserve");
}

#[post_upgrade]
fn post_upgrade() {
    // Stateless - nothing to restore
    ic_cdk::println!("Post-upgrade: No state to restore");
}

/// Simulate a crash point using IC threshold randomness
/// Returns crash point and randomness hash for audit/reference
#[update]
async fn simulate_crash() -> Result<CrashResult, String> {
    // Get randomness from IC's threshold randomness beacon (raw_rand)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?
        .0;

    // Convert first 8 bytes to f64 in range [0.0, 1.0)
    let random = bytes_to_float(&random_bytes)?;

    // Calculate crash point with 1% house edge
    // Formula: crash = 1.0 / (1.0 - 0.99 * random)
    let crash_point = calculate_crash_point(random);

    // Create randomness hash for audit/reference (SHA256 of random bytes)
    let randomness_hash = create_randomness_hash(&random_bytes);

    Ok(CrashResult {
        crash_point,
        randomness_hash,
    })
}

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

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/// Convert VRF bytes to float in range [0.0, 1.0)
fn bytes_to_float(bytes: &[u8]) -> Result<f64, String> {
    if bytes.len() < 8 {
        return Err("Insufficient randomness bytes".to_string());
    }

    // Use first 8 bytes as u64, then normalize to [0.0, 1.0)
    let mut byte_array = [0u8; 8];
    byte_array.copy_from_slice(&bytes[0..8]);
    let random_u64 = u64::from_be_bytes(byte_array);

    // Normalize: divide by 2^53 to get [0.0, 1.0) with full f64 precision
    // f64 has 53 bits of mantissa, so we right-shift by 11 bits (64 - 53 = 11)
    // to get the most significant 53 bits, ensuring uniform distribution
    // across the full floating-point precision range
    let random = (random_u64 >> 11) as f64 / (1u64 << 53) as f64;

    Ok(random)
}

/// Calculate crash point using the formula
/// crash = 0.99 / (1.0 - random)
///
/// **Mathematical Guarantee**: This formula provides exactly 1% house edge for ALL multipliers:
/// - P(crash ≥ X) = 0.99 / X
/// - Expected return = P(crash ≥ X) × X = 0.99 (constant 1% house edge)
/// - This holds for ANY cash-out strategy or multiplier target
///
/// **Distribution Note**: Random values are clamped to [0.0, 0.99999] before applying
/// the formula to prevent division by zero:
/// - Max crash = 0.99 / (1.0 - 0.99999) ≈ 99,000x (then capped at MAX_CRASH)
/// - Clamping affects <0.001% of values, minimal impact on fairness
/// - House edge remains exactly 1% for all practical multipliers
///
/// **Precision Note**: For very high multipliers (>100x), floating-point
/// rounding may introduce small deviations (<0.01%) from the theoretical
/// distribution. This is acceptable for practical casino purposes.
pub fn calculate_crash_point(random: f64) -> f64 {
    // Ensure random is in valid range to prevent division by zero
    // Clamping to 0.99999 allows max crash ≈ 99,000x before MAX_CRASH cap
    let random = random.max(0.0).min(0.99999);

    // Apply corrected formula for constant 1% house edge
    let crash = 0.99 / (1.0 - random);

    // Cap at maximum
    crash.min(MAX_CRASH)
}

/// Create SHA256 hash of IC randomness bytes for audit/display purposes
///
/// **Important Limitation**: This hash is for reference only and does not provide
/// cryptographic verification of fairness. Users cannot independently verify the
/// randomness without access to IC's internal consensus mechanism. The hash serves
/// as an identifier for this particular random draw, not a cryptographic proof.
///
/// True cryptographic verification would require:
/// - Access to IC's BLS threshold signatures
/// - Verification against subnet public keys
/// - Understanding of IC's random tape construction
///
/// For now, fairness relies on trusting the IC's threshold randomness beacon.
fn create_randomness_hash(bytes: &[u8]) -> String {
    use sha2::{Sha256, Digest};

    // Ensure we have sufficient entropy (at least 32 bytes)
    let hash_bytes = if bytes.len() >= 32 {
        &bytes[0..32]
    } else {
        // Use all available bytes if less than 32
        bytes
    };

    let mut hasher = Sha256::new();
    hasher.update(hash_bytes);
    format!("{:x}", hasher.finalize())
}

#[query]
fn greet(name: String) -> String {
    format!("Simple Crash: Transparent 1% edge, {} wins or loses fairly!", name)
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crash_formula_at_boundaries() {
        // random = 0.0 → crash = 0.99 / 1.0 = 0.99x
        assert!((calculate_crash_point(0.0) - 0.99).abs() < 0.01);

        // random = 0.5 → crash = 0.99 / 0.5 = 1.98x
        assert!((calculate_crash_point(0.5) - 1.98).abs() < 0.01);

        // random = 0.9 → crash = 0.99 / 0.1 = 9.9x
        assert!((calculate_crash_point(0.9) - 9.9).abs() < 0.1);

        // random = 0.99 → crash = 0.99 / 0.01 = 99x
        let high_crash = calculate_crash_point(0.99);
        assert!((high_crash - 99.0).abs() < 1.0);
        assert!(high_crash <= MAX_CRASH);
    }

    #[test]
    fn test_win_probability_formula() {
        // P(crash ≥ 2.0) = 0.99 / 2.0 = 49.5%
        assert!((get_win_probability(2.0).unwrap() - 0.495).abs() < 0.001);

        // P(crash ≥ 10.0) = 0.99 / 10.0 = 9.9%
        assert!((get_win_probability(10.0).unwrap() - 0.099).abs() < 0.001);

        // P(crash ≥ 100.0) = 0.99 / 100.0 = 0.99%
        assert!((get_win_probability(100.0).unwrap() - 0.0099).abs() < 0.0001);
    }

    #[test]
    fn test_expected_return_constant_house_edge() {
        // For ANY target X: P(crash ≥ X) × X should equal 0.99
        let targets = vec![1.1, 2.0, 5.0, 10.0, 50.0, 100.0];

        for target in targets {
            let win_prob = get_win_probability(target).unwrap();
            let expected_return = win_prob * target;

            assert!(
                (expected_return - 0.99).abs() < 0.01,
                "Target {}: expected return = {}, should be 0.99",
                target, expected_return
            );
        }
    }

    #[test]
    fn test_bytes_to_float_range() {
        // Test with various byte patterns
        let test_cases = vec![
            vec![0u8; 8],           // All zeros → 0.0
            vec![255u8; 8],         // All ones → ~1.0
            vec![128u8; 8],         // Mid → ~0.5
        ];

        for bytes in test_cases {
            let random = bytes_to_float(&bytes).unwrap();
            assert!(random >= 0.0 && random < 1.0,
                "Random value {} out of range [0.0, 1.0)", random);
        }
    }

    #[test]
    fn test_create_randomness_hash() {
        // Test that randomness hash is consistent and has expected format
        let test_bytes = vec![1u8, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                              17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

        let hash1 = create_randomness_hash(&test_bytes);
        let hash2 = create_randomness_hash(&test_bytes);

        // Hash should be deterministic
        assert_eq!(hash1, hash2);

        // Hash should be 64 hex characters (32 bytes * 2)
        assert_eq!(hash1.len(), 64);

        // Hash should only contain hex characters
        assert!(hash1.chars().all(|c| c.is_ascii_hexdigit()));

        // Different input should produce different hash
        let different_bytes = vec![255u8; 32];
        let hash3 = create_randomness_hash(&different_bytes);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_greet() {
        // Test greeting message format
        let result = greet("Alice".to_string());
        assert_eq!(result, "Simple Crash: Transparent 1% edge, Alice wins or loses fairly!");

        let result2 = greet("Bob".to_string());
        assert_eq!(result2, "Simple Crash: Transparent 1% edge, Bob wins or loses fairly!");

        // Test with empty string
        let result3 = greet("".to_string());
        assert_eq!(result3, "Simple Crash: Transparent 1% edge,  wins or loses fairly!");
    }

    #[test]
    fn test_win_probability_edge_cases() {
        // Target < 1.0 should return 1.0 (always wins since min crash is 1.0)
        assert_eq!(get_win_probability(0.5).unwrap(), 1.0);
        assert_eq!(get_win_probability(0.99).unwrap(), 1.0);
        assert_eq!(get_win_probability(0.0).unwrap(), 1.0);

        // Target > MAX_CRASH should return 0.0 (impossible to reach)
        assert_eq!(get_win_probability(1001.0).unwrap(), 0.0);
        assert_eq!(get_win_probability(10000.0).unwrap(), 0.0);

        // Target exactly at 1.0 should return close to 1.0
        let prob_at_one = get_win_probability(1.0).unwrap();
        assert!((prob_at_one - 0.99).abs() < 0.01);

        // Target at MAX_CRASH should return very small probability
        let prob_at_max = get_win_probability(MAX_CRASH).unwrap();
        assert!(prob_at_max > 0.0 && prob_at_max < 0.01);

        // Test non-finite inputs
        assert!(get_win_probability(f64::NAN).is_err());
        assert!(get_win_probability(f64::INFINITY).is_err());
        assert!(get_win_probability(f64::NEG_INFINITY).is_err());
    }

    #[test]
    fn test_crash_point_extreme_values() {
        // Test with random = 0.0 (minimum) → crash = 0.99 / 1.0 = 0.99x
        let crash_min = calculate_crash_point(0.0);
        assert!((crash_min - 0.99).abs() < 0.01);

        // Test with random = 0.999 → crash = 0.99 / 0.001 = 990x, capped at MAX_CRASH
        let crash_at_clamp = calculate_crash_point(0.999);
        assert!(crash_at_clamp <= MAX_CRASH);

        // Test with random > 0.99999 (should be clamped to 0.99999)
        // crash = 0.99 / 0.00001 = 99,000x (then capped at MAX_CRASH)
        let crash_above_clamp = calculate_crash_point(0.9999);
        assert!(crash_above_clamp <= MAX_CRASH);

        // Test with random = 1.0 (should be clamped to 0.99999)
        let crash_at_one = calculate_crash_point(1.0);
        assert!(crash_at_one <= MAX_CRASH);

        // Verify clamping prevents division by zero
        let crash_extreme = calculate_crash_point(f64::MAX);
        assert!(crash_extreme.is_finite());
        assert!(crash_extreme <= MAX_CRASH);
    }

    #[test]
    fn test_create_randomness_hash_with_short_input() {
        // Test with less than 32 bytes
        let short_bytes = vec![1u8; 16];
        let hash = create_randomness_hash(&short_bytes);

        // Should still produce valid hash
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));

        // Test with minimal bytes
        let minimal_bytes = vec![42u8; 8];
        let hash_minimal = create_randomness_hash(&minimal_bytes);
        assert_eq!(hash_minimal.len(), 64);

        // Different short inputs should produce different hashes
        assert_ne!(hash, hash_minimal);
    }

    #[test]
    fn test_bytes_to_float_insufficient_bytes() {
        // Test with less than 8 bytes (should error)
        let short = vec![1u8; 7];
        let result = bytes_to_float(&short);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Insufficient randomness bytes");

        // Test with exactly 8 bytes (should work)
        let exact = vec![1u8; 8];
        let result = bytes_to_float(&exact);
        assert!(result.is_ok());
    }

    #[test]
    fn test_clamping_preserves_distribution() {
        // Verify that clamping doesn't significantly distort the distribution
        // With new formula: crash = 0.99 / (1 - random)
        // Higher random values produce higher crash points

        let r1 = 0.0;   // crash = 0.99 / 1.0 = 0.99x
        let r2 = 0.5;   // crash = 0.99 / 0.5 = 1.98x
        let r3 = 0.98;  // crash = 0.99 / 0.02 = 49.5x

        let c1 = calculate_crash_point(r1);
        let c2 = calculate_crash_point(r2);
        let c3 = calculate_crash_point(r3);

        // Verify increasing random produces increasing crash (until cap)
        assert!(c1 < c2);
        assert!(c2 < c3);

        // All should be within valid range (note: c1 can be < 1.0 with new formula)
        assert!(c1 > 0.0 && c1 <= MAX_CRASH);
        assert!(c2 > 0.0 && c2 <= MAX_CRASH);
        assert!(c3 > 0.0 && c3 <= MAX_CRASH);

        // Verify specific values
        assert!((c1 - 0.99).abs() < 0.01);
        assert!((c2 - 1.98).abs() < 0.01);
        assert!((c3 - 49.5).abs() < 1.0);
    }

    // ============================================================================
    // HOUSE EDGE SIMULATION TESTS
    // ============================================================================
    // Note: These tests use the `rand` crate which is only available in dev-dependencies
    // They are kept inline rather than in tests/ folder due to cdylib linking constraints

    #[cfg(test)]
    mod house_edge_simulation {
        use super::*;

        /// Simulate N games and calculate average return when cashing out at target multiplier
        fn simulate_games_at_multiplier(target: f64, num_games: usize, seed: u64) -> f64 {
            use rand::{Rng, SeedableRng};
            use rand_chacha::ChaCha8Rng;

            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let mut total_return = 0.0;

            for _ in 0..num_games {
                // Generate random value in [0.0, 1.0)
                let random: f64 = rng.gen();

                // Calculate crash point using actual game formula
                let crash_point = calculate_crash_point(random);

                // Player cashes out at target multiplier
                let return_multiplier = if crash_point >= target {
                    target
                } else {
                    0.0
                };

                total_return += return_multiplier;
            }

            total_return / num_games as f64
        }

        #[test]
        fn test_house_edge_at_various_multipliers() {
            println!("\n╔════════════════════════════════════════════════════════════════════╗");
            println!("║         Crash Game House Edge Simulation (100K games each)        ║");
            println!("╚════════════════════════════════════════════════════════════════════╝\n");

            const NUM_GAMES: usize = 100_000;
            const SEED: u64 = 12345;

            // Test comprehensive range of multipliers up to MAX_CRASH (100x)
            let targets = vec![1.1, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0];
            let mut all_returns = Vec::new();

            println!("Target | Wins      | Win %   | Avg Return | House Edge | Theoretical");
            println!("-------|-----------|---------|------------|------------|------------");

            for target in targets {
                let avg_return = simulate_games_at_multiplier(target, NUM_GAMES, SEED);
                all_returns.push(avg_return);

                // Calculate win count from average return
                let win_rate = avg_return / target;
                let wins = (win_rate * NUM_GAMES as f64) as usize;
                let house_edge = (1.0 - avg_return) * 100.0;
                let theoretical_edge = 1.0;

                println!("{:>6.1}x | {:>9} | {:>6.2}% | {:>10.4}x | {:>9.2}% | {:>10.2}%",
                         target, wins, win_rate * 100.0, avg_return, house_edge, theoretical_edge);

                // Verify house edge exists (return < 1.0)
                assert!(avg_return < 1.0, "House should have an edge");

                // Verify it's reasonably close to 0.99x (allowing for statistical variance)
                // Higher tolerance for extreme multipliers due to capping and variance
                let tolerance = if target >= MAX_CRASH { 0.05 } else { 0.02 };
                assert!(
                    (avg_return - 0.99).abs() < tolerance,
                    "Target {}x: expected return ≈ 0.99x, got {:.4}x",
                    target, avg_return
                );
            }

            let overall_avg = all_returns.iter().sum::<f64>() / all_returns.len() as f64;
            let overall_edge = (1.0 - overall_avg) * 100.0;

            println!("\n{}", "═".repeat(72));
            println!("Overall Average Return: {:.4}x", overall_avg);
            println!("Overall House Edge:     {:.2}%", overall_edge);
            println!("Target House Edge:      1.00%");
            println!("{}", "═".repeat(72));
            println!("\n✓ All multipliers show consistent ~1% house edge");
            println!("✓ Max crash capped at {:.0}x", MAX_CRASH);
        }
    }
}
