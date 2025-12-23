# Life2 Backend Pseudocode

YAML-style pseudocode with cycle cost estimates for planning rule changes.

## Cycle Cost Reference

```yaml
base_costs:
  update_call_overhead: 590_000      # Fixed cost per update call
  query_call_overhead: 400_000       # Fixed cost per query call
  instruction: 0.4                   # Per Wasm instruction
  heap_read_byte: 1                  # Per byte read from heap
  heap_write_byte: 1                 # Per byte written to heap
  stable_read_byte: 2                # Per byte from stable memory
  stable_write_byte: 2               # Per byte to stable memory
  hashmap_lookup: ~500               # HashMap get/insert overhead
  vec_push: ~100                     # Vec push (amortized)
```

---

## Constants

```yaml
constants:
  GRID_SIZE: 512
  TOTAL_CELLS: 262_144               # 512 * 512
  GRID_WORDS: 4_096                  # For 64-bit bitset (262144 / 64)
  MAX_PLAYERS: 9
  FAUCET_AMOUNT: 1000
  GENERATIONS_PER_TICK: 10
  TICK_INTERVAL_MS: 1000
  WIPE_INTERVAL_NS: 300_000_000_000  # 5 minutes
  QUADRANT_SIZE: 128
  TOTAL_QUADRANTS: 16
  SLOT_GRACE_PERIOD_NS: 600_000_000_000  # 10 minutes
  CONTROLLER_THRESHOLD_PERCENT: 80
```

---

## Data Structures

```yaml
cell_encoding:
  size: 1 byte
  layout:
    bits_0_3: owner (0-9)
    bit_4: alive (0/1)
    bits_5_7: coins (0-7)

state:
  GRID: [u8; 262_144]                # 256 KB - main grid
  POTENTIAL: [u64; 4_096]            # 32 KB - cells to check this gen
  NEXT_POTENTIAL: [u64; 4_096]       # 32 KB - cells to check next gen
  PLAYERS: Vec<Principal>            # Max 9 entries, ~300 bytes
  BALANCES: HashMap<Principal, u64>  # Keyed by principal
  CELL_COUNTS: Vec<u32>              # Parallel to PLAYERS
  ZERO_CELLS_SINCE: Vec<Option<u64>> # Grace period tracking
  GENERATION: u64
  IS_RUNNING: bool
  NEXT_WIPE_QUADRANT: usize
  LAST_WIPE_TIME_NS: u64
  QUADRANT_TERRITORY: [[u32; 10]; 16]  # [quadrant][player]
  QUADRANT_CONTROLLER: [u8; 16]
```

---

## Update Functions

### join_game

```yaml
join_game:
  auth: require_authenticated

  steps:
    - get_caller_principal              # ~100 instructions
    - check_not_anonymous               # ~50 instructions
    - search_players_for_caller:        # O(n) where n <= 9
        instructions: ~200
    - if_found:
        return existing_slot
    - search_for_empty_slot:            # O(n) where n <= 9
        instructions: ~200
    - if_empty_found:
        - players[idx] = caller         # 29 bytes write
        - counts[idx] = 0               # 4 bytes write
        - return slot
    - if_full:
        return error
    - else:
        - players.push(caller)          # 29 bytes + vec overhead
        - counts.push(0)                # 4 bytes + vec overhead
        - return new_slot

  cost_estimate:
    typical: 600_000 cycles             # Base + minimal work
    worst_case: 650_000 cycles          # Full 9 players searched
```

### join_slot

```yaml
join_slot:
  auth: require_authenticated
  params:
    slot: u8                            # 1-9

  steps:
    - get_caller_principal              # ~100 instructions
    - validate_slot_range               # ~20 instructions
    - get_current_time                  # ~50 instructions
    - search_players_for_caller:        # O(n)
        instructions: ~200
    - if_found:
        return existing_slot
    - extend_vecs_if_needed:            # May allocate
        instructions: ~300
    - check_slot_available              # ~50 instructions
    - if_occupied:
        return error
    - claim_slot:
        - players[idx] = caller         # 29 bytes write
        - counts[idx] = 0               # 4 bytes write
        - zero_since[idx] = Some(now)   # 16 bytes write

  cost_estimate:
    typical: 620_000 cycles
    with_vec_extend: 700_000 cycles
```

