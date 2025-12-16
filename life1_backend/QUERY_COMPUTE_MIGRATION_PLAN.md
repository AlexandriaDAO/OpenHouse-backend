# Query-Based Computation Migration Plan

## Overview

This plan migrates the Game of Life simulation from expensive timer-based update calls to free query-based computation. The key insight is that Game of Life is perfectly deterministic - given a checkpoint state and elapsed time, any node can compute the current state identically.

### Current Problem
- Timer runs every 5 seconds, executing 50 generations per tick
- Each generation costs ~90M instructions (measured)
- 50 gen/tick = 4.5B instructions per tick
- At 12 ticks/minute = 54B cycles/minute = **78T cycles/day**
- This burns through cycles even when no players are active

### Solution Architecture
- Backend stores **checkpoints** in HEAP memory (cells, generation, timestamp)
- `get_state` (QUERY) computes current state by simulating forward from checkpoint - **FREE**
- `place_cells` (UPDATE) catches up from checkpoint, applies changes to heap - **cheap**
- Periodic checkpoint timer (every 60s) catches up and updates heap - ensures query catch-up never exceeds limits
- **NO stable memory writes during runtime** - only in `pre_upgrade` hook
- Stable memory is 100x more expensive than heap - avoid it except for upgrade persistence

### Cost Comparison
| Scenario | Current Cost | New Cost |
|----------|-------------|----------|
| Idle (no players) | 78T cycles/day | ~0 cycles/day |
| 1 action/minute | 78T cycles/day | ~1.8B cycles/action = 2.6T cycles/day |
| 10 actions/minute | 78T cycles/day | ~18B cycles/min = 26T cycles/day |

---

## Design Decisions (User Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Simulation speed | 10 gen/sec | Matches frontend, standard GoL speed |
| Frontend model | Hybrid | Local sim for smooth visuals, backend authoritative |
| Concurrency | Optimistic + retry | Include expected_generation, reject if stale |
| Max idle time | 60 seconds | Max 600 generations catch-up (~54B instructions, safe) |

---

## Implementation Tasks

### Phase 1: Backend Data Model Changes

#### Task 1.1: Add Checkpoint Timestamp to Metadata

**File:** `life1_backend/src/lib.rs`

**Current Metadata struct (line ~156):**
```rust
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
    balances: Vec<u64>,
    is_running: bool,
}
```

**New Metadata struct:**
```rust
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
    balances: Vec<u64>,
    is_running: bool,
    // NEW: Timestamp when this checkpoint was saved (nanoseconds since epoch)
    checkpoint_timestamp_ns: u64,
}
```

**Why:** We need to know when the checkpoint was saved to calculate how many generations to simulate forward.

#### Task 1.2: Add Constants for Query-Based Computation

**File:** `life1_backend/src/lib.rs`

Add after existing constants (around line 27):
```rust
// Query-based computation settings
const GENERATIONS_PER_SECOND: u64 = 10;  // 10 gen/sec
const NANOS_PER_GENERATION: u64 = 100_000_000;  // 100ms = 0.1 sec
const MAX_GENERATIONS_PER_QUERY: u64 = 600;  // 60 seconds worth
const MAX_IDLE_SECONDS: u64 = 60;  // Force checkpoint after 60s idle
const CHECKPOINT_INTERVAL_MS: u64 = 60_000;  // 60 second checkpoint timer
```

---

### Phase 2: Core Simulation Refactor

#### Task 2.1: Create Pure Simulation Function (No Side Effects)

**File:** `life1_backend/src/lib.rs`

The current `step_generation()` function mutates global state. We need a **pure** version that takes a grid and returns a new grid, so queries can use it without side effects.

