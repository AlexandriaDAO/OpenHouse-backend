# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-clippy-cleanup"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-clippy-cleanup`
2. **Implement changes** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ./deploy.sh
   ```
4. **Verify with clippy**:
   ```bash
   # These should show fewer warnings after fixes
   cargo clippy --target wasm32-unknown-unknown -p plinko_backend -- -W clippy::nursery 2>&1 | grep -c "redundant clone"
   cargo clippy --target wasm32-unknown-unknown -p dice_backend -- -W clippy::nursery 2>&1 | grep -c "redundant clone"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "perf: remove redundant clones and improve idioms in plinko/dice backends"
   git push -u origin feature/clippy-cleanup
   gh pr create --title "Perf: Clippy cleanup - remove redundant clones" --body "$(cat <<'EOF'
## Summary
Performance and code quality improvements identified by clippy:

- **Remove 20 redundant `Nat` clones** - `Nat` is heap-allocated, cloning is real overhead
- **Use `abs_diff()` instead of manual if/else** - cleaner, more idiomatic
- **Use `.first()` instead of `.get(0)`** - more idiomatic
- **Use `map_or()` instead of `map().unwrap_or()`** - slightly more efficient

## Changes by file

### plinko_backend
- `src/lib.rs`: Use `abs_diff()` and `.first()`
- `src/defi_accounting/liquidity_pool.rs`: Remove 10 redundant clones, use `map_or()`
- `src/defi_accounting/statistics/queries.rs`: Use `map_or()`

### dice_backend
- `src/defi_accounting/liquidity_pool.rs`: Remove 10 redundant clones, use `map_or()`
- `src/defi_accounting/statistics/queries.rs`: Use `map_or()`

## Test plan
- [x] `cargo clippy --target wasm32-unknown-unknown -p plinko_backend` - reduced warnings
- [x] `cargo clippy --target wasm32-unknown-unknown -p dice_backend` - reduced warnings
- [x] `cargo build --target wasm32-unknown-unknown --release` - compiles
- [x] Deploy to mainnet successful

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: plinko_backend, dice_backend

Generated with Claude Code
EOF
)"
   ```
6. **Iterate autonomously** until approved or max 5 iterations

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/clippy-cleanup`
**Worktree:** `/home/theseus/alexandria/openhouse-clippy-cleanup`

---

# Implementation Plan: Clippy Cleanup

## Task Classification
**REFACTORING** - Targeted performance and idiom improvements.

## Summary of Changes

| Category | Plinko | Dice | Total | Impact |
|----------|--------|------|-------|--------|
| Redundant clones | 10 | 10 | 20 | **Perf** - `Nat` heap allocations |
| `abs_diff()` | 1 | 0 | 1 | Cleaner code |
| `.first()` | 1 | 0 | 1 | Cleaner code |
| `map_or()` | 6 | 6 | 12 | Slightly more efficient |

---

## Part 1: Plinko Backend

### 1.1 Use `abs_diff()` in lib.rs

**File:** `plinko_backend/src/lib.rs` (line ~120)

```rust
// BEFORE:
let distance = if position > CENTER_POSITION {
    position - CENTER_POSITION
} else {
    CENTER_POSITION - position
} as u64;

// AFTER:
let distance = position.abs_diff(CENTER_POSITION) as u64;
```

### 1.2 Use `.first()` in lib.rs

**File:** `plinko_backend/src/lib.rs` (line ~406)

```rust
// BEFORE:
let random_byte = random_bytes.get(0)

// AFTER:
let random_byte = random_bytes.first()
```

### 1.3 Remove redundant clones in liquidity_pool.rs

**File:** `plinko_backend/src/defi_accounting/liquidity_pool.rs`

| Line | Before | After |
|------|--------|-------|
| 129 | `pool_state.reserve.clone()` | `pool_state.reserve` |
| 249 | `entry.value().0.clone()` | `entry.value().0` |
| 258 | `s.0.clone()` | `s.0` (but see map_or below) |
| 295 | `sn.0.clone()` | `sn.0` (but see map_or below) |
| 303 | `pool_state.reserve.clone()` | `pool_state.reserve` |
| 412 | `sn.0.clone()` | `sn.0` (but see map_or below) |
| 424 | `sn.0.clone()` | `sn.0` (but see map_or below) |
| 439 | `pool_reserve.clone()` | `pool_reserve` |
| 495 | `entry.value().0.clone()` | `entry.value().0` |
| 703 | `entry.value().0.clone()` | `entry.value().0` |

### 1.4 Use `map_or()` in liquidity_pool.rs

**File:** `plinko_backend/src/defi_accounting/liquidity_pool.rs`

