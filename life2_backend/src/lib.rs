//! Life2: Sparse On-Chain Game of Life
//!
//! A 100% on-chain multiplayer Game of Life running at 10 generations/second
//! using sparse iteration. Instead of processing all 262,144 cells every generation,
//! we only process cells that can possibly change state (~20,000 typical).

use candid::{CandidType, Deserialize, Principal};
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use std::cell::RefCell;
use std::collections::HashMap;
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
const FAUCET_AMOUNT: u64 = 1000;

// Simulation timing: 10 generations per second, batched per tick
const GENERATIONS_PER_TICK: u32 = 10;
const TICK_INTERVAL_MS: u64 = 1000; // 1 second = 10 generations

// Quadrant wipe system
const WIPE_INTERVAL_NS: u64 = 300_000_000_000; // 5 minutes
const QUADRANT_SIZE: usize = 128;
const QUADRANTS_PER_SIDE: usize = 4;
const TOTAL_QUADRANTS: usize = 16;

// Player slot grace period - how long a player can have 0 cells before losing their slot
const SLOT_GRACE_PERIOD_NS: u64 = 600_000_000_000; // 10 minutes

// Quadrant control system - 80% of owned territory required to control a quadrant
const CONTROLLER_THRESHOLD_PERCENT: u32 = 80;

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
    /// Empty slots use Principal::anonymous() as a sentinel
    static PLAYERS: RefCell<Vec<Principal>> = RefCell::new(Vec::new());

    /// Player balances keyed by principal (persists even after "death")
    static BALANCES: RefCell<HashMap<Principal, u64>> = RefCell::new(HashMap::new());

    /// Alive cell count per player slot (parallel to PLAYERS)
    static CELL_COUNTS: RefCell<Vec<u32>> = RefCell::new(Vec::new());

    /// Timestamp (ns) when each player's cells first hit 0 (None if they have cells)
    /// After SLOT_GRACE_PERIOD_NS, the slot is freed for reuse
    static ZERO_CELLS_SINCE: RefCell<Vec<Option<u64>>> = RefCell::new(Vec::new());

    /// Current generation counter
    static GENERATION: RefCell<u64> = RefCell::new(0);

    /// Is simulation running?
    static IS_RUNNING: RefCell<bool> = RefCell::new(true);

    /// Quadrant wipe state
    static NEXT_WIPE_QUADRANT: RefCell<usize> = RefCell::new(0);
    static LAST_WIPE_TIME_NS: RefCell<u64> = RefCell::new(0);

    /// Territory count per player per quadrant - updated incrementally
    /// [quadrant][player] where player 0 is unused, 1-9 are valid players
    /// This avoids expensive periodic full-grid scans
    static QUADRANT_TERRITORY: RefCell<[[u32; MAX_PLAYERS + 1]; TOTAL_QUADRANTS]> =
        RefCell::new([[0u32; MAX_PLAYERS + 1]; TOTAL_QUADRANTS]);

    /// Controller of each quadrant (0 = no controller, 1-9 = player number)
    /// Only the controller can collect coins in their quadrant
    static QUADRANT_CONTROLLER: RefCell<[u8; TOTAL_QUADRANTS]> =
        RefCell::new([0u8; TOTAL_QUADRANTS]);
}

// ============================================================================
// SIMULATION
// ============================================================================

// ============================================================================
// QUADRANT CONTROL SYSTEM
// ============================================================================

/// Get quadrant index (0-15) from cell index
#[inline(always)]
fn get_quadrant(idx: usize) -> usize {
    let x = idx & GRID_MASK;           // x coordinate
    let y = idx >> GRID_SHIFT;         // y coordinate
    let qx = x >> 7;                   // x / 128 = quadrant x (0-3)
    let qy = y >> 7;                   // y / 128 = quadrant y (0-3)
    (qy << 2) | qx                     // qy * 4 + qx
}

