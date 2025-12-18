# Quadrant Control System - Implementation Plan

## Overview

A new game mechanic where players must achieve **80% territorial control** of a quadrant to become its "controller" and unlock the ability to collect coins within that quadrant.

---

## Game Mechanics

### Core Rules

| Rule | Description |
|------|-------------|
| **Controller Threshold** | 80% of territory (dead + alive cells with owner) in a quadrant |
| **Sticky Control** | Once achieved, control persists until another player hits 80% |
| **Coin Collection** | Only the quadrant controller can collect coins |
| **Self-Coins Locked** | You can never collect your own coins (even as controller) |
| **No Controller** | If no one has 80%, coins are locked for everyone |

### Strategic Implications

- **Bombing without territory** = You capture the cell, but coins stay on it (now your territory)
- **Slow expansion** = Build to 80%, then raid the entire quadrant
- **Defense matters** = Losing control means losing collection rights
- **Quadrant focus** = Incentivizes concentrating efforts rather than spreading thin

### Quadrant Layout (existing)

```
┌─────────┬─────────┬─────────┬─────────┐
│  Q0     │  Q1     │  Q2     │  Q3     │
│ (0,0)   │ (128,0) │ (256,0) │ (384,0) │
├─────────┼─────────┼─────────┼─────────┤
│  Q4     │  Q5     │  Q6     │  Q7     │
│ (0,128) │         │         │         │
├─────────┼─────────┼─────────┼─────────┤
│  Q8     │  Q9     │  Q10    │  Q11    │
│ (0,256) │         │         │         │
├─────────┼─────────┼─────────┼─────────┤
│  Q12    │  Q13    │  Q14    │  Q15    │
│ (0,384) │         │         │         │
└─────────┴─────────┴─────────┴─────────┘

Each quadrant: 128x128 = 16,384 cells
```

---

## Backend Implementation

### 1. New State (Incremental Tracking)

```rust
// Add to thread_local! block (after line 196)

/// Territory count per player per quadrant - updated incrementally
/// [quadrant][player] where player 0 is unused, 1-9 are valid players
/// This avoids expensive periodic full-grid scans
static QUADRANT_TERRITORY: RefCell<[[u32; MAX_PLAYERS + 1]; TOTAL_QUADRANTS]> =
    RefCell::new([[0u32; MAX_PLAYERS + 1]; TOTAL_QUADRANTS]);

/// Controller of each quadrant (0 = no controller, 1-9 = player number)
/// Only the controller can collect coins in their quadrant
static QUADRANT_CONTROLLER: RefCell<[u8; TOTAL_QUADRANTS]> =
    RefCell::new([0u8; TOTAL_QUADRANTS]);
```

**Storage cost:**
- Territory counts: 16 quadrants × 10 players × 4 bytes = **640 bytes**
- Controllers: 16 bytes
- **Total: 656 bytes**

### 2. New Constants

```rust
// Add after line 34

// Quadrant control system
const CONTROLLER_THRESHOLD_PERCENT: u32 = 80;
```

### 3. Helper Functions

```rust
/// Get quadrant index (0-15) from cell index
#[inline(always)]
fn get_quadrant(idx: usize) -> usize {
    let x = idx & GRID_MASK;           // x coordinate
    let y = idx >> GRID_SHIFT;         // y coordinate
    let qx = x >> 7;                   // x / 128 = quadrant x (0-3)
    let qy = y >> 7;                   // y / 128 = quadrant y (0-3)
    (qy << 2) | qx                     // qy * 4 + qx
}

/// Update territory count when ownership changes (called from apply_cell_change)
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
```

### 4. Modify Capture Logic

**File:** `life2_backend/src/lib.rs`
**Function:** `apply_cell_change` (lines 294-354)

Replace the `CellChange::Birth` arm:

```rust
CellChange::Birth { new_owner } => {
    let old_owner = get_owner(cell);
    let old_coins = get_coins(cell);
    let quadrant = get_quadrant(idx);

    // Update territory tracking (incremental - no full scan needed)
    update_quadrant_territory(quadrant, old_owner, new_owner);

    // Determine if new_owner can collect coins
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
    (Some(new_owner), None)
}
```

**Also update `CellChange::Death` arm** to track territory changes when cells die:

```rust
CellChange::Death => {
    let owner = get_owner(cell);
    // Note: Death doesn't change ownership, cell stays owned as territory
    // No need to update QUADRANT_TERRITORY since owner doesn't change
    grid[idx] = set_alive(cell, false);
    add_with_neighbors(next_potential, idx);
    (None, if owner > 0 { Some(owner) } else { None })
}
```

