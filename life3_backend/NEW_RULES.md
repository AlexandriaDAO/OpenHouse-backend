# Life2 v2 Engineering Specification

512x512 toroidal grid running Conway's Game of Life at 10 generations/second with base-centric territory control.

## Key Changes from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Cell coins | 0-7 coins per cell | No coins on cells |
| Coin storage | Distributed on grid | Centralized in player bases |
| Territory | Anywhere on grid | Must connect orthogonally to base |
| Placement | Anywhere except enemy+coins | Own territory only |
| Control threshold | 80% quadrant control | Removed entirely |
| Player elimination | Slot timeout | Base destroyed (0 coins) |

## Data Representation

**Design Goal**: Minimize storage. Target data-lean representation.

**Cell State**:
- `alive`: bool (1 bit)
- `owner`: 0-9 (4 bits) — 0 = neutral, 1-9 = player slots

**Note**: No coins stored per cell. Consider separating alive grid (bitmap) from territory/owner data (sparse or RLE) for compression.

## Grid

- **Size**: 512 x 512 (262,144 cells)
- **Topology**: Toroidal (wraps both axes)
- **Tick rate**: 10 generations/second

## Conway's Rules (Unchanged)

- **Survival**: Alive cell with 2-3 alive neighbors survives
- **Birth**: Dead cell with exactly 3 alive neighbors becomes alive
- **Death**: All other alive cells die
- **Ownership on birth**: Majority owner among 3 parents wins; ties broken by cell position hash

## Players

- **Max slots**: 9 (slots 1-9) — flexible based on data constraints
- **Join**: Requires 100 coins and placing a base in an unclaimed quadrant
- **Grace period**: 10 minutes with 0 alive cells before slot recycled (only applies if base still exists)
- **Authentication**: Internet Identity required

## Bases

### Structure

```
WWWWWWWW
W......W
W......W
W......W
W......W
W......W
W......W
WWWWWWWW
```

- **Dimensions**: 8x8 total (28 wall positions, 6x6 interior)
- **Walls (W)**: Perimeter positions — special protection zone
- **Interior (.)**: 6x6 starting territory

### Placement

- One base per quadrant maximum (16 quadrants, 9 max players)
- Player chooses any position within an unclaimed quadrant
- Cost: 100 coins from wallet → base
- Interior (6x6) immediately becomes player's territory

### Base Coin Storage

- **Initial**: 100 coins (join cost)
- **Accumulation**: Each cell placed adds 1 coin to base
- **No cap**: Larger kingdoms = more coins = bigger target
- **Depletion**: Siege attacks drain coins (see below)

### Protection Zone (Entire 8x8 Area)

The base acts as a fortress. The entire 8x8 area (walls + interior) is protected:

**Owner's cells**:
- Pass through freely — base has no effect
- Can be born on any position including walls
- Normal Conway rules apply

**Enemy cells**:
- Can NEVER exist anywhere in the 8x8 zone
- If enemy birth would occur in protection zone:
  1. Birth is **prevented** (cell not created)
  2. **1 coin** transfers from base → attacker's wallet
  3. This is the "siege" mechanic

### Base Destruction

When base reaches **0 coins**:
1. Walls fall (base structure removed)
2. Player eliminated
3. All player's cells die
4. All player's territory becomes neutral
5. Player can rejoin with new 100 coins (starts fresh)

## Territory

### Ownership

- **Claiming**: When your alive cell exists at a position, you own that territory
- **Persistence**: Territory ownership persists after cell death
- **Loss**: Territory only lost when:
  - Enemy cell is born there (takes ownership)
  - Territory becomes disconnected from base

### Connection Requirement (NEW)

All territory must maintain **orthogonal (4-way) connection** to the player's base.

**Connected territory**:
- Has at least one orthogonal path of owned territory back to base
- Multiple paths = redundancy (only cut when ALL paths severed)

**Disconnected territory**:
- When last orthogonal path to base is severed:
  1. All disconnected territory becomes **neutral**
  2. All cells in disconnected territory **die**
  3. Happens immediately upon disconnection

