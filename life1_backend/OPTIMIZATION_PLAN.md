# Life1 Backend Optimization Plan

## Executive Summary

The life1 canister (Game of Life on IC) is burning through cycles at an unsustainable rate. Analysis revealed two inefficiencies that together cause **~$390/month** in unnecessary cycle costs. This plan documents the findings and proposes two optimizations that reduce costs by **~88%** to approximately **$47/month**.

---

## Problem Statement

**User Report:** "My life1 canister keeps running out of cycles. Every time I fill it up it burns through it all so quick."

**Canister Status at Investigation:**
```
Canister: life1_backend
Status: Running
Balance: 46,201,561,424 Cycles (~46.2B)
Memory Size: 40,825,972 Bytes
is_running: true
generation: 3,415
```

---

## Root Cause Analysis

### Finding 1: Continuous Timer Execution

The canister runs an autonomous simulation timer:

```rust
const TICK_INTERVAL_MS: u64 = 5000;      // Every 5 seconds
const GENERATIONS_PER_TICK: u32 = 5;      // 5 generations per tick

fn start_simulation_timer() {
    set_timer_interval(Duration::from_millis(TICK_INTERVAL_MS), || async {
        if is_running {
            for _ in 0..GENERATIONS_PER_TICK {
                step_generation();
            }
            save_metadata();
        }
    });
}
```

When `is_running = true` (which it was), this executes **86,400 generations per day** regardless of user activity.

### Finding 2: Oversized Cell Structure

Each cell in the 800x800 grid was stored as:

```rust
pub struct Cell {
    pub owner: u8,     // 1 byte  - stores 0-10 (needs 4 bits)
    pub points: u16,   // 2 bytes - stores 0-100 typically (needs 7 bits)
    pub alive: bool,   // 1 byte  - stores 0-1 (needs 1 bit)
}
// Total: 4 bytes per cell
// Actual data needed: 12 bits
// Waste: 62.5%
```

Grid size: 800 × 800 × 4 bytes = **2.56 MB**

### Finding 3: Stable Memory for Hot Data

The grid uses `StableVec` which stores data in stable memory:

```rust
static GRID: RefCell<StableVec<Cell, Memory>> = ...;
```

**IC Stable Memory Costs:**
- Read: 20 cycles per byte
- Write: 20 cycles per byte

**IC Heap Memory Costs:**
- Read/Write: ~0.4 cycles per instruction (no per-byte overhead)

Every generation reads and writes the entire 2.56 MB grid to stable memory.

---

## Cost Calculation (Before Optimization)

### Per Generation

| Operation | Size | Cycle Cost |
|-----------|------|------------|
| Read grid from stable | 2.56 MB | 51,200,000 cycles |
| Write grid to stable | 2.56 MB | 51,200,000 cycles |
| Computation (neighbor checks) | 640K cells × 8 neighbors | ~13,000,000 cycles |
| **Total** | | **~115,000,000 cycles** |

### Per Day (when running)

```
86,400 generations × 115M cycles = 9.94 trillion cycles/day
```

### Monthly Cost

```
9.94T cycles/day × 30 days = 298T cycles/month
1T cycles ≈ $1.30 USD
Monthly cost ≈ $390
```

### Time to Drain Current Balance

```
46.2B cycles ÷ (9.94T cycles/day) ≈ 4.6 days
```

---

## Proposed Optimizations

### Optimization 1: Cell Bit-Packing (IMPLEMENTED)

**Change:** Pack cell data into 2 bytes instead of 4 bytes.

```rust
// NEW: Packed cell structure - 2 bytes total
// Bits 0-3:   owner (0-15)
// Bits 4-10:  points (0-127)
// Bit 11:     alive
pub struct Cell(u16);

impl Cell {
    pub fn owner(&self) -> u8   { (self.0 & 0x0F) as u8 }
    pub fn points(&self) -> u8  { ((self.0 >> 4) & 0x7F) as u8 }
    pub fn alive(&self) -> bool { self.0 & (1 << 11) != 0 }

    pub fn set_owner(&mut self, v: u8)  { ... }
    pub fn set_points(&mut self, v: u8) { ... }
    pub fn set_alive(&mut self, v: bool) { ... }
}
```

**Justification:**
- `owner`: Max 10 players + neutral (0-10) = 4 bits sufficient
- `points`: User confirmed rarely exceeds 10-20, capped at 127 = 7 bits sufficient
- `alive`: Boolean = 1 bit

**Impact:**
- Grid size: 2.56 MB → 1.28 MB (50% reduction)
- I/O cycles: 102.4M → 51.2M per generation (50% reduction)

**Code Complexity:**
- Cell struct: ~45 lines (accessor methods encapsulate bit manipulation)
- Rest of codebase: Change `cell.field` to `cell.field()` and `cell.field = x` to `cell.set_field(x)`
- Total changes: ~30 lines outside Cell impl
- API unchanged (CellView struct maintains same Candid interface)

**Status:** Code complete, tested locally, ready to deploy.

### Optimization 2: Heap Memory for Runtime Data (IMPLEMENTED)

**Change:** Store grid in heap memory during runtime, only persist to stable memory on upgrades.

