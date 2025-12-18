//! Life2: Sparse On-Chain Game of Life
//!
//! A 100% on-chain multiplayer Game of Life running at 10 generations/second
//! using sparse iteration. Instead of processing all 262,144 cells every generation,
//! we only process cells that can possibly change state (~20,000 typical).

use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use std::cell::RefCell;
use std::time::Duration;

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_SIZE: usize = 512;
const GRID_SHIFT: usize = 9; // 2^9 = 512
const GRID_MASK: usize = 0x1FF; // 511
const TOTAL_CELLS: usize = 512 * 512; // 262,144
const GRID_WORDS: usize = TOTAL_CELLS / 64; // 4,096 u64s for bitsets

const MAX_PLAYERS: usize = 9;
const STARTING_BALANCE: u64 = 1000;

// Simulation timing: 10 generations per second, batched per tick
const GENERATIONS_PER_TICK: u32 = 10;
const TICK_INTERVAL_MS: u64 = 1000; // 1 second = 10 generations

// Quadrant wipe system
const WIPE_INTERVAL_NS: u64 = 300_000_000_000; // 5 minutes
const QUADRANT_SIZE: usize = 128;
const QUADRANTS_PER_SIDE: usize = 4;
const TOTAL_QUADRANTS: usize = 16;

// ============================================================================
// CELL ENCODING
// ============================================================================
//
// Each cell is 1 byte with three fields packed:
// ┌─────────┬────────┬──────────┐
// │ bits 7-5│ bit 4  │ bits 3-0 │
// │  coins  │ alive  │  owner   │
// │  (0-7)  │ (0/1)  │  (0-9)   │
// └─────────┴────────┴──────────┘

const OWNER_MASK: u8 = 0x0F; // bits 0-3
const ALIVE_BIT: u8 = 0x10; // bit 4
const COINS_SHIFT: u8 = 5; // bits 5-7

#[inline(always)]
fn get_owner(cell: u8) -> u8 {
    cell & OWNER_MASK
}

#[inline(always)]
fn is_alive(cell: u8) -> bool {
    cell & ALIVE_BIT != 0
}

#[inline(always)]
fn get_coins(cell: u8) -> u8 {
    cell >> COINS_SHIFT
}

#[inline(always)]
fn make_cell(owner: u8, alive: bool, coins: u8) -> u8 {
    ((coins & 0x07) << COINS_SHIFT)
        | (if alive { ALIVE_BIT } else { 0 })
        | (owner & OWNER_MASK)
}

#[inline(always)]
fn set_alive(cell: u8, alive: bool) -> u8 {
    if alive {
        cell | ALIVE_BIT
    } else {
        cell & !ALIVE_BIT
    }
}

// ============================================================================
// COORDINATE HELPERS
// ============================================================================

/// Convert (x, y) to flat array index
/// Uses bit operations for speed: y * 512 + x = (y << 9) | x
#[inline(always)]
fn coord_to_index(x: usize, y: usize) -> usize {
    ((y & GRID_MASK) << GRID_SHIFT) | (x & GRID_MASK)
}

/// Convert flat index to (x, y)
#[inline(always)]
fn index_to_coord(idx: usize) -> (usize, usize) {
    let x = idx & GRID_MASK; // idx % 512
    let y = idx >> GRID_SHIFT; // idx / 512
    (x, y)
}

/// Get 8 neighbor indices with TOROIDAL wrapping
/// Grid wraps: x=-1 becomes x=511, x=512 becomes x=0, etc.
#[inline(always)]
fn get_neighbor_indices(idx: usize) -> [usize; 8] {
    let x = idx & GRID_MASK;
    let y = idx >> GRID_SHIFT;

    // Wrapping arithmetic: (x - 1) & MASK handles underflow
    // (x + 1) & MASK handles overflow
    let xm = (x.wrapping_sub(1)) & GRID_MASK; // x - 1, wrapped
    let xp = (x + 1) & GRID_MASK; // x + 1, wrapped
    let ym = (y.wrapping_sub(1)) & GRID_MASK; // y - 1, wrapped
    let yp = (y + 1) & GRID_MASK; // y + 1, wrapped

    [
        (ym << GRID_SHIFT) | xm, // NW
        (ym << GRID_SHIFT) | x,  // N
        (ym << GRID_SHIFT) | xp, // NE
        (y << GRID_SHIFT) | xm,  // W
        (y << GRID_SHIFT) | xp,  // E
        (yp << GRID_SHIFT) | xm, // SW
        (yp << GRID_SHIFT) | x,  // S
        (yp << GRID_SHIFT) | xp, // SE
    ]
}

