# Life2 v2 Backend Pseudocode

YAML-style pseudocode with cycle cost estimates for the optimized bitmap-based implementation.

---

## Design Goals

- **Target**: <1T cycles/day (vs ~6T in v1)
- **Strategy**: Pure bitmap representation, sparse territory, batch processing
- **Players**: 8 max (slots 0-7)

---

## Data Representation

### Memory Layout Overview

```yaml
hot_path:                           # Accessed every generation (10×/sec)
  ALIVE: [u64; 4096]                # 32 KB - alive/dead bitmap
  POTENTIAL: [u64; 4096]            # 32 KB - cells to check this gen
  NEXT_POTENTIAL: [u64; 4096]       # 32 KB - cells to check next gen
  subtotal: 96 KB

warm_path:                          # Accessed on births, place_cells
  TERRITORY: [PlayerTerritory; 8]   # ~16 KB - per-player sparse bitmaps
  subtotal: ~16 KB

cold_path:                          # Rarely accessed
  PLAYERS: [Option<Principal>; 8]   # ~250 bytes
  BASES: [Option<Base>; 8]          # ~100 bytes
  WALLETS: HashMap<Principal, u64>  # ~300 bytes
  ZERO_CELLS_SINCE: [Option<u64>; 8] # ~130 bytes
  GAME_STATE: { generation, running, wipe_quadrant, last_wipe }  # ~18 bytes
  subtotal: ~800 bytes

total_heap: ~113 KB                 # vs 321 KB in v1 (2.8× smaller)
```

---

### 1. ALIVE Bitmap

```yaml
ALIVE:
  rust_type: "[u64; 4096]"
  size: 32_768 bytes (32 KB)
  location: heap
  encoding: 1 bit per cell, row-major order

  layout:
    grid: 512 × 512 = 262_144 cells
    words_per_row: 8                # 512 cells / 64 bits = 8 words
    total_words: 4_096              # 512 rows × 8 words

    row_0:   [word[0], word[1], word[2], ..., word[7]]
    row_1:   [word[8], word[9], word[10], ..., word[15]]
    row_y:   [word[y*8], word[y*8+1], ..., word[y*8+7]]
    row_511: [word[4088], word[4089], ..., word[4095]]

  word_layout:
    # Each u64 holds 64 consecutive cells
    # Bit 0 = leftmost cell, Bit 63 = rightmost cell
    word[0]: |
      bit 63  62  61  ...  3   2   1   0
          │   │   │       │   │   │   └── cell (0, 0)
          │   │   │       │   │   └────── cell (1, 0)
          │   │   │       │   └────────── cell (2, 0)
          │   │   │       └────────────── cell (3, 0)
          │   │   └────────────────────── cell (61, 0)
          │   └────────────────────────── cell (62, 0)
          └────────────────────────────── cell (63, 0)

  access:
    formula: |
      idx = y * 512 + x
      word_idx = idx >> 6           # idx / 64
      bit_pos = idx & 63            # idx % 64
      alive = (ALIVE[word_idx] >> bit_pos) & 1

    example:
      cell: (130, 5)
      idx: 5 * 512 + 130 = 2690
      word_idx: 2690 >> 6 = 42
      bit_pos: 2690 & 63 = 2
      check: (ALIVE[42] >> 2) & 1

    cycles: ~12 cycles per lookup
```

---

### 2. POTENTIAL & NEXT_POTENTIAL Bitmaps

```yaml
POTENTIAL:
  rust_type: "[u64; 4096]"
  size: 32_768 bytes (32 KB)
  location: heap
  encoding: same as ALIVE

  purpose: |
    Marks cells that MIGHT change this generation.
    A cell can only change if it has at least one alive neighbor.

    Set bits include:
    - Every alive cell
    - Every neighbor of an alive cell (8 directions)

    If a cell's bit is 0 in POTENTIAL, skip it entirely.
    This skips 80-95% of the grid!

NEXT_POTENTIAL:
  rust_type: "[u64; 4096]"
  size: 32_768 bytes (32 KB)
  location: heap
  encoding: same as ALIVE

  purpose: |
    Built during generation processing.
    After generation completes: swap(POTENTIAL, NEXT_POTENTIAL)
    Then clear NEXT_POTENTIAL for next generation.

workflow:
  per_generation:
    1: iterate set bits in POTENTIAL
    2: compute fate of each marked cell
    3: for survivors/births, mark cell + neighbors in NEXT_POTENTIAL
    4: swap(POTENTIAL, NEXT_POTENTIAL)
    5: clear NEXT_POTENTIAL (memset 0)
```

---

### 3. TERRITORY - Per-Player Sparse Bitmaps

```yaml
PlayerTerritory:
  rust_type: |
    struct PlayerTerritory {
        chunk_mask: u64,           // Which chunks have data (64 bits = 64 chunks)
        chunks: Vec<[u64; 64]>,    // Only non-empty chunks stored
    }

TERRITORY:
  rust_type: "[PlayerTerritory; 8]"
  size: ~16 KB typical (variable based on territory)
  location: heap

  chunk_system:
    grid_division: 8 × 8 = 64 chunks
    chunk_size: 64 × 64 = 4096 cells
    chunk_storage: 64 words × 8 bytes = 512 bytes per chunk

    layout: |
      ┌────┬────┬────┬────┬────┬────┬────┬────┐
      │ 0  │ 1  │ 2  │ 3  │ 4  │ 5  │ 6  │ 7  │
      ├────┼────┼────┼────┼────┼────┼────┼────┤
      │ 8  │ 9  │ 10 │ 11 │ 12 │ 13 │ 14 │ 15 │
      ├────┼────┼────┼────┼────┼────┼────┼────┤
      │ 16 │ 17 │ 18 │ 19 │ 20 │ 21 │ 22 │ 23 │
      ├────┼────┼────┼────┼────┼────┼────┼────┤
      │ 24 │ 25 │ 26 │ 27 │ 28 │ 29 │ 30 │ 31 │
      ├────┼────┼────┼────┼────┼────┼────┼────┤
      │ 32 │ 33 │ 34 │ 35 │ 36 │ 37 │ 38 │ 39 │
      ├────┼────┼────┼────┼────┼────┼────┼────┤
      │ 40 │ 41 │ 42 │ 43 │ 44 │ 45 │ 46 │ 47 │
      ├────┼────┼────┼────┼────┼────┼────┼────┤
      │ 48 │ 49 │ 50 │ 51 │ 52 │ 53 │ 54 │ 55 │
      ├────┼────┼────┼────┼────┼────┼────┼────┤
      │ 56 │ 57 │ 58 │ 59 │ 60 │ 61 │ 62 │ 63 │
      └────┴────┴────┴────┴────┴────┴────┴────┘

  chunk_mask:
    description: |
      64-bit mask where bit i = 1 means chunk i has territory data.
      Chunks with all zeros are NOT stored in the Vec.

    example: |
      Player owns territory in chunks 9, 10, 17:
      chunk_mask = 0b...0000_0010_0000_0110_0000_0000
                              │         ││
                              │         │└── chunk 9
                              │         └─── chunk 10
                              └───────────── chunk 17

      chunks.len() = 3
      chunks[0] → data for chunk 9
      chunks[1] → data for chunk 10
      chunks[2] → data for chunk 17

  access:
    formula: |
      fn player_owns(player: usize, x: u16, y: u16) -> bool {
          let chunk_x = (x / 64) as usize;
          let chunk_y = (y / 64) as usize;
          let chunk_idx = chunk_y * 8 + chunk_x;

          // Check if chunk exists
          if (TERRITORY[player].chunk_mask >> chunk_idx) & 1 == 0 {
              return false;  // Empty chunk = not owned
          }

          // Find vec index via popcount
          let vec_idx = (TERRITORY[player].chunk_mask & ((1 << chunk_idx) - 1)).count_ones();

          // Check bit within chunk
          let local_x = (x % 64) as usize;
          let local_y = (y % 64) as usize;
          (TERRITORY[player].chunks[vec_idx][local_y] >> local_x) & 1 == 1
      }

    cycles: ~25 cycles (chunk check + popcount + bit check)

  find_owner:
    description: "Find which player (if any) owns cell (x, y)"
    formula: |
      fn find_owner(x: u16, y: u16) -> Option<usize> {
          for player in 0..8 {
              if player_owns(player, x, y) {
                  return Some(player);
              }
          }
          None
      }

    cycles: ~100 cycles worst case (check all 8 players)
    average: ~50 cycles (early exit when found)

  storage_efficiency:
    example_3_chunks:
      chunk_mask: 8 bytes
      chunks: 3 × 512 bytes = 1536 bytes
      total: 1544 bytes per player

    typical_game:
      players: 8
      avg_chunks_per_player: 3
      total: 8 × 1.5 KB = 12 KB

    vs_dense:
      dense_per_player: 32 KB (full bitmap)
      dense_total: 256 KB
      savings: 21× for sparse representation
```

---

### 4. BASES - Player Fortresses

```yaml
Base:
  rust_type: |
    struct Base {
        x: u16,       // Top-left X coordinate
        y: u16,       // Top-left Y coordinate
        coins: u64,   // Treasury (0 = eliminated)
    }
  size: 12 bytes per base

BASES:
  rust_type: "[Option<Base>; 8]"
  size: ~100 bytes total
  location: heap

  structure:
    dimensions: 8 × 8 total
    walls: perimeter (28 positions)
    interior: 6 × 6 (36 positions)

    layout: |
      WWWWWWWW    W = Wall (protection zone, no placement)
      W......W    . = Interior (starting territory)
      W......W
      W......W
      W......W
      W......W
      W......W
      WWWWWWWW

  coordinate_system:
    base_at: (x=100, y=200)
    walls: |
      Row 200: (100,200) to (107,200)  ← top wall
      Row 207: (100,207) to (107,207)  ← bottom wall
      Col 100: (100,200) to (100,207)  ← left wall
      Col 107: (107,200) to (107,207)  ← right wall
    interior: |
      (101,201) to (106,206)  ← 6×6 starting territory

  checks:
    is_in_base: |
      fn is_in_base(base: &Base, x: u16, y: u16) -> bool {
          let dx = x.wrapping_sub(base.x);
          let dy = y.wrapping_sub(base.y);
          dx < 8 && dy < 8
      }

    is_wall: |
      fn is_wall(base: &Base, x: u16, y: u16) -> bool {
          let dx = x.wrapping_sub(base.x);
          let dy = y.wrapping_sub(base.y);
          dx < 8 && dy < 8 && (dx == 0 || dx == 7 || dy == 0 || dy == 7)
      }

    is_interior: |
      fn is_interior(base: &Base, x: u16, y: u16) -> bool {
          let dx = x.wrapping_sub(base.x);
          let dy = y.wrapping_sub(base.y);
          dx >= 1 && dx <= 6 && dy >= 1 && dy <= 6
      }

    find_protection_zone: |
      fn in_protection_zone(x: u16, y: u16) -> Option<usize> {
          for (i, base_opt) in BASES.iter().enumerate() {
              if let Some(base) = base_opt {
                  if is_in_base(base, x, y) {
                      return Some(i);
                  }
              }
          }
          None
      }

    cycles: ~50 cycles to check all 8 bases
```