### place_cells

```yaml
place_cells:
  auth: require_authenticated
  params:
    cells: Vec<(i32, i32)>              # List of coordinates

  steps:
    - get_caller_principal              # ~100 instructions
    - get_or_create_player_slot:        # ~500 instructions (see join_game)
        instructions: 500
    - get_balance_from_hashmap:         # HashMap lookup
        instructions: ~500
    - check_balance >= cells.len        # ~20 instructions

    - wrap_coordinates:                 # Per cell: ~30 instructions
        per_cell: 30
        formula: |
          wx = ((x % 512) + 512) % 512
          wy = ((y % 512) + 512) % 512
          idx = (wy << 9) | wx

    - validation_pass:                  # READ-ONLY - check all cells
        per_cell:
          - read_grid[idx]: 1 byte      # ~10 instructions
          - check_not_alive             # ~5 instructions
          - check_coins < 7             # ~5 instructions
          - check_not_enemy_with_coins  # ~10 instructions
        total_per_cell: ~30 instructions
        fail_on_any: return error (atomic)

    - placement_pass:                   # WRITE - place all cells
        per_cell:
          - read_grid[idx]: 1 byte
          - make_cell(owner, true, coins+1)  # ~20 instructions
          - write_grid[idx]: 1 byte
          - add_with_neighbors:         # Set 9 bits in POTENTIAL
              instructions: ~100
        total_per_cell: ~150 instructions

    - deduct_balance:                   # HashMap update
        instructions: ~500

    - update_cell_count:                # Vec index
        instructions: ~50

    - clear_grace_period:               # Vec index
        instructions: ~50

  cost_estimate:
    base: 600_000 cycles
    per_cell: ~200 cycles
    formula: 600_000 + (cells.len * 200)

    examples:
      1_cell: 600_200 cycles
      10_cells: 602_000 cycles
      100_cells: 620_000 cycles
      1000_cells: 800_000 cycles
```

### faucet

```yaml
faucet:
  auth: require_authenticated

  steps:
    - get_caller_principal              # ~100 instructions
    - check_not_anonymous               # ~50 instructions
    - hashmap_entry_or_insert:          # HashMap operation
        instructions: ~600
    - add_1000_to_balance               # ~10 instructions
    - return_new_balance                # ~20 instructions

  cost_estimate:
    typical: 610_000 cycles
```

### pause_game

```yaml
pause_game:
  auth: require_admin

  steps:
    - get_caller_principal              # ~100 instructions
    - parse_admin_principal             # ~200 instructions
    - compare_principals                # ~50 instructions
    - if_not_admin:
        return error
    - set_IS_RUNNING = false            # 1 byte write

  cost_estimate:
    typical: 595_000 cycles
```

### resume_game

```yaml
resume_game:
  auth: require_admin

  steps:
    - (same as pause_game)
    - set_IS_RUNNING = true             # 1 byte write

  cost_estimate:
    typical: 595_000 cycles
```

### reset_game

```yaml
reset_game:
  auth: require_admin

  steps:
    - require_admin                     # ~350 instructions
    - clear_grid:                       # 262,144 bytes write
        instructions: ~300_000
    - clear_potential:                  # 32,768 bytes write
        instructions: ~35_000
    - clear_next_potential:             # 32,768 bytes write
        instructions: ~35_000
    - reset_generation = 0              # 8 bytes
    - clear_players_vec                 # ~100 instructions
    - clear_cell_counts_vec             # ~100 instructions
    - clear_zero_cells_since_vec        # ~100 instructions
    - set_IS_RUNNING = true             # 1 byte
    - reset_wipe_state                  # 16 bytes
    - clear_quadrant_territory:         # 160 * 4 = 640 bytes
        instructions: ~1000
    - clear_quadrant_controllers:       # 16 bytes
        instructions: ~50

  cost_estimate:
    typical: 1_000_000 cycles           # Heavy operation
```

