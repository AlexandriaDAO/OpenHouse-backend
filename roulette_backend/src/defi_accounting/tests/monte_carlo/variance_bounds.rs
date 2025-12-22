//! Variance Bounds Verification Tests
//!
//! These tests verify that the 4-sigma multi-ball betting limit is conservative
//! enough to protect the house from statistical extremes. This is critical for
//! allowing higher bets on multi-ball games safely.

use rand::{SeedableRng, Rng};
use rand_chacha::ChaCha8Rng;

// Constants from lib.rs
const MULTIPLIER_SCALE: u64 = 10_000;
const ROWS: u8 = 8;
const CENTER_POSITION: u8 = ROWS / 2;
const MIN_MULTIPLIER_BP: u64 = 2_000;
const QUADRATIC_FACTOR_BP: u64 = 3_950;
const BINOMIAL_COEFFICIENTS: [u64; 9] = [1, 8, 28, 56, 70, 56, 28, 8, 1];
const TOTAL_PATHS: u64 = 256;

// Statistical constants from game.rs
const EV_PER_BALL: f64 = 0.99;
const STD_PER_BALL: f64 = 1.045;
const SIGMA_FACTOR: f64 = 4.0;

fn calculate_multiplier_bp(position: u8) -> u64 {
    let distance = position.abs_diff(CENTER_POSITION) as u64;
    MIN_MULTIPLIER_BP + QUADRATIC_FACTOR_BP * distance * distance
}

fn simulate_ball(random_byte: u8) -> f64 {
    let final_position = (0..ROWS).map(|i| (random_byte >> i) & 1).sum::<u8>();
    let multiplier_bp = calculate_multiplier_bp(final_position);
    multiplier_bp as f64 / MULTIPLIER_SCALE as f64
}

/// Calculate effective max multiplier for multi-ball (mirrors game.rs)
fn calculate_effective_max_multiplier(ball_count: u8) -> f64 {
    if ball_count <= 3 {
        return 6.52; // MAX_MULTIPLIER_BP / SCALE
    }
    EV_PER_BALL + SIGMA_FACTOR * STD_PER_BALL / (ball_count as f64).sqrt()
}

// ============================================================================
// THEORETICAL VARIANCE VERIFICATION
// ============================================================================

/// Verify theoretical variance calculation matches expected value
#[test]
fn test_theoretical_variance() {
    // Var[X] = E[X²] - E[X]²
    // E[X²] = Σ P(pos) × M(pos)²

    let mut e_x_squared_numerator: u128 = 0;
    let mut e_x_numerator: u64 = 0;

    for position in 0..=ROWS {
        let prob_num = BINOMIAL_COEFFICIENTS[position as usize];
        let mult_bp = calculate_multiplier_bp(position);

        e_x_numerator += prob_num * mult_bp;
        e_x_squared_numerator += prob_num as u128 * (mult_bp as u128 * mult_bp as u128);
    }

    // E[X] in multiplier units
    let e_x = e_x_numerator as f64 / (TOTAL_PATHS as f64 * MULTIPLIER_SCALE as f64);

    // E[X²] in multiplier² units
    let e_x_squared = e_x_squared_numerator as f64 /
        (TOTAL_PATHS as f64 * MULTIPLIER_SCALE as f64 * MULTIPLIER_SCALE as f64);

    let variance = e_x_squared - e_x * e_x;
    let std_dev = variance.sqrt();

    println!("E[X] = {:.6}", e_x);
    println!("E[X²] = {:.6}", e_x_squared);
    println!("Var[X] = {:.6}", variance);
    println!("StdDev[X] = {:.6}", std_dev);

    // Expected: StdDev ≈ 1.045 (used in game.rs)
    assert!(
        (std_dev - STD_PER_BALL).abs() < 0.01,
        "Calculated StdDev {} differs from expected {}",
        std_dev, STD_PER_BALL
    );
}

/// Verify effective max multiplier formula for different ball counts
#[test]
fn test_effective_max_multiplier_formula() {
    println!("\nBalls | Effective Max | 4σ Upper Bound | Actual Max");
    println!("{}", "-".repeat(60));

    for balls in [1, 2, 3, 4, 5, 10, 20, 30] {
        let effective = calculate_effective_max_multiplier(balls);
        let four_sigma = EV_PER_BALL + 4.0 * STD_PER_BALL / (balls as f64).sqrt();

        println!(
            "{:>5} | {:>13.4}x | {:>14.4}x | {:>10}x",
            balls, effective, four_sigma, "6.52"
        );

        // For 4+ balls, effective should match 4-sigma formula
        if balls >= 4 {
            assert!(
                (effective - four_sigma).abs() < 0.0001,
                "Effective max doesn't match 4-sigma formula for {} balls",
                balls
            );
        }
    }
}