// ============================================================================
// BITSET OPERATIONS
// ============================================================================

/// Set a single bit in the potential set
#[inline(always)]
fn set_potential(potential: &mut [u64; GRID_WORDS], idx: usize) {
    let word_idx = idx >> 6;
    let bit_mask = 1u64 << (idx & 63);
    potential[word_idx] |= bit_mask;
}

/// Add cell AND all 8 neighbors to potential set
/// This is the key operation for maintaining INVARIANT 1
#[inline(always)]
fn add_with_neighbors(potential: &mut [u64; GRID_WORDS], idx: usize) {
    set_potential(potential, idx);
    for neighbor_idx in get_neighbor_indices(idx) {
        set_potential(potential, neighbor_idx);
    }
}

/// Count set bits in potential (for diagnostics)
fn count_potential(potential: &[u64; GRID_WORDS]) -> u32 {
    potential.iter().map(|w| w.count_ones()).sum()
}

// ============================================================================
// STATE
// ============================================================================

thread_local! {
    /// Main grid: 1 byte per cell = 256 KB
    /// Index formula: y * 512 + x  OR  (y << 9) | x
    static GRID: RefCell<[u8; TOTAL_CELLS]> = RefCell::new([0u8; TOTAL_CELLS]);

    /// Potential bitset: cells to check THIS generation = 32 KB
    /// Bit is SET if cell might change state
    static POTENTIAL: RefCell<[u64; GRID_WORDS]> = RefCell::new([0u64; GRID_WORDS]);

    /// Next potential bitset: being built DURING simulation = 32 KB
    /// After step_generation(), this becomes the new POTENTIAL
    static NEXT_POTENTIAL: RefCell<[u64; GRID_WORDS]> = RefCell::new([0u64; GRID_WORDS]);

    /// Player principals (index 0 = player 1, etc.)
    static PLAYERS: RefCell<Vec<Principal>> = RefCell::new(Vec::new());

    /// Player balances (parallel to PLAYERS)
    static BALANCES: RefCell<Vec<u64>> = RefCell::new(Vec::new());

    /// Current generation counter
    static GENERATION: RefCell<u64> = RefCell::new(0);

    /// Is simulation running?
    static IS_RUNNING: RefCell<bool> = RefCell::new(true);

    /// Quadrant wipe state
    static NEXT_WIPE_QUADRANT: RefCell<usize> = RefCell::new(0);
    static LAST_WIPE_TIME_NS: RefCell<u64> = RefCell::new(0);
}

// ============================================================================
// SIMULATION
// ============================================================================

/// Find majority owner among neighbors, with FAIR tie-breaking using cell position hash.
///
/// Why cell position hash? The old "lowest player wins" approach gave P1 unfair advantage
/// in every tie. Using cell position distributes ties fairly across the grid.
fn find_majority_owner(counts: &[u8; 10], cell_idx: usize) -> u8 {
    // Find the maximum neighbor count
    let max_count = counts[1..=9].iter().max().copied().unwrap_or(0);
    if max_count == 0 {
        return 1; // No neighbors with owners, default to P1
    }

    // Collect all players tied at max_count (ascending order)
    let tied: Vec<u8> = (1..=9)
        .filter(|&p| counts[p] == max_count)
        .map(|p| p as u8)
        .collect();

    // Single winner - no tie to break
    if tied.len() == 1 {
        return tied[0];
    }

    // FAIR TIE-BREAKING: Use cell position to deterministically pick winner
    // Each cell location favors a different player among the tied ones
    // Result: ties distributed evenly across the grid
    let hash = cell_idx % tied.len();
    tied[hash]
}

/// Represents a change to be applied after computing the full generation
#[derive(Clone, Copy)]
enum CellChange {
    /// Cell survives - no grid change needed, just add to next_potential
    Survives,
    /// Cell is born with new owner (coins captured separately)
    Birth { new_owner: u8 },
    /// Cell dies - keep owner and coins, mark as dead
    Death,
    /// Cell stays dead - no action needed
    StaysDead,
}