---

## Timer Function (runs every 1 second)

### tick (GENERATIONS_PER_TICK = 10)

```yaml
tick:
  triggered: every 1000ms

  steps:
    - check_IS_RUNNING                  # ~10 instructions
    - repeat 10 times:
        - step_generation()
    - run_wipe_if_needed()

  cost_estimate:
    idle: ~10_000 cycles                # Nothing alive
    typical: 500_000 - 2_000_000 cycles # Depends on alive cells
    heavy: 5_000_000+ cycles            # Many cells changing
```

### step_generation

```yaml
step_generation:
  algorithm: two-pass (read-then-write for correct GoL)

  pass_1_compute_fates:
    purpose: READ-ONLY scan of POTENTIAL bitset

    steps:
      - for each word in POTENTIAL[0..4096]:
          - skip if word == 0            # ~5 instructions
          - for each set bit:
              - extract bit position     # ~10 instructions
              - compute_cell_fate(idx)
              - if not StaysDead:
                  - changes.push((idx, change))

    compute_cell_fate:
      steps:
        - read_grid[idx]                 # 1 byte
        - get_neighbor_indices:          # 8 indices computed
            instructions: ~80
        - for each neighbor:
            - read_grid[n_idx]           # 1 byte
            - if alive: count++, owner_counts[owner]++
        - match (alive, count):
            - (true, 2|3): Survives
            - (false, 3): Birth { owner = majority }
            - (true, _): Death
            - (false, _): StaysDead

      find_majority_owner:
        - find max in owner_counts[1..9] # ~50 instructions
        - collect tied players           # ~30 instructions
        - hash = idx % tied.len          # ~10 instructions
        - return tied[hash]

      instructions_per_cell: ~200

  pass_2_apply_changes:
    purpose: WRITE changes to grid

    steps:
      - clear NEXT_POTENTIAL             # 32 KB write, ~35_000 instructions
      - for each (idx, change) in changes:
          - apply_cell_change(idx, change)

    apply_cell_change:
      Survives:
        - add_with_neighbors(next_potential, idx)  # ~100 instructions
        - return (None, None)

      Birth:
        - read_grid[idx]                 # 1 byte
        - get_quadrant(idx)              # ~10 instructions
        - update_quadrant_territory:     # ~50 instructions
            - decrement old_owner count
            - increment new_owner count
            - check 80% threshold
            - update controller if needed
        - check_can_collect_coins:       # ~30 instructions
            - has_enemy_coins AND controls_quadrant
        - if can_collect:
            - hashmap_update balance     # ~500 instructions
            - grid[idx] = make_cell(owner, true, 0)
        - else:
            - grid[idx] = make_cell(owner, true, old_coins)
        - add_with_neighbors(next_potential, idx)
        - return (Some(new_owner), None)

      Death:
        - read_grid[idx]                 # 1 byte
        - grid[idx] = make_cell(owner, false, coins)  # 1 byte write
        - for each neighbor:
            - add_with_neighbors(next_potential, n_idx)  # 8 * ~100
        - return (None, Some(owner))

      instructions_per_change:
        survives: ~100
        birth: ~700
        death: ~900

  update_cell_counts:
    - apply deltas to CELL_COUNTS        # ~50 per player
    - check grace period expiry          # ~100 per player
    - free expired slots                 # ~50 per expired

  swap_potentials:
    - mem::swap(POTENTIAL, NEXT_POTENTIAL)  # ~50 instructions

  increment_generation:
    - GENERATION += 1                    # ~10 instructions

  cost_estimate:
    formula: |
      base = 50_000 (overhead + clear NEXT_POTENTIAL)
      per_potential_cell = 200 (compute fate)
      per_change = 300 avg (apply change)

    examples:
      empty_grid: 50_000 cycles
      1000_potential_50_changes: 50_000 + 200*1000 + 300*50 = 265_000 cycles
      10000_potential_500_changes: 50_000 + 200*10000 + 300*500 = 2_200_000 cycles
      20000_potential_2000_changes: 50_000 + 200*20000 + 300*2000 = 4_650_000 cycles
```

