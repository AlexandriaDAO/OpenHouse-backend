# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-unified-ui-gemini"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-unified-ui-gemini`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build frontend
   cd openhouse_frontend
   npm run build
   cd ..

   # Deploy to mainnet
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): Redesign UI to unified single-panel layout (Gemini implementation)

- Consolidate all game controls into one cohesive card
- Move accounting panel inline as compact balance display
- Integrate dice animation into main game flow
- Improve visual hierarchy with side-by-side layout
- Reduce vertical scrolling, create more scannable interface
- Maintain all existing functionality and state management"

   git push -u origin feature/dice-unified-ui-gemini

   gh pr create --title "[Gemini] Feature: Unified Dice UI - Single Panel Design" --body "Implements PLAN_DICE_UNIFIED_UI_GEMINI.md

**Implementation by:** Gemini Agent

**Problem:** Current Dice UI has too many vertically stacked panels that create a cluttered, disjointed experience.

**Solution:** Redesigned as a unified single-panel layout with:
- Side-by-side controls and animation for better space usage
- Inline balance display instead of separate accounting panel
- Integrated game history at bottom
- Clean visual hierarchy with grouped related controls
- Reduced scrolling, more scannable interface

**Changes:**
- Modified DiceGame.tsx with new unified layout structure
- Inline balance display with compact buy/cash out actions
- Side-by-side main game area (controls + animation)
- Maintained all existing functionality
- No backend changes

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
- Affected canisters: openhouse_frontend"
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

**Branch:** `feature/dice-unified-ui-gemini`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-unified-ui-gemini`

---

# Implementation Plan: Unified Dice Game UI (Gemini Version)

## Task Classification
**REFACTORING** - Improve existing UI layout without changing functionality

## Current State Analysis

### Existing File Structure
```
openhouse_frontend/src/
├── pages/dice/
│   └── DiceGame.tsx (358 lines - main game component)
├── components/game-specific/dice/
│   ├── DiceAccountingPanel.tsx (279 lines - balance management)
│   ├── DiceControls.tsx (65 lines - target/direction controls)
│   ├── DiceAnimation.tsx (106 lines - dice rolling animation)
│   └── DiceAnimation.css (97 lines - animation styles)
└── components/game-ui/
    ├── GameLayout.tsx (shared layout wrapper)
    ├── BetAmountInput.tsx (bet slider)
    ├── GameButton.tsx (roll button)
    ├── GameHistory.tsx (history table)
    └── GameStats.tsx (stats display)
```

### Current Layout Issues (From User)
```
Vertically Stacked Panels:
┌─────────────────────┐
│ Accounting Panel    │ (Balance, Buy/Cash Out)
├─────────────────────┤
│ Bet Amount Input    │
├─────────────────────┤
│ Dice Controls       │ (Target slider, Over/Under)
├─────────────────────┤
│ Stats Grid (4 cols) │
├─────────────────────┤
│ House Status        │
├─────────────────────┤
│ How It Works        │
├─────────────────────┤
│ Roll Button         │
└─────────────────────┘

┌─────────────────────┐
│ Dice Animation      │ (Separate card)
└─────────────────────┘

┌─────────────────────┐
│ Game History        │ (Separate card)
└─────────────────────┘
```

**Problems:**
- Too much vertical scrolling required
- Related elements (controls + animation) are separated
- Multiple cards create visual fragmentation
- Balance panel dominates top of screen
- Stats repeated in multiple places

## Proposed Unified Layout

### New Single-Card Design
```
┌─────────────────────────────────────────────────┐
│ UNIFIED DICE GAME CARD                          │
├─────────────────────────────────────────────────┤
│                                                 │
│  INLINE BALANCE BAR (compact, top)              │
│  [Wallet: X] [Game: Y] [House: Z] [Buy] [Cash] │
│                                                 │
├──────────────────────┬──────────────────────────┤
│                      │                          │
│  GAME CONTROLS       │   DICE ANIMATION         │
│  (Left Column)       │   (Right Column)         │
│                      │                          │
│  • Bet Amount        │   ┌──────────────┐       │
│    [slider]          │   │              │       │
│                      │   │   [  42  ]   │       │
│  • Target Number     │   │              │       │
│    [slider: 50]      │   └──────────────┘       │
│                      │                          │
│  • Direction         │   Win/Loss Message       │
│    [Over|Under]      │   [+5.5 ICP]             │
│                      │                          │
│  • Stats (inline)    │                          │
│    Chance: 49.5%     │                          │
│    Multi: 2.00x      │                          │
│    Max: 5.00         │                          │
│    Win: 10.00        │                          │
│                      │                          │
│  [🎲 ROLL DICE]      │                          │
│                      │                          │
└──────────────────────┴──────────────────────────┘