**New function to add:**
```rust
/// Pure simulation function - no side effects
/// Takes current cells and returns (new_cells, point_transfers)
/// point_transfers is Vec<(player_idx, points)> for balance updates
fn simulate_generation(cells: &[Cell]) -> (Vec<Cell>, Vec<(usize, u8)>) {
    let mut new_grid: Vec<Cell> = vec![Cell::default(); TOTAL_CELLS];
    let mut point_transfers: Vec<(usize, u8)> = Vec::new();

    for row in 0..GRID_SIZE {
        for col in 0..GRID_SIZE {
            let i = idx(row, col);
            let (neighbor_count, owner_counts) = get_neighbor_info(row, col, cells);
            let current_cell = cells[i];

            // Preserve territory (owner) and points regardless of alive state
            new_grid[i].set_owner(current_cell.owner());
            new_grid[i].set_points(current_cell.points());

            if current_cell.alive() {
                // Living cell survives with 2 or 3 neighbors
                if neighbor_count == 2 || neighbor_count == 3 {
                    new_grid[i].set_alive(true);
                }
            } else {
                // Dead cell born with exactly 3 neighbors
                if neighbor_count == 3 {
                    let new_owner = get_majority_owner(&owner_counts);
                    new_grid[i].set_alive(true);

                    // Territory capture
                    let old_owner = current_cell.owner();
                    if current_cell.points() > 0 && old_owner > 0 && old_owner != new_owner {
                        let to_idx = (new_owner - 1) as usize;
                        point_transfers.push((to_idx, current_cell.points()));
                        new_grid[i].set_points(0);
                    }

                    new_grid[i].set_owner(new_owner);
                }
            }
        }
    }

    (new_grid, point_transfers)
}
```

#### Task 2.2: Create Multi-Generation Simulation Function

**File:** `life1_backend/src/lib.rs`

```rust
/// Simulate N generations forward from given state
/// Returns (final_cells, final_generation, accumulated_point_transfers)
fn simulate_forward(
    initial_cells: &[Cell],
    initial_generation: u64,
    num_generations: u64,
) -> (Vec<Cell>, u64, Vec<(usize, u8)>) {
    let mut cells = initial_cells.to_vec();
    let mut all_transfers: Vec<(usize, u8)> = Vec::new();

    for _ in 0..num_generations {
        let (new_cells, transfers) = simulate_generation(&cells);
        cells = new_cells;
        all_transfers.extend(transfers);
    }

    (cells, initial_generation + num_generations, all_transfers)
}
```

#### Task 2.3: Create Time-Based Generation Calculator

**File:** `life1_backend/src/lib.rs`

```rust
/// Calculate how many generations have elapsed since checkpoint
fn generations_since_checkpoint(checkpoint_ns: u64, current_ns: u64) -> u64 {
    if current_ns <= checkpoint_ns {
        return 0;
    }
    let elapsed_ns = current_ns - checkpoint_ns;
    let generations = elapsed_ns / NANOS_PER_GENERATION;
    generations.min(MAX_GENERATIONS_PER_QUERY)
}
```

---

### Phase 3: Query Method Refactor

#### Task 3.1: Refactor `get_state` to Compute On-Demand

**File:** `life1_backend/src/lib.rs`

**Current implementation (line ~720):**
```rust
#[query]
fn get_state(_game_id: u64) -> Result<GameState, String> {
    Ok(build_game_state())
}
```

**New implementation:**
```rust
#[query]
fn get_state(_game_id: u64) -> Result<GameState, String> {
    // Get checkpoint data
    let (checkpoint_cells, checkpoint_gen, checkpoint_ns, players, balances, is_running) =
        CACHED_METADATA.with(|m| {
            let m = m.borrow();
            let cells: Vec<Cell> = GRID.with(|g| g.borrow().clone());
            (
                cells,
                m.generation,
                m.checkpoint_timestamp_ns,
                m.players.clone(),
                m.balances.clone(),
                m.is_running,
            )
        });

    // If not running, return checkpoint state directly
    if !is_running {
        let cells_view: Vec<CellView> = checkpoint_cells.iter().map(|c| (*c).into()).collect();
        return Ok(GameState {
            cells: cells_view,
            width: GRID_SIZE as u32,
            height: GRID_SIZE as u32,
            generation: checkpoint_gen,
            players,
            balances,
            is_running,
        });
    }

    // Calculate generations to simulate
    let current_ns = ic_cdk::api::time();
    let gens_to_simulate = generations_since_checkpoint(checkpoint_ns, current_ns);

    // If no time has passed, return checkpoint state
    if gens_to_simulate == 0 {
        let cells_view: Vec<CellView> = checkpoint_cells.iter().map(|c| (*c).into()).collect();
        return Ok(GameState {
            cells: cells_view,
            width: GRID_SIZE as u32,
            height: GRID_SIZE as u32,
            generation: checkpoint_gen,
            players,
            balances,
            is_running,
        });
    }

    // Simulate forward
    let (computed_cells, computed_gen, point_transfers) =
        simulate_forward(&checkpoint_cells, checkpoint_gen, gens_to_simulate);

    // Apply point transfers to balances (in memory only - not persisted)
    let mut computed_balances = balances;
    for (to_idx, amount) in point_transfers {
        if to_idx < computed_balances.len() {
            computed_balances[to_idx] += amount as u64;
        }
    }

    // Convert to view
    let cells_view: Vec<CellView> = computed_cells.iter().map(|c| (*c).into()).collect();

    Ok(GameState {
        cells: cells_view,
        width: GRID_SIZE as u32,
        height: GRID_SIZE as u32,
        generation: computed_gen,
        players,
        balances: computed_balances,
        is_running,
    })
}
```