**Base interior exception**:
- The 6x6 interior is always connected to itself
- Even if completely surrounded by enemies, player retains interior territory
- This is the "last stand" — player can still place cells and fight back

### Connection Check Algorithm

When a cell changes ownership (enemy birth), check if any of the previous owner's territory is now disconnected:
1. Flood-fill from base using orthogonal adjacency
2. Any owned territory not reached = disconnected
3. Mark disconnected territory as neutral, kill cells

## Placement Rules

Players can place cells subject to:

| Condition | Allowed |
|-----------|---------|
| On own territory (interior) | Yes |
| On own territory (exterior) | Yes |
| On own wall positions | **No** |
| On living cells | No |
| On neutral territory | **No** |
| On enemy territory | No |

- **Cost**: 1 coin per cell (wallet → base)
- **Validation**: All placements atomic (all-or-nothing)
- Cells placed via API follow these rules; cells born via Conway follow Conway rules

## Economy

### Wallet

- **Faucet**: `faucet()` gives 1000 coins (unlimited uses)
- **Spending**: Place cells (1 coin each), place base (100 coins)

### Base Treasury

- **Income**: Coins from cell placement flow here
- **Outflow**: Siege attacks (enemy births on protection zone)
- **Balance at 0**: Player eliminated

### Siege Mechanic

When enemy cell would be born in your 8x8 protection zone:
1. Birth prevented
2. Your base loses 1 coin
3. Attacker's wallet gains 1 coin

This creates attrition warfare — enemies whittle down your defenses without breaching.

## Quadrant Wipe (Unchanged)

- **Interval**: Every 5 minutes
- **Order**: Sequential 0-15, then repeats
- **Effect**: All alive cells in quadrant → dead

**Preserved**:
- Territory ownership
- Bases (walls, coins, structure)
- Cell ownership (just sets alive=false)

**Purpose**: Prevents stagnation, forces competition cycles

## Edge Cases

### Simultaneous Base Destruction
If two players attack each other and both bases hit 0 coins in the same generation:
- Implementation decision: process in deterministic order (e.g., lower slot first)
- Or: both eliminated simultaneously

### Quadrant Wipe on Connection Path
- Wipe kills cells but preserves territory
- Territory connection is about territory positions, not alive cells
- Connection remains intact after wipe

### Completely Surrounded Base
- Player loses all exterior territory (disconnected)
- Retains 6x6 interior territory
- Can place cells in interior to attempt breakout
- Base still protected by siege mechanic

### Birth on Already-Alive Cell
- Standard Conway: birth only on dead cells
- If position is already alive, no birth occurs (no siege trigger either)

## Technical Limits

| Parameter | Value |
|-----------|-------|
| Grid size | 512 x 512 (262,144 cells) |
| Tick rate | 10 generations/second |
| Base size | 8x8 (6x6 interior) |
| Base cost | 100 coins |
| Placement cost | 1 coin |
| Faucet amount | 1000 coins |
| Wipe interval | 5 minutes |
| Slot grace period | 10 minutes |
| Max players | 9 (flexible) |
| Quadrants | 16 (128x128 each) |

## API Summary

### Player Actions
- `join_game(base_x: i32, base_y: i32)` - Place base, join game (requires 100 coins)
- `place_cells(cells: Vec<(i32, i32)>)` - Place cells on own territory (1 coin each → base)
- `faucet()` - Get 1000 free coins to wallet

### Queries
- `get_state()` - Full game state (cells, players, bases, territories)
- `get_slots_info()` - Info on all 9 slots
- `get_base_info(slot: u8)` - Base position, coins, alive status
- `get_territory_info(slot: u8)` - Player's connected territory
- `get_next_wipe()` - Next quadrant + seconds until wipe
- `get_balance()` - Your wallet coin balance

### Removed from v1
- Cell coin storage/queries
- Quadrant controller threshold
- Coin collection on birth (replaced by siege mechanic)
