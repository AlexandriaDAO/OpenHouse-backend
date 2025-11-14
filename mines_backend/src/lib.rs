use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::management_canister::main::raw_rand;
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, Storable};
use serde::Serialize;
use std::borrow::Cow;
use std::cell::RefCell;

type Memory = VirtualMemory<DefaultMemoryImpl>;

// Constants
const MIN_BET: u64 = 100_000_000; // 1 ICP
const MAX_BET: u64 = 10_000_000_000; // 100 ICP
const GRID_SIZE: usize = 25; // 5x5
const HOUSE_EDGE: f64 = 0.97; // 3% house edge

// ============ CORE GAME LOGIC (50 lines) ============

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MinesGame {
    pub player: Principal,
    pub bet_amount: u64,
    pub mines: [bool; GRID_SIZE], // true = mine, false = safe
    pub revealed: [bool; GRID_SIZE], // true = revealed
    pub num_mines: u8,
    pub is_active: bool,
    pub timestamp: u64,
}

impl MinesGame {
    // Calculate multiplier based on revealed tiles
    fn calculate_multiplier(&self) -> f64 {
        let revealed_count = self.revealed.iter().filter(|&&r| r).count();
        if revealed_count == 0 {
            return 1.0;
        }

        let safe_tiles = (GRID_SIZE - self.num_mines as usize) as f64;
        let mut multiplier = 1.0;

        for i in 0..revealed_count {
            let remaining_safe = safe_tiles - i as f64;
            let remaining_total = (GRID_SIZE - i) as f64;
            multiplier *= remaining_total / remaining_safe;
        }

        multiplier * HOUSE_EDGE
    }

    // Reveal a tile - returns (busted, new_multiplier)
    fn reveal_tile(&mut self, position: u8) -> Result<(bool, f64), String> {
        if position >= GRID_SIZE as u8 {
            return Err("Invalid position".to_string());
        }
        if !self.is_active {
            return Err("Game is not active".to_string());
        }
        if self.revealed[position as usize] {
            return Err("Tile already revealed".to_string());
        }

        self.revealed[position as usize] = true;

        // Check if hit mine
        if self.mines[position as usize] {
            self.is_active = false;
            return Ok((true, 0.0)); // Busted
        }

        let multiplier = self.calculate_multiplier();
        Ok((false, multiplier))
    }

    // Cash out - returns payout
    fn cash_out(&mut self) -> Result<u64, String> {
        if !self.is_active {
            return Err("Game is not active".to_string());
        }

        let multiplier = self.calculate_multiplier();
        self.is_active = false;

        Ok((self.bet_amount as f64 * multiplier) as u64)
    }
}

// ============ END CORE LOGIC ============

#[derive(CandidType, Deserialize, Clone, Default)]
pub struct GameStats {
    pub total_games: u64,
    pub total_wagered: u64,
    pub total_paid_out: u64,
    pub house_profit: i64,
}

#[derive(CandidType, Deserialize)]
pub struct RevealResult {
    pub busted: bool,
    pub multiplier: f64,
    pub payout: Option<u64>,
}

#[derive(CandidType, Deserialize)]
pub struct GameInfo {
    pub player: Principal,
    pub bet_amount: u64,
    pub revealed: Vec<bool>,
    pub num_mines: u8,
    pub is_active: bool,
    pub current_multiplier: f64,
}

#[derive(CandidType, Deserialize)]
pub struct GameSummary {
    pub game_id: u64,
    pub bet_amount: u64,
    pub num_mines: u8,
    pub is_active: bool,
    pub timestamp: u64,
}

impl Storable for MinesGame {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(serde_json::to_vec(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        serde_json::from_slice(&bytes).unwrap()
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Unbounded;
}

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static GAMES: RefCell<StableBTreeMap<u64, MinesGame, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
        )
    );

    static STATS: RefCell<GameStats> = RefCell::new(GameStats::default());
    static NEXT_ID: RefCell<u64> = RefCell::new(0);
}