---

### 5. PLAYERS & WALLETS

```yaml
PLAYERS:
  rust_type: "[Option<Principal>; 8]"
  size: ~250 bytes
  location: heap

  description: |
    Maps slot index (0-7) to the Principal who owns it.
    None = slot is empty/available.

WALLETS:
  rust_type: "HashMap<Principal, u64>"
  size: ~300 bytes (≤8 entries)
  location: heap

  description: |
    Coin balance for each player's wallet.
    Separate from base treasury.
    Source: faucet(), siege rewards
    Sink: place_cells() cost, join_game() base cost

ZERO_CELLS_SINCE:
  rust_type: "[Option<u64>; 8]"
  size: ~130 bytes
  location: heap

  description: |
    Timestamp (nanoseconds) when player hit 0 alive cells.
    After 10 minutes (600_000_000_000 ns), slot can be reclaimed.
    None = player has alive cells (not in grace period).

CELL_COUNTS:
  rust_type: "[u32; 8]"
  size: 32 bytes
  location: heap

  description: |
    Per-player count of alive cells. Maintained incrementally
    to avoid expensive bitmap scans.

  update_points:
    step_generation_births: "CELL_COUNTS[new_owner] += 1"
    step_generation_deaths: "CELL_COUNTS[owner] -= 1"
    place_cells: "CELL_COUNTS[slot] += cells.len()"
    apply_disconnection: "CELL_COUNTS[player] -= 1 per killed cell"
    eliminate_player: "CELL_COUNTS[player] = 0"
    quadrant_wipe: "CELL_COUNTS[owner] -= 1 per killed cell"

  grace_period_trigger:
    condition: "CELL_COUNTS[player] == 0 && BASES[player].is_some()"
    action: "ZERO_CELLS_SINCE[player] = Some(ic_cdk::api::time())"
    check_location: "End of step_generation, after all deaths processed"
```

---

### 6. GAME STATE

```yaml
game_state:
  GENERATION: u64           # Current generation number
  IS_RUNNING: bool          # Game paused?
  NEXT_WIPE_QUADRANT: u8    # 0-15, which quadrant wipes next
  LAST_WIPE_NS: u64         # Timestamp of last wipe

  size: 18 bytes
  location: heap
```

---

## Helper Functions

Reusable utility functions used throughout the codebase.

### Bitmap Helpers

```yaml
bitmap_helpers:

  is_alive:
    signature: "fn is_alive(x: u16, y: u16) -> bool"
    algorithm: |
      let idx = (y as usize) << 9 | (x as usize);
      let word_idx = idx >> 6;
      let bit_pos = idx & 63;
      (ALIVE[word_idx] >> bit_pos) & 1 == 1
    cycles: ~12

  is_alive_idx:
    signature: "fn is_alive_idx(idx: usize) -> bool"
    algorithm: "(ALIVE[idx >> 6] >> (idx & 63)) & 1 == 1"
    cycles: ~8

  set_alive:
    signature: "fn set_alive(x: u16, y: u16)"
    algorithm: |
      let idx = (y as usize) << 9 | (x as usize);
      let word_idx = idx >> 6;
      let bit_pos = idx & 63;
      ALIVE[word_idx] |= 1u64 << bit_pos;
    cycles: ~12

  clear_alive_idx:
    signature: "fn clear_alive_idx(idx: usize)"
    algorithm: "ALIVE[idx >> 6] &= !(1u64 << (idx & 63));"
    cycles: ~8
```

---

### Coordinate Helpers

```yaml
coordinate_helpers:

  coords_to_idx:
    signature: "fn coords_to_idx(x: u16, y: u16) -> usize"
    formula: "(y as usize) << 9 | (x as usize)"
    inline: true
    cycles: ~3

  idx_to_coords:
    signature: "fn idx_to_coords(idx: usize) -> (u16, u16)"
    formula: "((idx & 511) as u16, (idx >> 9) as u16)"  # (x, y)
    inline: true
    cycles: ~3

  orthogonal_neighbors:
    signature: "fn orthogonal_neighbors(x: u16, y: u16) -> [(u16, u16); 4]"
    algorithm: |
      [
          ((x.wrapping_sub(1)) & 511, y),  // West
          ((x.wrapping_add(1)) & 511, y),  // East
          (x, (y.wrapping_sub(1)) & 511),  // North
          (x, (y.wrapping_add(1)) & 511),  // South
      ]
    cycles: ~16

  popcount_below:
    signature: "fn popcount_below(mask: u64, idx: usize) -> usize"
    purpose: "Count set bits below position idx (for sparse vec indexing)"
    algorithm: "(mask & ((1u64 << idx) - 1)).count_ones() as usize"
    cycles: ~5
```

---

### Quadrant Helpers

```yaml
quadrant_helpers:

  get_quadrant:
    signature: "fn get_quadrant(x: u16, y: u16) -> u8"
    formula: "((y >> 7) * 4 + (x >> 7)) as u8"
    returns: "0-15"
    cycles: ~5

  quadrant_bounds:
    signature: "fn quadrant_bounds(q: u8) -> (u16, u16, u16, u16)"
    formula: |
      let qx = (q % 4) as u16;
      let qy = (q / 4) as u16;
      (qx * 128, qy * 128, 128, 128)  // (x_start, y_start, width, height)
    cycles: ~8

  quadrant_has_base:
    signature: "fn quadrant_has_base(q: u8) -> bool"
    algorithm: |
      for base_opt in BASES.iter() {
          if let Some(base) = base_opt {
              if get_quadrant(base.x, base.y) == q {
                  return true;
              }
          }
      }
      false
    cycles: ~40 (check up to 8 bases)
```

---

### Player Helpers

```yaml
player_helpers:

  find_player_slot:
    signature: "fn find_player_slot(caller: Principal) -> Option<usize>"
    algorithm: "PLAYERS.iter().position(|p| p == &Some(caller))"
    cycles: ~30 (check up to 8 slots)
```

---

### Territory Management

```yaml
territory_management:

  set_territory:
    signature: "fn set_territory(player: usize, x: u16, y: u16)"
    purpose: "Add cell to player's sparse territory bitmap"

    algorithm: |
      let chunk_x = (x >> 6) as usize;
      let chunk_y = (y >> 6) as usize;
      let chunk_idx = chunk_y * 8 + chunk_x;

      let territory = &mut TERRITORY[player];

      // Check if chunk exists
      if (territory.chunk_mask >> chunk_idx) & 1 == 0 {
          // Allocate new chunk
          let insert_pos = popcount_below(territory.chunk_mask, chunk_idx);
          territory.chunks.insert(insert_pos, [0u64; 64]);
          territory.chunk_mask |= 1u64 << chunk_idx;
      }

      // Find vec index and set bit
      let vec_idx = popcount_below(territory.chunk_mask, chunk_idx);
      let local_x = (x & 63) as usize;
      let local_y = (y & 63) as usize;
      territory.chunks[vec_idx][local_y] |= 1u64 << local_x;

    cycles: ~40 (chunk exists), ~200 (new chunk allocation)

  clear_territory:
    note: "See apply_disconnection in Disconnection Algorithm section"
    reference: "Phase 5: Apply Disconnection"
```

---

## Constants

```yaml
constants:
  # Grid
  GRID_SIZE: 512
  TOTAL_CELLS: 262_144           # 512 × 512
  WORDS_PER_ROW: 8               # 512 / 64
  TOTAL_WORDS: 4_096             # 512 × 8

  # Chunks (for territory)
  CHUNK_SIZE: 64                 # 64×64 cells per chunk
  CHUNKS_PER_ROW: 8              # 512 / 64
  TOTAL_CHUNKS: 64               # 8 × 8

  # Quadrants (for wipe)
  QUADRANT_SIZE: 128             # 128×128 cells per quadrant
  QUADRANTS_PER_ROW: 4           # 512 / 128
  TOTAL_QUADRANTS: 16            # 4 × 4

  # Players
  MAX_PLAYERS: 8

  # Economy
  FAUCET_AMOUNT: 1000
  BASE_COST: 100
  PLACEMENT_COST: 1              # Per cell
  MAX_PLACE_CELLS: 1000          # Prevent instruction limit overflow

  # Timing
  GENERATIONS_PER_TICK: 10
  TICK_INTERVAL_MS: 1000
  WIPE_INTERVAL_NS: 300_000_000_000    # 5 minutes
  GRACE_PERIOD_NS: 600_000_000_000     # 10 minutes

  # Base
  BASE_SIZE: 8                   # 8×8 total
  BASE_INTERIOR: 6               # 6×6 interior
```

---

## Cycle Cost Reference

```yaml
base_costs:
  update_call_overhead: 590_000
  query_call_overhead: 400_000
  instruction: 0.4               # cycles per Wasm instruction

bit_operations:
  word_read: 8                   # Read u64 from array
  word_write: 8                  # Write u64 to array
  bit_extract: 4                 # (word >> pos) & 1
  bit_set: 6                     # word |= (1 << pos)
  bit_clear: 6                   # word &= !(1 << pos)
  popcount: 3                    # count_ones()
  leading_zeros: 3               # leading_zeros()
  trailing_zeros: 3              # trailing_zeros()

chunk_operations:
  chunk_mask_check: 8            # (mask >> idx) & 1
  vec_index_calc: 15             # popcount for vec index
  chunk_word_read: 8             # Read word from chunk

neighbor_computation:
  interior_cell: 16              # 8 simple additions
  edge_cell: 80                  # Full wrap computation
```