```rust
// Line 258 - BEFORE:
let current = shares_map.get(&caller).map(|s| s.0.clone()).unwrap_or(Nat::from(0u64));
// AFTER:
let current = shares_map.get(&caller).map_or(Nat::from(0u64), |s| s.0);

// Line 295 - BEFORE:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
// AFTER:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&caller).map_or(Nat::from(0u64), |sn| sn.0));

// Line 412 - BEFORE:
let shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
// AFTER:
let shares = LP_SHARES.with(|s| s.borrow().get(&caller).map_or(Nat::from(0u64), |sn| sn.0));

// Line 424 - BEFORE:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&user).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
// AFTER:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&user).map_or(Nat::from(0u64), |sn| sn.0));
```

### 1.5 Use `map_or()` in statistics/queries.rs

**File:** `plinko_backend/src/defi_accounting/statistics/queries.rs`

```rust
// Line 101 - BEFORE:
snapshots.get(start_idx - 1).map(|s| s.pool_reserve_end).unwrap_or(0)
// AFTER:
snapshots.get(start_idx - 1).map_or(0, |s| s.pool_reserve_end)

// Line 105 - BEFORE:
snapshots.get(0).map(|s| { ... }).unwrap_or(0)
// AFTER:
snapshots.get(0).map_or(0, |s| { ... })
```

---

## Part 2: Dice Backend

### 2.1 Remove redundant clones in liquidity_pool.rs

**File:** `dice_backend/src/defi_accounting/liquidity_pool.rs`

| Line | Before | After |
|------|--------|-------|
| 129 | `pool_state.reserve.clone()` | `pool_state.reserve` |
| 252 | `entry.value().0.clone()` | `entry.value().0` |
| 261 | `s.0.clone()` | `s.0` (but see map_or below) |
| 298 | `sn.0.clone()` | `sn.0` (but see map_or below) |
| 306 | `pool_state.reserve.clone()` | `pool_state.reserve` |
| 416 | `sn.0.clone()` | `sn.0` (but see map_or below) |
| 428 | `sn.0.clone()` | `sn.0` (but see map_or below) |
| 443 | `pool_reserve.clone()` | `pool_reserve` |
| 499 | `entry.value().0.clone()` | `entry.value().0` |
| 707 | `entry.value().0.clone()` | `entry.value().0` |

### 2.2 Use `map_or()` in liquidity_pool.rs

**File:** `dice_backend/src/defi_accounting/liquidity_pool.rs`

```rust
// Line 261 - BEFORE:
let current = shares_map.get(&caller).map(|s| s.0.clone()).unwrap_or(Nat::from(0u64));
// AFTER:
let current = shares_map.get(&caller).map_or(Nat::from(0u64), |s| s.0);

// Line 298 - BEFORE:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
// AFTER:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&caller).map_or(Nat::from(0u64), |sn| sn.0));

// Line 416 - BEFORE:
let shares = LP_SHARES.with(|s| s.borrow().get(&caller).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
// AFTER:
let shares = LP_SHARES.with(|s| s.borrow().get(&caller).map_or(Nat::from(0u64), |sn| sn.0));

// Line 428 - BEFORE:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&user).map(|sn| sn.0.clone()).unwrap_or(Nat::from(0u64)));
// AFTER:
let user_shares = LP_SHARES.with(|s| s.borrow().get(&user).map_or(Nat::from(0u64), |sn| sn.0));
```

### 2.3 Use `map_or()` in statistics/queries.rs

**File:** `dice_backend/src/defi_accounting/statistics/queries.rs`

Same pattern as plinko - check for `map().unwrap_or()` patterns and convert to `map_or()`.

---

## Verification

After all changes, run:
```bash
# Should show 0 redundant clone warnings
cargo clippy --target wasm32-unknown-unknown -p plinko_backend -- -W clippy::nursery 2>&1 | grep "redundant clone" | wc -l

cargo clippy --target wasm32-unknown-unknown -p dice_backend -- -W clippy::nursery 2>&1 | grep "redundant clone" | wc -l

# Should show 0 manual_abs_diff warnings
cargo clippy --target wasm32-unknown-unknown -p plinko_backend 2>&1 | grep "manual_abs_diff"

# Should show 0 get_first warnings
cargo clippy --target wasm32-unknown-unknown -p plinko_backend 2>&1 | grep "get_first"
```

## Affected Canisters
- `plinko_backend` (weupr-2qaaa-aaaap-abl3q-cai)
- `dice_backend` (whchi-hyaaa-aaaao-a4ruq-cai)

## Impact
- **Performance**: Eliminates ~20 unnecessary heap allocations per LP operation
- **Code quality**: More idiomatic Rust patterns
- **No behavioral changes**: Pure refactoring
