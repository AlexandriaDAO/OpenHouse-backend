# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-auth-ux"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-auth-ux`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Frontend changes only
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   echo "Test scenarios:"
   echo "1. Try to play without logging in → Should see 'Please log in to play'"
   echo "2. Log in with 0 balance → Should see deposit button pulse/animate"
   echo "3. Deposit ICP → Animation should stop, can play normally"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): improve auth UX and add deposit prompt animation"
   git push -u origin feature/dice-auth-deposit-ux
   gh pr create --title "feat(dice): Improve authentication UX and deposit prompt" --body "## Summary
Fixes confusing UX where unauthenticated users see 'Insufficient balance' error instead of being prompted to log in.

## Changes
1. Added authentication check before allowing dice rolls
2. Clear 'Please log in to play' message for unauthenticated users
3. Visual deposit button animation when authenticated users have 0 balance
4. Consistent with Mines game authentication pattern

## User Flow
- **Anonymous user** → 'Please log in to play'
- **Authenticated, 0 balance** → Deposit button pulses/glows to draw attention
- **Authenticated, insufficient balance** → Backend error with balance details
- **Sufficient balance** → Normal play

## Testing
Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

Manual test scenarios completed:
1. Anonymous user play attempt ✓
2. Authenticated user with 0 balance ✓
3. Deposit flow ✓"
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

**Branch:** `feature/dice-auth-deposit-ux`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-auth-ux`

---

# Implementation Plan: Dice Authentication & Deposit UX Improvements

## Task Classification
**BUG FIX + UX ENHANCEMENT**: Fix confusing error messages and add visual deposit prompts

## Current State Analysis

### Problem Statement
Users report confusing UX when trying to play dice without authentication:
- **Current behavior**: "Insufficient balance. You have 0 e8s, need 100000000 e8s. Please deposit more ICP."
- **Expected behavior**: Clear prompt to log in first, then deposit if needed

### Current Implementation

**File: `openhouse_frontend/src/pages/Dice.tsx`**
- Lines 1-13: Imports (NO useAuth currently)
- Lines 187-249: `rollDice()` function
  - Line 188: Only checks `!actor` and bet validation
  - Line 191-201: House balance validation
  - Line 223: Calls `actor.play_dice()` directly
  - Line 242: Displays backend error as-is

**Missing:**
- No authentication check before play
- No `useAuth` hook import
- No visual feedback for deposit requirement

**File: `dice_backend/src/game.rs`**
- Lines 99-103: Backend balance check (returns confusing error for anonymous users)
```rust
if user_balance < bet_amount {
    return Err(format!("Insufficient balance. You have {} e8s, need {} e8s. Please deposit more ICP.",
                      user_balance, bet_amount));
}
```

**Comparison with Mines Game:**
- `Mines.tsx` line 7: Imports `useAuth`
- `Mines.tsx` line 58-61: Checks `isAuthenticated` before play
- Shows: "Please login to play" for unauthenticated users

### Affected Components
- **Frontend**: `/home/theseus/alexandria/openhouse-dice-auth-ux/openhouse_frontend/src/pages/Dice.tsx`
- **Frontend**: `/home/theseus/alexandria/openhouse-dice-auth-ux/openhouse_frontend/src/components/game-specific/dice/DiceAccountingPanel.tsx` (add animation)
- **Backend**: NO CHANGES (backend error is correct, frontend just needs to catch auth first)

## Implementation Plan (PSEUDOCODE)

### Part 1: Add Authentication Check to Dice.tsx

**File: `openhouse_frontend/src/pages/Dice.tsx`**

```typescript
// PSEUDOCODE - Add to imports (around line 1-13)
import { useAuth } from '../providers/AuthProvider';

// PSEUDOCODE - Add to component state (around line 60-70)
const { isAuthenticated } = useAuth();

// PSEUDOCODE - Modify rollDice function (around line 187)
const rollDice = async () => {
  // Step 1: Check authentication FIRST (before actor check)
  if (!isAuthenticated) {
    gameState.setGameError('Please log in to play. Click the "Login" button in the top right.');
    return;
  }

  // Step 2: Existing checks (actor, bet validation)
  if (!actor || !gameState.validateBet()) return;

  // Step 3: Check for zero balance and trigger deposit animation
  if (balance.game === 0n) {
    gameState.setGameError('Your dice game balance is empty. Please deposit ICP using the panel on the right.');
    // Trigger deposit button animation via callback or state
    setShowDepositAnimation(true);
    return;
  }

  // Step 4: Existing house balance check
  const maxPayout = BigInt(Math.floor(gameState.betAmount * multiplier * E8S_PER_ICP));
  if (maxPayout > balance.house) {
    // ... existing house balance error ...
    return;
  }

  // Step 5: Continue with existing game logic
  // ... rest of function unchanged ...
}
```

### Part 2: Add Deposit Animation State Management

**File: `openhouse_frontend/src/pages/Dice.tsx`**

```typescript
// PSEUDOCODE - Add state for deposit animation (around line 55-70)
const [showDepositAnimation, setShowDepositAnimation] = useState(false);

// PSEUDOCODE - Clear animation when balance changes
useEffect(() => {
  if (balance.game > 0n) {
    setShowDepositAnimation(false);
  }
}, [balance.game]);