**Key Points:**
- Query is FREE - no cycle cost
- Computes state on-the-fly from checkpoint
- Caps simulation at MAX_GENERATIONS_PER_QUERY (600) for safety
- Point transfers are computed but not persisted (they'll be persisted on next checkpoint)

---

### Phase 4: Update Method Refactor

#### Task 4.1: Add Expected Generation to place_cells

**File:** `life1_backend/life1_backend.did`

**Current signature:**
```candid
place_cells: (nat64, vec record { int32; int32 }) -> (variant { Ok: nat32; Err: text });
```

**New signature:**
```candid
place_cells: (nat64, vec record { int32; int32 }, opt nat64) -> (variant { Ok: nat32; Err: text });
```

The third parameter is `expected_generation` (optional for backwards compatibility).

#### Task 4.2: Refactor `place_cells` with Catch-Up Logic

**File:** `life1_backend/src/lib.rs`

**New implementation:**
```rust
/// Place cells on the grid with economics and optimistic concurrency.
/// If expected_generation is provided and doesn't match, returns error for retry.
#[update]
fn place_cells(
    _game_id: u64,
    cells: Vec<(i32, i32)>,
    expected_generation: Option<u64>,
) -> Result<u32, String> {
    let caller = ic_cdk::api::caller();

    // Reject anonymous principal
    if caller == Principal::anonymous() {
        return Err("Anonymous players not allowed. Please log in.".to_string());
    }

    ensure_grid_initialized();

    // Step 1: Catch up simulation from checkpoint to NOW
    let current_ns = ic_cdk::api::time();

    let (checkpoint_gen, checkpoint_ns) = CACHED_METADATA.with(|m| {
        let m = m.borrow();
        (m.generation, m.checkpoint_timestamp_ns)
    });

    let gens_to_simulate = generations_since_checkpoint(checkpoint_ns, current_ns);

    // Check for catch-up overflow (safety check)
    if gens_to_simulate > MAX_GENERATIONS_PER_QUERY {
        return Err(format!(
            "Checkpoint too old. Max catch-up is {} generations, need {}. Try again shortly.",
            MAX_GENERATIONS_PER_QUERY, gens_to_simulate
        ));
    }

    // Simulate forward if needed
    if gens_to_simulate > 0 {
        let current_cells: Vec<Cell> = GRID.with(|g| g.borrow().clone());
        let (new_cells, new_gen, point_transfers) =
            simulate_forward(&current_cells, checkpoint_gen, gens_to_simulate);

        // Apply to global state
        GRID.with(|g| *g.borrow_mut() = new_cells);

        CACHED_METADATA.with(|m| {
            let mut m = m.borrow_mut();
            m.generation = new_gen;
            m.checkpoint_timestamp_ns = current_ns;

            // Apply point transfers
            for (to_idx, amount) in point_transfers {
                if to_idx < m.balances.len() {
                    m.balances[to_idx] += amount as u64;
                }
            }
        });
    }

    // Step 2: Optimistic concurrency check
    let current_gen = CACHED_METADATA.with(|m| m.borrow().generation);
    if let Some(expected) = expected_generation {
        if expected != current_gen {
            return Err(format!(
                "Generation mismatch. Expected {}, current is {}. Please refresh and retry.",
                expected, current_gen
            ));
        }
    }

    // Step 3: Get or assign player number (existing logic)
    let (player_num, player_idx) = CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();

        if let Some(pos) = m.players.iter().position(|p| *p == caller) {
            return Ok(((pos + 1) as u8, pos));
        }

        if m.players.len() >= MAX_PLAYERS {
            return Err("Game full - max 10 players".to_string());
        }

        m.players.push(caller);
        m.balances.push(STARTING_BALANCE);
        Ok((m.players.len() as u8, m.players.len() - 1))
    })?;

    // Step 4: Check balance
    let cost = cells.len() as u64;
    let current_balance = CACHED_METADATA.with(|m| {
        m.borrow().balances.get(player_idx).copied().unwrap_or(0)
    });

    if current_balance < cost {
        return Err(format!("Insufficient points. Need {}, have {}", cost, current_balance));
    }

    // Step 5: Pre-validate cell placement (no overlaps with alive cells)
    for (x, y) in &cells {
        let col = ((*x & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;
        let row = ((*y & GRID_MASK as i32) + GRID_SIZE as i32) as usize & GRID_MASK;
        let cell = get_cell(row, col);
        if cell.alive() {
            return Err("Cannot place on alive cells".to_string());
        }
    }

    // Step 6: Deduct cost
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        if let Some(balance) = m.balances.get_mut(player_idx) {
            *balance -= cost;
        }
    });

    // Step 7: Place cells
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

    // Step 8: Update checkpoint timestamp in heap (NO stable memory write!)
    CACHED_METADATA.with(|m| {
        m.borrow_mut().checkpoint_timestamp_ns = current_ns;
    });
    // NOTE: We do NOT call save_metadata() here - stable memory writes only happen in pre_upgrade

    Ok(placed_count)
}
```

---

### Phase 5: Timer Refactor

#### Task 5.1: Change Timer to Checkpoint-Only (No Simulation)

**File:** `life1_backend/src/lib.rs`

**Current timer (line ~411):**
```rust
fn start_simulation_timer() {
    set_timer_interval(Duration::from_millis(TICK_INTERVAL_MS), || async {
        let is_running = CACHED_METADATA.with(|m| m.borrow().is_running);
        if is_running {
            for _ in 0..GENERATIONS_PER_TICK {
                step_generation();
            }
            save_metadata();
        }
    });
}
```

**New timer:**
```rust
/// Periodic checkpoint timer - ensures catch-up never exceeds limits
/// Only saves checkpoint if time has elapsed; does NOT run simulation
fn start_checkpoint_timer() {
    set_timer_interval(Duration::from_millis(CHECKPOINT_INTERVAL_MS), || async {
        let is_running = CACHED_METADATA.with(|m| m.borrow().is_running);
        if !is_running {
            return;
        }

        let current_ns = ic_cdk::api::time();
        let checkpoint_ns = CACHED_METADATA.with(|m| m.borrow().checkpoint_timestamp_ns);

        let gens_elapsed = generations_since_checkpoint(checkpoint_ns, current_ns);

        // Only create checkpoint if significant time has passed
        if gens_elapsed < 100 {
            // Less than 10 seconds, skip checkpoint
            return;
        }

        // Catch up and save checkpoint
        let current_cells: Vec<Cell> = GRID.with(|g| g.borrow().clone());
        let checkpoint_gen = CACHED_METADATA.with(|m| m.borrow().generation);

        let (new_cells, new_gen, point_transfers) =
            simulate_forward(&current_cells, checkpoint_gen, gens_elapsed);

        // Apply to global state
        GRID.with(|g| *g.borrow_mut() = new_cells);

        CACHED_METADATA.with(|m| {
            let mut m = m.borrow_mut();
            m.generation = new_gen;
            m.checkpoint_timestamp_ns = current_ns;

            for (to_idx, amount) in point_transfers {
                if to_idx < m.balances.len() {
                    m.balances[to_idx] += amount as u64;
                }
            }
        });

        // NOTE: No save_metadata() - heap only, stable memory writes only in pre_upgrade

        ic_cdk::println!(
            "Checkpoint updated in heap: gen {} (+{} gens)",
            new_gen, gens_elapsed
        );
    });
}
```

**Key Changes:**
- Timer interval increased from 5s to 60s
- Timer does NOT simulate continuously
- Timer only catches up and updates heap checkpoint when enough time has passed
- **NO stable memory writes** - only heap updates
- Most of the time, timer does nothing (cheap!)

#### Task 5.2: Update init and post_upgrade

**File:** `life1_backend/src/lib.rs`

Update `init()`:
```rust
#[init]
fn init() {
    ensure_grid_initialized();

    let now = ic_cdk::api::time();
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        m.is_running = true;
        m.checkpoint_timestamp_ns = now;  // Initialize checkpoint time
    });

    // NOTE: No save_metadata() - heap only during runtime
    start_checkpoint_timer();  // Changed from start_simulation_timer

    ic_cdk::println!(
        "Life Backend Initialized - {}x{} persistent world, {} gen/sec (query-computed)",
        GRID_SIZE, GRID_SIZE, GENERATIONS_PER_SECOND
    );
}
```

Update `post_upgrade()` - add checkpoint timestamp initialization:
```rust
#[post_upgrade]
fn post_upgrade() {
    load_metadata();

    // ... existing grid restore logic ...

    // Ensure checkpoint timestamp is set (migration from old version)
    let has_timestamp = CACHED_METADATA.with(|m| m.borrow().checkpoint_timestamp_ns > 0);
    if !has_timestamp {
        let now = ic_cdk::api::time();
        CACHED_METADATA.with(|m| {
            m.borrow_mut().checkpoint_timestamp_ns = now;
        });
        // NOTE: No save_metadata() here - the next pre_upgrade will persist it
        ic_cdk::println!("Migrated: initialized checkpoint_timestamp_ns in heap");
    }

    start_checkpoint_timer();  // Changed from start_simulation_timer
}
```

---

### Phase 6: Remove Old Timer-Based Code

#### Task 6.1: Remove/Deprecate Old Functions

**File:** `life1_backend/src/lib.rs`

Remove or mark as deprecated:
- `step_generation()` - replaced by pure `simulate_generation()`
- `start_simulation_timer()` - replaced by `start_checkpoint_timer()`
- `GENERATIONS_PER_TICK` constant
- `TICK_INTERVAL_MS` constant (replace with CHECKPOINT_INTERVAL_MS)
- `InstructionStats` and profiling code (optional - can keep for debugging)

#### Task 6.2: Update manual_tick for Testing

Keep `manual_tick()` but update to use new simulation:
```rust
/// Manual tick for debugging - advances N generations
#[update]
fn manual_tick() -> u64 {
    let current_cells: Vec<Cell> = GRID.with(|g| g.borrow().clone());
    let checkpoint_gen = CACHED_METADATA.with(|m| m.borrow().generation);

    let gens_to_advance = 50;  // Or make this a parameter
    let (new_cells, new_gen, point_transfers) =
        simulate_forward(&current_cells, checkpoint_gen, gens_to_advance);

    GRID.with(|g| *g.borrow_mut() = new_cells);

    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        m.generation = new_gen;
        m.checkpoint_timestamp_ns = ic_cdk::api::time();

        for (to_idx, amount) in point_transfers {
            if to_idx < m.balances.len() {
                m.balances[to_idx] += amount as u64;
            }
        }
    });

    // NOTE: No save_metadata() - heap only
    new_gen
}
```

---

### Phase 6.5: Important Note on Stable Memory

**Runtime:** All state lives in heap memory only. No stable memory I/O.

**Upgrade persistence:** The existing `pre_upgrade` and `post_upgrade` hooks handle this:
- `pre_upgrade`: Copies heap → stable (grid + metadata)
- `post_upgrade`: Copies stable → heap (grid + metadata)

This is already implemented and working. We're just removing the unnecessary `save_metadata()` calls that were writing to stable memory during runtime.

**Why this is safe:**
- IC canisters don't "crash" like traditional servers
- Traps/panics roll back the transaction - heap state unchanged
- The only time heap is lost is during upgrade - which `pre_upgrade` handles
- Stable memory is 100x more expensive - avoid it except for upgrades

---

### Phase 7: Frontend Updates

#### Task 7.1: Update place_cells Call with Expected Generation

**File:** `openhouse_frontend/src/pages/Life.tsx`

**Current call (around line 971):**
```typescript
const result = await actor.place_cells(currentGameId, previewCells);
```

**New call:**
```typescript
// Get current generation from last known state
const expectedGen = gameState?.generation ?? BigInt(0);
const result = await actor.place_cells(currentGameId, previewCells, [expectedGen]);
```

#### Task 7.2: Handle Generation Mismatch Errors

**File:** `openhouse_frontend/src/pages/Life.tsx`

Update error handling in `confirmPlacement`:
```typescript
if ('Err' in result) {
    let errorMsg = result.Err;

    if (errorMsg.includes('Generation mismatch')) {
        // Refresh state and let user retry
        errorMsg = 'The game has evolved since you started. Refreshing state...';
        // Trigger immediate backend sync
        try {
            const stateResult = await actor.get_state(currentGameId);
            if ('Ok' in stateResult) {
                setGameState(stateResult.Ok);
                setLocalCells(stateResult.Ok.cells);
            }
        } catch {}
        setPlacementError(errorMsg + ' Please try placing again.');
    } else if (errorMsg.includes('alive cells')) {
        errorMsg = 'Placement failed: Cells have evolved into that space. Try a different position.';
        setPlacementError(errorMsg);
    } else if (errorMsg.includes('Insufficient')) {
        errorMsg = 'Not enough points. Your balance may have changed.';
        setPlacementError(errorMsg);
    } else if (errorMsg.includes('Checkpoint too old')) {
        errorMsg = 'Server is catching up. Please wait a moment and try again.';
        setPlacementError(errorMsg);
    } else {
        setPlacementError(errorMsg);
    }
}
```

#### Task 7.3: Update TypeScript Declarations

**File:** `openhouse_frontend/src/declarations/life1_backend/life1_backend.did.d.ts`

After deploying backend, regenerate declarations:
```bash
dfx generate life1_backend
cp -r src/declarations/life1_backend/* openhouse_frontend/src/declarations/life1_backend/
```

The `place_cells` type will update to include the optional third parameter.

---

### Phase 8: Candid Interface Updates

#### Task 8.1: Update life1_backend.did

**File:** `life1_backend/life1_backend.did`

Full updated interface:
```candid
type GameStatus = variant {
    Waiting;
    Active;
    Finished;
};

type Cell = record {
    owner: nat8;
    points: nat8;
    alive: bool;
};

type GameState = record {
    cells: vec Cell;
    width: nat32;
    height: nat32;
    generation: nat64;
    players: vec principal;
    balances: vec nat64;
    is_running: bool;
};

type GameInfo = record {
    id: nat64;
    name: text;
    status: GameStatus;
    player_count: nat32;
    generation: nat64;
};

type GameRoom = record {
    id: nat64;
    name: text;
    width: nat32;
    height: nat32;
    status: GameStatus;
    players: vec principal;
    generation: nat64;
    is_running: bool;
};

type GameConfig = record {
    width: nat32;
    height: nat32;
    max_players: nat32;
    generations_limit: opt nat64;
};

service : {
    // Game management
    list_games: () -> (vec GameInfo) query;
    create_game: (text, GameConfig) -> (variant { Ok: nat64; Err: text });
    join_game: (nat64) -> (variant { Ok: nat8; Err: text });
    start_game: (nat64) -> (variant { Ok; Err: text });
    get_game: (nat64) -> (variant { Ok: GameRoom; Err: text }) query;

    // Game actions
    // Third parameter is optional expected_generation for optimistic concurrency
    place_cells: (nat64, vec record { int32; int32 }, opt nat64) -> (variant { Ok: nat32; Err: text });

    // Debug/Admin
    manual_tick: () -> (nat64);
    restart_timer: () -> (text);

    // Queries
    get_state: (nat64) -> (variant { Ok: GameState; Err: text }) query;
    get_balance: (nat64) -> (variant { Ok: nat64; Err: text }) query;
    greet: (text) -> (text) query;
    get_instruction_stats: () -> (text) query;
}
```

---

### Phase 9: Testing Plan

#### Task 9.1: Pre-Deployment Testing (Local Simulation)

Since there's no local test environment, test the pure functions in isolation:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simulate_generation_blinker() {
        // Create a blinker pattern
        let mut cells = vec![Cell::default(); 9]; // 3x3 for simplicity
        // Set up vertical blinker
        cells[1].set_alive(true);
        cells[1].set_owner(1);
        cells[4].set_alive(true);
        cells[4].set_owner(1);
        cells[7].set_alive(true);
        cells[7].set_owner(1);

        // After one generation, should become horizontal
        // (Note: this test would need adjustment for actual 512x512 grid)
    }

    #[test]
    fn test_generations_since_checkpoint() {
        let checkpoint = 1_000_000_000_000u64; // 1 second in nanos
        let current = 1_500_000_000_000u64;    // 1.5 seconds

        let gens = generations_since_checkpoint(checkpoint, current);
        assert_eq!(gens, 5); // 0.5 seconds * 10 gen/sec = 5 generations
    }
}
```

#### Task 9.2: Post-Deployment Verification

After deploying to mainnet:

```bash
# 1. Verify canister starts
dfx canister --network ic call pijnb-7yaaa-aaaae-qgcuq-cai greet '("Test")'

