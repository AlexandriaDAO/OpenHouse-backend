use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{query, update, init, post_upgrade, pre_upgrade};
use ic_cdk_timers::set_timer_interval;
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    DefaultMemoryImpl, StableVec, Storable,
};
use std::borrow::Cow;
use std::cell::RefCell;
use std::time::Duration;

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_SIZE: usize = 512;
const GRID_SHIFT: usize = 9;        // 2^9 = 512, for bit-shift indexing
const GRID_MASK: usize = 0x1FF;     // 511, for fast modulo (x & GRID_MASK == x % 512)
const TOTAL_CELLS: usize = GRID_SIZE * GRID_SIZE; // 262,144 cells
const MAX_PLAYERS: usize = 10;
const STARTING_BALANCE: u64 = 1000;

// Simulation timing: 5 generations per tick, 1 tick every 5 seconds
// Frontend runs optimistic UI locally, backend is authoritative checkpoint
const GENERATIONS_PER_TICK: u32 = 5;
const TICK_INTERVAL_MS: u64 = 5000; // 1 tick per 5 seconds

// Memory IDs for stable storage
// Using 20+ to avoid conflict with old data (v1 used 0-9, v2 used 10-19)
const MEMORY_ID_GRID: MemoryId = MemoryId::new(20);
const MEMORY_ID_METADATA: MemoryId = MemoryId::new(21);

type Memory = VirtualMemory<DefaultMemoryImpl>;

// ============================================================================
// TYPES
// ============================================================================

/// Packed cell structure - 2 bytes total (50% smaller than before)
/// Bits 0-3:   owner (0-15, where 0=unclaimed, 1-10=player ID)
/// Bits 4-10:  points (0-127)
/// Bit 11:     alive
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Cell(u16);

impl Cell {
    pub fn new(owner: u8, points: u8, alive: bool) -> Self {
        let mut v = (owner & 0x0F) as u16;
        v |= ((points & 0x7F) as u16) << 4;
        if alive { v |= 1 << 11; }
        Cell(v)
    }

    #[inline] pub fn owner(&self) -> u8   { (self.0 & 0x0F) as u8 }
    #[inline] pub fn points(&self) -> u8  { ((self.0 >> 4) & 0x7F) as u8 }
    #[inline] pub fn alive(&self) -> bool { self.0 & (1 << 11) != 0 }

    #[inline] pub fn set_owner(&mut self, v: u8) {
        self.0 = (self.0 & !0x0F) | (v & 0x0F) as u16;
    }
    #[inline] pub fn set_points(&mut self, v: u8) {
        self.0 = (self.0 & !0x07F0) | (((v & 0x7F) as u16) << 4);
    }
    #[inline] pub fn set_alive(&mut self, v: bool) {
        if v { self.0 |= 1 << 11; } else { self.0 &= !(1 << 11); }
    }

    pub fn add_points(&mut self, n: u8) {
        self.set_points(self.points().saturating_add(n).min(127));
    }
}

impl Storable for Cell {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(self.0.to_le_bytes().to_vec())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        if bytes.len() < 2 { return Cell(0); }
        Cell(u16::from_le_bytes([bytes[0], bytes[1]]))
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 2,
            is_fixed_size: true,
        };
}

/// External cell representation for Candid API (what frontend sees)
#[derive(CandidType, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
pub struct CellView {
    pub owner: u8,
    pub points: u8,
    pub alive: bool,
}

impl From<Cell> for CellView {
    fn from(c: Cell) -> Self {
        CellView { owner: c.owner(), points: c.points(), alive: c.alive() }
    }
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum GameStatus {
    Waiting,
    Active,
    Finished,
}

/// Game state returned to frontend - flat array for efficiency
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameState {
    pub cells: Vec<CellView>,
    pub width: u32,
    pub height: u32,
    pub generation: u64,
    pub players: Vec<Principal>,
    pub balances: Vec<u64>,
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

/// Game room structure (for API compatibility)
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameRoom {
    pub id: u64,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub status: GameStatus,
    pub players: Vec<Principal>,
    pub generation: u64,
    pub is_running: bool,
}

/// Game config for create_game
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameConfig {
    pub width: u32,
    pub height: u32,
    pub max_players: u32,
    pub generations_limit: Option<u64>,
}

/// Metadata stored in stable memory
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
    balances: Vec<u64>,
    is_running: bool,
}

impl Storable for Metadata {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap_or_default()
    }

    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Unbounded;
}

