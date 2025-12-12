# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-game-arch"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-game-arch`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```
4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor: extract shared game utilities for future extensibility"
   git push -u origin feature/game-architecture-refactor
   gh pr create --title "Refactor: Game Architecture for Future Extensibility" --body "$(cat <<'EOF'
## Summary
- Extract shared `parseBackendError()` utility (removes ~60 lines of duplication)
- Create `useBalanceRefresh` hook for consistent balance polling
- Delete duplicate `chipConfig.ts` in game-specific/dice/
- Update game pages to use shared utilities

## Changes
- **NEW**: `openhouse_frontend/src/utils/parseBackendError.ts`
- **NEW**: `openhouse_frontend/src/hooks/games/useBalanceRefresh.ts`
- **DELETED**: `openhouse_frontend/src/components/game-specific/dice/chipConfig.ts`
- **MODIFIED**: `DiceGame.tsx`, `Crash.tsx`, `PlinkoGame.tsx` - use shared utilities

## Impact
Frontend-only changes. No backend modifications.

## Testing
- Verified all games load correctly
- Verified balance refresh works
- Verified error messages display properly

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
EOF
)"
   ```
6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- After sleep: IMMEDIATELY continue (no pause)
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/game-architecture-refactor`
**Worktree:** `/home/theseus/alexandria/openhouse-game-arch`

---

# Implementation Plan: Game Architecture Refactor

## Task Classification
**REFACTORING** - Improve existing code with subtractive + targeted fixes

## Goal
Extract duplicated game utilities into shared modules to improve maintainability and make adding future games easier.

## Current State

### Problem 1: Duplicate `parseBackendError` (60 lines x 2)
**Files:**
- `openhouse_frontend/src/pages/dice/DiceGame.tsx:51-80` (30 lines)
- `openhouse_frontend/src/pages/Crash.tsx:65-94` (30 lines)

**Issue:** Byte-for-byte identical function copy-pasted. Plinko doesn't use it (shows raw errors).

### Problem 2: Duplicate Balance Refresh Pattern
**Files:**
- `openhouse_frontend/src/pages/dice/DiceGame.tsx:123-137`
- `openhouse_frontend/src/pages/Crash.tsx:119-133`

**Pattern:**
```tsx
useEffect(() => {
  if (actor) {
    const intervalId = setInterval(() => gameBalanceContext.refresh(), 30000);
    const handleFocus = () => gameBalanceContext.refresh();
    window.addEventListener('focus', handleFocus);
    return () => { clearInterval(intervalId); window.removeEventListener('focus', handleFocus); };
  }
}, [actor]);
```

### Problem 3: Duplicate `chipConfig.ts`
**Files:**
- `openhouse_frontend/src/components/betting/chipConfig.ts` (110 lines)
- `openhouse_frontend/src/components/game-specific/dice/chipConfig.ts` (110 lines)

**Issue:** Identical files. The dice-specific one is unnecessary.

### Problem 4: Unused Existing Infrastructure
**File:** `openhouse_frontend/src/hooks/games/useGameState.ts` exists but NO game page uses it.

## Implementation

### Step 1: Create `parseBackendError.ts` Utility

**NEW FILE:** `openhouse_frontend/src/utils/parseBackendError.ts`

```typescript
// PSEUDOCODE - Shared backend error parser
// Extract from DiceGame.tsx:51-80

export function parseBackendError(errorMsg: string): string {
  // Handle INSUFFICIENT_BALANCE|... format
  // Handle "exceeds house limit" / "house balance"
  // Handle "Randomness seed initializing"
  // Handle timeout/504/Gateway errors
  // Return original message if no match
}
```

### Step 2: Create `useBalanceRefresh` Hook

**NEW FILE:** `openhouse_frontend/src/hooks/games/useBalanceRefresh.ts`

```typescript
// PSEUDOCODE - Shared balance refresh hook
import { useEffect } from 'react';

interface UseBalanceRefreshOptions {
  actor: any;
  refresh: () => Promise<void>;
  intervalMs?: number; // default 30000
}

export function useBalanceRefresh({ actor, refresh, intervalMs = 30000 }: UseBalanceRefreshOptions) {
  useEffect(() => {
    if (!actor) return;

    // Set up interval
    const intervalId = setInterval(() => refresh().catch(console.error), intervalMs);

    // Set up focus handler
    const handleFocus = () => refresh().catch(console.error);
    window.addEventListener('focus', handleFocus);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [actor, refresh, intervalMs]);
}
```

### Step 3: Update `hooks/games/index.ts`

**MODIFY FILE:** `openhouse_frontend/src/hooks/games/index.ts`

