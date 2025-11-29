# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-unified-layout"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-unified-layout`
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
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): Unified single-screen layout for mobile and desktop"
   git push -u origin feature/dice-unified-layout
   gh pr create --title "Dice: Unified Single-Screen Layout" --body "$(cat <<'EOF'
## Summary
- Redesigns dice game to fit on a single screen without scrolling
- Integrates dice animation with controls in a unified layout
- Optimizes for both mobile and desktop viewport heights
- Eliminates the fractured UX of scrolling between dice and controls

## Test plan
- [ ] Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice on desktop
- [ ] Verify no scrolling needed to see dice + controls + betting rail
- [ ] Visit on mobile (or use responsive mode)
- [ ] Verify no scrolling needed on mobile either
- [ ] Test dice roll animation still works
- [ ] Test Over/Under buttons still work
- [ ] Test target slider still works
- [ ] Test preset buttons (10/25/50/75/90) still work
- [ ] Test Roll Dice button works
- [ ] Test BettingRail chip betting works

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
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

**Branch:** `feature/dice-unified-layout`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-unified-layout`

---

# Implementation Plan: Dice Unified Single-Screen Layout

## Problem Statement

The current dice game layout has a fragmented UX:
- Dice animation sits in its own section at the top (350px min-height + padding)
- Controls section sits below (Over/Under + slider + presets + Roll button)
- BettingRail is fixed at bottom (~180px on desktop, ~160px on mobile)
- **Total height exceeds viewport**, forcing users to scroll back and forth

### Current Layout Analysis

```
CURRENT DESKTOP LAYOUT (approximate heights):
+------------------------------------------+
| DiceLayout tabs (~50px)                  |
+------------------------------------------+
| Dice Animation Box (~400px with padding) |  <- User sees this
|   - 350px min-height container           |
|   - 200x200 dice box scaled 1.25x        |
|   - Result display (96px)                |
+------------------------------------------+
| Controls (~250px)                        |  <- Must scroll to reach
|   - Over/Under buttons (~56px)           |
|   - Target slider (~80px)                |
|   - Preset buttons (~40px)               |
|   - Payout preview (~24px)               |
|   - Roll button (~48px)                  |
|   - Error display (optional)             |
+------------------------------------------+
| BettingRail (fixed, ~180px)              |
+------------------------------------------+

TOTAL: ~880px content + 180px rail = 1060px minimum
TYPICAL VIEWPORT: 900px desktop, 650px mobile
RESULT: Scrolling required
```

## Target Layout: Unified Single-Screen

### Design Philosophy
1. **Everything visible at once** - No scrolling on the `/dice` route
2. **Dice remains prominent** - Still the visual centerpiece
3. **Controls integrated** - Inline with or surrounding the dice
4. **Betting rail stays fixed** - Already positioned well
5. **Responsive** - Works on mobile (500px) to desktop (1080px+)

### New Layout Concept

```
UNIFIED DESKTOP LAYOUT (fits in ~700px + rail):
+------------------------------------------+
| Play Game | Become Owner (tabs ~40px)    |
+------------------------------------------+
|                                          |
|  [UNDER] +--------------+ [OVER]         |  <- Direction buttons flanking dice
|          |              |                |
|          |    [ 42 ]    |                |  <- Smaller dice (150x150)
|          |              |                |
|          +--------------+                |
|                                          |
|  |=====[====O=======]===| 50             |  <- Compact slider inline
|   10   25   50   75   90                 |  <- Presets as inline chips
|                                          |
|   47% chance  |  2.09x  |  Win $2.09     |  <- Stats row compact
|                                          |
|        [ ROLL DICE ]                     |  <- Roll button
|                                          |
| Result: YOU WON! +$2.09                  |  <- Inline result (replaces big box)
+------------------------------------------+
| [BettingRail - unchanged]                |
+------------------------------------------+

TOTAL: ~520px content + 180px rail = 700px
FITS: Most viewports without scrolling
```

### Mobile Layout Concept

```
UNIFIED MOBILE LAYOUT (fits in ~450px + rail):
+-------------------------------+
| Play | Become Owner (~36px)   |
+-------------------------------+
|    [UNDER]    [OVER]          |  <- Direction row
|                               |
|      +--------------+         |  <- Smaller dice (120x120)
|      |    [ 42 ]    |         |
|      +--------------+         |
|                               |
|  |=====[=O========]===| 50    |  <- Slider
|   10  25  50  75  90          |  <- Presets compact
|                               |
|  47%  |  2.09x  |  Win $2.09  |  <- Stats row
|                               |
|      [ ROLL DICE ]            |
|  YOU WON! +$2.09              |  <- Result inline
+-------------------------------+
| [BettingRail mobile]          |
+-------------------------------+

TOTAL: ~400px content + 160px rail = 560px
FITS: iPhone SE (568px) and up
```

## Implementation Steps

### Step 1: Reduce Dice Animation Size

**File:** `openhouse_frontend/src/components/game-specific/dice/DiceAnimation.css`

```css
// PSEUDOCODE - Reduce dice-container height and dice-box size

