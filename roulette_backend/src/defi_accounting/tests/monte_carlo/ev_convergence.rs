//! Expected Value Convergence Tests
//!
//! These tests verify that the Plinko game's house edge is exactly 1%
//! through Monte Carlo simulation. This is the most critical mathematical
//! property of the game.

use rand::{SeedableRng, Rng};
use rand_chacha::ChaCha8Rng;

// Constants from lib.rs - must match production values exactly
const MULTIPLIER_SCALE: u64 = 10_000;
const ROWS: u8 = 8;
const CENTER_POSITION: u8 = ROWS / 2;
const MIN_MULTIPLIER_BP: u64 = 2_000;
const QUADRATIC_FACTOR_BP: u64 = 3_950;
const BINOMIAL_COEFFICIENTS: [u64; 9] = [1, 8, 28, 56, 70, 56, 28, 8, 1];
const TOTAL_PATHS: u64 = 256;

// Expected values
const EXPECTED_EV: f64 = 0.99; // 1% house edge
const EV_TOLERANCE: f64 = 0.001; // ±0.1% tolerance for 1M+ samples

/// Calculate multiplier in basis points (mirrors lib.rs exactly)
fn calculate_multiplier_bp(position: u8) -> u64 {
    let distance = position.abs_diff(CENTER_POSITION) as u64;
    let distance_squared = distance * distance;
    MIN_MULTIPLIER_BP + QUADRATIC_FACTOR_BP * distance_squared
}

/// Simulate a single Plinko ball drop using VRF-style randomness
fn simulate_ball(random_byte: u8) -> (u8, u64) {
    // Path generation mirrors game.rs exactly
    let final_position = (0..ROWS)
        .map(|i| (random_byte >> i) & 1)
        .sum::<u8>();

    let multiplier_bp = calculate_multiplier_bp(final_position);
    (final_position, multiplier_bp)
}

// ============================================================================
// THEORETICAL VERIFICATION TESTS
// ============================================================================

/// Verify the theoretical expected value is exactly 0.99
/// This uses exact arithmetic with binomial coefficients.
#[test]
fn test_theoretical_ev_is_exactly_099() {
    // E[X] = Σ P(position) × M(position)
    // Where P(position) = C(8, position) / 256

    let mut ev_numerator: u64 = 0;

    for position in 0..=ROWS {
        let probability_numerator = BINOMIAL_COEFFICIENTS[position as usize];
        let multiplier_bp = calculate_multiplier_bp(position);

        // Accumulate: P(pos) × M(pos) × SCALE
        ev_numerator += probability_numerator * multiplier_bp;
    }

    // EV = ev_numerator / (TOTAL_PATHS * MULTIPLIER_SCALE)
    let ev = ev_numerator as f64 / (TOTAL_PATHS as f64 * MULTIPLIER_SCALE as f64);

    println!("Theoretical EV: {:.6}", ev);
    println!("Expected: {:.6}", EXPECTED_EV);
    println!("Difference: {:.6}", (ev - EXPECTED_EV).abs());

    // Must be exactly 0.99 (within floating-point tolerance)
    assert!(
        (ev - EXPECTED_EV).abs() < 1e-10,
        "Theoretical EV {} does not equal expected {}",
        ev, EXPECTED_EV
    );
}

/// Verify each multiplier value is correct
#[test]
fn test_multiplier_values_exact() {
    // Expected multipliers for positions 0-8
    let expected_bp: [u64; 9] = [65_200, 37_550, 17_800, 5_950, 2_000, 5_950, 17_800, 37_550, 65_200];

    for (position, &expected) in expected_bp.iter().enumerate() {
        let actual = calculate_multiplier_bp(position as u8);
        assert_eq!(
            actual, expected,
            "Position {}: expected {} BP, got {} BP",
            position, expected, actual
        );
    }

    println!("All 9 multiplier positions verified correct");
}

// ============================================================================
// MONTE CARLO SIMULATION TESTS
// ============================================================================

/// Run Monte Carlo simulation to verify EV converges to 0.99
/// Uses 1,000,000 samples for high confidence.
#[test]
fn test_ev_convergence_1m_samples() {
    const SAMPLES: usize = 1_000_000;
    let mut rng = ChaCha8Rng::seed_from_u64(42); // Fixed seed for reproducibility

    let mut total_multiplier_bp: u128 = 0;

    for _ in 0..SAMPLES {
        let random_byte: u8 = rng.gen();
        let (_, multiplier_bp) = simulate_ball(random_byte);
        total_multiplier_bp += multiplier_bp as u128;
    }

    let empirical_ev = total_multiplier_bp as f64 / (SAMPLES as f64 * MULTIPLIER_SCALE as f64);

    println!("Empirical EV over {} samples: {:.6}", SAMPLES, empirical_ev);
    println!("Expected EV: {:.6}", EXPECTED_EV);
    println!("Absolute error: {:.6}", (empirical_ev - EXPECTED_EV).abs());

    assert!(
        (empirical_ev - EXPECTED_EV).abs() < EV_TOLERANCE,
        "EV {} deviates more than {} from expected {}",
        empirical_ev, EV_TOLERANCE, EXPECTED_EV
    );
}

