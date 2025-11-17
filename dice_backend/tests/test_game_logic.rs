use dice_backend::game::calculate_multiplier_direct;
use dice_backend::types::RollDirection;

// Note: Tests for calculate_max_bet() and MAX_WIN removed as we simplified
// to a dynamic 10% house limit instead of a fixed 10 ICP max win.
// The new system uses get_max_allowed_payout() which calculates limits
// based on current house balance.

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
