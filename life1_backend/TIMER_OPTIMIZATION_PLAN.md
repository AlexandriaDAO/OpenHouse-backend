# Risk Backend Timer Optimization Plan

## Problem Statement

The risk_backend canister burns approximately **1.7 trillion cycles per day** while completely idle (no players, no cells). At current IC pricing (~$1.30 per trillion cycles), this costs ~$2.20/day or ~$66/month for a game nobody is playing.

## Benchmarking Analysis

### Methodology

We added instrumentation to measure cycle consumption using `ic0.performance_counter(0)` for instruction counting, tracking:
- `tick()` - main timer callback
- `step_generation()` - Conway's Game of Life computation
- `compute_fates()` - cell fate determination
- `apply_changes()` - births/deaths application
- `wipe_quadrant()` - quadrant clearing

### Findings

#### Measured vs Actual Cycle Consumption

| Metric | Value |
|--------|-------|
| Benchmark-measured instructions per tick | ~83,000 |
| Actual cycles consumed per tick | ~20,000,000 |
| Overhead ratio | **~240x** |

The benchmark only captures instruction execution. The actual cost includes:
- **Update message base fee**: ~590,000 cycles per call
- **Timer scheduling overhead**: IC infrastructure for `ic_cdk_timers`
- **Subnet message processing**: Consensus and execution overhead

#### Timer Configuration (Current)

| Setting | Value | Daily Calls |
|---------|-------|-------------|
| `TICK_INTERVAL_MS` | 1,000ms (1 second) | 86,400 |
| `WIPE_INTERVAL_NS` | 300 seconds (5 min) | 288 |

The timer fires **86,400 times per day** regardless of game activity.

#### Cycle Burn Calculation

```
Actual cost per tick:     ~20,000,000 cycles
Ticks per day:            86,400
Daily burn:               1,728,000,000,000 cycles (~1.7T)
Monthly burn:             ~52T cycles (~$68/month)
```

#### Idle Optimization (Implemented)

We added a check to skip generation computation when no cells exist:

```rust
let has_activity = POTENTIAL.with(|p| {
    p.borrow().iter().any(|&w| w != 0)
});

if has_activity {
    // Run 10 generations
} else {
    // Just increment counter
}
```

**Result**: Instruction count dropped from ~2.5M to ~83K per tick when idle.

**Problem**: The timer overhead (~20M cycles) still dominates. Skipping computation saves only ~2.4M cycles per tick (~12% of total cost).

## Root Cause

The expense comes from **timer frequency**, not computation complexity.

Each `ic_cdk_timers` callback is an update message to the canister. The IC charges for:
1. Message ingress and processing
2. Consensus participation
3. State certification
4. Timer infrastructure management

These costs are **fixed per callback**, regardless of what code runs inside.

## Proposed Solution: Lazy Evaluation

### Design Principles

1. **No continuous timer** - Eliminate the 1-second tick loop entirely
2. **Compute on demand** - Calculate generations when state is requested or modified
3. **5-minute wipe timer** - Single low-frequency timer for quadrant wipes only
4. **Player actions trigger updates** - Each `place_cells` or `join_game` computes catch-up generations

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Current Design                          │
├─────────────────────────────────────────────────────────────┤
│  Timer (1 sec) ──► tick() ──► 10 generations                │
│                          ──► wipe check                     │
│                          ──► grace period check             │
│                                                             │
│  Cost: ~20M cycles × 86,400/day = 1.7T cycles/day          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Proposed Design                         │
├─────────────────────────────────────────────────────────────┤
│  Timer (5 min) ──► wipe_and_maintenance()                   │
│                          ──► catch-up generations           │
│                          ──► quadrant wipe                  │
│                          ──► grace period check             │
│                                                             │
│  Player Action ──► catch_up_to_now()                        │
│  (place_cells)        ──► compute missing generations       │
│  (join_game)          ──► then execute action               │
│                                                             │
│  Query ──► get_state()                                      │
│               ──► catch_up_to_now()                         │
│               ──► return current state                      │
│                                                             │
│  Cost: ~20M cycles × 288/day = 5.8B cycles/day             │
│  Savings: 99.7% reduction                                   │
└─────────────────────────────────────────────────────────────┘
```

### State Changes

Add to persisted state:
```rust
/// Nanosecond timestamp of last generation computation
last_computed_ns: u64,

