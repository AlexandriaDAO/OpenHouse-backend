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

// Plinko game constants
const MIN_BET: u64 = 100_000_000; // 1 ICP
const MAX_BET: u64 = 10_000_000_000; // 100 ICP
const HOUSE_EDGE: f64 = 0.03; // 3% house edge

// Plinko board configurations
const ROWS_8: u8 = 8;
const ROWS_12: u8 = 12;
const ROWS_16: u8 = 16;

// Risk levels affect multipliers
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

// Plinko game result
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct PlinkoResult {
    pub player: Principal,
    pub bet_amount: u64,
    pub rows: u8,
    pub risk: RiskLevel,
    pub path: Vec<bool>, // true = right, false = left
    pub final_position: u8,
    pub multiplier: f64,
    pub payout: u64,
    pub timestamp: u64,
}

#[derive(CandidType, Deserialize, Clone, Default)]
pub struct GameStats {
    pub total_games: u64,
    pub total_volume: u64,
    pub total_payouts: u64,
    pub house_profit: i64,
}

impl Storable for PlinkoResult {
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

    static GAME_HISTORY: RefCell<StableBTreeMap<u64, PlinkoResult, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
        )
    );

    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(0);
}

// Initialize canister
#[init]
fn init() {
    ic_cdk::println!("Plinko Game Backend Initialized");
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

// Get multipliers based on risk level and position
fn get_multiplier(rows: u8, risk: &RiskLevel, position: u8) -> f64 {
    match rows {
        8 => match risk {
            RiskLevel::Low => match position {
                0 | 8 => 5.6,
                1 | 7 => 2.1,
                2 | 6 => 1.1,
                3 | 5 => 1.0,
                4 => 0.5,
                _ => 0.0,
            },
            RiskLevel::Medium => match position {
                0 | 8 => 13.0,
                1 | 7 => 3.0,
                2 | 6 => 1.3,
                3 | 5 => 0.7,
                4 => 0.4,
                _ => 0.0,
            },
            RiskLevel::High => match position {
                0 | 8 => 29.0,
                1 | 7 => 4.0,
                2 | 6 => 1.5,
                3 | 5 => 0.3,
                4 => 0.2,
                _ => 0.0,
            },
        },
        12 => match risk {
            RiskLevel::Low => match position {
                0 | 12 => 10.0,
                1 | 11 => 3.0,
                2 | 10 => 1.6,
                3 | 9 => 1.4,
                4 | 8 => 1.1,
                5 | 7 => 1.0,
                6 => 0.5,
                _ => 0.0,
            },
            RiskLevel::Medium => match position {
                0 | 12 => 33.0,
                1 | 11 => 11.0,
                2 | 10 => 4.0,
                3 | 9 => 2.0,
                4 | 8 => 1.1,
                5 | 7 => 0.6,
                6 => 0.3,
                _ => 0.0,
            },
            RiskLevel::High => match position {
                0 | 12 => 170.0,
                1 | 11 => 24.0,
                2 | 10 => 8.1,
                3 | 9 => 2.0,
                4 | 8 => 0.7,
                5 | 7 => 0.2,
                6 => 0.2,
                _ => 0.0,
            },
        },
        16 => match risk {
            RiskLevel::Low => match position {
                0 | 16 => 16.0,
                1 | 15 => 9.0,
                2 | 14 => 2.0,
                3 | 13 => 1.4,
                4 | 12 => 1.4,
                5 | 11 => 1.2,
                6 | 10 => 1.1,
                7 | 9 => 1.0,
                8 => 0.5,
                _ => 0.0,
            },
            RiskLevel::Medium => match position {
                0 | 16 => 110.0,
                1 | 15 => 41.0,
                2 | 14 => 10.0,
                3 | 13 => 5.0,
                4 | 12 => 3.0,
                5 | 11 => 1.5,
                6 | 10 => 1.0,
                7 | 9 => 0.5,
                8 => 0.3,
                _ => 0.0,
            },
            RiskLevel::High => match position {
                0 | 16 => 1000.0,
                1 | 15 => 130.0,
                2 | 14 => 26.0,
                3 | 13 => 9.0,
                4 | 12 => 4.0,
                5 | 11 => 2.0,
                6 | 10 => 0.2,
                7 | 9 => 0.2,
                8 => 0.2,
                _ => 0.0,
            },
        },
        _ => 1.0,
    }
}

// Generate random ball path
async fn generate_ball_path(rows: u8) -> Vec<bool> {
    let random_bytes = match raw_rand().await {
        Ok((bytes,)) => bytes,
        Err(_) => {
            // Fallback to time-based pseudo-random
            let time = ic_cdk::api::time();
            let mut hasher = Sha256::new();
            hasher.update(time.to_be_bytes());
            hasher.finalize().to_vec()
        }
    };

    let mut path = Vec::new();
    for i in 0..rows {
        let byte_index = (i as usize) % random_bytes.len();
        let bit_index = (i % 8) as usize;
        let go_right = (random_bytes[byte_index] >> bit_index) & 1 == 1;
        path.push(go_right);
    }

    path
}

// Calculate final position from path
fn calculate_position(path: &[bool]) -> u8 {
    path.iter().filter(|&&direction| direction).count() as u8
}

// Play Plinko game
#[update]
async fn play_plinko(bet_amount: u64, rows: u8, risk: RiskLevel) -> Result<PlinkoResult, String> {
    // Validate input
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet is {} ICP", MIN_BET / 100_000_000));
    }
    if bet_amount > MAX_BET {
        return Err(format!("Maximum bet is {} ICP", MAX_BET / 100_000_000));
    }
    if ![8, 12, 16].contains(&rows) {
        return Err("Rows must be 8, 12, or 16".to_string());
    }

    let caller = ic_cdk::caller();
    let path = generate_ball_path(rows).await;
    let final_position = calculate_position(&path);
    let multiplier = get_multiplier(rows, &risk, final_position);
    let payout = (bet_amount as f64 * multiplier) as u64;

    let result = PlinkoResult {
        player: caller,
        bet_amount,
        rows,
        risk,
        path,
        final_position,
        multiplier,
        payout,
        timestamp: ic_cdk::api::time(),
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
fn get_recent_games(limit: u32) -> Vec<PlinkoResult> {
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

// Get multiplier table for configuration
#[query]
fn get_multipliers(rows: u8, risk: RiskLevel) -> Vec<f64> {
    if ![8, 12, 16].contains(&rows) {
        return vec![];
    }

    let positions = rows + 1;
    (0..positions)
        .map(|pos| get_multiplier(rows, &risk, pos))
        .collect()
}

// Simple greeting function for testing
#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Plinko, {}!", name)
}