.dice-container {
  height: 180px;        // Was: 300px
  // rest unchanged
}

.dice-box {
  width: 150px;         // Was: 200px
  height: 150px;        // Was: 200px
  border-radius: 16px;  // Was: 20px (proportional)
  // rest unchanged
}

.number-display {
  font-size: 3.5rem;    // Was: 5rem
  // rest unchanged
}

.result-glow-turquoise {
  width: 200px;         // Was: 300px
  height: 200px;        // Was: 300px
  // rest unchanged
}

// Add mobile-specific sizing
@media (max-width: 768px) {
  .dice-container {
    height: 140px;
  }
  .dice-box {
    width: 120px;
    height: 120px;
  }
  .number-display {
    font-size: 3rem;
  }
  .result-glow-turquoise {
    width: 160px;
    height: 160px;
  }
}
```

### Step 2: Redesign DiceGame.tsx Layout Structure

**File:** `openhouse_frontend/src/pages/dice/DiceGame.tsx`

```tsx
// PSEUDOCODE - New unified layout structure

return (
  <GameLayout minBet={0.01} maxWin={10} houseEdge={0.99}>
    {/* Main container - viewport-height aware, accounts for rail */}
    <div className="flex flex-col h-[calc(100vh-280px)] md:h-[calc(100vh-260px)] max-w-xl mx-auto px-4">

      {/* Auth check - compact */}
      {!isAuthenticated && (
        <div className="text-center text-gray-400 text-sm py-2">
          Please log in to play
        </div>
      )}

      {/* Direction buttons + Dice - Row layout on desktop, stacked on mobile */}
      <div className="flex items-center justify-center gap-4 md:gap-8 flex-shrink-0">
        {/* Under button - left side on desktop */}
        <button
          onClick={() => onDirectionChange('Under')}
          className="hidden md:flex ..." // desktop only side button
        >
          UNDER
        </button>

        {/* Dice Animation - centered, no scale */}
        <div className="relative">
          <DiceAnimation
            targetNumber={animatingResult}
            isRolling={isPlaying}
            onAnimationComplete={handleAnimationComplete}
          />
        </div>

        {/* Over button - right side on desktop */}
        <button
          onClick={() => onDirectionChange('Over')}
          className="hidden md:flex ..." // desktop only side button
        >
          OVER
        </button>
      </div>

      {/* Mobile-only direction buttons row */}
      <div className="flex md:hidden gap-2 justify-center mt-2">
        <button>UNDER</button>
        <button>OVER</button>
      </div>

      {/* Compact Controls Section */}
      <div className="flex-1 flex flex-col justify-center space-y-3 py-2">

        {/* Target slider - inline with value */}
        <div className="flex items-center gap-3">
          <input type="range" className="flex-1" ... />
          <span className="text-white font-bold w-8 text-center">{targetNumber}</span>
        </div>

        {/* Quick presets - small inline buttons */}
        <div className="flex justify-center gap-2">
          {[10, 25, 50, 75, 90].map(val => (
            <button key={val} className="px-3 py-1 text-xs ...">{val}</button>
          ))}
        </div>

        {/* Stats row - ultra compact */}
        <div className="flex justify-center gap-4 text-xs text-gray-400">
          <span><b className="text-yellow-400">{winChance}%</b> chance</span>
          <span><b className="text-green-400">{multiplier}x</b></span>
          <span className="text-dfinity-turquoise">Win ${(betAmount * multiplier).toFixed(2)}</span>
        </div>

        {/* Roll button - prominent but not oversized */}
        <GameButton
          onClick={rollDice}
          disabled={!actor || betAmount === 0 || !isAuthenticated}
          loading={isPlaying}
          label="ROLL DICE"
          loadingLabel="Rolling..."
        />

        {/* Result display - inline, compact */}
        {lastResult && !isPlaying && (
          <div className={`text-center py-2 ${lastResult.is_win ? 'text-green-400' : 'text-red-400'}`}>
            <span className="font-bold text-lg">
              {lastResult.is_win ? 'WON!' : 'LOST'}
            </span>
            {lastResult.is_win && (
              <span className="text-dfinity-turquoise ml-2">
                +{formatUSDT(lastResult.payout)}
              </span>
            )}
            <span className="text-gray-500 text-xs ml-2">
              (Rolled {lastResult.rolled_number})
            </span>
          </div>
        )}

        {/* Error display - compact */}
        {gameError && (
          <div className="text-red-400 text-sm text-center p-2 bg-red-900/20 rounded">
            {gameError}
          </div>
        )}
      </div>
    </div>

    {/* BettingRail - unchanged */}
    <BettingRail ... />
  </GameLayout>
);
```

### Step 3: Simplify DiceControls Component

**File:** `openhouse_frontend/src/components/game-specific/dice/DiceControls.tsx`

The DiceControls component needs to be refactored to support the new inline layout. We have two options:

**Option A: Inline the controls directly into DiceGame.tsx** (simpler)
- Remove the wrapper divs from DiceControls
- Inline the slider and presets directly in DiceGame

**Option B: Make DiceControls accept layout prop** (more modular)
- Add `layout: 'stacked' | 'inline'` prop
- Render different layouts based on prop

We'll go with **Option A** since it reduces abstraction and makes the layout clearer.

```tsx
// PSEUDOCODE - DiceControls becomes minimal
// We'll inline most of it into DiceGame.tsx and keep DiceControls just for the slider