/// Generation count at last computation
last_computed_generation: u64,
```

### Core Function: catch_up_to_now()

```rust
fn catch_up_to_now() {
    let now = ic_cdk::api::time();
    let elapsed_ns = now - last_computed_ns;

    // 10 generations per second = 1 generation per 100ms
    let generations_to_run = elapsed_ns / 100_000_000;

    if generations_to_run > 0 {
        for _ in 0..generations_to_run {
            step_generation();
        }
        last_computed_ns = now;
        last_computed_generation += generations_to_run;
    }
}
```

### Modified Functions

#### get_state() - Query
```rust
#[ic_cdk::query]
fn get_state() -> GameState {
    // Note: Queries cannot mutate state, so we compute
    // a "virtual" current state without persisting
    let virtual_state = compute_state_at_time(ic_cdk::api::time());
    virtual_state
}
```

**Challenge**: Queries cannot mutate state. Options:
1. Make `get_state` an update call (costs cycles but ensures consistency)
2. Keep as query, compute virtually without persisting (stateless catch-up)
3. Hybrid: query returns last-computed state, frontend interpolates

#### place_cells() - Update
```rust
#[ic_cdk::update]
fn place_cells(cells: Vec<(i32, i32)>) -> Result<u32, String> {
    catch_up_to_now();  // Compute all pending generations first
    // ... existing placement logic
}
```

#### join_game() - Update
```rust
#[ic_cdk::update]
fn join_game(base_x: i32, base_y: i32) -> Result<u8, String> {
    catch_up_to_now();  // Ensure state is current
    // ... existing join logic
}
```

#### Wipe Timer (5-minute interval)
```rust
fn wipe_and_maintenance() {
    catch_up_to_now();

    // Wipe happens every 5 minutes by design, timer matches
    wipe_quadrant(current_quadrant);
    advance_quadrant();

    check_grace_periods();
}
```

### Catch-up Bounds

Maximum catch-up computation (worst case):
- 5 minutes = 300 seconds
- 10 generations/second = 3,000 generations
- ~288K instructions per generation (from benchmarks)
- Total: ~864M instructions = well under IC limits

This is acceptable because:
1. IC instruction limit per message is 5 billion
2. 864M is only 17% of that limit
3. Computation is O(alive cells), not O(grid size)
4. Empty grid = near-zero computation

### Multiplayer Responsiveness

**Concern**: Will players see each other's moves quickly enough?

**Analysis**:
- Player A places cells → triggers `catch_up_to_now()` + placement
- Player B queries `get_state` 1-2 seconds later → sees Player A's cells
- Latency: 1-2 seconds (frontend poll interval)

**This is acceptable because**:
1. Conway's Game of Life is not a real-time twitch game
2. Cells evolve over seconds, not milliseconds
3. Frontend can optimistically render local predictions
4. 1-2 second sync delay is imperceptible for this game type

### Frontend Behavior

#### Key Insight: Queries Are Free

On the Internet Computer, **query calls do not consume cycles**. Only update calls (mutations) cost cycles. This means:

- `get_state()` - **FREE** (query)
- `get_alive_bitmap()` - **FREE** (query)
- `place_cells()` - costs cycles (update)
- `join_game()` - costs cycles (update)

The frontend can poll as frequently as it wants without increasing backend costs.

#### Recommended Frontend Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Behavior                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  On Page Load:                                              │
│    1. Call get_state() to fetch initial state              │
│    2. Start local Game of Life simulation                  │
│    3. Start polling interval                               │
│                                                             │
│  Every 1-2 seconds (polling):                              │
│    1. Call get_state() (FREE - no cycle cost)              │
│    2. Backend computes virtual state at current time       │
│    3. Frontend receives authoritative state                │
│    4. Reconcile local simulation with server state         │
│    5. Other players' moves become visible                  │
│                                                             │
│  Between polls (local simulation):                         │
│    1. Run Conway's Game of Life rules locally              │
│    2. Render each generation (~100ms intervals)            │
│    3. Gives smooth 10 gen/sec animation                    │
│    4. Local-only until next server sync                    │
│                                                             │
│  On User Action (place_cells):                             │
│    1. Optimistically render placement locally              │
│    2. Call place_cells() on backend (costs cycles)         │
│    3. Backend does catch_up_to_now() + placement           │
│    4. On response, reconcile any discrepancies             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Polling Frequency Tradeoffs

| Poll Interval | Multiplayer Latency | Backend Impact |
|---------------|---------------------|----------------|
| 500ms | Very responsive | None (queries free) |
| 1 second | Good | None |
| 2 seconds | Acceptable | None |
| 5 seconds | Noticeable lag | None |

**Recommendation**: Poll every 1-2 seconds. This provides good multiplayer responsiveness while keeping frontend network usage reasonable. Since queries are free, there's no backend cost concern.

#### What the Frontend Sees

1. **Local simulation runs continuously** at 10 generations/second for smooth animation
2. **Server sync every 1-2 seconds** provides authoritative state and other players' moves
3. **Discrepancies are rare** because Conway's rules are deterministic
4. **Other players' actions appear** within 1-2 seconds (next poll)

The user experience is identical to the current 1-second timer design, but the backend cost drops by 99.7%.

## Cost Comparison

| Scenario | Current Design | Proposed Design | Savings |
|----------|---------------|-----------------|---------|
| Idle (no players) | 1.7T cycles/day | 5.8B cycles/day | 99.7% |
| Active (1 player polling 1/sec) | 1.7T + queries | 5.8B + queries | 99.7% |
| Burst (10 actions/min) | 1.7T + updates | 5.8B + updates | 99.7% |

The savings come entirely from reducing timer callbacks from 86,400/day to 288/day.

## Implementation Checklist

- [ ] Add `last_computed_ns` and `last_computed_generation` to state
- [ ] Add `last_computed_ns` to `PersistedState` for upgrades
- [ ] Implement `catch_up_to_now()` function
- [ ] Modify `place_cells()` to call catch-up first
- [ ] Modify `join_game()` to call catch-up first
- [ ] Change timer from 1-second to 5-minute interval
- [ ] Rename timer callback to `wipe_and_maintenance()`
- [ ] Update `get_state()` to compute virtual current state
- [ ] Handle upgrade migration (set initial `last_computed_ns`)
- [ ] Update tests if any exist
- [ ] Deploy and verify cycle consumption
- [ ] Remove benchmarking code after verification (optional)

## Risks and Mitigations

### Risk: Catch-up computation exceeds instruction limit
**Mitigation**: 5-minute maximum = 3,000 generations = ~864M instructions, well under 5B limit.

### Risk: Query staleness confuses users
**Mitigation**: Frontend polls frequently and interpolates; backend state is always <5 min stale.

### Risk: Race conditions during catch-up
**Mitigation**: All mutations are single-threaded in IC; catch-up runs before any state modification.

### Risk: Wipe timing drift
**Mitigation**: Wipes are time-based, not tick-based; 5-min timer aligns with 5-min wipe interval.

## Critical Problem: Query Computation Paradox

### The Fundamental Issue

The lazy evaluation design has a fatal flaw that requires rethinking the entire approach.

**The paradox:**
1. Backend timer runs every 5 minutes to save cycles
2. Frontend polls every 1-2 seconds for responsive multiplayer
3. Queries cannot mutate state (IC constraint)
4. Therefore, queries return stale data OR must recompute on every call

### Why This Breaks Down

#### Option A: Queries Return Stale Data

If `get_state()` simply returns the last persisted state:

```
Timeline:
  0:00 - Timer fires, state computed and persisted
  0:01 - User polls → gets state from 0:00 (1 sec stale)
  0:30 - User polls → gets state from 0:00 (30 sec stale)
  2:00 - User polls → gets state from 0:00 (2 min stale)
  4:59 - User polls → gets state from 0:00 (5 min stale!)
  5:00 - Timer fires, state updated
