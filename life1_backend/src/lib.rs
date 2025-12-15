use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{query, update, init, post_upgrade};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    storable::Bound,
    DefaultMemoryImpl, StableVec, Storable,
};
use std::borrow::Cow;
use std::cell::RefCell;

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_WIDTH: usize = 1000;
const GRID_HEIGHT: usize = 1000;
const GRID_SIZE: usize = GRID_WIDTH * GRID_HEIGHT;
const MAX_PLAYERS: usize = 10;

// Memory IDs for stable storage
const MEMORY_ID_GRID: MemoryId = MemoryId::new(0);
const MEMORY_ID_TERRITORY: MemoryId = MemoryId::new(1);
const MEMORY_ID_METADATA: MemoryId = MemoryId::new(2);

type Memory = VirtualMemory<DefaultMemoryImpl>;

// ============================================================================
// TYPES
// ============================================================================

/// Game state returned to frontend
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct LifeState {
    pub grid: Vec<Vec<u8>>,
    pub territory: Vec<Vec<u8>>,
    // Points stored in each cell (economics system)
    pub points: Vec<Vec<u16>>,
    // Player balances (index matches players array)
    pub player_balances: Vec<u64>,
    pub generation: u64,
    pub players: Vec<Principal>,
}

/// Metadata stored in stable memory (generation + players)
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
}

impl Storable for Metadata {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap_or_default()
    }

/// Extended game state with points (main polling endpoint for economics)
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameStateWithPoints {
    pub grid: Vec<Vec<u8>>,
    pub territory: Vec<Vec<u8>>,
    pub points: Vec<Vec<u16>>,  // Points stored in each cell
    pub generation: u64,
    pub players: Vec<Principal>,
    pub balances: Vec<u64>,     // Balance per player (index matches players)
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
// STABLE STATE
// ============================================================================

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    // Grid: 1000x1000 u8 values (player colors 0-10)
    static GRID: RefCell<StableVec<u8, Memory>> = RefCell::new(
        StableVec::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MEMORY_ID_GRID))
        ).unwrap()
    );

    // Territory: 1000x1000 u8 values (ownership tracking)
    static TERRITORY: RefCell<StableVec<u8, Memory>> = RefCell::new(
        StableVec::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MEMORY_ID_TERRITORY))
        ).unwrap()
    );

    // Metadata stored as serialized blob in another StableVec
    static METADATA: RefCell<StableVec<u8, Memory>> = RefCell::new(
        StableVec::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MEMORY_ID_METADATA))
        ).unwrap()
    );

    // Cached metadata in heap for fast access
    static CACHED_METADATA: RefCell<Metadata> = RefCell::new(Metadata::default());
}

// ============================================================================
// HELPERS
// ============================================================================

fn idx(row: usize, col: usize) -> usize {
    row * GRID_WIDTH + col
}

fn ensure_grid_initialized() {
    GRID.with(|grid| {
        let grid = grid.borrow();
        if grid.len() < GRID_SIZE as u64 {
            drop(grid);
            GRID.with(|g| {
                let g = g.borrow_mut();
                while g.len() < GRID_SIZE as u64 {
                    g.push(&0u8).unwrap();
                }
            });
        }
    });

    TERRITORY.with(|territory| {
        let territory = territory.borrow();
        if territory.len() < GRID_SIZE as u64 {
            drop(territory);
            TERRITORY.with(|t| {
                let t = t.borrow_mut();
                while t.len() < GRID_SIZE as u64 {
                    t.push(&0u8).unwrap();
                }
            });
        }
    });
}

fn load_metadata() {
    METADATA.with(|meta| {
        let meta = meta.borrow();
        if meta.len() > 0 {
            let bytes: Vec<u8> = (0..meta.len()).filter_map(|i| meta.get(i)).collect();
            if let Ok(m) = candid::decode_one::<Metadata>(&bytes) {
                CACHED_METADATA.with(|c| *c.borrow_mut() = m);
            }
        }
    });
}