---

## Step Generation Algorithm (Core Optimization)

The key to 10x+ efficiency: **batch process entire words instead of individual cells**.

### Overview

```yaml
step_generation:
  algorithm: batched word-at-a-time processing

  key_insight: |
    Instead of processing each potential cell independently,
    process all cells in a POTENTIAL word together.

    This amortizes memory reads across up to 64 cells.

  v1_approach:
    for each bit in POTENTIAL:
      compute 8 neighbor indices          # 80 cycles
      read 8 neighbor bytes               # 80 cycles
      count alive, track owners           # 90 cycles
    total: ~250 cycles per cell

  v2_approach:
    for each non-zero WORD in POTENTIAL:
      load 3 row words (above, same, below)   # 24 cycles ONCE
      for each set bit in word:
        extract 8 neighbors via bit shifts    # 26 cycles
        count alive                           # 10 cycles
        (owner lookup only for births)        # ~10 cycles amortized
    total: ~50 cycles per cell
```

---

### Batched Processing Algorithm

```yaml
step_generation_batched:

  phase_1_compute_fates:
    description: "Read-only pass - determine what changes"

    outputs:
      births: Vec<(cell_idx, new_owner)>
      deaths: Vec<cell_idx>
      survivors: Vec<cell_idx>

    algorithm: |
      for word_idx in 0..4096:
          potential_word = POTENTIAL[word_idx]
          if potential_word == 0:
              continue  # Skip empty words entirely

          # Compute row index
          row = word_idx / 8
          col_base = (word_idx % 8) * 64

          # Load the 3 row words we need (ONCE per potential word)
          # Handle edge cases for row 0 and row 511
          row_above = if row > 0 { ALIVE[word_idx - 8] } else { ALIVE[word_idx + 4088] }  # wrap
          row_same  = ALIVE[word_idx]
          row_below = if row < 511 { ALIVE[word_idx + 8] } else { ALIVE[word_idx - 4088] }  # wrap

          # Also need adjacent words for cells at bit 0 and bit 63
          # (neighbors wrap to adjacent word)
          left_above  = ALIVE[wrap_word_left(word_idx - 8)]
          left_same   = ALIVE[wrap_word_left(word_idx)]
          left_below  = ALIVE[wrap_word_left(word_idx + 8)]
          right_above = ALIVE[wrap_word_right(word_idx - 8)]
          right_same  = ALIVE[wrap_word_right(word_idx)]
          right_below = ALIVE[wrap_word_right(word_idx + 8)]

          # Process each set bit in the potential word
          while potential_word != 0:
              bit_pos = potential_word.trailing_zeros()
              potential_word &= potential_word - 1  # Clear lowest bit

              cell_idx = word_idx * 64 + bit_pos
              fate = compute_cell_fate_batched(bit_pos, row_above, row_same, row_below, ...)

              match fate:
                  Survives => survivors.push(cell_idx)
                  Birth(owner) => births.push((cell_idx, owner))
                  Death => deaths.push(cell_idx)
                  StaysDead => ()  # No action needed

  compute_cell_fate_batched:
    description: "Compute fate using pre-loaded words"

    inputs:
      bit_pos: 0-63 (position within word)
      row_above, row_same, row_below: u64 (pre-loaded)
      left_*, right_*: u64 (for edge bits)

    algorithm: |
      # Current cell's alive status
      currently_alive = (row_same >> bit_pos) & 1

      # Count alive neighbors using bit extraction
      # For interior bits (1-62), all neighbors are in the 3 main words
      # For edge bits (0, 63), need to check adjacent words

      if bit_pos == 0:
          # Left neighbors come from left_* words (bit 63)
          nw = (left_above >> 63) & 1
          w  = (left_same >> 63) & 1
          sw = (left_below >> 63) & 1
          n  = (row_above >> 0) & 1
          s  = (row_below >> 0) & 1
          ne = (row_above >> 1) & 1
          e  = (row_same >> 1) & 1
          se = (row_below >> 1) & 1

      else if bit_pos == 63:
          # Right neighbors come from right_* words (bit 0)
          nw = (row_above >> 62) & 1
          w  = (row_same >> 62) & 1
          sw = (row_below >> 62) & 1
          n  = (row_above >> 63) & 1
          s  = (row_below >> 63) & 1
          ne = (right_above >> 0) & 1
          e  = (right_same >> 0) & 1
          se = (right_below >> 0) & 1

      else:
          # Interior cell - all neighbors in main 3 words
          nw = (row_above >> (bit_pos - 1)) & 1
          n  = (row_above >> bit_pos) & 1
          ne = (row_above >> (bit_pos + 1)) & 1
          w  = (row_same >> (bit_pos - 1)) & 1
          e  = (row_same >> (bit_pos + 1)) & 1
          sw = (row_below >> (bit_pos - 1)) & 1
          s  = (row_below >> bit_pos) & 1
          se = (row_below >> (bit_pos + 1)) & 1

      alive_count = nw + n + ne + w + e + sw + s + se

      # Conway's rules
      match (currently_alive, alive_count):
          (true, 2) | (true, 3) => Survives
          (false, 3) => Birth(find_majority_owner(...))
          (true, _) => Death
          (false, _) => StaysDead

    cycles_interior: ~40 cycles (8 bit extractions + additions + match)
    cycles_edge: ~50 cycles (extra word references)

  find_majority_owner:
    description: "For births, find owner with most parents among 3 alive neighbors"

    algorithm: |
      # Only called for births (exactly 3 alive neighbors)
      # Need to find owner of each alive neighbor

      owner_counts = [0u8; 8]  # Count per player
      alive_neighbor_positions = [positions of the 3 alive neighbors]

      for pos in alive_neighbor_positions:
          owner = find_owner(pos.x, pos.y)  # Check all 8 player bitmaps
          if let Some(p) = owner:
              owner_counts[p] += 1

      # Find max (with tie-breaking by cell index hash)
      max_count = owner_counts.iter().max()
      candidates = players where count == max_count

      if candidates.len() == 1:
          return candidates[0]
      else:
          # Tie-break: use cell index mod number of tied players
          return candidates[cell_idx % candidates.len()]

    cycles: ~120 cycles (3 owner lookups × ~40 cycles each)
    note: "Only called for ~10% of changes (births)"

  phase_2_apply_changes:
    description: "Write pass - apply computed changes to grid"

    algorithm: |
      # Clear NEXT_POTENTIAL
      NEXT_POTENTIAL.fill(0)  # 4096 × 8 bytes = 32KB memset

      # Apply deaths (just clear alive bit)
      for cell_idx in deaths:
          word_idx = cell_idx >> 6
          bit_pos = cell_idx & 63
          ALIVE[word_idx] &= !(1 << bit_pos)

          # Mark neighbors in NEXT_POTENTIAL
          mark_neighbors_potential(cell_idx)

      # Apply births (set alive bit + handle territory/siege)
      for (cell_idx, new_owner) in births:
          word_idx = cell_idx >> 6
          bit_pos = cell_idx & 63

          # Check siege mechanic first
          (x, y) = idx_to_coords(cell_idx)
          if let Some(base_owner) = in_protection_zone(x, y):
              if base_owner != new_owner:
                  # SIEGE! Birth prevented, transfer 1 coin
                  BASES[base_owner].coins -= 1
                  WALLETS[PLAYERS[new_owner]] += 1

                  # Check for base destruction
                  if BASES[base_owner].coins == 0:
                      eliminate_player(base_owner)
                  continue  # Birth prevented

          # Normal birth
          ALIVE[word_idx] |= 1 << bit_pos

          # Update territory ownership
          set_territory(new_owner, x, y)

          # Check for disconnection of previous owner
          if let Some(old_owner) = find_owner(x, y):
              if old_owner != new_owner:
                  check_disconnection(old_owner)

          # Mark self + neighbors in NEXT_POTENTIAL
          mark_with_neighbors_potential(cell_idx)

      # Apply survivors (just mark in NEXT_POTENTIAL)
      for cell_idx in survivors:
          mark_with_neighbors_potential(cell_idx)

      # Swap potential buffers
      swap(POTENTIAL, NEXT_POTENTIAL)

      # Increment generation
      GENERATION += 1

    cycles_per_death: ~100 cycles
    cycles_per_birth: ~200 cycles (with territory update)
    cycles_per_survivor: ~50 cycles
```

---

### Edge Wrapping Helper

```yaml
wrap_word_left:
  description: "Get word index for left neighbor (handles column wrap)"

  algorithm: |
    fn wrap_word_left(word_idx: usize) -> usize {
        let row = word_idx / 8
        let col = word_idx % 8
        if col == 0 {
            row * 8 + 7  # Wrap to rightmost word in same row
        } else {
            word_idx - 1
        }
    }

wrap_word_right:
  description: "Get word index for right neighbor (handles column wrap)"

  algorithm: |
    fn wrap_word_right(word_idx: usize) -> usize {
        let row = word_idx / 8
        let col = word_idx % 8
        if col == 7 {
            row * 8  # Wrap to leftmost word in same row
        } else {
            word_idx + 1
        }
    }
```

---

### Mark Neighbors in Potential

```yaml
mark_with_neighbors_potential:
  description: "Set bit for cell AND all 8 neighbors in NEXT_POTENTIAL"

  algorithm: |
    fn mark_with_neighbors_potential(cell_idx: usize) {
        let (x, y) = idx_to_coords(cell_idx)

        # Mark the cell itself
        set_potential_bit(cell_idx)

        # Mark all 8 neighbors (with wrapping)
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                if dx == 0 && dy == 0: continue
                let nx = (x as i32 + dx).rem_euclid(512) as u16
                let ny = (y as i32 + dy).rem_euclid(512) as u16
                set_potential_bit(coords_to_idx(nx, ny))
    }

  cycles: ~90 cycles (9 bit sets with coordinate math)

  optimization: |
    Can batch the bit sets if neighbors are in same word.
    For interior cells, neighbors span at most 6 words.
    Could OR together bits and do 6 word writes instead of 9 bit sets.
```

