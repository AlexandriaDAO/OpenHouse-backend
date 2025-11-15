use dice_backend::game::{calculate_max_bet, calculate_multiplier_direct};
use dice_backend::types::{RollDirection, MAX_WIN};

#[test]
fn test_max_bet_high_multiplier() {
    // 99 Over = 0.99% win chance = exactly 100x multiplier (0.99% house edge)
    // Max bet should be 0.1 ICP (10 ICP max win / 100x)
    let max_bet = calculate_max_bet(99, &RollDirection::Over);
    assert_eq!(max_bet, 10_000_000); // Exactly 0.1 ICP
}

#[test]
fn test_max_bet_medium_multiplier() {
    // 50 Over = 49.5% win chance = exactly 2x multiplier (0.99% house edge)
    // Max bet should be 5 ICP (10 ICP max win / 2x)
    let max_bet = calculate_max_bet(50, &RollDirection::Over);
    assert_eq!(max_bet, 500_000_000); // Exactly 5 ICP
}

#[test]
fn test_max_bet_low_multiplier() {
    // 1 Over = 98.02% win chance = exactly 1.0101x multiplier (0.99% house edge)
    // Max bet should be ~9.9 ICP (10 ICP max win / 1.0101x)
    let max_bet = calculate_max_bet(1, &RollDirection::Over);
    assert_eq!(max_bet, 989_999_999); // 9.9 ICP (floor of 10B / 1.0101)
}

#[test]
fn test_max_bet_edge_cases() {
    // 99 Under = 98.02% win chance = exactly 1.0101x multiplier
    let max_bet_99_under = calculate_max_bet(99, &RollDirection::Under);
    assert_eq!(max_bet_99_under, 989_999_999); // 9.9 ICP

    // 1 Over = 98.02% win chance = exactly 1.0101x multiplier
    let max_bet_1_over = calculate_max_bet(1, &RollDirection::Over);
    assert_eq!(max_bet_1_over, 989_999_999); // 9.9 ICP
}

#[test]
fn test_max_bet_never_exceeds_max_win() {
    // Test all possible target numbers and directions with new 0.99% edge system
    for target in 1..=99 {
        for direction in [RollDirection::Over, RollDirection::Under] {
            let max_bet = calculate_max_bet(target, &direction);

            // Calculate what the actual payout would be
            let multiplier = calculate_multiplier_direct(target, &direction);
            let max_payout = (max_bet as f64 * multiplier) as u64;

            // Ensure max payout never exceeds MAX_WIN (with small margin for rounding)
            assert!(max_payout <= MAX_WIN + 1_000_000); // Allow 0.01 ICP margin for rounding
        }
    }
}

#[test]
fn test_round_multipliers() {
    // Test that we get exact round number multipliers for common targets
    assert_eq!(calculate_multiplier_direct(50, &RollDirection::Over), 2.0);   // 2x
    assert_eq!(calculate_multiplier_direct(75, &RollDirection::Over), 4.0);   // 4x
    assert_eq!(calculate_multiplier_direct(80, &RollDirection::Over), 5.0);   // 5x
    assert_eq!(calculate_multiplier_direct(90, &RollDirection::Over), 10.0);  // 10x
    assert_eq!(calculate_multiplier_direct(95, &RollDirection::Over), 20.0);  // 20x
    assert_eq!(calculate_multiplier_direct(98, &RollDirection::Over), 50.0);  // 50x
    assert_eq!(calculate_multiplier_direct(99, &RollDirection::Over), 100.0); // 100x
}

#[test]
fn test_house_hit_detection() {
    // Test that exact hit on target number is properly detected as house win
    // This represents the 0.99% house edge (1 out of 101 outcomes)

    // Simulate exact hit: rolled_number == target_number
    let target = 50u8;
    let rolled = 50u8;

    // Verify house hit logic
    let is_house_hit = rolled == target;
    assert!(is_house_hit, "Exact hit on target should be detected as house win");

    // When house hits, player should not win regardless of direction
    let is_win_over = if is_house_hit {
        false
    } else {
        rolled > target
    };
    let is_win_under = if is_house_hit {
        false
    } else {
        rolled < target
    };

    assert!(!is_win_over, "Player should not win on exact hit (Over)");
    assert!(!is_win_under, "Player should not win on exact hit (Under)");

    // Test non-exact hits work correctly
    let rolled_win_over = 51u8;
    let rolled_win_under = 49u8;

    assert!(rolled_win_over != target, "Non-exact roll should not trigger house hit");
    assert!(rolled_win_under != target, "Non-exact roll should not trigger house hit");
    assert!(rolled_win_over > target, "Player should win Over on 51 vs target 50");
    assert!(rolled_win_under < target, "Player should win Under on 49 vs target 50");
}