# 2. Check initial state
dfx canister --network ic call pijnb-7yaaa-aaaae-qgcuq-cai get_state '(0)'

# 3. Wait 10 seconds, check state again - generation should have advanced
sleep 10
dfx canister --network ic call pijnb-7yaaa-aaaae-qgcuq-cai get_state '(0)'

# 4. Check cycle balance - should NOT be rapidly depleting
dfx canister --network ic status pijnb-7yaaa-aaaae-qgcuq-cai

# 5. Test place_cells with expected_generation
dfx canister --network ic call pijnb-7yaaa-aaaae-qgcuq-cai place_cells '(0, vec { record { 100; 100 } }, opt 150)'
```

#### Task 9.3: Monitor Cycle Usage

After deployment, monitor for 5 minutes:
```bash
# Check cycles every minute
for i in {1..5}; do
    echo "=== Minute $i ==="
    dfx canister --network ic status pijnb-7yaaa-aaaae-qgcuq-cai | grep -i cycle
    sleep 60
done
```

Expected: Cycle balance should remain nearly constant (small decrease from checkpoint timer, if any).

---

### Phase 10: Deployment

#### Task 10.1: Deployment Checklist

Before deployment:
- [ ] All code changes complete
- [ ] Run `cargo check` - no errors
- [ ] Run `cargo clippy` - no warnings
- [ ] Review all TODO comments removed
- [ ] Backup current canister state (if possible)

#### Task 10.2: Deploy Sequence

```bash
# 1. Stop the canister first (prevent race conditions during upgrade)
export DFX_WARNING=-mainnet_plaintext_identity
dfx canister --network ic stop pijnb-7yaaa-aaaae-qgcuq-cai

