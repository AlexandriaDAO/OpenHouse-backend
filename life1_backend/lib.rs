//! Life2 v2 Backend - Conway's Game of Life with Territory Control
//!
//! A 512x512 toroidal grid running Conway's Game of Life at 10 generations/second
//! with base-centric territory control.

mod benchmarks;

// Re-export benchmark types for candid export
pub use benchmarks::{BenchmarkData, BenchmarkReport, CycleBreakdown, IdleBurnInfo, OperationStats};

use arrayvec::ArrayVec;
use candid::{CandidType, Deserialize, Principal};
use ic_cdk_timers::TimerId;
use serde::Serialize;
use std::cell::RefCell;
use std::collections::HashMap;
use std::time::Duration;

// =============================================================================
// CONSTANTS
// =============================================================================

/// Grid dimensions
const GRID_SIZE: u16 = 512;
const TOTAL_CELLS: usize = 262_144; // 512 * 512
const WORDS_PER_ROW: usize = 8; // 512 / 64
const TOTAL_WORDS: usize = 4_096; // 512 * 8

/// Chunks for territory (64x64 cells each)
const CHUNK_SIZE: u16 = 64;
const CHUNKS_PER_ROW: usize = 8; // 512 / 64
const TOTAL_CHUNKS: usize = 64; // 8 * 8

/// Quadrants for wipe (128x128 cells each)
const QUADRANT_SIZE: u16 = 128;
const QUADRANTS_PER_ROW: usize = 4; // 512 / 128
const TOTAL_QUADRANTS: u8 = 16; // 4 * 4

/// Player limits
const MAX_PLAYERS: usize = 8;

/// Economy
const FAUCET_AMOUNT: u64 = 1000;
const BASE_COST: u64 = 100;
const PLACEMENT_COST: u64 = 1;
const SIEGE_DAMAGE: u64 = 10;  // Coins stolen per blocked birth (10x placement cost = high ROI for reaching walls)
const MAX_PLACE_CELLS: usize = 1000;

/// Timing
const GENERATIONS_PER_TICK: u32 = 8;   // 8 gen/sec - matches frontend LOCAL_TICK_MS=125
const TICK_INTERVAL_MS: u64 = 1000;
const WIPE_INTERVAL_NS: u64 = 120_000_000_000; // 2 minutes
const GRACE_PERIOD_NS: u64 = 600_000_000_000; // 10 minutes
const IDLE_FREEZE_NS: u64 = 1_800_000_000_000; // 30 minutes - freeze if no player activity

/// Base dimensions
const BASE_SIZE: u16 = 8;

// =============================================================================
// DATA STRUCTURES
// =============================================================================

/// A chunk is 64x64 cells represented as 64 u64 words (one per row)
type Chunk = Vec<u64>;

/// Per-player sparse territory bitmap using chunk system
#[derive(Clone, Default, CandidType, Deserialize, Serialize)]
struct PlayerTerritory {
    /// Bitmask indicating which chunks have data (64 bits = 64 chunks)
    chunk_mask: u64,
    /// Only non-empty chunks are stored (each chunk is 64 u64 words)
    chunks: Vec<Chunk>,
}

/// Player's base/fortress
#[derive(Clone, CandidType, Deserialize, Serialize)]
struct Base {
    /// Top-left X coordinate
    x: u16,
    /// Top-left Y coordinate
    y: u16,
    /// Treasury (0 = eliminated)
    coins: u64,
}

/// Cell fate during generation processing
#[derive(Clone, Copy)]
enum CellFate {
    Survives,
    Birth(usize), // new_owner
    Death,
    StaysDead,
}

/// BFS workspace for disconnection checks (pre-allocated)
struct BFSWorkspace {
    /// Dense visited bitmap
    visited: [u64; TOTAL_WORDS],
    /// Track which words were touched for efficient clearing
    touched_words: Vec<u16>,
    /// BFS queue - cell indices
    queue: Vec<u32>,
}

impl BFSWorkspace {
    fn new() -> Self {
        Self {
            visited: [0u64; TOTAL_WORDS],
            touched_words: Vec::with_capacity(512),
            queue: Vec::with_capacity(5000),
        }
    }

    fn clear(&mut self) {
        for &word_idx in &self.touched_words {
            self.visited[word_idx as usize] = 0;
        }
        self.touched_words.clear();
        self.queue.clear();
    }

    fn mark_visited(&mut self, x: u16, y: u16) -> bool {
        let idx = coords_to_idx(x, y);
        let word_idx = idx >> 6;
        let bit_pos = idx & 63;

        let was_visited = (self.visited[word_idx] >> bit_pos) & 1 == 1;
        if !was_visited {
            if self.visited[word_idx] == 0 {
                self.touched_words.push(word_idx as u16);
            }
            self.visited[word_idx] |= 1u64 << bit_pos;
        }
        was_visited
    }

    fn is_visited(&self, x: u16, y: u16) -> bool {
        let idx = coords_to_idx(x, y);
        let word_idx = idx >> 6;
        let bit_pos = idx & 63;
        (self.visited[word_idx] >> bit_pos) & 1 == 1
    }
}

/// Territory changes collected during a generation for batch disconnection check
struct TerritoryChanges {
    /// Bitmask of which players lost territory this generation
    affected_players: u8,
    /// Per-player: cells lost
    lost_cells: [ArrayVec<(u16, u16), 64>; MAX_PLAYERS],
}

impl TerritoryChanges {
    fn new() -> Self {
        Self {
            affected_players: 0,
            lost_cells: Default::default(),
        }
    }
}

