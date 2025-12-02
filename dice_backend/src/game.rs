use crate::types::{MinimalGameResult, RollDirection, DECIMALS_PER_CKUSDT, MIN_BET, MAX_NUMBER};
use crate::seed::{generate_dice_roll_instant, maybe_schedule_seed_rotation};
use crate::defi_accounting::{self as accounting, liquidity_pool};
use candid::Principal;

// =============================================================================
// CALCULATION FUNCTIONS
// =============================================================================

// Calculate win chance and multiplier based on target and direction
pub fn calculate_win_chance(target: u8, direction: &RollDirection) -> f64 {
    match direction {
        RollDirection::Over => {
            // Win if roll > target
            // Possible winning outcomes: (target + 1) to MAX_NUMBER
            let winning_numbers = (MAX_NUMBER - target) as f64;
            winning_numbers / (MAX_NUMBER as f64 + 1.0)
        }
        RollDirection::Under => {
            // Win if roll < target
            // Possible winning outcomes: 0 to (target - 1)
            let winning_numbers = target as f64;
            winning_numbers / (MAX_NUMBER as f64 + 1.0)
        }
    }
}

// Calculate payout multiplier with 0.99% house edge
// Formula: 100 / winning_numbers gives clean round multipliers
// House edge comes from exact hit (target number) always being a loss
pub fn calculate_multiplier_direct(target: u8, direction: &RollDirection) -> f64 {
    let winning_numbers = match direction {
        RollDirection::Over => (100 - target) as f64,
        RollDirection::Under => target as f64,
    };
    // Division by zero prevented by upstream validation (target 0 for Under, 100 for Over are rejected)
    // This check is defensive programming for potential future edge cases
    if winning_numbers == 0.0 {
        return 0.0;
    }
    100.0 / winning_numbers  // Clean round numbers: 2x, 4x, 5x, 10x, 20x, 50x, 100x
}

// =============================================================================
// MAIN GAME LOGIC
// =============================================================================

// Play a game of dice
pub async fn play_dice(
    bet_amount: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String,
    caller: Principal
) -> Result<MinimalGameResult, String> {
    // Check user has sufficient internal balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount {
        let user_balance_usdt = user_balance as f64 / DECIMALS_PER_CKUSDT as f64;
        let needed_usdt = bet_amount as f64 / DECIMALS_PER_CKUSDT as f64;
        return Err(format!(
            "INSUFFICIENT_BALANCE|Your dice balance: {:.4} USDT|Bet amount: {:.4} USDT|This bet was not placed and no funds were deducted.",
            user_balance_usdt, needed_usdt
        ));
    }

    // Validate input
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet is {} USDT", MIN_BET as f64 / DECIMALS_PER_CKUSDT as f64));
    }

    // Validate target number based on direction
    match direction {
        RollDirection::Over => {
            if target_number >= MAX_NUMBER {
                return Err(format!("Target must be less than {} for Over rolls", MAX_NUMBER));
            }
            if target_number < 1 {
                return Err("Target must be at least 1 for Over rolls".to_string());
            }
        }
        RollDirection::Under => {
            if target_number == 0 {
                return Err("Target must be greater than 0 for Under rolls".to_string());
            }
            if target_number > MAX_NUMBER {
                return Err(format!("Target must be at most {} for Under rolls", MAX_NUMBER));
            }
        }
    }

    // Calculate win chance and multiplier for this specific bet
    let multiplier = calculate_multiplier_direct(target_number, &direction);

    // NEW SIMPLIFIED CHECK - 10% house limit (uses cached balance for speed)
    let max_payout = (bet_amount as f64 * multiplier) as u64;
    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("House balance not yet initialized. Please try again in a moment.".to_string());
    }
    if max_payout > max_allowed {
        return Err(format!(
            "Max payout of {} USDT exceeds house limit of {} USDT (15% of house balance)",
            max_payout as f64 / DECIMALS_PER_CKUSDT as f64,
            max_allowed as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    // Validate client seed length (DoS protection)
    if client_seed.len() > 256 {
        return Err("Client seed too long (max 256 characters)".to_string());
    }

    // Check if seed needs rotation
    maybe_schedule_seed_rotation();

    // Generate roll BEFORE deducting balance
    let (rolled_number, _nonce, _server_seed_hash) = generate_dice_roll_instant(&client_seed)?;

    // Deduct bet AFTER all validations and fallible operations pass
    let balance_after_bet = user_balance.checked_sub(bet_amount)
        .ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    // Record volume for daily statistics (game-agnostic)
    crate::defi_accounting::record_bet_volume(bet_amount);

    // Check for exact hit (house wins on exact target match - 0.99% edge)
    let is_house_hit = rolled_number == target_number;

    // Determine if player won
    let is_win = if is_house_hit {
        false  // House always wins on exact hit
    } else {
        match direction {
            RollDirection::Over => rolled_number > target_number,
            RollDirection::Under => rolled_number < target_number,
        }
    };

    let payout = if is_win {
        (bet_amount as f64 * multiplier) as u64
    } else {
        0
    };

    // Credit payout to user (0 for loss, multiplied amount for win)
    // This unified approach handles all scenarios: total loss, partial loss, push, win
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(payout)
        .ok_or("Balance overflow when adding winnings")?;
    accounting::update_balance(caller, new_balance)?;

    // Settle bet with pool using generic API
    // settle_bet handles all payout scenarios mathematically:
    // - payout > bet: pool pays profit
    // - payout < bet: pool gains difference (handles partial payouts like Plinko 0.2x)
    // - payout == bet: no pool change (push)
    if let Err(e) = liquidity_pool::settle_bet(bet_amount, payout) {
        // Pool couldn't afford payout - rollback user balance and refund bet
        let refund_balance = current_balance.checked_add(bet_amount)
            .ok_or("Balance overflow on refund")?;
        accounting::update_balance(caller, refund_balance)?;

        ic_cdk::println!("CRITICAL: Payout failure. Refunded {} to {}", bet_amount, caller);

        return Err(format!(
            "House cannot afford payout. Your bet of {} USDT has been REFUNDED. {}",
            bet_amount as f64 / DECIMALS_PER_CKUSDT as f64,
            e
        ));
    }

    Ok(MinimalGameResult {
        rolled_number,
        is_win,
        payout,
    })
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

// Calculate what the multiplier would be for given parameters (helper for UI)
pub fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
    match direction {
        RollDirection::Over => {
            if !(1..MAX_NUMBER).contains(&target_number) {
                return Err("Invalid target number for Over direction".to_string());
            }
        }
        RollDirection::Under => {
            if target_number == 0 || target_number > MAX_NUMBER {
                return Err("Invalid target number for Under direction".to_string());
            }
        }
    }

    let win_chance = calculate_win_chance(target_number, &direction);
    let multiplier = calculate_multiplier_direct(target_number, &direction);
    Ok((win_chance, multiplier))
}

// Get total active bets (for LP withdrawal solvency check)
// Currently dice game doesn't have pending bets (instant settlement)
// so we return 0. Future implementations with delayed settlement
// would track active bets here.
pub fn get_total_active_bets() -> u64 {
    0 // Instant settlement - no active bets
}