# 2. Deploy new code
dfx deploy life1_backend --network ic

# 3. The canister will auto-start after deploy with post_upgrade

# 4. Verify it's running
dfx canister --network ic status pijnb-7yaaa-aaaae-qgcuq-cai

# 5. Test basic functionality
dfx canister --network ic call pijnb-7yaaa-aaaae-qgcuq-cai get_state '(0)'
```

#### Task 10.3: Frontend Deployment

```bash
# After backend is verified working:

# 1. Regenerate declarations
dfx generate life1_backend
cp -r src/declarations/life1_backend/* openhouse_frontend/src/declarations/life1_backend/

# 2. Build and deploy frontend
cd openhouse_frontend
npm run build
dfx deploy openhouse_frontend --network ic
```

---

## Rollback Plan

If issues occur after deployment:

### Quick Fix: Pause Simulation
```bash
# If cycles are still burning too fast
dfx canister --network ic stop pijnb-7yaaa-aaaae-qgcuq-cai
```

### Full Rollback
1. Keep a copy of the current `lib.rs` before changes
2. If needed, revert to old code and redeploy
3. State in stable memory should be preserved

---

## Summary

### Files to Modify
1. `life1_backend/src/lib.rs` - Main logic changes
2. `life1_backend/life1_backend.did` - Add optional parameter to place_cells
3. `openhouse_frontend/src/pages/Life.tsx` - Update place_cells call

### Key New Functions
- `simulate_generation(cells) -> (new_cells, point_transfers)` - Pure, no side effects
- `simulate_forward(cells, gen, n) -> (cells, gen, transfers)` - Multi-generation
- `generations_since_checkpoint(checkpoint_ns, current_ns) -> u64` - Time calculation
- `start_checkpoint_timer()` - Replaces old simulation timer

### Key Behavior Changes
- `get_state` now computes state on-the-fly (FREE query)
- `place_cells` catches up from checkpoint before applying changes (heap only)
- Timer only runs every 60s, updates heap checkpoint (no stable memory)
- Optimistic concurrency prevents lost updates
- **NO stable memory writes during runtime** - only in `pre_upgrade`

### Memory Model
```
RUNTIME (cheap):          UPGRADE (rare):
┌──────────────┐          ┌──────────────┐
│    HEAP      │  ──────► │    STABLE    │
│  - GRID      │  pre_up  │  - GRID      │
│  - METADATA  │          │  - METADATA  │
│  - timestamp │  ◄────── │              │
└──────────────┘  post_up └──────────────┘
```

### Expected Results
- Idle cycle cost: ~0 (down from 78T/day)
- Active cycle cost: Proportional to player actions only
- Same simulation speed (10 gen/sec) as before
- Frontend experience unchanged
- No unnecessary stable memory I/O