/// Compute what should happen to a cell WITHOUT modifying the grid.
/// This is critical for correct Game of Life: all cells must see the SAME
/// state (the state at the START of the generation).
fn compute_cell_fate(
    grid: &[u8; TOTAL_CELLS],
    idx: usize,
) -> (CellChange, [u8; 10]) {
    let cell = grid[idx];
    let currently_alive = is_alive(cell);
    let neighbors = get_neighbor_indices(idx);

    // Count alive neighbors and their owners
    let mut alive_count = 0u8;
    let mut owner_counts = [0u8; 10];

    for &n_idx in &neighbors {
        let n = grid[n_idx];
        if is_alive(n) {
            alive_count += 1;
            let owner = get_owner(n);
            if owner > 0 && (owner as usize) < owner_counts.len() {
                owner_counts[owner as usize] += 1;
            }
        }
    }

    let change = match (currently_alive, alive_count) {
        // Survival: 2 or 3 neighbors
        (true, 2) | (true, 3) => CellChange::Survives,

        // Birth: exactly 3 neighbors
        (false, 3) => {
            let new_owner = find_majority_owner(&owner_counts, idx);
            CellChange::Birth { new_owner }
        }

        // Death: wrong neighbor count (0, 1, 4, 5, 6, 7, or 8)
        (true, _) => CellChange::Death,

        // Stays dead: wrong neighbor count for birth
        (false, _) => CellChange::StaysDead,
    };

    (change, owner_counts)
}

/// Apply a computed change to the grid and update next_potential.
/// Called in a second pass AFTER all fates are computed.
fn apply_cell_change(
    grid: &mut [u8; TOTAL_CELLS],
    next_potential: &mut [u64; GRID_WORDS],
    balances: &mut Vec<u64>,
    idx: usize,
    change: CellChange,
) {
    let cell = grid[idx];
    let neighbors = get_neighbor_indices(idx);

    match change {
        CellChange::Survives => {
            // Cell stays alive - no grid change needed
            // Add to next_potential because neighbors might change
            add_with_neighbors(next_potential, idx);
        }

        CellChange::Birth { new_owner } => {
            // CAPTURE LOGIC: Only transfer coins from ENEMY territory
            let old_owner = get_owner(cell);
            let old_coins = get_coins(cell);
            if old_owner > 0 && old_owner != new_owner && old_coins > 0 {
                let new_owner_idx = (new_owner - 1) as usize;
                if new_owner_idx < balances.len() {
                    balances[new_owner_idx] += old_coins as u64;
                }
            }

            // Birth cell with 0 coins
            grid[idx] = make_cell(new_owner, true, 0);
            add_with_neighbors(next_potential, idx);
        }

        CellChange::Death => {
            // Cell dies - keep owner and coins
            let owner = get_owner(cell);
            let coins = get_coins(cell);
            grid[idx] = make_cell(owner, false, coins);

            // Neighbors might now be able to change state
            for &n_idx in &neighbors {
                add_with_neighbors(next_potential, n_idx);
            }
        }

        CellChange::StaysDead => {
            // Nothing to do
        }
    }
}

fn step_generation() {
    // TWO-PASS ALGORITHM for correct Game of Life simulation:
    // Pass 1: Compute all cell fates (READ-ONLY on grid)
    // Pass 2: Apply all changes to grid
    //
    // This ensures all cells see the SAME state (start of generation),
    // which is required for Conway's simultaneous update rule.

    // Collect all changes in first pass
    let mut changes: Vec<(usize, CellChange)> = Vec::new();

    // PASS 1: Compute fates (grid is read-only)
    GRID.with(|grid| {
        POTENTIAL.with(|potential| {
            let grid = &*grid.borrow();
            let potential = &*potential.borrow();

            for word_idx in 0..GRID_WORDS {
                let mut word = potential[word_idx];
                if word == 0 {
                    continue;
                }

                while word != 0 {
                    let bit_pos = word.trailing_zeros() as usize;
                    let idx = (word_idx << 6) | bit_pos;

                    let (change, _owner_counts) = compute_cell_fate(grid, idx);

                    // Only record changes that need action
                    if !matches!(change, CellChange::StaysDead) {
                        changes.push((idx, change));
                    }

                    word &= word - 1;
                }
            }
        });
    });

    // PASS 2: Apply all changes
    GRID.with(|grid| {
        NEXT_POTENTIAL.with(|next_potential| {
            BALANCES.with(|balances| {
                let grid = &mut *grid.borrow_mut();
                let next_potential = &mut *next_potential.borrow_mut();
                let balances = &mut *balances.borrow_mut();

                // Clear next_potential
                next_potential.fill(0);

                // Apply each computed change
                for (idx, change) in changes {
                    apply_cell_change(grid, next_potential, balances, idx, change);
                }
            });
        });
    });

    // Swap potential buffers
    POTENTIAL.with(|p| {
        NEXT_POTENTIAL.with(|np| {
            std::mem::swap(&mut *p.borrow_mut(), &mut *np.borrow_mut());
        });
    });

    GENERATION.with(|g| *g.borrow_mut() += 1);
}