export const DiceControls: React.FC<DiceControlsProps> = ({
  targetNumber,
  onTargetChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-500 text-xs">Target:</span>
      <input
        type="range"
        min="2"
        max="98"
        value={targetNumber}
        onChange={(e) => onTargetChange(parseInt(e.target.value))}
        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
        disabled={disabled}
      />
      <span className="text-white font-bold font-mono w-8 text-center">{targetNumber}</span>
    </div>
  );
};
```

### Step 4: Adjust GameLayout/DiceLayout Heights

**File:** `openhouse_frontend/src/pages/dice/DiceLayout.tsx`

```tsx
// PSEUDOCODE - Reduce padding, make container height-aware

export function DiceLayout() {
  const location = useLocation();
  const isLiquidityRoute = location.pathname.includes('/liquidity');

  return (
    <div className="container mx-auto px-4 pt-4 pb-2"> {/* Reduced padding */}
      {/* Tab Navigation - smaller */}
      <div className="flex gap-3 mb-3 border-b border-gray-700">
        <Link
          to="/dice"
          className={`px-3 py-1.5 text-sm -mb-px transition-colors ${...}`}
        >
          Play Game
        </Link>
        <Link
          to="/dice/liquidity"
          className={`px-3 py-1.5 text-sm -mb-px transition-colors ${...}`}
        >
          Become Owner
        </Link>
      </div>

      <Outlet />
    </div>
  );
}
```

### Step 5: Remove pb-48 Padding Hack

**File:** `openhouse_frontend/src/pages/dice/DiceGame.tsx`

The current code has `pb-48` to clear the betting rail. We'll replace this with proper viewport-height calculation:

```tsx
// BEFORE:
<div className="max-w-2xl mx-auto pb-48">

// AFTER:
<div className="max-w-xl mx-auto h-[calc(100vh-280px)] md:h-[calc(100vh-260px)] flex flex-col">
```

The calculation:
- Mobile: 100vh - 160px (rail) - 40px (tabs) - 80px (header/margins) = ~280px buffer
- Desktop: 100vh - 180px (rail) - 40px (tabs) - 40px (margins) = ~260px buffer

### Step 6: Hide Odds Explainer (Optional)

Move the `?` button for odds explainer to a less prominent position (or keep it but smaller):

```tsx
// Make it a small inline icon instead of floating button
<button
  onClick={() => setShowOddsExplainer(true)}
  className="text-gray-600 hover:text-gray-400 text-xs"
  title="How odds work"
>
  (?)
</button>
```

## Files to Modify

1. `openhouse_frontend/src/components/game-specific/dice/DiceAnimation.css`
   - Reduce heights and sizes
   - Add mobile breakpoints

2. `openhouse_frontend/src/pages/dice/DiceGame.tsx`
   - Complete layout restructure
   - Inline direction buttons
   - Use viewport-height aware container
   - Compact result display

3. `openhouse_frontend/src/components/game-specific/dice/DiceControls.tsx`
   - Simplify to just the slider
   - Remove wrapper divs and presets (moved to DiceGame)

4. `openhouse_frontend/src/pages/dice/DiceLayout.tsx`
   - Reduce padding
   - Smaller tab styling

## Height Budget

| Element | Mobile | Desktop |
|---------|--------|---------|
| Tabs | 36px | 40px |
| Auth message (if shown) | 32px | 32px |
| Direction buttons | 40px | 0px (inline) |
| Dice animation | 140px | 180px |
| Slider + presets | 60px | 60px |
| Stats row | 24px | 24px |
| Roll button | 48px | 48px |
| Result display | 32px | 32px |
| **Content Total** | ~412px | ~416px |
| BettingRail | 160px | 180px |
| **Grand Total** | ~572px | ~596px |
| **Target viewport** | 600px+ | 700px+ |

## Testing Checklist

- [ ] Desktop: No scrolling on 768px+ height viewport
- [ ] Mobile: No scrolling on 600px+ height viewport
- [ ] Dice animation displays correctly at smaller size
- [ ] Roll animation still plays smoothly
- [ ] Over/Under buttons work
- [ ] Target slider works
- [ ] Preset buttons work (10/25/50/75/90)
- [ ] Win chance and multiplier update correctly
- [ ] Roll Dice button triggers game
- [ ] Result displays inline after roll
- [ ] BettingRail still functions (chip betting, deposit, withdraw)
- [ ] Odds explainer modal still accessible

## Deployment

**Frontend only** - no backend changes required.

```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

Verify at: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
