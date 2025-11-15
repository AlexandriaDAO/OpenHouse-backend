# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-bug-fix"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-bug-fix`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Frontend changes only:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh --frontend-only
     ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"

   # Manual test: Drop multiple balls in succession to verify bug is fixed
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix(plinko): resolve ball drop animation stuck in 'Dropping...' state"
   git push -u origin feature/plinko-bug-fixes
   gh pr create --title "Fix: Resolve Plinko ball drop animation freeze" --body "Implements PLINKO_BUG_FIX_PLAN.md

Fixes frozen ball animation and 'Dropping...' button state.

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canister: openhouse_frontend (pezw3-laaaa-aaaal-qssoa-cai)

## Root Cause
Multiple useEffect hooks with conflicting logic and incorrect dependency arrays caused race conditions where:
1. Animation state never properly reset between drops
2. onAnimationComplete callback was never called
3. isPlaying state remained stuck as true

## Solution
Simplified animation logic with single source of truth and proper effect dependencies."
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/plinko-bug-fixes`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-bug-fix`

---

# Implementation Plan

## Current State Documentation

### Backend Status (Verified Working ✓)
- **File**: `plinko_backend/src/lib.rs`
- **Tested via dfx**:
  ```
  dfx canister --network ic call plinko_backend drop_ball '(16, variant { High })'
  dfx canister --network ic call plinko_backend drop_ball '(8, variant { Low })'
  dfx canister --network ic call plinko_backend drop_ball '(12, variant { Medium })'
  ```
- **Result**: All calls return instantly with correct `path`, `final_position`, and `multiplier`
- **Conclusion**: Backend has ZERO issues

### Frontend Bug (Confirmed Issue ❌)

**File**: `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx`

**Problem Symptoms**:
- Ball drops once successfully
- On subsequent drops, ball appears frozen at top
- Button stuck in "Dropping..." state indefinitely
- `isPlaying` state never returns to `false`
- `onAnimationComplete` callback never fires

**Root Cause Analysis**:

The component has THREE competing useEffect hooks trying to manage animation state:

#### Effect #1 (Lines 28-40): "Reset on New Path"
```typescript
useEffect(() => {
  if (path && isDropping) {
    if (animationRef.current) {
      clearTimeout(animationRef.current);
      animationRef.current = null;
    }
    setAnimationPhase('idle');
    setBallPosition(null);
  }
}, [path]); // 🐛 BUG: Missing 'isDropping' dependency!
```
**Issues**:
- Dependency array has only `[path]` but checks `isDropping` inside
- Violates React hooks rules (exhaustive-deps)
- Won't trigger when `isDropping` changes if `path` stays same

#### Effect #2 (Lines 43-83): "Animate Ball Drop"
```typescript
useEffect(() => {
  if (path && isDropping && animationPhase === 'idle') {
    setAnimationPhase('dropping');
    // ... animation logic ...

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }
}, [path, isDropping, animationPhase, onAnimationComplete]);
```
**Issues**:
- Depends on `animationPhase` being 'idle', but Effect #1 sets it asynchronously
- Race condition: Effect #1 might run but state update not applied when Effect #2 checks
- Cleanup only exists when condition is true, leading to inconsistent behavior
- `onAnimationComplete` in deps can cause unnecessary re-runs

#### Effect #3 (Lines 86-93): "Reset After Drop Complete"
```typescript
useEffect(() => {
  if (!isDropping && animationPhase !== 'idle') {
    setTimeout(() => {
      setBallPosition(null);
      setAnimationPhase('idle');
    }, 1000);
  }
}, [isDropping, animationPhase]);
```
**Issues**:
- Delays reset by 1 second after drop completes
- Creates timing issues for rapid successive drops
- Competes with Effect #1 for state management

**Sequence of Events (First Drop - Works)**:
1. User clicks → `isPlaying=true`, `currentResult=null` → `path=null`
2. Backend returns → `path=newPath`
3. Effect #1 triggers (path changed), sets `animationPhase='idle'`
4. Effect #2 sees `path && isDropping && animationPhase='idle'` → starts animation
5. Animation completes → calls `onAnimationComplete()` → `isPlaying=false`
6. Effect #3 resets after 1 second

**Sequence of Events (Second Drop - BREAKS)**:
1. User clicks → `isPlaying=true`, `currentResult=null` → `path=null`
2. Effect #1 checks `if (path && isDropping)` → `path` is null → **DOESN'T RESET!**
3. Backend returns → `path=newPath`
4. Effect #1 triggers, checks condition → TRUE → sets `animationPhase='idle'`
5. Effect #2 triggers from same render
6. **BUG**: Effect #2 checks `animationPhase === 'idle'` but state hasn't updated yet!
7. `animationPhase` is still 'complete' or 'dropping' from previous drop
8. Animation never starts!
9. `onAnimationComplete` never called
10. `isPlaying` stays true forever → **STUCK**

