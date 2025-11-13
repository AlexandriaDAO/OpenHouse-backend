use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::management_canister::main::raw_rand;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, Storable};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::cell::RefCell;

// Seed management structure
#[derive(Clone, Debug, Serialize, Deserialize, CandidType)]
struct RandomnessSeed {
    current_seed: [u8; 32],
    creation_time: u64,
    games_used: u64,
    max_games: u64,
    nonce: u64,
}

// Global seed state
thread_local! {
    static SEED_STATE: RefCell<Option<RandomnessSeed>> = RefCell::new(None);
    static LAST_SEED_ROTATION: RefCell<u64> = RefCell::new(0);
    static SEED_INIT_LOCK: RefCell<bool> = RefCell::new(false);
}

const SEED_ROTATION_INTERVAL_NS: u64 = 300_000_000_000; // 5 minutes in nanoseconds
const MAX_GAMES_PER_SEED: u64 = 10_000; // Rotate after 10k games

type Memory = VirtualMemory<DefaultMemoryImpl>;

// Dice game constants
const MIN_BET: u64 = 100_000_000; // 1 ICP
const MAX_BET: u64 = 10_000_000_000; // 100 ICP
const HOUSE_EDGE: f64 = 0.03; // 3% house edge
const MAX_NUMBER: u8 = 100; // Dice rolls 0-100

// Direction to predict
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum RollDirection {
    Over,   // Roll will be greater than target
    Under,  // Roll will be less than target
}

// Dice game result
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct DiceResult {
    pub player: Principal,
    pub bet_amount: u64,
    pub target_number: u8,
    pub direction: RollDirection,
    pub rolled_number: u8,
    pub win_chance: f64,
    pub multiplier: f64,
    pub payout: u64,
    pub is_win: bool,
    pub timestamp: u64,
    // Verification fields for provable fairness
    pub client_seed: String,
    pub nonce: u64,
    pub server_seed_hash: String,
}

#[derive(CandidType, Deserialize, Clone, Default)]
pub struct GameStats {
    pub total_games: u64,
    pub total_volume: u64,
    pub total_payouts: u64,
    pub house_profit: i64,
}

impl Storable for DiceResult {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Unbounded;
}

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static GAME_STATS: RefCell<GameStats> = RefCell::new(GameStats::default());

    static GAME_HISTORY: RefCell<StableBTreeMap<u64, DiceResult, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
        )
    );

    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(0);
}

// Initialize canister
#[init]
fn init() {
    ic_cdk::println!("Dice Game Backend Initialized");
    // Seed will be initialized on first game or in post_upgrade
}

// Initialize the seed with VRF randomness (with lock to prevent race conditions)
async fn initialize_seed() {
    // Check if already initializing
    let is_locked = SEED_INIT_LOCK.with(|lock| *lock.borrow());
    if is_locked {
        return; // Already initializing, skip
    }

    // Set lock
    SEED_INIT_LOCK.with(|lock| {
        *lock.borrow_mut() = true;
    });

    // Double-check seed state after acquiring lock
    let already_initialized = SEED_STATE.with(|s| s.borrow().is_some());
    if already_initialized {
        SEED_INIT_LOCK.with(|lock| {
            *lock.borrow_mut() = false;
        });
        return;
    }

    let random_bytes = match raw_rand().await {
        Ok((bytes,)) => bytes,
        Err(_) => {
            // Improved fallback: combine timestamp with caller principal
            let time = ic_cdk::api::time();
            let caller = ic_cdk::caller();
            let mut hasher = Sha256::new();
            hasher.update(time.to_be_bytes());
            hasher.update(caller.as_slice());
            hasher.finalize().to_vec()
        }
    };

    let mut hasher = Sha256::new();
    hasher.update(&random_bytes);
    let seed_array: [u8; 32] = hasher.finalize()[0..32].try_into().unwrap();

    SEED_STATE.with(|s| {
        *s.borrow_mut() = Some(RandomnessSeed {
            current_seed: seed_array,
            creation_time: ic_cdk::api::time(),
            games_used: 0,
            max_games: MAX_GAMES_PER_SEED,
            nonce: 0,
        });
    });

    LAST_SEED_ROTATION.with(|t| {
        *t.borrow_mut() = ic_cdk::api::time();
    });

    // Release lock
    SEED_INIT_LOCK.with(|lock| {
        *lock.borrow_mut() = false;
    });
}

