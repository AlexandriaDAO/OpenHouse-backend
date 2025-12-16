use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{query, update, init, post_upgrade, pre_upgrade};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    DefaultMemoryImpl, StableVec, Storable,
};
use std::borrow::Cow;
use std::cell::{Cell as StdCell, RefCell};

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_SIZE: usize = 512;
const GRID_SHIFT: usize = 9;        // 2^9 = 512, for bit-shift indexing
const GRID_MASK: usize = 0x1FF;     // 511, for fast modulo (x & GRID_MASK == x % 512)
const TOTAL_CELLS: usize = GRID_SIZE * GRID_SIZE; // 262,144 cells
const MAX_PLAYERS: usize = 10;
const STARTING_BALANCE: u64 = 1000;

// Event-driven architecture: no timer constants needed
// Simulation runs at 10 gen/sec, calculated from checkpoint timestamps

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
    pub checkpoint_timestamp_ns: u64,  // When this checkpoint was saved (for frontend sync)
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

/// Result from place_cells with new checkpoint info
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlaceCellsResult {
    pub placed_count: u32,
    pub new_generation: u64,
    pub new_timestamp_ns: u64,
}

/// Lightweight metadata for sync checks (no cells - much faster)
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameMetadata {
    pub width: u32,
    pub height: u32,
    pub generation: u64,
    pub players: Vec<Principal>,
    pub balances: Vec<u64>,
    pub is_running: bool,
    pub checkpoint_timestamp_ns: u64,
}

/// Metadata stored in stable memory
#[derive(CandidType, Deserialize, Clone, Debug)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
    balances: Vec<u64>,
    is_running: bool,
    checkpoint_timestamp_ns: u64,  // When this checkpoint was saved (IC time in nanoseconds)
}

impl Default for Metadata {
    fn default() -> Self {
        Self {
            generation: 0,
            players: Vec::new(),
            balances: Vec::new(),
            is_running: true,
            checkpoint_timestamp_ns: 0,
        }
    }
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

    // DUAL HEAP GRIDS: Double buffering for zero-allocation stepping
    // Buffer 0 and Buffer 1 - we read from one and write to the other
    static GRID_A: RefCell<Vec<Cell>> = RefCell::new(Vec::new());
    static GRID_B: RefCell<Vec<Cell>> = RefCell::new(Vec::new());

    // Active buffer indicator: false = A is active (read), true = B is active (read)
    static ACTIVE_BUFFER: StdCell<bool> = const { StdCell::new(false) };

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

    // Instruction counter stats for profiling
    static INSTRUCTION_STATS: RefCell<InstructionStats> = RefCell::new(InstructionStats::default());
}

/// Stats for profiling instruction costs
#[derive(Default, Clone)]
struct InstructionStats {
    last_step_generation_instructions: u64,
    last_save_metadata_instructions: u64,
    last_tick_total_instructions: u64,
    tick_count: u64,
}

// ============================================================================
// HELPERS
// ============================================================================

#[inline]
fn idx(row: usize, col: usize) -> usize {
    (row << GRID_SHIFT) | col  // Fast: bit shift instead of multiply
}

// coords function removed - was unused