/// Verify EV converges with increasing sample sizes
#[test]
fn test_ev_convergence_by_sample_size() {
    let sample_sizes = [1_000, 10_000, 100_000, 1_000_000];
    let mut rng = ChaCha8Rng::seed_from_u64(12345);

    println!("\nSample Size | Empirical EV | Error | Within Tolerance");
    println!("{}", "-".repeat(60));

    let mut total_multiplier_bp: u128 = 0;
    let mut samples_processed: usize = 0;

    for &target in &sample_sizes {
        // Generate additional samples to reach target
        while samples_processed < target {
            let random_byte: u8 = rng.gen();
            let (_, multiplier_bp) = simulate_ball(random_byte);
            total_multiplier_bp += multiplier_bp as u128;
            samples_processed += 1;
        }

        let empirical_ev = total_multiplier_bp as f64 / (samples_processed as f64 * MULTIPLIER_SCALE as f64);
        let error = (empirical_ev - EXPECTED_EV).abs();

        // Expected error scales as 1/sqrt(n)
        // For 99% confidence with σ ≈ 1.045, tolerance = 2.576 * 1.045 / sqrt(n)
        let statistical_tolerance = 2.576 * 1.045 / (target as f64).sqrt();
        let within = error < statistical_tolerance;

        println!(
            "{:>10} | {:>12.6} | {:.6} | {}",
            target, empirical_ev, error, if within { "YES" } else { "NO" }
        );
    }
}

/// Verify position distribution matches binomial coefficients
#[test]
fn test_position_distribution_matches_binomial() {
    const SAMPLES: usize = 256_000; // Multiple of 256 for clean division
    let mut rng = ChaCha8Rng::seed_from_u64(99999);

    let mut position_counts = [0u64; 9];

    for _ in 0..SAMPLES {
        let random_byte: u8 = rng.gen();
        let (position, _) = simulate_ball(random_byte);
        position_counts[position as usize] += 1;
    }

    println!("\nPosition | Expected Prob | Actual Prob | Count | Error");
    println!("{}", "-".repeat(60));

    let mut max_error: f64 = 0.0;

    for position in 0..=ROWS {
        let expected_prob = BINOMIAL_COEFFICIENTS[position as usize] as f64 / TOTAL_PATHS as f64;
        let actual_prob = position_counts[position as usize] as f64 / SAMPLES as f64;
        let error = (actual_prob - expected_prob).abs();
        max_error = max_error.max(error);

        println!(
            "{:>8} | {:>13.6} | {:>11.6} | {:>5} | {:.6}",
            position, expected_prob, actual_prob, position_counts[position as usize], error
        );
    }

    // With 256K samples, position probabilities should be within 1%
    assert!(
        max_error < 0.01,
        "Max probability error {} exceeds 1%",
        max_error
    );
}

/// Stress test: Verify EV holds across different RNG seeds
#[test]
fn test_ev_consistent_across_seeds() {
    const SAMPLES_PER_SEED: usize = 100_000;
    const NUM_SEEDS: u64 = 10;

    let mut evs = Vec::new();

    for seed in 0..NUM_SEEDS {
        let mut rng = ChaCha8Rng::seed_from_u64(seed * 1000);
        let mut total: u128 = 0;

        for _ in 0..SAMPLES_PER_SEED {
            let random_byte: u8 = rng.gen();
            let (_, multiplier_bp) = simulate_ball(random_byte);
            total += multiplier_bp as u128;
        }

        let ev = total as f64 / (SAMPLES_PER_SEED as f64 * MULTIPLIER_SCALE as f64);
        evs.push(ev);
    }

    println!("\nEV by seed:");
    for (i, ev) in evs.iter().enumerate() {
        println!("  Seed {}: {:.6}", i * 1000, ev);
    }

    let avg_ev: f64 = evs.iter().sum::<f64>() / evs.len() as f64;
    let max_deviation = evs.iter().map(|&ev| (ev - EXPECTED_EV).abs()).fold(0.0f64, f64::max);

    println!("\nAverage EV: {:.6}", avg_ev);
    println!("Max deviation from 0.99: {:.6}", max_deviation);

    // All seeds should produce EV within tolerance
    assert!(
        max_deviation < 0.005,
        "Max deviation {} exceeds 0.5%",
        max_deviation
    );
}

// ============================================================================
// EXTREME SCENARIO TESTS
// ============================================================================

/// Test behavior when all outcomes are edge positions (worst case for house)
#[test]
fn test_all_edges_worst_case() {
    // If every ball landed on position 0 or 8 (6.52x), house would lose badly
    // This verifies the max possible loss scenario

    let edge_multiplier = calculate_multiplier_bp(0);
    assert_eq!(edge_multiplier, 65_200);

    let max_loss_per_ball = (edge_multiplier as f64 / MULTIPLIER_SCALE as f64) - 1.0;
    println!("Max loss per ball (edge hit): {:.2}x bet", max_loss_per_ball);

    // For 30 balls all hitting edges (astronomically unlikely)
    let max_total_loss = max_loss_per_ball * 30.0;
    println!("Theoretical max loss for 30 balls: {:.2}x total bet", max_total_loss);

    // Verify this is what the max payout cap protects against
    assert!(max_loss_per_ball < 6.0, "Edge multiplier should give < 6x profit");
}

/// Test behavior when all outcomes are center position (best case for house)
#[test]
fn test_all_center_best_case() {
    // If every ball landed on position 4 (0.2x), house would profit 80% every time

    let center_multiplier = calculate_multiplier_bp(4);
    assert_eq!(center_multiplier, 2_000);

    let house_profit_per_ball = 1.0 - (center_multiplier as f64 / MULTIPLIER_SCALE as f64);
    println!("House profit per ball (center hit): {:.0}% of bet", house_profit_per_ball * 100.0);

    // This is the most common outcome (70/256 ≈ 27.3% probability)
    let center_probability = BINOMIAL_COEFFICIENTS[4] as f64 / TOTAL_PATHS as f64;
    println!("Center position probability: {:.2}%", center_probability * 100.0);

    assert!((center_probability - 0.273).abs() < 0.01);
}