---

### Cycle Cost Comparison

```yaml
cost_comparison:

  v1_per_generation:
    assumptions:
      fill_rate: 10%
      alive_cells: 26_214
      potential_cells: 65_535        # 2.5× alive
      changes: 3_932                 # 15% of alive

    computation:
      per_potential_cell: 250 cycles
      potential_total: 65_535 × 250 = 16_383_750 cycles

      per_change: 300 cycles
      changes_total: 3_932 × 300 = 1_179_600 cycles

      overhead: 50_000 cycles        # Clear NEXT_POTENTIAL, bookkeeping

    total: 17_613_350 cycles (~17.6M)

  v2_per_generation:
    assumptions:
      fill_rate: 5%                  # Sparser due to disconnection kills
      alive_cells: 13_107
      potential_cells: 20_000        # 1.5× alive (more compact patterns)
      changes: 2_000                 # 15% of alive
      births: 400                    # ~20% of changes

    computation:
      # Phase 1: Compute fates (batched)
      non_zero_potential_words: ~1_500  # 20K cells / ~13 cells per active word
      word_setup_cost: 24 cycles        # Load 3 row words
      word_setup_total: 1_500 × 24 = 36_000 cycles

      per_potential_cell: 50 cycles     # Batched bit extraction
      potential_total: 20_000 × 50 = 1_000_000 cycles

      birth_owner_lookup: 400 × 120 = 48_000 cycles

      phase_1_total: 1_084_000 cycles (~1.1M)

      # Phase 2: Apply changes
      clear_next_potential: 35_000 cycles
      deaths: 800 × 100 = 80_000 cycles
      births: 400 × 200 = 80_000 cycles
      survivors: 12_307 × 50 = 615_350 cycles

      phase_2_total: 810_350 cycles (~0.8M)

    total: 1_894_350 cycles (~1.9M)

  improvement:
    v1_per_gen: 17.6M cycles
    v2_per_gen: 1.9M cycles
    ratio: 9.3× faster

  daily_projection:
    generations_per_day: 864_000     # 10/sec × 86400 sec

    v1_daily: 17.6M × 864K = 15.2T cycles
    v2_daily: 1.9M × 864K = 1.64T cycles

    note: |
      v1 estimate here is higher than original doc's 6T because
      we're being more conservative. Actual savings depend on
      real-world fill rates and patterns.

    with_optimistic_fill:
      # If fill stays at 3% average due to aggressive disconnection
      v2_daily: ~0.8T cycles  ✓ Under 1T target!
```

---

### Optimization Opportunities

```yaml
further_optimizations:

  1_popcount_neighbor_counting:
    description: "Use popcount to count alive neighbors in parallel"
    current: "8 individual bit extractions and additions"
    optimized: |
      # Create a mask for the 8 neighbor positions, then popcount
      # Works for interior cells where neighbors are contiguous
      neighbor_mask = 0b111_0_111  # Positions relative to center
      shifted_above = row_above >> (bit_pos - 1)
      shifted_same = row_same >> (bit_pos - 1)
      shifted_below = row_below >> (bit_pos - 1)

      alive_count = (shifted_above & 0b111).count_ones()
                  + (shifted_same & 0b101).count_ones()  # Exclude center
                  + (shifted_below & 0b111).count_ones()
    savings: "~10 cycles per cell"

  2_batch_potential_marking:
    description: "Mark neighbors using word-level OR operations"
    current: "9 individual bit sets per survivor/birth"
    optimized: |
      # For interior cells, neighbors span at most 6 words
      # Compute the 6 masks and OR them in one go
    savings: "~30 cycles per change"

  3_skip_stable_regions:
    description: "Track regions that haven't changed for N generations"
    implementation: |
      # Add STABLE bitmap - regions where nothing changed last gen
      # Skip POTENTIAL bits that are in stable regions
      # Reset stability when cell placed or birth/death occurs nearby
    savings: "Could skip 20-50% of potential cells in steady state"

  4_simd_style_processing:
    description: "Process multiple potential words in parallel"
    implementation: |
      # Wasm doesn't have true SIMD, but can use 128-bit operations
      # Or process 2-4 words with interleaved computation
    savings: "Architecture dependent, maybe 1.5-2× for hot loop"
```

---

## Disconnection Algorithm

The most complex new mechanic in v2. When territory is taken, remaining territory that loses its path to the base becomes neutral and all cells there die.

### Design Principles

```yaml
design_goals:
  1_fast_rejection: |
    90%+ of births don't cause disconnection.
    Reject these in <50 cycles.

  2_early_termination: |
    When BFS is needed, stop as soon as we prove
    all affected neighbors are still connected.

  3_zero_allocation: |
    Pre-allocate workspace. No heap allocation in hot path.

  4_chunk_aware: |
    Skip entire chunks known to be empty.

key_insight: |
  Disconnection can ONLY occur when a cell is taken from player P
  AND that cell had orthogonal neighbors belonging to P.

  If the lost cell had no P neighbors, nothing was connected through it.
  This single check eliminates most disconnection processing.
```

---

### BFS Workspace (Pre-allocated)

```yaml
BFSWorkspace:
  purpose: |
    Reusable workspace for disconnection BFS.
    Allocated once at canister init, reused for all checks.
    Zero allocation during gameplay.

  rust_type: |
    struct BFSWorkspace {
        visited: [u64; 4096],      // 32 KB - dense bitmap
        touched_words: Vec<u16>,   // Track which words need clearing (max ~500)
        queue: Vec<u32>,           // BFS queue - cell indices (max ~5000)
    }

  size: 32 KB + ~12 KB reserved for vecs = ~44 KB

  why_dense_visited: |
    Sparse territory bitmaps cost ~25 cycles per lookup (chunk check + popcount + bit).
    Dense bitmap costs ~12 cycles per lookup (direct index + bit).

    BFS visits thousands of cells → 2× faster with dense.

    Trade-off: 32KB memory for 2× speed in hot path.

  initialization: |
    fn init_workspace() -> BFSWorkspace {
        BFSWorkspace {
            visited: [0u64; 4096],
            touched_words: Vec::with_capacity(512),
            queue: Vec::with_capacity(5000),
        }
    }

  clear_method: |
    fn clear(&mut self) {
        // Only clear words that were actually touched
        for &word_idx in &self.touched_words {
            self.visited[word_idx as usize] = 0;
        }
        self.touched_words.clear();
        self.queue.clear();
    }

  clear_cost: |
    typical: 50-200 touched words × 8 cycles = 400-1600 cycles
    worst_case: 500 words × 8 cycles = 4000 cycles
    vs full clear: 4096 words × 8 cycles = 32,768 cycles

  mark_visited: |
    fn mark_visited(&mut self, x: u16, y: u16) -> bool {
        let idx = (y as usize) << 9 | (x as usize);  // y * 512 + x
        let word_idx = idx >> 6;
        let bit_pos = idx & 63;

        let was_visited = (self.visited[word_idx] >> bit_pos) & 1 == 1;
        if !was_visited {
            // Track touched word for efficient clearing
            if self.visited[word_idx] == 0 {
                self.touched_words.push(word_idx as u16);
            }
            self.visited[word_idx] |= 1u64 << bit_pos;
        }
        was_visited  // Return true if ALREADY visited
    }

  is_visited: |
    fn is_visited(&self, x: u16, y: u16) -> bool {
        let idx = (y as usize) << 9 | (x as usize);
        let word_idx = idx >> 6;
        let bit_pos = idx & 63;
        (self.visited[word_idx] >> bit_pos) & 1 == 1
    }

  cycles:
    mark_visited: ~20 cycles (index calc + read + conditional write + vec push)
    is_visited: ~12 cycles (index calc + read)
```

---

### Main Entry Point

```yaml
check_disconnection:
  trigger: |
    Called when cell (x, y) changes ownership from player P to player Q.
    Only called when P ≠ 0 (was owned) and P ≠ Q (actually changed).

  signature: |
    fn check_disconnection(
        workspace: &mut BFSWorkspace,
        player: usize,           // The player who LOST territory (P)
        lost_x: u16,
        lost_y: u16,
    )

  algorithm: |
    // PHASE 1: Find affected neighbors (P's territory adjacent to lost cell)
    let affected = find_affected_neighbors(player, lost_x, lost_y);

    if affected.is_empty() {
        return;  // Fast path: nothing to disconnect
    }

    // PHASE 2: Check if all affected are in base interior (always connected)
    let base = &BASES[player].unwrap();
    if all_in_base_interior(&affected, base) {
        return;  // Base interior is self-connected
    }

    // PHASE 3: BFS from base to check reachability
    workspace.clear();
    let unreached = bfs_find_unreached(workspace, player, base, &affected);

    if unreached.is_empty() {
        return;  // All affected neighbors still connected
    }

    // PHASE 4: Find and remove disconnected components
    let disconnected = find_disconnected_components(workspace, player, &unreached);
    apply_disconnection(player, &disconnected);

  total_cost:
    no_affected_neighbors: ~50 cycles (phase 1 only)
    all_in_base: ~70 cycles (phase 1 + 2)
    bfs_no_disconnect: ~100 + (reachable_territory × 40) cycles
    actual_disconnect: above + (disconnected_cells × 60) cycles
```

---

### Phase 1: Find Affected Neighbors

