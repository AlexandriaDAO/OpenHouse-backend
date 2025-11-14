use candid::{CandidType, Deserialize, Nat, Principal};
use ic_cdk::api::management_canister::main::raw_rand;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, StableCell, Storable};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::cell::RefCell;

// Accounting module for deposit/withdraw functionality
mod accounting;
pub use accounting::{
    deposit, withdraw, get_balance, get_my_balance, get_house_balance,
    get_accounting_stats, audit_balances, refresh_canister_balance,
    AccountingStats, Account,
};

// Seed management structure
#[derive(Clone, Debug, Serialize, Deserialize, CandidType, Default)]
struct RandomnessSeed {
    current_seed: [u8; 32],
    creation_time: u64,
    games_used: u64,
    max_games: u64,
    nonce: u64,
}

impl Storable for RandomnessSeed {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Bounded {
        max_size: 256,
        is_fixed_size: false,
    };
}

// Rotation history for verification
#[derive(Clone, Debug, Serialize, Deserialize, CandidType)]
struct SeedRotationRecord {
    seed_hash: String,
    start_nonce: u64,
    end_nonce: u64,
    timestamp: u64,
}

impl Storable for SeedRotationRecord {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Unbounded;
}

// Global seed state using stable structures
thread_local! {
    static SEED_STATE: RefCell<Option<RandomnessSeed>> = RefCell::new(None);
    static SEED_INIT_LOCK: RefCell<bool> = RefCell::new(false);

    // Stable cells for persistence
    static SEED_CELL: RefCell<StableCell<RandomnessSeed, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))),
            RandomnessSeed::default()
        ).unwrap()
    );

    static LAST_ROTATION_CELL: RefCell<StableCell<u64, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(2))),
            0u64
        ).unwrap()
    );

    static ROTATION_HISTORY: RefCell<StableBTreeMap<u64, SeedRotationRecord, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(3))),
        )
    );

    static NEXT_ROTATION_ID: RefCell<u64> = RefCell::new(0);
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

    let now = ic_cdk::api::time();
    let new_seed = RandomnessSeed {
        current_seed: seed_array,
        creation_time: now,
        games_used: 0,
        max_games: MAX_GAMES_PER_SEED,
        nonce: 0,
    };

    // Save to volatile state
    SEED_STATE.with(|s| {
        *s.borrow_mut() = Some(new_seed.clone());
    });

    // Persist to stable cell
    SEED_CELL.with(|cell| {
        cell.borrow_mut().set(new_seed).expect("Failed to save seed to stable cell");
    });

    // Update last rotation timestamp
    LAST_ROTATION_CELL.with(|cell| {
        cell.borrow_mut().set(now).expect("Failed to save rotation time");
    });

    // Release lock
    SEED_INIT_LOCK.with(|lock| {
        *lock.borrow_mut() = false;
    });
}

// Upgrade hooks
#[pre_upgrade]
fn pre_upgrade() {
    // Seed state is already in stable cells - no action needed
    // StableCell and StableBTreeMap handle persistence automatically

    // Preserve accounting state
    accounting::pre_upgrade_accounting();
}

