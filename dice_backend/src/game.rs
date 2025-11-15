use crate::types::{DiceResult, GameStats, RollDirection, E8S_PER_ICP, MIN_BET, MAX_WIN, MAX_NUMBER};
use crate::seed::{generate_dice_roll_instant, maybe_schedule_seed_rotation};
use crate::accounting;
use candid::Principal;
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::StableBTreeMap;
use std::cell::RefCell;

// Re-export Memory type from parent
use crate::Memory;

// =============================================================================
// THREAD-LOCAL STORAGE
// =============================================================================

thread_local! {
    static GAME_STATS: RefCell<GameStats> = RefCell::new(GameStats::default());

    pub(crate) static GAME_HISTORY: RefCell<StableBTreeMap<u64, DiceResult, Memory>> = RefCell::new(
        StableBTreeMap::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
        )
    );

    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(0);
}

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

// Calculate maximum allowed bet based on target number and direction
pub fn calculate_max_bet(target_number: u8, direction: &RollDirection) -> u64 {
    let multiplier = calculate_multiplier_direct(target_number, direction);

    if multiplier <= 0.0 {
        return MIN_BET;
    }

    ((MAX_WIN as f64) / multiplier).floor() as u64
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
) -> Result<DiceResult, String> {
    // Note: Balance is now calculated on-demand, no cache to manage

    // Check user has sufficient internal balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount {
        return Err(format!("Insufficient balance. You have {} e8s, need {} e8s. Please deposit more ICP.",
                          user_balance, bet_amount));
    }

    // Validate input
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet is {} ICP", MIN_BET as f64 / E8S_PER_ICP as f64));
    }

    // Calculate dynamic max bet for this specific bet
    let max_bet = calculate_max_bet(target_number, &direction);
    if bet_amount > max_bet {
        let multiplier = calculate_multiplier_direct(target_number, &direction);
        return Err(format!(
            "Maximum bet is {:.4} ICP for {:.2}x multiplier (10 ICP max win)",
            max_bet as f64 / E8S_PER_ICP as f64,
            multiplier
        ));
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
            if target_number <= 0 {
                return Err("Target must be greater than 0 for Under rolls".to_string());
            }
            if target_number > MAX_NUMBER {
                return Err(format!("Target must be at most {} for Under rolls", MAX_NUMBER));
            }
        }
    }

    // Calculate win chance and multiplier for this specific bet
    let win_chance = calculate_win_chance(target_number, &direction);
    let multiplier = calculate_multiplier_direct(target_number, &direction);

    // Calculate max bet based on house balance using ACTUAL multiplier
    let house_balance = accounting::get_house_balance().await
        .map_err(|e| format!("Failed to get house balance: {}", e))?;
    let max_payout = (bet_amount as f64 * multiplier) as u64;
    if max_payout > house_balance {
        return Err(format!("Bet too large. House only has {} e8s, max payout would be {} e8s ({}x multiplier)",
                          house_balance, max_payout, multiplier));
    }

    // Validate client seed length (DoS protection)
    if client_seed.len() > 256 {
        return Err("Client seed too long (max 256 characters)".to_string());
    }

    // P0-3 FIX: Deduct bet AFTER all validations pass, but BEFORE game logic
    // This prevents:
    // 1. Users losing bets on invalid inputs (all validations passed)
    // 2. Concurrent games from overdrawing balance (atomic deduction)
    let balance_after_bet = user_balance.checked_sub(bet_amount)
        .ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    // Check if seed needs rotation
    maybe_schedule_seed_rotation();

    let (rolled_number, nonce, server_seed_hash) = generate_dice_roll_instant(&client_seed)?;

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

    // Get the game_id BEFORE creating the result
    let game_id = NEXT_GAME_ID.with(|id| {
        let current = *id.borrow();
        *id.borrow_mut() = current + 1;
        current
    });

    let result = DiceResult {
        game_id,  // NEW: Include game ID
        player: caller,
        bet_amount,
        target_number,
        direction,
        rolled_number,
        win_chance,
        multiplier,
        payout,
        is_win,
        timestamp: ic_cdk::api::time(),
        is_house_hit,
        client_seed,
        nonce,
        server_seed_hash,
    };

    // Update stats
    GAME_STATS.with(|stats| {
        let mut stats = stats.borrow_mut();
        stats.total_games += 1;
        stats.total_volume += bet_amount;
        stats.total_payouts += payout;
        stats.house_profit = (stats.total_volume as i64) - (stats.total_payouts as i64);
    });

    // Store in history (game_id was already obtained above)
    GAME_HISTORY.with(|history| {
        history.borrow_mut().insert(game_id, result.clone());
    });

    // Update user balance based on game result
    // Bet was already deducted before game logic (P0-3 fix)
    // Now only add winnings if player won
    if is_win {
        let current_balance = accounting::get_balance(caller);
        let new_balance = current_balance.checked_add(payout)
            .ok_or("Balance overflow when adding winnings")?;
        accounting::update_balance(caller, new_balance)?;
    }
    // If loss, balance was already deducted - nothing more to do

    Ok(result)
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

// Get game statistics
pub fn get_stats() -> GameStats {
    GAME_STATS.with(|stats| stats.borrow().clone())
}

// Get recent games
pub fn get_recent_games(limit: u32) -> Vec<DiceResult> {
    GAME_HISTORY.with(|history| {
        let history = history.borrow();
        history
            .iter()
            .rev()
            .take(limit as usize)
            .map(|(_, game)| game)
            .collect()
    })
}

// Get a specific game by ID
pub fn get_game(game_id: u64) -> Option<DiceResult> {
    GAME_HISTORY.with(|history| {
        history.borrow().get(&game_id)
    })
}

// Calculate what the multiplier would be for given parameters (helper for UI)
pub fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
    match direction {
        RollDirection::Over => {
            if target_number >= MAX_NUMBER || target_number < 1 {
                return Err("Invalid target number for Over direction".to_string());
            }
        }
        RollDirection::Under => {
            if target_number <= 0 || target_number > MAX_NUMBER {
                return Err("Invalid target number for Under direction".to_string());
            }
        }
    }

    let win_chance = calculate_win_chance(target_number, &direction);
    let multiplier = calculate_multiplier_direct(target_number, &direction);
    Ok((win_chance, multiplier))
}
