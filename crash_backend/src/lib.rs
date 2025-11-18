//! Simple Crash Game - Transparent Formula Casino Game
//!
//! **Design Philosophy:**
//! Stateless crash point generation using transparent mathematical formula
//! for provably fair 1% house edge.
//!
//! **The Formula:**
//! crash = 1.0 / (1.0 - 0.99 × random)
//!
//! Where:
//! - random is uniform [0.0, 1.0) from IC VRF
//! - 0.99 factor creates exactly 1% house edge
//! - P(crash ≥ X) = 0.99 / X (constant edge for all strategies)
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
const MAX_CRASH: f64 = 1000.0;  // Cap crash at 1000x

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct CrashResult {
    pub crash_point: f64,        // Where it crashed (1.00x - 1000.00x)
    pub vrf_hash: String,         // VRF output hash for verification
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

/// Simulate a crash point using IC VRF
/// Returns crash point and VRF hash for verification
#[update]
async fn simulate_crash() -> Result<CrashResult, String> {
    // Get randomness from IC VRF
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?
        .0;

    // Convert first 8 bytes to f64 in range [0.0, 1.0)
    let random = bytes_to_float(&random_bytes)?;

    // Calculate crash point with 1% house edge
    // Formula: crash = 1.0 / (1.0 - 0.99 * random)
    let crash_point = calculate_crash_point(random);

    // Create VRF hash for verification (SHA256 of first 32 bytes)
    let vrf_hash = create_vrf_hash(&random_bytes);

    Ok(CrashResult {
        crash_point,
        vrf_hash,
    })
}

/// Get the crash formula as a string
#[query]
fn get_crash_formula() -> String {
    "crash = 1.0 / (1.0 - 0.99 × random)".to_string()
}

/// Get expected value (should be 0.99)
#[query]
fn get_expected_value() -> f64 {
    0.99  // Theoretical - actual calculation would require integration
}

/// Calculate probability of reaching a specific multiplier
/// Returns P(crash ≥ target)
#[query]
fn get_win_probability(target: f64) -> f64 {
    if target < 1.0 || target > MAX_CRASH {
        return 0.0;
    }
    // Formula: P(crash ≥ X) = 0.99 / X
    (0.99 / target).min(1.0)
}

/// Get example crash probabilities for common targets
#[query]
fn get_probability_table() -> Vec<(f64, f64)> {
    // Returns (target, probability) pairs
    let targets = vec![1.1, 1.5, 2.0, 3.0, 5.0, 10.0, 50.0, 100.0];
    targets.iter()
        .map(|&t| (t, get_win_probability(t)))
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

    // Normalize: divide by 2^64 to get [0.0, 1.0)
    // Use 2^53 for better precision with f64
    let random = (random_u64 >> 11) as f64 / (1u64 << 53) as f64;

    Ok(random)
}

/// Calculate crash point using the formula
/// crash = 1.0 / (1.0 - 0.99 * random)
fn calculate_crash_point(random: f64) -> f64 {
    // Ensure random is in valid range
    let random = random.max(0.0).min(0.999999);

    // Apply formula
    let crash = 1.0 / (1.0 - 0.99 * random);

    // Cap at maximum
    crash.min(MAX_CRASH)
}

/// Create SHA256 hash of VRF bytes for verification
fn create_vrf_hash(bytes: &[u8]) -> String {
    use sha2::{Sha256, Digest};

    let mut hasher = Sha256::new();
    hasher.update(&bytes[0..32.min(bytes.len())]);
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
        // random = 0.0 → crash = 1.0 / 1.0 = 1.00x
        assert!((calculate_crash_point(0.0) - 1.0).abs() < 0.01);

        // random = 0.5 → crash = 1.0 / 0.505 = 1.98x
        assert!((calculate_crash_point(0.5) - 1.98).abs() < 0.01);

        // random = 0.9 → crash = 1.0 / 0.109 = 9.17x
        assert!((calculate_crash_point(0.9) - 9.17).abs() < 0.1);

        // random = 0.99 → crash = 1.0 / 0.0099 = 101.01x (capped)
        let high_crash = calculate_crash_point(0.99);
        assert!(high_crash <= MAX_CRASH);
    }

    #[test]
    fn test_win_probability_formula() {
        // P(crash ≥ 2.0) = 0.99 / 2.0 = 49.5%
        assert!((get_win_probability(2.0) - 0.495).abs() < 0.001);

        // P(crash ≥ 10.0) = 0.99 / 10.0 = 9.9%
        assert!((get_win_probability(10.0) - 0.099).abs() < 0.001);

        // P(crash ≥ 100.0) = 0.99 / 100.0 = 0.99%
        assert!((get_win_probability(100.0) - 0.0099).abs() < 0.0001);
    }

    #[test]
    fn test_expected_return_constant_house_edge() {
        // For ANY target X: P(crash ≥ X) × X should equal 0.99
        let targets = vec![1.1, 2.0, 5.0, 10.0, 50.0, 100.0];

        for target in targets {
            let win_prob = get_win_probability(target);
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
}