#[post_upgrade]
fn post_upgrade() {
    // Restore seed state from stable cell
    let seed = SEED_CELL.with(|cell| cell.borrow().get().clone());

    // Only restore if seed was actually initialized (not default)
    if seed.creation_time > 0 {
        SEED_STATE.with(|s| {
            *s.borrow_mut() = Some(seed);
        });
    }

    // Restore accounting state
    accounting::post_upgrade_accounting();
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
    // Get current seed state and compute hash
    let (server_seed, nonce, server_seed_hash) = SEED_STATE.with(|s| {
        let mut state = s.borrow_mut();
        let seed_state = state.as_mut().ok_or(
            "Randomness seed initializing, please retry in a moment"
        )?;

        // Increment nonce for this game
        seed_state.nonce += 1;
        seed_state.games_used += 1;

        // Compute server seed hash for verification
        let mut seed_hasher = Sha256::new();
        seed_hasher.update(&seed_state.current_seed);
        let seed_hash = format!("{:x}", seed_hasher.finalize());

        // Update stable cell with new state
        SEED_CELL.with(|cell| {
            let _ = cell.borrow_mut().set(seed_state.clone());
        });

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
async fn play_dice(bet_amount: u64, target_number: u8, direction: RollDirection, client_seed: String) -> Result<DiceResult, String> {
    let caller = ic_cdk::caller();

    // P0-2 FIX: Refresh house balance cache before game
    accounting::refresh_canister_balance().await;

    // Check user has sufficient internal balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < bet_amount {
        return Err(format!("Insufficient balance. You have {} e8s, need {} e8s. Please deposit more ICP.",
                          user_balance, bet_amount));
    }

    // Calculate max bet based on house balance
    let house_balance = accounting::get_house_balance();
    let max_payout = (bet_amount as f64 * 100.0) as u64; // Max 100x multiplier
    if max_payout > house_balance {
        return Err(format!("Bet too large. House only has {} e8s, max payout would be {} e8s",
                          house_balance, max_payout));
    }

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

    let win_chance = calculate_win_chance(target_number, &direction);

    // Ensure win chance is reasonable
    if win_chance < 0.01 || win_chance > 0.98 {
        return Err("Invalid target number - win chance must be between 1% and 98%".to_string());
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

// Get canister ICP balance (async call to ledger)
#[update]
async fn get_canister_balance() -> u64 {
    let account = Account {
        owner: ic_cdk::id(),
        subaccount: None,
    };

    let ledger = Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let result: Result<(Nat,), _> = ic_cdk::call(ledger, "icrc1_balance_of", (account,)).await;

    match result {
        Ok((balance,)) => {
            // Convert Nat to u64
            balance.0.try_into().unwrap_or(0)
        }
        Err(e) => {
            ic_cdk::println!("Failed to query canister balance: {:?}", e);
            0
        }
    }
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
    let last_rotation = LAST_ROTATION_CELL.with(|cell| cell.borrow().get().clone());
    let now = ic_cdk::api::time();

    if now - last_rotation < 10_000_000_000 { // 10 seconds minimum between rotations
        return;
    }

    // Save old seed to rotation history before rotating
    let old_seed_info = SEED_STATE.with(|s| {
        s.borrow().as_ref().map(|seed| {
            let mut hasher = Sha256::new();
            hasher.update(&seed.current_seed);
            let seed_hash = format!("{:x}", hasher.finalize());
            (seed_hash, seed.nonce, seed.games_used)
        })
    });

    if let Some((seed_hash, end_nonce, _games_used)) = old_seed_info {
        // Record rotation history
        let record = SeedRotationRecord {
            seed_hash,
            start_nonce: 1,
            end_nonce,
            timestamp: now,
        };

        let rotation_id = NEXT_ROTATION_ID.with(|id| {
            let current = *id.borrow();
            *id.borrow_mut() = current + 1;
            current
        });

        ROTATION_HISTORY.with(|history| {
            history.borrow_mut().insert(rotation_id, record);
        });
    }

    // Get new VRF seed
    if let Ok((random_bytes,)) = raw_rand().await {
        let mut hasher = Sha256::new();
        hasher.update(&random_bytes);
        let seed_array: [u8; 32] = hasher.finalize()[0..32].try_into().unwrap();

        let new_seed = RandomnessSeed {
            current_seed: seed_array,
            creation_time: now,
            games_used: 0,
            max_games: MAX_GAMES_PER_SEED,
            nonce: 0,
        };

        // Update volatile state
        SEED_STATE.with(|s| {
            *s.borrow_mut() = Some(new_seed.clone());
        });

        // Persist to stable cells
        SEED_CELL.with(|cell| {
            let _ = cell.borrow_mut().set(new_seed);
        });

        LAST_ROTATION_CELL.with(|cell| {
            let _ = cell.borrow_mut().set(now);
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

// Get rotation history for verification
#[query]
fn get_rotation_history(limit: u32) -> Vec<(u64, SeedRotationRecord)> {
    ROTATION_HISTORY.with(|history| {
        history.borrow()
            .iter()
            .rev()
            .take(limit as usize)
            .map(|(id, record)| (id, record))
            .collect()
    })
}