fn save_metadata() {
    CACHED_METADATA.with(|cached| {
        let m = cached.borrow();
        let bytes = candid::encode_one(&*m).unwrap();
        METADATA.with(|meta| {
            let meta = meta.borrow_mut();
            // Clear and rewrite
            while meta.len() > 0 {
                meta.pop();
            }
            for b in bytes {
                meta.push(&b).unwrap();
            }
        });
    });
}

fn get_grid_cell(row: usize, col: usize) -> u8 {
    GRID.with(|g| g.borrow().get(idx(row, col) as u64).unwrap_or(0))
}

fn set_grid_cell(row: usize, col: usize, value: u8) {
    GRID.with(|g| {
        let _ = g.borrow_mut().set(idx(row, col) as u64, &value);
    });
}

#[allow(dead_code)]
fn get_territory_cell(row: usize, col: usize) -> u8 {
    TERRITORY.with(|t| t.borrow().get(idx(row, col) as u64).unwrap_or(0))
}

fn set_territory_cell(row: usize, col: usize, value: u8) {
    TERRITORY.with(|t| {
        let _ = t.borrow_mut().set(idx(row, col) as u64, &value);
    });
}

fn create_empty_points_grid(width: u32, height: u32) -> Vec<Vec<u16>> {
    vec![vec![0u16; width as usize]; height as usize]
}

