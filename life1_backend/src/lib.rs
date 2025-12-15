use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{query, update, init};
use std::cell::RefCell;
use std::collections::HashMap;

// ============================================================================
// TYPES
// ============================================================================

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameRoom {
    pub id: u64,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub created_at: u64,
    // Grid stores owner ID: 0 = dead, 1-4 = player number
    pub grid: Vec<Vec<u8>>,
    // Territory tracks ownership (persists after cell dies)
    pub territory: Vec<Vec<u8>>,
    pub generation: u64,
    pub players: Vec<Principal>,
    pub status: GameStatus,
    pub is_running: bool,
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

/// Lightweight game state for polling (just what's needed to render)
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameState {
    pub grid: Vec<Vec<u8>>,
    pub territory: Vec<Vec<u8>>,
    pub generation: u64,
    pub players: Vec<Principal>,
    pub is_running: bool,
}

/// Game info for lobby listing
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameInfo {
    pub id: u64,
    pub name: String,
    pub status: GameStatus,
    pub player_count: u32,
    pub generation: u64,
}

// ============================================================================
// STATE
// ============================================================================

thread_local! {
    static GAMES: RefCell<HashMap<u64, GameRoom>> = RefCell::new(HashMap::new());
    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(1);
}

// ============================================================================
// HELPERS
// ============================================================================

fn create_empty_grid(width: u32, height: u32) -> Vec<Vec<u8>> {
    vec![vec![0u8; width as usize]; height as usize]
}

/// Count neighbors and their owners for a cell
fn get_neighbor_info(grid: &[Vec<u8>], row: usize, col: usize, height: usize, width: usize) -> (u8, [u8; 5]) {
    let mut count = 0u8;
    let mut owner_counts = [0u8; 5]; // Index 0 unused, 1-4 for players

    for di in [-1i32, 0, 1] {
        for dj in [-1i32, 0, 1] {
            if di == 0 && dj == 0 {
                continue;
            }
            let new_row = ((row as i32 + di + height as i32) as usize) % height;
            let new_col = ((col as i32 + dj + width as i32) as usize) % width;
            let owner = grid[new_row][new_col];
            if owner > 0 {
                count += 1;
                if (owner as usize) < owner_counts.len() {
                    owner_counts[owner as usize] += 1;
                }
            }
        }
    }
    (count, owner_counts)
}

/// Get majority owner from neighbor counts
fn get_majority_owner(owner_counts: &[u8; 5]) -> u8 {
    let mut max_count = 0u8;
    let mut max_owner = 1u8;
    for (owner, &count) in owner_counts.iter().enumerate().skip(1) {
        if count > max_count {
            max_count = count;
            max_owner = owner as u8;
        }
    }
    max_owner
}

/// Run one generation of Conway's Game of Life with ownership
fn step_generation(game: &mut GameRoom) {
    let height = game.height as usize;
    let width = game.width as usize;
    let mut new_grid = create_empty_grid(game.width, game.height);

    for row in 0..height {
        for col in 0..width {
            let (count, owner_counts) = get_neighbor_info(&game.grid, row, col, height, width);
            let current = game.grid[row][col];

            if current > 0 {
                // Living cell survives with 2 or 3 neighbors
                if count == 2 || count == 3 {
                    new_grid[row][col] = current;
                }
            } else {
                // Dead cell born with exactly 3 neighbors
                if count == 3 {
                    new_grid[row][col] = get_majority_owner(&owner_counts);
                }
            }
        }
    }

    // Update territory: any living cell claims its square
    for row in 0..height {
        for col in 0..width {
            if new_grid[row][col] > 0 {
                game.territory[row][col] = new_grid[row][col];
            }
        }
    }

    game.grid = new_grid;
    game.generation += 1;
}

// ============================================================================
// GAME MANAGEMENT
// ============================================================================

#[init]
fn init() {
    ic_cdk::println!("Life1 Backend Initialized - Backend Compute Mode");
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

    let width = config.width.min(200).max(10);
    let height = config.height.min(200).max(10);

    let game = GameRoom {
        id: game_id,
        name,
        width,
        height,
        created_at: now,
        grid: create_empty_grid(width, height),
        territory: create_empty_grid(width, height),
        generation: 0,
        players: vec![caller],
        status: GameStatus::Waiting,
        is_running: false,
    };

    GAMES.with(|games| {
        games.borrow_mut().insert(game_id, game);
    });

    Ok(game_id)
}

/// Join an existing game
#[update]
fn join_game(game_id: u64) -> Result<u8, String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if game.status == GameStatus::Finished {
            return Err("Game already finished".to_string());
        }

        if game.players.contains(&caller) {
            // Already in game, return existing player number
            let pos = game.players.iter().position(|p| *p == caller).unwrap();
            return Ok((pos + 1) as u8);
        }

        if game.players.len() >= 4 {
            return Err("Game is full".to_string());
        }

        game.players.push(caller);
        Ok(game.players.len() as u8)
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
// CELL PLACEMENT
// ============================================================================

/// Place cells on the grid. Frontend sends parsed pattern coords.
#[update]
fn place_cells(game_id: u64, cells: Vec<(i32, i32)>) -> Result<u32, String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if game.status != GameStatus::Active {
            return Err("Game not active".to_string());
        }

        // Find player number
        let player_num = game.players
            .iter()
            .position(|p| *p == caller)
            .map(|i| (i + 1) as u8)
            .ok_or("Not a player in this game")?;

        let width = game.width as i32;
        let height = game.height as i32;
        let mut placed = 0u32;

        for (x, y) in cells {
            // Wrap coordinates (toroidal)
            let col = ((x % width) + width) % width;
            let row = ((y % height) + height) % height;

            game.grid[row as usize][col as usize] = player_num;
            game.territory[row as usize][col as usize] = player_num;
            placed += 1;
        }

        Ok(placed)
    })
}

