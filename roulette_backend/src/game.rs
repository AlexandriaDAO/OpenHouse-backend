// European Roulette Game Logic

use crate::types::*;
use crate::board::*;
use ic_cdk::management_canister::raw_rand;
use sha2::{Sha256, Digest};

const MAX_BETS_PER_SPIN: usize = 20;

/// Execute a spin with the given bets
pub async fn spin(bets: Vec<Bet>) -> Result<SpinResult, String> {
    // 1. Validate inputs
    if bets.is_empty() {
        return Err("No bets placed".to_string());
    }
    if bets.len() > MAX_BETS_PER_SPIN {
        return Err(format!("Maximum {} bets per spin", MAX_BETS_PER_SPIN));
    }

    // 2. Validate each bet
    for bet in &bets {
        validate_bet(bet)?;
    }

    // 3. Get VRF randomness from IC
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness failed: {:?}", e))?;

    // 4. Generate randomness hash for verification
    let mut hasher = Sha256::new();
    hasher.update(&random_bytes);
    let hash = hasher.finalize();
    let randomness_hash = hex::encode(hash);

    // 5. Convert to winning number (0-36)
    let winning_number = bytes_to_number(&random_bytes);
    let color = get_color(winning_number);

    // 6. Evaluate each bet
    let bet_results: Vec<BetResult> = bets.iter()
        .map(|bet| evaluate_bet(bet, winning_number))
        .collect();

    // 7. Calculate totals
    let total_bet: u64 = bets.iter().map(|b| b.amount).sum();
    let total_payout: u64 = bet_results.iter().map(|r| r.payout).sum();
    let net_result = total_payout as i64 - total_bet as i64;

    Ok(SpinResult {
        winning_number,
        color,
        bets: bet_results,
        total_bet,
        total_payout,
        net_result,
        randomness_hash,
    })
}

/// Validate a single bet
fn validate_bet(bet: &Bet) -> Result<(), String> {
    if bet.amount == 0 {
        return Err("Bet amount must be > 0".to_string());
    }

    match &bet.bet_type {
        BetType::Straight(n) => {
            if *n > 36 {
                return Err(format!("Invalid number: {} (must be 0-36)", n));
            }
        }
        BetType::Split(a, b) => {
            if *a > 36 || *b > 36 {
                return Err("Split numbers must be 0-36".to_string());
            }
            if !is_valid_split(*a, *b) {
                return Err(format!("Invalid split: {} and {} are not adjacent", a, b));
            }
        }
        BetType::Street(start) => {
            if !is_valid_street(*start) {
                return Err(format!("Invalid street start: {} (must be 1,4,7,...,34)", start));
            }
        }
        BetType::Corner(top_left) => {
            if !is_valid_corner(*top_left) {
                return Err(format!("Invalid corner: {}", top_left));
            }
        }
        BetType::SixLine(start) => {
            if !is_valid_six_line(*start) {
                return Err(format!("Invalid six line start: {} (must be 1,4,7,...,31)", start));
            }
        }
        BetType::Column(col) => {
            if *col < 1 || *col > 3 {
                return Err(format!("Invalid column: {} (must be 1-3)", col));
            }
        }
        BetType::Dozen(dozen) => {
            if *dozen < 1 || *dozen > 3 {
                return Err(format!("Invalid dozen: {} (must be 1-3)", dozen));
            }
        }
        // Red, Black, Even, Odd, Low, High - always valid
        BetType::Red | BetType::Black | BetType::Even |
        BetType::Odd | BetType::Low | BetType::High => {}
    }

    Ok(())
}

/// Convert random bytes to a number 0-36
/// Uses first 8 bytes as u64, mod 37 for fair distribution
/// Bias is negligible: 37 divides into 2^64 almost evenly
fn bytes_to_number(bytes: &[u8]) -> u8 {
    let val = u64::from_be_bytes(bytes[0..8].try_into().unwrap());
    (val % 37) as u8
}