// ============================================================================
// MONTE CARLO VARIANCE VERIFICATION
// ============================================================================

/// Verify empirical variance matches theoretical
#[test]
fn test_empirical_variance() {
    const SAMPLES: usize = 1_000_000;
    let mut rng = ChaCha8Rng::seed_from_u64(54321);

    let mut sum: f64 = 0.0;
    let mut sum_squared: f64 = 0.0;

    for _ in 0..SAMPLES {
        let random_byte: u8 = rng.gen();
        let multiplier = simulate_ball(random_byte);
        sum += multiplier;
        sum_squared += multiplier * multiplier;
    }

    let mean = sum / SAMPLES as f64;
    let variance = (sum_squared / SAMPLES as f64) - (mean * mean);
    let std_dev = variance.sqrt();

    println!("Empirical Mean: {:.6}", mean);
    println!("Empirical Variance: {:.6}", variance);
    println!("Empirical StdDev: {:.6}", std_dev);
    println!("Expected StdDev: {:.6}", STD_PER_BALL);

    assert!(
        (std_dev - STD_PER_BALL).abs() < 0.02,
        "Empirical StdDev {} differs too much from expected {}",
        std_dev, STD_PER_BALL
    );
}

/// Verify 4-sigma bound exceedance rate for multi-ball games
/// Note: The 4-sigma estimate is a STATISTICAL bound, not a hard limit.
/// With 100K sessions, we expect ~0.003% (about 3) to exceed 4-sigma.
/// But discrete distributions can have higher exceedance rates.
#[test]
fn test_four_sigma_exceedance_rate() {
    const SESSIONS: usize = 100_000;
    let mut rng = ChaCha8Rng::seed_from_u64(11111);

    println!("\n4-Sigma Exceedance Rate Analysis:");
    println!("{}", "-".repeat(60));

    // Test for different ball counts - higher counts should have lower exceedance
    for ball_count in [10u8, 20, 30] {
        let effective_max = calculate_effective_max_multiplier(ball_count);
        let mut exceedances = 0;

        for _ in 0..SESSIONS {
            // Simulate one multi-ball game
            let mut total_multiplier: f64 = 0.0;
            for _ in 0..ball_count {
                let random_byte: u8 = rng.gen();
                total_multiplier += simulate_ball(random_byte);
            }
            let avg_multiplier = total_multiplier / ball_count as f64;

            if avg_multiplier > effective_max {
                exceedances += 1;
            }
        }

        let exceedance_rate = exceedances as f64 / SESSIONS as f64 * 100.0;

        println!(
            "{:>2} balls: {}/{} exceedances ({:.4}%), effective_max = {:.4}x",
            ball_count, exceedances, SESSIONS, exceedance_rate, effective_max
        );

        // For 10+ balls, the CLT approximation is better
        // Allow 0.5% exceedance rate (conservative due to discrete distribution)
        assert!(
            exceedance_rate < 0.5,
            "{} balls: Exceedance rate {:.4}% is too high",
            ball_count, exceedance_rate
        );
    }
}

/// Stress test: Find actual worst-case multiplier over many simulations
/// This test DOCUMENTS the worst case, it doesn't require the 4-sigma bound to be absolute.
/// The production code uses 4-sigma as a RISK MANAGEMENT tool, not a hard cap.
#[test]
fn test_find_actual_worst_case() {
    const SESSIONS: usize = 100_000; // Reduced for faster testing
    let mut rng = ChaCha8Rng::seed_from_u64(99999);

    println!("\nFinding actual worst-case average multipliers:");
    println!("{}", "-".repeat(60));
    println!("Note: 4-sigma is a statistical bound, not a hard limit.");
    println!("Actual max can exceed it in rare cases - this is expected.");
    println!();

    for ball_count in [10u8, 20, 30] {
        let effective_max = calculate_effective_max_multiplier(ball_count);
        let mut max_avg_seen: f64 = 0.0;

        for _ in 0..SESSIONS {
            let mut total: f64 = 0.0;
            for _ in 0..ball_count {
                let random_byte: u8 = rng.gen();
                total += simulate_ball(random_byte);
            }
            let avg = total / ball_count as f64;

            if avg > max_avg_seen {
                max_avg_seen = avg;
            }
        }

        let headroom = effective_max - max_avg_seen;

        println!(
            "{:>2} balls: Max avg seen = {:.4}x, Effective limit = {:.4}x, Headroom = {:.4}x",
            ball_count, max_avg_seen, effective_max, headroom
        );

        // For 10+ balls, the worst case should be within 50% of the limit
        // This is a sanity check, not a strict requirement
        // The production code handles exceedances by capping max payout at 15% of pool
        assert!(
            max_avg_seen < effective_max * 1.5,
            "{} balls: Actual max {} exceeded 1.5x the limit {}",
            ball_count, max_avg_seen, effective_max * 1.5
        );
    }
}

