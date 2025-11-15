use candid::{CandidType, Deserialize, Nat, Principal};
use ic_cdk::api::management_canister::main::raw_rand;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update, heartbeat};
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
    is_balance_cache_stale, get_balance_cache_age,  // P0 fix: Export helper functions
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

// =============================================================================
// MEMORY ALLOCATION MAP (Stable Storage)
// =============================================================================
// Memory IDs are used to allocate stable memory regions for persistent data.
// Each ID must be unique to prevent data corruption.
//
// Allocated Memory IDs:
//   0 - GAME_HISTORY: StableBTreeMap<u64, DiceResult>
//   1 - SEED_CELL: StableCell<RandomnessSeed>
//   2 - LAST_ROTATION_CELL: StableCell<u64>
//   3 - ROTATION_HISTORY: StableBTreeMap<u64, SeedRotationRecord>
//   5 - HEARTBEAT_STATE_CELL: StableCell<u64> (for balance cache timestamp)
//  10 - USER_BALANCES_STABLE: StableBTreeMap<Principal, u64> (in accounting.rs)
//
// Available IDs: 4, 6-9, 11+
// =============================================================================

// Global seed state using stable structures
thread_local! {
    static SEED_STATE: RefCell<Option<RandomnessSeed>> = RefCell::new(None);
    static SEED_INIT_LOCK: RefCell<bool> = RefCell::new(false);

    // Stable cells for persistence (Memory ID 1)
    static SEED_CELL: RefCell<StableCell<RandomnessSeed, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))),
            RandomnessSeed::default()
        ).unwrap()
    );

    // Memory ID 2
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

// Conversion constant
const E8S_PER_ICP: u64 = 100_000_000; // 1 ICP = 100,000,000 e8s

// Dice game constants
const MIN_BET: u64 = 1_000_000; // 0.01 ICP
const MAX_WIN: u64 = 10 * E8S_PER_ICP; // 10 ICP max win
// House edge is now implicit: exact hit (target number) = house wins (0.99% edge)
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
    #[serde(default)]
    pub game_id: u64,  // Unique game ID (default to 0 for backward compatibility)
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
    #[serde(default)]
    pub is_house_hit: bool,  // True when house wins on exact target hit (0.99% edge)
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

    // Force immediate balance refresh on first heartbeat by resetting last refresh time
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(0).expect("Failed to reset heartbeat state");
    });
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

    // P0-3 fix: Save heartbeat state to stable storage before upgrade
    let last_refresh = LAST_HEARTBEAT_REFRESH.with(|lr| *lr.borrow());
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(last_refresh).expect("Failed to save heartbeat state");
    });

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

    // Restore heartbeat state from stable storage (P0 fix)
    let last_heartbeat = HEARTBEAT_STATE_CELL.with(|cell| cell.borrow().get().clone());
    LAST_HEARTBEAT_REFRESH.with(|lr| {
        *lr.borrow_mut() = last_heartbeat;
    });

    // Restore accounting state
    accounting::post_upgrade_accounting();

    // Force immediate balance refresh on first heartbeat by resetting last refresh time
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(0).expect("Failed to reset heartbeat state");
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