```yaml
find_affected_neighbors:
  purpose: |
    Find orthogonal neighbors of the lost cell that belong to player P.
    These are the ONLY cells that could potentially become disconnected.

  algorithm: |
    fn find_affected_neighbors(player: usize, x: u16, y: u16) -> ArrayVec<(u16, u16), 4> {
        let mut affected = ArrayVec::new();

        // Check 4 orthogonal neighbors (not diagonal - connection is orthogonal only)
        let neighbors = [
            ((x.wrapping_sub(1)) & 511, y),       // West
            ((x.wrapping_add(1)) & 511, y),       // East
            (x, (y.wrapping_sub(1)) & 511),       // North
            (x, (y.wrapping_add(1)) & 511),       // South
        ];

        for (nx, ny) in neighbors {
            if player_owns(player, nx, ny) {
                affected.push((nx, ny));
            }
        }

        affected
    }

  why_arrayvec: |
    Max 4 neighbors → stack-allocated, no heap.
    ArrayVec<T, 4> is 4 × sizeof(T) + 1 byte for len.

  cycles:
    per_neighbor_check: ~25 cycles (sparse territory lookup)
    total: ~100 cycles (4 checks)

  typical_results:
    no_neighbors: 75% of cases (edge growth, isolated cells)
    1_neighbor: 15% of cases
    2_neighbors: 8% of cases
    3-4_neighbors: 2% of cases (rare, cell was in middle of territory)
```

---

### Phase 2: Base Interior Check

```yaml
all_in_base_interior:
  purpose: |
    If all affected neighbors are inside the base's 6×6 interior,
    they're guaranteed connected (base interior is always self-connected).

    This is the "last stand" scenario - even if surrounded, base persists.

  algorithm: |
    fn all_in_base_interior(affected: &[(u16, u16)], base: &Base) -> bool {
        affected.iter().all(|&(x, y)| {
            let dx = x.wrapping_sub(base.x);
            let dy = y.wrapping_sub(base.y);
            dx >= 1 && dx <= 6 && dy >= 1 && dy <= 6
        })
    }

  cycles: ~5 cycles per cell × max 4 = ~20 cycles

  when_this_triggers: |
    Player is being sieged, enemies taking territory around base.
    As long as fighting happens outside base, interior stays connected.
```

---

### Phase 3: BFS Reachability Check

```yaml
bfs_find_unreached:
  purpose: |
    BFS from base interior to find all reachable territory.
    Return which affected neighbors were NOT reached.

    Key optimization: Early terminate when all affected neighbors found.

  algorithm: |
    fn bfs_find_unreached(
        workspace: &mut BFSWorkspace,
        player: usize,
        base: &Base,
        affected: &[(u16, u16)],
    ) -> ArrayVec<(u16, u16), 4> {

        let territory = &TERRITORY[player];

        // Quick check: empty territory means nothing to disconnect
        if territory.chunk_mask == 0 {
            return ArrayVec::new();
        }

        // Seed BFS with base interior cells
        seed_from_base_interior(workspace, player, base);

        // Track which affected neighbors we've found
        let mut found_count = 0;
        let mut affected_found = [false; 4];

        // BFS with early termination
        let mut queue_idx = 0;
        while queue_idx < workspace.queue.len() {
            let cell_idx = workspace.queue[queue_idx] as usize;
            queue_idx += 1;

            let x = (cell_idx & 511) as u16;
            let y = (cell_idx >> 9) as u16;

            // Check if this is one of our affected neighbors
            for (i, &(ax, ay)) in affected.iter().enumerate() {
                if !affected_found[i] && x == ax && y == ay {
                    affected_found[i] = true;
                    found_count += 1;

                    // EARLY TERMINATION: all affected found, no disconnection
                    if found_count == affected.len() {
                        return ArrayVec::new();
                    }
                }
            }

            // Explore orthogonal neighbors
            explore_orthogonal_neighbors(workspace, player, x, y);
        }

        // BFS complete - collect unreached affected neighbors
        let mut unreached = ArrayVec::new();
        for (i, &(ax, ay)) in affected.iter().enumerate() {
            if !affected_found[i] {
                unreached.push((ax, ay));
            }
        }
        unreached
    }

  seed_from_base_interior: |
    fn seed_from_base_interior(workspace: &mut BFSWorkspace, player: usize, base: &Base) {
        // Add all base interior cells that are territory
        // Base interior: (base.x + 1..base.x + 7) × (base.y + 1..base.y + 7)
        for dy in 1..7u16 {
            for dx in 1..7u16 {
                let x = base.x.wrapping_add(dx) & 511;
                let y = base.y.wrapping_add(dy) & 511;

                if player_owns(player, x, y) && !workspace.mark_visited(x, y) {
                    let idx = (y as u32) << 9 | (x as u32);
                    workspace.queue.push(idx);
                }
            }
        }
    }

  explore_orthogonal_neighbors: |
    fn explore_orthogonal_neighbors(
        workspace: &mut BFSWorkspace,
        player: usize,
        x: u16,
        y: u16,
    ) {
        let neighbors = [
            ((x.wrapping_sub(1)) & 511, y),
            ((x.wrapping_add(1)) & 511, y),
            (x, (y.wrapping_sub(1)) & 511),
            (x, (y.wrapping_add(1)) & 511),
        ];

        for (nx, ny) in neighbors {
            // Skip if already visited
            if workspace.is_visited(nx, ny) {
                continue;
            }

            // Check chunk existence first (fast rejection)
            let chunk_idx = ((ny >> 6) << 3 | (nx >> 6)) as usize;
            if (TERRITORY[player].chunk_mask >> chunk_idx) & 1 == 0 {
                continue;  // Entire chunk is empty
            }

            // Check if player owns this cell
            if player_owns(player, nx, ny) {
                workspace.mark_visited(nx, ny);
                let idx = (ny as u32) << 9 | (nx as u32);
                workspace.queue.push(idx);
            }
        }
    }

  cycles:
    seed_base_interior: 36 cells × (25 + 20) = ~1,600 cycles
    per_bfs_cell:
      affected_check: ~15 cycles (compare against max 4 coords)
      explore_neighbors: 4 × (12 + 8 + 25) = ~180 cycles
      total: ~200 cycles per cell (including overhead)

    typical_territory_3000_cells:
      if_early_termination: ~1600 + (avg 500 cells × 200) = ~100K cycles
      if_full_traversal: ~1600 + (3000 × 200) = ~600K cycles

    note: |
      Early termination typically fires within first 10-30% of territory.
      Real cost is usually 100-200K cycles, not worst case.
```

---

### Phase 4: Find Disconnected Components

```yaml
find_disconnected_components:
  purpose: |
    For each unreached affected neighbor, BFS to find all cells
    in that disconnected component.

    Note: Multiple unreached neighbors might be in the SAME component.

  algorithm: |
    fn find_disconnected_components(
        workspace: &mut BFSWorkspace,
        player: usize,
        unreached: &[(u16, u16)],
    ) -> Vec<(u16, u16)> {
        let mut disconnected = Vec::with_capacity(1000);

        for &(start_x, start_y) in unreached {
            // Skip if already processed (part of previous component)
            if workspace.is_visited(start_x, start_y) {
                continue;
            }

            // BFS to find this component
            let component_start = disconnected.len();
            workspace.mark_visited(start_x, start_y);

            let mut local_queue = Vec::with_capacity(500);
            local_queue.push((start_x, start_y));

            let mut q_idx = 0;
            while q_idx < local_queue.len() {
                let (x, y) = local_queue[q_idx];
                q_idx += 1;

                disconnected.push((x, y));

                // Explore orthogonal neighbors
                let neighbors = [
                    ((x.wrapping_sub(1)) & 511, y),
                    ((x.wrapping_add(1)) & 511, y),
                    (x, (y.wrapping_sub(1)) & 511),
                    (x, (y.wrapping_add(1)) & 511),
                ];

                for (nx, ny) in neighbors {
                    if !workspace.is_visited(nx, ny) && player_owns(player, nx, ny) {
                        workspace.mark_visited(nx, ny);
                        local_queue.push((nx, ny));
                    }
                }
            }
        }

        disconnected
    }

  cycles:
    per_disconnected_cell: ~150 cycles (similar to BFS but collecting results)

  allocation_note: |
    This phase DOES allocate (Vec for disconnected cells).
    But this only runs when disconnection actually occurs (~0.1% of births).
    Could pre-allocate if this becomes a problem.
```

---

### Phase 5: Apply Disconnection

```yaml
apply_disconnection:
  purpose: |
    Remove disconnected cells from territory and kill any alive cells.

  algorithm: |
    fn apply_disconnection(player: usize, disconnected: &[(u16, u16)]) {
        for &(x, y) in disconnected {
            // Clear from territory
            clear_territory(player, x, y);

            // Kill cell if alive
            let idx = (y as usize) << 9 | (x as usize);
            let word_idx = idx >> 6;
            let bit_pos = idx & 63;

            if (ALIVE[word_idx] >> bit_pos) & 1 == 1 {
                ALIVE[word_idx] &= !(1u64 << bit_pos);

                // Update cell counts
                CELL_COUNTS[player] -= 1;

                // Mark neighbors in NEXT_POTENTIAL (they might change behavior)
                mark_neighbors_potential(idx);
            }
        }

        // Check if player now has 0 cells (start grace period)
        if CELL_COUNTS[player] == 0 {
            ZERO_CELLS_SINCE[player] = Some(ic_cdk::api::time());
        }
    }

  clear_territory: |
    fn clear_territory(player: usize, x: u16, y: u16) {
        let territory = &mut TERRITORY[player];

        let chunk_x = (x >> 6) as usize;
        let chunk_y = (y >> 6) as usize;
        let chunk_idx = chunk_y * 8 + chunk_x;

        // Check if chunk exists
        if (territory.chunk_mask >> chunk_idx) & 1 == 0 {
            return;  // Already empty
        }

        // Find vec index
        let vec_idx = (territory.chunk_mask & ((1u64 << chunk_idx) - 1)).count_ones() as usize;

        // Clear bit
        let local_x = (x & 63) as usize;
        let local_y = (y & 63) as usize;
        territory.chunks[vec_idx][local_y] &= !(1u64 << local_x);

        // Check if chunk is now empty
        let chunk_empty = territory.chunks[vec_idx].iter().all(|&w| w == 0);
        if chunk_empty {
            // Remove chunk from vec and clear mask bit
            territory.chunks.remove(vec_idx);
            territory.chunk_mask &= !(1u64 << chunk_idx);
        }
    }

  cycles:
    per_cell:
      clear_territory: ~40 cycles (chunk lookup + bit clear)
      kill_if_alive: ~30 cycles (bit clear + count update)
      mark_neighbors: ~90 cycles (9 bit sets)
      total: ~160 cycles per cell

    chunk_removal: ~200 cycles (vec remove, rare)
```

