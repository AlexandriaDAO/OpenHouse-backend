# Life2 Rules

512x512 toroidal grid running Conway's Game of Life at 10 generations/second with multiplayer territory control.

## Core Mechanics

### Cell States
Each cell stores: **owner** (0-9), **alive** (bool), **coins** (0-7)

### Conway's Rules
- **Survival**: Alive cell with 2-3 alive neighbors survives
- **Birth**: Dead cell with exactly 3 alive neighbors becomes alive
- **Death**: All other alive cells die
- **Ownership on birth**: Majority owner among 3 parents wins; ties broken by cell position hash (fair)

## Players

- **Max players**: 9 (slots 1-9)
- **Join**: `join_game()` assigns next available slot, or `join_slot(n)` picks specific slot
- **Grace period**: 10 minutes with 0 alive cells before slot becomes available
- **Authentication**: Internet Identity required (no anonymous play)

## Economy

### Coins
- **Faucet**: `faucet()` gives 1000 coins (unlimited uses)
- **Placement cost**: 1 coin per cell placed
- **Cell coin storage**: Each cell holds 0-7 coins

### Placement Rules
- Cannot place on **living cells**
- Cannot place on cells with **7 coins** (cap)
- Cannot place on **enemy territory with coins**
- All placements validated atomically (all-or-nothing)

## Quadrant Control

Grid divided into 16 quadrants (128x128 each, 4x4 layout).

### Territory
- All owned cells (alive or dead) count as territory
- Territory ownership persists after cell death

### Control Threshold
- **80% of owned territory** in a quadrant = controller
- Control is **sticky** (stays until another player reaches 80%)

### Coin Collection
- When your cell is **born** on enemy territory:
  - If you **control** that quadrant: collect enemy coins to wallet
  - If you **don't control**: coins stay on cell (just ownership changes)

## Quadrant Wipe

- **Every 5 minutes**: One quadrant is wiped (all cells killed)
- **Wipe order**: Sequential 0-15, then repeats
- **Effect**: Kills all alive cells, preserves owner and coins
- **Purpose**: Prevents stagnation, creates competition cycles

## Technical Limits

| Parameter | Value |
|-----------|-------|
| Grid size | 512 x 512 (262,144 cells) |
| Tick rate | 10 generations/second |
| Coin cap per cell | 7 |
| Faucet amount | 1000 coins |
| Wipe interval | 5 minutes |
| Slot grace period | 10 minutes |
| Controller threshold | 80% |

## API Summary

### Player Actions
- `join_game()` - Join next available slot
- `join_slot(slot: u8)` - Join specific slot 1-9
- `place_cells(cells: Vec<(i32, i32)>)` - Place cells (1 coin each)
- `faucet()` - Get 1000 free coins

### Queries
- `get_state()` - Full game state (cells, players, balances, quadrant controllers)
- `get_slots_info()` - Info on all 9 slots
- `get_quadrant_info()` - Territory/coins per quadrant
- `get_next_wipe()` - Next quadrant + seconds until wipe
- `get_balance()` - Your coin balance