### 5. Initialize Territory Counts on Startup

Add function to rebuild territory counts from grid (needed on first deploy):

```rust
/// Rebuild QUADRANT_TERRITORY from grid state
/// Called on post_upgrade if territory data is missing
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

            // Count from grid
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
```

### 6. Update Stable Storage

**Modify:** `Metadata` struct (line 632-642)

```rust
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
struct Metadata {
    generation: u64,
    players: Vec<Principal>,
    balances: Vec<(Principal, u64)>,
    cell_counts: Vec<u32>,
    is_running: bool,
    #[serde(default)]
    zero_cells_since: Vec<Option<u64>>,
    // NEW: Quadrant control state
    #[serde(default)]
    quadrant_territory: Vec<Vec<u32>>,  // [quadrant][player]
    #[serde(default)]
    quadrant_controllers: Vec<u8>,
}
```

**Modify:** `pre_upgrade` (add before encoding)

```rust
quadrant_territory: QUADRANT_TERRITORY.with(|t| {
    t.borrow().iter().map(|q| q.to_vec()).collect()
}),
quadrant_controllers: QUADRANT_CONTROLLER.with(|c| c.borrow().to_vec()),
```

**Modify:** `post_upgrade` (add after restoring other state)

```rust
// Restore quadrant territory counts
let has_territory_data = !metadata.quadrant_territory.is_empty();
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

// If no territory data (first deploy with this feature), rebuild from grid
if !has_territory_data {
    rebuild_quadrant_territory();
}
```

### 7. New Query: `get_quadrant_info`

```rust
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct QuadrantInfo {
    pub quadrant: u8,
    pub territory_by_player: Vec<u32>,  // 9 values: [P1, P2, ..., P9]
    pub total_territory: u32,
    pub coins_by_player: Vec<u32>,      // requires grid scan for coins
    pub total_coins: u32,
    pub controller: u8,                  // 0=none, 1-9=player
}

#[query]
fn get_quadrant_info() -> Vec<QuadrantInfo> {
    // Get territory from incremental tracking (fast!)
    let territory = QUADRANT_TERRITORY.with(|t| t.borrow().clone());
    let controllers = QUADRANT_CONTROLLER.with(|c| c.borrow().clone());

    // Scan grid for coins (still needed, but coins change less frequently)
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
```

### 8. Update `GameState` Response

**Modify:** `GameState` struct (line 606-614)

```rust
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct GameState {
    pub generation: u64,
    pub alive_cells: Vec<SparseCell>,
    pub territory: Vec<SparseCell>,
    pub players: Vec<Principal>,
    pub balances: Vec<u64>,
    pub player_num: Option<u8>,
    // NEW
    pub quadrant_controllers: Vec<u8>,
}
```

**Modify:** `get_state` query (line 1026-1090)

Add before the final `GameState` construction:

```rust
let quadrant_controllers = QUADRANT_CONTROLLER.with(|c| c.borrow().to_vec());
```

And include in the returned struct:

```rust
GameState {
    generation: GENERATION.with(|g| *g.borrow()),
    alive_cells,
    territory,
    players,
    balances,
    player_num,
    quadrant_controllers,  // NEW
}
```

### 9. Update Candid Interface

**File:** `life2_backend/life2_backend.did`

Add new type:

```candid
type QuadrantInfo = record {
    quadrant: nat8;
    territory_by_player: vec nat32;
    total_territory: nat32;
    coins_by_player: vec nat32;
    total_coins: nat32;
    controller: nat8;
};
```

Update `GameState`:

```candid
type GameState = record {
    generation: nat64;
    alive_cells: vec SparseCell;
    territory: vec SparseCell;
    players: vec principal;
    balances: vec nat64;
    player_num: opt nat8;
    quadrant_controllers: vec nat8;
};
```

Add to service:

```candid
get_quadrant_info: () -> (vec QuadrantInfo) query;
```

### 10. Reset Game Handler

**Modify:** `reset_game` (line 984-1002)

Add:

```rust
QUADRANT_TERRITORY.with(|t| {
    let mut territory = t.borrow_mut();
    for q in 0..TOTAL_QUADRANTS {
        for p in 0..=MAX_PLAYERS {
            territory[q][p] = 0;
        }
    }
});
QUADRANT_CONTROLLER.with(|c| c.borrow_mut().fill(0));
```

---

## Frontend Implementation

### 1. Update Types