// Generate random mines using VRF
async fn generate_mines(num_mines: u8) -> Result<[bool; GRID_SIZE], String> {
    let random_bytes = raw_rand()
        .await
        .map_err(|_| "Failed to get randomness")?
        .0;

    let mut mines = [false; GRID_SIZE];
    let mut positions: Vec<u8> = (0..GRID_SIZE as u8).collect();

    // Fisher-Yates shuffle
    for i in (1..GRID_SIZE).rev() {
        let j = (random_bytes[i % random_bytes.len()] as usize) % (i + 1);
        positions.swap(i, j);
    }

    // Place mines
    for i in 0..num_mines as usize {
        mines[positions[i] as usize] = true;
    }

    Ok(mines)
}

#[init]
fn init() {
    ic_cdk::println!("Mines Backend Initialized");
}

#[pre_upgrade]
fn pre_upgrade() {}

#[post_upgrade]
fn post_upgrade() {}

// Start new game
#[update]
async fn start_game(bet_amount: u64, num_mines: u8) -> Result<u64, String> {
    if bet_amount < MIN_BET || bet_amount > MAX_BET {
        return Err(format!("Bet must be between {} and {} ICP",
            MIN_BET / 100_000_000, MAX_BET / 100_000_000));
    }
    if num_mines < 1 || num_mines > 24 {
        return Err("Mines must be between 1 and 24".to_string());
    }

    let mines = generate_mines(num_mines).await?;

    let game = MinesGame {
        player: ic_cdk::caller(),
        bet_amount,
        mines,
        revealed: [false; GRID_SIZE],
        num_mines,
        is_active: true,
        timestamp: ic_cdk::api::time(),
    };

    let game_id = NEXT_ID.with(|id| {
        let current = *id.borrow();
        *id.borrow_mut() = current + 1;
        current
    });

    GAMES.with(|games| games.borrow_mut().insert(game_id, game));
    STATS.with(|stats| stats.borrow_mut().total_games += 1);

    Ok(game_id)
}

// Reveal a tile
#[update]
fn reveal_tile(game_id: u64, position: u8) -> Result<RevealResult, String> {
    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let mut game = games.get(&game_id).ok_or("Game not found")?;

        if game.player != ic_cdk::caller() {
            return Err("Not your game".to_string());
        }

        let (busted, multiplier) = game.reveal_tile(position)?;

        let payout = if busted {
            STATS.with(|stats| {
                let mut stats = stats.borrow_mut();
                stats.total_wagered += game.bet_amount;
                stats.house_profit += game.bet_amount as i64;
            });
            None
        } else {
            Some((game.bet_amount as f64 * multiplier) as u64)
        };

        games.insert(game_id, game);

        Ok(RevealResult {
            busted,
            multiplier,
            payout,
        })
    })
}

// Cash out
#[update]
fn cash_out(game_id: u64) -> Result<u64, String> {
    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let mut game = games.get(&game_id).ok_or("Game not found")?;

        if game.player != ic_cdk::caller() {
            return Err("Not your game".to_string());
        }

        let payout = game.cash_out()?;

        STATS.with(|stats| {
            let mut stats = stats.borrow_mut();
            stats.total_wagered += game.bet_amount;
            stats.total_paid_out += payout;
            stats.house_profit += game.bet_amount as i64 - payout as i64;
        });

        games.insert(game_id, game);
        Ok(payout)
    })
}

// Query game state (without revealing mines)
#[query]
fn get_game(game_id: u64) -> Result<GameInfo, String> {
    GAMES.with(|games| {
        let game = games.borrow().get(&game_id).ok_or("Game not found")?;
        let multiplier = game.calculate_multiplier();

        Ok(GameInfo {
            player: game.player,
            bet_amount: game.bet_amount,
            revealed: game.revealed.to_vec(),
            num_mines: game.num_mines,
            is_active: game.is_active,
            current_multiplier: multiplier,
        })
    })
}

// Query stats
#[query]
fn get_stats() -> GameStats {
    STATS.with(|stats| stats.borrow().clone())
}

// Get recent games for a player
#[query]
fn get_recent_games(limit: u32) -> Vec<GameSummary> {
    let caller = ic_cdk::caller();
    GAMES.with(|games| {
        games
            .borrow()
            .iter()
            .rev()
            .filter(|(_, game)| game.player == caller)
            .take(limit as usize)
            .map(|(id, game)| GameSummary {
                game_id: id,
                bet_amount: game.bet_amount,
                num_mines: game.num_mines,
                is_active: game.is_active,
                timestamp: game.timestamp,
            })
            .collect()
    })
}

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Mines, {}!", name)
}