/// Count neighbors and their owners for a cell
fn get_neighbor_info(row: usize, col: usize) -> (u8, [u8; MAX_PLAYERS + 1]) {
    let mut count = 0u8;
    let mut owner_counts = [0u8; MAX_PLAYERS + 1];

    for di in [-1i32, 0, 1] {
        for dj in [-1i32, 0, 1] {
            if di == 0 && dj == 0 {
                continue;
            }
            let new_row = ((row as i32 + di + GRID_HEIGHT as i32) as usize) % GRID_HEIGHT;
            let new_col = ((col as i32 + dj + GRID_WIDTH as i32) as usize) % GRID_WIDTH;
            let owner = get_grid_cell(new_row, new_col);
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
fn get_majority_owner(owner_counts: &[u8; MAX_PLAYERS + 1]) -> u8 {
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

/// Run one generation of Conway's Game of Life with ownership and point capture
fn step_generation(game: &mut GameRoom) {
    let height = game.height as usize;
    let width = game.width as usize;
    let mut new_grid = create_empty_grid(game.width, game.height);

    // Track points to transfer (to_player_idx, amount)
    let mut point_transfers: Vec<(usize, u16)> = Vec::new();

    for row in 0..height {
        for col in 0..width {
            let (count, owner_counts) = get_neighbor_info(&game.grid, row, col, height, width);
            let current = game.grid[row][col];

    for row in 0..GRID_HEIGHT {
        for col in 0..GRID_WIDTH {
            let (count, owner_counts) = get_neighbor_info(row, col);
            let current_val = current[idx(row, col)];

            if current_val > 0 {
                // Living cell survives with 2 or 3 neighbors
                if count == 2 || count == 3 {
                    new_grid[idx(row, col)] = current_val;
                }
                // Cell dies - points stay in cell (territory doesn't change on death)
            } else {
                // Dead cell born with exactly 3 neighbors
                if count == 3 {
                    let new_owner = get_majority_owner(&owner_counts);
                    new_grid[row][col] = new_owner;

                    // Check if this cell had points from another player
                    let old_territory_owner = game.territory[row][col];
                    let cell_points = game.points[row][col];

                    if cell_points > 0 && old_territory_owner > 0 && old_territory_owner != new_owner {
                        // Capture! Transfer points to new owner's balance
                        let to_idx = (new_owner - 1) as usize;
                        point_transfers.push((to_idx, cell_points));
                        // Clear points from cell (they go to balance)
                        game.points[row][col] = 0;
                    }
                }
            }
        }
    }

    // Apply point transfers to balances
    for (to_idx, amount) in point_transfers {
        if to_idx < game.player_balances.len() {
            game.player_balances[to_idx] += amount as u64;
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

    // Increment generation
    CACHED_METADATA.with(|m| m.borrow_mut().generation += 1);
}

/// Remove inactive players and remap colors
fn cleanup_inactive_players() {
    // Count live cells per player
    let mut live_counts = [0u32; MAX_PLAYERS + 1];
    GRID.with(|g| {
        let g = g.borrow();
        for i in 0..GRID_SIZE as u64 {
            let cell = g.get(i).unwrap_or(0);
            if cell > 0 && (cell as usize) <= MAX_PLAYERS {
                live_counts[cell as usize] += 1;
            }
        }
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
        points: create_empty_points_grid(width, height),
        player_balances: vec![1000],  // Creator starts with 1000 points
        generation: 0,
        players: vec![caller],
        status: GameStatus::Waiting,
        is_running: false,
    };

    GAMES.with(|games| {
        games.borrow_mut().insert(game_id, game);
    });
}

/// Build LifeState response from stable storage
fn build_state() -> LifeState {
    let mut grid = vec![vec![0u8; GRID_WIDTH]; GRID_HEIGHT];
    let mut territory = vec![vec![0u8; GRID_WIDTH]; GRID_HEIGHT];

    GRID.with(|g| {
        let g = g.borrow();
        for row in 0..GRID_HEIGHT {
            for col in 0..GRID_WIDTH {
                grid[row][col] = g.get(idx(row, col) as u64).unwrap_or(0);
            }
        }
    });

    TERRITORY.with(|t| {
        let t = t.borrow();
        for row in 0..GRID_HEIGHT {
            for col in 0..GRID_WIDTH {
                territory[row][col] = t.get(idx(row, col) as u64).unwrap_or(0);
            }
        }
    });

    CACHED_METADATA.with(|m| {
        let m = m.borrow();
        LifeState {
            grid,
            territory,
            generation: m.generation,
            players: m.players.clone(),
        }

        game.players.push(caller);
        game.player_balances.push(1000);  // New player gets 1000 points
        Ok(game.players.len() as u8)
    })
}

// ============================================================================
// CANISTER LIFECYCLE
// ============================================================================

#[init]
fn init() {
    ensure_grid_initialized();
    ic_cdk::println!("Life Backend Initialized - 1000x1000 persistent world");
}

#[post_upgrade]
fn post_upgrade() {
    ensure_grid_initialized();
    load_metadata();
    ic_cdk::println!("Life Backend Upgraded - state restored from stable memory");
}

// ============================================================================
// UPDATE METHODS
// ============================================================================

/// Place cells on the grid with economics. Costs 1 point per cell.
#[update]
fn place_cells(cells: Vec<(i32, i32)>) -> Result<u32, String> {
    let caller = ic_cdk::api::msg_caller();

    GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let game = games.get_mut(&game_id).ok_or("Game not found")?;

        if game.status != GameStatus::Active {
            return Err("Game not active".to_string());
        }

        // Find player index
        let player_idx = game.players
            .iter()
            .position(|p| *p == caller)
            .ok_or("Not a player in this game")?;
        let player_num = (player_idx + 1) as u8;

        let cost = cells.len() as u64;

        // Check balance
        if game.player_balances[player_idx] < cost {
            return Err(format!("Insufficient points. Need {}, have {}",
                cost, game.player_balances[player_idx]));
        }

        let width = game.width as i32;
        let height = game.height as i32;

        // Pre-validate: check for overlaps with alive cells
        for (x, y) in &cells {
            let col = ((*x % width) + width) % width;
            let row = ((*y % height) + height) % height;
            if game.grid[row as usize][col as usize] > 0 {
                return Err("Cannot place on alive cells".to_string());
            }
        }

        // Deduct cost from balance
        game.player_balances[player_idx] -= cost;

        // Find all cells owned by this player (for point distribution)
        let mut my_cells: Vec<(usize, usize)> = Vec::new();
        for row in 0..game.height as usize {
            for col in 0..game.width as usize {
                if game.grid[row][col] == player_num {
                    my_cells.push((row, col));
                }
            }
        }

        // Place new cells
        let mut placed_cells: Vec<(usize, usize)> = Vec::new();
        for (x, y) in cells {
            let col = ((x % width) + width) % width;
            let row = ((y % height) + height) % height;
            game.grid[row as usize][col as usize] = player_num;
            game.territory[row as usize][col as usize] = player_num;
            placed_cells.push((row as usize, col as usize));
        }

        // Distribute points across territory (including newly placed cells)
        my_cells.extend(placed_cells.iter().cloned());

        if !my_cells.is_empty() {
            // Distribute points across owned cells
            let points_per_cell = cost / my_cells.len() as u64;
            let remainder = cost % my_cells.len() as u64;

            for (i, (row, col)) in my_cells.iter().enumerate() {
                let extra = if (i as u64) < remainder { 1 } else { 0 };
                game.points[*row][*col] += (points_per_cell + extra) as u16;
            }
        }

        Ok(placed_cells.len() as u32)
    })
}

    ensure_grid_initialized();

    // Get or assign player number
    let player_num = CACHED_METADATA.with(|cached| {
        let mut m = cached.borrow_mut();

        // Check if caller already has a color
        if let Some(pos) = m.players.iter().position(|p| *p == caller) {
            return Ok((pos + 1) as u8);
        }

        // New player - check if room available
        if m.players.len() >= MAX_PLAYERS {
            return Err("Game full - max 10 players".to_string());
        }

        m.players.push(caller);
        Ok(m.players.len() as u8)
    })?;

    let mut placed = 0u32;
    for (x, y) in cells {
        // Wrap coordinates (toroidal)
        let col = ((x % GRID_WIDTH as i32) + GRID_WIDTH as i32) as usize % GRID_WIDTH;
        let row = ((y % GRID_HEIGHT as i32) + GRID_HEIGHT as i32) as usize % GRID_HEIGHT;

        set_grid_cell(row, col, player_num);
        set_territory_cell(row, col, player_num);
        placed += 1;
    }

    save_metadata();
    Ok(placed)
}

/// Clear the grid (keep game active, reset points)
#[update]
fn step(n: u32) -> Result<LifeState, String> {
    ensure_grid_initialized();

    // Limit steps per call to prevent timeout
    let steps = n.min(100);
    for _ in 0..steps {
        step_generation();
    }

    // Cleanup inactive players
    cleanup_inactive_players();
    save_metadata();

        game.grid = create_empty_grid(game.width, game.height);
        game.territory = create_empty_grid(game.width, game.height);
        game.points = create_empty_points_grid(game.width, game.height);
        // Reset all player balances to 1000
        for balance in game.player_balances.iter_mut() {
            *balance = 1000;
        }
        game.generation = 0;
        game.is_running = false;
        Ok(())
    })
}

// ============================================================================
// QUERY METHODS
// ============================================================================

/// Get current game state
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

/// Get game state including points (main polling endpoint for economics)
#[query]
fn get_state_with_points(game_id: u64) -> Result<GameStateWithPoints, String> {
    GAMES.with(|games| {
        let games = games.borrow();
        let game = games.get(&game_id).ok_or("Game not found")?;
        Ok(GameStateWithPoints {
            grid: game.grid.clone(),
            territory: game.territory.clone(),
            points: game.points.clone(),
            generation: game.generation,
            players: game.players.clone(),
            balances: game.player_balances.clone(),
            is_running: game.is_running,
        })
    })
}

/// Get player balance
#[query]
fn get_balance(game_id: u64) -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    GAMES.with(|games| {
        let games = games.borrow();
        let game = games.get(&game_id).ok_or("Game not found")?;
        let player_idx = game.players
            .iter()
            .position(|p| *p == caller)
            .ok_or("Not a player")?;
        Ok(game.player_balances[player_idx])
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
    format!("Hello, {}! Welcome to Life - 1000x1000 persistent world.", name)
}

// Export Candid interface
ic_cdk::export_candid!();
