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

// Game constants
const MIN_BET: u64 = 100_000_000; // 1 ICP
const MAX_BET: u64 = 10_000_000_000; // 100 ICP
const HOUSE_EDGE: f64 = 0.03; // 3% house edge
const MIN_MULTIPLIER: f64 = 1.01;
const MAX_MULTIPLIER: f64 = 1000.0;
const ROUND_DELAY_SECONDS: u64 = 10;

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct GameRound {
    pub id: u64,
    pub crash_point: f64,
    pub start_time: u64,
    pub end_time: Option<u64>,
    pub total_bets: u64,
    pub total_payouts: u64,
    pub status: RoundStatus,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum RoundStatus {
    Waiting,
    Running,
    Crashed,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct PlayerBet {
    pub player: Principal,
    pub amount: u64,
    pub cash_out_multiplier: Option<f64>,
    pub payout: Option<u64>,
    pub round_id: u64,
}

#[derive(CandidType, Deserialize, Clone, Default)]
pub struct GameState {
    pub current_round: Option<GameRound>,
    pub next_round_id: u64,
    pub total_volume: u64,
    pub game_paused: bool,
}

impl Storable for GameRound {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound = ic_stable_structures::storable::Bound::Unbounded;
}

impl Storable for PlayerBet {
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

    static GAME_STATE: RefCell<GameState> = RefCell::new(GameState::default());

    static ROUNDS: RefCell<StableBTreeMap<u64, GameRound, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
        )
    );

    static BETS: RefCell<StableBTreeMap<u64, PlayerBet, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))),
        )
    );
}

// Initialize canister
#[init]
fn init() {
    ic_cdk::println!("Crash Game Backend Initialized");
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

// Generate cryptographically secure crash point
async fn generate_crash_point() -> f64 {
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

    let mut hasher = Sha256::new();
    hasher.update(&random_bytes);
    let hash = hasher.finalize();

    let h = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    let e = 2u64.pow(52);

    // Calculate crash point with house edge
    let crash = ((100.0 * e as f64 - h as f64) / (e as f64 - h as f64)) / (100.0 - HOUSE_EDGE);
    crash.max(MIN_MULTIPLIER).min(MAX_MULTIPLIER)
}

// Start a new game round
#[update]
async fn start_new_round() -> Result<GameRound, String> {
    GAME_STATE.with(|state| {
        let state = state.borrow_mut();

        if state.game_paused {
            return Err("Game is paused".to_string());
        }

        if state.current_round.is_some() {
            return Err("Round already in progress".to_string());
        }

        Ok(())
    })?;

    let crash_point = generate_crash_point().await;
    let round_id = GAME_STATE.with(|state| {
        let mut state = state.borrow_mut();
        let id = state.next_round_id;
        state.next_round_id += 1;
        id
    });

    let new_round = GameRound {
        id: round_id,
        crash_point,
        start_time: ic_cdk::api::time(),
        end_time: None,
        total_bets: 0,
        total_payouts: 0,
        status: RoundStatus::Waiting,
    };

    GAME_STATE.with(|state| {
        state.borrow_mut().current_round = Some(new_round.clone());
    });

    ROUNDS.with(|rounds| {
        rounds.borrow_mut().insert(round_id, new_round.clone());
    });

    Ok(new_round)
}

// Place a bet
#[update]
fn place_bet(amount: u64) -> Result<PlayerBet, String> {
    if amount < MIN_BET {
        return Err(format!("Minimum bet is {} ICP", MIN_BET / 100_000_000));
    }

    if amount > MAX_BET {
        return Err(format!("Maximum bet is {} ICP", MAX_BET / 100_000_000));
    }

    let caller = ic_cdk::caller();

    GAME_STATE.with(|state| {
        let state = state.borrow();

        match &state.current_round {
            Some(round) if matches!(round.status, RoundStatus::Waiting) => {
                let bet = PlayerBet {
                    player: caller,
                    amount,
                    cash_out_multiplier: None,
                    payout: None,
                    round_id: round.id,
                };

                // TODO: Actually deduct ICP from player's balance

                Ok(bet)
            }
            _ => Err("No round accepting bets".to_string())
        }
    })
}

// Cash out from current round
#[update]
fn cash_out() -> Result<u64, String> {
    let _caller = ic_cdk::caller();

    GAME_STATE.with(|state| {
        let state = state.borrow();

        match &state.current_round {
            Some(round) if matches!(round.status, RoundStatus::Running) => {
                // TODO: Calculate current multiplier based on time
                // TODO: Find player's bet for this round
                // TODO: Calculate payout and transfer ICP

                Ok(0) // Placeholder
            }
            _ => Err("Cannot cash out now".to_string())
        }
    })
}

// Get current game state
#[query]
fn get_game_state() -> GameState {
    GAME_STATE.with(|state| state.borrow().clone())
}

// Get round by ID
#[query]
fn get_round(round_id: u64) -> Option<GameRound> {
    ROUNDS.with(|rounds| rounds.borrow().get(&round_id))
}

// Get recent rounds
#[query]
fn get_recent_rounds(limit: u32) -> Vec<GameRound> {
    ROUNDS.with(|rounds| {
        let rounds = rounds.borrow();
        rounds
            .iter()
            .rev()
            .take(limit as usize)
            .map(|(_, round)| round)
            .collect()
    })
}

// Admin functions
#[update]
fn pause_game() -> Result<(), String> {
    // TODO: Add admin authorization
    GAME_STATE.with(|state| {
        state.borrow_mut().game_paused = true;
    });
    Ok(())
}

#[update]
fn resume_game() -> Result<(), String> {
    // TODO: Add admin authorization
    GAME_STATE.with(|state| {
        state.borrow_mut().game_paused = false;
    });
    Ok(())
}

// Simple greeting function for testing
#[query]
fn greet(name: String) -> String {
    format!("Welcome to ICP Crash Game, {}!", name)
}