---

### Complete Cost Analysis

```yaml
disconnection_cost_analysis:

  scenario_distribution:
    # Per birth that changes territory ownership

    no_affected_neighbors:
      probability: 75%
      cost: 50 cycles

    all_in_base_interior:
      probability: 5%
      cost: 70 cycles

    bfs_no_disconnect:
      probability: 19%
      avg_bfs_cells: 500
      cost: 100 + (500 × 200) = 100K cycles

    actual_disconnect:
      probability: 1%
      avg_bfs_cells: 2000
      avg_disconnected: 200
      cost: 100 + (2000 × 200) + (200 × 160) = 432K cycles

  expected_cost_per_territory_change:
    formula: |
      0.75 × 50 + 0.05 × 70 + 0.19 × 100_000 + 0.01 × 432_000
      = 37.5 + 3.5 + 19_000 + 4_320
      = 23,361 cycles

    rounded: ~23K cycles per territory change

  births_causing_territory_change:
    # Not all births change territory
    # - Birth on neutral: creates new territory (no old owner)
    # - Birth on own territory: no change
    # - Birth on enemy territory: territory change

    estimate: 30% of births cause territory change

  cost_per_birth:
    formula: 0.30 × 23_000 = 6,900 cycles
    rounded: ~7K cycles per birth

  integration_with_generation:
    # From earlier estimates: 400 births per generation

    disconnection_per_gen: 400 × 7_000 = 2,800,000 cycles

    compare_to_gen_cost: |
      v2 generation cost: ~1.9M cycles
      + disconnection: ~2.8M cycles
      = ~4.7M cycles total per generation

    daily_impact:
      generations_per_day: 864,000
      disconnection_daily: 864K × 2.8M = 2.4T cycles

    note: |
      This is significant! The disconnection algorithm adds ~2.4T cycles/day.
      Combined with base 1.64T, total is ~4T cycles/day.

      Still 4× better than v1's 15.2T estimate.
      But not under our 1T target.

  optimizations_needed:
    see_below: true
```

---

### Optimization: Deferred Disconnection Check

```yaml
deferred_disconnection:
  problem: |
    Checking disconnection per-birth is expensive.
    A single generation might have many births from the same attacker
    against the same defender, requiring redundant BFS.

  solution: |
    Batch disconnection checks per-generation.

    1. During phase 2 (apply changes), collect territory changes
    2. After all births processed, check disconnection ONCE per affected player
    3. Single BFS covers all changes to that player's territory

  implementation: |
    struct TerritoryChanges {
        // Bit mask of which players lost territory this generation
        affected_players: u8,

        // Per-player: cells lost (for affected neighbor calculation)
        lost_cells: [ArrayVec<(u16, u16), 64>; 8],
    }

  modified_phase_2: |
    fn apply_births_batched(births: &[(usize, usize)]) -> TerritoryChanges {
        let mut changes = TerritoryChanges::new();

        for &(cell_idx, new_owner) in births {
            let (x, y) = idx_to_coords(cell_idx);

            // ... siege check, apply birth ...

            // Track territory change
            if let Some(old_owner) = find_owner(x, y) {
                if old_owner != new_owner {
                    changes.affected_players |= 1 << old_owner;
                    changes.lost_cells[old_owner].push((x, y));
                }
            }

            set_territory(new_owner, x, y);
        }

        changes
    }

  batch_disconnection_check: |
    fn check_all_disconnections(workspace: &mut BFSWorkspace, changes: &TerritoryChanges) {
        for player in 0..8 {
            if (changes.affected_players >> player) & 1 == 0 {
                continue;  // Player not affected
            }

            // Collect ALL affected neighbors from ALL lost cells
            let mut all_affected = Vec::new();
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

            // Single BFS for this player
            workspace.clear();
            let unreached = bfs_find_unreached_multi(workspace, player, &all_affected);

            if !unreached.is_empty() {
                let disconnected = find_disconnected_components(workspace, player, &unreached);
                apply_disconnection(player, &disconnected);
            }
        }
    }

  cost_savings:
    before: |
      400 births × 7K cycles = 2.8M cycles per gen

    after: |
      Assume 4 players actively fighting, each loses ~50 cells/gen
      4 players × (100 + BFS cost)
      = 4 × (100 + 100K average)
      = ~400K cycles per gen

    improvement: 7× reduction in disconnection overhead

    new_daily_total:
      generation: 1.9M cycles
      disconnection: 0.4M cycles
      total: 2.3M cycles per generation
      daily: 864K × 2.3M = 2.0T cycles/day

      note: |
        Still above 1T target, but much more reasonable.
        Further optimization possible with lazy checking.
```

---

### Optimization: Articulation Point Heuristic

```yaml
articulation_point_heuristic:
  concept: |
    An "articulation point" is a cell whose removal disconnects the graph.
    Only losing an articulation point can cause disconnection.

    We can use a HEURISTIC to detect likely non-articulation points:
    - If a cell has ≤1 owned neighbors: can't be articulation (leaf or isolated)
    - If a cell's neighbors are all adjacent to each other: probably not articulation

  quick_non_articulation_check: |
    fn probably_not_articulation(player: usize, x: u16, y: u16) -> bool {
        let neighbors: ArrayVec<(u16, u16), 4> = orthogonal_neighbors(x, y)
            .filter(|(nx, ny)| player_owns(player, *nx, *ny))
            .collect();

        match neighbors.len() {
            0 | 1 => true,  // Leaf or isolated - definitely not articulation
            2 => {
                // Check if the 2 neighbors are adjacent to each other
                let (n1, n2) = (neighbors[0], neighbors[1]);
                are_orthogonal_neighbors(n1, n2)
            }
            3 | 4 => false,  // Conservatively assume might be articulation
        }
    }

    fn are_orthogonal_neighbors((x1, y1): (u16, u16), (x2, y2): (u16, u16)) -> bool {
        let dx = x1.abs_diff(x2);
        let dy = y1.abs_diff(y2);
        // Handle wrap-around
        let dx = dx.min(512 - dx);
        let dy = dy.min(512 - dy);
        (dx == 1 && dy == 0) || (dx == 0 && dy == 1)
    }

  integration: |
    fn check_disconnection_optimized(...) {
        // ... find affected neighbors ...

        // Quick check: if probably not an articulation point, skip BFS
        if probably_not_articulation(player, lost_x, lost_y) {
            return;  // Heuristic says no disconnection
        }

        // ... proceed with BFS ...
    }

  accuracy: |
    This heuristic has FALSE NEGATIVES (might miss some non-articulations)
    but NO FALSE POSITIVES (never skips actual disconnections).

    Expected to filter out ~60% of remaining BFS checks.

  cost_savings:
    check_cost: ~100 cycles
    bfs_saved: ~100K cycles

    if 60% filtered: saves 60K cycles average per territory change

    net: Significant savings for complex territories
```

---

### Final Optimized Algorithm Summary

```yaml
optimized_disconnection_summary:

  strategy: |
    1. Batch all territory changes per generation
    2. For each affected player, do ONE combined check
    3. Use articulation heuristic to skip obvious non-disconnections
    4. BFS with early termination when all affected neighbors found
    5. Only allocate when disconnection actually occurs

  data_structures:
    BFSWorkspace: 44 KB pre-allocated, zero runtime allocation
    TerritoryChanges: ~2 KB per generation, stack-allocated

  per_generation_cost:
    collect_changes: ~10 cycles per birth = 4K cycles
    per_player_check: ~100K cycles average (with optimizations)
    total_4_players: ~400K cycles

  daily_cost:
    per_gen: 400K cycles
    daily: 864K × 0.4M = 346B cycles = 0.35T cycles

  vs_naive:
    naive_daily: 2.4T cycles
    optimized_daily: 0.35T cycles
    improvement: 7× faster

  combined_with_generation:
    generation: 1.9M cycles
    disconnection: 0.4M cycles
    total: 2.3M cycles per generation

    daily: 2.0T cycles
    monthly: 60T cycles ≈ $60/month

    note: |
      2× over our 1T target, but 7.5× better than v1.
      Acceptable for v2 launch. Further optimizations possible.
```

---

## Update Functions (Player Actions)

API endpoints that players call to interact with the game.

### faucet()

```yaml
faucet:
  signature: "fn faucet() -> Result<u64, String>"
  type: update
  auth_required: true

  algorithm: |
    let caller = ic_cdk::caller();

    // Validation
    if caller == Principal::anonymous() {
        return Err("Must be authenticated");
    }

    // Add coins
    let balance = WALLETS.entry(caller).or_insert(0);
    *balance += FAUCET_AMOUNT;  // 1000

    Ok(*balance)

  cycles: ~5K (update call overhead + hashmap lookup)
```

---

### join_game()

```yaml
join_game:
  signature: "fn join_game(base_x: i32, base_y: i32) -> Result<u8, String>"
  type: update
  auth_required: true

  validations:
    1_auth: "caller != anonymous"
    2_not_playing: "find_player_slot(caller).is_none()"
    3_has_coins: "WALLETS.get(&caller).unwrap_or(&0) >= 100"
    4_coords_valid: "0 <= base_x < 512 && 0 <= base_y < 512"
    5_quadrant_free: "!quadrant_has_base(get_quadrant(base_x, base_y))"
    6_no_overlap: "No existing base overlaps the 8x8 area"

  base_overlap_check:
    algorithm: |
      fn bases_would_overlap(new_x: u16, new_y: u16, existing: &Base) -> bool {
          // Check if two 8x8 bases overlap (with toroidal wrapping)
          let dx = new_x.abs_diff(existing.x);
          let dy = new_y.abs_diff(existing.y);

          // Handle wrap-around: take minimum distance
          let dx = dx.min(512 - dx);
          let dy = dy.min(512 - dy);

          // Bases overlap if both distances < 8
          dx < 8 && dy < 8
      }

      // In join_game validation:
      for existing_base in BASES.iter().flatten() {
          if bases_would_overlap(base_x as u16, base_y as u16, existing_base) {
              return Err("Overlaps existing base");
          }
      }

  main_algorithm: |
    let caller = ic_cdk::caller();
    let base_x = base_x as u16;
    let base_y = base_y as u16;

    // Validations (see above)
    // ...

    // Find free slot
    let slot = PLAYERS.iter().position(|p| p.is_none())
        .ok_or("No free slots (max 8 players)")?;

    // Deduct coins from wallet
    let wallet = WALLETS.get_mut(&caller).ok_or("No wallet")?;
    *wallet -= BASE_COST;  // 100

    // Create base with coins from wallet
    BASES[slot] = Some(Base {
        x: base_x,
        y: base_y,
        coins: BASE_COST,  // 100 coins transferred from wallet
    });
    PLAYERS[slot] = Some(caller);

    // Initialize 6x6 interior territory (walls excluded)
    for dy in 1u16..7 {
        for dx in 1u16..7 {
            let x = (base_x.wrapping_add(dx)) & 511;
            let y = (base_y.wrapping_add(dy)) & 511;
            set_territory(slot, x, y);
        }
    }

    Ok(slot as u8)

  cycles: ~50K (validations + 36 territory cells init)
```