fn ensure_grid_initialized() {
    // Initialize both buffers for double buffering
    GRID_A.with(|grid| {
        let mut grid = grid.borrow_mut();
        if grid.len() < TOTAL_CELLS {
            grid.resize(TOTAL_CELLS, Cell::default());
        }
    });
    GRID_B.with(|grid| {
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

/// Get the active grid (the one being read from)
#[inline]
fn with_active_grid<R, F: FnOnce(&Vec<Cell>) -> R>(f: F) -> R {
    let use_b = ACTIVE_BUFFER.with(|b| b.get());
    if use_b {
        GRID_B.with(|g| f(&g.borrow()))
    } else {
        GRID_A.with(|g| f(&g.borrow()))
    }
}

/// Get the active grid mutably (for direct cell modifications like place_cells)
#[inline]
fn with_active_grid_mut<R, F: FnOnce(&mut Vec<Cell>) -> R>(f: F) -> R {
    let use_b = ACTIVE_BUFFER.with(|b| b.get());
    if use_b {
        GRID_B.with(|g| f(&mut g.borrow_mut()))
    } else {
        GRID_A.with(|g| f(&mut g.borrow_mut()))
    }
}

fn get_cell(row: usize, col: usize) -> Cell {
    with_active_grid(|g| g.get(idx(row, col)).copied().unwrap_or_default())
}

fn set_cell(row: usize, col: usize, cell: Cell) {
    with_active_grid_mut(|g| {
        let i = idx(row, col);
        if i < g.len() {
            g[i] = cell;
        }
    });
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

/// Pre-computed neighbor offsets for toroidal wrapping
/// Each tuple is (row_delta, col_delta) where deltas are already wrapped for GRID_SIZE
const NEIGHBOR_DELTAS: [(usize, usize); 8] = [
    (GRID_SIZE - 1, GRID_SIZE - 1), // NW
    (GRID_SIZE - 1, 0),             // N
    (GRID_SIZE - 1, 1),             // NE
    (0, GRID_SIZE - 1),             // W
    (0, 1),                         // E
    (1, GRID_SIZE - 1),             // SW
    (1, 0),                         // S
    (1, 1),                         // SE
];

/// Run one generation of Conway's Game of Life with ownership
/// Uses double buffering: reads from active buffer, writes to inactive, then swaps
fn step_generation() {
    let use_b = ACTIVE_BUFFER.with(|b| b.get());
    let mut point_transfers: Vec<(usize, u8)> = Vec::new();

    // Process all cells: read from active buffer, write to inactive buffer
    if use_b {
        // Active is B, write to A
        GRID_B.with(|read_grid| {
            GRID_A.with(|write_grid| {
                let read_g = read_grid.borrow();
                let mut write_g = write_grid.borrow_mut();
                process_generation(&read_g, &mut write_g, &mut point_transfers);
            });
        });
    } else {
        // Active is A, write to B
        GRID_A.with(|read_grid| {
            GRID_B.with(|write_grid| {
                let read_g = read_grid.borrow();
                let mut write_g = write_grid.borrow_mut();
                process_generation(&read_g, &mut write_g, &mut point_transfers);
            });
        });
    }

    // Apply point transfers to balances and increment generation (single borrow)
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        for (to_idx, amount) in point_transfers {
            if to_idx < m.balances.len() {
                m.balances[to_idx] += amount as u64;
            }
        }
        m.generation += 1;
    });

    // Swap active buffer (no allocation, just flip a bool)
    ACTIVE_BUFFER.with(|b| b.set(!use_b));
}

/// Process all cells from read_grid into write_grid
/// Inlined neighbor counting for performance
#[inline]
fn process_generation(read_grid: &[Cell], write_grid: &mut [Cell], point_transfers: &mut Vec<(usize, u8)>) {
    for row in 0..GRID_SIZE {
        for col in 0..GRID_SIZE {
            let i = idx(row, col);

            // Inline neighbor counting to avoid function call overhead
            let mut neighbor_count = 0u8;
            let mut owner_counts = [0u8; MAX_PLAYERS + 1];

            for &(dr, dc) in &NEIGHBOR_DELTAS {
                let nr = (row + dr) & GRID_MASK;
                let nc = (col + dc) & GRID_MASK;
                let neighbor = read_grid[idx(nr, nc)];
                if neighbor.alive() {
                    neighbor_count += 1;
                    let owner = neighbor.owner() as usize;
                    if owner < owner_counts.len() {
                        owner_counts[owner] += 1;
                    }
                }
            }

            let current_cell = read_grid[i];

            // Start with territory preserved (no allocation, direct u16 copy)
            let mut new_cell = Cell::new(current_cell.owner(), current_cell.points(), false);

            if current_cell.alive() {
                // Living cell survives with 2 or 3 neighbors
                if neighbor_count == 2 || neighbor_count == 3 {
                    new_cell.set_alive(true);
                }
            } else {
                // Dead cell born with exactly 3 neighbors
                if neighbor_count == 3 {
                    let new_owner = get_majority_owner(&owner_counts);
                    new_cell.set_alive(true);

                    // Territory capture: if cell had different owner with points
                    let old_owner = current_cell.owner();
                    if current_cell.points() > 0 && old_owner > 0 && old_owner != new_owner {
                        let to_idx = (new_owner - 1) as usize;
                        point_transfers.push((to_idx, current_cell.points()));
                        new_cell.set_points(0);
                    }

                    new_cell.set_owner(new_owner);
                }
            }

            write_grid[i] = new_cell;
        }
    }
}

/// Build full state response
fn build_game_state() -> GameState {
    let cells: Vec<CellView> = with_active_grid(|g| {
        g.iter().map(|c| (*c).into()).collect()
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
            checkpoint_timestamp_ns: m.checkpoint_timestamp_ns,
        }
    })
}

// ============================================================================
// CANISTER LIFECYCLE
// ============================================================================

// Timer-based simulation REMOVED - now using event-driven architecture
// Simulation only runs when players place cells (catch-up on demand)

#[init]
fn init() {
    ensure_grid_initialized();

    let now = ic_cdk::api::time();
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        m.is_running = true;
        m.checkpoint_timestamp_ns = now;
    });

    // NO save_metadata() - heap only during runtime
    // NO timer - event-driven architecture

    ic_cdk::println!("Life Backend Initialized - {}x{} persistent world (event-driven)", GRID_SIZE, GRID_SIZE);
}