/// Rebuild potential bitset by scanning for alive cells
/// Called after upgrade or when potential might be corrupted
fn rebuild_potential_from_grid() {
    GRID.with(|g| {
        POTENTIAL.with(|p| {
            let grid = g.borrow();
            let potential = &mut *p.borrow_mut();

            // Clear potential
            potential.fill(0);

            // Add every alive cell and its neighbors
            for idx in 0..TOTAL_CELLS {
                if is_alive(grid[idx]) {
                    add_with_neighbors(potential, idx);
                }
            }
        });
    });
}

// ============================================================================
// QUADRANT WIPE SYSTEM
// ============================================================================

/// Wipe all alive cells in a quadrant (preserve owner and coins)
fn wipe_quadrant(quadrant: usize) {
    let qx_start = (quadrant % QUADRANTS_PER_SIDE) * QUADRANT_SIZE;
    let qy_start = (quadrant / QUADRANTS_PER_SIDE) * QUADRANT_SIZE;

    GRID.with(|g| {
        POTENTIAL.with(|p| {
            let grid = &mut *g.borrow_mut();
            let potential = &mut *p.borrow_mut();

            for y in qy_start..(qy_start + QUADRANT_SIZE) {
                for x in qx_start..(qx_start + QUADRANT_SIZE) {
                    let idx = coord_to_index(x, y);
                    let cell = grid[idx];

                    if is_alive(cell) {
                        // Kill cell but preserve owner and coins
                        grid[idx] = set_alive(cell, false);

                        // Remove from potential set
                        let word_idx = idx >> 6;
                        let bit_mask = 1u64 << (idx & 63);
                        potential[word_idx] &= !bit_mask;

                        // Add neighbors to potential (they might now change)
                        for neighbor_idx in get_neighbor_indices(idx) {
                            set_potential(potential, neighbor_idx);
                        }
                    }
                }
            }
        });
    });
}

/// Run quadrant wipe if 1 minute has passed
fn run_wipe_if_needed() {
    let now = ic_cdk::api::time();

    let should_wipe = LAST_WIPE_TIME_NS.with(|t| {
        now.saturating_sub(*t.borrow()) >= WIPE_INTERVAL_NS
    });

    if !should_wipe {
        return;
    }

    LAST_WIPE_TIME_NS.with(|t| *t.borrow_mut() = now);

    let quadrant = NEXT_WIPE_QUADRANT.with(|q| {
        let current = *q.borrow();
        *q.borrow_mut() = (current + 1) % TOTAL_QUADRANTS;
        current
    });

    wipe_quadrant(quadrant);

    ic_cdk::println!("Wiped quadrant {}", quadrant);
}

// ============================================================================
// TIMER
// ============================================================================

fn start_simulation_timer() {
    // IC CDK timers expect an async function that returns a Future.
    // The async block runs synchronously (no .await points), so it executes immediately.
    ic_cdk_timers::set_timer_interval(Duration::from_millis(TICK_INTERVAL_MS), || async {
        let is_running = IS_RUNNING.with(|r| *r.borrow());
        if is_running {
            for _ in 0..GENERATIONS_PER_TICK {
                step_generation();
            }

            // Run quadrant wipe if needed
            run_wipe_if_needed();
        }
    });
}