---

### place_cells()

```yaml
place_cells:
  signature: "fn place_cells(cells: Vec<(i32, i32)>) -> Result<u32, String>"
  type: update
  auth_required: true

  validations:
    0_size_limit: "cells.len() <= MAX_PLACE_CELLS (1000)"
    1_has_slot: "Find caller's slot or error"
    2_has_coins: "wallet_balance >= cells.len()"
    3_all_valid: "ALL cells must pass (atomic - fail fast, no partial placement):"
      - "coords in range [0, 512)"
      - "on own territory (not neutral/enemy)"
      - "NOT on wall positions"
      - "NOT already alive"

  algorithm: |
    let caller = ic_cdk::caller();

    // Size limit validation
    if cells.len() > MAX_PLACE_CELLS {
        return Err(format!("Max {} cells per call", MAX_PLACE_CELLS));
    }

    let slot = find_player_slot(caller)
        .ok_or("Not in game")?;
    let base = BASES[slot].as_ref().unwrap();
    let wallet_balance = *WALLETS.get(&caller).unwrap_or(&0);

    // Check sufficient coins
    if wallet_balance < cells.len() as u64 {
        return Err("Insufficient coins");
    }

    // Phase 1: Validate ALL cells first (atomic)
    for &(x, y) in &cells {
        // Range check
        if x < 0 || x >= 512 || y < 0 || y >= 512 {
            return Err("Coordinates out of range");
        }
        let x = x as u16;
        let y = y as u16;

        // Territory check
        if !player_owns(slot, x, y) {
            return Err("Not your territory");
        }

        // Wall check
        if is_wall(base, x, y) {
            return Err("Cannot place on walls");
        }

        // Already alive check
        if is_alive(x, y) {
            return Err("Cell already alive");
        }
    }

    // Phase 2: Deduct coins (wallet -> base treasury)
    let count = cells.len() as u64;
    *WALLETS.get_mut(&caller).unwrap() -= count;
    BASES[slot].as_mut().unwrap().coins += count;

    // Phase 3: Place cells
    for &(x, y) in &cells {
        let x = x as u16;
        let y = y as u16;
        set_alive(x, y);
        mark_with_neighbors_potential(coords_to_idx(x, y));
    }

    // Update cell count
    CELL_COUNTS[slot] += cells.len() as u32;

    // Clear grace period if we had 0 cells
    ZERO_CELLS_SINCE[slot] = None;

    Ok(cells.len() as u32)

  cycles: ~100 + 80 per cell (validation + placement + potential marking)
```

---

## Game Mechanics

Core game logic functions called during generation processing.

### eliminate_player()

```yaml
eliminate_player:
  signature: "fn eliminate_player(player: usize)"
  type: internal

  call_sites:
    1_siege: "phase_2_apply_changes: when BASES[defender].coins == 0 after siege"
    2_grace: "check_grace_periods: when grace period expires with base intact"

  algorithm: |
    // 1. Kill ALL player's alive cells (iterate via territory bitmap)
    for chunk_idx in 0..64 {
        if (TERRITORY[player].chunk_mask >> chunk_idx) & 1 == 0 {
            continue;  // Skip empty chunks
        }

        let vec_idx = popcount_below(TERRITORY[player].chunk_mask, chunk_idx);
        let chunk = &TERRITORY[player].chunks[vec_idx];

        let chunk_base_x = (chunk_idx % 8) * 64;
        let chunk_base_y = (chunk_idx / 8) * 64;

        for local_y in 0..64 {
            let mut word = chunk[local_y];
            while word != 0 {
                let local_x = word.trailing_zeros() as usize;
                word &= word - 1;

                let x = chunk_base_x + local_x;
                let y = chunk_base_y + local_y;
                let idx = coords_to_idx(x as u16, y as u16);

                // Kill if alive
                if is_alive_idx(idx) {
                    clear_alive_idx(idx);
                    mark_neighbors_potential(idx);
                }
            }
        }
    }

    // 2. Clear territory completely
    TERRITORY[player] = PlayerTerritory {
        chunk_mask: 0,
        chunks: Vec::new(),
    };

    // 3. Clear player data
    BASES[player] = None;
    PLAYERS[player] = None;
    CELL_COUNTS[player] = 0;
    ZERO_CELLS_SINCE[player] = None;

  cycles: ~10K base + 30 per owned territory cell
```

---

### Siege Mechanic Order of Operations

```yaml
siege_mechanic_order_of_operations:
  location: "phase_2_apply_changes in step_generation"

  explicit_order: |
    // For each birth in enemy protection zone:

    // 1. Transfer coin FIRST (attacker always gets paid)
    BASES[defender].coins -= 1;
    WALLETS[PLAYERS[attacker]] += 1;

    // 2. Check for elimination AFTER transfer
    if BASES[defender].coins == 0 {
        eliminate_player(defender);
        // Note: attacker already received their coin
        // Defender's remaining territory becomes neutral
        // All defender's cells die
    }

    // 3. Birth is PREVENTED regardless
    // (cell not created in protection zone)

  note: |
    Attacker always receives the siege coin, even if this
    is the killing blow. This is fair compensation for
    the successful attack.
```

---

### Quadrant Wipe Algorithm

```yaml
quadrant_wipe:

  run_wipe_if_needed:
    algorithm: |
      let now = ic_cdk::api::time();
      if now - LAST_WIPE_NS >= WIPE_INTERVAL_NS {  // 5 minutes = 300_000_000_000 ns
          wipe_quadrant(NEXT_WIPE_QUADRANT);
          NEXT_WIPE_QUADRANT = (NEXT_WIPE_QUADRANT + 1) % 16;
          LAST_WIPE_NS = now;
      }

  wipe_quadrant:
    signature: "fn wipe_quadrant(quadrant: u8)"

    algorithm: |
      let (x_start, y_start, _, _) = quadrant_bounds(quadrant);

      // Quadrant = 128x128 cells = 16,384 cells
      // = 128 rows × 2 words per row = 256 words to check

      for row_offset in 0..128u16 {
          let y = y_start + row_offset;
          let word_row_base = (y as usize) * 8;
          let word_col_start = (x_start / 64) as usize;  // 0, 2, 4, or 6

          for word_offset in 0..2 {
              let word_idx = word_row_base + word_col_start + word_offset;
              let mut alive_word = ALIVE[word_idx];

              if alive_word == 0 {
                  continue;  // No alive cells in this word
              }

              // Process each alive cell - need to find owner for CELL_COUNTS
              while alive_word != 0 {
                  let bit_pos = alive_word.trailing_zeros() as usize;
                  alive_word &= alive_word - 1;  // Clear this bit

                  let x = (word_col_start * 64 + word_offset * 64 + bit_pos) as u16;
                  let idx = coords_to_idx(x, y);

                  // Find owner to decrement their cell count
                  if let Some(owner) = find_owner(x, y) {
                      CELL_COUNTS[owner] -= 1;

                      // Check grace period trigger
                      if CELL_COUNTS[owner] == 0 && BASES[owner].is_some() {
                          ZERO_CELLS_SINCE[owner] = Some(ic_cdk::api::time());
                      }
                  }

                  // Mark neighbors as potential (they may change behavior)
                  mark_neighbors_potential(idx);
              }

              // Kill all alive cells in this word
              ALIVE[word_idx] = 0;
          }
      }

    preserves:
      - Territory ownership (NOT cleared - only alive status)
      - Base structures (walls, coins, position)
      - Player slots

    does_NOT_trigger:
      - Disconnection check (territory preserved, just cells die)

    purpose: "Prevents stagnation, forces competition cycles"

    cycle_estimate:
      best_case: "~20K cycles (sparse quadrant, few alive cells)"
      typical: "~200K cycles (~2K alive cells × ~100 cycles/cell)"
      worst_case: "~1M cycles (dense quadrant, 16K alive cells × ~60 cycles/cell)"

      breakdown_per_alive_cell:
        find_owner: ~50 cycles
        cell_count_update: ~5 cycles
        mark_neighbors: ~90 cycles (9 bit ops with coord math)
        total: ~145 cycles per alive cell

      note: |
        The find_owner() call for CELL_COUNTS dominates the cost.
```

---

## Tick Orchestration

Timer-driven game loop coordination.

```yaml
tick:
  trigger: "ic_cdk_timers::set_timer_interval(Duration::from_millis(1000))"

  algorithm: |
    fn tick() {
        if !IS_RUNNING {
            return;
        }

        // Run 10 generations (10 gen/sec)
        for _ in 0..GENERATIONS_PER_TICK {
            step_generation();
        }

        // Check quadrant wipe timer
        run_wipe_if_needed();

        // Check grace periods
        check_grace_periods();
    }

    fn check_grace_periods() {
        let now = ic_cdk::api::time();

        for player in 0..8 {
            if let Some(zero_since) = ZERO_CELLS_SINCE[player] {
                // 10 minutes grace period = 600_000_000_000 ns
                if now - zero_since >= GRACE_PERIOD_NS {
                    // Only eliminate if base still exists
                    // (If base was destroyed by siege, eliminate_player
                    //  was already called, and BASES[player] is None)
                    if BASES[player].is_some() {
                        eliminate_player(player);
                    }
                }
            }
        }
    }

  grace_period_clarification: |
    Edge case: If a player has 0 cells AND their base was destroyed (coins=0):
    - eliminate_player() was already called by siege mechanic
    - BASES[player] = None, so grace period check skips them
    - No double-elimination possible

  init:
    location: "canister_init or post_upgrade"
    code: |
      ic_cdk_timers::set_timer_interval(
          Duration::from_millis(1000),
          || tick()
      );
```