// Upgrade hooks
#[pre_upgrade]
fn pre_upgrade() {
    // Save seed state to stable memory
    let seed_state = SEED_STATE.with(|s| s.borrow().clone());
    let last_rotation = LAST_SEED_ROTATION.with(|t| *t.borrow());

    ic_cdk::storage::stable_save((seed_state, last_rotation))
        .expect("Failed to save seed state to stable memory");
}

#[post_upgrade]
fn post_upgrade() {
    // Restore seed state from stable memory
    let (seed_state, last_rotation): (Option<RandomnessSeed>, u64) =
        ic_cdk::storage::stable_restore()
            .unwrap_or((None, 0));

    SEED_STATE.with(|s| {
        *s.borrow_mut() = seed_state;
    });

    LAST_SEED_ROTATION.with(|t| {
        *t.borrow_mut() = last_rotation;
    });
}

// Calculate win chance and multiplier based on target and direction
fn calculate_win_chance(target: u8, direction: &RollDirection) -> f64 {
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

fn calculate_multiplier(win_chance: f64) -> f64 {
    if win_chance <= 0.0 {
        return 0.0;
    }
    ((1.0 - HOUSE_EDGE) / win_chance).min(100.0) // Cap at 100x
}

// Generate instant random number using seed+nonce+client_seed (0-100)
// Returns: (rolled_number, nonce, server_seed_hash)
fn generate_dice_roll_instant(client_seed: &str) -> Result<(u8, u64, String), String> {
    // If no seed initialized, use time-based fallback temporarily
    let has_seed = SEED_STATE.with(|s| s.borrow().is_some());

    if !has_seed {
        // Fallback: Use time-based entropy for first game before seed initialization
        let time = ic_cdk::api::time();
        let caller = ic_cdk::caller();
        let mut hasher = Sha256::new();
        hasher.update(time.to_be_bytes());
        hasher.update(caller.as_slice());
        hasher.update(client_seed.as_bytes());
        let hash = hasher.finalize();
        let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
        let roll = (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8;
        return Ok((roll, 0, "fallback".to_string()));
    }

    // Get current seed state and compute hash
    let (server_seed, nonce, server_seed_hash) = SEED_STATE.with(|s| {
        let mut state = s.borrow_mut();
        let seed_state = state.as_mut().ok_or("Seed not initialized")?;

        // Increment nonce for this game
        seed_state.nonce += 1;
        seed_state.games_used += 1;

        // Compute server seed hash for verification
        let mut seed_hasher = Sha256::new();
        seed_hasher.update(&seed_state.current_seed);
        let seed_hash = format!("{:x}", seed_hasher.finalize());

        Ok::<_, String>((seed_state.current_seed, seed_state.nonce, seed_hash))
    })?;

    // Combine server seed + client seed + nonce for unique result
    let mut hasher = Sha256::new();
    hasher.update(&server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    let hash = hasher.finalize();

    // Convert to 0-100 range
    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    let roll = (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8;
    Ok((roll, nonce, server_seed_hash))
}

// Play a game of dice
#[update]
fn play_dice(bet_amount: u64, target_number: u8, direction: RollDirection, client_seed: String) -> Result<DiceResult, String> {
    // Validate input
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet is {} ICP", MIN_BET / 100_000_000));
    }
    if bet_amount > MAX_BET {
        return Err(format!("Maximum bet is {} ICP", MAX_BET / 100_000_000));
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

    let caller = ic_cdk::caller();
    let win_chance = calculate_win_chance(target_number, &direction);

    // Ensure win chance is reasonable
    if win_chance < 0.01 || win_chance > 0.98 {
        return Err("Invalid target number - win chance must be between 1% and 98%".to_string());
    }

    // Validate client seed length (DoS protection)
    if client_seed.len() > 256 {
        return Err("Client seed too long (max 256 characters)".to_string());
    }

    // Check if seed needs rotation
    maybe_schedule_seed_rotation();

    let multiplier = calculate_multiplier(win_chance);
    let (rolled_number, nonce, server_seed_hash) = generate_dice_roll_instant(&client_seed)?;

    // Determine if player won
    let is_win = match direction {
        RollDirection::Over => rolled_number > target_number,
        RollDirection::Under => rolled_number < target_number,
    };

    let payout = if is_win {
        (bet_amount as f64 * multiplier) as u64
    } else {
        0
    };

    let result = DiceResult {
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

    // Store in history
    let game_id = NEXT_GAME_ID.with(|id| {
        let current = *id.borrow();
        *id.borrow_mut() = current + 1;
        current
    });

    GAME_HISTORY.with(|history| {
        history.borrow_mut().insert(game_id, result.clone());
    });

    // TODO: Actually transfer ICP for bet and payout

    Ok(result)
}

// Get game statistics
#[query]
fn get_stats() -> GameStats {
    GAME_STATS.with(|stats| stats.borrow().clone())
}

// Get recent games
#[query]
fn get_recent_games(limit: u32) -> Vec<DiceResult> {
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
#[query]
fn get_game(game_id: u64) -> Option<DiceResult> {
    GAME_HISTORY.with(|history| {
        history.borrow().get(&game_id)
    })
}

// Calculate what the multiplier would be for given parameters (helper for UI)
#[query]
fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
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

    if win_chance < 0.01 || win_chance > 0.98 {
        return Err("Win chance must be between 1% and 98%".to_string());
    }

    let multiplier = calculate_multiplier(win_chance);
    Ok((win_chance, multiplier))
}

// Simple greeting function for testing
#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Dice, {}! Roll the dice and test your luck!", name)
}

// Check if seed needs rotation and schedule if necessary
fn maybe_schedule_seed_rotation() {
    let needs_init = SEED_STATE.with(|s| s.borrow().is_none());

    if needs_init {
        // Initialize seed on first game
        ic_cdk::spawn(async {
            initialize_seed().await;
        });
        return;
    }

    let should_rotate = SEED_STATE.with(|s| {
        let state = s.borrow();
        if let Some(seed_state) = state.as_ref() {
            let now = ic_cdk::api::time();
            let time_elapsed = now - seed_state.creation_time;

            // Rotate if: too many games OR too much time
            seed_state.games_used >= seed_state.max_games ||
            time_elapsed >= SEED_ROTATION_INTERVAL_NS
        } else {
            false
        }
    });

    if should_rotate {
        // Schedule async rotation (non-blocking)
        ic_cdk::spawn(async {
            rotate_seed_async().await;
        });
    }
}

// Rotate the seed asynchronously
async fn rotate_seed_async() {
    // Check if we already rotated recently (prevent double rotation)
    let last_rotation = LAST_SEED_ROTATION.with(|t| *t.borrow());
    let now = ic_cdk::api::time();

    if now - last_rotation < 10_000_000_000 { // 10 seconds minimum between rotations
        return;
    }

    // Get new VRF seed
    if let Ok((random_bytes,)) = raw_rand().await {
        let mut hasher = Sha256::new();
        hasher.update(&random_bytes);
        let seed_array: [u8; 32] = hasher.finalize()[0..32].try_into().unwrap();

        // Update seed state
        SEED_STATE.with(|s| {
            *s.borrow_mut() = Some(RandomnessSeed {
                current_seed: seed_array,
                creation_time: now,
                games_used: 0,
                max_games: MAX_GAMES_PER_SEED,
                nonce: 0,
            });
        });

        LAST_SEED_ROTATION.with(|t| {
            *t.borrow_mut() = now;
        });

        ic_cdk::println!("Seed rotated successfully at {}", now);
    }
}

// Get current seed hash for provable fairness
#[query]
fn get_current_seed_hash() -> String {
    SEED_STATE.with(|s| {
        s.borrow().as_ref().map(|seed_state| {
            let mut hasher = Sha256::new();
            hasher.update(&seed_state.current_seed);
            format!("{:x}", hasher.finalize())
        }).unwrap_or_else(|| "No seed initialized".to_string())
    })
}

// Verify game result for provable fairness
#[query]
fn verify_game_result(
    server_seed: [u8; 32],
    client_seed: String,
    nonce: u64,
    expected_roll: u8
) -> Result<bool, String> {
    // Reconstruct the hash
    let mut hasher = Sha256::new();
    hasher.update(&server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    let hash = hasher.finalize();

    // Calculate the roll
    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    let calculated_roll = (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8;

    Ok(calculated_roll == expected_roll)
}

// Get seed information
#[query]
fn get_seed_info() -> (String, u64, u64) {
    SEED_STATE.with(|s| {
        s.borrow().as_ref().map(|seed_state| {
            let hash = {
                let mut hasher = Sha256::new();
                hasher.update(&seed_state.current_seed);
                format!("{:x}", hasher.finalize())
            };
            (hash, seed_state.games_used, seed_state.creation_time)
        }).unwrap_or(("Not initialized".to_string(), 0, 0))
    })
}