// ============================================================================
// SIMULATION CONTROL
// ============================================================================

/// Advance the simulation by n generations and return new state
#[update]
fn step(game_id: u64, n: u32) -> Result<GameState, String> {
    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if game.status != GameStatus::Active {
            return Err("Game not active".to_string());
        }

        // Limit steps per call to prevent timeout
        let steps = n.min(100);
        for _ in 0..steps {
            step_generation(game);
        }

        Ok(GameState {
            grid: game.grid.clone(),
            territory: game.territory.clone(),
            generation: game.generation,
            players: game.players.clone(),
            is_running: game.is_running,
        })
    })
}

/// Set the running state (for auto-step coordination)
#[update]
fn set_running(game_id: u64, running: bool) -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if !game.players.contains(&caller) {
            return Err("Not a player".to_string());
        }

        game.is_running = running;
        Ok(())
    })
}

/// Clear the grid (keep game active)
#[update]
fn clear_grid(game_id: u64) -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if !game.players.contains(&caller) {
            return Err("Not a player".to_string());
        }

        game.grid = create_empty_grid(game.width, game.height);
        game.territory = create_empty_grid(game.width, game.height);
        game.generation = 0;
        game.is_running = false;
        Ok(())
    })
}

// ============================================================================
// QUERIES
// ============================================================================

/// Get current game state for rendering (main polling endpoint)
#[query]
fn get_state(game_id: u64) -> Result<GameState, String> {
    GAMES.with(|games| {
        let games = games.borrow();
        let game = games.get(&game_id).ok_or("Game not found")?;
        Ok(GameState {
            grid: game.grid.clone(),
            territory: game.territory.clone(),
            generation: game.generation,
            players: game.players.clone(),
            is_running: game.is_running,
        })
    })
}

/// List all games (for lobby)
#[query]
fn list_games() -> Vec<GameInfo> {
    GAMES.with(|games| {
        games.borrow()
            .iter()
            .map(|(_, g)| GameInfo {
                id: g.id,
                name: g.name.clone(),
                status: g.status.clone(),
                player_count: g.players.len() as u32,
                generation: g.generation,
            })
            .collect()
    })
}

/// Get full game details
#[query]
fn get_game(game_id: u64) -> Result<GameRoom, String> {
    GAMES.with(|games| {
        games.borrow()
            .get(&game_id)
            .cloned()
            .ok_or("Game not found".to_string())
    })
}

#[query]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to Life MMO (Backend Compute Mode).", name)
}

// Export Candid interface
ic_cdk::export_candid!();