#[pre_upgrade]
fn pre_upgrade() {
    // Save metadata
    save_metadata();

    // Persist active heap grid to stable memory for upgrade survival
    let use_b = ACTIVE_BUFFER.with(|b| b.get());

    STABLE_GRID.with(|stable| {
        let stable = stable.borrow_mut();

        // Clear old stable data
        while stable.len() > 0 {
            stable.pop();
        }

        // Copy active heap buffer → stable
        if use_b {
            GRID_B.with(|heap| {
                for cell in heap.borrow().iter() {
                    stable.push(cell).unwrap();
                }
            });
        } else {
            GRID_A.with(|heap| {
                for cell in heap.borrow().iter() {
                    stable.push(cell).unwrap();
                }
            });
        }
    });

    ic_cdk::println!("Life Backend pre_upgrade: saved {} cells to stable memory (buffer {})",
        TOTAL_CELLS, if use_b { "B" } else { "A" });
}

#[post_upgrade]
fn post_upgrade() {
    // Load metadata
    load_metadata();

    // Reset active buffer to A
    ACTIVE_BUFFER.with(|b| b.set(false));

    // Restore grid from stable memory to heap
    let stable_len = STABLE_GRID.with(|s| s.borrow().len());

    if stable_len == TOTAL_CELLS as u64 {
        // Normal upgrade: restore from stable to GRID_A (the active buffer)
        STABLE_GRID.with(|stable| {
            GRID_A.with(|heap| {
                let stable = stable.borrow();
                let mut heap = heap.borrow_mut();
                heap.clear();
                heap.reserve(TOTAL_CELLS);
                for i in 0..TOTAL_CELLS as u64 {
                    heap.push(stable.get(i).unwrap_or_default());
                }
            });
        });

        // Initialize GRID_B to same size (will be overwritten on first step)
        GRID_B.with(|grid| {
            let mut grid = grid.borrow_mut();
            if grid.len() < TOTAL_CELLS {
                grid.resize(TOTAL_CELLS, Cell::default());
            }
        });

        ic_cdk::println!("Life Backend post_upgrade: restored {} cells from stable memory", TOTAL_CELLS);
    } else {
        // Migration or first deploy: initialize fresh grids
        ic_cdk::println!("Life Backend post_upgrade: stable has {} cells, expected {}. Initializing fresh grid.",
            stable_len, TOTAL_CELLS);

        // Clear incompatible stable data
        STABLE_GRID.with(|s| {
            let s = s.borrow_mut();
            while s.len() > 0 {
                s.pop();
            }
        });

        // Initialize fresh heap grids (both buffers)
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
        // NO save_metadata() - heap only during runtime
    }

    // Handle migration: if checkpoint_timestamp_ns is 0, initialize it
    let needs_timestamp_init = CACHED_METADATA.with(|m| {
        m.borrow().checkpoint_timestamp_ns == 0
    });

    if needs_timestamp_init {
        let now = ic_cdk::api::time();
        CACHED_METADATA.with(|m| {
            m.borrow_mut().checkpoint_timestamp_ns = now;
        });
        ic_cdk::println!("Migrated: initialized checkpoint_timestamp_ns");
    }

    // NO timer - event-driven architecture
    ic_cdk::println!("Life Backend post_upgrade complete (event-driven, double-buffered)");
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

    // Reject anonymous principal
    if caller == Principal::anonymous() {
        return Err("Anonymous players not allowed. Please log in.".to_string());
    }

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
        // NO save_metadata() - heap only during runtime
        Ok(m.players.len() as u8)
    })
}

/// Start game (no-op for global world, always active)
#[update]
fn start_game(_game_id: u64) -> Result<(), String> {
    Ok(())
}

/// Manual tick for debugging - runs 10 generations (1 second worth)
#[update]
fn manual_tick() -> u64 {
    for _ in 0..10 {
        step_generation();
    }
    // Update checkpoint timestamp
    let now = ic_cdk::api::time();
    CACHED_METADATA.with(|m| {
        m.borrow_mut().checkpoint_timestamp_ns = now;
    });
    // NO save_metadata() - heap only during runtime
    CACHED_METADATA.with(|m| m.borrow().generation)
}

