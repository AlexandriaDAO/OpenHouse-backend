# Backend Tick Rate Change Plan
## Goal: Change from 10 gen/sec to 8 gen/sec

⚠️ **IMPORTANT DISCOVERY:** Frontend and backend are currently MISMATCHED!
- **Backend:** 10 gen/sec (10 generations per 1000ms tick)
- **Frontend:** 20 gen/sec (50ms interval)
- **This mismatch causes visible drift/snapping!**

**Current State:**
- Backend: 10 gen/sec (1000ms timer × 10 gens/tick)
- Frontend: 20 gen/sec (50ms local tick)

**Target State:** Both at 8 gen/sec
- Backend: 8 gens/tick (change `GENERATIONS_PER_TICK`)
- Frontend: 125ms local tick (change `LOCAL_TICK_MS`)

---

## Components to Change

### 1. **Backend Generations Per Tick** ⭐ MAIN CHANGE

**File:** `risk_backend/lib.rs:49`

**Current:**
```rust
const GENERATIONS_PER_TICK: u32 = 10;  // 10 gen/sec (with 1000ms timer)
```

**Change to:**
```rust
const GENERATIONS_PER_TICK: u32 = 8;   // 8 gen/sec (with 1000ms timer)
```

**This is the ONLY backend change needed!**
- Timer stays at 1000ms
- Just run 8 generations per tick instead of 10

---

### 2. **Frontend Local Simulation Rate** ⭐ CRITICAL

**File:** `openhouse_frontend/src/pages/riskConstants.ts:50`

**Current:**
```typescript
export const LOCAL_TICK_MS = 50;  // 20 generations/second (WRONG - doesn't match backend!)
```

**Change to:**
```typescript
export const LOCAL_TICK_MS = 125;  // 8 generations/second to match backend
```

**Note:** Frontend is currently running at 20 gen/sec while backend is at 10 gen/sec!
This mismatch causes drift. Fixing to 8 gen/sec will align both and improve stability.

---

### 4. **Backend Sync Interval** (Optional Adjustment)

**File:** `openhouse_frontend/src/pages/riskConstants.ts:51`

**Current:** `BACKEND_SYNC_MS = 500`
**Consideration:** With slower tick rate, you might want to sync less frequently

**Options:**
- Keep at 500ms (sync every 4 backend generations)
- Increase to 1000ms (sync every 8 backend generations)
- Decrease to 250ms (sync every 2 backend generations)

**Recommendation:** Keep at 500ms initially, adjust if needed based on testing

---

## Implementation Steps

### Phase 1: Backend Changes
1. **Find timer code** in `risk_backend/src/lib.rs`
   ```bash
   cd risk_backend
   grep -n "set_timer_interval\|Duration::from_millis" src/*.rs
   ```

2. **Change interval** from 50ms to 125ms

3. **Update any constants** mentioning tick rate

4. **Deploy backend:**
   ```bash
   ./deploy.sh --backend-only  # or specific flag for risk_backend
   ```

### Phase 2: Frontend Changes
1. **Update `LOCAL_TICK_MS`** to 125ms

2. **Build and deploy frontend:**
   ```bash
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```

### Phase 3: Testing
1. **Place a glider** on clean board
2. **Observe movement:** Should move 1 cell diagonally every 4 generations = 2 cells/second
3. **Check logs:** Look for `[OUT-OF-ORDER]` warnings
   - Many warnings = frontend/backend still mismatched
   - Few/no warnings = rates synchronized
4. **Watch for drift:** Glider should stay consistent, not jump position on syncs

---

## Verification Checklist

- [ ] Backend timer changed to 125ms
- [ ] Backend constants updated (if any exist)
- [ ] Backend deployed to mainnet
- [ ] Frontend `LOCAL_TICK_MS` = 125
- [ ] Frontend built and deployed
- [ ] Glider test shows smooth movement at 2 cells/sec
- [ ] Minimal `[OUT-OF-ORDER]` warnings in console
- [ ] No position jumps on backend sync (every 500ms)

---

## Rollback Plan

If issues arise:

**Backend:**
```rust
// Revert timer to 50ms
Duration::from_millis(50)
```

**Frontend:**
```typescript
export const LOCAL_TICK_MS = 50;
```

Redeploy both components.

---

## Expected User Experience After Change

**Current (Frontend: 20 gen/sec, Backend: 10 gen/sec):**
- Glider moves 5 cells/second locally
- Snaps/jumps every 500ms due to rate mismatch
- Feels janky despite out-of-order protection

**After (Both: 8 gen/sec):**
- Glider moves 2 cells/second smoothly
- Minimal drift/snapping (rates match!)
- More relaxed pace, easier to observe
- Better for strategic gameplay
- No more "too fast" feeling

---

## Notes

- **IC Timer Resolution:** IC timers have ~1ms resolution, so 125ms is precise
- **Cycles Cost:** Slower tick rate = fewer timer calls = slightly lower cycles usage
- **Multiplayer:** All clients see same tick rate (backend-driven)
- **No data loss:** Changing tick rate doesn't affect game state, just simulation speed

---

**Created:** 2025-12-22
**For:** Risk backend tick rate adjustment (20 → 8 gen/sec)
