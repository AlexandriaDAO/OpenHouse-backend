# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-life-economics"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-life-economics`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   cd openhouse_frontend && npm run build && cd ..
   ./deploy.sh
   ```
4. **Verify deployment**:
   ```bash
   dfx canister --network ic status life1_backend
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(life): add points-based economics system"
   git push -u origin feature/life-economics
   gh pr create --title "Life Economics: Points-Based Territory System" --body "$(cat <<'EOF'
## Summary
- Players start with 1,000 points
- Placing cells costs 1 point per cell (distributed across your territory)
- Capturing enemy territory with points transfers those points to your balance
- Cannot place on alive cells (placement fails if any overlap)
- Cannot harvest your own points (anti-whale mechanic)
- Gold borders on cells indicate point value

See `live_economics.md` for full design.

## Test Plan
- [ ] Create game, verify starting balance is 1000
- [ ] Place cells, verify balance decreases and points appear in territory
- [ ] Run simulation, verify point capture on territory takeover
- [ ] Verify placement fails on occupied cells
- [ ] Verify gold border rendering on cells with points

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Life Backend: life1_backend

Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
   ```
6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- After sleep: IMMEDIATELY continue (no pause)
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/life-economics`
**Worktree:** `/home/theseus/alexandria/openhouse-life-economics`

---

# Implementation Plan: Life Economics System

## Overview

Add a points-based economics system to the Game of Life where:
- Players start with 1,000 points
- Placing cells costs 1 point per cell
- Points are stored IN territory cells
- Capturing enemy territory captures their points
- Gold borders indicate cells with points

## Current State

### Backend: `life1_backend/src/lib.rs`

**Existing structures:**
```rust
// Line 11-25: GameRoom has grid and territory as Vec<Vec<u8>>
pub struct GameRoom {
    pub grid: Vec<Vec<u8>>,        // owner ID per cell (0 = dead, 1-4 = player)
    pub territory: Vec<Vec<u8>>,   // ownership tracking
    // ...
}

// Line 43-50: GameState for frontend polling
pub struct GameState {
    pub grid: Vec<Vec<u8>>,
    pub territory: Vec<Vec<u8>>,
    // ...
}
```

**Key functions:**
- `place_cells` (line 251): Places cells without cost/validation
- `step_generation` (line 117): Runs Conway's rules, updates territory ownership
- `get_state` (line 363): Returns grid/territory to frontend

### Frontend: `openhouse_frontend/src/pages/Life.tsx`

**Existing rendering:**
- Line 377-453: `draw()` function renders grid, territory, cells
- Line 480-504: `handleCanvasClick()` places patterns
- Line 540-548: Cell counts and territory counts displayed

---

## Implementation

### Backend Changes: `life1_backend/src/lib.rs`

#### 1. Add Points Tracking Types

```rust
// PSEUDOCODE - Add after existing types (around line 60)

/// Player balance and stats
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
pub struct PlayerStats {
    pub principal: Principal,
    pub balance: u64,           // Spendable points
    pub total_earned: u64,      // Lifetime points captured
    pub total_spent: u64,       // Lifetime points placed
}

/// Extended game state with points
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
```

#### 2. Modify GameRoom Structure

```rust
// PSEUDOCODE - Modify GameRoom (around line 11)

pub struct GameRoom {
    // ... existing fields ...
    pub points: Vec<Vec<u16>>,           // Points per cell (NEW)
    pub player_balances: Vec<u64>,       // Balance per player (NEW)
}
```

#### 3. Modify create_game

```rust
// PSEUDOCODE - In create_game function (around line 165)

fn create_game(name: String, config: GameConfig) -> Result<u64, String> {
    // ... existing setup ...

    let game = GameRoom {
        // ... existing fields ...
        points: create_empty_points_grid(width, height),  // NEW: all zeros
        player_balances: vec![1000],  // NEW: creator starts with 1000 points
    };
    // ...
}

fn create_empty_points_grid(width: u32, height: u32) -> Vec<Vec<u16>> {
    vec![vec![0u16; width as usize]; height as usize]
}
```

#### 4. Modify join_game

```rust
// PSEUDOCODE - In join_game function (around line 200)

fn join_game(game_id: u64) -> Result<u8, String> {
    // ... existing logic ...

    if !game.players.contains(&caller) {
        // ... existing check for full game ...
        game.players.push(caller);
        game.player_balances.push(1000);  // NEW: new player gets 1000 points
    }
    // ...
}
```

#### 5. Modify place_cells with Economics

```rust
// PSEUDOCODE - Replace place_cells function (around line 251)

#[update]
fn place_cells(game_id: u64, cells: Vec<(i32, i32)>) -> Result<u32, String> {
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
            // Randomly distribute points across owned cells
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
```

#### 6. Modify step_generation for Point Capture