┌─────────────────────────────────────────────────┐
│ GAME HISTORY (collapsible, bottom)              │
│ Recent rolls, stats, detailed view              │
└─────────────────────────────────────────────────┘
```

### Design Benefits
1. **Side-by-Side Layout** - Controls and animation visible simultaneously
2. **Inline Balance** - Compact top bar instead of separate panel
3. **Single Card** - All game elements unified in one cohesive interface
4. **Better Space Usage** - Horizontal layout reduces scrolling
5. **Clear Visual Hierarchy** - Related elements grouped together
6. **Responsive** - Stacks to vertical on mobile

## Implementation Pseudocode

### 1. Modify `DiceGame.tsx` (MODIFY EXISTING)

**Current Structure:**
```typescript
// CURRENT: Three separate cards
return (
  <GameLayout>
    {/* Card 1: Accounting + Controls */}
    <div className="card">
      <DiceAccountingPanel />
      <BetAmountInput />
      <DiceControls />
      <StatsGrid />
      <HouseStatus />
      <GameButton />
    </div>

    {/* Card 2: Animation */}
    <div className="card">
      <DiceAnimation />
      <WinLossMessage />
    </div>

    {/* Card 3: History */}
    <div className="card">
      <GameHistory />
    </div>
  </GameLayout>
);
```

**New Structure:**
```typescript
// PSEUDOCODE - NEW: Single unified card