### run_wipe_if_needed

```yaml
run_wipe_if_needed:
  condition: now - last_wipe >= 5 minutes

  steps:
    - get_current_time                   # ~50 instructions
    - check_elapsed >= WIPE_INTERVAL     # ~20 instructions
    - if not needed: return              # Early exit

    - update_last_wipe_time              # 8 bytes write
    - get_and_increment_quadrant         # ~30 instructions
    - wipe_quadrant(quadrant)

  wipe_quadrant:
    area: 128 * 128 = 16_384 cells

    steps:
      - for y in qy_start..(qy_start + 128):
          - for x in qx_start..(qx_start + 128):
              - idx = coord_to_index(x, y)    # ~10 instructions
              - cell = grid[idx]              # 1 byte read
              - if is_alive(cell):
                  - grid[idx] = set_alive(cell, false)  # 1 byte write
                  - clear bit in POTENTIAL    # ~20 instructions
                  - for each neighbor:
                      - set_potential(n_idx)  # ~15 instructions

    instructions_per_cell: ~30 (dead) or ~200 (alive)

  cost_estimate:
    empty_quadrant: 500_000 cycles
    full_quadrant: 3_000_000+ cycles
```

---

## Query Functions (Reference)

```yaml
queries:
  get_state:
    scans: full 262_144 cell grid
    cost: ~1_000_000 cycles
    returns: alive_cells, territory, players, balances, quadrant_controllers

  get_slots_info:
    scans: full grid for counts
    cost: ~800_000 cycles

  get_quadrant_info:
    scans: full grid for coins only (territory cached)
    cost: ~600_000 cycles

  get_generation:
    cost: ~400_000 cycles (base only)

  get_alive_count:
    scans: full grid
    cost: ~600_000 cycles

  get_potential_count:
    scans: 4_096 words
    cost: ~420_000 cycles

  get_balance:
    cost: ~405_000 cycles (hashmap lookup)

  get_next_wipe:
    cost: ~400_000 cycles (base only)

  is_running:
    cost: ~400_000 cycles (base only)
```

---

## Helper Functions

```yaml
coord_to_index:
  formula: (y & 0x1FF) << 9 | (x & 0x1FF)
  instructions: ~10

index_to_coord:
  formula: x = idx & 0x1FF, y = idx >> 9
  instructions: ~10

get_neighbor_indices:
  returns: [NW, N, NE, W, E, SW, S, SE] (8 indices)
  wrapping: toroidal (edges connect)
  instructions: ~80

get_quadrant:
  formula: (y >> 7) << 2 | (x >> 7)
  instructions: ~15

add_with_neighbors:
  sets 9 bits in potential bitset
  instructions: ~100

make_cell:
  formula: (coins << 5) | (alive << 4) | owner
  instructions: ~10

get_owner: cell & 0x0F
is_alive: cell & 0x10 != 0
get_coins: cell >> 5
```

---

## Upgrade Cycle Costs

```yaml
pre_upgrade:
  writes:
    - grid: 262_144 bytes to stable
    - metadata: ~1_000 bytes to stable
  cost: ~1_000_000 cycles

post_upgrade:
  reads:
    - grid: 262_144 bytes from stable
    - metadata: ~1_000 bytes from stable
  rebuilds:
    - rebuild_potential_from_grid: scans 262_144 cells
    - rebuild_quadrant_territory: scans 262_144 cells (if first deploy)
  cost: ~3_000_000 cycles
```

---

## Cost Planning Template

```yaml
# Use this template when modifying rules:

new_feature:
  name: "description"

  added_storage:
    - field_name: type, size_bytes

  modified_functions:
    function_name:
      added_steps:
        - step: instructions_estimate
      removed_steps:
        - step: instructions_saved
      net_change: +/- instructions

  new_functions:
    function_name:
      steps:
        - step: instructions
      total: instructions

  impact_on_tick:
    per_generation: +/- cycles
    per_second: +/- cycles (x10)

  impact_on_place_cells:
    per_cell: +/- cycles
```

