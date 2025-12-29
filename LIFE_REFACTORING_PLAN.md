# Life/Risk Game - Critical Refactoring Plan

## Executive Summary

The Life game (`/life` route) is currently experiencing severe user experience issues stemming from fundamental architectural problems. This document provides exhaustive analysis and proposes a comprehensive refactoring strategy.

**Severity**: HIGH - Game is functionally broken for returning users after inactivity
**Impact**: Critical user flow completely non-functional, buttons unresponsive, 10+ second UI delays
**Root Cause**: Architectural - monolithic component with state management chaos

---

## Critical Bugs - Detailed Reproduction

### Bug #1: Ghost Re-Registration After Inactivity

**User Experience**:
1. User plays the game, establishes a base in faction X (e.g., "Fire Kingdom")
2. User leaves for extended period (hours/days)
3. User returns to `/life` route
4. **ISSUE**: Game asks them to "Choose a region" as if they're a new player
5. User's previous faction/base is not recognized

**Expected Behavior**:
- Game should recognize user's existing base
- Load them directly into gameplay view
- Show their territory and faction

**What Actually Happens**:
- `showRegionSelection = true` despite user having an existing base
- All previous session state appears lost

### Bug #2: Phantom Elimination on Rejoin

**User Experience** (continues from Bug #1):
1. User selects a NEW faction (e.g., "Water Tribe") thinking they need to rejoin
2. User clicks "Join" to enter with new faction
3. **ISSUE**: Immediately sees "💀 ELIMINATED" modal
4. Modal shows:
   - "You've been eliminated!"
   - Generations survived: [some number]
   - Two buttons: "Spectate" and "Rejoin"

**Expected Behavior**:
- User should enter game with new faction
- See fresh base placement
- Begin playing normally

**Why This Is Absurd**:
- User JUST joined the game
- How can you be eliminated before your first turn?
- No explanation given for why they're "eliminated" immediately
- Completely breaks game logic and user trust

### Bug #3: Non-Functional Modal Buttons

**User Experience** (continues from Bug #2):
1. User sees elimination modal (incorrectly)
2. Clicks "Spectate" button
   - **ISSUE**: Nothing happens, button does not respond
3. Clicks "Rejoin" button
   - **ISSUE**: Nothing happens, button does not respond
4. User is trapped in broken state

**Expected Behavior**:
- "Spectate" should close modal, show game as observer
- "Rejoin" should reset state, show region selection

**Evidence of Broken State**:
- Click events not firing
- Event handlers not bound
- Modal cannot be dismissed
- User is soft-locked

### Bug #4: Post-Refresh Zombie State

**User Experience** (continues from Bug #3):
1. User refreshes page (only escape from broken modal)
2. Page loads, shows they're in the NEW faction they selected
3. **ISSUE**: UI is completely unresponsive
   - Clicks don't register
   - Or clicks have 10-20 second delay
   - Canvas interactions freeze
   - Quadrant clicks timeout
4. Eventually UI goes black
5. UI comes back but remains unresponsive

**Expected Behavior**:
- Refresh should restore clean state
- UI should be immediately responsive
- Game should function normally

**Actual State**:
- Game is in "zombie state" - appears alive but functionally dead
- User cannot play
- Only escape is closing tab entirely

---

## Root Cause Analysis

### 1. State Management Catastrophe

**The Problem**: `Life.tsx` is 3,200+ lines with 50+ useState hooks and 30+ useRef values.

**Evidence from Code**:

```typescript
// Just a sample of the state chaos:
const [gameState, setGameState] = useState<GameState | null>(null);
const [isInitialLoading, setIsInitialLoading] = useState(true);
const [localCells, setLocalCells] = useState<Cell[]>([]);
const [myPlayerNum, setMyPlayerNum] = useState<number | null>(null);
const [myBalance, setMyBalance] = useState(0);
const [pendingPlacements, setPendingPlacements] = useState<PendingPlacement[]>([]);
const [confirmedPlacements, setConfirmedPlacements] = useState<ConfirmedPlacement[]>([]);
const [bases, setBases] = useState<Map<number, BaseInfo>>(new Map());
const [isEliminated, setIsEliminated] = useState(false);
const [isFrozen, setIsFrozen] = useState(false);
// ... and 40+ more
```

**Why This Is Broken**:
- **Race Conditions**: Multiple async operations updating overlapping state
- **Stale Closures**: Event handlers capture old state values
- **Ref Desync**: `hadBaseRef.current` vs actual state divergence
- **No Single Source of Truth**: Backend state, optimistic state, local state all conflict

### 2. The Elimination Logic Bug

**Location**: `Life.tsx:972-995`

```typescript
setMyPlayerNum(currentPlayerNum => {
  if (currentPlayerNum && hadBaseRef.current && !isEliminated) {
    const myBase = newBases.get(currentPlayerNum);

    // Player was in game but base is now gone = eliminated
    if (!myBase) {
      setIsEliminated(true);
      // ...
      hadBaseRef.current = false;
    }
  }
  return currentPlayerNum; // Don't change the value
});
```

**The Bug**:
When a user rejoins with a NEW faction after being away:
1. Old session had `hadBaseRef.current = true` for faction 1
2. User selects faction 3 (new)
3. `myPlayerNum` gets set to 3
4. Backend sync runs
5. Checks: "Does faction 3 have a base?" (YES - just created)
6. BUT previous check used OLD `currentPlayerNum` from closure
7. Finds no base for old faction → triggers elimination
8. **Result**: False positive elimination immediately after join

**Why Refs Are Dangerous Here**:
- `hadBaseRef` persists across state resets
- Not cleared when switching servers/rejoining
- Creates ghost state that haunts new sessions

### 3. Modal Button Handler Binding Failure

**Location**: `Life.tsx:1888-1898`

```typescript
const handleRejoin = useCallback(() => {
  setIsEliminated(false);
  setMyPlayerNum(null);
  setSelectedRegion(null);
  setShowRegionSelection(true);
  // ...
}, [myBalance]);
```

**The Issue**:
- Callback depends on `[myBalance]`
- If `myBalance` is stale/undefined during broken state, handler may not rebind
- Modal renders before handlers are ready
- Click events fire into void

**Evidence**:
- Buttons physically render (user can see them)
- Clicks don't trigger any state changes
- No console errors (event just doesn't fire)
- Suggests handler binding issue, not logic issue

### 4. Performance Degradation After State Corruption

**The 10+ Second Delay Mystery**:

When state becomes corrupted (after false elimination), the component enters death spiral:

1. **Excessive Re-renders**: Each state update triggers full component re-render
2. **Canvas Thrashing**: Every render redraws 512x512 grid (262,144 cells)
3. **Backend Sync Conflicts**: Optimistic local state fighting with backend state
4. **Memory Leaks**: Confirmed placements accumulate, never cleared
5. **Event Queue Backup**: Click handlers queue up during re-render storm

**Evidence from Code**:

```typescript
// This runs EVERY render (lines 1047-1400+):
const drawCells = useCallback((ctx, startX, startY, width, height, cellSize) => {
  // Draws entire visible grid
  // Territory rendering: O(n²) where n = visible cells
  // Pattern fills: 8 separate operations
  // Living cell glows: Another pass
  // Base rendering: Another pass
  // Confirmed placements overlay: Another pass
  // Pending placements: Another pass
  // Coin particles: Another pass
  // ... ALL OF THIS on EVERY render
}, [localCells, myPlayerNum, pendingPlacements, bases /* ... 20+ dependencies */]);
```

**Why This Kills Performance**:
- Draw callback has 20+ dependencies
- ANY state change → full redraw
- Corrupted state → constant state changes → infinite redraw loop
- Canvas can't keep up → UI freezes

### 5. Inactivity Detection False Positive

**The Root of Bug #1**:

**Hypothesis**: Backend has inactivity timeout that eliminates idle players

Looking at code:
```typescript
// Line 806-813
try {
  if (typeof actor.is_frozen === 'function') {
    const frozen = await actor.is_frozen();
    setIsFrozen(frozen);
  }
} catch {
  setIsFrozen(false);
}
```

**What Likely Happens**:
1. User inactive for hours/days
2. Backend marks game as "frozen" OR eliminates inactive player
3. On return, `get_slots_info()` shows empty slot (user eliminated)
4. Frontend sees no base → `showRegionSelection(true)`
5. But backend SHOULD have preserved slot or told user "you were eliminated"

**The Mismatch**:
- Backend eliminates silently
- Frontend assumes "no base = new user"
- Should show "You were eliminated due to inactivity" message
- Instead shows "Choose a region" like they never played

---

## Architectural Issues

### Issue 1: God Component Anti-Pattern

**Current State**:
- `Life.tsx`: 3,200 lines
- Single component handles:
  - Game rendering (canvas)
  - Backend synchronization
  - Authentication
  - State management
  - UI (modals, sidebars, controls)
  - Animation (particles, pulses)
  - Event handling (mouse, touch, keyboard)
  - Pattern management
  - Tutorial system
  - Server selection
  - And more...

**Why This Is Untenable**:
- **Impossible to debug**: Which of 50 states caused the bug?
- **Cannot test**: No unit testing possible for god component
- **Cannot optimize**: Everything re-renders together
- **Cannot understand**: Cognitive load too high for any developer
- **Cannot maintain**: Changes break unrelated features

### Issue 2: No State Machine

**Current Approach**: Boolean flags
```typescript
const [isLoading, setIsLoading] = useState(false);
const [isEliminated, setIsEliminated] = useState(false);
const [isFrozen, setIsFrozen] = useState(false);
const [isSpectating, ...] = ...
const [showRegionSelection, setShowRegionSelection] = useState(false);
const [showSlotSelection, setShowSlotSelection] = useState(false);
const [isJoiningSlot, setIsJoiningSlot] = useState(false);
const [isConfirmingPlacement, setIsConfirmingPlacement] = useState(false);
```

**The Problem**:
- Can have INVALID state combinations:
  - `isEliminated=true` AND `isJoiningSlot=true` (impossible!)
  - `showRegionSelection=true` AND `myPlayerNum=3` (contradiction!)
  - `isLoading=false` AND `gameState=null` (broken state!)
- No way to enforce valid transitions
- Bugs arise from impossible states

**What Should Exist**: Explicit state machine
```typescript
type GameState =
  | { status: 'initializing' }
  | { status: 'unauthenticated' }
  | { status: 'selecting-region' }
  | { status: 'joining-slot', region: RegionInfo }
  | { status: 'spectating', gameData: GameData }
  | { status: 'playing', playerNum: number, gameData: GameData }
  | { status: 'eliminated', stats: EliminationStats }
  | { status: 'frozen', playerNum: number, gameData: GameData }
  | { status: 'error', error: string }
```

This makes invalid states **impossible to represent**.

### Issue 3: Optimistic Updates Without Rollback

**Current Pattern**:
```typescript
// Add to local state immediately
setConfirmedPlacements(prev => [...prev, newPlacement]);

// Try backend call
const result = await actor.place_cells(...);

// If it fails... uh oh, local state already updated!
if (result.Err) {
  setPlacementError(parseError(result.Err));
  // But confirmed placement is still in state!
  // No rollback mechanism!
}
```

**What Goes Wrong**:
- User clicks place
- Local state updates (optimistic)
- Backend rejects (insufficient balance, collision, etc)
- Local state still shows placement
- Backend state doesn't have it
- States diverge
- Future syncs conflict
- Chaos

**Missing**:
- Transaction pattern
- Rollback on failure
- Conflict resolution strategy

### Issue 4: No Separation of Concerns

**Everything is Coupled**:

```
┌─────────────────────────────────────────────┐
│                                             │
│         Life.tsx (3200 lines)              │
│  ┌────────┬────────┬────────┬────────┐    │
│  │ Canvas │ Backend│  Auth  │   UI   │    │
│  │Rendering│  Sync │ Logic  │ Modals │    │
│  └───┬────┴───┬────┴───┬────┴───┬────┘    │
│      │        │        │        │          │
│      └────────┴────────┴────────┘          │
│         All Share Same State               │
│    (50+ useState, 30+ useRef)              │
└─────────────────────────────────────────────┘
```

**Should Be**:

```
┌──────────────────────────────────────────────┐
│  Life Game (Orchestrator - 200 lines)       │
└────┬─────┬─────┬─────┬─────┬─────┬─────────┘
     │     │     │     │     │     │
┌────▼──┐ ┌▼────┐│┌────▼┐ ┌──▼───┐│
│Canvas │ │Game ││ UI   │ │Server││
│Engine │ │State││ Layer│ │Sync  ││
│       │ │Mgmt ││      │ │      ││
└───────┘ └─────┘│└─────┘ └──────┘│
                 │                 │
            ┌────▼────┐       ┌────▼────┐
            │ Modals  │       │ Backend │
            │ System  │       │ Client  │
            └─────────┘       └─────────┘
```

### Issue 5: No Error Recovery

**Current Error Handling**:
```typescript
try {
  const state = await actor.get_state();
  setGameState(state);
} catch (err) {
  console.error('Failed:', err);
  setError(`Failed: ${parseError(err)}`);
  // Now what? User is stuck!
}
```

**Missing**:
- Retry logic
- Exponential backoff
- Fallback states
- User recovery actions
- State reset mechanism

**When Things Go Wrong**:
- Error shown
- State corrupted
- No way to recover
- User must refresh (which may also fail)

---

## Proposed Solution: Comprehensive Refactoring

### Phase 1: Extract Core Systems (Week 1)

**Goal**: Break monolith into manageable pieces

#### 1.1 Game State Management
**New File**: `src/pages/life/state/GameStateManager.ts`

```typescript
// Centralized state machine
type GamePhase =
  | 'initializing'
  | 'region-selection'
  | 'slot-selection'
  | 'playing'
  | 'spectating'
  | 'eliminated'
  | 'frozen'
  | 'error';

interface GameStateManager {
  phase: GamePhase;
  player: PlayerState | null;
  world: WorldState;

  // Pure transitions (no side effects)
  transitions: {
    selectRegion: (region: RegionInfo) => void;
    joinSlot: (slot: number) => void;
    eliminate: (stats: EliminationStats) => void;
    rejoin: () => void;
    freeze: () => void;
    unfreeze: () => void;
  };
}
```

**Benefits**:
- Single source of truth
- Valid states only
- Clear transition paths
- Testable independently

#### 1.2 Backend Synchronization Service
**New File**: `src/pages/life/services/BackendSync.ts`

```typescript
class BackendSyncService {
  private actor: ActorSubclass<_SERVICE>;
  private syncInterval: NodeJS.Timer;

  // Observable state
  public state$: Observable<GameState>;

  // Clean separation
  async fetchInitialState(): Promise<GameState> { }
  async placePattern(cells: Cell[]): Promise<Result<void, string>> { }
  async requestFaucet(): Promise<Result<number, string>> { }

  // Automatic sync with conflict resolution
  startSync(intervalMs: number): void { }
  stopSync(): void { }
}
```

**Benefits**:
- Encapsulated backend logic
- Retry/error handling in one place
- Observable pattern for state updates
- No ref/state desync

#### 1.3 Canvas Rendering Engine
**New File**: `src/pages/life/rendering/CanvasEngine.ts`

```typescript
class CanvasEngine {
  private ctx: CanvasRenderingContext2D;
  private renderQueue: RenderCommand[];

  // Batched rendering
  queueRender(command: RenderCommand): void { }
  flush(): void { } // Actually draw to canvas

  // Optimized draw methods
  drawTerritory(owner: number, cells: Cell[]): void { }
  drawLivingCells(cells: Cell[]): void { }
  drawBases(bases: Map<number, BaseInfo>): void { }

  // Animation frame management
  startRenderLoop(): void { }
  stopRenderLoop(): void { }
}
```

**Benefits**:
- Rendering logic isolated
- Can optimize without touching game logic
- Render batching eliminates thrashing
- RequestAnimationFrame properly managed

#### 1.4 UI Component Breakdown
**New Files**:
- `src/pages/life/components/RegionSelectionModal.tsx`
- `src/pages/life/components/SlotSelectionModal.tsx`
- `src/pages/life/components/EliminationModal.tsx`
- `src/pages/life/components/GameSidebar.tsx`
- `src/pages/life/components/GameCanvas.tsx`
- `src/pages/life/components/PatternLibrary.tsx`

**Each Component**:
- Single responsibility
- Props in, events out
- No direct state manipulation
- 100-300 lines each (reasonable)

### Phase 2: Fix Core Bugs (Week 1-2)

#### 2.1 Fix Elimination Logic

**Before**:
```typescript
// Scattered across 100+ lines with refs
setMyPlayerNum(currentPlayerNum => {
  if (currentPlayerNum && hadBaseRef.current && !isEliminated) {
    // Complex ref-based logic
  }
  return currentPlayerNum;
});
```

**After**:
```typescript
// In GameStateManager
function checkElimination(
  previousState: PlayerState,
  newBases: Map<number, BaseInfo>
): GamePhase {
  const hadBase = previousState.hasBase;
  const hasBase = newBases.has(previousState.playerNum);

  if (hadBase && !hasBase) {
    return 'eliminated'; // Clear transition
  }
  return 'playing'; // No change
}
```

**Why This Fixes It**:
- No refs (pure function)
- Previous state passed explicitly (no closure issues)
- Returns new phase (state machine enforces validity)
- Testable with simple inputs/outputs

#### 2.2 Fix Inactivity Flow

**New Flow**:
```typescript
// On page load
async function initializeGame() {
  const slots = await backend.getSlots();
  const mySlot = slots.find(s => s.principal === myPrincipal);

  if (!mySlot) {
    // Check if user WAS in game before
    const history = await backend.getPlayerHistory(myPrincipal);

    if (history.wasEliminated) {
      return {
        phase: 'eliminated',
        reason: history.eliminationReason, // "inactivity" | "defeated"
        stats: history.stats
      };
    } else {
      return {
        phase: 'region-selection',
        isNewPlayer: true
      };
    }
  }

  return {
    phase: 'playing',
    playerNum: mySlot.index,
    resuming: true
  };
}
```

**Messages to User**:
- "You were eliminated due to inactivity" (if inactive)
- "You were defeated" (if legitimately eliminated)
- "Choose your region" (if actually new)
- "Resuming as Fire Kingdom" (if returning active player)

#### 2.3 Fix Modal Button Handlers

**Before**:
```typescript
const handleRejoin = useCallback(() => {
  setIsEliminated(false);
  setMyPlayerNum(null);
  setSelectedRegion(null);
  setShowRegionSelection(true);
}, [myBalance]); // Fragile dependency
```

**After**:
```typescript
// In EliminationModal component
function EliminationModal({
  stats,
  onRejoin,
  onSpectate
}: EliminationModalProps) {
  return (
    <Modal>
      <button onClick={() => onRejoin()}>Rejoin</button>
      <button onClick={() => onSpectate()}>Spectate</button>
    </Modal>
  );
}

// In parent orchestrator
function handleRejoin() {
  gameState.transitions.rejoin(); // State machine handles it
}
```

**Why This Fixes It**:
- Handlers passed as props (no closure issues)
- Component rerender guaranteed when props change
- State transitions explicit and managed
- Modal is pure presentation component

### Phase 3: Performance Optimization (Week 2)

#### 3.1 Implement Render Batching

```typescript
class RenderBatcher {
  private dirty: Set<CellIndex> = new Set();
  private frameRequested = false;

  markDirty(cellIndex: CellIndex) {
    this.dirty.add(cellIndex);
    this.requestFrame();
  }

  private requestFrame() {
    if (!this.frameRequested) {
      this.frameRequested = true;
      requestAnimationFrame(() => this.render());
    }
  }

  private render() {
    // Only redraw dirty cells
    for (const cellIndex of this.dirty) {
      this.drawCell(cellIndex);
    }
    this.dirty.clear();
    this.frameRequested = false;
  }
}
```

**Impact**:
- Full grid redraw: 262,144 operations
- Dirty cell redraw: ~10-100 operations
- **99%+ reduction in draw calls**

#### 3.2 Debounce State Updates

```typescript
// Before: Every click updates state immediately
function handleCanvasClick(x, y) {
  setPendingPlacements(prev => [...prev, newPlacement]);
}

// After: Batch updates
function handleCanvasClick(x, y) {
  placementBuffer.push(newPlacement);
  debouncedFlush();
}

const debouncedFlush = debounce(() => {
  setPendingPlacements(prev => [...prev, ...placementBuffer]);
  placementBuffer = [];
}, 100);
```

**Impact**:
- 10 rapid clicks: 10 renders → 1 render
- **90% fewer re-renders**

#### 3.3 Memoize Expensive Computations

```typescript
// Before: Recalculates EVERY render
const territoryCounts = cellCounts.reduce(...); // O(n)
const sortedPlayers = Object.entries(territoryCounts).sort(...); // O(n log n)

// After: Only recalculate when cells change
const territoryCounts = useMemo(
  () => cellCounts.reduce(...),
  [cellCounts]
);
```

### Phase 4: Add Robust Error Recovery (Week 2-3)

#### 4.1 Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  backoff = 1000
): Promise<Result<T, string>> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      return { ok: true, value: result };
    } catch (err) {
      if (i === maxRetries - 1) {
        return { ok: false, error: parseError(err) };
      }
      await sleep(backoff * Math.pow(2, i));
    }
  }
}
```

#### 4.2 State Snapshots for Rollback

```typescript
class StateManager {
  private history: GameState[] = [];