```typescript
// Add export for new hook
export { useBalanceRefresh } from './useBalanceRefresh';
```

### Step 4: Delete Duplicate `chipConfig.ts`

**DELETE FILE:** `openhouse_frontend/src/components/game-specific/dice/chipConfig.ts`

### Step 5: Update `game-specific/dice/index.ts`

**MODIFY FILE:** `openhouse_frontend/src/components/game-specific/dice/index.ts`

```typescript
// PSEUDOCODE - Remove chipConfig export, keep everything else
// Remove: export { CHIP_DENOMINATIONS, ... } from './chipConfig';
// Keep all other exports
```

### Step 6: Update Imports in Dice Components

Check if any files in `game-specific/dice/` import from local `chipConfig.ts` and update to import from `../../betting/chipConfig`.

**Likely files to check:**
- `ChipBetting.tsx`
- `ChipStack.tsx`

### Step 7: Update `DiceGame.tsx`

**MODIFY FILE:** `openhouse_frontend/src/pages/dice/DiceGame.tsx`

```typescript
// PSEUDOCODE changes:
// 1. Add import
import { parseBackendError } from '../../utils/parseBackendError';
import { useBalanceRefresh } from '../../hooks/games';

// 2. DELETE the local parseBackendError function (lines 51-80)

// 3. REPLACE the balance refresh useEffect (lines 123-137) with:
useBalanceRefresh({
  actor,
  refresh: gameBalanceContext.refresh,
});
```

### Step 8: Update `Crash.tsx`

**MODIFY FILE:** `openhouse_frontend/src/pages/Crash.tsx`

```typescript
// PSEUDOCODE changes:
// 1. Add import
import { parseBackendError } from '../utils/parseBackendError';
import { useBalanceRefresh } from '../hooks/games';

// 2. DELETE the local parseBackendError function (lines 65-94)

// 3. REPLACE the balance refresh useEffect (lines 119-133) with:
useBalanceRefresh({
  actor,
  refresh: gameBalanceContext.refresh,
});
```

### Step 9: Update `PlinkoGame.tsx` (Optional Enhancement)

**MODIFY FILE:** `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx`

```typescript
// PSEUDOCODE changes:
// 1. Add imports
import { parseBackendError } from '../../utils/parseBackendError';
import { useBalanceRefresh } from '../../hooks/games';

// 2. In error handling (around line 278), wrap errors:
catch (err) {
  const errorMsg = err instanceof Error ? err.message : 'Failed to play';
  setGameError(parseBackendError(errorMsg));  // ADD parseBackendError wrapper
  ...
}

// 3. Add balance refresh hook (Plinko currently doesn't have one!)
useBalanceRefresh({
  actor,
  refresh: gameBalanceContext.refresh,
});
```

### Step 10: Update `RouletteGame.tsx`

**MODIFY FILE:** `openhouse_frontend/src/pages/roulette/RouletteGame.tsx`

```typescript
// PSEUDOCODE changes:
// 1. Add import
import { useBalanceRefresh } from '../../hooks/games';

// 2. REPLACE the simple interval (around line 86-89) with:
useBalanceRefresh({
  actor,
  refresh: gameBalanceContext.refresh,
});

// Note: Roulette's current interval doesn't have focus handling - this adds it!
```

## Files Summary

| Action | File | Net LOC |
|--------|------|---------|
| NEW | `utils/parseBackendError.ts` | +35 |
| NEW | `hooks/games/useBalanceRefresh.ts` | +25 |
| MODIFY | `hooks/games/index.ts` | +1 |
| DELETE | `components/game-specific/dice/chipConfig.ts` | -110 |
| MODIFY | `components/game-specific/dice/index.ts` | -1 |
| MODIFY | `pages/dice/DiceGame.tsx` | -40 |
| MODIFY | `pages/Crash.tsx` | -40 |
| MODIFY | `pages/plinko/PlinkoGame.tsx` | +5 |
| MODIFY | `pages/roulette/RouletteGame.tsx` | +2 |

**Net change: ~-125 lines** (subtractive refactor)

## Deployment Notes

- **Frontend only** - No backend changes
- **Canister affected:** `pezw3-laaaa-aaaal-qssoa-cai` (frontend)
- **Risk:** Low - purely code organization, no behavior changes

## Verification Checklist

After deployment, manually verify:
- [ ] Dice game loads and plays correctly
- [ ] Crash game loads and plays correctly
- [ ] Plinko game loads and plays correctly
- [ ] Roulette game loads (admin-only status)
- [ ] Error messages display correctly when bet fails
- [ ] Balance refreshes on window focus
- [ ] No console errors
