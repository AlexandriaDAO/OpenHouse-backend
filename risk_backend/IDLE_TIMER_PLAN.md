# Risk Backend: Idle Timer Optimization

## Goal

Stop the timer when the board is empty. Restart when cells are placed.

## Logic

1. **In `tick()`**: After running generations, if ALIVE bitmap is empty → `stop_timer()`
2. **In `place_cells()`**: If timer not running → `start_timer()`

## Why This Works

- Wipes happen every 5 minutes, clearing quadrants
- If no one plays for ~1 hour, all 16 quadrants get wiped
- Empty board = no point running generations = stop timer
- When player places cells, game resumes

## File

`risk_backend/lib.rs`

## Changes

### 1. Add `stop_timer()` function

```rust
fn stop_timer() {
    TIMER_ID.with(|t| {
        if let Some(id) = t.borrow_mut().take() {
            ic_cdk_timers::clear_timer(id);
        }
    });
}
```

### 2. Add `is_timer_running()` helper

```rust
fn is_timer_running() -> bool {
    TIMER_ID.with(|t| t.borrow().is_some())
}
```

### 3. Modify `tick()` - Stop if board empty

At end of tick(), after generations run:
```rust
let board_empty = ALIVE.with(|a| a.borrow().iter().all(|&w| w == 0));
if board_empty {
    stop_timer();
}
```

### 4. Modify `place_cells()` - Start if timer stopped

At start of place_cells():
```rust
if !is_timer_running() {
    start_timer();
}
```

## That's It

4 small changes. Timer stops when board empties, restarts when cells placed.
