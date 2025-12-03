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

/// Calculate payout for a bet with given multiplier (P0 fix: ensures consistent rounding)
/// This helper guarantees identical payout calculation across max_payout checks and actual payouts
#[inline]
pub fn calculate_payout(bet_amount: u64, multiplier: f64) -> u64 {
    (bet_amount as f64 * multiplier).round() as u64
}

/// Validate target number based on direction (P3 fix: shared validation logic)
/// Returns Ok(()) if valid, Err with message if invalid
pub fn validate_target_number(target: u8, direction: &RollDirection) -> Result<(), String> {
    match direction {
        RollDirection::Over => {
            if target >= MAX_NUMBER {
                return Err(format!("Invalid target: must be less than {} for Over rolls", MAX_NUMBER));
            }
            if target < 1 {
                return Err("Invalid target: must be at least 1 for Over rolls".to_string());
            }
        }
        RollDirection::Under => {
            if target == 0 {
                return Err("Invalid target: must be greater than 0 for Under rolls".to_string());
            }
            if target > MAX_NUMBER {
                return Err(format!("Invalid target: must be at most {} for Under rolls", MAX_NUMBER));
            }
        }
    }
    Ok(())
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
        return Err(format!(
            "INSUFFICIENT_BALANCE|Your dice balance: {:.4} USDT|Bet amount: {:.4} USDT|This bet was not placed and no funds were deducted.",
            user_balance as f64 / DECIMALS_PER_CKUSDT as f64,
            bet_amount as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    // Validate bet amount
    if bet_amount < MIN_BET {
        return Err(format!("Invalid bet: minimum is {:.2} USDT", MIN_BET as f64 / DECIMALS_PER_CKUSDT as f64));
    }

    // Validate target number (P3: uses shared helper)
    validate_target_number(target_number, &direction)?;

    // Calculate multiplier for this specific bet
    let multiplier = calculate_multiplier_direct(target_number, &direction);

    // Check house limit (P0: uses shared payout calculator)
    let max_payout = calculate_payout(bet_amount, multiplier);
    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("Error: house balance not initialized, please try again".to_string());
    }
    if max_payout > max_allowed {
        return Err(format!(
            "Invalid bet: max payout {:.2} USDT exceeds house limit {:.2} USDT (15% of pool)",
            max_payout as f64 / DECIMALS_PER_CKUSDT as f64,
            max_allowed as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    // Validate client seed length (DoS protection)
    if client_seed.len() > 256 {
        return Err("Invalid seed: max 256 characters".to_string());
    }

    // Generate roll BEFORE deducting balance using per-game VRF
    let (rolled_number, server_seed, nonce) = crate::seed::generate_dice_roll_vrf(&client_seed).await?;
    let server_seed_hash = crate::seed::hash_server_seed(&server_seed);

    // Deduct bet AFTER all validations and fallible operations pass
    let balance_after_bet = user_balance.checked_sub(bet_amount)
        .ok_or("Error: balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    // Record volume for daily statistics
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

    // Calculate payout (P0: uses shared calculator for consistency)
    let payout = if is_win {
        calculate_payout(bet_amount, multiplier)
    } else {
        0
    };

    // Credit payout to user (0 for loss, multiplied amount for win)
    // This unified approach handles all scenarios: total loss, partial loss, push, win
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(payout)
        .ok_or("Balance overflow when adding winnings")?;
    accounting::update_balance(caller, new_balance)?;

    // Settle bet with pool
    //
    // DESIGN NOTE: Race Condition Analysis (Auditor Reference)
    // --------------------------------------------------------
    // A theoretical race exists: pool could drain between validation (line 109) and
    // settlement here, causing settle_bet to fail after VRF commitment. In this case,
    // the user receives only their bet refund, not their winnings.
    //
    // Why this is acceptable:
    // - VRF window is ~2-4 seconds (IC consensus rounds)
    // - Max payout is 15% of pool per bet
    // - Draining 85%+ of pool requires ~12-15 concurrent max-payout winners OR
    //   a large LP withdrawal during this narrow window
    // - Genuine players cannot coordinate this; only an attacker draining the pool
    //   could trigger this scenario
    // - If an attacker is draining the pool, refusing to pay additional winnings
    //   is the correct defensive behavior
    // - Accounting remains consistent: user gets bet back, pool unchanged
    //
    // Alternative (reserve-before-VRF) adds complexity for negligible benefit.
    if let Err(e) = liquidity_pool::settle_bet(bet_amount, payout) {
        // Pool couldn't afford payout - rollback user balance and refund bet
        let refund_balance = current_balance.checked_add(bet_amount)
            .ok_or("Error: balance overflow on refund")?;
        accounting::update_balance(caller, refund_balance)?;

        ic_cdk::println!("CRITICAL: Payout failure. Refunded {} to {}", bet_amount, caller);

        return Err(format!(
            "Error: house cannot afford payout. Your bet of {:.2} USDT has been refunded. {}",
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
    // Validate dice count
    if dice_count == 0 || dice_count > MAX_DICE_COUNT {
        return Err(format!("Invalid dice count: must be 1-{}", MAX_DICE_COUNT));
    }

    let total_bet = (dice_count as u64)
        .checked_mul(bet_per_dice)
        .ok_or("Error: bet calculation overflow")?;

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
        return Err(format!("Invalid bet: minimum per dice is {:.2} USDT", MIN_BET as f64 / DECIMALS_PER_CKUSDT as f64));
    }

    // Validate target number (P3: uses shared helper)
    validate_target_number(target_number, &direction)?;

    // Calculate multiplier (same for all dice)
    let multiplier = calculate_multiplier_direct(target_number, &direction);

    // Aggregate max payout check - worst case: all dice win (P0: uses shared calculator)
    let max_payout_per_dice = calculate_payout(bet_per_dice, multiplier);
    let max_aggregate_payout = max_payout_per_dice
        .checked_mul(dice_count as u64)
        .ok_or("Error: max payout calculation overflow")?;

    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("Error: house balance not initialized, please try again".to_string());
    }
    if max_aggregate_payout > max_allowed {
        return Err(format!(
            "Invalid bet: max payout {:.2} USDT (all {} dice win) exceeds house limit {:.2} USDT (15% of pool)",
            max_aggregate_payout as f64 / DECIMALS_PER_CKUSDT as f64,
            dice_count,
            max_allowed as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    // Validate client seed
    if client_seed.len() > 256 {
        return Err("Invalid seed: max 256 characters".to_string());
    }

    // VRF generation (single call for all dice)
    let (rolled_numbers, server_seed, nonce) =
        crate::seed::generate_multi_dice_roll_vrf(dice_count, &client_seed).await?;
    let server_seed_hash = crate::seed::hash_server_seed(&server_seed);

    // Deduct total bet
    let balance_after_bet = user_balance.checked_sub(total_bet).ok_or("Error: balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    crate::defi_accounting::record_bet_volume(total_bet);

    // Process each dice
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

        // P0: uses shared calculator for consistency
        let payout = if is_win {
            calculate_payout(bet_per_dice, multiplier)
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

    // Credit total payout
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(total_payout).ok_or("Error: balance overflow")?;
    accounting::update_balance(caller, new_balance)?;

    // Settle with pool
    //
    // DESIGN NOTE: Race Condition Analysis (Auditor Reference)
    // --------------------------------------------------------
    // See detailed comment in play_dice(). Same analysis applies here:
    // - Theoretical race if pool drains 85%+ during ~2-4s VRF window
    // - Requires ~12-15 concurrent max-payout wins or large LP withdrawal
    // - Only an attacker scenario; refusing payout is correct defensive behavior
    // - Accounting stays consistent: user gets total_bet back, pool unchanged
    if let Err(e) = liquidity_pool::settle_bet(total_bet, total_payout) {
        // Rollback on pool failure
        let refund_balance = current_balance.checked_add(total_bet).ok_or("Error: refund overflow")?;
        accounting::update_balance(caller, refund_balance)?;

        ic_cdk::println!("CRITICAL: Multi-dice payout failure. Refunded {} to {}", total_bet, caller);

        return Err(format!(
            "Error: house cannot afford payout. Your bet of {:.2} USDT has been refunded. {}",
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
        return Err(format!("Invalid dice count: must be 1-{}", MAX_DICE_COUNT));
    }

    let multiplier = calculate_multiplier_direct(target_number, direction);
    if multiplier <= 0.0 {
        return Err("Invalid target: multiplier is zero".to_string());
    }

    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("Error: house not initialized".to_string());
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
    // Use shared validation (P3)
    validate_target_number(target_number, &direction)?;

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
