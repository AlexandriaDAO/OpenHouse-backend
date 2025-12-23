# Risk (Life2) - Claude Development Guide

## The Core Challenge

**Real-time Conway's Game of Life on the Internet Computer with 1000ms+ query latency.**

This game requires smooth 8 FPS animation while staying synchronized with authoritative backend state. IC queries are free but slow (800-2000ms typical). This creates a fundamental tension between visual smoothness and multiplayer accuracy.

## Architecture: Optimistic Local Simulation

```
Frontend                              Backend (IC Canister)
────────                              ──────────────────────
Local GOL sim ◄──── periodic sync ────► Authoritative state
8 gen/sec                              8 gen/sec
(visual smoothness)                    (game truth: sieges, territory, coins)
```

**Key insight:** Frontend runs simplified Game of Life for smooth animation. Backend runs full game logic (sieges, disconnection, wipes). Periodic sync corrects frontend drift.

## Rate Matching is Critical

Both must run at exactly the same generation rate:

```rust
// Backend: risk_backend/lib.rs
const GENERATIONS_PER_TICK: u32 = 8;   // 8 gen/sec
const TICK_INTERVAL_MS: u64 = 1000;
```

```typescript
// Frontend: riskConstants.ts
export const LOCAL_TICK_MS = 125;      // 8 gen/sec (1000/125 = 8)
```

**If rates mismatch:** Frontend drifts ahead/behind, syncs fail, multiplayer breaks.

## Sync Strategy

The sync logic in `Risk.tsx` handles the latency problem:

```typescript
// Only sync when:
// 1. Backend is AHEAD of local (we're behind, need real state)
// 2. Local drifted too far (>16 gens = 2 seconds)
// 3. Force sync timeout (5 seconds safety net)

const backendAhead = genDiff < 0;           // Backend has newer state
const localTooFarAhead = genDiff > 16;      // We drifted too much
const needsForceSync = timeSinceLastSync >= 5000;
```

**Why this works:**
- When local runs slightly fast, skip sync (let backend catch up)
- When backend is ahead, always sync (it has real game events we missed)
- Prevents constant back-and-forth visual jitter

## Frontend Limitations

The frontend local simulation does NOT implement:
- Siege mechanics (births blocked at enemy bases, coin transfers)
- Territory disconnection checks
- Quadrant wipes
- Grace period elimination

These only exist in the backend. The frontend is a "good enough" visual approximation between syncs.

## Key Constants (riskConstants.ts)

| Constant | Value | Purpose |
|----------|-------|---------|
| `LOCAL_TICK_MS` | 125 | Local sim rate (must match backend) |
| `BACKEND_SYNC_MS` | 500 | Query interval |
| `FORCE_SYNC_MS` | 5000 | Max time before forced resync |
| `SYNC_TOLERANCE_GENS` | 16 | Max acceptable drift before sync |

## What We Tried (and Failed)

1. **Backend-only display** - Too choppy (1-2 FPS effective)
2. **Aggressive query parallelism** - Responses arrive stale and out-of-order
3. **Strict stale detection** - Rejected everything, never synced
4. **Rate mismatch** - Frontend ran 2x faster, backend responses always stale

## Debugging Sync Issues

Console logs to watch:
```
[SYNC] {correction: -3, reason: "catchup"}  ← Good: forward correction
[SYNC] {correction: 25, reason: "drift"}    ← Warning: large backward jump
[SYNC] {reason: "force"}                    ← Fallback: force sync triggered
```

If you see constant `[SYNC]` with oscillating corrections, the sync logic is too aggressive.
If you see no `[SYNC]` for long periods, responses are all being rejected as stale.

## Game Mechanics (Backend Only)

### Siege
When enemy cells try to birth in your base's 8x8 protection zone:
- Birth is prevented
- 1 coin transferred from your base to attacker's wallet
- Base at 0 coins = elimination

### Disconnection
Territory must stay orthogonally connected to your base interior. If connection is cut (by wipe or enemy expansion), all disconnected territory is cleared and cells killed.

### Quadrant Wipes
Every 5 minutes, one 128x128 quadrant is wiped. Cycles through all 16 quadrants.

## Deployment

```bash
# Backend
cargo build --release -p risk_backend --target wasm32-unknown-unknown
dfx canister --network ic install risk_backend --mode upgrade

# Frontend
cd openhouse_frontend && npm run build
dfx canister --network ic install openhouse_frontend --mode upgrade
```

**Important:** Always clean rebuild backend to ensure changes take effect:
```bash
rm -rf target/wasm32-unknown-unknown/release/risk_backend*
rm -rf .dfx/ic/canisters/risk_backend
dfx build --network ic risk_backend
```