---

## Cycles Per Generation (Primary Cost Driver)

```yaml
step_generation:
  algorithm: two-pass (read-then-write for correct GoL)

  #============================================================
  # PASS 1: COMPUTE FATES (read-only)
  #============================================================
  pass_1_compute_fates:
    purpose: Scan POTENTIAL bitset, compute fate for each cell

    iterate_potential_bitset:
      for word_idx in 0..4096:
        - read_word: potential[word_idx]           # 8 bytes
        - if word == 0: continue                   # ~5 instructions
        - while word != 0:
            - bit_pos = trailing_zeros(word)       # ~5 instructions
            - idx = (word_idx << 6) | bit_pos      # ~5 instructions
            - compute_cell_fate(idx)               # see below
            - word &= word - 1                     # ~3 instructions

    compute_cell_fate:
      inputs: grid (read-only), idx
      outputs: CellChange enum, owner_counts[10]

      steps:
        - cell = grid[idx]                         # 1 byte read, ~10 instr
        - currently_alive = cell & 0x10            # ~3 instructions
        - neighbors = get_neighbor_indices(idx):   # ~80 instructions
            # Compute 8 wrapped indices using bit ops
            xm = (x - 1) & 0x1FF
            xp = (x + 1) & 0x1FF
            ym = (y - 1) & 0x1FF
            yp = (y + 1) & 0x1FF
            return [NW, N, NE, W, E, SW, S, SE]

        - for each of 8 neighbors:                 # 8 iterations
            - n_cell = grid[n_idx]                 # 1 byte read, ~10 instr
            - if n_cell & 0x10:                    # ~5 instructions
                alive_count++
                owner = n_cell & 0x0F
                owner_counts[owner]++

        - match (currently_alive, alive_count):    # ~20 instructions
            (true, 2|3) => Survives
            (false, 3)  => Birth { find_majority_owner() }
            (true, _)   => Death
            (false, _)  => StaysDead

        - if Birth, find_majority_owner:           # ~80 instructions
            - max = max(owner_counts[1..9])
            - tied = filter players with count == max
            - if tied.len == 1: return tied[0]
            - hash = idx % tied.len                # Fair tie-break
            - return tied[hash]

      total_instructions: ~250

    pass_1_cost_per_potential_cell: 250 instructions ≈ 100 cycles

  #============================================================
  # PASS 2: APPLY CHANGES (write)
  #============================================================
  pass_2_apply_changes:
    purpose: Apply computed changes, build NEXT_POTENTIAL

    clear_next_potential:
      - memset(NEXT_POTENTIAL, 0, 32KB)            # ~35,000 instructions
      - cost: ~14,000 cycles (one-time per generation)

    apply_each_change:
      for (idx, change) in changes:
        match change:

          Survives:
            - add_with_neighbors(next_potential, idx)
            - instructions: ~100
            - cost: ~40 cycles

          Birth:
            - old_cell = grid[idx]                 # 1 byte read
            - old_owner = old_cell & 0x0F
            - old_coins = old_cell >> 5
            - quadrant = get_quadrant(idx)         # ~15 instructions

            - update_quadrant_territory:           # ~50 instructions
                territory[q][old_owner]--
                territory[q][new_owner]++
                # Check 80% threshold
                total = sum(territory[q][1..9])
                threshold = total * 80 / 100
                for p in 1..9:
                  if territory[q][p] >= threshold:
                    controller[q] = p
                    break

            - check_can_collect:                   # ~30 instructions
                enemy_coins = old_owner != 0
                            && old_owner != new_owner
                            && old_coins > 0
                controls = controller[quadrant] == new_owner
                can_collect = enemy_coins && controls

            - if can_collect:                      # ~550 instructions
                principal = players[new_owner - 1]
                balances.get_mut(principal) += old_coins  # HashMap
                grid[idx] = make_cell(new_owner, true, 0)
            - else:                                # ~20 instructions
                grid[idx] = make_cell(new_owner, true, old_coins)

            - add_with_neighbors(next_potential, idx)  # ~100 instructions
            - instructions: ~750 (with collect) or ~250 (without)
            - cost: ~300 cycles avg

          Death:
            - cell = grid[idx]                     # 1 byte read
            - grid[idx] = cell & ~0x10             # 1 byte write, ~10 instr
            - for each of 8 neighbors:             # 8 iterations
                add_with_neighbors(next_potential, n_idx)  # ~100 each
            - instructions: ~850
            - cost: ~340 cycles

    pass_2_cost_per_change:
      survives: 40 cycles
      birth: 300 cycles
      death: 340 cycles
      weighted_average: ~200 cycles  # Assuming 60% survive, 20% birth, 20% die

  #============================================================
  # POST-GENERATION BOOKKEEPING
  #============================================================
  update_cell_counts:
    - for player in 1..9:                          # 9 iterations
        - apply delta to counts[player]            # ~20 instructions
        - check grace period logic                 # ~50 instructions
    - cost: ~250 cycles

  swap_potentials:
    - mem::swap(POTENTIAL, NEXT_POTENTIAL)         # ~50 instructions
    - cost: ~20 cycles

  increment_generation:
    - GENERATION += 1                              # ~10 instructions
    - cost: ~5 cycles

  #============================================================
  # TOTAL COST FORMULA
  #============================================================
  cost_formula:
    base_overhead: 14_000 cycles          # Clear NEXT_POTENTIAL
    per_potential_cell: 100 cycles        # Pass 1: compute fate
    per_change: 200 cycles                # Pass 2: apply change (avg)
    bookkeeping: 300 cycles               # Cell counts, swap, increment

    total: 14_300 + (potential * 100) + (changes * 200)
```

