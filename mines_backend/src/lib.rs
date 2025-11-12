use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::management_canister::main::raw_rand;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, Storable};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::cell::RefCell;

type Memory = VirtualMemory<DefaultMemoryImpl>;

// Mines game constants
const MIN_BET: u64 = 100_000_000; // 1 ICP
const MAX_BET: u64 = 10_000_000_000; // 100 ICP
const HOUSE_EDGE: f64 = 0.03; // 3% house edge
const GRID_SIZE: usize = 25; // 5x5 grid

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MinesGame {
    pub player: Principal,
    pub bet_amount: u64,
    pub num_mines: u8,
    pub revealed_tiles: Vec<u8>,
    pub mine_positions: Vec<u8>,
    pub current_multiplier: f64,
    pub is_active: bool,
    pub payout: Option<u64>,
    pub timestamp: u64,
}

#[derive(CandidType, Deserialize, Clone, Default)]
pub struct GameStats {
    pub total_games: u64,
    pub total_volume: u64,
    pub total_payouts: u64,
    pub house_profit: i64,
}

impl Storable for MinesGame {
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

    static GAME_HISTORY: RefCell<StableBTreeMap<u64, MinesGame, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
        )
    );

    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(0);
}

// Initialize canister
#[init]
fn init() {
    ic_cdk::println!("Mines Game Backend Initialized");
}

// Upgrade hooks
#[pre_upgrade]
fn pre_upgrade() {
    // State is already in stable memory
}

#[post_upgrade]
fn post_upgrade() {
    // State is restored from stable memory
}

// Calculate multiplier based on number of safe tiles revealed and mines
fn calculate_multiplier(safe_tiles_revealed: usize, num_mines: u8) -> f64 {
    let total_tiles = GRID_SIZE as f64;
    let mines = num_mines as f64;
    let safe_tiles = total_tiles - mines;

    // Probability of each successful reveal
    let mut multiplier = 1.0;
    for i in 0..safe_tiles_revealed {
        let remaining_safe = safe_tiles - i as f64;
        let remaining_total = total_tiles - i as f64;
        let prob = remaining_safe / remaining_total;
        multiplier *= (1.0 - HOUSE_EDGE) / prob;
    }

    multiplier
}

// Start a new mines game
#[update]
async fn start_game(bet_amount: u64, num_mines: u8) -> Result<u64, String> {
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet is {} ICP", MIN_BET / 100_000_000));
    }
    if bet_amount > MAX_BET {
        return Err(format!("Maximum bet is {} ICP", MAX_BET / 100_000_000));
    }
    if num_mines < 1 || num_mines > 24 {
        return Err("Number of mines must be between 1 and 24".to_string());
    }

    let caller = ic_cdk::caller();

    // Generate random mine positions
    let random_bytes = match raw_rand().await {
        Ok((bytes,)) => bytes,
        Err(_) => {
            let time = ic_cdk::api::time();
            let mut hasher = Sha256::new();
            hasher.update(time.to_be_bytes());
            hasher.finalize().to_vec()
        }
    };

    // Use Fisher-Yates shuffle to place mines
    let mut positions: Vec<u8> = (0..GRID_SIZE as u8).collect();
    for i in (1..GRID_SIZE).rev() {
        let j = (random_bytes[i % random_bytes.len()] as usize) % (i + 1);
        positions.swap(i, j);
    }
    let mine_positions = positions[0..num_mines as usize].to_vec();

    let game = MinesGame {
        player: caller,
        bet_amount,
        num_mines,
        revealed_tiles: Vec::new(),
        mine_positions,
        current_multiplier: 1.0,
        is_active: true,
        payout: None,
        timestamp: ic_cdk::api::time(),
    };

    let game_id = NEXT_GAME_ID.with(|id| {
        let current = *id.borrow();
        *id.borrow_mut() = current + 1;
        current
    });

    GAME_HISTORY.with(|history| {
        history.borrow_mut().insert(game_id, game);
    });

    Ok(game_id)
}

// Get game statistics
#[query]
fn get_stats() -> GameStats {
    GAME_STATS.with(|stats| stats.borrow().clone())
}

// Get recent games
#[query]
fn get_recent_games(limit: u32) -> Vec<MinesGame> {
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

// Simple greeting function for testing
#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Mines, {}!", name)
}