```rust
// PSEUDOCODE - Modify step_generation (around line 117)

fn step_generation(game: &mut GameRoom) {
    let height = game.height as usize;
    let width = game.width as usize;
    let mut new_grid = create_empty_grid(game.width, game.height);

    // Track points to transfer (from_player_idx, to_player_idx, amount)
    let mut point_transfers: Vec<(usize, usize, u16)> = Vec::new();

    for row in 0..height {
        for col in 0..width {
            let (count, owner_counts) = get_neighbor_info(&game.grid, row, col, height, width);
            let current = game.grid[row][col];

            if current > 0 {
                // Living cell survives with 2 or 3 neighbors
                if count == 2 || count == 3 {
                    new_grid[row][col] = current;
                } else {
                    // Cell dies - points stay in cell (territory doesn't change on death)
                }
            } else {
                // Dead cell born with exactly 3 neighbors
                if count == 3 {
                    let new_owner = get_majority_owner(&owner_counts);
                    new_grid[row][col] = new_owner;

                    // Check if this cell had points from another player
                    let old_territory_owner = game.territory[row][col];
                    let cell_points = game.points[row][col];

                    if cell_points > 0 && old_territory_owner > 0 && old_territory_owner != new_owner {
                        // Capture! Transfer points to new owner
                        let from_idx = (old_territory_owner - 1) as usize;
                        let to_idx = (new_owner - 1) as usize;
                        point_transfers.push((from_idx, to_idx, cell_points));
                        // Clear points from cell (they go to balance)
                        game.points[row][col] = 0;
                    }
                }
            }
        }
    }

    // Apply point transfers to balances
    for (from_idx, to_idx, amount) in point_transfers {
        if to_idx < game.player_balances.len() {
            game.player_balances[to_idx] += amount as u64;
        }
        // Note: from_idx player loses nothing from balance - points were in the cell
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
```

#### 7. Add New Query Methods

```rust
// PSEUDOCODE - Add after get_state (around line 375)

/// Get game state including points (main polling endpoint)
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
```

#### 8. Update Candid Interface

```candid
// life1_backend.did - Add new types and methods

type GameStateWithPoints = record {
    grid: vec vec nat8;
    territory: vec vec nat8;
    points: vec vec nat16;
    generation: nat64;
    players: vec principal;
    balances: vec nat64;
    is_running: bool;
};

service : {
    // ... existing methods ...

    // NEW methods
    get_state_with_points: (nat64) -> (variant { Ok: GameStateWithPoints; Err: text }) query;
    get_balance: (nat64) -> (variant { Ok: nat64; Err: text }) query;
}
```

---

### Frontend Changes: `openhouse_frontend/src/pages/Life.tsx`

#### 1. Update Type Imports

```typescript
// PSEUDOCODE - Update imports (around line 6)
import type {
    _SERVICE,
    GameState,
    GameStateWithPoints,  // NEW
    GameInfo,
    GameStatus
} from '../declarations/life1_backend/life1_backend.did.d';
```

#### 2. Add Gold Border Color Constant

```typescript
// PSEUDOCODE - Add after TERRITORY_COLORS (around line 32)
const GOLD_BORDER_COLOR = '#FFD700';
const GOLD_BORDER_MIN_OPACITY = 0.3;
const GOLD_BORDER_MAX_OPACITY = 1.0;
```

#### 3. Update State to Use Points

```typescript
// PSEUDOCODE - Update game state (around line 160)
const [gameState, setGameState] = useState<GameStateWithPoints | null>(null);
const [myBalance, setMyBalance] = useState(1000);
```

#### 4. Update Polling to Use get_state_with_points

```typescript
// PSEUDOCODE - Update tick function (around line 334)
const tick = async () => {
    if (cancelled) return;

    try {
        if (isRunning) {
            const result = await actor.step(currentGameId, 5);
            if ('Ok' in result && !cancelled) {
                // Fetch full state with points after stepping
                const stateResult = await actor.get_state_with_points(currentGameId);
                if ('Ok' in stateResult) {
                    setGameState(stateResult.Ok);
                    // Update my balance
                    const myIdx = stateResult.Ok.players.findIndex(
                        p => p.toText() === myPrincipal?.toText()
                    );
                    if (myIdx >= 0) {
                        setMyBalance(Number(stateResult.Ok.balances[myIdx]));
                    }
                }
            }
        } else {
            const result = await actor.get_state_with_points(currentGameId);
            if ('Ok' in result && !cancelled) {
                setGameState(result.Ok);
                // Update balance and running state
                const myIdx = result.Ok.players.findIndex(
                    p => p.toText() === myPrincipal?.toText()
                );
                if (myIdx >= 0) {
                    setMyBalance(Number(result.Ok.balances[myIdx]));
                }
                if (result.Ok.is_running !== isRunning) {
                    setIsRunning(result.Ok.is_running);
                }
            }
        }
    } catch (err) {
        console.error('Tick error:', err);
    }
    // ... rest of function
};
```