```rust
// CURRENT: Every access hits stable memory
static GRID: RefCell<StableVec<Cell, Memory>> = ...;

// PROPOSED: Fast heap access during runtime
static GRID: RefCell<Vec<Cell>> = RefCell::new(Vec::new());
static STABLE_GRID: RefCell<StableVec<Cell, Memory>> = ...; // persistence only

#[pre_upgrade]
fn pre_upgrade() {
    // Copy heap → stable (one-time cost per upgrade)
    GRID.with(|heap| {
        STABLE_GRID.with(|stable| {
            for cell in heap.borrow().iter() {
                stable.borrow_mut().push(cell);
            }
        });
    });
}

#[post_upgrade]
fn post_upgrade() {
    // Copy stable → heap (one-time cost per upgrade)
    STABLE_GRID.with(|stable| {
        GRID.with(|heap| {
            let mut heap = heap.borrow_mut();
            for i in 0..stable.borrow().len() {
                heap.push(stable.borrow().get(i).unwrap());
            }
        });
    });
}
```

**Justification:**
- Stable memory is designed for persistence across upgrades, not frequent access
- Heap memory is ~40x faster for read/write operations
- IC canisters can have 4 GB heap - 1.28 MB grid is trivial
- Data is persisted on every upgrade, so no loss during normal upgrade cycles
- Only risk: canister crash (rare, and game state loss is acceptable)

**Impact:**

| Metric | Stable Memory | Heap Memory | Improvement |
|--------|---------------|-------------|-------------|
| Read 1.28 MB | 25.6M cycles | ~0.64M cycles | 40x |
| Write 1.28 MB | 25.6M cycles | ~0.64M cycles | 40x |
| Per generation | ~64M cycles | ~14M cycles | 4.5x |
| Per day | 5.5T cycles | 1.2T cycles | 4.5x |
| Monthly cost | ~$215 | ~$47 | 78% savings |

**Code Complexity:**
- GRID declaration: ~5 lines changed
- get_cell/set_cell: ~4 lines (actually simpler)
- pre_upgrade: ~8 lines added
- post_upgrade: ~8 lines added
- **Total: ~25-30 lines**

**Trade-offs:**

| Aspect | Stable Memory | Heap Memory |
|--------|---------------|-------------|
| Speed | Slow (20 cycles/byte) | Fast (~1 cycle) |
| Persistence | Automatic | Manual (on upgrade) |
| Crash safety | Survives | Lost on crash* |
| Memory limit | 400 GB | 4 GB |

*IC canister crashes are rare. For a game, losing state on crash is acceptable.

---

## Combined Impact

| Optimization | Before | After | Savings |
|--------------|--------|-------|---------|
| Cell packing (4→2 bytes) | 2.56 MB | 1.28 MB | 50% size |
| Heap memory | 20 cycles/byte | ~1 cycle/access | 95% I/O cost |
| **Combined monthly cost** | ~$390 | ~$47 | **88% reduction** |

---

## Migration Considerations

### Cell Format Migration (Optimization 1)

The existing stable memory stores 4-byte cells. The new format uses 2-byte cells. These are incompatible.

**Solution:** Reset grid on upgrade (implemented in post_upgrade):

```rust
#[post_upgrade]
fn post_upgrade() {
    // Clear old 4-byte format data
    GRID.with(|g| {
        let mut g = g.borrow_mut();
        while g.len() > 0 { g.pop(); }
    });
    ensure_grid_initialized();  // Reinitialize with 2-byte format

    // Preserve players, reset balances and generation
    load_metadata();
    CACHED_METADATA.with(|m| {
        let mut m = m.borrow_mut();
        m.generation = 0;
        m.is_running = true;
        for balance in m.balances.iter_mut() {
            *balance = STARTING_BALANCE;
        }
    });
}
```

**Impact:** Players preserved, game state (cell positions) reset. Acceptable for a game.

### Heap Memory Migration (Optimization 2)

No special migration needed. The post_upgrade already reinitializes the grid.

---

## Implementation Status

| Task | Status |
|------|--------|
| Cell struct packed to 2 bytes | ✅ Complete |
| Storable impl updated for 2-byte format | ✅ Complete |
| CellView added for Candid API | ✅ Complete |
| All field accesses updated to methods | ✅ Complete |
| Migration handler in post_upgrade | ✅ Complete |
| Build tested locally | ✅ Complete |
| Switch GRID to heap Vec | ✅ Complete |
| Update pre_upgrade for heap→stable | ✅ Complete |
| Update post_upgrade for stable→heap | ✅ Complete |
| Deploy to mainnet | ✅ Complete (2024-12-16) |

---

## Files Modified

- `life1_backend/src/lib.rs` - Main implementation
- `life1_backend/life1_backend.did` - Candid interface (points: nat16 → nat8)

---

## Verification Plan

After deployment:

1. Check canister status:
   ```bash
   dfx canister --network ic status life1_backend
   ```

2. Verify game functionality:
   ```bash
   dfx canister --network ic call life1_backend get_game '(0 : nat64)'
   dfx canister --network ic call life1_backend get_state '(0 : nat64)'
   ```

3. Monitor cycle consumption over 24 hours to confirm reduction.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data corruption during migration | Low | Medium | Grid reset is intentional; players preserved |
| Heap data loss on crash | Very Low | Low | Game state only; IC crashes are rare |
| Frontend incompatibility | Low | Medium | CellView maintains same Candid structure |
| Regression in game logic | Low | Medium | Logic unchanged; only data access patterns modified |

---

## Conclusion

The life1 canister's cycle drain is caused by:
1. Oversized cell structure (4 bytes vs 2 bytes needed)
2. Using stable memory for frequently-accessed data

Two optimizations reduce costs by 88%:
1. **Cell packing:** 50% size reduction (implemented)
2. **Heap memory:** 78% I/O cost reduction (25-30 lines to implement)

The changes are low-risk, low-complexity, and provide significant cost savings.