// ============================================================================
// STABLE STATE
// ============================================================================

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    // HEAP GRID: Fast runtime access (no stable memory overhead)
    static GRID: RefCell<Vec<Cell>> = RefCell::new(Vec::new());

    // STABLE GRID: Persistence only (used during upgrades)
    static STABLE_GRID: RefCell<StableVec<Cell, Memory>> = RefCell::new(
        StableVec::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MEMORY_ID_GRID))
        ).unwrap()
    );

    // Metadata stored as serialized blob
    static METADATA_STORE: RefCell<StableVec<u8, Memory>> = RefCell::new(
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

#[inline]
fn idx(row: usize, col: usize) -> usize {
    (row << GRID_SHIFT) | col  // Fast: bit shift instead of multiply
}

#[inline]
fn coords(index: usize) -> (usize, usize) {
    (index >> GRID_SHIFT, index & GRID_MASK)  // Fast: bit ops instead of div/mod
}

fn ensure_grid_initialized() {
    GRID.with(|grid| {
        let mut grid = grid.borrow_mut();
        if grid.len() < TOTAL_CELLS {
            grid.resize(TOTAL_CELLS, Cell::default());
        }
    });
}

fn load_metadata() {
    METADATA_STORE.with(|meta| {
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
        METADATA_STORE.with(|meta| {
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

fn get_cell(row: usize, col: usize) -> Cell {
    GRID.with(|g| g.borrow().get(idx(row, col)).copied().unwrap_or_default())
}

fn set_cell(row: usize, col: usize, cell: Cell) {
    GRID.with(|g| {
        let mut g = g.borrow_mut();
        let i = idx(row, col);
        if i < g.len() {
            g[i] = cell;
        }
    });
}

/// Count living neighbors and their owners for a cell
fn get_neighbor_info(row: usize, col: usize, current_grid: &[Cell]) -> (u8, [u8; MAX_PLAYERS + 1]) {
    let mut count = 0u8;
    let mut owner_counts = [0u8; MAX_PLAYERS + 1];

    for di in [-1i32, 0, 1] {
        for dj in [-1i32, 0, 1] {
            if di == 0 && dj == 0 {
                continue;
            }
            let new_row = ((row as i32 + di + GRID_SIZE as i32) as usize) & GRID_MASK;
            let new_col = ((col as i32 + dj + GRID_SIZE as i32) as usize) & GRID_MASK;
            let cell = current_grid[idx(new_row, new_col)];
            if cell.alive() {
                count += 1;
                if (cell.owner() as usize) < owner_counts.len() {
                    owner_counts[cell.owner() as usize] += 1;
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

/// Run one generation of Conway's Game of Life with ownership
fn step_generation() {
    // Clone current grid for neighbor calculations (heap-to-heap, fast)
    let current: Vec<Cell> = GRID.with(|g| g.borrow().clone());

    let mut new_grid: Vec<Cell> = vec![Cell::default(); TOTAL_CELLS];
    let mut point_transfers: Vec<(usize, u8)> = Vec::new();

    for row in 0..GRID_SIZE {
        for col in 0..GRID_SIZE {
            let i = idx(row, col);
            let (neighbor_count, owner_counts) = get_neighbor_info(row, col, &current);
            let current_cell = current[i];

            // Preserve territory (owner) and points regardless of alive state
            new_grid[i].set_owner(current_cell.owner());
            new_grid[i].set_points(current_cell.points());

            if current_cell.alive() {
                // Living cell survives with 2 or 3 neighbors
                if neighbor_count == 2 || neighbor_count == 3 {
                    new_grid[i].set_alive(true);
                }
                // Cell dies - owner (territory) and points stay in cell
            } else {
                // Dead cell born with exactly 3 neighbors
                if neighbor_count == 3 {
                    let new_owner = get_majority_owner(&owner_counts);
                    new_grid[i].set_alive(true);

                    // Territory capture: if cell had different owner with points
                    let old_owner = current_cell.owner();
                    if current_cell.points() > 0 && old_owner > 0 && old_owner != new_owner {
                        // Capture! Transfer points to new owner's balance
                        let to_idx = (new_owner - 1) as usize;
                        point_transfers.push((to_idx, current_cell.points()));
                        new_grid[i].set_points(0);
                    }

                    // New owner claims territory
                    new_grid[i].set_owner(new_owner);
                }
            }
        }
    }

    // Apply point transfers to balances
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        for (to_idx, amount) in point_transfers {
            if to_idx < m.balances.len() {
                m.balances[to_idx] += amount as u64;
            }
        }
    });

    // Swap in new grid (heap assignment, no stable memory I/O)
    GRID.with(|g| {
        *g.borrow_mut() = new_grid;
    });

    // Increment generation
    CACHED_METADATA.with(|m| m.borrow_mut().generation += 1);
}

/// Build full state response
fn build_game_state() -> GameState {
    let cells: Vec<CellView> = GRID.with(|g| {
        g.borrow().iter().map(|c| (*c).into()).collect()
    });

    CACHED_METADATA.with(|m| {
        let m = m.borrow();
        GameState {
            cells,
            width: GRID_SIZE as u32,
            height: GRID_SIZE as u32,
            generation: m.generation,
            players: m.players.clone(),
            balances: m.balances.clone(),
            is_running: m.is_running,
        }
    })
}

// ============================================================================
// CANISTER LIFECYCLE
// ============================================================================

/// Start the autonomous simulation timer
fn start_simulation_timer() {
    set_timer_interval(Duration::from_millis(TICK_INTERVAL_MS), || async {
        let is_running = CACHED_METADATA.with(|m| m.borrow().is_running);
        if is_running {
            for _ in 0..GENERATIONS_PER_TICK {
                step_generation();
            }
            // Save periodically (every tick when running)
            save_metadata();
        }
    });
}

#[init]
fn init() {
    ensure_grid_initialized();
    // Start running by default - simulation is always on
    CACHED_METADATA.with(|m| m.borrow_mut().is_running = true);
    save_metadata();
    start_simulation_timer();
    ic_cdk::println!("Life Backend Initialized - {}x{} persistent world, {} gen/sec",
        GRID_SIZE, GRID_SIZE, GENERATIONS_PER_TICK as u64 * (1000 / TICK_INTERVAL_MS));
}

#[pre_upgrade]
fn pre_upgrade() {
    // Save metadata
    save_metadata();

    // Persist heap grid to stable memory for upgrade survival
    GRID.with(|heap| {
        STABLE_GRID.with(|stable| {
            let heap = heap.borrow();
            let stable = stable.borrow_mut();

            // Clear old stable data
            while stable.len() > 0 {
                stable.pop();
            }

            // Copy heap → stable
            for cell in heap.iter() {
                stable.push(cell).unwrap();
            }
        });
    });

    ic_cdk::println!("Life Backend pre_upgrade: saved {} cells to stable memory", TOTAL_CELLS);
}

#[post_upgrade]
fn post_upgrade() {
    // Load metadata
    load_metadata();

    // Restore grid from stable memory to heap
    let stable_len = STABLE_GRID.with(|s| s.borrow().len());

    if stable_len == TOTAL_CELLS as u64 {
        // Normal upgrade: restore from stable
        STABLE_GRID.with(|stable| {
            GRID.with(|heap| {
                let stable = stable.borrow();
                let mut heap = heap.borrow_mut();
                heap.clear();
                heap.reserve(TOTAL_CELLS);
                for i in 0..TOTAL_CELLS as u64 {
                    heap.push(stable.get(i).unwrap_or_default());
                }
            });
        });
        ic_cdk::println!("Life Backend post_upgrade: restored {} cells from stable memory", TOTAL_CELLS);
    } else {
        // Migration or first deploy: initialize fresh grid
        ic_cdk::println!("Life Backend post_upgrade: stable has {} cells, expected {}. Initializing fresh grid.",
            stable_len, TOTAL_CELLS);

        // Clear incompatible stable data
        STABLE_GRID.with(|s| {
            let s = s.borrow_mut();
            while s.len() > 0 {
                s.pop();
            }
        });

        // Initialize fresh heap grid
        ensure_grid_initialized();

        // Reset game state for fresh start
        CACHED_METADATA.with(|m| {
            let mut m = m.borrow_mut();
            m.generation = 0;
            m.is_running = true;
            for balance in m.balances.iter_mut() {
                *balance = STARTING_BALANCE;
            }
        });
        save_metadata();
    }

    start_simulation_timer();
}

// ============================================================================
// GAME MANAGEMENT (compatibility layer - single world)
// ============================================================================

/// List available games (returns single global world)
#[query]
fn list_games() -> Vec<GameInfo> {
    CACHED_METADATA.with(|m| {
        let m = m.borrow();
        vec![GameInfo {
            id: 0,
            name: "Global World".to_string(),
            status: GameStatus::Active,
            player_count: m.players.len() as u32,
            generation: m.generation,
        }]
    })
}

/// Create game (returns existing world id)
#[update]
fn create_game(_name: String, _config: GameConfig) -> Result<u64, String> {
    Ok(0)
}

/// Join game (adds player to global world)
#[update]
fn join_game(_game_id: u64) -> Result<u8, String> {
    let caller = ic_cdk::api::caller();

    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();

        // Check if already a player
        if let Some(pos) = m.players.iter().position(|p| *p == caller) {
            return Ok((pos + 1) as u8);
        }

        // Check max players
        if m.players.len() >= MAX_PLAYERS {
            return Err("Game full - max 10 players".to_string());
        }

        m.players.push(caller);
        m.balances.push(STARTING_BALANCE);
        save_metadata();
        Ok(m.players.len() as u8)
    })
}

/// Start game (no-op for global world, always active)
#[update]
fn start_game(_game_id: u64) -> Result<(), String> {
    Ok(())
}


/// Get game room info
#[query]
fn get_game(_game_id: u64) -> Result<GameRoom, String> {
    CACHED_METADATA.with(|m| {
        let m = m.borrow();
        Ok(GameRoom {
            id: 0,
            name: "Global World".to_string(),
            width: GRID_SIZE as u32,
            height: GRID_SIZE as u32,
            status: GameStatus::Active,
            players: m.players.clone(),
            generation: m.generation,
            is_running: m.is_running,
        })
    })
}

// ============================================================================
// UPDATE METHODS
// ============================================================================

/// Place cells on the grid with economics. Costs 1 point per cell.
#[update]
fn place_cells(_game_id: u64, cells: Vec<(i32, i32)>) -> Result<u32, String> {
    let caller = ic_cdk::api::caller();
    ensure_grid_initialized();

    // Get or assign player number
    let (player_num, player_idx) = CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();

        // Check if caller already has a color
        if let Some(pos) = m.players.iter().position(|p| *p == caller) {
            return Ok(((pos + 1) as u8, pos));
        }

        // New player - check if room available
        if m.players.len() >= MAX_PLAYERS {
            return Err("Game full - max 10 players".to_string());
        }

        m.players.push(caller);
        m.balances.push(STARTING_BALANCE);
        Ok((m.players.len() as u8, m.players.len() - 1))
    })?;

    let cost = cells.len() as u64;

    // Check balance
    let current_balance = CACHED_METADATA.with(|m| {
        m.borrow().balances.get(player_idx).copied().unwrap_or(0)
    });

    if current_balance < cost {
        return Err(format!("Insufficient points. Need {}, have {}", cost, current_balance));
    }

    // Pre-validate: check for overlaps with alive cells
    for (x, y) in &cells {
        let col = ((*x & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;
        let row = ((*y & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;
        let cell = get_cell(row, col);
        if cell.alive() {
            return Err("Cannot place on alive cells".to_string());
        }
    }

    // Deduct cost from balance
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        if let Some(balance) = m.balances.get_mut(player_idx) {
            *balance -= cost;
        }
    });

    // Place new cells - each gets 1 point stored directly in the cell
    let mut placed_count = 0u32;
    for (x, y) in cells {
        let col = ((x & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;
        let row = ((y & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;

        let mut cell = get_cell(row, col);
        cell.set_owner(player_num);
        cell.set_alive(true);
        cell.add_points(1);
        set_cell(row, col, cell);
        placed_count += 1;
    }

    save_metadata();
    Ok(placed_count)
}



// ============================================================================
// QUERY METHODS
// ============================================================================

/// Get current game state
#[query]
fn get_state(_game_id: u64) -> Result<GameState, String> {
    Ok(build_game_state())
}

/// Get player balance
#[query]
fn get_balance(_game_id: u64) -> Result<u64, String> {
    let caller = ic_cdk::api::caller();
    CACHED_METADATA.with(|m| {
        let m = m.borrow();
        let player_idx = m.players
            .iter()
            .position(|p| *p == caller)
            .ok_or("Not a player")?;
        Ok(m.balances.get(player_idx).copied().unwrap_or(0))
    })
}

/// Simple greeting
#[query]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to the {}x{} Game of Life world.", name, GRID_SIZE, GRID_SIZE)
}