// ============================================================================
// TYPES FOR CANDID
// ============================================================================

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct SparseCell {
    pub x: u16,
    pub y: u16,
    pub owner: u8,
    pub coins: u8,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameState {
    pub generation: u64,
    pub alive_cells: Vec<SparseCell>,
    pub territory: Vec<SparseCell>,
    pub players: Vec<Principal>,
    pub balances: Vec<u64>,
    pub player_num: Option<u8>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlaceResult {
    pub placed: u32,
    pub generation: u64,
    pub new_balance: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug, Default)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
    balances: Vec<u64>,
    is_running: bool,
}

// ============================================================================
// CANISTER LIFECYCLE
// ============================================================================

#[init]
fn init() {
    IS_RUNNING.with(|r| *r.borrow_mut() = true);
    start_simulation_timer();
    ic_cdk::println!(
        "Life2 Backend Initialized - {}x{} sparse world, {} gen/sec",
        GRID_SIZE,
        GRID_SIZE,
        GENERATIONS_PER_TICK
    );
}

#[pre_upgrade]
fn pre_upgrade() {
    // 1. Save grid (256 KB)
    GRID.with(|g| {
        let grid = g.borrow();
        ic_cdk::stable::stable_grow(5).ok(); // Ensure enough pages (5 * 64KB = 320KB)
        ic_cdk::stable::stable_write(0, &grid[..]);
    });

    // 2. Save metadata as candid at offset 256KB
    let metadata = Metadata {
        generation: GENERATION.with(|g| *g.borrow()),
        players: PLAYERS.with(|p| p.borrow().clone()),
        balances: BALANCES.with(|b| b.borrow().clone()),
        is_running: IS_RUNNING.with(|r| *r.borrow()),
    };
    let encoded = candid::encode_one(&metadata).unwrap();
    let len = encoded.len() as u32;

    // Write length prefix then data
    ic_cdk::stable::stable_write(TOTAL_CELLS as u64, &len.to_le_bytes());
    ic_cdk::stable::stable_write(TOTAL_CELLS as u64 + 4, &encoded);

    ic_cdk::println!(
        "Life2 pre_upgrade: saved {} cells, {} bytes metadata",
        TOTAL_CELLS,
        encoded.len()
    );
}

#[post_upgrade]
fn post_upgrade() {
    // Check if we have valid stable memory
    let stable_size = ic_cdk::stable::stable_size();
    if stable_size >= 5 {
        // 1. Restore grid
        GRID.with(|g| {
            let mut grid = g.borrow_mut();
            let mut buf = [0u8; TOTAL_CELLS];
            ic_cdk::stable::stable_read(0, &mut buf);
            *grid = buf;
        });

        // 2. Restore metadata
        let mut len_buf = [0u8; 4];
        ic_cdk::stable::stable_read(TOTAL_CELLS as u64, &mut len_buf);
        let len = u32::from_le_bytes(len_buf) as usize;

        if len > 0 && len < 100_000 {
            // Sanity check
            let mut meta_buf = vec![0u8; len];
            ic_cdk::stable::stable_read(TOTAL_CELLS as u64 + 4, &mut meta_buf);

            if let Ok(metadata) = candid::decode_one::<Metadata>(&meta_buf) {
                GENERATION.with(|g| *g.borrow_mut() = metadata.generation);
                PLAYERS.with(|p| *p.borrow_mut() = metadata.players);
                BALANCES.with(|b| *b.borrow_mut() = metadata.balances);
                IS_RUNNING.with(|r| *r.borrow_mut() = metadata.is_running);
                ic_cdk::println!(
                    "Life2 post_upgrade: restored generation {}, {} players",
                    metadata.generation,
                    PLAYERS.with(|p| p.borrow().len())
                );
            }
        }
    } else {
        ic_cdk::println!("Life2 post_upgrade: fresh deploy, no stable data");
    }

    // 3. CRITICAL: Rebuild potential set from grid
    rebuild_potential_from_grid();

    // 4. Restart timer
    start_simulation_timer();
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/// Admin principal (daopad identity) - only this principal can pause/resume/reset
const ADMIN_PRINCIPAL: &str = "67ktx-ln42b-uzmo5-bdiyn-gu62c-cd4h4-a5qt3-2w3rs-cixdl-iaso2-mqe";

/// Check if caller is anonymous (not authenticated)
/// Anonymous principal is "2vxsx-fae"
fn is_anonymous(principal: &Principal) -> bool {
    *principal == Principal::anonymous()
}

/// Require authenticated caller, return error if anonymous
fn require_authenticated() -> Result<Principal, String> {
    let caller = ic_cdk::api::msg_caller();
    if is_anonymous(&caller) {
        return Err("Authentication required. Please log in with Internet Identity.".to_string());
    }
    Ok(caller)
}

/// Require admin caller, return error if not admin
fn require_admin() -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();
    let admin = Principal::from_text(ADMIN_PRINCIPAL)
        .map_err(|_| "Invalid admin principal configured".to_string())?;

    if caller != admin {
        return Err("Admin access required".to_string());
    }
    Ok(())
}

// ============================================================================
// UPDATE METHODS
// ============================================================================

/// Join the game and get assigned a player number (1-9)
/// Requires authentication - anonymous users cannot join.
#[update]
fn join_game() -> Result<u8, String> {
    let caller = require_authenticated()?;

    PLAYERS.with(|p| {
        let mut players = p.borrow_mut();

        // Check if already registered
        if let Some(pos) = players.iter().position(|&p| p == caller) {
            return Ok((pos + 1) as u8);
        }

        // Check if room for new player
        if players.len() >= MAX_PLAYERS {
            return Err("Game full - max 9 players".to_string());
        }

        // Register new player
        players.push(caller);
        BALANCES.with(|b| b.borrow_mut().push(STARTING_BALANCE));
        Ok(players.len() as u8)
    })
}

/// Place cells on the grid. Costs 1 coin per cell.
/// Requires authentication - anonymous users cannot place cells.
#[update]
fn place_cells(cells: Vec<(i32, i32)>) -> Result<PlaceResult, String> {
    let caller = require_authenticated()?;

    // Get or assign player number
    let player_num = PLAYERS.with(|p| {
        let mut players = p.borrow_mut();

        // Check if already registered
        if let Some(pos) = players.iter().position(|&p| p == caller) {
            return Ok((pos + 1) as u8);
        }

        // Check if room for new player
        if players.len() >= MAX_PLAYERS {
            return Err("Game full".to_string());
        }

        // Register new player
        players.push(caller);
        BALANCES.with(|b| b.borrow_mut().push(STARTING_BALANCE));
        Ok(players.len() as u8)
    })?;

    let player_idx = (player_num - 1) as usize;
    let cost = cells.len() as u64;

    // Check balance
    let balance = BALANCES.with(|b| b.borrow().get(player_idx).copied().unwrap_or(0));
    if balance < cost {
        return Err(format!("Need {} coins, have {}", cost, balance));
    }

    let mut placed = 0u32;

    GRID.with(|g| {
        POTENTIAL.with(|p| {
            let grid = &mut *g.borrow_mut();
            let potential = &mut *p.borrow_mut();

            for (x, y) in cells {
                // Wrap coordinates to grid
                let wx = ((x % 512) + 512) as usize % 512;
                let wy = ((y % 512) + 512) as usize % 512;
                let idx = coord_to_index(wx, wy);

                let cell = grid[idx];

                // Skip if alive
                if is_alive(cell) {
                    continue;
                }

                // Skip if 7 coins (cap)
                if get_coins(cell) >= 7 {
                    continue;
                }

                // Place cell
                let new_coins = get_coins(cell).saturating_add(1).min(7);
                grid[idx] = make_cell(player_num, true, new_coins);

                // Add to potential (CRITICAL!)
                add_with_neighbors(potential, idx);

                placed += 1;
            }
        });
    });

    // Deduct balance (only for actually placed cells)
    BALANCES.with(|b| {
        if let Some(bal) = b.borrow_mut().get_mut(player_idx) {
            *bal -= placed as u64;
        }
    });

    let generation = GENERATION.with(|g| *g.borrow());
    let new_balance = BALANCES.with(|b| b.borrow().get(player_idx).copied().unwrap_or(0));

    Ok(PlaceResult {
        placed,
        generation,
        new_balance,
    })
}

/// Pause the simulation (admin only)
#[update]
fn pause_game() -> Result<(), String> {
    require_admin()?;
    IS_RUNNING.with(|r| *r.borrow_mut() = false);
    Ok(())
}

/// Resume the simulation (admin only)
#[update]
fn resume_game() -> Result<(), String> {
    require_admin()?;
    IS_RUNNING.with(|r| *r.borrow_mut() = true);
    Ok(())
}

/// Reset the game to initial state (admin only)
#[update]
fn reset_game() -> Result<(), String> {
    require_admin()?;
    GRID.with(|g| g.borrow_mut().fill(0));
    POTENTIAL.with(|p| p.borrow_mut().fill(0));
    NEXT_POTENTIAL.with(|np| np.borrow_mut().fill(0));
    GENERATION.with(|g| *g.borrow_mut() = 0);
    // Reset balances but keep players
    BALANCES.with(|b| {
        let mut balances = b.borrow_mut();
        for bal in balances.iter_mut() {
            *bal = STARTING_BALANCE;
        }
    });
    IS_RUNNING.with(|r| *r.borrow_mut() = true);
    // Reset wipe state
    NEXT_WIPE_QUADRANT.with(|q| *q.borrow_mut() = 0);
    LAST_WIPE_TIME_NS.with(|t| *t.borrow_mut() = 0);
    Ok(())
}

// ============================================================================
// QUERY METHODS
// ============================================================================

/// Get current game state (sparse format - only non-empty cells)
#[query]
fn get_state() -> GameState {
    let caller = ic_cdk::api::msg_caller();

    let mut alive_cells = Vec::new();
    let mut territory = Vec::new();

    GRID.with(|g| {
        let grid = g.borrow();

        for idx in 0..TOTAL_CELLS {
            let cell = grid[idx];

            // Skip completely empty cells
            if cell == 0 {
                continue;
            }

            let (x, y) = index_to_coord(idx);
            let owner = get_owner(cell);
            let coins = get_coins(cell);

            let sparse = SparseCell {
                x: x as u16,
                y: y as u16,
                owner,
                coins,
            };

            if is_alive(cell) {
                alive_cells.push(sparse);
            } else {
                // Dead but has territory or coins
                territory.push(sparse);
            }
        }
    });

    let player_num = PLAYERS.with(|p| {
        p.borrow()
            .iter()
            .position(|&p| p == caller)
            .map(|i| (i + 1) as u8)
    });

    GameState {
        generation: GENERATION.with(|g| *g.borrow()),
        alive_cells,
        territory,
        players: PLAYERS.with(|p| p.borrow().clone()),
        balances: BALANCES.with(|b| b.borrow().clone()),
        player_num,
    }
}

/// Get current generation number
#[query]
fn get_generation() -> u64 {
    GENERATION.with(|g| *g.borrow())
}

/// Get number of alive cells
#[query]
fn get_alive_count() -> u32 {
    GRID.with(|g| {
        g.borrow()
            .iter()
            .filter(|&&cell| is_alive(cell))
            .count() as u32
    })
}

/// Get number of cells in potential set (diagnostic)
#[query]
fn get_potential_count() -> u32 {
    POTENTIAL.with(|p| count_potential(&p.borrow()))
}

/// Get player's balance
#[query]
fn get_balance() -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    PLAYERS.with(|p| {
        let players = p.borrow();
        let idx = players
            .iter()
            .position(|&p| p == caller)
            .ok_or("Not a player")?;
        BALANCES.with(|b| Ok(b.borrow().get(idx).copied().unwrap_or(0)))
    })
}

