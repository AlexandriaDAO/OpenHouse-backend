# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-animation-fix"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-animation-fix`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Frontend changes only:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   echo "Test the Dice game at: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix: dice animation lands on consensus result immediately"
   git push -u origin feature/dice-animation-consensus-fix
   gh pr create --title "Fix: Dice animation now lands on actual rolled number" --body "Fixes dice animation bug where animation would stop on a random number, then change to the actual result a moment later.

## Changes
- Modified DiceAnimation.tsx to continue random number cycling until backend returns result
- Animation now transitions immediately to actual rolled number when consensus is reached
- Eliminates jarring number change after animation stops

## Testing
Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Dice game: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

## Affected Components
- Frontend canister: pezw3-laaaa-aaaal-qssoa-cai
- File: openhouse_frontend/src/components/game-specific/dice/DiceAnimation.tsx"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
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

**Branch:** `feature/dice-animation-consensus-fix`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-animation-fix`

---

# Implementation Plan: Fix Dice Animation Consensus Bug

## Task Classification
**BUG FIX** - Restore correct behavior with minimal changes

## Current State

### Problem Description
The Dice game has a UI bug where the animation behavior is jarring:
1. User clicks "ROLL"
2. Animation shows rapidly changing random numbers for ~2 seconds
3. Animation stops on a random number (whatever was last generated)
4. **BUG**: Half a second later, the number suddenly changes to the actual consensus result
5. This confuses users because they see two different numbers

### Root Cause Analysis

**File: `openhouse_frontend/src/components/game-specific/dice/DiceAnimation.tsx`**

The bug is caused by two independent timers running in parallel:

1. **Random number animation timer** (lines 30-58):
   - Runs for fixed `ROLL_DURATION` (2000ms)
   - Cycles through random numbers every 33ms
   - Stops after ~60 frames (2000ms / 33ms)
   - Leaves `displayNumber` stuck on last random value

2. **Backend result handler** (lines 61-87):
   - Triggered when `targetNumber` (backend result) arrives
   - Calculates `remainingTime` = max(500ms, 2000ms + 100ms - elapsed)
   - Waits `remainingTime` before updating `displayNumber` to actual result
   - This delay creates the jarring "number changes after animation stops" effect

### Current Code Flow
```
User clicks ROLL
  ↓
isRolling = true (from parent)
  ↓
useEffect #1 triggers: Start random number animation
  ↓ (33ms intervals for 2000ms)
Random numbers: 42 → 67 → 12 → 89 → ... → 37
  ↓ (2000ms elapsed)
Interval clears, displayNumber stuck at 37
  ↓
Backend returns: targetNumber = 54
  ↓
useEffect #2 triggers: Calculate remainingTime
  ↓
remainingTime = max(500ms, 2100ms - 2000ms) = 500ms
  ↓
Wait 500ms... (displayNumber still shows 37)
  ↓
setTimeout fires: displayNumber = 54
  ↓
USER SEES: 37 → (pause) → 54  ← JARRING!
```

### Affected Files
- `openhouse_frontend/src/components/game-specific/dice/DiceAnimation.tsx` (MODIFY)
- `openhouse_frontend/src/components/game-specific/dice/DiceAnimation.css` (no changes needed)
- `openhouse_frontend/src/pages/Dice.tsx` (no changes needed)

### Affected Components
- **Frontend canister only**: `pezw3-laaaa-aaaal-qssoa-cai`
- No backend changes required

## Implementation Plan

### Strategy
**Do NOT add new infrastructure. Fix in place with minimal changes.**

The fix should:
1. Continue random number animation until backend result arrives
2. When backend result arrives, immediately transition to it (no delay)
3. Keep the visual rolling animation CSS intact for good UX

### Solution: Dynamic Animation Duration

Instead of fixed 2000ms animation + delay, make animation continue until backend responds:

**Key Changes:**
1. Don't stop the random number interval after 2000ms - let it run until backend result
2. When `targetNumber` arrives, immediately clear interval and show result
3. Remove the `remainingTime` delay logic

### Pseudocode Implementation

**File: `openhouse_frontend/src/components/game-specific/dice/DiceAnimation.tsx`**

```typescript
// PSEUDOCODE - Fix the animation timing