## Implementation Changes

### Fix: Simplify Animation Logic (MODIFY)

**File**: `openhouse_frontend/src/components/game-specific/plinko/PlinkoBoard.tsx`

#### Strategy
- **Remove** competing effects
- **Single source of truth**: Use a key-based approach to force re-render
- **Guarantee** cleanup happens
- **Ensure** callback is called

#### 1. Remove Problematic State Management
```typescript
// PSEUDOCODE - Remove these useEffect hooks entirely

// DELETE Effect #1 (lines 28-40) - Reset on new path
// DELETE Effect #3 (lines 86-93) - Reset after complete

// KEEP Effect #2 but modify it significantly
```

#### 2. Add Key-Based Reset Mechanism
```typescript
// PSEUDOCODE - Add after line 26

const [animationKey, setAnimationKey] = useState(0);

// Simple effect: When new path arrives, increment key to force fresh animation
useEffect(() => {
  if (path && isDropping) {
    setAnimationKey(prev => prev + 1);
  }
}, [path, isDropping]); // Proper dependencies
```

#### 3. Refactor Animation Effect
```typescript
// PSEUDOCODE - Replace Effect #2 (lines 43-83)

useEffect(() => {
  // Don't start if no path or not dropping
  if (!path || !isDropping) {
    return;
  }

  // Start animation immediately
  let currentRow = 0;
  let currentColumn = 0;
  const timeouts: number[] = [];

  setBallPosition({ row: 0, column: 0 });

  const animateStep = () => {
    if (currentRow < path.length) {
      currentRow++;
      if (path[currentRow - 1]) {
        currentColumn++;
      }

      setBallPosition({ row: currentRow, column: currentColumn });
      const timeoutId = window.setTimeout(animateStep, 150);
      timeouts.push(timeoutId);
    } else {
      // Animation complete - call callback after short delay
      const completeTimeout = window.setTimeout(() => {
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }, 500);
      timeouts.push(completeTimeout);
    }
  };

  // Start animation
  const initialTimeout = window.setTimeout(animateStep, 200);
  timeouts.push(initialTimeout);

  // Cleanup: ALWAYS cancel all timeouts
  return () => {
    timeouts.forEach(clearTimeout);
    setBallPosition(null);
  };
}, [animationKey]); // Only depend on animationKey - guaranteed to change for each drop
```

**Key Improvements**:
1. ✅ Single effect controls entire animation lifecycle
2. ✅ Cleanup ALWAYS runs (not conditional)
3. ✅ All timeouts tracked and cancelled together
4. ✅ `animationKey` ensures fresh start for each drop
5. ✅ Callback GUARANTEED to be called when animation completes
6. ✅ No race conditions between multiple effects

#### 4. Simplify Component Logic
```typescript
// PSEUDOCODE - Remove animationPhase state entirely (line 25)
// DELETE: const [animationPhase, setAnimationPhase] = useState<...>('idle');

// Keep only:
// - ballPosition (for rendering)
// - animationKey (for forcing resets)
```

#### 5. Update CSS Classes
```typescript
// PSEUDOCODE - Update ball rendering (around line 140-145)

{ballPosition && (
  <div
    className="plinko-ball"
    style={getBallStyle()}
  />
)}

// Remove references to animationPhase in className
// Simplify to just "plinko-ball"
```

## Testing Requirements

**NONE REQUIRED** - This is experimental pre-production. Manual verification only.

### Manual Testing Checklist (After Deployment)
1. Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
2. Navigate to Plinko game
3. Drop 5 balls in rapid succession
4. Verify:
   - [ ] Each ball animates smoothly
   - [ ] Button returns to "DROP BALL" after each drop
   - [ ] No "Dropping..." stuck state
   - [ ] Win messages display correctly
   - [ ] History updates with each drop

## Deployment Notes

**Affected Canister:**
- `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai) - Frontend UI fixes

**Pre-deployment:**
- No backend changes needed (backend verified working)
- Only frontend build required

**Post-deployment:**
- Verify button state transitions correctly
- Test rapid successive drops
- Confirm animation completes for each drop

---

**END OF PLAN**

The plan is ready with embedded PR orchestrator.

When done, return this prompt to the user: "Execute @/home/theseus/alexandria/openhouse-plinko-bug-fix/PLINKO_BUG_FIX_PLAN.md"

The implementing agent MUST:
1. Read the orchestrator header (cannot skip - it's at the top)
2. Verify worktree isolation
3. Implement the plan
4. Deploy to mainnet (mandatory)
5. Create PR (mandatory step)
6. Iterate autonomously until approved