/// Update territory count when ownership changes
/// Returns the new controller if control changed, None otherwise
#[inline(always)]
fn update_quadrant_territory(quadrant: usize, old_owner: u8, new_owner: u8) -> Option<u8> {
    if old_owner == new_owner {
        return None;
    }

    QUADRANT_TERRITORY.with(|t| {
        let mut territory = t.borrow_mut();

        // Decrement old owner's count
        if old_owner > 0 && old_owner <= MAX_PLAYERS as u8 {
            territory[quadrant][old_owner as usize] =
                territory[quadrant][old_owner as usize].saturating_sub(1);
        }

        // Increment new owner's count
        if new_owner > 0 && new_owner <= MAX_PLAYERS as u8 {
            territory[quadrant][new_owner as usize] += 1;
        }

        // Check if controller needs to change
        let total: u32 = territory[quadrant][1..=MAX_PLAYERS].iter().sum();
        if total == 0 {
            // Empty quadrant
            QUADRANT_CONTROLLER.with(|c| {
                let mut controllers = c.borrow_mut();
                if controllers[quadrant] != 0 {
                    controllers[quadrant] = 0;
                    return Some(0);
                }
                None
            })
        } else {
            let threshold = (total * CONTROLLER_THRESHOLD_PERCENT) / 100;

            // Check if any player now has 80%+
            for player in 1..=MAX_PLAYERS as u8 {
                if territory[quadrant][player as usize] >= threshold {
                    return QUADRANT_CONTROLLER.with(|c| {
                        let mut controllers = c.borrow_mut();
                        if controllers[quadrant] != player {
                            controllers[quadrant] = player;
                            ic_cdk::println!(
                                "Quadrant {} control: Player {} ({}%)",
                                quadrant,
                                player,
                                (territory[quadrant][player as usize] * 100) / total
                            );
                            return Some(player);
                        }
                        None
                    });
                }
            }

            // No one has 80% - controller stays the same (sticky)
            None
        }
    })
}

/// Get current controller of a quadrant
#[inline(always)]
fn get_quadrant_controller(quadrant: usize) -> u8 {
    QUADRANT_CONTROLLER.with(|c| c.borrow()[quadrant])
}