// restart_timer() REMOVED - no longer using timer-based simulation

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
/// Uses event-driven architecture: catches up simulation from checkpoint before placing.
#[update]
fn place_cells(_game_id: u64, cells: Vec<(i32, i32)>, expected_generation: u64) -> Result<PlaceCellsResult, String> {
    let caller = ic_cdk::api::caller();
    let current_ns = ic_cdk::api::time();

    // Reject anonymous principal
    if caller == Principal::anonymous() {
        return Err("Anonymous players not allowed. Please log in.".to_string());
    }

    ensure_grid_initialized();

    // =========================================================================
    // Step 1: Calculate expected generation from checkpoint
    // =========================================================================
    let (checkpoint_gen, checkpoint_time) = CACHED_METADATA.with(|m| {
        let m = m.borrow();
        (m.generation, m.checkpoint_timestamp_ns)
    });

    let elapsed_ns = current_ns.saturating_sub(checkpoint_time);
    let elapsed_secs = elapsed_ns as f64 / 1_000_000_000.0;
    let gens_elapsed = (elapsed_secs * 10.0) as u64;  // 10 gen/sec

    // expected_generation is accepted for API compatibility but not validated
    // The real conflict check is whether target cells are alive (checked after catch-up)
    let _ = expected_generation;

    // =========================================================================
    // Step 2: Cap catch-up to prevent instruction limit explosion
    // Each step_generation costs ~90M instructions
    // IC limit is 40B instructions per message
    // Max safe: ~200 gens = 18B instructions (leaving room for other logic)
    // This means max 20 seconds of catch-up (10 gen/sec * 20 sec)
    // =========================================================================
    const MAX_CATCHUP_GENS: u64 = 200;
    let gens_to_simulate = gens_elapsed.min(MAX_CATCHUP_GENS);

    // =========================================================================
    // Step 3: Catch up simulation to current time
    // =========================================================================
    for _ in 0..gens_to_simulate {
        step_generation();
    }
    let new_gen = checkpoint_gen + gens_to_simulate;

    // Update generation in metadata
    CACHED_METADATA.with(|m| {
        m.borrow_mut().generation = new_gen;
    });

    // =========================================================================
    // Step 4: Get or assign player number
    // =========================================================================
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

    // =========================================================================
    // Step 5: Check balance
    // =========================================================================
    let current_balance = CACHED_METADATA.with(|m| {
        m.borrow().balances.get(player_idx).copied().unwrap_or(0)
    });

    if current_balance < cost {
        return Err(format!("Insufficient points. Need {}, have {}", cost, current_balance));
    }

    // =========================================================================
    // Step 6: Validate no overlaps with alive cells (AFTER catch-up!)
    // =========================================================================
    for (x, y) in &cells {
        let col = ((*x & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;
        let row = ((*y & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;
        let cell = get_cell(row, col);
        if cell.alive() {
            return Err("Cannot place on alive cells - the game evolved and cells now exist there. Refetch and retry.".to_string());
        }
    }

    // =========================================================================
    // Step 7: Deduct cost from balance
    // =========================================================================
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        if let Some(balance) = m.balances.get_mut(player_idx) {
            *balance -= cost;
        }
    });

    // =========================================================================
    // Step 8: Place new cells - each gets 1 point stored directly in the cell
    // =========================================================================
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

    // =========================================================================
    // Step 9: Update checkpoint timestamp (heap only - no stable memory write!)
    // =========================================================================
    CACHED_METADATA.with(|m| {
        m.borrow_mut().checkpoint_timestamp_ns = current_ns;
    });

    // NO save_metadata() - heap only during runtime, stable writes only in pre_upgrade

    Ok(PlaceCellsResult {
        placed_count,
        new_generation: new_gen,
        new_timestamp_ns: current_ns,
    })
}



// ============================================================================
// QUERY METHODS
// ============================================================================

/// Get current game state (full - includes all 262K cells)
#[query]
fn get_state(_game_id: u64) -> Result<GameState, String> {
    Ok(build_game_state())
}

/// Get lightweight metadata only (no cells - ~1000x faster for sync checks)
#[query]
fn get_metadata(_game_id: u64) -> Result<GameMetadata, String> {
    CACHED_METADATA.with(|m| {
        let m = m.borrow();
        Ok(GameMetadata {
            width: GRID_SIZE as u32,
            height: GRID_SIZE as u32,
            generation: m.generation,
            players: m.players.clone(),
            balances: m.balances.clone(),
            is_running: m.is_running,
            checkpoint_timestamp_ns: m.checkpoint_timestamp_ns,
        })
    })
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

/// Get instruction profiling stats
#[query]
fn get_instruction_stats() -> String {
    INSTRUCTION_STATS.with(|stats| {
        let s = stats.borrow();
        format!(
            "tick_count: {}, last_step_gen_instructions: {}, last_save_metadata_instructions: {}, last_tick_total_instructions: {}",
            s.tick_count,
            s.last_step_generation_instructions,
            s.last_save_metadata_instructions,
            s.last_tick_total_instructions
        )
    })
}