```typescript
// In types or declarations
interface GameState {
    generation: bigint;
    alive_cells: SparseCell[];
    territory: SparseCell[];
    players: Principal[];
    balances: bigint[];
    player_num: number | null;
    quadrant_controllers: number[];  // NEW: 16 values (0-9)
}

interface QuadrantInfo {
    quadrant: number;
    territory_by_player: number[];   // 9 values
    total_territory: number;
    coins_by_player: number[];
    total_coins: number;
    controller: number;              // 0=none, 1-9=player
}
```

### 2. Quadrant Helper

```typescript
function getQuadrant(x: number, y: number): number {
    const qx = Math.floor(x / 128);
    const qy = Math.floor(y / 128);
    return qy * 4 + qx;
}
```

### 3. Coin Color Logic

```typescript
type CoinState = 'locked' | 'unlocked' | 'own';

function getCoinState(
    coin: SparseCell,
    myPlayer: number | null,
    controllers: number[]
): CoinState {
    // Your own coins are always locked (can't collect your own)
    if (myPlayer !== null && coin.owner === myPlayer) {
        return 'own';
    }

    // Check if current player controls this quadrant
    const quadrant = getQuadrant(coin.x, coin.y);
    const controller = controllers[quadrant];

    if (myPlayer !== null && controller === myPlayer) {
        return 'unlocked';  // Gold - can collect!
    }

    return 'locked';  // Steel - cannot collect
}
```

### 4. Rendering Colors

```typescript
const COIN_COLORS = {
    locked: '#8B8B8B',    // Steel gray
    unlocked: '#FFD700',   // Gold
    own: '#8B8B8B',        // Steel gray (same as locked)
};

const PLAYER_COLORS = [
    '#FF0000', // P1 Red
    '#00FF00', // P2 Green
    '#0000FF', // P3 Blue
    // ... etc
];

function renderCoin(ctx: CanvasRenderingContext2D, coin: SparseCell, state: CoinState) {
    const x = coin.x * CELL_SIZE;
    const y = coin.y * CELL_SIZE;

    // Fill with coin state color
    ctx.fillStyle = COIN_COLORS[state];
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    // Border with owner color
    ctx.strokeStyle = PLAYER_COLORS[coin.owner - 1];
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
}
```

### 5. Quadrant Control UI Overlay (Optional)

Show which quadrants the player controls:

```typescript
function renderQuadrantOverlay(
    ctx: CanvasRenderingContext2D,
    myPlayer: number | null,
    controllers: number[]
) {
    if (myPlayer === null) return;

    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#00FF00';  // Light green tint

    for (let q = 0; q < 16; q++) {
        if (controllers[q] === myPlayer) {
            const qx = (q % 4) * 128 * CELL_SIZE;
            const qy = Math.floor(q / 4) * 128 * CELL_SIZE;
            ctx.fillRect(qx, qy, 128 * CELL_SIZE, 128 * CELL_SIZE);
        }
    }

    ctx.globalAlpha = 1.0;
}
```

### 6. Quadrant Status Panel (Optional)

```typescript
function QuadrantPanel({
    quadrantInfo,
    myPlayer
}: {
    quadrantInfo: QuadrantInfo[],
    myPlayer: number
}) {
    return (
        <div className="quadrant-panel">
            {quadrantInfo.map(q => {
                const myTerrPct = q.total_territory > 0
                    ? Math.round((q.territory_by_player[myPlayer - 1] / q.total_territory) * 100)
                    : 0;
                const isControlled = q.controller === myPlayer;

                return (
                    <div
                        key={q.quadrant}
                        className={`quadrant ${isControlled ? 'controlled' : ''}`}
                    >
                        <span>Q{q.quadrant}</span>
                        <span>{q.controller ? `P${q.controller}` : '—'}</span>
                        <span className={myTerrPct >= 80 ? 'threshold' : ''}>
                            {myTerrPct}%
                        </span>
                        <span>{q.total_coins} 🪙</span>
                    </div>
                );
            })}
        </div>
    );
}
```

---

## Cycle Cost Analysis

### Incremental Territory Tracking (Per Ownership Change)

| Operation | Cost |
|-----------|------|
| Get quadrant (bit ops) | ~5 instructions |
| Decrement old owner count | ~10 instructions |
| Increment new owner count | ~10 instructions |
| Sum total territory | ~15 instructions |
| Check threshold | ~20 instructions |
| Update controller if needed | ~10 instructions |
| **Total per ownership change** | **~70 instructions** |

### Per-Capture Check (Coin Collection)

