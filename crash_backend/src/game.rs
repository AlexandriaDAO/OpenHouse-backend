use crate::defi_accounting::{self as accounting, liquidity_pool};
use crate::types::MIN_BET;
use candid::{CandidType, Deserialize, Principal};
use ic_cdk::management_canister::raw_rand;

const MAX_CRASH: f64 = 100.0;
const MAX_ROCKETS: u8 = 10;

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlayCrashResult {
    pub crash_point: f64,              // Where it crashed
    pub won: bool,                     // Did user win?
    pub target_multiplier: f64,        // User's target
    pub payout: u64,                   // Payout in ckUSDT decimals - 6 decimals (0 if lost)
    pub profit: i64,                   // User profit/loss (+payout - bet)
    pub bet_amount: u64,               // Original bet amount
    pub randomness_hash: String,       // IC randomness hash
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct SingleRocketResult {
    pub rocket_index: u8,           // 0-9
    pub crash_point: f64,           // Where this rocket crashed
    pub reached_target: bool,       // Did it reach the target?
    pub payout: u64,                // Payout for this rocket (0 if crashed early)
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct MultiCrashResult {
    pub rockets: Vec<SingleRocketResult>,  // Individual results
    pub target_multiplier: f64,            // Shared target
    pub rocket_count: u8,                  // How many rockets launched
    pub rockets_succeeded: u8,             // How many reached target
    pub total_payout: u64,                 // Sum of all payouts
    pub total_profit: i64,                 // Total profit/loss
    pub total_bet: u64,                    // Total bet (bet_amount * count)
    pub master_randomness_hash: String,    // VRF seed hash for verification
}

pub async fn play_crash(bet_amount: u64, target_multiplier: f64, caller: Principal)
    -> Result<PlayCrashResult, String>
{
    // 1. Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount {
        return Err("Insufficient balance for bet".to_string());
    }

    // 2. Validate minimum bet
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet is {} ckUSDT", MIN_BET));
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
    let max_potential_payout = (target_multiplier * bet_amount as f64) as u64;
    let max_allowed = accounting::get_max_allowed_payout();
    if max_potential_payout > max_allowed {
        return Err(format!("Potential payout {} exceeds house limit {}", max_potential_payout, max_allowed));
    }

    // 5. Get VRF randomness BEFORE deducting (fail-safe)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    // 6. Deduct bet from balance
    let balance_after = user_balance.checked_sub(bet_amount)
        .ok_or("Insufficient balance during deduction")?;
    accounting::update_balance(caller, balance_after)?;

    // 7. Record volume for statistics
    crate::defi_accounting::record_bet_volume(bet_amount);

    // 8. Calculate crash point
    let random = bytes_to_float(&random_bytes)?;
    let crash_point = calculate_crash_point(random);

    // 9. Determine outcome
    let won = crash_point >= target_multiplier;
    let payout = if won { (target_multiplier * bet_amount as f64) as u64 } else { 0 };
    let profit = (payout as i64) - (bet_amount as i64);

    // 10. Credit payout to user
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(payout)
        .ok_or("Balance overflow")?;
    accounting::update_balance(caller, new_balance)?;

    // 11. Settle with pool (CRITICAL)
    if let Err(e) = liquidity_pool::settle_bet(bet_amount, payout) {
        // Rollback on failure
        let refund = current_balance.checked_add(bet_amount)
            .ok_or("Refund calculation overflow")?;
        accounting::update_balance(caller, refund)?;
        return Err(format!("Settlement failed: {}", e));
    }

    // 12. Return result with randomness hash
    let randomness_hash = create_randomness_hash(&random_bytes);
    Ok(PlayCrashResult { 
        crash_point, 
        won, 
        target_multiplier, 
        payout, 
        profit, 
        bet_amount, 
        randomness_hash 
    })
}

pub async fn play_crash_multi(bet_amount: u64, target_multiplier: f64, rocket_count: u8, caller: Principal)
    -> Result<MultiCrashResult, String>
{
    // 1. Validate rocket_count
    if rocket_count < 1 {
        return Err("Must launch at least 1 rocket".to_string());
    }
    if rocket_count > MAX_ROCKETS {
        return Err(format!("Maximum {} rockets allowed", MAX_ROCKETS));
    }
    
    // 2. Calculate total bet
    let total_bet = bet_amount.checked_mul(rocket_count as u64)
        .ok_or("Total bet overflow")?;

    // 3. Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < total_bet {
        return Err("Insufficient balance for total bet".to_string());
    }

    // 4. Validate minimum bet (per rocket)
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet per rocket is {} ckUSDT", MIN_BET));
    }

    // 5. Validate target multiplier
    if target_multiplier < 1.01 {
        return Err("Target must be at least 1.01x".to_string());
    }
    if target_multiplier > MAX_CRASH {
        return Err(format!("Target cannot exceed {}x", MAX_CRASH));
    }
    if !target_multiplier.is_finite() {
        return Err("Target must be a finite number".to_string());
    }

    // 6. Check max total payout against house limit
    let max_payout_per_rocket = (target_multiplier * bet_amount as f64) as u64;
    let max_total_payout = max_payout_per_rocket.checked_mul(rocket_count as u64)
        .ok_or("Max payout calculation overflow")?;
        
    let max_allowed = accounting::get_max_allowed_payout();
    if max_total_payout > max_allowed {
        return Err(format!("Potential total payout {} exceeds house limit {}", max_total_payout, max_allowed));
    }

    // 7. Get VRF randomness
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    // 8. Deduct total bet
    let balance_after = user_balance.checked_sub(total_bet)
        .ok_or("Insufficient balance during deduction")?;
    accounting::update_balance(caller, balance_after)?;

    // 9. Record volume
    crate::defi_accounting::record_bet_volume(total_bet);

    // 10. Process rockets
    let mut rockets = Vec::with_capacity(rocket_count as usize);
    let mut rockets_succeeded: u8 = 0;
    let mut total_payout: u64 = 0;

    for i in 0..rocket_count {
        let random = derive_rocket_random(&random_bytes, i)?;
        let crash_point = calculate_crash_point(random);
        let reached_target = crash_point >= target_multiplier;

        let payout = if reached_target {
            (target_multiplier * bet_amount as f64) as u64
        } else {
            0
        };

        if reached_target {
            rockets_succeeded += 1;
        }
        total_payout += payout;

        rockets.push(SingleRocketResult {
            rocket_index: i,
            crash_point,
            reached_target,
            payout,
        });
    }
    
    let total_profit = (total_payout as i64) - (total_bet as i64);

    // 11. Credit payout
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(total_payout)
        .ok_or("Balance overflow")?;
    accounting::update_balance(caller, new_balance)?;

    // 12. Settle with pool
    if let Err(e) = liquidity_pool::settle_bet(total_bet, total_payout) {
        let refund = current_balance.checked_add(total_bet)
            .ok_or("Refund calculation overflow")?;
        accounting::update_balance(caller, refund)?;
        return Err(format!("Settlement failed: {}", e));
    }

    // 13. Return result
    let master_randomness_hash = create_randomness_hash(&random_bytes);
    Ok(MultiCrashResult {
        rockets,
        target_multiplier,
        rocket_count,
        rockets_succeeded,
        total_payout,
        total_profit,
        total_bet,
        master_randomness_hash,
    })
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn bytes_to_float(bytes: &[u8]) -> Result<f64, String> {
    if bytes.len() < 8 {
        return Err("Insufficient randomness bytes".to_string());
    }
    let mut byte_array = [0u8; 8];
    byte_array.copy_from_slice(&bytes[0..8]);
    let random_u64 = u64::from_be_bytes(byte_array);
    let random = (random_u64 >> 11) as f64 / (1u64 << 53) as f64;
    Ok(random)
}

fn derive_rocket_random(vrf_bytes: &[u8], rocket_index: u8) -> Result<f64, String> {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(vrf_bytes);
    hasher.update([rocket_index]); 
    let hash = hasher.finalize();
    let mut byte_array = [0u8; 8];
    byte_array.copy_from_slice(&hash[0..8]);
    let random_u64 = u64::from_be_bytes(byte_array);
    let random = (random_u64 >> 11) as f64 / (1u64 << 53) as f64;
    Ok(random)
}

pub fn calculate_crash_point(random: f64) -> f64 {
    let random = random.max(0.0).min(0.99999);
    let crash = 0.99 / (1.0 - random);
    crash.min(MAX_CRASH)
}

fn create_randomness_hash(bytes: &[u8]) -> String {
    use sha2::{Sha256, Digest};
    let hash_bytes = if bytes.len() >= 32 { &bytes[0..32] } else { bytes };
    let mut hasher = Sha256::new();
    hasher.update(hash_bytes);
    format!("{:x}", hasher.finalize())
}
