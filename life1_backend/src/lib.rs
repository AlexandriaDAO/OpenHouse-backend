use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{query, update, init};
use std::cell::RefCell;
use std::collections::HashMap;

// ============================================================================
// TYPES
// ============================================================================

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct Placement {
    pub player: Principal,
    pub pattern_name: String,
    pub x: i32,
    pub y: i32,
    pub generation: u64,
    pub timestamp: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameRoom {
    pub id: u64,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub created_at: u64,
    pub placements: Vec<Placement>,
    pub current_generation: u64,
    pub players: Vec<Principal>,
    pub territory: Vec<(Principal, u64)>,
    pub status: GameStatus,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub enum GameStatus {
    Waiting,
    Active,
    Finished,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameConfig {
    pub width: u32,
    pub height: u32,
    pub max_players: u8,
    pub generations_limit: Option<u64>,
}

// ============================================================================
// STATE
// ============================================================================

thread_local! {
    static GAMES: RefCell<HashMap<u64, GameRoom>> = RefCell::new(HashMap::new());
    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(1);
}

// ============================================================================
// GAME MANAGEMENT
// ============================================================================

#[init]
fn init() {
    ic_cdk::println!("Life1 Backend Initialized");
}

/// Create a new game room
#[update]
fn create_game(name: String, config: GameConfig) -> Result<u64, String> {
    let game_id = NEXT_GAME_ID.with(|id| {
        let current = *id.borrow();
        *id.borrow_mut() = current + 1;
        current
    });

    let caller = ic_cdk::api::msg_caller();
    let now = ic_cdk::api::time();

    let game = GameRoom {
        id: game_id,
        name,
        width: config.width.min(200),
        height: config.height.min(200),
        created_at: now,
        placements: Vec::new(),
        current_generation: 0,
        players: vec![caller],
        territory: Vec::new(),
        status: GameStatus::Waiting,
    };

    GAMES.with(|games| {
        games.borrow_mut().insert(game_id, game);
    });

    Ok(game_id)
}

/// Join an existing game
#[update]
fn join_game(game_id: u64) -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if game.status == GameStatus::Finished {
            return Err("Game already finished".to_string());
        }

        if !game.players.contains(&caller) {
            game.players.push(caller);
        }

        Ok(())
    })
}

/// Start the game (creator only)
#[update]
fn start_game(game_id: u64) -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if game.players.first() != Some(&caller) {
            return Err("Only creator can start game".to_string());
        }

        game.status = GameStatus::Active;
        Ok(())
    })
}

// ============================================================================
// PLACEMENT (Core multiplayer sync)
// ============================================================================

/// Place a pattern on the board
#[update]
fn place_pattern(
    game_id: u64,
    pattern_name: String,
    x: i32,
    y: i32,
    at_generation: u64
) -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    let now = ic_cdk::api::time();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if game.status != GameStatus::Active {
            return Err("Game not active".to_string());
        }

        if !game.players.contains(&caller) {
            return Err("Not a player in this game".to_string());
        }

        let placement = Placement {
            player: caller,
            pattern_name,
            x,
            y,
            generation: at_generation,
            timestamp: now,
        };

        game.placements.push(placement);
        Ok(game.placements.len() as u64 - 1)
    })
}

/// Get placements since a given index (for polling)
#[query]
fn get_placements_since(game_id: u64, since_index: u64) -> Result<Vec<Placement>, String> {
    GAMES.with(|games| {
        let games = games.borrow();
        let game = games.get(&game_id).ok_or("Game not found")?;

        let since = since_index as usize;
        if since >= game.placements.len() {
            return Ok(Vec::new());
        }

        Ok(game.placements[since..].to_vec())
    })
}

/// Update current generation (called by any frontend to sync)
#[update]
fn report_generation(game_id: u64, generation: u64) -> Result<(), String> {
    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if generation > game.current_generation {
            game.current_generation = generation;
        }

        Ok(())
    })
}

// ============================================================================
// TERRITORY / SCORING
// ============================================================================

/// Submit territory snapshot (periodic, from authoritative frontend or consensus)
#[update]
fn submit_territory_snapshot(
    game_id: u64,
    territory: Vec<(Principal, u64)>
) -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if !game.players.contains(&caller) {
            return Err("Not a player".to_string());
        }

        game.territory = territory;
        Ok(())
    })
}

/// Get current territory scores
#[query]
fn get_territory(game_id: u64) -> Result<Vec<(Principal, u64)>, String> {
    GAMES.with(|games| {
        let games = games.borrow();
        let game = games.get(&game_id).ok_or("Game not found")?;
        Ok(game.territory.clone())
    })
}

// ============================================================================
// QUERIES
// ============================================================================

/// List all active games
#[query]
fn list_games() -> Vec<(u64, String, GameStatus, u32)> {
    GAMES.with(|games| {
        games.borrow()
            .iter()
            .map(|(id, g)| (*id, g.name.clone(), g.status.clone(), g.players.len() as u32))
            .collect()
    })
}

/// Get full game state
#[query]
fn get_game(game_id: u64) -> Result<GameRoom, String> {
    GAMES.with(|games| {
        games.borrow()
            .get(&game_id)
            .cloned()
            .ok_or("Game not found".to_string())
    })
}

/// Get game info (lightweight)
#[query]
fn get_game_info(game_id: u64) -> Result<(String, GameStatus, u32, u64, u64), String> {
    GAMES.with(|games| {
        let games = games.borrow();
        let game = games.get(&game_id).ok_or("Game not found")?;
        Ok((
            game.name.clone(),
            game.status.clone(),
            game.players.len() as u32,
            game.placements.len() as u64,
            game.current_generation,
        ))
    })
}

#[query]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to Life MMO.", name)
}

// Export Candid interface
ic_cdk::export_candid!();