return (
  <GameLayout>
    {/* UNIFIED GAME CARD */}
    <div className="card max-w-5xl mx-auto">

      {/* INLINE BALANCE BAR - Compact horizontal layout */}
      <div className="mb-4 pb-3 border-b border-gray-700">
        {!isAuthenticated ? (
          <p className="text-center text-gray-400 text-sm">
            Please log in to play
          </p>
        ) : (
          <div className="flex items-center justify-between gap-4">
            {/* Left: Balance displays */}
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-gray-400">Wallet:</span>
                <span className="ml-1 font-bold text-green-400">
                  {formatBalance(walletBalance)} ICP
                </span>
              </div>
              <div>
                <span className="text-gray-400">Game:</span>
                <span className="ml-1 font-bold text-blue-400">
                  {formatBalance(balance.game)} ICP
                </span>
              </div>
              <div>
                <span className="text-gray-400">House:</span>
                <span className="ml-1 font-bold text-yellow-400">
                  {formatBalance(balance.house)} ICP
                </span>
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDepositModal(true)}
                className="px-4 py-1.5 bg-dfinity-turquoise text-pure-black text-sm font-bold rounded hover:bg-dfinity-turquoise/90"
              >
                💰 Buy Chips
              </button>
              <button
                onClick={handleWithdrawAll}
                className="px-4 py-1.5 bg-dfinity-turquoise text-pure-black text-sm font-bold rounded hover:bg-dfinity-turquoise/90"
              >
                💵 Cash Out
              </button>
              <button
                onClick={refreshBalances}
                className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
              >
                🔄
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SIDE-BY-SIDE MAIN AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT COLUMN: GAME CONTROLS */}
        <div className="space-y-4">

          {/* Bet Amount Input */}
          <BetAmountInput
            value={gameState.betAmount}
            onChange={gameState.setBetAmount}
            min={0.01}
            max={maxBet}
            disabled={gameState.isPlaying}
            isPracticeMode={gameMode.isPracticeMode}
            error={gameState.betError}
            variant="slider"
          />

          {/* Dice Controls (Target + Direction) */}
          <DiceControls
            targetNumber={targetNumber}
            onTargetChange={setTargetNumber}
            direction={direction}
            onDirectionChange={setDirection}
            disabled={gameState.isPlaying}
          />

          {/* Inline Stats Display */}
          <div className="bg-gray-800/30 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Win Chance</span>
              <span className="font-bold text-yellow-400">
                {winChance.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Multiplier</span>
              <span className="font-bold text-green-400">
                {multiplier.toFixed(2)}x
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Max Bet</span>
              <span className="font-bold text-blue-400">
                {maxBet.toFixed(2)} ICP
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Potential Win</span>
              <span className="font-bold text-dfinity-turquoise">
                {(gameState.betAmount * multiplier).toFixed(2)} ICP
              </span>
            </div>
          </div>

          {/* House Status (Compact) */}
          <HouseStatusInline />

          {/* Roll Button */}
          <GameButton
            onClick={rollDice}
            disabled={!actor}
            loading={gameState.isPlaying}
            label="ROLL DICE"
            loadingLabel="Rolling..."
            icon="🎲"
          />

          {/* Error Messages */}
          {gameState.gameError && (
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-sm">
              {gameState.gameError}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DICE ANIMATION */}
        <div className="flex flex-col items-center justify-center">

          {/* Dice Animation Component */}
          <DiceAnimation
            targetNumber={animatingResult}
            isRolling={gameState.isPlaying}
            onAnimationComplete={handleAnimationComplete}
          />

          {/* Win/Loss Result Display */}
          {gameState.lastResult && !gameState.isPlaying && (
            <div className={`text-center mt-6 ${
              gameState.lastResult.is_win ? 'text-green-400' : 'text-red-400'
            }`}>
              <div className="text-4xl font-bold mb-2">
                {gameState.lastResult.is_win ? '🎉 WIN!' : '😢 LOSE'}
              </div>

              {/* Exact hit indicator */}
              {!gameState.lastResult.is_win && gameState.lastResult.is_house_hit && (
                <div className="text-lg text-yellow-400 mb-2">
                  🎯 Exact Hit! (House Wins)
                </div>
              )}

              {/* Payout amount */}
              {gameState.lastResult.is_win && (
                <div className="text-2xl font-bold">
                  +{(Number(gameState.lastResult.payout) / E8S_PER_ICP).toFixed(4)} ICP
                </div>
              )}

              {/* Roll details */}
              <div className="text-sm text-gray-400 mt-2">
                Rolled: {gameState.lastResult.rolled_number} |
                Target: {gameState.lastResult.target_number} |
                Direction: {'Over' in gameState.lastResult.direction ? 'Over' : 'Under'}
              </div>
            </div>
          )}

          {/* How It Works (collapsible) */}
          <details className="mt-4 w-full">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300 text-center">
              💡 How it works
            </summary>
            <div className="text-xs text-gray-400 mt-2 p-3 bg-gray-800/50 rounded">
              Choose a target number and direction. If you roll exactly on the target,
              the house wins (0.99% edge). Otherwise, standard over/under rules apply.
            </div>
          </details>
        </div>
      </div>
    </div>

    {/* GAME HISTORY - Separate collapsible section at bottom */}
    <div className="card max-w-5xl mx-auto mt-4">
      <details open>
        <summary className="text-xl font-bold cursor-pointer mb-4">
          Game History
        </summary>

        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              onClick={() => setShowDetailedView(!showDetailedView)}
            >
              {showDetailedView ? 'Simple' : 'Detailed'} View
            </button>
            <button className="btn btn-sm" onClick={copyHistoryToCSV}>
              Copy CSV
            </button>
          </div>
        </div>

        {showDetailedView ? (
          <DetailedHistoryTable />
        ) : (
          <GameHistory<DiceGameResult>
            items={gameState.history}
            maxDisplay={5}
            title="Recent Rolls"
            renderCustom={renderHistoryItem}
          />
        )}
      </details>
    </div>

    {/* Deposit Modal (unchanged, rendered when needed) */}
    {showDepositModal && <DepositModal />}
  </GameLayout>
);
```

### 2. Extract Inline Components (NEW HELPERS)

Create helper components within DiceGame.tsx:

```typescript
// PSEUDOCODE - Helper component for compact house status

const HouseStatusInline = () => {
  const houseBalanceICP = Number(balance.house) / E8S_PER_ICP;
  const maxAllowedPayout = houseBalanceICP * 0.1;
  const currentPotentialPayout = gameState.betAmount * multiplier;
  const utilizationPct = maxAllowedPayout > 0
    ? (currentPotentialPayout / maxAllowedPayout) * 100
    : 0;

  let statusColor = 'text-green-400';
  let statusText = 'Healthy';

  if (utilizationPct > 90) {
    statusColor = 'text-red-400';
    statusText = 'At Limit';
  } else if (utilizationPct > 70) {
    statusColor = 'text-yellow-400';
    statusText = 'Near Limit';
  }

  return (
    <div className="text-xs text-gray-400 bg-gray-800/30 rounded p-2">
      <div className="flex justify-between items-center">
        <span>House Status</span>
        <span className={`font-bold ${statusColor}`}>{statusText}</span>
      </div>
      {utilizationPct > 70 && (
        <div className={`text-center mt-1 ${statusColor}`}>
          ⚠️ Using {utilizationPct.toFixed(0)}% of house limit
        </div>
      )}
    </div>
  );
};
```

### 3. Responsive Behavior (CSS)

```css
/* PSEUDOCODE - Responsive grid behavior */

/* Desktop: Side-by-side layout */
@media (min-width: 1024px) {
  .game-main-area {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }
}

/* Tablet/Mobile: Stack vertically */
@media (max-width: 1023px) {
  .game-main-area {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Animation comes first on mobile for visual priority */
  .animation-column {
    order: 1;
  }

  .controls-column {
    order: 2;
  }
}
```

### 4. Keep Existing Functionality

**Maintain all existing features:**
- ✅ Balance management (deposit/withdraw)
- ✅ Bet amount slider
- ✅ Target number control
- ✅ Direction toggle (Over/Under)
- ✅ Stats calculation
- ✅ House limit checks
- ✅ Dice rolling animation
- ✅ Win/loss messaging
- ✅ Game history (simple + detailed)
- ✅ CSV export
- ✅ Error handling
- ✅ Authentication checks
- ✅ Practice mode support

**No backend changes needed** - This is purely a frontend layout refactor.

## Files to Modify

### Primary Changes
1. **`openhouse_frontend/src/pages/dice/DiceGame.tsx`** (MODIFY)
   - Restructure JSX layout to unified card design
   - Inline balance display instead of separate component
   - Side-by-side controls + animation grid
   - Collapsible game history at bottom
   - Keep all existing state management and logic

### Files NOT Modified
- ❌ `DiceAccountingPanel.tsx` - Logic extracted inline
- ❌ `DiceControls.tsx` - Reused as-is
- ❌ `DiceAnimation.tsx` - Reused as-is
- ❌ `DiceAnimation.css` - No changes needed
- ❌ Backend canisters - No changes
- ❌ Other game UIs - Dice-specific refactor only

## Testing Strategy

**Manual Testing on Mainnet (MANDATORY):**

```bash
# 1. Build and deploy
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only

# 2. Visit deployed site
# https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

# 3. Test all features:
# - Balance display shows correct amounts
# - Buy chips modal works
# - Cash out works
# - Bet slider adjusts properly
# - Target slider changes win chance/multiplier
# - Direction buttons toggle Over/Under
# - Stats display updates correctly
# - Roll dice executes game
# - Animation plays smoothly
# - Win/loss message displays
# - Game history updates
# - Responsive layout on mobile (dev tools)
# - All existing error handling works
```

**Visual Regression Check:**
- Compare before/after screenshots
- Ensure no features were lost
- Verify improved scannability
- Test on different screen sizes

## Deployment Notes

**Affected Canisters:**
- `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai)

**Deployment Command:**
```bash
cd openhouse_frontend && npm run build && cd ..
./deploy.sh --frontend-only
```

**Rollback Plan:**
If issues arise, previous version remains in git history:
```bash
git revert <commit-hash>
./deploy.sh --frontend-only
```

## Success Criteria

✅ **Single unified card** - All game elements in one cohesive interface
✅ **Side-by-side layout** - Controls and animation visible together
✅ **Inline balance bar** - Compact horizontal display at top
✅ **Reduced scrolling** - Better space utilization
✅ **All features work** - No functionality lost
✅ **Responsive design** - Stacks nicely on mobile
✅ **Deployed to mainnet** - Live on production
✅ **PR created** - Documented changes with screenshots

## Design Philosophy

**Key Principles:**
1. **Unified Experience** - One card, one game, no fragmentation
2. **Visual Hierarchy** - Related elements grouped logically
3. **Efficient Space Usage** - Horizontal layout over excessive vertical stacking
4. **Maintain Functionality** - Zero features lost in redesign
5. **Responsive First** - Works on desktop and mobile

**User Benefits:**
- Less scrolling to see all game elements
- Controls and results visible simultaneously
- Cleaner, more professional appearance
- Faster comprehension of game state
- Improved overall game experience

## Notes

- This is a **visual refactor only** - no game logic changes
- All existing state management remains unchanged
- No new dependencies required
- No backend API changes
- Compatible with existing game hooks and providers
- Can be easily reverted if issues arise
- Sets pattern for potential future game UI improvements
- **Gemini Implementation** - Separate branch for A/B comparison

---

**END OF PLAN**