/// Check if simulation is running
#[query]
fn is_running() -> bool {
    IS_RUNNING.with(|r| *r.borrow())
}

/// Get next quadrant wipe info
/// Returns (next_quadrant_to_wipe, seconds_until_wipe)
#[query]
fn get_next_wipe() -> (u8, u64) {
    let quadrant = NEXT_WIPE_QUADRANT.with(|q| *q.borrow());
    let last_wipe = LAST_WIPE_TIME_NS.with(|t| *t.borrow());
    let now = ic_cdk::api::time();
    let elapsed = now.saturating_sub(last_wipe);
    let remaining_ns = WIPE_INTERVAL_NS.saturating_sub(elapsed);
    let remaining_secs = remaining_ns / 1_000_000_000;
    (quadrant as u8, remaining_secs)
}

/// Simple greeting
#[query]
fn greet(name: String) -> String {
    format!(
        "Hello, {}! Welcome to Life2 - a {}x{} sparse Game of Life at {} gen/sec.",
        name, GRID_SIZE, GRID_SIZE, GENERATIONS_PER_TICK
    )
}

// ============================================================================
// TESTS
// ============================================================================

// Tests are in a separate file for cleaner organization
#[cfg(test)]
mod tests;

// Export Candid interface
ic_cdk::export_candid!();