  snapshot() {
    this.history.push(cloneDeep(this.state));
  }

  rollback() {
    const previous = this.history.pop();
    if (previous) {
      this.state = previous;
    }
  }

  async optimisticUpdate<T>(
    update: () => void,
    backendCall: () => Promise<T>
  ): Promise<Result<T, string>> {
    this.snapshot();
    update(); // Apply optimistically

    const result = await backendCall();
    if (result.ok) {
      this.history = []; // Commit
    } else {
      this.rollback(); // Revert
    }
    return result;
  }
}
```

#### 4.3 User-Facing Recovery Actions

```typescript
function ErrorBoundary({ error }: { error: string }) {
  return (
    <div className="error-panel">
      <p>Something went wrong: {error}</p>
      <button onClick={() => gameState.transitions.reset()}>
        Reset Game State
      </button>
      <button onClick={() => window.location.reload()}>
        Reload Page
      </button>
      <button onClick={() => gameState.transitions.toSpectate()}>
        Spectate Mode
      </button>
    </div>
  );
}
```

### Phase 5: Testing & Validation (Week 3)

#### 5.1 Unit Tests

```typescript
describe('GameStateManager', () => {
  it('should transition from region-selection to slot-selection', () => {
    const manager = new GameStateManager();
    manager.transitions.selectRegion(FireKingdom);

    expect(manager.phase).toBe('slot-selection');
    expect(manager.selectedRegion).toBe(FireKingdom);
  });

  it('should detect elimination correctly', () => {
    const manager = new GameStateManager();
    manager.phase = 'playing';
    manager.player = { playerNum: 1, hasBase: true };

    const newBases = new Map(); // No base for player 1
    manager.checkElimination(newBases);

    expect(manager.phase).toBe('eliminated');
  });

  it('should NOT show elimination on fresh join', () => {
    const manager = new GameStateManager();
    manager.phase = 'slot-selection';
    manager.transitions.joinSlot(3);

    // Should NOT be eliminated (Bug #2)
    expect(manager.phase).toBe('playing');
    expect(manager.phase).not.toBe('eliminated');
  });
});
```

#### 5.2 Integration Tests

```typescript
describe('Player Rejoin Flow', () => {
  it('should restore existing player without re-registration', async () => {
    // Setup: Player already in game
    mockBackend.setSlots([
      { index: 0, principal: 'user-principal', hasBase: true }
    ]);

    // Act: User loads page
    const { result } = renderHook(() => useGameState());
    await waitFor(() => result.current.phase === 'playing');

    // Assert: No region selection shown
    expect(result.current.phase).toBe('playing');
    expect(result.current.playerNum).toBe(1);
    expect(screen.queryByText('Choose a region')).not.toBeInTheDocument();
  });

  it('should show inactivity message for eliminated players', async () => {
    // Setup: Player was eliminated due to inactivity
    mockBackend.setPlayerHistory({
      wasEliminated: true,
      reason: 'inactivity',
      stats: { /* ... */ }
    });
    mockBackend.setSlots([]); // No current slot

    // Act: User loads page
    const { result } = renderHook(() => useGameState());
    await waitFor(() => result.current.phase === 'eliminated');

    // Assert: Shows elimination with reason
    expect(screen.getByText(/eliminated due to inactivity/i)).toBeInTheDocument();
    expect(result.current.eliminationReason).toBe('inactivity');
  });
});
```

#### 5.3 Performance Tests

```typescript
describe('Canvas Performance', () => {
  it('should render 60 FPS with 1000 cells', async () => {
    const engine = new CanvasEngine(canvas);
    const cells = generateCells(1000);

    const fps = await measureFPS(() => {
      engine.drawCells(cells);
    }, duration: 1000);

    expect(fps).toBeGreaterThan(55); // Allow 5fps margin
  });

  it('should batch rapid clicks', () => {
    const renderSpy = jest.fn();
    const { result } = renderHook(() => useGameState({ onRender: renderSpy }));

    // Rapid fire 10 clicks
    for (let i = 0; i < 10; i++) {
      result.current.handleClick(i, i);
    }

    // Should only render once after debounce
    jest.advanceTimersByTime(150);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
```

---

## Migration Strategy

### Step 1: Create Parallel Implementation
- Don't delete old code yet
- Build new system alongside
- Feature flag to switch between old/new

### Step 2: Gradual Migration
Week 1:
- Extract state management
- Route to new state manager
- Keep old rendering

Week 2:
- Extract rendering engine
- Route to new renderer
- Keep old UI components

Week 3:
- Extract UI components
- Full new system
- Remove feature flag

### Step 3: Validation
- Run both systems in parallel
- Compare state outputs
- Log discrepancies
- Fix until 100% match

### Step 4: Cleanup
- Remove old code
- Update documentation
- Deploy to mainnet

---

## Success Criteria

### Must Fix (P0)
- ✅ No false "Choose a region" for existing players
- ✅ No phantom elimination on fresh join
- ✅ Modal buttons always functional
- ✅ UI responsive < 100ms click-to-response
- ✅ No state corruption after refresh

### Should Fix (P1)
- ✅ Clear messaging for inactivity elimination
- ✅ Graceful error recovery
- ✅ < 500ms initial load time
- ✅ 60 FPS canvas rendering
- ✅ Offline mode (graceful degradation)

### Nice to Have (P2)
- ✅ State persistence (survive refresh)
- ✅ Undo/redo for placements
- ✅ Replay mode for eliminated players
- ✅ Analytics/telemetry
- ✅ Onboarding tutorial improvements

---

## Estimated Effort

**Total**: 2-3 weeks (1 senior engineer)

**Breakdown**:
- Week 1: Architecture + State Management (40 hours)
- Week 2: Rendering + Performance (30 hours)
- Week 3: Testing + Migration (30 hours)

**Risk**: Medium
- No backend changes needed
- Can run in parallel with old code
- Incremental migration reduces risk

**Reward**: High
- Fixes all critical bugs
- 10x performance improvement
- Maintainable codebase
- Enables future features

---

## Conclusion

The Life game is architecturally unsound. The current implementation is a 3,200-line god component with:
- 50+ interdependent states
- No state machine (invalid states possible)
- Broken elimination detection
- Non-functional UI after state corruption
- 10+ second response times

**This is not a "few bug fixes" situation. This requires systematic refactoring.**

The good news: The game logic itself is sound. The backend is fine. The issues are entirely in the frontend architecture. A comprehensive refactoring following this plan will:

1. **Fix all critical bugs** (ghost re-registration, phantom elimination, broken buttons)
2. **Improve performance** by 10-100x (render batching, state optimization)
3. **Enable maintainability** (small focused components vs monolith)
4. **Prevent future bugs** (state machine prevents invalid states)

**Recommendation**: Allocate 2-3 weeks for this refactoring. The alternative is continued user frustration, growing technical debt, and eventual complete rewrite (6+ weeks).

This is a critical investment in the platform's future.