| Operation | Cost |
|-----------|------|
| Get quadrant (bit ops) | ~5 instructions |
| Read controller array | ~10 instructions |
| Comparison | ~2 instructions |
| **Total per capture** | **~17 instructions** |

### Query: `get_quadrant_info`

| Operation | Cost |
|-----------|------|
| Read territory array (cached) | ~160 instructions |
| Read controllers array | ~32 instructions |
| Scan grid for coins | ~262K × 5 = ~1.3M instructions |
| Build response | ~500 instructions |
| **Total per query** | **~1.3M instructions** |

Note: Coin scan still required since coins aren't tracked incrementally (they change less often and tracking would add complexity).

### Comparison: Old vs New Approach

| Metric | Old (Periodic Scan) | New (Incremental) |
|--------|---------------------|-------------------|
| Background overhead | ~2.6M / 10 sec | **Zero** |
| Per ownership change | 0 | ~70 instructions |
| Controller staleness | Up to 10 seconds | **Real-time** |
| Storage | 24 bytes | 656 bytes |

**Net result:** Slightly more work per ownership change, but:
- Zero background overhead
- Real-time controller updates (better UX)
- No 10-second stale window

---

## Edge Cases

### 1. Empty Quadrant
- No controller (controller = 0)
- Coins locked for everyone
- First player to build territory starts accumulating

### 2. Controller Dies (0 cells)
- Still controls quadrant until someone else hits 80%
- Grace period doesn't affect control
- Incentivizes defending even when low on cells

### 3. Tie at 80%
- Impossible (can't both have 80% of 100%)
- First player to achieve 80% wins

### 4. Quadrant Wipe
- Kills all alive cells → all become territory
- Doesn't change ownership
- Territory counts unchanged, controller unchanged

### 5. Player Slot Freed
- Territory remains with that slot number
- If new player joins that slot, they inherit the territory
- Controller status persists

### 6. Multiple Players Near 80%
- Only exact 80%+ threshold matters
- If P1 has 79% and P2 has 21%, no one controls
- Sticky control means if P1 had 80% before and drops to 75%, they still control

### 7. First Deploy (Migration)
- `quadrant_territory` will be empty in stable storage
- `rebuild_quadrant_territory()` runs automatically
- One-time full grid scan on first canister upgrade

---

## Migration Plan

### Deployment Steps

1. **Update Cargo.toml** if needed (no new dependencies)
2. **Deploy backend** with `./deploy.sh`
3. **First upgrade triggers** `rebuild_quadrant_territory()` - one-time grid scan
4. **Verify** - call `get_quadrant_info()` to see current distribution
5. **Initial controllers calculated** based on current territory
6. **Deploy frontend** with new rendering logic

### Rollback Plan

If issues arise:
- Territory and controller arrays are optional in Metadata (serde default)
- Can deploy previous version without data loss
- Coins captured under new rules stay captured (no reversal)

---

## Testing Checklist

### Backend Tests

- [ ] `get_quadrant()` returns correct quadrant for edge cells
- [ ] `update_quadrant_territory()` correctly increments/decrements counts
- [ ] Controller calculated correctly when player hits 80%
- [ ] Sticky control persists when dropping below 80%
- [ ] Control transfers when new player hits 80%
- [ ] Coins collected only when controller captures enemy coins
- [ ] Own coins never collected (even as controller)
- [ ] Coins stay on cell when non-controller captures
- [ ] `rebuild_quadrant_territory()` produces correct counts
- [ ] Stable storage round-trips territory counts and controllers
- [ ] Reset clears all territory counts and controllers
- [ ] `get_quadrant_info()` returns accurate data

### Frontend Tests

- [ ] Coin colors render correctly based on control state
- [ ] Own coins always steel regardless of control
- [ ] Enemy coins gold only when player controls quadrant
- [ ] Quadrant overlay shows controlled regions
- [ ] UI updates immediately when control changes (no lag)
- [ ] Progress toward 80% visible in quadrant panel

### Integration Tests

- [ ] Full gameplay loop: build territory → gain control → collect coins
- [ ] Control transfer during active gameplay
- [ ] Multiple players competing for same quadrant
- [ ] Upgrade preserves game state and calculates controllers

---

## Summary

| Aspect | Details |
|--------|---------|
| **New state** | 656 bytes |
| **Background overhead** | Zero (incremental tracking) |
| **Per-change overhead** | ~70 instructions |
| **Controller updates** | Real-time |
| **Complexity** | Medium |
| **Files modified** | 2 (lib.rs, .did) |
| **Breaking changes** | None (additive to GameState) |
| **Strategic impact** | High - fundamentally changes coin economics |