// ============================================================================
// GAME OF LIFE RULES
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
/// Returns (owner_born, owner_died) for cell count tracking.
fn apply_cell_change(
    grid: &mut [u8; TOTAL_CELLS],
    next_potential: &mut [u64; GRID_WORDS],
    balances: &mut HashMap<Principal, u64>,
    players: &[Principal],
    idx: usize,
    change: CellChange,
) -> (Option<u8>, Option<u8>) {
    let cell = grid[idx];
    let neighbors = get_neighbor_indices(idx);

    match change {
        CellChange::Survives => {
            // Cell stays alive - no grid change needed
            // Add to next_potential because neighbors might change
            add_with_neighbors(next_potential, idx);
            (None, None)
        }

        CellChange::Birth { new_owner } => {
            let old_owner = get_owner(cell);
            let old_coins = get_coins(cell);
            let quadrant = get_quadrant(idx);

            // Update territory tracking (incremental - no full scan needed)
            update_quadrant_territory(quadrant, old_owner, new_owner);

            // Determine if new_owner can collect coins
            // Requires: enemy coins exist AND new_owner controls this quadrant
            let can_collect = if old_owner == 0 || old_owner == new_owner || old_coins == 0 {
                // No coins, own coins, or unowned territory - nothing to collect
                false
            } else {
                // Check if new_owner controls this quadrant
                get_quadrant_controller(quadrant) == new_owner
            };

            if can_collect {
                // CAPTURE: Controller collecting enemy coins
                let new_owner_idx = (new_owner - 1) as usize;
                if new_owner_idx < players.len() {
                    let principal = players[new_owner_idx];
                    if principal != Principal::anonymous() {
                        *balances.entry(principal).or_insert(0) += old_coins as u64;
                    }
                }
                // Cell starts with 0 coins (collected)
                grid[idx] = make_cell(new_owner, true, 0);
            } else {
                // NO CAPTURE: Either not controller, own coins, or no coins
                // Coins stay on the cell (territory changes hands, coins don't)
                grid[idx] = make_cell(new_owner, true, old_coins);
            }

            add_with_neighbors(next_potential, idx);
            (Some(new_owner), None) // new_owner gained a cell
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
            (None, Some(owner)) // owner lost a cell
        }

        CellChange::StaysDead => {
            // Nothing to do
            (None, None)
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

    // Track cell count deltas: [births, deaths] per owner
    let mut count_deltas = [0i32; MAX_PLAYERS + 1]; // Index 0 unused, 1-9 for players

    // PASS 2: Apply all changes
    GRID.with(|grid| {
        NEXT_POTENTIAL.with(|next_potential| {
            BALANCES.with(|balances| {
                PLAYERS.with(|players| {
                    let grid = &mut *grid.borrow_mut();
                    let next_potential = &mut *next_potential.borrow_mut();
                    let balances = &mut *balances.borrow_mut();
                    let players = &*players.borrow();

                    // Clear next_potential
                    next_potential.fill(0);

                    // Apply each computed change
                    for (idx, change) in changes {
                        let (born, died) =
                            apply_cell_change(grid, next_potential, balances, players, idx, change);

                        if let Some(owner) = born {
                            if (owner as usize) <= MAX_PLAYERS {
                                count_deltas[owner as usize] += 1;
                            }
                        }
                        if let Some(owner) = died {
                            if (owner as usize) <= MAX_PLAYERS {
                                count_deltas[owner as usize] -= 1;
                            }
                        }
                    }
                });
            });
        });
    });

    // Update cell counts and manage grace period for dead players
    let now = ic_cdk::api::time();
    CELL_COUNTS.with(|counts| {
        ZERO_CELLS_SINCE.with(|zero_since| {
            PLAYERS.with(|players| {
                let counts = &mut *counts.borrow_mut();
                let zero_since = &mut *zero_since.borrow_mut();
                let players = &mut *players.borrow_mut();

                for (owner, &delta) in count_deltas.iter().enumerate().skip(1) {
                    let idx = owner - 1;
                    if idx < counts.len() {
                        let old_count = counts[idx];
                        // Apply delta (can go negative temporarily, saturate to 0)
                        let new_count = (old_count as i32 + delta).max(0) as u32;
                        counts[idx] = new_count;

                        // Extend zero_since vec if needed
                        while zero_since.len() <= idx {
                            zero_since.push(None);
                        }

                        if new_count == 0 && old_count > 0 {
                            // Just hit 0 cells - start grace period
                            zero_since[idx] = Some(now);
                        } else if new_count > 0 && old_count == 0 {
                            // Recovered from 0 cells - clear grace period
                            zero_since[idx] = None;
                        } else if new_count == 0 {
                            // Still at 0 - check if grace period expired
                            if let Some(since) = zero_since[idx] {
                                if now.saturating_sub(since) >= SLOT_GRACE_PERIOD_NS {
                                    // Grace period expired - free the slot
                                    if idx < players.len() {
                                        players[idx] = Principal::anonymous();
                                    }
                                    zero_since[idx] = None;
                                }
                            }
                        }
                    }
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

/// Rebuild QUADRANT_TERRITORY from grid state
/// Called on post_upgrade if territory data is missing (first deploy with this feature)
fn rebuild_quadrant_territory() {
    GRID.with(|g| {
        QUADRANT_TERRITORY.with(|t| {
            let grid = g.borrow();
            let mut territory = t.borrow_mut();

            // Clear all counts
            for q in 0..TOTAL_QUADRANTS {
                for p in 0..=MAX_PLAYERS {
                    territory[q][p] = 0;
                }
            }

            // Count from grid - all owned cells (alive or dead) count as territory
            for (idx, &cell) in grid.iter().enumerate() {
                let owner = get_owner(cell) as usize;
                if owner > 0 && owner <= MAX_PLAYERS {
                    let quadrant = get_quadrant(idx);
                    territory[quadrant][owner] += 1;
                }
            }
        });
    });

    // Now calculate initial controllers
    QUADRANT_TERRITORY.with(|t| {
        QUADRANT_CONTROLLER.with(|c| {
            let territory = t.borrow();
            let mut controllers = c.borrow_mut();

            for q in 0..TOTAL_QUADRANTS {
                let total: u32 = territory[q][1..=MAX_PLAYERS].iter().sum();
                if total == 0 {
                    controllers[q] = 0;
                    continue;
                }

                let threshold = (total * CONTROLLER_THRESHOLD_PERCENT) / 100;
                controllers[q] = (1..=MAX_PLAYERS as u8)
                    .find(|&p| territory[q][p as usize] >= threshold)
                    .unwrap_or(0);
            }
        });
    });

    ic_cdk::println!("Rebuilt quadrant territory counts from grid");
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
    pub quadrant_controllers: Vec<u8>,  // 16 values: 0=no controller, 1-9=player
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlaceResult {
    pub placed: u32,
    pub generation: u64,
    pub new_balance: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct SlotInfo {
    pub slot: u8,                     // 1-9
    pub occupied: bool,               // true if a player is in this slot
    pub cell_count: u32,              // alive cells owned by this slot
    pub territory_cells: u32,         // dead cells (territory) owned by this slot
    pub territory_coins: u32,         // coins sitting in territory cells
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct QuadrantInfo {
    pub quadrant: u8,                  // 0-15
    pub territory_by_player: Vec<u32>, // 9 values: [P1, P2, ..., P9]
    pub total_territory: u32,
    pub coins_by_player: Vec<u32>,     // 9 values: coins per player in this quadrant
    pub total_coins: u32,
    pub controller: u8,                // 0=no controller, 1-9=player number
}

#[derive(CandidType, Deserialize, Clone, Debug, Default)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
    balances: Vec<(Principal, u64)>,
    cell_counts: Vec<u32>,
    is_running: bool,
    // Added later - optional for backward compatibility
    #[serde(default)]
    zero_cells_since: Vec<Option<u64>>,
    // Quadrant control state (added for 80% territorial control feature)
    #[serde(default)]
    quadrant_territory: Vec<Vec<u32>>,  // [quadrant][player]
    #[serde(default)]
    quadrant_controllers: Vec<u8>,       // 16 values, 0=no controller, 1-9=player
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
    // Save grid (256 KB)
    GRID.with(|g| {
        ic_cdk::stable::stable_grow(5).ok();
        ic_cdk::stable::stable_write(0, &g.borrow()[..]);
    });

    // Save metadata at offset 256KB
    let metadata = Metadata {
        generation: GENERATION.with(|g| *g.borrow()),
        players: PLAYERS.with(|p| p.borrow().clone()),
        balances: BALANCES.with(|b| b.borrow().iter().map(|(&k, &v)| (k, v)).collect()),
        cell_counts: CELL_COUNTS.with(|c| c.borrow().clone()),
        is_running: IS_RUNNING.with(|r| *r.borrow()),
        zero_cells_since: ZERO_CELLS_SINCE.with(|z| z.borrow().clone()),
        // Save quadrant control state
        quadrant_territory: QUADRANT_TERRITORY.with(|t| {
            t.borrow().iter().map(|q| q.to_vec()).collect()
        }),
        quadrant_controllers: QUADRANT_CONTROLLER.with(|c| c.borrow().to_vec()),
    };
    let encoded = candid::encode_one(&metadata).unwrap();
    ic_cdk::stable::stable_write(TOTAL_CELLS as u64, &(encoded.len() as u32).to_le_bytes());
    ic_cdk::stable::stable_write(TOTAL_CELLS as u64 + 4, &encoded);
}

#[post_upgrade]
fn post_upgrade() {
    let stable_size = ic_cdk::stable::stable_size();
    let mut has_territory_data = false;

    if stable_size >= 5 {
        // Restore grid
        GRID.with(|g| {
            let mut grid = g.borrow_mut();
            let mut buf = [0u8; TOTAL_CELLS];
            ic_cdk::stable::stable_read(0, &mut buf);
            *grid = buf;
        });

        // Restore metadata
        let mut len_buf = [0u8; 4];
        ic_cdk::stable::stable_read(TOTAL_CELLS as u64, &mut len_buf);
        let len = u32::from_le_bytes(len_buf) as usize;

        if len > 0 && len < 100_000 {
            let mut meta_buf = vec![0u8; len];
            ic_cdk::stable::stable_read(TOTAL_CELLS as u64 + 4, &mut meta_buf);

            if let Ok(metadata) = candid::decode_one::<Metadata>(&meta_buf) {
                GENERATION.with(|g| *g.borrow_mut() = metadata.generation);
                PLAYERS.with(|p| *p.borrow_mut() = metadata.players);
                BALANCES.with(|b| {
                    let mut balances = b.borrow_mut();
                    for (principal, amount) in metadata.balances {
                        balances.insert(principal, amount);
                    }
                });
                CELL_COUNTS.with(|c| *c.borrow_mut() = metadata.cell_counts);
                IS_RUNNING.with(|r| *r.borrow_mut() = metadata.is_running);
                ZERO_CELLS_SINCE.with(|z| *z.borrow_mut() = metadata.zero_cells_since);

                // Restore quadrant territory counts
                has_territory_data = !metadata.quadrant_territory.is_empty();
                if has_territory_data {
                    QUADRANT_TERRITORY.with(|t| {
                        let mut territory = t.borrow_mut();
                        for (q, counts) in metadata.quadrant_territory.iter().enumerate() {
                            if q < TOTAL_QUADRANTS {
                                for (p, &count) in counts.iter().enumerate() {
                                    if p <= MAX_PLAYERS {
                                        territory[q][p] = count;
                                    }
                                }
                            }
                        }
                    });
                }

                // Restore quadrant controllers
                if !metadata.quadrant_controllers.is_empty() {
                    QUADRANT_CONTROLLER.with(|c| {
                        let mut controllers = c.borrow_mut();
                        for (i, &controller) in metadata.quadrant_controllers.iter().enumerate() {
                            if i < TOTAL_QUADRANTS {
                                controllers[i] = controller;
                            }
                        }
                    });
                }
            }
        }
    }

    rebuild_potential_from_grid();

    // If no territory data (first deploy with this feature), rebuild from grid
    if !has_territory_data {
        rebuild_quadrant_territory();
    }

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

/// Find or create a player slot for a principal.
/// Returns (player_number, is_new_player).
/// Reuses empty slots (where previous player died) before adding new ones.
fn get_or_create_player_slot(caller: Principal) -> Result<(u8, bool), String> {
    PLAYERS.with(|p| {
        CELL_COUNTS.with(|c| {
            let mut players = p.borrow_mut();
            let mut counts = c.borrow_mut();

            // Check if already has an active slot
            if let Some(pos) = players.iter().position(|&p| p == caller) {
                return Ok(((pos + 1) as u8, false));
            }

            // Look for an empty slot (Principal::anonymous())
            if let Some(pos) = players.iter().position(|&p| p == Principal::anonymous()) {
                players[pos] = caller;
                counts[pos] = 0;
                return Ok(((pos + 1) as u8, true));
            }

            // No empty slots, try to add a new one
            if players.len() >= MAX_PLAYERS {
                return Err("Game full - max 9 players".to_string());
            }

            players.push(caller);
            counts.push(0);
            Ok((players.len() as u8, true))
        })
    })
}

/// Join the game and get assigned a player number (1-9)
/// Requires authentication - anonymous users cannot join.
#[update]
fn join_game() -> Result<u8, String> {
    let caller = require_authenticated()?;

    let (player_num, _is_new) = get_or_create_player_slot(caller)?;

    // No automatic starting balance - players use faucet() to get coins
    Ok(player_num)
}

/// Join the game at a specific slot (1-9).
/// Lets player choose their color and potentially inherit territory from dead players.
#[update]
fn join_slot(slot: u8) -> Result<u8, String> {
    let caller = require_authenticated()?;

    if slot < 1 || slot > MAX_PLAYERS as u8 {
        return Err(format!("Invalid slot: must be 1-{}", MAX_PLAYERS));
    }

    let now = ic_cdk::api::time();

    PLAYERS.with(|p| {
        CELL_COUNTS.with(|c| {
            ZERO_CELLS_SINCE.with(|z| {
                let mut players = p.borrow_mut();
                let mut counts = c.borrow_mut();
                let mut zero_since = z.borrow_mut();

                // Check if caller already has a slot
                if let Some(pos) = players.iter().position(|&p| p == caller) {
                    return Ok((pos + 1) as u8); // Return existing slot
                }

                let idx = (slot - 1) as usize;

                // Extend vectors if needed
                while players.len() <= idx {
                    players.push(Principal::anonymous());
                    counts.push(0);
                }
                while zero_since.len() <= idx {
                    zero_since.push(None);
                }

                // Check if slot is available (empty or Principal::anonymous)
                if players[idx] != Principal::anonymous() {
                    return Err(format!("Slot {} is already occupied", slot));
                }

                // Claim the slot
                players[idx] = caller;
                counts[idx] = 0;
                // Start grace period since they have 0 cells
                zero_since[idx] = Some(now);

                // No automatic starting balance - players use faucet() to get coins
                Ok(slot)
            })
        })
    })
}

/// Place cells on the grid. Costs 1 coin per cell.
/// Requires authentication - anonymous users cannot place cells.
#[update]
fn place_cells(cells: Vec<(i32, i32)>) -> Result<PlaceResult, String> {
    let caller = require_authenticated()?;

    // Get or assign player slot (reuses empty slots)
    let (player_num, _is_new) = get_or_create_player_slot(caller)?;

    // No automatic starting balance - players use faucet() to get coins

    let player_idx = (player_num - 1) as usize;
    let cost = cells.len() as u64;

    // Check balance (from HashMap keyed by principal)
    let balance = BALANCES.with(|b| b.borrow().get(&caller).copied().unwrap_or(0));
    if balance < cost {
        return Err(format!("Need {} coins, have {}", cost, balance));
    }

    // Pre-compute wrapped coordinates for all cells
    let wrapped_cells: Vec<usize> = cells
        .iter()
        .map(|(x, y)| {
            let wx = ((*x % 512) + 512) as usize % 512;
            let wy = ((*y % 512) + 512) as usize % 512;
            coord_to_index(wx, wy)
        })
        .collect();

    // VALIDATION PASS: Check ALL cells before placing any (all-or-nothing)
    GRID.with(|g| {
        let grid = g.borrow();
        for &idx in &wrapped_cells {
            let cell = grid[idx];

            // Fail if cell is alive
            if is_alive(cell) {
                return Err("Cannot place on living cells".to_string());
            }

            // Fail if cell has 7 coins (cap)
            if get_coins(cell) >= 7 {
                return Err("Cannot place on cells with max coins".to_string());
            }

            // Fail if cell has coins belonging to another player's territory
            let cell_owner = get_owner(cell);
            if get_coins(cell) > 0 && cell_owner > 0 && cell_owner != player_num {
                return Err("Cannot place on enemy territory with coins".to_string());
            }
        }
        Ok(())
    })?;

    // PLACEMENT PASS: All validation passed, now place all cells
    let placed = wrapped_cells.len() as u32;

    GRID.with(|g| {
        POTENTIAL.with(|p| {
            let grid = &mut *g.borrow_mut();
            let potential = &mut *p.borrow_mut();

            for &idx in &wrapped_cells {
                let cell = grid[idx];
                let new_coins = get_coins(cell).saturating_add(1).min(7);
                grid[idx] = make_cell(player_num, true, new_coins);

                // Add to potential (CRITICAL!)
                add_with_neighbors(potential, idx);
            }
        });
    });

    // Deduct balance (from HashMap keyed by principal)
    BALANCES.with(|b| {
        if let Some(bal) = b.borrow_mut().get_mut(&caller) {
            *bal = bal.saturating_sub(placed as u64);
        }
    });

    // Update cell count for this player
    CELL_COUNTS.with(|c| {
        if let Some(count) = c.borrow_mut().get_mut(player_idx) {
            *count += placed;
        }
    });

    // Clear grace period if cells were placed
    if placed > 0 {
        ZERO_CELLS_SINCE.with(|z| {
            if let Some(since) = z.borrow_mut().get_mut(player_idx) {
                *since = None;
            }
        });
    }

    let generation = GENERATION.with(|g| *g.borrow());
    let new_balance = BALANCES.with(|b| b.borrow().get(&caller).copied().unwrap_or(0));

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
/// Note: Wallets are tied to principal identity and persist across resets
#[update]
fn reset_game() -> Result<(), String> {
    require_admin()?;
    GRID.with(|g| g.borrow_mut().fill(0));
    POTENTIAL.with(|p| p.borrow_mut().fill(0));
    NEXT_POTENTIAL.with(|np| np.borrow_mut().fill(0));
    GENERATION.with(|g| *g.borrow_mut() = 0);
    // Clear player slots (all become available)
    PLAYERS.with(|p| p.borrow_mut().clear());
    CELL_COUNTS.with(|c| c.borrow_mut().clear());
    ZERO_CELLS_SINCE.with(|z| z.borrow_mut().clear());
    // Wallets persist - they're tied to principal, not game state
    // Players can use faucet() to get more coins
    IS_RUNNING.with(|r| *r.borrow_mut() = true);
    // Reset wipe state
    NEXT_WIPE_QUADRANT.with(|q| *q.borrow_mut() = 0);
    LAST_WIPE_TIME_NS.with(|t| *t.borrow_mut() = 0);
    // Reset quadrant control state
    QUADRANT_TERRITORY.with(|t| {
        let mut territory = t.borrow_mut();
        for q in 0..TOTAL_QUADRANTS {
            for p in 0..=MAX_PLAYERS {
                territory[q][p] = 0;
            }
        }
    });
    QUADRANT_CONTROLLER.with(|c| c.borrow_mut().fill(0));
    Ok(())
}

/// Faucet: Add 1000 coins to caller's wallet
/// Requires authentication - anonymous users cannot use faucet.
/// No limits - can be called multiple times.
#[update]
fn faucet() -> Result<u64, String> {
    let caller = require_authenticated()?;

    let new_balance = BALANCES.with(|b| {
        let mut balances = b.borrow_mut();
        let balance = balances.entry(caller).or_insert(0);
        *balance += FAUCET_AMOUNT;
        *balance
    });

    Ok(new_balance)
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

    let (players, player_num) = PLAYERS.with(|p| {
        let players = p.borrow();
        let player_num = players
            .iter()
            .position(|&p| p == caller)
            .map(|i| (i + 1) as u8);
        (players.clone(), player_num)
    });

    // Build balances Vec parallel to players Vec (lookup each principal in HashMap)
    let balances = BALANCES.with(|b| {
        let balances_map = b.borrow();
        players
            .iter()
            .map(|principal| balances_map.get(principal).copied().unwrap_or(0))
            .collect()
    });

    // Get quadrant controllers
    let quadrant_controllers = QUADRANT_CONTROLLER.with(|c| c.borrow().to_vec());

    GameState {
        generation: GENERATION.with(|g| *g.borrow()),
        alive_cells,
        territory,
        players,
        balances,
        player_num,
        quadrant_controllers,
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

/// Get player's balance (stored by principal, persists across slot changes)
#[query]
fn get_balance() -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    BALANCES.with(|b| {
        b.borrow()
            .get(&caller)
            .copied()
            .ok_or_else(|| "Not a player".to_string())
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

/// Get info about all 9 player slots (for slot selection UI)
#[query]
fn get_slots_info() -> Vec<SlotInfo> {
    // Count cells and coins per owner by scanning grid
    let mut alive_counts = [0u32; MAX_PLAYERS + 1];
    let mut territory_counts = [0u32; MAX_PLAYERS + 1];
    let mut coin_counts = [0u32; MAX_PLAYERS + 1];

    GRID.with(|g| {
        let grid = g.borrow();
        for cell in grid.iter() {
            let owner = get_owner(*cell) as usize;
            if owner > 0 && owner <= MAX_PLAYERS {
                if is_alive(*cell) {
                    alive_counts[owner] += 1;
                } else {
                    territory_counts[owner] += 1;
                }
                coin_counts[owner] += get_coins(*cell) as u32;
            }
        }
    });

    PLAYERS.with(|p| {
        let players = p.borrow();
        (1..=MAX_PLAYERS as u8)
            .map(|slot| {
                let idx = (slot - 1) as usize;
                let occupied = idx < players.len() && players[idx] != Principal::anonymous();
                SlotInfo {
                    slot,
                    occupied,
                    cell_count: alive_counts[slot as usize],
                    territory_cells: territory_counts[slot as usize],
                    territory_coins: coin_counts[slot as usize],
                }
            })
            .collect()
    })
}

/// Get quadrant control information for all 16 quadrants
#[query]
fn get_quadrant_info() -> Vec<QuadrantInfo> {
    // Get territory from incremental tracking (fast - no grid scan needed)
    let territory = QUADRANT_TERRITORY.with(|t| *t.borrow());
    let controllers = QUADRANT_CONTROLLER.with(|c| *c.borrow());

    // Scan grid for coins (still needed since coins aren't tracked incrementally)
    let mut coins: [[u32; MAX_PLAYERS + 1]; TOTAL_QUADRANTS] = [[0; MAX_PLAYERS + 1]; TOTAL_QUADRANTS];

    GRID.with(|g| {
        let grid = g.borrow();
        for (idx, &cell) in grid.iter().enumerate() {
            let owner = get_owner(cell) as usize;
            let cell_coins = get_coins(cell) as u32;
            if owner > 0 && owner <= MAX_PLAYERS && cell_coins > 0 {
                let q = get_quadrant(idx);
                coins[q][owner] += cell_coins;
            }
        }
    });

    (0..TOTAL_QUADRANTS)
        .map(|q| {
            let terr_by_player: Vec<u32> = (1..=MAX_PLAYERS).map(|p| territory[q][p]).collect();
            let coins_by_player: Vec<u32> = (1..=MAX_PLAYERS).map(|p| coins[q][p]).collect();
            let total_terr: u32 = terr_by_player.iter().sum();
            let total_coins: u32 = coins_by_player.iter().sum();

            QuadrantInfo {
                quadrant: q as u8,
                territory_by_player: terr_by_player,
                total_territory: total_terr,
                coins_by_player,
                total_coins,
                controller: controllers[q],
            }
        })
        .collect()
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