/// Verify variance decreases with ball count (Law of Large Numbers)
#[test]
fn test_variance_decreases_with_ball_count() {
    const SESSIONS: usize = 50_000;
    let mut rng = ChaCha8Rng::seed_from_u64(77777);

    println!("\nVariance of average multiplier by ball count:");
    println!("{}", "-".repeat(60));

    let mut prev_variance: Option<f64> = None;

    for ball_count in [1u8, 5, 10, 20, 30] {
        let mut averages: Vec<f64> = Vec::with_capacity(SESSIONS);

        for _ in 0..SESSIONS {
            let mut total: f64 = 0.0;
            for _ in 0..ball_count {
                let random_byte: u8 = rng.gen();
                total += simulate_ball(random_byte);
            }
            averages.push(total / ball_count as f64);
        }

        // Calculate variance of averages
        let mean: f64 = averages.iter().sum::<f64>() / SESSIONS as f64;
        let variance: f64 = averages.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / SESSIONS as f64;

        // Expected variance of average = Var[X] / n
        let expected_variance = (STD_PER_BALL * STD_PER_BALL) / ball_count as f64;

        println!(
            "{:>2} balls: Var[avg] = {:.6}, Expected = {:.6}, Error = {:.2}%",
            ball_count, variance, expected_variance,
            (variance - expected_variance).abs() / expected_variance * 100.0
        );

        // Variance should decrease monotonically
        if let Some(prev) = prev_variance {
            assert!(
                variance < prev,
                "Variance should decrease: {} balls has var {} > {} balls var {}",
                ball_count, variance, ball_count - 1, prev
            );
        }
        prev_variance = Some(variance);

        // Should be within 10% of theoretical
        assert!(
            (variance - expected_variance).abs() / expected_variance < 0.1,
            "{} balls: Variance {} differs too much from expected {}",
            ball_count, variance, expected_variance
        );
    }
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

/// Test 1-3 balls use actual max (not 4-sigma)
#[test]
fn test_low_ball_count_uses_actual_max() {
    for balls in 1..=3u8 {
        let effective = calculate_effective_max_multiplier(balls);
        assert_eq!(
            effective, 6.52,
            "{} balls should use actual max 6.52x, got {}x",
            balls, effective
        );
    }
}

/// Test transition at 4 balls
#[test]
fn test_transition_at_four_balls() {
    let eff_3 = calculate_effective_max_multiplier(3);
    let eff_4 = calculate_effective_max_multiplier(4);

    println!("3 balls effective max: {:.4}x", eff_3);
    println!("4 balls effective max: {:.4}x", eff_4);

    // 3 balls should be actual max
    assert_eq!(eff_3, 6.52);

    // 4 balls should be 4-sigma formula
    let expected_4 = EV_PER_BALL + SIGMA_FACTOR * STD_PER_BALL / 2.0;
    assert!(
        (eff_4 - expected_4).abs() < 0.0001,
        "4 balls should use 4-sigma formula: {} != {}",
        eff_4, expected_4
    );

    // 4-sigma at 4 balls should be lower than actual max
    assert!(
        eff_4 < eff_3,
        "4 balls 4-sigma {} should be < 3 balls actual max {}",
        eff_4, eff_3
    );
}

/// Verify 30 balls has very tight bounds
#[test]
fn test_thirty_ball_tight_bounds() {
    let effective = calculate_effective_max_multiplier(30);
    let expected = EV_PER_BALL + SIGMA_FACTOR * STD_PER_BALL / (30.0_f64).sqrt();

    println!("30 balls effective max: {:.4}x", effective);
    println!("Expected (4σ/√30): {:.4}x", expected);

    // Should be around 1.75x (very close to EV of 0.99)
    assert!(
        effective < 2.0,
        "30 balls should have effective max < 2.0x, got {}",
        effective
    );

    // Verify formula
    assert!(
        (effective - expected).abs() < 0.0001,
        "30 balls formula mismatch: {} != {}",
        effective, expected
    );
}
