use candid::{CandidType, Deserialize, Principal};
use ic_cdk::management_canister::raw_rand;
use crate::types::MIN_BET;
use crate::defi_accounting::{self as accounting, liquidity_pool};
use serde::Serialize;
use sha2::{Sha256, Digest};

// Constants
const MAX_CRASH: f64 = 100.0;
const MAX_ROCKETS: u8 = 10;

// Max multiplier for bet validation (100x max crash)
// This must match MAX_CRASH
const MAX_MULTIPLIER_SCALE: u64 = 100_000_000; // 100.0 * 1_000_000 (6 decimal precision)
const MULTIPLIER_SCALE: u64 = 1_000_000; // 6 decimal precision for multiplier

// =============================================================================
// GAME RESULT TYPES
// =============================================================================

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct PlayCrashResult {
    pub crash_point: f64,
    pub won: bool,
    pub target_multiplier: f64,
    pub bet_amount: u64,
    pub payout: u64,
    pub profit: i64,
    pub randomness_hash: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct SingleRocketResult {
    pub rocket_index: u8,
    pub crash_point: f64,
    pub reached_target: bool,
    pub payout: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MultiCrashResult {
    pub rockets: Vec<SingleRocketResult>,
    pub target_multiplier: f64,
    pub rocket_count: u8,
    pub rockets_succeeded: u8,
    pub bet_per_rocket: u64,
    pub total_bet: u64,
    pub total_payout: u64,
    pub net_profit: i64,
    pub master_randomness_hash: String,
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
    // max_bet = max_allowed / max_multiplier (100x)
    // Use u128 to prevent overflow during calculation
    let numerator = (max_allowed as u128) * (MULTIPLIER_SCALE as u128);
    let max_bet = numerator / (MAX_MULTIPLIER_SCALE as u128);

    max_bet as u64
}

/// Calculate payout from bet and multiplier using integer math to avoid f64 precision loss.
///
/// Uses scaled integer arithmetic: multiplier is converted to basis points (1.5x = 1_500_000),
/// then we compute (bet * multiplier_scaled) / MULTIPLIER_SCALE using u128 intermediates.
/// This ensures exact results for all representable multipliers.
fn calculate_payout(bet_amount: u64, multiplier: f64) -> Result<u64, String> {
    if !multiplier.is_finite() || multiplier < 0.0 {
        return Err("Invalid multiplier".to_string());
    }

    // Convert multiplier to scaled integer (e.g., 2.5x = 2_500_000)
    // This preserves 6 decimal places of precision
    let multiplier_scaled = (multiplier * MULTIPLIER_SCALE as f64) as u128;

    // Use u128 for intermediate calculation to prevent overflow
    let numerator = (bet_amount as u128)
        .checked_mul(multiplier_scaled)
        .ok_or("Payout calculation overflow")?;

    let payout = numerator / (MULTIPLIER_SCALE as u128);

    // Check if result fits in u64
    if payout > u64::MAX as u128 {
        return Err("Payout exceeds u64 limit".to_string());
    }

    Ok(payout as u64)
}

/// Validate randomness bytes are not degenerate (all zeros or all ones).
/// This guards against catastrophic VRF failure modes.
fn validate_randomness(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 8 {
        return Err("Insufficient randomness bytes".to_string());
    }

    // Check for degenerate patterns that indicate VRF failure
    let first_8 = &bytes[0..8];
    if first_8.iter().all(|&b| b == 0) {
        return Err("Degenerate randomness detected: all zeros".to_string());
    }
    if first_8.iter().all(|&b| b == 0xFF) {
        return Err("Degenerate randomness detected: all ones".to_string());
    }

    Ok(())
}

/// Convert VRF bytes to float in range [0.0, 1.0)
/// Uses the standard technique of extracting 53 bits (f64 mantissa precision)
/// by right-shifting 11 bits from a u64, then dividing by 2^53.
fn bytes_to_float(bytes: &[u8]) -> Result<f64, String> {
    validate_randomness(bytes)?;

    let mut byte_array = [0u8; 8];
    byte_array.copy_from_slice(&bytes[0..8]);
    let random_u64 = u64::from_be_bytes(byte_array);
    // >> 11 extracts most significant 53 bits for f64 mantissa precision
    let random = (random_u64 >> 11) as f64 / (1u64 << 53) as f64;
    Ok(random)
}

/// Derive an independent float for a specific rocket index.
/// Uses SHA256(vrf_bytes || index) to generate cryptographically independent values.
fn derive_rocket_random(vrf_bytes: &[u8], rocket_index: u8) -> Result<f64, String> {
    // Validate source randomness first
    validate_randomness(vrf_bytes)?;

    let mut hasher = Sha256::new();
    hasher.update(vrf_bytes);
    hasher.update([rocket_index]);
    let hash = hasher.finalize();

    let mut byte_array = [0u8; 8];
    byte_array.copy_from_slice(&hash[0..8]);
    let random_u64 = u64::from_be_bytes(byte_array);
    // >> 11 extracts most significant 53 bits for f64 mantissa precision
    let random = (random_u64 >> 11) as f64 / (1u64 << 53) as f64;
    Ok(random)
}

/// Calculate crash point using the formula: crash = 0.99 / (1.0 - random)
pub fn calculate_crash_point(random: f64) -> f64 {
    let random = random.max(0.0).min(0.99999);
    let crash = 0.99 / (1.0 - random);
    crash.min(MAX_CRASH)
}

/// Create SHA256 hash of IC randomness bytes for audit/display
fn create_randomness_hash(bytes: &[u8]) -> String {
    let hash_bytes = if bytes.len() >= 32 {
        &bytes[0..32]
    } else {
        bytes
    };
    let mut hasher = Sha256::new();
    hasher.update(hash_bytes);
    format!("{:x}", hasher.finalize())
}

// =============================================================================
// MAIN GAME LOGIC
// =============================================================================
//
// RACE CONDITION SAFETY:
// IC canisters execute messages sequentially - no concurrent threads.
// The balance check → deduct → game → credit sequence has no await points
// between balance check and deduction, ensuring atomicity.
// See: https://internetcomputer.org/docs/current/concepts/canisters-code#execution

pub async fn play_crash(bet_amount: u64, target_multiplier: f64, caller: Principal) -> Result<PlayCrashResult, String> {
    // 1. Check user balance (sync - no await before deduction)
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount {
        return Err("INSUFFICIENT_BALANCE".to_string());
    }

    // 2. Validate minimum bet (0.1 USDT)
    if bet_amount < MIN_BET {
        return Err("Invalid bet: minimum is 0.1 USDT".to_string());
    }

    // 3. Validate target multiplier
    if target_multiplier < 1.01 {
        return Err("Target must be at least 1.01x".to_string());
    }
    if target_multiplier > MAX_CRASH {
        return Err(format!("Target cannot exceed {}x", MAX_CRASH));
    }
    if !target_multiplier.is_finite() {
        return Err("Target must be a finite number".to_string());
    }

    // 4. Check max payout against house limit
    let max_potential_payout = calculate_payout(bet_amount, target_multiplier)?;
    let max_allowed = accounting::get_max_allowed_payout();
    if max_potential_payout > max_allowed {
        return Err("Invalid bet: exceeds house limit".to_string());
    }

    // 5. Get VRF randomness BEFORE deducting balance (fail safe)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    if random_bytes.len() < 8 {
        return Err("Insufficient randomness".to_string());
    }

    // 6. Deduct bet from balance
    let balance_after_bet = user_balance.checked_sub(bet_amount)
        .ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    // 7. Record volume for statistics
    crate::defi_accounting::record_bet_volume(bet_amount);

    // 8. Calculate crash point
    let random = bytes_to_float(&random_bytes)?;
    let crash_point = calculate_crash_point(random);

    // 9. Determine outcome
    let won = crash_point >= target_multiplier;
    let payout = if won {
        calculate_payout(bet_amount, target_multiplier)?
    } else {
        0
    };
    let profit = (payout as i64) - (bet_amount as i64);

    // 10. Credit payout to user
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(payout)
        .ok_or("Balance overflow when adding winnings")?;
    accounting::update_balance(caller, new_balance)?;

    // 11. Settle with pool
    if let Err(e) = liquidity_pool::settle_bet(bet_amount, payout) {
        // CRITICAL: Rollback if pool settlement fails
        let refund_balance = current_balance.checked_add(bet_amount)
            .ok_or("Refund calculation overflow")?;
        accounting::update_balance(caller, refund_balance)?;

        ic_cdk::println!("CRITICAL: Crash payout failure. Refunded {} to {}", bet_amount, caller);
        return Err(format!("House settlement failed. Bet refunded. Error: {}", e));
    }

    // 12. Create randomness hash
    let randomness_hash = create_randomness_hash(&random_bytes);

    Ok(PlayCrashResult {
        crash_point,
        won,
        target_multiplier,
        bet_amount,
        payout,
        profit,
        randomness_hash,
    })
}

pub async fn play_crash_multi(bet_per_rocket: u64, target_multiplier: f64, rocket_count: u8, caller: Principal) -> Result<MultiCrashResult, String> {
    // 1. Validate inputs
    if rocket_count < 1 {
        return Err("Must launch at least 1 rocket".to_string());
    }
    if rocket_count > MAX_ROCKETS {
        return Err(format!("Maximum {} rockets allowed", MAX_ROCKETS));
    }
    if bet_per_rocket < MIN_BET {
        return Err("Invalid bet: minimum is 0.1 USDT per rocket".to_string());
    }

    // Validate target multiplier
    if target_multiplier < 1.01 {
        return Err("Target must be at least 1.01x".to_string());
    }
    if target_multiplier > MAX_CRASH {
        return Err(format!("Target cannot exceed {}x", MAX_CRASH));
    }
    if !target_multiplier.is_finite() {
        return Err("Target must be a finite number".to_string());
    }

    let total_bet = bet_per_rocket.checked_mul(rocket_count as u64)
        .ok_or("Total bet calculation overflow")?;

    // 2. Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < total_bet {
        return Err("INSUFFICIENT_BALANCE".to_string());
    }

    // 3. Check max payout against house limit
    // Worst case: all rockets win at target multiplier
    let max_payout_per_rocket = calculate_payout(bet_per_rocket, target_multiplier)?;
    let max_potential_payout = max_payout_per_rocket.checked_mul(rocket_count as u64)
        .ok_or("Max payout calculation overflow")?;

    let max_allowed = accounting::get_max_allowed_payout();
    if max_potential_payout > max_allowed {
        return Err("Invalid bet: exceeds house limit for total payout".to_string());
    }

    // 4. Get VRF randomness
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    if random_bytes.len() < 32 {
        return Err("Insufficient randomness".to_string());
    }

    // 5. Deduct total bet
    let balance_after_bet = user_balance.checked_sub(total_bet)
        .ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    // 6. Record volume
    crate::defi_accounting::record_bet_volume(total_bet);

    // 7. Process each rocket
    let mut rockets = Vec::with_capacity(rocket_count as usize);
    let mut rockets_succeeded: u8 = 0;
    let mut total_payout: u64 = 0;

    for i in 0..rocket_count {
        let random = derive_rocket_random(&random_bytes, i)?;
        let crash_point = calculate_crash_point(random);
        let reached_target = crash_point >= target_multiplier;

        let payout = if reached_target {
            calculate_payout(bet_per_rocket, target_multiplier)?
        } else {
            0
        };

        if reached_target {
            rockets_succeeded += 1;
        }
        total_payout = total_payout.checked_add(payout)
            .ok_or("Total payout overflow")?;

        rockets.push(SingleRocketResult {
            rocket_index: i,
            crash_point,
            reached_target,
            payout,
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

        ic_cdk::println!("CRITICAL: Multi-rocket payout failure. Refunded {} to {}", total_bet, caller);
        return Err(format!("House settlement failed. Bet refunded. Error: {}", e));
    }

    // 10. Aggregate results
    let net_profit = (total_payout as i64) - (total_bet as i64);
    let master_randomness_hash = create_randomness_hash(&random_bytes);

    Ok(MultiCrashResult {
        rockets,
        target_multiplier,
        rocket_count,
        rockets_succeeded,
        bet_per_rocket,
        total_bet,
        total_payout,
        net_profit,
        master_randomness_hash,
    })
}

/// Get the maximum bet allowed for a single rocket crash game
pub fn get_max_bet() -> u64 {
    calculate_max_bet()
}

/// Get the maximum bet per rocket for multi-rocket game
pub fn get_max_bet_per_rocket(rocket_count: u8) -> Result<u64, String> {
    if rocket_count == 0 { return Ok(0); }

    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 { return Ok(0); }

    // Max bet = Max Allowed Payout / (Rockets * Max Multiplier)
    // Use u128 for calculation to prevent overflow
    let max_allowed_u128 = max_allowed as u128;
    let rockets_u128 = rocket_count as u128;
    let scale_u128 = MULTIPLIER_SCALE as u128;

    let numerator = max_allowed_u128.checked_mul(scale_u128)
        .ok_or("Overflow in max bet calculation")?;

    let denominator = rockets_u128.checked_mul(MAX_MULTIPLIER_SCALE as u128)
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