/// Evaluate a bet against the winning number
fn evaluate_bet(bet: &Bet, winning: u8) -> BetResult {
    let (won, multiplier) = match &bet.bet_type {
        BetType::Straight(n) => (*n == winning, 35u64),
        BetType::Split(a, b) => (*a == winning || *b == winning, 17),
        BetType::Street(start) => {
            let nums = get_street_numbers(*start);
            (nums.contains(&winning), 11)
        }
        BetType::Corner(top_left) => {
            let nums = get_corner_numbers(*top_left);
            (nums.contains(&winning), 8)
        }
        BetType::SixLine(start) => {
            let nums = get_six_line_numbers(*start);
            (nums.contains(&winning), 5)
        }
        BetType::Column(col) => (get_column(winning) == Some(*col), 2),
        BetType::Dozen(dozen) => (get_dozen(winning) == Some(*dozen), 2),
        BetType::Red => (get_color(winning) == Color::Red, 1),
        BetType::Black => (get_color(winning) == Color::Black, 1),
        BetType::Even => (winning != 0 && winning.is_multiple_of(2), 1),
        BetType::Odd => (winning != 0 && !winning.is_multiple_of(2), 1),
        BetType::Low => ((1..=18).contains(&winning), 1),
        BetType::High => ((19..=36).contains(&winning), 1),
    };

    // Payout includes original bet back (e.g., 35:1 means bet + 35*bet)
    // Use saturating arithmetic to prevent overflow on large bets
    let payout = if won {
        bet.amount.saturating_add(bet.amount.saturating_mul(multiplier))
    } else {
        0
    };

    BetResult {
        bet_type: bet.bet_type.clone(),
        amount: bet.amount,
        won,
        payout,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_straight() {
        let bet = Bet { bet_type: BetType::Straight(17), amount: 100 };
        assert!(validate_bet(&bet).is_ok());

        let invalid = Bet { bet_type: BetType::Straight(37), amount: 100 };
        assert!(validate_bet(&invalid).is_err());

        let zero_amount = Bet { bet_type: BetType::Straight(0), amount: 0 };
        assert!(validate_bet(&zero_amount).is_err());
    }

    #[test]
    fn test_validate_split() {
        // Valid splits
        let bet = Bet { bet_type: BetType::Split(1, 2), amount: 100 };
        assert!(validate_bet(&bet).is_ok());

        let bet = Bet { bet_type: BetType::Split(1, 4), amount: 100 };
        assert!(validate_bet(&bet).is_ok());

        // Invalid split
        let invalid = Bet { bet_type: BetType::Split(1, 5), amount: 100 };
        assert!(validate_bet(&invalid).is_err());
    }

    #[test]
    fn test_validate_street() {
        let bet = Bet { bet_type: BetType::Street(1), amount: 100 };
        assert!(validate_bet(&bet).is_ok());

        let invalid = Bet { bet_type: BetType::Street(2), amount: 100 };
        assert!(validate_bet(&invalid).is_err());
    }

    #[test]
    fn test_validate_column_dozen() {
        let col = Bet { bet_type: BetType::Column(1), amount: 100 };
        assert!(validate_bet(&col).is_ok());

        let invalid_col = Bet { bet_type: BetType::Column(4), amount: 100 };
        assert!(validate_bet(&invalid_col).is_err());

        let dozen = Bet { bet_type: BetType::Dozen(3), amount: 100 };
        assert!(validate_bet(&dozen).is_ok());

        let invalid_dozen = Bet { bet_type: BetType::Dozen(0), amount: 100 };
        assert!(validate_bet(&invalid_dozen).is_err());
    }

    #[test]
    fn test_evaluate_straight_win() {
        let bet = Bet { bet_type: BetType::Straight(17), amount: 100 };
        let result = evaluate_bet(&bet, 17);
        assert!(result.won);
        assert_eq!(result.payout, 3600); // 100 + 100*35
    }

    #[test]
    fn test_evaluate_straight_lose() {
        let bet = Bet { bet_type: BetType::Straight(17), amount: 100 };
        let result = evaluate_bet(&bet, 18);
        assert!(!result.won);
        assert_eq!(result.payout, 0);
    }

    #[test]
    fn test_evaluate_red() {
        let bet = Bet { bet_type: BetType::Red, amount: 100 };

        // Red wins on red numbers
        let result = evaluate_bet(&bet, 1); // 1 is red
        assert!(result.won);
        assert_eq!(result.payout, 200); // 100 + 100*1

        // Red loses on black
        let result = evaluate_bet(&bet, 2); // 2 is black
        assert!(!result.won);
        assert_eq!(result.payout, 0);

        // Red loses on 0 (green)
        let result = evaluate_bet(&bet, 0);
        assert!(!result.won);
        assert_eq!(result.payout, 0);
    }

    #[test]
    fn test_evaluate_even_odd() {
        let even_bet = Bet { bet_type: BetType::Even, amount: 100 };
        let odd_bet = Bet { bet_type: BetType::Odd, amount: 100 };

        // Even wins on 2
        assert!(evaluate_bet(&even_bet, 2).won);
        assert!(!evaluate_bet(&odd_bet, 2).won);

        // Odd wins on 3
        assert!(!evaluate_bet(&even_bet, 3).won);
        assert!(evaluate_bet(&odd_bet, 3).won);

        // Both lose on 0
        assert!(!evaluate_bet(&even_bet, 0).won);
        assert!(!evaluate_bet(&odd_bet, 0).won);
    }

    #[test]
    fn test_evaluate_low_high() {
        let low_bet = Bet { bet_type: BetType::Low, amount: 100 };
        let high_bet = Bet { bet_type: BetType::High, amount: 100 };

        // Low wins on 1-18
        assert!(evaluate_bet(&low_bet, 1).won);
        assert!(evaluate_bet(&low_bet, 18).won);
        assert!(!evaluate_bet(&low_bet, 19).won);

        // High wins on 19-36
        assert!(!evaluate_bet(&high_bet, 18).won);
        assert!(evaluate_bet(&high_bet, 19).won);
        assert!(evaluate_bet(&high_bet, 36).won);

        // Both lose on 0
        assert!(!evaluate_bet(&low_bet, 0).won);
        assert!(!evaluate_bet(&high_bet, 0).won);
    }

    #[test]
    fn test_bytes_to_number() {
        // Test with known bytes
        let bytes = [0u8; 32];
        assert_eq!(bytes_to_number(&bytes), 0);

        let bytes = [0, 0, 0, 0, 0, 0, 0, 37, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(bytes_to_number(&bytes), 0); // 37 % 37 = 0

        let bytes = [0, 0, 0, 0, 0, 0, 0, 36, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(bytes_to_number(&bytes), 36);
    }
}