const DiceAnimation: React.FC<DiceAnimationProps> = ({
  targetNumber,
  isRolling,
  onAnimationComplete
}) => {
  const [displayNumber, setDisplayNumber] = useState(0);
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'rolling' | 'complete'>('idle');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start rolling animation when isRolling becomes true
  useEffect(() => {
    if (isRolling) {
      setAnimationPhase('rolling');
      setDisplayNumber(0);

      // Start infinite random number cycling (will be stopped when backend returns)
      intervalRef.current = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 101));
      }, FRAME_INTERVAL); // 33ms

      // Cleanup interval on unmount
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [isRolling]);

  // When backend returns result, IMMEDIATELY show it (no delay)
  useEffect(() => {
    if (targetNumber !== null && animationPhase === 'rolling') {
      // Stop the random number animation immediately
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Show the actual result immediately (no setTimeout!)
      setDisplayNumber(targetNumber);
      setAnimationPhase('complete');

      // Call completion callback
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    }
  }, [targetNumber, animationPhase, onAnimationComplete]);

  // Reset when not rolling
  useEffect(() => {
    if (!isRolling && animationPhase === 'complete') {
      const timeoutId = setTimeout(() => {
        setAnimationPhase('idle');
      }, RESULT_DISPLAY_DURATION);

      return () => clearTimeout(timeoutId);
    }
  }, [isRolling, animationPhase]);

  // Render (same as before, no changes)
  return (
    <div className="dice-container">
      <div className={`dice-cube ${animationPhase === 'rolling' ? 'rolling-animation' : ''}`}>
        <div className="dice-face">
          <span className="dice-number">{displayNumber}</span>
        </div>
        {animationPhase === 'rolling' && (
          <div className="rolling-effects"></div>
        )}
      </div>
      {animationPhase === 'complete' && targetNumber !== null && (
        <div className="result-glow"></div>
      )}
    </div>
  );
};
```

### Key Changes Summary
1. **Add `intervalRef`**: Store interval ID in a ref so we can clear it from outside the effect
2. **Remove maxFrames logic**: Don't automatically stop after 2000ms
3. **Remove remainingTime logic**: When backend returns, show result immediately
4. **Clear interval on result**: Stop random cycling as soon as we have the actual number
5. **No setTimeout**: Update displayNumber synchronously when backend responds

### Expected Behavior After Fix
```
User clicks ROLL
  ↓
isRolling = true
  ↓
Random numbers cycling: 42 → 67 → 12 → 89 → ... (continues indefinitely)
  ↓
Backend returns: targetNumber = 54 (could be 500ms, 1000ms, 3000ms - doesn't matter!)
  ↓
Interval cleared immediately
  ↓
displayNumber = 54 (instant transition)
  ↓
USER SEES: ... → 89 → 54 ← SMOOTH!
```

## Testing Requirements

**NONE REQUIRED** - This is experimental pre-production. Manual verification only.

### Manual Testing on Mainnet
After deployment, test at: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

1. Click "ROLL" multiple times
2. Verify the dice number cycles randomly
3. Verify when animation stops, it lands IMMEDIATELY on the actual result
4. Verify there is NO jarring "number changes after stopping" behavior
5. Test with different network conditions (fast/slow responses)

### Optional Build Check
```bash
cd /home/theseus/alexandria/openhouse-dice-animation-fix/openhouse_frontend
npm run build
```

## Deployment Strategy

**Frontend only deployment:**
```bash
cd /home/theseus/alexandria/openhouse-dice-animation-fix
cd openhouse_frontend && npm run build && cd ..
./deploy.sh
```

**Affected canisters:**
- Frontend: `pezw3-laaaa-aaaal-qssoa-cai`

**No backend changes** - Dice backend canister `whchi-hyaaa-aaaao-a4ruq-cai` is not affected.

## Risks & Considerations

### Low Risk
- This is a pure UI fix with no backend changes
- No game logic affected
- No financial calculations changed
- Only affects visual presentation

### Edge Cases Handled
1. **Very fast backend response** (< 500ms): Animation will still cycle for at least a few frames before showing result
2. **Very slow backend response** (> 3s): Animation will keep cycling until result arrives (better than stopping on wrong number)
3. **Component unmount during animation**: Cleanup function clears interval properly
4. **Multiple rapid rolls**: Each roll properly resets animation state

## Success Criteria
- [ ] Animation cycles through random numbers while waiting for backend
- [ ] Animation stops on the ACTUAL rolled number from consensus
- [ ] No jarring "number changes after animation stops" behavior
- [ ] Smooth user experience regardless of backend response time
- [ ] Frontend builds without errors
- [ ] Deployment to mainnet succeeds
- [ ] Manual testing confirms fix on live site

## Rollback Plan
If issues arise, revert the single file change:
```bash
git revert <commit-hash>
git push
cd openhouse_frontend && npm run build && cd ..
./deploy.sh
```