#### 5. Update Draw Function for Gold Borders

```typescript
// PSEUDOCODE - Modify draw function (around line 430, after drawing cells)

// Draw gold borders for cells with points
if (gameState.points) {
    for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
            const points = gameState.points[row]?.[col] || 0;
            if (points > 0) {
                // Calculate border opacity based on points (more points = more visible)
                const opacity = Math.min(
                    GOLD_BORDER_MAX_OPACITY,
                    GOLD_BORDER_MIN_OPACITY + (points / 10) * 0.1
                );
                ctx.strokeStyle = `rgba(255, 215, 0, ${opacity})`;
                ctx.lineWidth = Math.min(3, 1 + Math.floor(points / 5));
                ctx.strokeRect(
                    col * cellSize + 1,
                    row * cellSize + 1,
                    cellSize - 2,
                    cellSize - 2
                );
            }
        }
    }
}
```

#### 6. Update Place Cells Handler

```typescript
// PSEUDOCODE - Modify handleCanvasClick (around line 480)

const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning || !actor || currentGameId === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cellSize = BASE_CELL_SIZE * zoom;
    const col = Math.floor((x - panOffset.x) / cellSize);
    const row = Math.floor((y - panOffset.y) / cellSize);

    if (col < 0 || col >= gridSize.cols || row < 0 || row >= gridSize.rows) return;

    const cells: [number, number][] = parsedPattern.map(([dx, dy]) => [col + dx, row + dy]);

    // Check if player has enough points
    const cost = cells.length;
    if (myBalance < cost) {
        setError(`Not enough points. Need ${cost}, have ${myBalance}`);
        return;
    }

    try {
        const result = await actor.place_cells(currentGameId, cells);
        if ('Err' in result) {
            setError(result.Err);
        } else {
            setMyBalance(prev => prev - cost);  // Optimistic update
            setError(null);
        }
    } catch (err) {
        console.error('Place error:', err);
        setError(`Failed to place: ${err}`);
    }
};
```

#### 7. Add Balance Display in Header

```typescript
// PSEUDOCODE - Add to header section (around line 692)

<div className="flex items-center gap-4 text-sm font-mono">
    {/* NEW: Balance display */}
    <div className="text-gray-400">
        Points: <span className="text-yellow-400 font-bold">{myBalance}</span>
    </div>
    <div className="text-gray-600">|</div>

    {/* Existing generation display */}
    <div className="text-gray-400">
        Gen: <span className="text-dfinity-turquoise">{gameState?.generation.toString() || 0}</span>
    </div>
    // ... rest of stats
</div>
```

#### 8. Add Pattern Cost Display

```typescript
// PSEUDOCODE - Add to pattern selector footer (around line 806)

<div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
    <div className="flex items-center gap-2">
        <span className="text-gray-400 text-xs">Selected: </span>
        <span className={`font-mono text-sm ${CATEGORY_INFO[selectedPattern.category].color.split(' ')[0]}`}>
            {selectedPattern.name}
        </span>
        <span className="text-gray-500 text-xs">({parsedPattern.length} cells)</span>
        {/* NEW: Cost indicator */}
        <span className={`text-xs font-mono ${
            myBalance >= parsedPattern.length ? 'text-green-400' : 'text-red-400'
        }`}>
            Cost: {parsedPattern.length} pts
        </span>
    </div>
    <p className="text-gray-500 text-xs">{selectedPattern.description}</p>
</div>
```

#### 9. Add Error Display

```typescript
// PSEUDOCODE - Add error toast near canvas (around line 819)

{error && (
    <div className="absolute top-2 left-2 z-10 bg-red-500/80 text-white px-3 py-2 rounded text-sm">
        {error}
        <button onClick={() => setError(null)} className="ml-2 font-bold">x</button>
    </div>
)}
```

---

## Files Modified

| File | Changes |
|------|---------|
| `life1_backend/src/lib.rs` | Add points tracking, modify place_cells, step_generation, add queries |
| `life1_backend/life1_backend.did` | Add GameStateWithPoints type, new query methods |
| `openhouse_frontend/src/pages/Life.tsx` | Add balance display, gold borders, placement cost validation |

## Deployment Notes

- **Canister**: `life1_backend` (canister ID will be assigned on deploy)
- **Frontend**: `pezw3-laaaa-aaaal-qssoa-cai`
- Deploy with: `./deploy.sh`
- This is a NEW canister, so no upgrade concerns for existing state

## Test Scenarios

1. **New player join**: Verify balance starts at 1000
2. **Place pattern**: Verify points deducted, distributed to territory
3. **Place on occupied**: Verify placement fails with error
4. **Territory capture**: Verify points transfer to capturing player's balance
5. **Insufficient balance**: Verify placement blocked with error
6. **Gold borders**: Verify visual rendering scales with point value