/// State to persist across upgrades
#[derive(CandidType, Deserialize, Serialize)]
struct PersistedState {
    alive: Vec<u64>,
    territory: Vec<PlayerTerritory>,
    bases: Vec<Option<Base>>,
    players: Vec<Option<Principal>>,
    wallets: Vec<(Principal, u64)>,
    cell_counts: Vec<u32>,
    zero_cells_since: Vec<Option<u64>>,
    generation: u64,
    is_running: bool,
    next_wipe_quadrant: u8,
    last_wipe_ns: u64,
    owner: Vec<u8>,
    #[serde(default)]
    last_activity_ns: Option<u64>,
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct PlayerInfo {
    pub principal: Principal,
    pub slot: u8,
    pub alive_cells: u32,
    pub territory_cells: u32,
    pub in_grace_period: bool,
    pub grace_seconds_remaining: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct BaseInfo {
    pub x: u16,
    pub y: u16,
    pub coins: u64,
    pub slot: u8,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct SlotInfo {
    pub principal: Option<Principal>,
    pub base: Option<BaseInfo>,
    pub alive_cells: u32,
    pub territory_cells: u32,
    pub in_grace_period: bool,
    pub grace_seconds_remaining: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize)]
pub struct GameState {
    pub generation: u64,
    pub is_running: bool,
    pub alive_bitmap: Vec<u64>,
    pub territories: Vec<TerritoryExport>,
    pub slots: Vec<Option<SlotInfo>>,
    pub next_wipe_quadrant: u8,
    pub seconds_until_wipe: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct TerritoryExport {
    pub chunk_mask: u64,
    pub chunks: Vec<Vec<u64>>,
}

#[derive(CandidType, Deserialize, Serialize)]
pub struct WipeInfo {
    pub next_quadrant: u8,
    pub seconds_until: u64,
}

// =============================================================================
// GLOBAL STATE
// =============================================================================

thread_local! {
    // Hot path - accessed every generation
    static ALIVE: RefCell<[u64; TOTAL_WORDS]> = RefCell::new([0u64; TOTAL_WORDS]);
    static POTENTIAL: RefCell<[u64; TOTAL_WORDS]> = RefCell::new([0u64; TOTAL_WORDS]);
    static NEXT_POTENTIAL: RefCell<[u64; TOTAL_WORDS]> = RefCell::new([0u64; TOTAL_WORDS]);

    // Warm path - accessed on births, place_cells
    static TERRITORY: RefCell<[PlayerTerritory; MAX_PLAYERS]> = RefCell::new(Default::default());

    // O(1) owner lookup cache - 255 means unowned
    static OWNER: RefCell<[u8; TOTAL_CELLS]> = RefCell::new([255u8; TOTAL_CELLS]);

    // Cold path - rarely accessed
    static PLAYERS: RefCell<[Option<Principal>; MAX_PLAYERS]> = RefCell::new([None; MAX_PLAYERS]);
    static BASES: RefCell<[Option<Base>; MAX_PLAYERS]> = RefCell::new(Default::default());
    static WALLETS: RefCell<HashMap<Principal, u64>> = RefCell::new(HashMap::new());
    static CELL_COUNTS: RefCell<[u32; MAX_PLAYERS]> = RefCell::new([0u32; MAX_PLAYERS]);
    static ZERO_CELLS_SINCE: RefCell<[Option<u64>; MAX_PLAYERS]> = RefCell::new([None; MAX_PLAYERS]);

    // Game state
    static GENERATION: RefCell<u64> = RefCell::new(0);
    static IS_RUNNING: RefCell<bool> = RefCell::new(true);
    static NEXT_WIPE_QUADRANT: RefCell<u8> = RefCell::new(0);
    static LAST_WIPE_NS: RefCell<u64> = RefCell::new(0);
    static LAST_ACTIVITY_NS: RefCell<u64> = RefCell::new(0);

    // BFS workspace (pre-allocated)
    static BFS_WORKSPACE: RefCell<BFSWorkspace> = RefCell::new(BFSWorkspace::new());

    // Timer ID
    static TIMER_ID: RefCell<Option<TimerId>> = RefCell::new(None);
}

// =============================================================================
// HELPER FUNCTIONS - BITMAP
// =============================================================================

#[inline]
fn coords_to_idx(x: u16, y: u16) -> usize {
    ((y as usize) << 9) | (x as usize)
}

#[inline]
fn idx_to_coords(idx: usize) -> (u16, u16) {
    ((idx & 511) as u16, (idx >> 9) as u16)
}

fn is_alive(x: u16, y: u16) -> bool {
    ALIVE.with(|alive| {
        let alive = alive.borrow();
        let idx = coords_to_idx(x, y);
        let word_idx = idx >> 6;
        let bit_pos = idx & 63;
        (alive[word_idx] >> bit_pos) & 1 == 1
    })
}

fn is_alive_idx(idx: usize) -> bool {
    ALIVE.with(|alive| {
        let alive = alive.borrow();
        (alive[idx >> 6] >> (idx & 63)) & 1 == 1
    })
}

fn set_alive(x: u16, y: u16) {
    ALIVE.with(|alive| {
        let mut alive = alive.borrow_mut();
        let idx = coords_to_idx(x, y);
        let word_idx = idx >> 6;
        let bit_pos = idx & 63;
        alive[word_idx] |= 1u64 << bit_pos;
    })
}

fn set_alive_idx(idx: usize) {
    ALIVE.with(|alive| {
        let mut alive = alive.borrow_mut();
        alive[idx >> 6] |= 1u64 << (idx & 63);
    })
}

fn clear_alive_idx(idx: usize) {
    ALIVE.with(|alive| {
        let mut alive = alive.borrow_mut();
        alive[idx >> 6] &= !(1u64 << (idx & 63));
    })
}

fn set_potential_bit(idx: usize) {
    NEXT_POTENTIAL.with(|np| {
        let mut np = np.borrow_mut();
        np[idx >> 6] |= 1u64 << (idx & 63);
    })
}

fn mark_with_neighbors_potential(cell_idx: usize) {
    let (x, y) = idx_to_coords(cell_idx);

    // Mark the cell itself
    set_potential_bit(cell_idx);

    // Mark all 8 neighbors (with wrapping via bitwise AND since grid is 512)
    for dy in [-1i16, 0, 1] {
        for dx in [-1i16, 0, 1] {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x.wrapping_add(dx as u16) & 511;
            let ny = y.wrapping_add(dy as u16) & 511;
            set_potential_bit(coords_to_idx(nx, ny));
        }
    }
}

fn mark_neighbors_potential(cell_idx: usize) {
    let (x, y) = idx_to_coords(cell_idx);

    // Mark all 8 neighbors (with wrapping via bitwise AND since grid is 512)
    for dy in [-1i16, 0, 1] {
        for dx in [-1i16, 0, 1] {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x.wrapping_add(dx as u16) & 511;
            let ny = y.wrapping_add(dy as u16) & 511;
            set_potential_bit(coords_to_idx(nx, ny));
        }
    }
}

// =============================================================================
// HELPER FUNCTIONS - COORDINATES
// =============================================================================

#[inline]
fn orthogonal_neighbors(x: u16, y: u16) -> [(u16, u16); 4] {
    [
        (x.wrapping_sub(1) & 511, y), // West
        (x.wrapping_add(1) & 511, y), // East
        (x, y.wrapping_sub(1) & 511), // North
        (x, y.wrapping_add(1) & 511), // South
    ]
}

#[inline]
fn popcount_below(mask: u64, idx: usize) -> usize {
    (mask & ((1u64 << idx) - 1)).count_ones() as usize
}

#[inline]
fn wrap_word_left(word_idx: usize) -> usize {
    let row = word_idx / WORDS_PER_ROW;
    let col = word_idx % WORDS_PER_ROW;
    if col == 0 {
        row * WORDS_PER_ROW + (WORDS_PER_ROW - 1)
    } else {
        word_idx - 1
    }
}

#[inline]
fn wrap_word_right(word_idx: usize) -> usize {
    let row = word_idx / WORDS_PER_ROW;
    let col = word_idx % WORDS_PER_ROW;
    if col == WORDS_PER_ROW - 1 {
        row * WORDS_PER_ROW
    } else {
        word_idx + 1
    }
}

// =============================================================================
// HELPER FUNCTIONS - QUADRANT
// =============================================================================

#[inline]
fn get_quadrant(x: u16, y: u16) -> u8 {
    ((y >> 7) * (QUADRANTS_PER_ROW as u16) + (x >> 7)) as u8
}

fn quadrant_bounds(q: u8) -> (u16, u16, u16, u16) {
    let qx = (q % (QUADRANTS_PER_ROW as u8)) as u16;
    let qy = (q / (QUADRANTS_PER_ROW as u8)) as u16;
    (qx * QUADRANT_SIZE, qy * QUADRANT_SIZE, QUADRANT_SIZE, QUADRANT_SIZE)
}

fn quadrant_has_base(q: u8) -> bool {
    BASES.with(|bases| {
        let bases = bases.borrow();
        for base_opt in bases.iter() {
            if let Some(base) = base_opt {
                if get_quadrant(base.x, base.y) == q {
                    return true;
                }
            }
        }
        false
    })
}

// =============================================================================
// HELPER FUNCTIONS - BASE
// =============================================================================

fn is_in_base(base: &Base, x: u16, y: u16) -> bool {
    let dx = x.wrapping_sub(base.x) & 511;
    let dy = y.wrapping_sub(base.y) & 511;
    dx < BASE_SIZE && dy < BASE_SIZE
}

/// Check if position is in any player's protection zone
/// Returns (base_owner_slot, is_same_owner)
fn in_protection_zone(x: u16, y: u16) -> Option<usize> {
    BASES.with(|bases| {
        let bases = bases.borrow();
        for (i, base_opt) in bases.iter().enumerate() {
            if let Some(base) = base_opt {
                if is_in_base(base, x, y) {
                    return Some(i);
                }
            }
        }
        None
    })
}

fn bases_would_overlap(new_x: u16, new_y: u16, existing: &Base) -> bool {
    let dx = new_x.abs_diff(existing.x);
    let dy = new_y.abs_diff(existing.y);
    let dx = dx.min(GRID_SIZE - dx);
    let dy = dy.min(GRID_SIZE - dy);
    dx < BASE_SIZE && dy < BASE_SIZE
}

// =============================================================================
// HELPER FUNCTIONS - PLAYER
// =============================================================================

fn find_player_slot(caller: Principal) -> Option<usize> {
    PLAYERS.with(|players| {
        let players = players.borrow();
        players.iter().position(|p| p.as_ref() == Some(&caller))
    })
}

// =============================================================================
// HELPER FUNCTIONS - TERRITORY
// =============================================================================

fn player_owns(player: usize, x: u16, y: u16) -> bool {
    TERRITORY.with(|territory| {
        let territory = territory.borrow();
        let pt = &territory[player];

        let chunk_x = (x >> 6) as usize;
        let chunk_y = (y >> 6) as usize;
        let chunk_idx = chunk_y * CHUNKS_PER_ROW + chunk_x;

        // Check if chunk exists
        if (pt.chunk_mask >> chunk_idx) & 1 == 0 {
            return false;
        }

        // Find vec index via popcount
        let vec_idx = popcount_below(pt.chunk_mask, chunk_idx);

        // Check bit within chunk
        let local_x = (x & 63) as usize;
        let local_y = (y & 63) as usize;
        (pt.chunks[vec_idx][local_y] >> local_x) & 1 == 1
    })
}

fn find_owner(x: u16, y: u16) -> Option<usize> {
    benchmark!(FindOwner);
    let idx = coords_to_idx(x, y);
    OWNER.with(|o| {
        let owner = o.borrow()[idx];
        if owner == 255 { None } else { Some(owner as usize) }
    })
}

fn set_territory(player: usize, x: u16, y: u16) {
    TERRITORY.with(|territory| {
        let mut territory = territory.borrow_mut();
        let pt = &mut territory[player];

        let chunk_x = (x >> 6) as usize;
        let chunk_y = (y >> 6) as usize;
        let chunk_idx = chunk_y * CHUNKS_PER_ROW + chunk_x;

        // Check if chunk exists
        if (pt.chunk_mask >> chunk_idx) & 1 == 0 {
            // Allocate new chunk
            let insert_pos = popcount_below(pt.chunk_mask, chunk_idx);
            pt.chunks.insert(insert_pos, vec![0u64; 64]);
            pt.chunk_mask |= 1u64 << chunk_idx;
        }

        // Find vec index and set bit
        let vec_idx = popcount_below(pt.chunk_mask, chunk_idx);
        let local_x = (x & 63) as usize;
        let local_y = (y & 63) as usize;
        pt.chunks[vec_idx][local_y] |= 1u64 << local_x;
    });

    // Update OWNER cache
    OWNER.with(|o| {
        let idx = coords_to_idx(x, y);
        o.borrow_mut()[idx] = player as u8;
    });
}

fn clear_territory(player: usize, x: u16, y: u16) {
    TERRITORY.with(|territory| {
        let mut territory = territory.borrow_mut();
        let pt = &mut territory[player];

        let chunk_x = (x >> 6) as usize;
        let chunk_y = (y >> 6) as usize;
        let chunk_idx = chunk_y * CHUNKS_PER_ROW + chunk_x;

        // Check if chunk exists
        if (pt.chunk_mask >> chunk_idx) & 1 == 0 {
            return;
        }

        // Find vec index
        let vec_idx = popcount_below(pt.chunk_mask, chunk_idx);

        // Clear bit
        let local_x = (x & 63) as usize;
        let local_y = (y & 63) as usize;
        pt.chunks[vec_idx][local_y] &= !(1u64 << local_x);

        // Check if chunk is now empty
        let chunk_empty = pt.chunks[vec_idx].iter().all(|&w| w == 0);
        if chunk_empty {
            pt.chunks.remove(vec_idx);
            pt.chunk_mask &= !(1u64 << chunk_idx);
        }
    });

    // Update OWNER cache
    OWNER.with(|o| {
        let idx = coords_to_idx(x, y);
        o.borrow_mut()[idx] = 255;
    });
}

fn count_territory_cells(player: usize) -> u32 {
    TERRITORY.with(|territory| {
        let territory = territory.borrow();
        let pt = &territory[player];
        let mut count = 0u32;
        for chunk in &pt.chunks {
            for word in chunk {
                count += word.count_ones();
            }
        }
        count
    })
}

// =============================================================================
// CONWAY'S GAME OF LIFE - STEP GENERATION
// =============================================================================

fn step_generation() {
    benchmark!(StepGeneration);

    // Phase 0: Allocate vectors (measured separately)
    let (mut births, mut deaths, mut survivors) = {
        benchmark!(VecAllocation);
        (
            Vec::<(usize, usize)>::with_capacity(500),
            Vec::<usize>::with_capacity(500),
            Vec::<usize>::with_capacity(15000),
        )
    };

    // Phase 1: Compute fates (read-only pass)
    {
        benchmark!(ComputeFates);
        compute_fates_into(&mut births, &mut deaths, &mut survivors);
    }

    // Phase 2: Apply changes
    {
        benchmark!(ApplyChanges);
        apply_changes(&births, &deaths, &survivors);
    }

    // Phase 3: Deallocate vectors (measured separately)
    {
        benchmark!(VecDeallocation);
        drop(births);
        drop(deaths);
        drop(survivors);
    }

    // Increment generation
    GENERATION.with(|gen| {
        *gen.borrow_mut() += 1;
    });
}

fn compute_fates_into(
    births: &mut Vec<(usize, usize)>,
    deaths: &mut Vec<usize>,
    survivors: &mut Vec<usize>,
) {
    // Clear vectors (keeps capacity, O(1))
    births.clear();
    deaths.clear();
    survivors.clear();

    POTENTIAL.with(|potential| {
        ALIVE.with(|alive| {
            let potential = potential.borrow();
            let alive = alive.borrow();

            for word_idx in 0..TOTAL_WORDS {
                let mut potential_word = potential[word_idx];
                if potential_word == 0 {
                    continue;
                }

                let row = word_idx / WORDS_PER_ROW;
                let row_above = if row > 0 { word_idx - WORDS_PER_ROW } else { word_idx + TOTAL_WORDS - WORDS_PER_ROW };
                let row_below = if row < GRID_SIZE as usize - 1 { word_idx + WORDS_PER_ROW } else { word_idx - TOTAL_WORDS + WORDS_PER_ROW };

                // Load the 3 row words
                let above = alive[row_above];
                let same = alive[word_idx];
                let below = alive[row_below];

                // Adjacent words for edge bits
                let left_above = alive[wrap_word_left(row_above)];
                let left_same = alive[wrap_word_left(word_idx)];
                let left_below = alive[wrap_word_left(row_below)];
                let right_above = alive[wrap_word_right(row_above)];
                let right_same = alive[wrap_word_right(word_idx)];
                let right_below = alive[wrap_word_right(row_below)];

                while potential_word != 0 {
                    let bit_pos = potential_word.trailing_zeros() as usize;
                    potential_word &= potential_word - 1;

                    let cell_idx = word_idx * 64 + bit_pos;
                    let fate = compute_cell_fate(
                        bit_pos,
                        above, same, below,
                        left_above, left_same, left_below,
                        right_above, right_same, right_below,
                        cell_idx,
                    );

                    match fate {
                        CellFate::Survives => survivors.push(cell_idx),
                        CellFate::Birth(owner) => births.push((cell_idx, owner)),
                        CellFate::Death => deaths.push(cell_idx),
                        CellFate::StaysDead => {}
                    }
                }
            }
        })
    });
}

/// Count neighbors using popcount (WASM i64.popcnt instruction)
/// This is the fast path for ~98% of cells (non-births)
#[inline(always)]
fn count_neighbors_popcount(
    bit_pos: usize,
    above: u64, same: u64, below: u64,
    left_above: u64, left_same: u64, left_below: u64,
    right_above: u64, right_same: u64, right_below: u64,
) -> u8 {
    if bit_pos == 0 {
        // Left edge: combine bits from left_* words and main words
        let above_bits = ((left_above >> 63) & 1) | ((above & 0b11) << 1);
        let same_bits = ((left_same >> 63) & 1) | (((same >> 1) & 1) << 2);
        let below_bits = ((left_below >> 63) & 1) | ((below & 0b11) << 1);
        (above_bits.count_ones() + same_bits.count_ones() + below_bits.count_ones()) as u8
    } else if bit_pos == 63 {
        // Right edge: combine bits from main words and right_* words
        let above_bits = ((above >> 62) & 0b11) | ((right_above & 1) << 2);
        let same_bits = ((same >> 62) & 1) | ((right_same & 1) << 2);
        let below_bits = ((below >> 62) & 0b11) | ((right_below & 1) << 2);
        (above_bits.count_ones() + same_bits.count_ones() + below_bits.count_ones()) as u8
    } else {
        // Interior: all neighbors in the 3 main words (~97% of cells)
        let shift = bit_pos - 1;
        let above_3 = (above >> shift) & 0b111;  // 3 bits from above row
        let below_3 = (below >> shift) & 0b111;  // 3 bits from below row
        let same_2 = (same >> shift) & 0b101;    // 2 bits from same row (exclude center)
        (above_3.count_ones() + same_2.count_ones() + below_3.count_ones()) as u8
    }
}

/// Extract individual neighbor bits (needed only for births to determine ownership)
#[inline(always)]
fn extract_neighbor_bits(
    bit_pos: usize,
    above: u64, same: u64, below: u64,
    left_above: u64, left_same: u64, left_below: u64,
    right_above: u64, right_same: u64, right_below: u64,
) -> (u8, u8, u8, u8, u8, u8, u8, u8) {
    if bit_pos == 0 {
        (
            ((left_above >> 63) & 1) as u8,
            ((above >> 0) & 1) as u8,
            ((above >> 1) & 1) as u8,
            ((left_same >> 63) & 1) as u8,
            ((same >> 1) & 1) as u8,
            ((left_below >> 63) & 1) as u8,
            ((below >> 0) & 1) as u8,
            ((below >> 1) & 1) as u8,
        )
    } else if bit_pos == 63 {
        (
            ((above >> 62) & 1) as u8,
            ((above >> 63) & 1) as u8,
            ((right_above >> 0) & 1) as u8,
            ((same >> 62) & 1) as u8,
            ((right_same >> 0) & 1) as u8,
            ((below >> 62) & 1) as u8,
            ((below >> 63) & 1) as u8,
            ((right_below >> 0) & 1) as u8,
        )
    } else {
        (
            ((above >> (bit_pos - 1)) & 1) as u8,
            ((above >> bit_pos) & 1) as u8,
            ((above >> (bit_pos + 1)) & 1) as u8,
            ((same >> (bit_pos - 1)) & 1) as u8,
            ((same >> (bit_pos + 1)) & 1) as u8,
            ((below >> (bit_pos - 1)) & 1) as u8,
            ((below >> bit_pos) & 1) as u8,
            ((below >> (bit_pos + 1)) & 1) as u8,
        )
    }
}

fn compute_cell_fate(
    bit_pos: usize,
    above: u64, same: u64, below: u64,
    left_above: u64, left_same: u64, left_below: u64,
    right_above: u64, right_same: u64, right_below: u64,
    cell_idx: usize,
) -> CellFate {
    let currently_alive = (same >> bit_pos) & 1 == 1;

    // Fast path: use popcount for neighbor count (~11 WASM instructions vs ~24)
    let alive_count = count_neighbors_popcount(
        bit_pos, above, same, below,
        left_above, left_same, left_below,
        right_above, right_same, right_below,
    );

    match (currently_alive, alive_count) {
        (true, 2) | (true, 3) => CellFate::Survives,
        (false, 3) => {
            // Birth: need individual bits for ownership determination
            // This is the slow path, but births are ~2% of processed cells
            let (nw, n, ne, w, e, sw, s, se) = extract_neighbor_bits(
                bit_pos, above, same, below,
                left_above, left_same, left_below,
                right_above, right_same, right_below,
            );
            let (x, y) = idx_to_coords(cell_idx);
            let owner = find_birth_owner(x, y, nw, n, ne, w, e, sw, s, se, cell_idx);
            CellFate::Birth(owner)
        }
        (true, _) => CellFate::Death,
        (false, _) => CellFate::StaysDead,
    }
}

fn find_birth_owner(
    x: u16, y: u16,
    nw: u8, n: u8, ne: u8, w: u8, e: u8, sw: u8, s: u8, se: u8,
    cell_idx: usize,
) -> usize {
    let mut owner_counts = [0u8; MAX_PLAYERS];
    let mut neutral_count = 0u8;

    // Get neighbor coordinates
    let neighbors = [
        (nw, (x.wrapping_sub(1) & 511, y.wrapping_sub(1) & 511)),
        (n, (x, y.wrapping_sub(1) & 511)),
        (ne, (x.wrapping_add(1) & 511, y.wrapping_sub(1) & 511)),
        (w, (x.wrapping_sub(1) & 511, y)),
        (e, (x.wrapping_add(1) & 511, y)),
        (sw, (x.wrapping_sub(1) & 511, y.wrapping_add(1) & 511)),
        (s, (x, y.wrapping_add(1) & 511)),
        (se, (x.wrapping_add(1) & 511, y.wrapping_add(1) & 511)),
    ];

    for (alive, (nx, ny)) in neighbors {
        if alive == 1 {
            if let Some(owner) = find_owner(nx, ny) {
                owner_counts[owner] += 1;
            } else {
                neutral_count += 1;
            }
        }
    }

    // Find max count
    let max_count = *owner_counts.iter().max().unwrap_or(&0);

    // If neutral has more, return a "neutral birth" (we'll assign to first player with any)
    if neutral_count > max_count {
        // Neutral birth - assign to first player found among parents
        for (alive, (nx, ny)) in neighbors {
            if alive == 1 {
                if let Some(owner) = find_owner(nx, ny) {
                    return owner;
                }
            }
        }
        return 0; // Fallback
    }

    // Find candidates with max count
    let mut candidates: ArrayVec<usize, MAX_PLAYERS> = ArrayVec::new();
    for (i, &count) in owner_counts.iter().enumerate() {
        if count == max_count && count > 0 {
            candidates.push(i);
        }
    }

    if candidates.len() == 1 {
        candidates[0]
    } else if candidates.is_empty() {
        0 // Neutral birth, shouldn't happen with alive parents
    } else {
        // Tie-break using cell index
        candidates[cell_idx % candidates.len()]
    }
}

fn apply_changes(births: &[(usize, usize)], deaths: &[usize], survivors: &[usize]) {
    // Clear NEXT_POTENTIAL
    NEXT_POTENTIAL.with(|np| {
        np.borrow_mut().fill(0);
    });

    // Track territory changes for batch disconnection check
    let mut territory_changes = TerritoryChanges::new();

    // Apply deaths
    for &cell_idx in deaths {
        let (x, y) = idx_to_coords(cell_idx);

        // Find owner to decrement cell count
        if let Some(owner) = find_owner(x, y) {
            CELL_COUNTS.with(|cc| {
                let mut cc = cc.borrow_mut();
                if cc[owner] > 0 {
                    cc[owner] -= 1;
                }
            });

            // Check grace period trigger
            let count = CELL_COUNTS.with(|cc| cc.borrow()[owner]);
            if count == 0 {
                BASES.with(|bases| {
                    if bases.borrow()[owner].is_some() {
                        ZERO_CELLS_SINCE.with(|zcs| {
                            zcs.borrow_mut()[owner] = Some(ic_cdk::api::time());
                        });
                    }
                });
            }
        }

        clear_alive_idx(cell_idx);
        mark_neighbors_potential(cell_idx);
    }

    // Apply births
    for &(cell_idx, new_owner) in births {
        let (x, y) = idx_to_coords(cell_idx);

        // Check protection zone (siege mechanic) - benchmarked
        let base_owner_opt = {
            benchmark!(ProtectionZoneCheck);
            in_protection_zone(x, y)
        };
        if let Some(base_owner) = base_owner_opt {
            if base_owner != new_owner {
                // SIEGE! Birth prevented, transfer coins (capped at what defender has)
                let mut eliminated = false;

                BASES.with(|bases| {
                    let mut bases = bases.borrow_mut();
                    if let Some(base) = &mut bases[base_owner] {
                        if base.coins > 0 {
                            // Take up to SIEGE_DAMAGE, but not more than defender has
                            let damage = base.coins.min(SIEGE_DAMAGE);
                            base.coins -= damage;

                            // Transfer coins to attacker's wallet
                            PLAYERS.with(|players| {
                                if let Some(attacker_principal) = &players.borrow()[new_owner] {
                                    WALLETS.with(|wallets| {
                                        let mut wallets = wallets.borrow_mut();
                                        *wallets.entry(*attacker_principal).or_insert(0) += damage;
                                    });
                                }
                            });

                            if base.coins == 0 {
                                eliminated = true;
                            }
                        }
                    }
                });

                if eliminated {
                    eliminate_player(base_owner);
                }

                continue; // Birth prevented
            }
        }

        // Check if territory changes (for disconnection check)
        if let Some(old_owner) = find_owner(x, y) {
            if old_owner != new_owner {
                territory_changes.affected_players |= 1 << old_owner;
                if territory_changes.lost_cells[old_owner].len() < 64 {
                    territory_changes.lost_cells[old_owner].push((x, y));
                }
                clear_territory(old_owner, x, y);
            }
        }

        // Normal birth
        set_alive_idx(cell_idx);
        set_territory(new_owner, x, y);

        // Update cell count
        CELL_COUNTS.with(|cc| {
            cc.borrow_mut()[new_owner] += 1;
        });

        // Clear grace period if we had 0 cells
        ZERO_CELLS_SINCE.with(|zcs| {
            zcs.borrow_mut()[new_owner] = None;
        });

        mark_with_neighbors_potential(cell_idx);
    }

    // Apply survivors (just mark in NEXT_POTENTIAL)
    for &cell_idx in survivors {
        mark_with_neighbors_potential(cell_idx);
    }

    // Swap potential buffers
    POTENTIAL.with(|p| {
        NEXT_POTENTIAL.with(|np| {
            std::mem::swap(&mut *p.borrow_mut(), &mut *np.borrow_mut());
        });
    });

    // Batch disconnection check
    check_all_disconnections(&territory_changes);
}

// =============================================================================
// DISCONNECTION ALGORITHM
// =============================================================================

fn check_all_disconnections(changes: &TerritoryChanges) {
    benchmark!(DisconnectionCheck);

    for player in 0..MAX_PLAYERS {
        if (changes.affected_players >> player) & 1 == 0 {
            continue;
        }

        // Collect ALL affected neighbors from ALL lost cells
        let mut all_affected: Vec<(u16, u16)> = Vec::new();
        for &(x, y) in &changes.lost_cells[player] {
            for (nx, ny) in orthogonal_neighbors(x, y) {
                if player_owns(player, nx, ny) && !all_affected.contains(&(nx, ny)) {
                    all_affected.push((nx, ny));
                }
            }
        }

        if all_affected.is_empty() {
            continue;
        }

        // Get base
        let base_opt = BASES.with(|bases| bases.borrow()[player].clone());
        let Some(base) = base_opt else {
            continue;
        };

        // Check if all affected are in base (always connected)
        if all_in_base(&all_affected, &base) {
            continue;
        }

        // BFS from base
        BFS_WORKSPACE.with(|ws| {
            let mut ws = ws.borrow_mut();
            ws.clear();

            let unreached = bfs_find_unreached(&mut ws, player, &base, &all_affected);

            if !unreached.is_empty() {
                let disconnected = find_disconnected_components(&mut ws, player, &unreached);
                apply_disconnection(player, &disconnected);
            }
        });
    }
}

fn all_in_base(affected: &[(u16, u16)], base: &Base) -> bool {
    affected.iter().all(|&(x, y)| is_in_base(base, x, y))
}

fn bfs_find_unreached(
    workspace: &mut BFSWorkspace,
    player: usize,
    base: &Base,
    affected: &[(u16, u16)],
) -> Vec<(u16, u16)> {
    // Build O(1) lookup map for affected cells: coords -> index
    let affected_map: HashMap<(u16, u16), usize> = affected
        .iter()
        .enumerate()
        .take(64)
        .map(|(i, &coords)| (coords, i))
        .collect();

    // Seed BFS with base cells
    for dy in 0..BASE_SIZE {
        for dx in 0..BASE_SIZE {
            let x = base.x.wrapping_add(dx) & 511;
            let y = base.y.wrapping_add(dy) & 511;

            if player_owns(player, x, y) && !workspace.mark_visited(x, y) {
                let idx = ((y as u32) << 9) | (x as u32);
                workspace.queue.push(idx);
            }
        }
    }

    // Track which affected neighbors we've found
    let mut found_count = 0;
    let mut affected_found = [false; 64]; // Max 64 affected

    // BFS with early termination
    let mut queue_idx = 0;
    while queue_idx < workspace.queue.len() {
        let cell_idx = workspace.queue[queue_idx] as usize;
        queue_idx += 1;

        let x = (cell_idx & 511) as u16;
        let y = (cell_idx >> 9) as u16;

        // O(1) lookup instead of linear search
        if let Some(&i) = affected_map.get(&(x, y)) {
            if !affected_found[i] {
                affected_found[i] = true;
                found_count += 1;

                if found_count == affected.len() {
                    return Vec::new(); // All found, no disconnection
                }
            }
        }

        // Explore orthogonal neighbors
        for (nx, ny) in orthogonal_neighbors(x, y) {
            if workspace.is_visited(nx, ny) {
                continue;
            }
            if player_owns(player, nx, ny) {
                workspace.mark_visited(nx, ny);
                let idx = ((ny as u32) << 9) | (nx as u32);
                workspace.queue.push(idx);
            }
        }
    }

    // Collect unreached affected neighbors
    let mut unreached = Vec::new();
    for (i, &(ax, ay)) in affected.iter().enumerate().take(64) {
        if !affected_found[i] {
            unreached.push((ax, ay));
        }
    }
    unreached
}

fn find_disconnected_components(
    workspace: &mut BFSWorkspace,
    player: usize,
    unreached: &[(u16, u16)],
) -> Vec<(u16, u16)> {
    let mut disconnected = Vec::with_capacity(1000);

    for &(start_x, start_y) in unreached {
        if workspace.is_visited(start_x, start_y) {
            continue;
        }

        workspace.mark_visited(start_x, start_y);
        let mut local_queue = vec![(start_x, start_y)];
        let mut q_idx = 0;

        while q_idx < local_queue.len() {
            let (x, y) = local_queue[q_idx];
            q_idx += 1;
            disconnected.push((x, y));

            for (nx, ny) in orthogonal_neighbors(x, y) {
                if !workspace.is_visited(nx, ny) && player_owns(player, nx, ny) {
                    workspace.mark_visited(nx, ny);
                    local_queue.push((nx, ny));
                }
            }
        }
    }

    disconnected
}

fn apply_disconnection(player: usize, disconnected: &[(u16, u16)]) {
    for &(x, y) in disconnected {
        clear_territory(player, x, y);

        let idx = coords_to_idx(x, y);

        if is_alive_idx(idx) {
            clear_alive_idx(idx);

            CELL_COUNTS.with(|cc| {
                let mut cc = cc.borrow_mut();
                if cc[player] > 0 {
                    cc[player] -= 1;
                }
            });

            mark_neighbors_potential(idx);
        }
    }

    // Check if player now has 0 cells
    let count = CELL_COUNTS.with(|cc| cc.borrow()[player]);
    if count == 0 {
        BASES.with(|bases| {
            if bases.borrow()[player].is_some() {
                ZERO_CELLS_SINCE.with(|zcs| {
                    zcs.borrow_mut()[player] = Some(ic_cdk::api::time());
                });
            }
        });
    }
}

// =============================================================================
// GAME MECHANICS
// =============================================================================

fn eliminate_player(player: usize) {
    // 1. Kill ALL player's alive cells AND clear OWNER entries
    //    (iterate via territory bitmap, do both in single pass)
    TERRITORY.with(|territory| {
        let territory = territory.borrow();
        let pt = &territory[player];

        let mut chunk_idx_iter = pt.chunk_mask;
        let mut vec_idx = 0;

        while chunk_idx_iter != 0 {
            let chunk_idx = chunk_idx_iter.trailing_zeros() as usize;
            chunk_idx_iter &= chunk_idx_iter - 1;

            let chunk = &pt.chunks[vec_idx];
            let chunk_base_x = (chunk_idx % CHUNKS_PER_ROW) * 64;
            let chunk_base_y = (chunk_idx / CHUNKS_PER_ROW) * 64;

            for local_y in 0..64 {
                let mut word = chunk[local_y];
                while word != 0 {
                    let local_x = word.trailing_zeros() as usize;
                    word &= word - 1;

                    let x = (chunk_base_x + local_x) as u16;
                    let y = (chunk_base_y + local_y) as u16;
                    let idx = coords_to_idx(x, y);

                    // Kill cell if alive
                    if is_alive_idx(idx) {
                        clear_alive_idx(idx);
                        mark_neighbors_potential(idx);
                    }

                    // Clear OWNER entry (MUST happen before territory reset)
                    OWNER.with(|o| {
                        o.borrow_mut()[idx] = 255;
                    });
                }
            }

            vec_idx += 1;
        }
    });

    // 2. Clear territory completely (OWNER already cleared above)
    TERRITORY.with(|territory| {
        territory.borrow_mut()[player] = PlayerTerritory::default();
    });

    // 3. Clear player data
    BASES.with(|bases| {
        bases.borrow_mut()[player] = None;
    });
    PLAYERS.with(|players| {
        players.borrow_mut()[player] = None;
    });
    CELL_COUNTS.with(|cc| {
        cc.borrow_mut()[player] = 0;
    });
    ZERO_CELLS_SINCE.with(|zcs| {
        zcs.borrow_mut()[player] = None;
    });
}

fn wipe_quadrant(quadrant: u8) {
    benchmark!(WipeQuadrant);

    let (x_start, y_start, _, _) = quadrant_bounds(quadrant);

    ALIVE.with(|alive| {
        let mut alive = alive.borrow_mut();

        for row_offset in 0..QUADRANT_SIZE {
            let y = y_start + row_offset;
            let word_row_base = (y as usize) * WORDS_PER_ROW;
            let word_col_start = (x_start / 64) as usize;

            for word_offset in 0..2 {
                let word_idx = word_row_base + word_col_start + word_offset;
                let mut alive_word = alive[word_idx];

                if alive_word == 0 {
                    continue;
                }

                while alive_word != 0 {
                    let bit_pos = alive_word.trailing_zeros() as usize;
                    alive_word &= alive_word - 1;

                    let x = ((word_col_start + word_offset) * 64 + bit_pos) as u16;
                    let idx = coords_to_idx(x, y);

                    if let Some(owner) = find_owner(x, y) {
                        CELL_COUNTS.with(|cc| {
                            let mut cc = cc.borrow_mut();
                            if cc[owner] > 0 {
                                cc[owner] -= 1;
                            }

                            if cc[owner] == 0 {
                                BASES.with(|bases| {
                                    if bases.borrow()[owner].is_some() {
                                        ZERO_CELLS_SINCE.with(|zcs| {
                                            zcs.borrow_mut()[owner] = Some(ic_cdk::api::time());
                                        });
                                    }
                                });
                            }
                        });
                    }

                    mark_neighbors_potential(idx);
                }

                alive[word_idx] = 0;
            }
        }
    });
}

fn run_wipe_if_needed() {
    let now = ic_cdk::api::time();
    let last_wipe = LAST_WIPE_NS.with(|lw| *lw.borrow());

    if now - last_wipe >= WIPE_INTERVAL_NS {
        let quadrant = NEXT_WIPE_QUADRANT.with(|q| *q.borrow());
        wipe_quadrant(quadrant);

        NEXT_WIPE_QUADRANT.with(|q| {
            *q.borrow_mut() = (quadrant + 1) % TOTAL_QUADRANTS;
        });
        LAST_WIPE_NS.with(|lw| {
            *lw.borrow_mut() = now;
        });
    }
}

fn check_grace_periods() {
    let now = ic_cdk::api::time();

    for player in 0..MAX_PLAYERS {
        let zero_since = ZERO_CELLS_SINCE.with(|zcs| zcs.borrow()[player]);

        if let Some(since) = zero_since {
            if now - since >= GRACE_PERIOD_NS {
                let has_base = BASES.with(|bases| bases.borrow()[player].is_some());
                if has_base {
                    eliminate_player(player);
                }
            }
        }
    }
}

// =============================================================================
// TICK ORCHESTRATION
// =============================================================================

fn tick() {
    benchmark!(Tick);

    let running = IS_RUNNING.with(|r| *r.borrow());
    if !running {
        return;
    }

    // OPTIMIZATION: Check if there are any alive cells or potential cells
    // If not, skip expensive generation computation entirely
    let has_activity = POTENTIAL.with(|p| {
        p.borrow().iter().any(|&w| w != 0)
    });

    if has_activity {
        // Run 10 generations
        for _ in 0..GENERATIONS_PER_TICK {
            step_generation();
        }
    } else {
        // Just increment generation counter (no computation needed)
        GENERATION.with(|gen| {
            *gen.borrow_mut() += GENERATIONS_PER_TICK as u64;
        });
    }

    // Check quadrant wipe timer (still needed even when idle)
    run_wipe_if_needed();

    // Check grace periods
    check_grace_periods();

    // Stop timer if board is completely empty (saves cycles)
    let board_empty = ALIVE.with(|a| a.borrow().iter().all(|&w| w == 0));
    if board_empty {
        stop_timer();
        return;
    }

    // Freeze if no player activity for 30 minutes (saves cycles on straggler gliders)
    let last_activity = LAST_ACTIVITY_NS.with(|la| *la.borrow());
    let idle_time = ic_cdk::api::time().saturating_sub(last_activity);
    if idle_time >= IDLE_FREEZE_NS {
        stop_timer();
    }
}

fn start_timer() {
    let timer_id = ic_cdk_timers::set_timer_interval(
        Duration::from_millis(TICK_INTERVAL_MS),
        || async { tick() },
    );
    TIMER_ID.with(|t| {
        *t.borrow_mut() = Some(timer_id);
    });
}

fn stop_timer() {
    TIMER_ID.with(|t| {
        if let Some(id) = t.borrow_mut().take() {
            ic_cdk_timers::clear_timer(id);
        }
    });
}

fn is_timer_running() -> bool {
    TIMER_ID.with(|t| t.borrow().is_some())
}

// =============================================================================
// UPDATE FUNCTIONS (PLAYER ACTIONS)
// =============================================================================

#[ic_cdk::update]
fn faucet() -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();

    if caller == Principal::anonymous() {
        return Err("Must be authenticated".to_string());
    }

    WALLETS.with(|wallets| {
        let mut wallets = wallets.borrow_mut();
        let balance = wallets.entry(caller).or_insert(0);
        *balance += FAUCET_AMOUNT;
        Ok(*balance)
    })
}

#[ic_cdk::update]
fn join_game(base_x: i32, base_y: i32, desired_slot: u8) -> Result<u8, String> {
    let caller = ic_cdk::api::msg_caller();

    // Record activity for freeze detection
    LAST_ACTIVITY_NS.with(|la| *la.borrow_mut() = ic_cdk::api::time());

    // Restart timer if it was stopped (board was empty or frozen)
    if !is_timer_running() {
        start_timer();
    }

    // Validation 1: Auth
    if caller == Principal::anonymous() {
        return Err("Must be authenticated".to_string());
    }

    // Validation 2: Not already playing
    if find_player_slot(caller).is_some() {
        return Err("Already in game".to_string());
    }

    // Validation 3: Has coins
    let wallet_balance = WALLETS.with(|w| *w.borrow().get(&caller).unwrap_or(&0));
    if wallet_balance < BASE_COST {
        return Err(format!("Need {} coins to join", BASE_COST));
    }

    // Validation 4: Coords valid
    if base_x < 0 || base_x >= GRID_SIZE as i32 || base_y < 0 || base_y >= GRID_SIZE as i32 {
        return Err("Coordinates out of range".to_string());
    }
    let base_x = base_x as u16;
    let base_y = base_y as u16;

    // Validation 5: Quadrant free
    let quadrant = get_quadrant(base_x, base_y);
    if quadrant_has_base(quadrant) {
        return Err("Quadrant already has a base".to_string());
    }

    // Validation 6: No overlap with existing bases
    BASES.with(|bases| {
        let bases = bases.borrow();
        for existing_base in bases.iter().flatten() {
            if bases_would_overlap(base_x, base_y, existing_base) {
                return Err("Overlaps existing base".to_string());
            }
        }
        Ok(())
    })?;

    // Validation 7: Desired slot is valid and available
    if desired_slot as usize >= MAX_PLAYERS {
        return Err(format!("Invalid slot {} (max {})", desired_slot, MAX_PLAYERS - 1));
    }
    let slot = desired_slot as usize;
    let slot_available = PLAYERS.with(|players| {
        players.borrow()[slot].is_none()
    });
    if !slot_available {
        return Err(format!("Slot {} is already taken", desired_slot));
    }

    // Deduct coins from wallet
    WALLETS.with(|wallets| {
        let mut wallets = wallets.borrow_mut();
        if let Some(balance) = wallets.get_mut(&caller) {
            *balance -= BASE_COST;
        }
    });

    // Create base
    BASES.with(|bases| {
        bases.borrow_mut()[slot] = Some(Base {
            x: base_x,
            y: base_y,
            coins: BASE_COST,
        });
    });

    PLAYERS.with(|players| {
        players.borrow_mut()[slot] = Some(caller);
    });

    // CRITICAL: Clear the entire 8x8 base area of enemy territory and cells
    // This prevents the bug where overlapping territory causes cells to "siege" their own base
    for dy in 0..BASE_SIZE {
        for dx in 0..BASE_SIZE {
            let x = base_x.wrapping_add(dx) & 511;
            let y = base_y.wrapping_add(dy) & 511;
            let idx = coords_to_idx(x, y);

            // Kill any alive cells in the base area
            if is_alive_idx(idx) {
                clear_alive_idx(idx);
                mark_neighbors_potential(idx);

                // Decrement the owner's cell count
                if let Some(owner) = find_owner(x, y) {
                    CELL_COUNTS.with(|cc| {
                        let mut cc = cc.borrow_mut();
                        if cc[owner] > 0 {
                            cc[owner] -= 1;
                        }
                    });
                }
            }

            // Clear territory from ALL other players in the base area
            for other_player in 0..MAX_PLAYERS {
                if other_player != slot && player_owns(other_player, x, y) {
                    clear_territory(other_player, x, y);
                }
            }
        }
    }

    // Initialize 8x8 base territory (full base footprint)
    for dy in 0..BASE_SIZE {
        for dx in 0..BASE_SIZE {
            let x = base_x.wrapping_add(dx) & 511;
            let y = base_y.wrapping_add(dy) & 511;
            set_territory(slot, x, y);
        }
    }

    Ok(slot as u8)
}

#[ic_cdk::update]
fn place_cells(cells: Vec<(i32, i32)>) -> Result<u32, String> {
    let caller = ic_cdk::api::msg_caller();

    // Record activity for freeze detection
    LAST_ACTIVITY_NS.with(|la| *la.borrow_mut() = ic_cdk::api::time());

    // Restart timer if it was stopped (board was empty or frozen)
    if !is_timer_running() {
        start_timer();
    }

    // Size limit validation
    if cells.len() > MAX_PLACE_CELLS {
        return Err(format!("Max {} cells per call", MAX_PLACE_CELLS));
    }

    if cells.is_empty() {
        return Ok(0);
    }

    let slot = find_player_slot(caller).ok_or("Not in game")?;

    let base = BASES.with(|bases| {
        bases.borrow()[slot].clone()
    }).ok_or("No base")?;

    let wallet_balance = WALLETS.with(|w| *w.borrow().get(&caller).unwrap_or(&0));
    if wallet_balance < cells.len() as u64 * PLACEMENT_COST {
        return Err("Insufficient coins".to_string());
    }

    // Phase 1: Validate ALL cells first (atomic)
    for &(x, y) in &cells {
        if x < 0 || x >= GRID_SIZE as i32 || y < 0 || y >= GRID_SIZE as i32 {
            return Err("Coordinates out of range".to_string());
        }
        let x = x as u16;
        let y = y as u16;

        // Base (including walls) is ALWAYS the owner's territory - no bitmap check needed
        // For positions outside base, must own the territory
        if !is_in_base(&base, x, y) && !player_owns(slot, x, y) {
            return Err("Not your territory".to_string());
        }

        if is_alive(x, y) {
            return Err("Cell already alive".to_string());
        }
    }

    // Phase 2: Deduct coins (wallet -> base treasury)
    let count = cells.len() as u64;
    WALLETS.with(|wallets| {
        if let Some(balance) = wallets.borrow_mut().get_mut(&caller) {
            *balance -= count * PLACEMENT_COST;
        }
    });
    BASES.with(|bases| {
        if let Some(base) = &mut bases.borrow_mut()[slot] {
            base.coins += count * PLACEMENT_COST;
        }
    });

    // Phase 3: Place cells
    for &(x, y) in &cells {
        let x = x as u16;
        let y = y as u16;
        set_alive(x, y);
        mark_with_neighbors_potential(coords_to_idx(x, y));
    }

    // IMPORTANT: Copy NEXT_POTENTIAL to POTENTIAL so tick() detects activity
    // Without this, if POTENTIAL was empty, tick() would skip simulation forever
    NEXT_POTENTIAL.with(|np| {
        POTENTIAL.with(|p| {
            let np_ref = np.borrow();
            let mut p_ref = p.borrow_mut();
            for i in 0..TOTAL_WORDS {
                p_ref[i] |= np_ref[i];
            }
        });
    });

    // Update cell count
    CELL_COUNTS.with(|cc| {
        cc.borrow_mut()[slot] += cells.len() as u32;
    });

    // Clear grace period
    ZERO_CELLS_SINCE.with(|zcs| {
        zcs.borrow_mut()[slot] = None;
    });

    Ok(cells.len() as u32)
}

#[ic_cdk::update]
fn pause_game() -> Result<(), String> {
    IS_RUNNING.with(|r| {
        *r.borrow_mut() = false;
    });
    Ok(())
}

#[ic_cdk::update]
fn resume_game() -> Result<(), String> {
    IS_RUNNING.with(|r| {
        *r.borrow_mut() = true;
    });

    // Update activity timestamp to prevent immediate re-freeze
    LAST_ACTIVITY_NS.with(|la| *la.borrow_mut() = ic_cdk::api::time());

    // Restart timer if it was stopped
    if !is_timer_running() {
        start_timer();
    }

    Ok(())
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

#[ic_cdk::query]
fn get_state() -> GameState {
    let generation = GENERATION.with(|g| *g.borrow());
    let is_running = IS_RUNNING.with(|r| *r.borrow());

    let alive_bitmap = ALIVE.with(|a| a.borrow().to_vec());

    let territories: Vec<TerritoryExport> = TERRITORY.with(|t| {
        t.borrow().iter().map(|pt| TerritoryExport {
            chunk_mask: pt.chunk_mask,
            chunks: pt.chunks.iter().map(|c| c.to_vec()).collect(),
        }).collect()
    });

    let slots: Vec<Option<SlotInfo>> = (0..MAX_PLAYERS).map(|slot| {
        let principal = PLAYERS.with(|p| p.borrow()[slot]);
        let base = BASES.with(|b| b.borrow()[slot].clone());
        let alive_cells = CELL_COUNTS.with(|cc| cc.borrow()[slot]);
        let territory_cells = count_territory_cells(slot);
        let zero_since = ZERO_CELLS_SINCE.with(|zcs| zcs.borrow()[slot]);

        let (in_grace_period, grace_seconds_remaining) = if let Some(since) = zero_since {
            let now = ic_cdk::api::time();
            let elapsed = now.saturating_sub(since);
            let remaining = GRACE_PERIOD_NS.saturating_sub(elapsed);
            (true, Some(remaining / 1_000_000_000))
        } else {
            (false, None)
        };

        principal.map(|p| SlotInfo {
            principal: Some(p),
            base: base.map(|b| BaseInfo {
                x: b.x,
                y: b.y,
                coins: b.coins,
                slot: slot as u8,
            }),
            alive_cells,
            territory_cells,
            in_grace_period,
            grace_seconds_remaining,
        })
    }).collect();

    let next_wipe_quadrant = NEXT_WIPE_QUADRANT.with(|q| *q.borrow());
    let last_wipe = LAST_WIPE_NS.with(|lw| *lw.borrow());
    let now = ic_cdk::api::time();
    let elapsed = now.saturating_sub(last_wipe);
    let seconds_until_wipe = WIPE_INTERVAL_NS.saturating_sub(elapsed) / 1_000_000_000;

    GameState {
        generation,
        is_running,
        alive_bitmap,
        territories,
        slots,
        next_wipe_quadrant,
        seconds_until_wipe,
    }
}

#[ic_cdk::query]
fn get_slots_info() -> Vec<Option<SlotInfo>> {
    (0..MAX_PLAYERS).map(|slot| {
        let principal = PLAYERS.with(|p| p.borrow()[slot]);
        let base = BASES.with(|b| b.borrow()[slot].clone());
        let alive_cells = CELL_COUNTS.with(|cc| cc.borrow()[slot]);
        let territory_cells = count_territory_cells(slot);
        let zero_since = ZERO_CELLS_SINCE.with(|zcs| zcs.borrow()[slot]);

        let (in_grace_period, grace_seconds_remaining) = if let Some(since) = zero_since {
            let now = ic_cdk::api::time();
            let elapsed = now.saturating_sub(since);
            let remaining = GRACE_PERIOD_NS.saturating_sub(elapsed);
            (true, Some(remaining / 1_000_000_000))
        } else {
            (false, None)
        };

        principal.map(|p| SlotInfo {
            principal: Some(p),
            base: base.map(|b| BaseInfo {
                x: b.x,
                y: b.y,
                coins: b.coins,
                slot: slot as u8,
            }),
            alive_cells,
            territory_cells,
            in_grace_period,
            grace_seconds_remaining,
        })
    }).collect()
}

#[ic_cdk::query]
fn get_base_info(slot: u8) -> Option<BaseInfo> {
    if slot as usize >= MAX_PLAYERS {
        return None;
    }
    BASES.with(|bases| {
        bases.borrow()[slot as usize].as_ref().map(|b| BaseInfo {
            x: b.x,
            y: b.y,
            coins: b.coins,
            slot,
        })
    })
}

#[ic_cdk::query]
fn get_territory_info(slot: u8) -> Option<TerritoryExport> {
    if slot as usize >= MAX_PLAYERS {
        return None;
    }
    TERRITORY.with(|t| {
        let t = t.borrow();
        let pt = &t[slot as usize];
        if pt.chunk_mask == 0 {
            return None;
        }
        Some(TerritoryExport {
            chunk_mask: pt.chunk_mask,
            chunks: pt.chunks.iter().map(|c| c.to_vec()).collect(),
        })
    })
}

#[ic_cdk::query]
fn get_next_wipe() -> WipeInfo {
    let next_quadrant = NEXT_WIPE_QUADRANT.with(|q| *q.borrow());
    let last_wipe = LAST_WIPE_NS.with(|lw| *lw.borrow());
    let now = ic_cdk::api::time();
    let elapsed = now.saturating_sub(last_wipe);
    let seconds_until = WIPE_INTERVAL_NS.saturating_sub(elapsed) / 1_000_000_000;

    WipeInfo {
        next_quadrant,
        seconds_until,
    }
}

#[ic_cdk::query]
fn get_balance() -> u64 {
    let caller = ic_cdk::api::msg_caller();
    WALLETS.with(|w| *w.borrow().get(&caller).unwrap_or(&0))
}

#[ic_cdk::query]
fn get_generation() -> u64 {
    GENERATION.with(|g| *g.borrow())
}

#[ic_cdk::query]
fn is_frozen() -> bool {
    !is_timer_running()
}

#[ic_cdk::query]
fn get_alive_cells() -> Vec<(u16, u16)> {
    let mut cells = Vec::new();
    ALIVE.with(|alive| {
        let alive = alive.borrow();
        for word_idx in 0..TOTAL_WORDS {
            let mut word = alive[word_idx];
            while word != 0 {
                let bit = word.trailing_zeros() as usize;
                word &= word - 1;
                let idx = word_idx * 64 + bit;
                let (x, y) = idx_to_coords(idx);
                cells.push((x, y));
            }
        }
    });
    cells
}

#[ic_cdk::query]
fn get_alive_bitmap() -> Vec<u64> {
    ALIVE.with(|a| a.borrow().to_vec())
}

#[ic_cdk::query]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to Life2 v2.", name)
}

// Benchmark query functions are in benchmarks.rs

/// Helper for benchmarks module to count alive cells
pub(crate) fn get_alive_cell_count() -> u32 {
    ALIVE.with(|alive| {
        alive.borrow().iter().map(|w| w.count_ones()).sum()
    })
}

// =============================================================================
// STABLE MEMORY PERSISTENCE
// =============================================================================

fn rebuild_potential_from_alive() {
    POTENTIAL.with(|p| {
        p.borrow_mut().fill(0);
    });
    NEXT_POTENTIAL.with(|np| {
        np.borrow_mut().fill(0);
    });

    ALIVE.with(|alive| {
        let alive = alive.borrow();
        for word_idx in 0..TOTAL_WORDS {
            let mut word = alive[word_idx];
            while word != 0 {
                let bit = word.trailing_zeros() as usize;
                word &= word - 1;
                let idx = word_idx * 64 + bit;
                mark_with_neighbors_potential(idx);
            }
        }
    });

    // Copy to POTENTIAL
    NEXT_POTENTIAL.with(|np| {
        POTENTIAL.with(|p| {
            *p.borrow_mut() = *np.borrow();
        });
    });
}

#[ic_cdk::pre_upgrade]
fn pre_upgrade() {
    let state = PersistedState {
        alive: ALIVE.with(|a| a.borrow().to_vec()),
        territory: TERRITORY.with(|t| t.borrow().to_vec()),
        bases: BASES.with(|b| b.borrow().to_vec()),
        players: PLAYERS.with(|p| p.borrow().to_vec()),
        wallets: WALLETS.with(|w| w.borrow().iter().map(|(&k, &v)| (k, v)).collect()),
        cell_counts: CELL_COUNTS.with(|cc| cc.borrow().to_vec()),
        zero_cells_since: ZERO_CELLS_SINCE.with(|zcs| zcs.borrow().to_vec()),
        generation: GENERATION.with(|g| *g.borrow()),
        is_running: IS_RUNNING.with(|r| *r.borrow()),
        next_wipe_quadrant: NEXT_WIPE_QUADRANT.with(|q| *q.borrow()),
        last_wipe_ns: LAST_WIPE_NS.with(|lw| *lw.borrow()),
        owner: OWNER.with(|o| o.borrow().to_vec()),
        last_activity_ns: Some(LAST_ACTIVITY_NS.with(|la| *la.borrow())),
    };

    ic_cdk::storage::stable_save((state,)).expect("Failed to save state");
}

#[ic_cdk::post_upgrade]
fn post_upgrade() {
    let (state,): (PersistedState,) =
        ic_cdk::storage::stable_restore().expect("Failed to restore state");

    ALIVE.with(|a| {
        let mut alive = a.borrow_mut();
        for (i, &v) in state.alive.iter().enumerate().take(TOTAL_WORDS) {
            alive[i] = v;
        }
    });

    TERRITORY.with(|t| {
        let mut territory = t.borrow_mut();
        for (i, pt) in state.territory.into_iter().enumerate().take(MAX_PLAYERS) {
            territory[i] = pt;
        }
    });

    BASES.with(|b| {
        let mut bases = b.borrow_mut();
        for (i, base) in state.bases.into_iter().enumerate().take(MAX_PLAYERS) {
            bases[i] = base;
        }
    });

    PLAYERS.with(|p| {
        let mut players = p.borrow_mut();
        for (i, player) in state.players.into_iter().enumerate().take(MAX_PLAYERS) {
            players[i] = player;
        }
    });

    WALLETS.with(|w| {
        *w.borrow_mut() = state.wallets.into_iter().collect();
    });

    CELL_COUNTS.with(|cc| {
        let mut counts = cc.borrow_mut();
        for (i, &c) in state.cell_counts.iter().enumerate().take(MAX_PLAYERS) {
            counts[i] = c;
        }
    });

    ZERO_CELLS_SINCE.with(|zcs| {
        let mut since = zcs.borrow_mut();
        for (i, &s) in state.zero_cells_since.iter().enumerate().take(MAX_PLAYERS) {
            since[i] = s;
        }
    });

    GENERATION.with(|g| *g.borrow_mut() = state.generation);
    IS_RUNNING.with(|r| *r.borrow_mut() = state.is_running);
    NEXT_WIPE_QUADRANT.with(|q| *q.borrow_mut() = state.next_wipe_quadrant);
    LAST_WIPE_NS.with(|lw| *lw.borrow_mut() = state.last_wipe_ns);
    LAST_ACTIVITY_NS.with(|la| *la.borrow_mut() = state.last_activity_ns.unwrap_or_else(ic_cdk::api::time));

    // Restore OWNER cache
    OWNER.with(|o| {
        let mut owner = o.borrow_mut();
        for (i, &v) in state.owner.iter().enumerate().take(TOTAL_CELLS) {
            owner[i] = v;
        }
    });

    // Rebuild transient structures
    rebuild_potential_from_alive();
    BFS_WORKSPACE.with(|ws| {
        *ws.borrow_mut() = BFSWorkspace::new();
    });

    // Restart timer
    start_timer();
}

#[ic_cdk::init]
fn init() {
    let now = ic_cdk::api::time();
    LAST_WIPE_NS.with(|lw| {
        *lw.borrow_mut() = now;
    });
    LAST_ACTIVITY_NS.with(|la| {
        *la.borrow_mut() = now;
    });
    // Rebuild POTENTIAL in case there are any alive cells (shouldn't be on fresh init, but be safe)
    rebuild_potential_from_alive();
    start_timer();
}

#[cfg(test)]
mod tests;

// =============================================================================
// CANDID EXPORT
// =============================================================================

ic_cdk::export_candid!();