---

## Query Functions

Read-only endpoints for game state.

```yaml
query_functions:

  get_state:
    signature: "fn get_state() -> GameState"
    type: query
    returns:
      generation: u64
      alive_cells: Vec<(u16, u16, u8)>  # (x, y, owner)
      players: [Option<PlayerInfo>; 8]
      bases: [Option<BaseInfo>; 8]
      next_wipe: (u8, u64)  # (quadrant, seconds_until)

    algorithm: |
      // Iterate ALIVE bitmap, for each alive cell find owner
      let mut cells = Vec::new();
      for word_idx in 0..4096 {
          let mut word = ALIVE[word_idx];
          while word != 0 {
              let bit = word.trailing_zeros() as usize;
              word &= word - 1;

              let idx = word_idx * 64 + bit;
              let (x, y) = idx_to_coords(idx);
              let owner = find_owner(x, y).unwrap_or(0);  // 0 = neutral
              cells.push((x, y, owner));
          }
      }
      // ... assemble full state

    cycles_estimate: |
      ~2M cycles

      Breakdown:
        - 26K alive cells typical
        - × 50 cycles/owner lookup (find_owner checks 8 players)
        - = 1.3M cycles for ownership alone
        - + ~500K for iteration overhead, Vec building
        - = ~1.8-2M cycles total

  get_state_v2:
    description: "Alternative design - frontend computes ownership"
    signature: "fn get_state_v2() -> GameStateV2"

    returns:
      generation: u64
      alive_cells: Vec<(u16, u16)>       # No owner - just positions
      territories: [TerritoryExport; 8]  # Per-player sparse bitmaps
      players: [Option<PlayerInfo>; 8]
      bases: [Option<BaseInfo>; 8]
      next_wipe: (u8, u64)

    advantage: |
      - Avoids 26K × 50 = 1.3M cycles of owner lookups
      - Frontend can determine ownership by checking which territory contains each cell
      - Cost: ~500K cycles (just iteration, no find_owner)

    tradeoff: "More work for frontend, less for canister"

  get_slots_info:
    signature: "fn get_slots_info() -> [Option<SlotInfo>; 8]"
    type: query
    returns_per_slot:
      principal: Option<Principal>
      base_x: u16
      base_y: u16
      base_coins: u64
      alive_cells: u32          # From CELL_COUNTS
      territory_cells: u32      # Count from sparse bitmap
      in_grace_period: bool
      grace_seconds_remaining: Option<u64>
    cycles: ~10K

  get_base_info:
    signature: "fn get_base_info(slot: u8) -> Option<BaseInfo>"
    type: query
    cycles: ~1K

  get_territory_info:
    signature: "fn get_territory_info(slot: u8) -> TerritoryInfo"
    type: query
    returns: "Sparse bitmap (chunk_mask + chunks) or coordinate list"
    cycles: ~50K (depends on territory size)

  get_next_wipe:
    signature: "fn get_next_wipe() -> (u8, u64)"
    type: query
    returns: "(next_quadrant, seconds_until_wipe)"
    algorithm: |
      let now = ic_cdk::api::time();
      let elapsed = now - LAST_WIPE_NS;
      let remaining_ns = if elapsed >= WIPE_INTERVAL_NS {
          0
      } else {
          WIPE_INTERVAL_NS - elapsed
      };
      let remaining_secs = remaining_ns / 1_000_000_000;
      (NEXT_WIPE_QUADRANT, remaining_secs)
    cycles: ~1K

  get_balance:
    signature: "fn get_balance() -> u64"
    type: query
    algorithm: "*WALLETS.get(&ic_cdk::caller()).unwrap_or(&0)"
    cycles: ~1K
```

---

## Stable Memory Persistence

Canister upgrade state preservation.

```yaml
stable_memory:

  note: |
    This uses simplified pseudocode with ic_cdk::storage API.
    In production, consider:
    - ic_stable_structures for complex/large data
    - Manual ic0::stable64_* calls for fine-grained control
    - Candid serialization overhead for large bitmaps

  pre_upgrade:
    algorithm: |
      #[ic_cdk::pre_upgrade]
      fn pre_upgrade() {
          // Serialize all state to stable memory
          let state = PersistedState {
              alive: ALIVE.clone(),           // 32 KB
              territory: TERRITORY.clone(),   // ~16 KB variable
              bases: BASES.clone(),           // ~100 bytes
              players: PLAYERS.clone(),       // ~250 bytes
              wallets: WALLETS.clone(),       // ~300 bytes
              cell_counts: CELL_COUNTS.clone(),
              zero_cells_since: ZERO_CELLS_SINCE.clone(),
              generation: GENERATION,
              is_running: IS_RUNNING,
              next_wipe_quadrant: NEXT_WIPE_QUADRANT,
              last_wipe_ns: LAST_WIPE_NS,
          };

          ic_cdk::storage::stable_save((state,))
              .expect("Failed to save state");
      }

  post_upgrade:
    algorithm: |
      #[ic_cdk::post_upgrade]
      fn post_upgrade() {
          let (state,): (PersistedState,) =
              ic_cdk::storage::stable_restore()
              .expect("Failed to restore state");

          // Restore all persisted state
          ALIVE = state.alive;
          TERRITORY = state.territory;
          BASES = state.bases;
          PLAYERS = state.players;
          WALLETS = state.wallets;
          CELL_COUNTS = state.cell_counts;
          ZERO_CELLS_SINCE = state.zero_cells_since;
          GENERATION = state.generation;
          IS_RUNNING = state.is_running;
          NEXT_WIPE_QUADRANT = state.next_wipe_quadrant;
          LAST_WIPE_NS = state.last_wipe_ns;

          // Rebuild transient structures (not persisted)
          rebuild_potential_from_alive();
          BFS_WORKSPACE = BFSWorkspace::new();

          // Restart timer
          ic_cdk_timers::set_timer_interval(
              Duration::from_millis(1000),
              || tick()
          );
      }

    rebuild_potential_from_alive: |
      fn rebuild_potential_from_alive() {
          // Clear and rebuild POTENTIAL from ALIVE bitmap
          POTENTIAL.fill(0);

          for word_idx in 0..4096 {
              let mut word = ALIVE[word_idx];
              while word != 0 {
                  let bit = word.trailing_zeros() as usize;
                  word &= word - 1;

                  let idx = word_idx * 64 + bit;
                  mark_with_neighbors_potential(idx);
              }
          }
      }

    rebuild_cost: "~50K cycles for typical game state"

  stable_size_estimate:
    alive: 32 KB (fixed)
    territory: ~16 KB (variable, depends on expansion)
    other: ~1 KB
    total: ~50 KB typical, ~100 KB maximum
```

---

## Edge Cases

Documented decisions for ambiguous scenarios.

```yaml
edge_cases:

  simultaneous_base_destruction:
    scenario: "Two bases hit 0 coins in same generation from mutual siege"
    decision: "Process births in cell index order (deterministic)"
    implementation: |
      // In phase_2_apply_changes, births are processed from the births Vec
      // which is built in cell index order during phase_1
      // Lower cell index = processed first = eliminated first
    rationale: "Deterministic, simple, verifiable"

  birth_on_alive_cell:
    clarification: "Conway's rules: birth ONLY on dead cells"
    implementation: |
      // In compute_cell_fate_batched:
      if currently_alive {
          // Can only survive or die, never "birth"
          match alive_count {
              2 | 3 => Survives,
              _ => Death,
          }
      } else {
          // Only birth if exactly 3 neighbors
          if alive_count == 3 { Birth(owner) } else { StaysDead }
      }
    siege_implication: |
      Siege only triggers on BIRTH attempts.
      If cell is already alive, no siege (no birth attempt).

  base_placement_validation:
    overlap_algorithm: |
      fn bases_would_overlap(new_x: u16, new_y: u16, existing: &Base) -> bool {
          // Both bases are 8x8
          // They overlap if the distance in both dimensions is < 8

          let dx = new_x.abs_diff(existing.x);
          let dy = new_y.abs_diff(existing.y);

          // Handle toroidal wrap: take minimum distance
          let dx = dx.min(512 - dx);
          let dy = dy.min(512 - dy);

          // Overlap if BOTH dimensions have distance < 8
          dx < 8 && dy < 8
      }

  toroidal_edge_cases:
    base_near_edge: |
      Base at (508, 200):
        - Walls span x=508..515, but 512-515 wrap to 0-3
        - Wall positions: (508,200), (509,200), ..., (2,200), (3,200)
        - is_wall() must use wrapping arithmetic

    territory_connection_wrap: |
      Territory at x=0 IS orthogonally connected to territory at x=511
      BFS must use orthogonal_neighbors() which handles wrap

    quadrant_boundary: |
      Cell at (127, 127) is in quadrant 0
      Cell at (128, 128) is in quadrant 5
      Wipe of quadrant 0 kills (127,127) but not (128,128)
```

---

## Implementation Checklist

Summary of all sections now complete:

- [x] Data Representation (ALIVE, POTENTIAL, TERRITORY, BASES, etc.)
- [x] Helper Functions (bitmap, coordinate, quadrant, player, territory)
- [x] Constants (including MAX_PLACE_CELLS)
- [x] Step Generation Algorithm (batched processing)
- [x] Disconnection Algorithm (BFS with optimizations)
- [x] Update Functions (faucet, join_game, place_cells)
- [x] Game Mechanics (eliminate_player, siege, quadrant_wipe)
- [x] Tick Orchestration (timer, grace periods)
- [x] Query Functions (get_state, get_slots_info, etc.)
- [x] Stable Memory Persistence (pre/post upgrade)
- [x] Edge Cases Documentation