// PSEUDOCODE - Pass animation state to DiceAccountingPanel (around line 350-400)
<DiceAccountingPanel
  balance={balance}
  onBalanceChange={handleBalanceChange}
  showDepositAnimation={showDepositAnimation}  // NEW PROP
/>
```

### Part 3: Add Visual Animation to Deposit Button

**File: `openhouse_frontend/src/components/game-specific/dice/DiceAccountingPanel.tsx`**

```typescript
// PSEUDOCODE - Add animation prop to component interface
interface DiceAccountingPanelProps {
  balance: GameBalance;
  onBalanceChange: () => Promise<void>;
  showDepositAnimation?: boolean;  // NEW
}

// PSEUDOCODE - Add CSS animation classes (could be in separate CSS file or Tailwind)
// Animation effect: pulse/glow effect on deposit button
const depositButtonClass = showDepositAnimation
  ? 'deposit-button animate-pulse ring-4 ring-blue-400 ring-opacity-75'
  : 'deposit-button';

// PSEUDOCODE - Apply animation to deposit button/section
<div className={depositButtonClass}>
  <GameButton onClick={handleDeposit}>
    Deposit ICP
  </GameButton>
</div>

// PSEUDOCODE - Optional: Add attention-grabbing text
{showDepositAnimation && (
  <p className="text-blue-400 animate-pulse font-semibold mt-2">
    👆 Deposit ICP here to start playing
  </p>
)}
```

### Part 4: Add CSS Animation (if not using Tailwind)

**File: `openhouse_frontend/src/index.css` or component styles**

```css
/* PSEUDOCODE - Add keyframes for pulse animation */
@keyframes deposit-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
    transform: scale(1.05);
  }
}

.animate-deposit {
  animation: deposit-pulse 2s infinite;
  border: 2px solid #3b82f6;
}
```

## User Flow Improvements

### Before Implementation
1. Anonymous user clicks "Roll Dice" → "Insufficient balance. You have 0 e8s, need 100000000 e8s" ❌ CONFUSING
2. User doesn't know to log in first
3. Even if logged in with 0 balance, no visual cue where to deposit

### After Implementation
1. **Anonymous user clicks "Roll Dice"** → "Please log in to play. Click the 'Login' button in the top right." ✅ CLEAR
2. **Authenticated user, 0 balance clicks "Roll Dice"** → Error message + deposit button pulses/glows ✅ VISUAL CUE
3. **Authenticated user, insufficient balance** → Backend error with specific amounts ✅ INFORMATIVE
4. **Authenticated user, sufficient balance** → Game plays normally ✅ WORKS

## Testing Requirements

**Manual Testing on Mainnet** (no automated tests needed for experimental pre-production):

1. **Scenario 1: Anonymous User**
   - Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
   - Try to roll without logging in
   - ✓ Should see: "Please log in to play..."

2. **Scenario 2: Authenticated, Zero Balance**
   - Log in with Internet Identity
   - Ensure game balance is 0 (withdraw if needed)
   - Try to roll
   - ✓ Should see: Error message + deposit button animation

3. **Scenario 3: Deposit Flow**
   - From scenario 2, click animated deposit button
   - Deposit ICP
   - ✓ Animation should stop
   - ✓ Can now play normally

4. **Scenario 4: Insufficient Balance (but > 0)**
   - Have 0.5 ICP in game balance
   - Try to bet 1 ICP
   - ✓ Should see backend error with specific amounts

## Deployment Strategy

**Affected Canisters:**
- Frontend only: `pezw3-laaaa-aaaal-qssoa-cai`
- Backend: NO CHANGES (dice_backend remains unchanged)

**Deployment Command:**
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

**Verification:**
```bash
# Visit live site
open https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

# Test scenarios above manually
```

## Files Modified

1. **`openhouse_frontend/src/pages/Dice.tsx`**
   - Add `useAuth` import
   - Add `isAuthenticated` check in `rollDice()`
   - Add `showDepositAnimation` state
   - Pass animation prop to DiceAccountingPanel

2. **`openhouse_frontend/src/components/game-specific/dice/DiceAccountingPanel.tsx`**
   - Add `showDepositAnimation` prop
   - Apply pulse/glow animation to deposit button
   - Add attention text when animation active

3. **`openhouse_frontend/src/index.css`** (or equivalent styles)
   - Add deposit-pulse keyframes animation
   - Add `.animate-deposit` class (if not using Tailwind)

## Backend Changes

**NONE** - The backend error message is technically correct. The frontend just needs to:
1. Check authentication before calling the backend
2. Provide visual feedback for zero balance
3. Let the backend error show for partial balance issues

## Success Criteria

- ✅ Anonymous users see clear "log in to play" message
- ✅ Authenticated users with 0 balance see animated deposit button
- ✅ Authenticated users with insufficient (but > 0) balance see backend error
- ✅ Animation stops after deposit
- ✅ Consistent with other games (Mines pattern)
- ✅ No backend changes needed
- ✅ Deployed to mainnet frontend successfully

## Notes

- This is a **frontend-only** change
- Follows same pattern as Mines game for consistency
- Improves UX without changing backend logic
- Animation provides clear visual feedback for next action
- Mainnet deployment is safe (no canister upgrade needed for backend)