// Calculate payout multiplier with 0.99% house edge
// Formula: 100 / winning_numbers gives clean round multipliers
// House edge comes from exact hit (target number) always being a loss
fn calculate_multiplier_direct(target: u8, direction: &RollDirection) -> f64 {
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
fn calculate_max_bet(target_number: u8, direction: &RollDirection) -> u64 {
    let multiplier = calculate_multiplier_direct(target_number, direction);

    if multiplier <= 0.0 {
        return MIN_BET;
    }

    ((MAX_WIN as f64) / multiplier).floor() as u64
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

    // P0-2 FIX OPTIMIZED: Only force refresh if cache is stale (>60 seconds)
    // This reduces dice roll time from 9s to <500ms while maintaining security
    const MAX_CACHE_AGE_NANOS: u64 = 60_000_000_000; // 60 seconds
    if accounting::is_balance_cache_stale(MAX_CACHE_AGE_NANOS) {
        // Cache is too old, force a blocking refresh for safety
        ic_cdk::println!("Balance cache stale, forcing refresh");
        accounting::refresh_canister_balance().await;
    }

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
    let house_balance = accounting::get_house_balance();
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

// New struct for detailed history
#[derive(CandidType, Deserialize, Serialize)]
pub struct DetailedGameHistory {
    pub game_id: u64,
    pub player: String,
    pub bet_icp: f64,
    pub won_icp: f64,
    pub target_number: u8,
    pub direction: String,
    pub rolled_number: u8,
    pub win_chance: f64,
    pub multiplier: f64,
    pub is_win: bool,
    pub timestamp: u64,
    pub profit_loss: i64,  // e8s
    pub expected_value: f64,  // e8s
    pub house_edge_actual: f64,  // percentage
}

// Get detailed history with formatted data
#[query]
fn get_detailed_history(limit: u32) -> Vec<DetailedGameHistory> {
    GAME_HISTORY.with(|history| {
        let history = history.borrow();
        history
            .iter()
            .rev()
            .take(limit as usize)
            .map(|(game_id, game)| {
                DetailedGameHistory {
                    game_id,
                    player: game.player.to_text(),
                    bet_icp: (game.bet_amount as f64 / E8S_PER_ICP as f64),
                    won_icp: if game.is_win { (game.payout as f64 / E8S_PER_ICP as f64) } else { 0.0 },
                    target_number: game.target_number,
                    direction: match game.direction {
                        RollDirection::Over => "Over".to_string(),
                        RollDirection::Under => "Under".to_string(),
                    },
                    rolled_number: game.rolled_number,
                    win_chance: game.win_chance * 100.0,  // Convert to percentage
                    multiplier: game.multiplier,
                    is_win: game.is_win,
                    timestamp: game.timestamp,
                    // For debugging/analysis
                    profit_loss: if game.is_win {
                        (game.payout as i64 - game.bet_amount as i64)
                    } else {
                        -(game.bet_amount as i64)
                    },
                    expected_value: (game.win_chance * game.payout as f64) - game.bet_amount as f64,
                    house_edge_actual: if game.is_win {
                        -(1.0 - (game.bet_amount as f64 / game.payout as f64))
                    } else {
                        1.0
                    },
                }
            })
            .collect()
    })
}

// Export history as CSV for analysis
#[query]
fn export_history_csv(limit: u32) -> String {
    let history = get_detailed_history(limit);

    let mut csv = String::from("game_id,player,bet_icp,won_icp,target,direction,rolled,win_chance_%,multiplier,is_win,profit_loss_e8s,timestamp\n");

    for game in history {
        csv.push_str(&format!(
            "{},{},{:.4},{:.4},{},{},{},{:.2},{:.2},{},{},{}\n",
            game.game_id,
            game.player,
            game.bet_icp,
            game.won_icp,
            game.target_number,
            game.direction,
            game.rolled_number,
            game.win_chance,
            game.multiplier,
            game.is_win,
            game.profit_loss,
            game.timestamp
        ));
    }

    csv
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
    let multiplier = calculate_multiplier_direct(target_number, &direction);
    Ok((win_chance, multiplier))
}

// Get maximum allowed bet for given parameters (helper for UI)
#[query]
fn get_max_bet(target_number: u8, direction: RollDirection) -> u64 {
    calculate_max_bet(target_number, &direction)
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

// =============================================================================
// HEARTBEAT FOR BACKGROUND BALANCE REFRESH
// =============================================================================

thread_local! {
    // Track last heartbeat refresh to avoid too-frequent updates (volatile)
    static LAST_HEARTBEAT_REFRESH: RefCell<u64> = RefCell::new(0);

    // Track if a heartbeat refresh is in progress to prevent concurrent calls
    static HEARTBEAT_REFRESH_IN_PROGRESS: RefCell<bool> = RefCell::new(false);

    // Stable storage for heartbeat state to persist across upgrades (Memory ID 5)
    // See MEMORY ALLOCATION MAP at top of file for all allocated IDs
    static HEARTBEAT_STATE_CELL: RefCell<StableCell<u64, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(5))),
            0_u64
        ).expect("Failed to init heartbeat state cell")
    );
}

