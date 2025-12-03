use crate::types::{MinimalGameResult, MultiDiceGameResult, SingleDiceResult, RollDirection, DECIMALS_PER_CKUSDT, MIN_BET, MAX_NUMBER, MAX_DICE_COUNT};
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
    let max_payout = (bet_amount as f64 * multiplier).round() as u64;
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

    // Generate roll BEFORE deducting balance using per-game VRF
    let (rolled_number, server_seed, nonce) = crate::seed::generate_dice_roll_vrf(&client_seed).await?;
    let server_seed_hash = crate::seed::hash_server_seed(&server_seed);

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
        (bet_amount as f64 * multiplier).round() as u64
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
        server_seed,
        server_seed_hash,
        nonce,
        client_seed: client_seed.clone(),
    })
}

// =============================================================================
// MULTI-DICE GAME LOGIC
// =============================================================================

/// Play multiple dice in a single call
/// - dice_count: 1-3 dice
/// - bet_per_dice: amount to bet on each individual dice
/// - All dice share same target_number and direction
pub async fn play_multi_dice(
    dice_count: u8,
    bet_per_dice: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String,
    caller: Principal,
) -> Result<MultiDiceGameResult, String> {
    // VALIDATION
    if dice_count == 0 || dice_count > MAX_DICE_COUNT {
        return Err(format!("Dice count must be 1-{}", MAX_DICE_COUNT));
    }

    let total_bet = (dice_count as u64)
        .checked_mul(bet_per_dice)
        .ok_or("Bet calculation overflow")?;

    // Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < total_bet {
        return Err(format!(
            "INSUFFICIENT_BALANCE|Your dice balance: {:.4} USDT|Total bet: {:.4} USDT ({} dice x {:.4} USDT)",
            user_balance as f64 / DECIMALS_PER_CKUSDT as f64,
            total_bet as f64 / DECIMALS_PER_CKUSDT as f64,
            dice_count,
            bet_per_dice as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    // Validate per-dice bet
    if bet_per_dice < MIN_BET {
        return Err(format!("Minimum bet per dice is {} USDT", MIN_BET as f64 / DECIMALS_PER_CKUSDT as f64));
    }

    // Validate target number (same logic as single dice)
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

    // Calculate multiplier (same for all dice)
    let multiplier = calculate_multiplier_direct(target_number, &direction);

    // AGGREGATE MAX PAYOUT CHECK (worst case: all dice win)
    let max_payout_per_dice = (bet_per_dice as f64 * multiplier).round() as u64;
    let max_aggregate_payout = max_payout_per_dice
        .checked_mul(dice_count as u64)
        .ok_or("Max payout calculation overflow")?;

    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("House balance not yet initialized. Please try again in a moment.".to_string());
    }
    if max_aggregate_payout > max_allowed {
        return Err(format!(
            "Max potential payout of {} USDT (if all {} dice win) exceeds house limit of {} USDT (15% of house balance). Reduce bet or dice count.",
            max_aggregate_payout as f64 / DECIMALS_PER_CKUSDT as f64,
            dice_count,
            max_allowed as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    if client_seed.len() > 256 {
        return Err("Client seed too long (max 256 characters)".to_string());
    }

    // VRF GENERATION (single call for all dice)
    let (rolled_numbers, server_seed, nonce) =
        crate::seed::generate_multi_dice_roll_vrf(dice_count, &client_seed).await?;
    let server_seed_hash = crate::seed::hash_server_seed(&server_seed);

    // DEDUCT TOTAL BET
    let balance_after_bet = user_balance.checked_sub(total_bet).ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    crate::defi_accounting::record_bet_volume(total_bet);

    // PROCESS EACH DICE
    let mut dice_results = Vec::with_capacity(dice_count as usize);
    let mut total_wins: u8 = 0;
    let mut total_payout: u64 = 0;

    for rolled_number in rolled_numbers.iter().copied() {
        let is_house_hit = rolled_number == target_number;
        let is_win = if is_house_hit {
            false
        } else {
            match direction {
                RollDirection::Over => rolled_number > target_number,
                RollDirection::Under => rolled_number < target_number,
            }
        };

        let payout = if is_win {
            (bet_per_dice as f64 * multiplier).round() as u64
        } else {
            0
        };

        if is_win {
            total_wins += 1;
        }
        total_payout += payout;

        dice_results.push(SingleDiceResult {
            rolled_number,
            is_win,
            payout,
        });
    }

    // CREDIT TOTAL PAYOUT
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(total_payout).ok_or("Balance overflow")?;
    accounting::update_balance(caller, new_balance)?;

    // SETTLE WITH POOL
    if let Err(e) = liquidity_pool::settle_bet(total_bet, total_payout) {
        // Rollback on pool failure
        let refund_balance = current_balance.checked_add(total_bet).ok_or("Refund overflow")?;
        accounting::update_balance(caller, refund_balance)?;

        ic_cdk::println!("CRITICAL: Multi-dice payout failure. Refunded {} to {}", total_bet, caller);

        return Err(format!(
            "House cannot afford payout. Your bet of {} USDT has been REFUNDED. {}",
            total_bet as f64 / DECIMALS_PER_CKUSDT as f64,
            e
        ));
    }

    let net_result = (total_payout as i64) - (total_bet as i64);

    Ok(MultiDiceGameResult {
        dice_results,
        dice_count,
        total_wins,
        total_payout,
        total_bet,
        net_result,
        server_seed,
        server_seed_hash,
        nonce,
        client_seed,
    })
}

/// Calculate max bet per dice considering aggregate payout
pub fn calculate_max_bet_per_dice(
    dice_count: u8,
    target_number: u8,
    direction: &RollDirection,
) -> Result<u64, String> {
    if dice_count == 0 || dice_count > MAX_DICE_COUNT {
        return Err(format!("Dice count must be 1-{}", MAX_DICE_COUNT));
    }

    let multiplier = calculate_multiplier_direct(target_number, direction);
    if multiplier <= 0.0 {
        return Err("Invalid multiplier".to_string());
    }

    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("House not initialized".to_string());
    }

    // max_allowed / (dice_count * multiplier)
    let max_bet_per_dice = (max_allowed as f64) / (dice_count as f64 * multiplier);
    Ok(max_bet_per_dice as u64)
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