```

**Problem**: Users see the game frozen for up to 5 minutes between timer ticks. The frontend's local simulation diverges completely from server state. Other players' moves don't appear until the next timer tick. This is unacceptable for any real-time multiplayer experience.

#### Option B: Queries Compute Virtually

If `get_state()` computes the current state on-the-fly without persisting:

```rust
#[ic_cdk::query]
fn get_state() -> GameState {
    let elapsed = now() - last_persisted_time;
    let generations = elapsed / 100ms;

    // Clone entire state, run N generations, return result
    // Does NOT persist (queries are read-only)
    virtual_compute(generations)
}
```

**Problem**: Every query recomputes the same generations redundantly.

```
Timeline (3 users polling every 1 second):
  0:01 - User A polls → compute 10 generations
  0:01 - User B polls → compute 10 generations (same work!)
  0:01 - User C polls → compute 10 generations (same work!)
  0:02 - User A polls → compute 20 generations
  0:02 - User B polls → compute 20 generations (same work!)
  0:02 - User C polls → compute 20 generations (same work!)
  ...
  4:59 - User A polls → compute 2,990 generations
  4:59 - User B polls → compute 2,990 generations (same work!)
  4:59 - User C polls → compute 2,990 generations (same work!)
```

With 3 users polling every second over 5 minutes:
- Total query calls: 3 users × 300 seconds = 900 queries
- Average generations per query: ~1,500 (midpoint)
- Total generations computed: 900 × 1,500 = 1,350,000 generations
- Actual generations that occurred: 3,000

**We compute 450x more than necessary.**

At ~288K instructions per generation:
- Wasted computation: 1,347,000 × 288K = 388 billion instructions

This defeats the purpose of optimization entirely. We save cycles on timer overhead but waste them on redundant query computation.

#### Option C: Make get_state() an Update Call

If we change `get_state()` from a query to an update call, it can persist:

```rust
#[ic_cdk::update]  // Changed from query
fn get_state() -> GameState {
    catch_up_to_now();  // Compute and persist
    return_current_state()
}
```

**Problem**: Update calls cost cycles. We're back to paying for every poll.

- 3 users × 1 poll/second × 86,400 seconds = 259,200 update calls/day
- Each update call has ~590K base fee + computation
- Back to massive cycle burn, possibly worse than the original timer

### Why This Needs Complete Rethinking

The lazy evaluation approach assumes we can defer computation and serve it cheaply via queries. But IC's query/update dichotomy creates an impossible tradeoff:

| Approach | Freshness | Efficiency | Cycle Cost |
|----------|-----------|------------|------------|
| Stale queries | 5 min lag | Efficient | Low |
| Virtual compute | Fresh | Massively redundant | Low but wasteful |
| Update-based get_state | Fresh | Efficient | High |
| Original 1-sec timer | Fresh | Efficient | High |

**There is no free lunch.** Real-time state requires either:
1. Frequent timer updates (current design, expensive)
2. Frequent update calls from clients (equally expensive)
3. Accepting stale data (bad UX)

### Possible Alternative Approaches

The design needs to be reconsidered from first principles:

#### 1. Accept Slower Game Speed
- Change game to 1 generation per second instead of 10
- Timer can fire every 5-10 seconds instead of every 1 second
- Reduces timer overhead by 5-10x while maintaining freshness
- Tradeoff: Game feels slower, less dynamic

#### 2. Client-Authoritative with Periodic Sync
- Frontend runs the simulation authoritatively
- Backend only stores checkpoints every N minutes
- Player actions submit "action + expected state hash"
- Backend validates and reconciles conflicts
- Tradeoff: Complex conflict resolution, potential cheating

#### 3. Batch Timer with Interpolation Hints
- Timer fires every 30-60 seconds
- Response includes "generation velocity" hint
- Frontend interpolates between syncs
- Tradeoff: Still some staleness, complex reconciliation

#### 4. Hybrid Activity-Based Scaling
- When players are active: fast timer (1-5 seconds)
- When idle: slow timer (5 minutes) or no timer
- Detect activity via recent player actions
- Tradeoff: Complexity, edge cases around activity detection

#### 5. Accept the Cost for Active Games
- Keep 1-second timer when players are present
- Only optimize for truly idle state (no players, no cells)
- Accept that active games cost cycles
- Tradeoff: Only saves money when game is unused

### Conclusion of This Section

The original lazy evaluation proposal is fundamentally flawed because it ignores the query computation cost. A real solution requires either:

1. Accepting slower gameplay
2. Accepting the cycle cost for real-time updates
3. A more sophisticated architecture that trades complexity for efficiency

Further analysis and prototyping is needed before implementing any solution.

## Conclusion

### What We Know

The current 1-second timer design burns **~1.7T cycles/day** (~$2.20/day) in IC overhead alone, regardless of game activity. This cost comes from timer callback overhead (~20M cycles each), not computation.

### What We Proposed

Lazy evaluation with a 5-minute timer would reduce idle costs to ~5.8B cycles/day - a **99.7% reduction**.

### Why It Doesn't Work

The proposal has a fundamental flaw: IC queries cannot mutate state, so frequent polling either returns stale data or requires redundant recomputation on every query. There is no way to have fresh, efficient, low-cost state queries simultaneously.

### Next Steps

Before implementing any solution, we need to:

1. **Decide on acceptable tradeoffs** - Is 5-10 second staleness okay? Is higher cost for active games acceptable?
2. **Prototype alternative approaches** - Test activity-based timer scaling or client-authoritative models
3. **Consider game design changes** - Would slower generation speed (1/sec instead of 10/sec) be acceptable?
4. **Benchmark alternatives** - Measure actual costs of different approaches before committing

The simplest viable solution may be **Option 5: Accept the cost for active games** - keep the 1-second timer when players are present, but stop it entirely when the game is truly idle (no players, no cells). This captures most of the savings (idle games are free) while maintaining the current UX for active games.