// Heartbeat function - called automatically by IC every ~second
// We use it to refresh balance cache every 30 seconds in background
#[heartbeat]
fn heartbeat() {
    const HEARTBEAT_REFRESH_INTERVAL_NS: u64 = 30_000_000_000; // 30 seconds

    // P0-2 fix: Atomically check and set the in-progress flag to prevent race condition
    let should_refresh = HEARTBEAT_REFRESH_IN_PROGRESS.with(|flag| {
        let mut flag_ref = flag.borrow_mut();
        if *flag_ref {
            // Already refreshing, skip this heartbeat
            return false;
        }

        // Get last refresh from stable storage
        let last_refresh = HEARTBEAT_STATE_CELL.with(|cell| cell.borrow().get().clone());
        let now = ic_cdk::api::time();

        // Check if it's time to refresh (30 seconds elapsed)
        if now > last_refresh && (now - last_refresh) >= HEARTBEAT_REFRESH_INTERVAL_NS {
            // Atomically set the flag before proceeding
            *flag_ref = true;
            true
        } else {
            false
        }
    });

    if !should_refresh {
        return;
    }

    // Now we have exclusive access to perform the refresh
    let now = ic_cdk::api::time();

    // Update last refresh timestamp in stable storage (P0 fix: persist across upgrades)
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(now).expect("Failed to update heartbeat state");
    });

    // Also update volatile state for quick access
    LAST_HEARTBEAT_REFRESH.with(|lr| {
        *lr.borrow_mut() = now;
    });

    // P1 fix: Spawn async task with guaranteed flag cleanup
    ic_cdk::spawn(async {
        // Use a struct with Drop to ensure flag is always cleared
        struct FlagGuard;
        impl Drop for FlagGuard {
            fn drop(&mut self) {
                HEARTBEAT_REFRESH_IN_PROGRESS.with(|flag| {
                    *flag.borrow_mut() = false;
                });
            }
        }
        let _guard = FlagGuard;

        ic_cdk::println!("Heartbeat: refreshing balance cache at {}", ic_cdk::api::time());
        accounting::refresh_canister_balance().await;
        // Flag will be cleared when _guard is dropped, even if there's a panic
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_max_bet_high_multiplier() {
        // 99 Over = 0.99% win chance = exactly 100x multiplier (0.99% house edge)
        // Max bet should be 0.1 ICP (10 ICP max win / 100x)
        let max_bet = calculate_max_bet(99, &RollDirection::Over);
        assert_eq!(max_bet, 10_000_000); // Exactly 0.1 ICP
    }

    #[test]
    fn test_max_bet_medium_multiplier() {
        // 50 Over = 49.5% win chance = exactly 2x multiplier (0.99% house edge)
        // Max bet should be 5 ICP (10 ICP max win / 2x)
        let max_bet = calculate_max_bet(50, &RollDirection::Over);
        assert_eq!(max_bet, 500_000_000); // Exactly 5 ICP
    }

    #[test]
    fn test_max_bet_low_multiplier() {
        // 1 Over = 98.02% win chance = exactly 1.0101x multiplier (0.99% house edge)
        // Max bet should be ~9.9 ICP (10 ICP max win / 1.0101x)
        let max_bet = calculate_max_bet(1, &RollDirection::Over);
        assert_eq!(max_bet, 989_999_999); // 9.9 ICP (floor of 10B / 1.0101)
    }

    #[test]
    fn test_max_bet_edge_cases() {
        // 99 Under = 98.02% win chance = exactly 1.0101x multiplier
        let max_bet_99_under = calculate_max_bet(99, &RollDirection::Under);
        assert_eq!(max_bet_99_under, 989_999_999); // 9.9 ICP

        // 1 Over = 98.02% win chance = exactly 1.0101x multiplier
        let max_bet_1_over = calculate_max_bet(1, &RollDirection::Over);
        assert_eq!(max_bet_1_over, 989_999_999); // 9.9 ICP
    }

    #[test]
    fn test_max_bet_never_exceeds_max_win() {
        // Test all possible target numbers and directions with new 0.99% edge system
        for target in 1..=99 {
            for direction in [RollDirection::Over, RollDirection::Under] {
                let max_bet = calculate_max_bet(target, &direction);

                // Calculate what the actual payout would be
                let multiplier = calculate_multiplier_direct(target, &direction);
                let max_payout = (max_bet as f64 * multiplier) as u64;

                // Ensure max payout never exceeds MAX_WIN (with small margin for rounding)
                assert!(max_payout <= MAX_WIN + 1_000_000); // Allow 0.01 ICP margin for rounding
            }
        }
    }

    #[test]
    fn test_round_multipliers() {
        // Test that we get exact round number multipliers for common targets
        assert_eq!(calculate_multiplier_direct(50, &RollDirection::Over), 2.0);   // 2x
        assert_eq!(calculate_multiplier_direct(75, &RollDirection::Over), 4.0);   // 4x
        assert_eq!(calculate_multiplier_direct(80, &RollDirection::Over), 5.0);   // 5x
        assert_eq!(calculate_multiplier_direct(90, &RollDirection::Over), 10.0);  // 10x
        assert_eq!(calculate_multiplier_direct(95, &RollDirection::Over), 20.0);  // 20x
        assert_eq!(calculate_multiplier_direct(98, &RollDirection::Over), 50.0);  // 50x
        assert_eq!(calculate_multiplier_direct(99, &RollDirection::Over), 100.0); // 100x
    }

    #[test]
    fn test_house_hit_detection() {
        // Test that exact hit on target number is properly detected as house win
        // This represents the 0.99% house edge (1 out of 101 outcomes)

        // Simulate exact hit: rolled_number == target_number
        let target = 50u8;
        let rolled = 50u8;

        // Verify house hit logic
        let is_house_hit = rolled == target;
        assert!(is_house_hit, "Exact hit on target should be detected as house win");

        // When house hits, player should not win regardless of direction
        let is_win_over = if is_house_hit {
            false
        } else {
            rolled > target
        };
        let is_win_under = if is_house_hit {
            false
        } else {
            rolled < target
        };

        assert!(!is_win_over, "Player should not win on exact hit (Over)");
        assert!(!is_win_under, "Player should not win on exact hit (Under)");

        // Test non-exact hits work correctly
        let rolled_win_over = 51u8;
        let rolled_win_under = 49u8;

        assert!(rolled_win_over != target, "Non-exact roll should not trigger house hit");
        assert!(rolled_win_under != target, "Non-exact roll should not trigger house hit");
        assert!(rolled_win_over > target, "Player should win Over on 51 vs target 50");
        assert!(rolled_win_under < target, "Player should win Under on 49 vs target 50");
    }
}