---

## Cost Analysis: 10% Board Fill Scenario

```yaml
#============================================================
# SCENARIO: 10% of grid filled with alive cells
#============================================================

assumptions:
  total_cells: 262_144
  fill_rate: 10%
  alive_cells: 26_214                    # 262,144 * 0.10

  # Potential set estimation:
  # Each alive cell adds itself + 8 neighbors to potential
  # With clustering, significant overlap occurs
  # Empirical ratio: potential ≈ 2.5x alive for 10% fill
  potential_cells: 65_535                # ~26,214 * 2.5

  # Change rate estimation:
  # In active Game of Life, ~10-20% of cells change per generation
  # Changes = births + deaths (survivals don't modify grid)
  # Typical distribution: 60% survive, 20% birth, 20% die
  change_rate: 15%
  changes_per_gen: 3_932                 # 26,214 * 0.15

#============================================================
# PER-GENERATION COST BREAKDOWN
#============================================================

per_generation:

  base_overhead:
    clear_next_potential: 14_000 cycles
    bookkeeping: 300 cycles
    subtotal: 14_300 cycles

  pass_1_compute_fates:
    potential_cells: 65_535
    cost_per_cell: 100 cycles
    subtotal: 6_553_500 cycles

  pass_2_apply_changes:
    changes: 3_932
    cost_per_change: 200 cycles
    subtotal: 786_400 cycles

  total_per_generation: 7_354_200 cycles
  rounded: ~7.4M cycles

#============================================================
# PER-TICK COST (10 generations)
#============================================================

per_tick:
  generations: 10
  generation_cost: 7_354_200 cycles

  wipe_check:
    overhead: 100 cycles                 # Usually no wipe
    wipe_cost: 0 cycles                  # Only every 5 min

  total_per_tick: 73_542_000 cycles
  rounded: ~73.5M cycles

#============================================================
# PER-MINUTE / PER-HOUR COSTS
#============================================================

sustained_costs:
  ticks_per_minute: 60
  ticks_per_hour: 3_600

  per_minute:
    base: 4_412_520_000 cycles           # 73.5M * 60
    with_one_wipe: 4_415_520_000 cycles  # + ~3M for wipe
    rounded: ~4.4B cycles/minute

  per_hour:
    base: 264_751_200_000 cycles         # 73.5M * 3600
    with_twelve_wipes: 264_787_200_000   # + 12 * 3M
    rounded: ~265B cycles/hour
    in_T_cycles: 0.265 T cycles/hour

#============================================================
# DAILY COST PROJECTION
#============================================================

daily_costs:
  hours: 24
  per_hour: 265_000_000_000 cycles

  total_daily: 6_360_000_000_000 cycles
  in_T_cycles: 6.36 T cycles/day

#============================================================
# MONTHLY COST PROJECTION
#============================================================

monthly_costs:
  days: 30
  per_day: 6.36 T cycles

  total_monthly: 190.8 T cycles

  # IC cycle pricing (as of 2024):
  # 1 T cycles ≈ $1.00 USD (varies by subnet)
  estimated_usd: $190.80/month

#============================================================
# COST SENSITIVITY ANALYSIS
#============================================================

sensitivity:

  # What drives cost?
  cost_breakdown_percent:
    pass_1_compute_fates: 89.1%          # 6.55M / 7.35M
    pass_2_apply_changes: 10.7%          # 0.79M / 7.35M
    overhead: 0.2%                       # 0.01M / 7.35M

  # Key insight: POTENTIAL SET SIZE dominates cost

  scaling_by_fill_rate:
    fill_1%:
      alive: 2_621
      potential: ~6_500                  # 2.5x
      changes: ~393                      # 15%
      per_gen: 800_000 cycles
      monthly: ~21 T cycles (~$21)

    fill_5%:
      alive: 13_107
      potential: ~33_000
      changes: ~1_966
      per_gen: 3_700_000 cycles
      monthly: ~96 T cycles (~$96)

    fill_10%:                            # <-- Current scenario
      alive: 26_214
      potential: ~65_500
      changes: ~3_932
      per_gen: 7_400_000 cycles
      monthly: ~191 T cycles (~$191)

    fill_20%:
      alive: 52_429
      potential: ~105_000                # Overlap increases
      changes: ~7_864
      per_gen: 12_100_000 cycles
      monthly: ~312 T cycles (~$312)

    fill_50%:
      alive: 131_072
      potential: ~180_000                # Heavy overlap
      changes: ~19_660
      per_gen: 22_000_000 cycles
      monthly: ~568 T cycles (~$568)

#============================================================
# OPTIMIZATION OPPORTUNITIES
#============================================================

optimizations:

  reduce_potential_set:
    current: 100 cycles per potential cell
    impact: 89% of total cost
    strategies:
      - "Skip stable regions (no change for N gens)"
      - "Chunk-based dirty flags"
      - "Hierarchical potential (16x16 chunks)"
    potential_savings: 30-50%

  reduce_change_cost:
    current: 200 cycles per change
    impact: 11% of total cost
    strategies:
      - "Batch HashMap updates"
      - "Defer quadrant territory updates"
      - "Remove coin collection (simplify rules)"
    potential_savings: 10-20%

  reduce_generation_rate:
    current: 10 gen/sec
    alternatives:
      5_gen_sec: 50% cost reduction
      2_gen_sec: 80% cost reduction
      1_gen_sec: 90% cost reduction
    tradeoff: "Slower gameplay"

  theoretical_minimum:
    # If only processing actual changes (no potential scan)
    per_gen: changes * 200 = 786_400 cycles
    monthly: ~20 T cycles
    vs_current: 90% reduction
    feasibility: "Requires algorithmic breakthrough"

#============================================================
# BREAK-EVEN ANALYSIS
#============================================================

break_even:

  # If canister has 10T cycles loaded:
  cycles_available: 10_000_000_000_000
  burn_rate_per_hour: 265_000_000_000

  hours_until_empty: 37.7 hours
  days_until_empty: 1.57 days

  # To sustain 30 days at 10% fill:
  cycles_needed: 190_800_000_000_000     # 190.8 T
  in_icp: ~19 ICP                        # At 10T cycles/ICP
  in_usd: ~$190                          # At $10/ICP
```
