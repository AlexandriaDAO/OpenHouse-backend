use candid::{CandidType, Deserialize, Principal};
use ic_cdk::management_canister::raw_rand;
use crate::types::{DECIMALS_PER_CKUSDT, MIN_BET};
use crate::defi_accounting::{self as accounting, liquidity_pool};
use crate::{calculate_multiplier_bp, MULTIPLIER_SCALE, ROWS};
use serde::Serialize;

// Max multiplier for bet validation (6.52x at edges)
// This must match calculate_multiplier_bp(0) or calculate_multiplier_bp(8)
const MAX_MULTIPLIER_BP: u64 = 65_200;

// =============================================================================
// GAME RESULT TYPES
// =============================================================================

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct PlinkoGameResult {
    pub path: Vec<bool>,
    pub final_position: u8,
    pub multiplier_bp: u64,
    pub multiplier: f64,
    pub bet_amount: u64,
    pub payout: u64,
    pub profit: i64,
    pub is_win: bool,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MultiBallGameResult {
    pub results: Vec<PlinkoGameResult>,
    pub total_balls: u8,
    pub total_bet: u64,
    pub total_payout: u64,
    pub net_profit: i64,
    pub average_multiplier: f64,
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/// Calculate max bet based on pool solvency and max potential multiplier
pub fn calculate_max_bet() -> u64 {
    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 { 
        return 0; 
    }
    // max_bet = max_allowed / max_multiplier (6.52x)
    // Multiply first to maintain precision, but use u128 to prevent overflow during calc
    let numerator = (max_allowed as u128) * (MULTIPLIER_SCALE as u128);
    let max_bet = numerator / (MAX_MULTIPLIER_BP as u128);
    
    max_bet as u64
}

/// Calculate payout from bet and multiplier using safe math
fn calculate_payout(bet_amount: u64, multiplier_bp: u64) -> Result<u64, String> {
    // (bet * multiplier_bp) / SCALE
    let scaled = (bet_amount as u128)
        .checked_mul(multiplier_bp as u128)
        .ok_or("Payout calculation overflow")?;
        
    let payout = scaled / (MULTIPLIER_SCALE as u128);
    
    // Check if result fits in u64
    if payout > u64::MAX as u128 {
        return Err("Payout exceeds u64 limit".to_string());
    }
    
    Ok(payout as u64)
}

// =============================================================================
// MAIN GAME LOGIC
// =============================================================================

pub async fn play_plinko(bet_amount: u64, caller: Principal) -> Result<PlinkoGameResult, String> {
    // 1. Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount {
        return Err("INSUFFICIENT_BALANCE".to_string());
    }

    // 2. Validate minimum bet (0.01 USDT)
    if bet_amount < MIN_BET {
        return Err("Invalid bet: minimum is 0.01 USDT".to_string());
    }

    // 3. Check max payout against house limit
    let max_potential_payout = calculate_payout(bet_amount, MAX_MULTIPLIER_BP)?;
    let max_allowed = accounting::get_max_allowed_payout();
    if max_potential_payout > max_allowed {
        return Err("Invalid bet: exceeds house limit".to_string());
    }

    // 4. Get VRF randomness BEFORE deducting balance (fail safe)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;
        
    if random_bytes.is_empty() {
        return Err("Insufficient randomness".to_string());
    }
    let random_byte = random_bytes[0];

    // 5. Deduct bet from balance
    let balance_after_bet = user_balance.checked_sub(bet_amount)
        .ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    // 6. Record volume for statistics
    crate::defi_accounting::record_bet_volume(bet_amount);

    // 7. Generate path and calculate position
    let path: Vec<bool> = (0..ROWS).map(|i| (random_byte >> i) & 1 == 1).collect();
    let final_position = path.iter().filter(|&&d| d).count() as u8;

    // 8. Calculate multiplier and payout
    let multiplier_bp = calculate_multiplier_bp(final_position)?;
    let payout = calculate_payout(bet_amount, multiplier_bp)?;
    let multiplier = multiplier_bp as f64 / MULTIPLIER_SCALE as f64;
    let is_win = multiplier_bp >= MULTIPLIER_SCALE;
    let profit = (payout as i64) - (bet_amount as i64);

    // 9. Credit payout to user
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(payout)
        .ok_or("Balance overflow when adding winnings")?;
    accounting::update_balance(caller, new_balance)?;

    // 10. Settle with pool
    // This updates the LP shares/values based on net profit/loss of the house
    if let Err(e) = liquidity_pool::settle_bet(bet_amount, payout) {
        // CRITICAL: Rollback if pool settlement fails
        // Refund the bet amount to the user (current_balance is balance BEFORE payout)
        // refund = (original - bet) + bet = original
        let refund_balance = current_balance.checked_add(bet_amount)
            .ok_or("Refund calculation overflow")?;
        accounting::update_balance(caller, refund_balance)?;
        
        ic_cdk::println!("CRITICAL: Payout failure. Refunded {} to {}", bet_amount, caller);
        return Err(format!("House settlement failed. Bet refunded. Error: {}", e));
    }

    Ok(PlinkoGameResult { 
        path, 
        final_position, 
        multiplier_bp, 
        multiplier, 
        bet_amount, 
        payout, 
        profit, 
        is_win 
    })
}

pub async fn play_multi_plinko(ball_count: u8, bet_per_ball: u64, caller: Principal) -> Result<MultiBallGameResult, String> {
    const MAX_BALLS: u8 = 30;

    // 1. Validate inputs
    if ball_count < 1 {
        return Err("Must drop at least 1 ball".to_string());
    }
    if ball_count > MAX_BALLS {
        return Err(format!("Maximum {} balls allowed", MAX_BALLS));
    }
    if bet_per_ball < MIN_BET {
        return Err("Invalid bet: minimum is 0.01 USDT per ball".to_string());
    }

    let total_bet = bet_per_ball.checked_mul(ball_count as u64)
        .ok_or("Total bet calculation overflow")?;

    // 2. Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < total_bet {
        return Err("INSUFFICIENT_BALANCE".to_string());
    }

    // 3. Check max payout against house limit
    let max_potential_payout_per_ball = calculate_payout(bet_per_ball, MAX_MULTIPLIER_BP)?;
    let max_potential_payout = max_potential_payout_per_ball.checked_mul(ball_count as u64)
        .ok_or("Max payout calculation overflow")?;
        
    let max_allowed = accounting::get_max_allowed_payout();
    if max_potential_payout > max_allowed {
        return Err("Invalid bet: exceeds house limit for total payout".to_string());
    }

    // 4. Get VRF randomness
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    if random_bytes.len() < ball_count as usize {
        return Err("Insufficient randomness".to_string());
    }

    // 5. Deduct total bet
    let balance_after_bet = user_balance.checked_sub(total_bet)
        .ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    // 6. Record volume
    crate::defi_accounting::record_bet_volume(total_bet);

    // 7. Process each ball
    let mut results = Vec::with_capacity(ball_count as usize);
    let mut total_payout: u64 = 0;

    for i in 0..ball_count {
        let random_byte = random_bytes[i as usize];

        // Path generation
        let path: Vec<bool> = (0..ROWS).map(|bit| (random_byte >> bit) & 1 == 1).collect();
        let final_position = path.iter().filter(|&&d| d).count() as u8;

        // Calc result
        let multiplier_bp = calculate_multiplier_bp(final_position)?;
        let payout = calculate_payout(bet_per_ball, multiplier_bp)?;
        let multiplier = multiplier_bp as f64 / MULTIPLIER_SCALE as f64;
        let is_win = multiplier_bp >= MULTIPLIER_SCALE;
        let profit = (payout as i64) - (bet_per_ball as i64);

        total_payout = total_payout.checked_add(payout)
            .ok_or("Total payout overflow")?;

        results.push(PlinkoGameResult {
            path,
            final_position,
            multiplier_bp,
            multiplier,
            bet_amount: bet_per_ball,
            payout,
            profit,
            is_win,
        });
    }

    // 8. Credit total payout
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(total_payout)
        .ok_or("Balance overflow when adding winnings")?;
    accounting::update_balance(caller, new_balance)?;

    // 9. Settle with pool
    if let Err(e) = liquidity_pool::settle_bet(total_bet, total_payout) {
        // Rollback on failure
        let refund_balance = current_balance.checked_add(total_bet)
            .ok_or("Refund calculation overflow")?;
        accounting::update_balance(caller, refund_balance)?;
        
        ic_cdk::println!("CRITICAL: Multi-ball payout failure. Refunded {} to {}", total_bet, caller);
        return Err(format!("House settlement failed. Bet refunded. Error: {}", e));
    }

    // 10. Aggregate results
    let net_profit = (total_payout as i64) - (total_bet as i64);
    let sum_multipliers: f64 = results.iter().map(|r| r.multiplier).sum();
    let average_multiplier = sum_multipliers / (ball_count as f64);

    Ok(MultiBallGameResult {
        results,
        total_balls: ball_count,
        total_bet,
        total_payout,
        net_profit,
        average_multiplier,
    })
}

pub fn calculate_max_bet_per_ball(ball_count: u8) -> Result<u64, String> {
    if ball_count == 0 { return Ok(0); }
    
    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 { return Ok(0); }

    // Max bet = Max Allowed Payout / (Balls * Max Multiplier)
    // Use u128 for calculation
    let max_allowed_u128 = max_allowed as u128;
    let balls_u128 = ball_count as u128;
    let scale_u128 = MULTIPLIER_SCALE as u128;
    let max_mult_u128 = MAX_MULTIPLIER_BP as u128;

    let numerator = max_allowed_u128.checked_mul(scale_u128)
        .ok_or("Overflow in max bet calculation")?;
    
    let denominator = balls_u128.checked_mul(max_mult_u128)
        .ok_or("Overflow in denominator")?;
        
    if denominator == 0 {
        return Ok(0);
    }

    let max_bet = numerator / denominator;
    
    if max_bet > u64::MAX as u128 {
        return Ok(u64::MAX);
    }
    
    Ok(max_bet as u64)
}
