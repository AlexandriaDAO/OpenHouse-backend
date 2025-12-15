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

    const BOUND: Bound = Bound::Bounded {
        max_size: 512, // Enough for 10 principals + generation
        is_fixed_size: false,
    };
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

/// Run one generation of Conway's Game of Life
fn step_generation() {
    // Read current grid into memory for processing
    let mut current: Vec<u8> = Vec::with_capacity(GRID_SIZE);
    GRID.with(|g| {
        let g = g.borrow();
        for i in 0..GRID_SIZE as u64 {
            current.push(g.get(i).unwrap_or(0));
        }
    });

    let mut new_grid: Vec<u8> = vec![0u8; GRID_SIZE];

    for row in 0..GRID_HEIGHT {
        for col in 0..GRID_WIDTH {
            let (count, owner_counts) = get_neighbor_info(row, col);
            let current_val = current[idx(row, col)];

            if current_val > 0 {
                // Living cell survives with 2 or 3 neighbors
                if count == 2 || count == 3 {
                    new_grid[idx(row, col)] = current_val;
                }
            } else {
                // Dead cell born with exactly 3 neighbors
                if count == 3 {
                    new_grid[idx(row, col)] = get_majority_owner(&owner_counts);
                }
            }
        }
    }

    // Write new grid back to stable storage
    GRID.with(|g| {
        let g = g.borrow_mut();
        for (i, &val) in new_grid.iter().enumerate() {
            let _ = g.set(i as u64, &val);
        }
    });

    // Update territory for living cells
    for row in 0..GRID_HEIGHT {
        for col in 0..GRID_WIDTH {
            let owner = new_grid[idx(row, col)];
            if owner > 0 {
                set_territory_cell(row, col, owner);
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

    CACHED_METADATA.with(|cached| {
        let mut m = cached.borrow_mut();
        let mut i = 0;
        while i < m.players.len() {
            if live_counts[i + 1] == 0 {
                // Player has no live cells - remove them
                m.players.remove(i);
                // Remap colors for all cells with color > i+1
                let removed_color = (i + 1) as u8;
                GRID.with(|g| {
                    let g = g.borrow_mut();
                    for j in 0..GRID_SIZE as u64 {
                        if let Some(c) = g.get(j) {
                            if c > removed_color {
                                let _ = g.set(j, &(c - 1));
                            }
                        }
                    }
                });
                TERRITORY.with(|t| {
                    let t = t.borrow_mut();
                    for j in 0..GRID_SIZE as u64 {
                        if let Some(c) = t.get(j) {
                            if c > removed_color {
                                let _ = t.set(j, &(c - 1));
                            } else if c == removed_color {
                                // Territory of removed player stays (historical)
                            }
                        }
                    }
                });
                // Re-check live counts after remap
                for k in (removed_color as usize)..MAX_PLAYERS {
                    live_counts[k] = live_counts[k + 1];
                }
                live_counts[MAX_PLAYERS] = 0;
            } else {
                i += 1;
            }
        }
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

/// Place cells on the grid
#[update]
fn place_cells(cells: Vec<(i32, i32)>) -> Result<u32, String> {
    let caller = ic_cdk::api::msg_caller();

    if caller == Principal::anonymous() {
        return Err("Anonymous callers cannot place cells".to_string());
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

/// Advance the simulation by n generations
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

    Ok(build_state())
}

// ============================================================================
// QUERY METHODS
// ============================================================================

/// Get current game state
#[query]
fn get_state() -> LifeState {
    build_state()
}

#[query]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to Life - 1000x1000 persistent world.", name)
}

// Export Candid interface
ic_cdk::export_candid!();
