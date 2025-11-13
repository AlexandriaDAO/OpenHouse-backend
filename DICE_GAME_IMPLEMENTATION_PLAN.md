# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-game"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-game`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Frontend changes only:
     ```bash
     cd openhouse_frontend
     npm install
     npm run build
     cd ..
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"

   # Test the backend
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai greet '("Player")'
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_stats
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: implement dice game UI with over/under betting

Implemented complete dice game interface:
- Bet amount input with validation
- Target number slider (1-99)
- Over/Under direction selector
- Real-time win chance and multiplier display
- Roll dice button with result animation
- Game history table showing recent rolls
- Error handling and loading states

Backend already deployed with game logic.
Frontend now provides complete end-to-end gameplay."

   git push -u origin feature/dice-game

   gh pr create --title "[Feature]: Implement Dice Game UI" --body "# Dice Game Implementation

## Summary
- ✅ Complete frontend UI for dice game
- ✅ Over/Under betting mechanics
- ✅ Real-time odds calculation display
- ✅ Animated dice roll results
- ✅ Game history visualization
- ✅ Responsive design matching casino theme

## Deployed to Mainnet
- **Frontend**: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
- **Backend Canister**: whchi-hyaaa-aaaao-a4ruq-cai (Dice)

## Test Plan
1. Visit /dice route
2. Adjust bet amount (0.1 - 100 ICP mock values)
3. Move target number slider
4. Toggle Over/Under direction
5. Observe win chance % and multiplier update
6. Click Roll Dice
7. View animated result
8. Check game history table updates

🤖 Generated with Claude Code"
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

**Branch:** `feature/dice-game`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-game`

---

# Implementation Plan: Dice Game UI

## Task Classification
**NEW FEATURE** - Build dice game frontend UI for existing backend

## Current State

### Backend Status (✅ COMPLETE)
**File:** `dice_backend/src/lib.rs` (291 lines)
- ✅ Over/Under game mechanics implemented
- ✅ VRF-based randomness (IC raw_rand)
- ✅ Win chance calculation (1% - 98%)
- ✅ Multiplier calculation with 3% house edge
- ✅ Game history storage in stable memory
- ✅ Stats tracking (volume, payouts, profit)
- ✅ API: `play_dice`, `get_stats`, `get_recent_games`, `calculate_payout_info`
- ⚠️ ICP transfers are TODO (mock mode for now)

**Canister ID:** `whchi-hyaaa-aaaao-a4ruq-cai`

### Frontend Status (❌ INCOMPLETE)
**File:** `openhouse_frontend/src/pages/Dice.tsx` (148 lines)
- ✅ Actor initialization
- ✅ Backend connection testing
- ✅ Layout and styling structure
- ❌ NO betting interface
- ❌ NO dice roll UI
- ❌ NO result display
- ❌ NO game history display

**Current UI:** Shows connection status + placeholder "Game UI will be implemented here"

### Supporting Files (✅ READY)
- `openhouse_frontend/src/hooks/actors/useDiceActor.ts` - Actor hook
- `openhouse_frontend/src/declarations/dice_backend/*` - Type declarations
- `dice_backend/dice_backend.did` - Candid interface
- `openhouse_frontend/src/App.tsx` - Route `/dice` already configured

## What Needs Implementation

Build the complete dice game UI in `openhouse_frontend/src/pages/Dice.tsx`:

1. **Betting Controls**
   - Bet amount input (mock values: 0.1 - 100 ICP)
   - Target number selector (1-99 range)
   - Over/Under direction toggle

2. **Live Calculations Display**
   - Win chance percentage (auto-updates)
   - Multiplier display (auto-updates)
   - Potential payout calculation

3. **Game Interaction**
   - Roll Dice button
   - Loading state during roll
   - Animated result display

4. **Result Visualization**
   - Show rolled number
   - Highlight win/loss
   - Display actual payout

5. **Game History**
   - Recent rolls table
   - Show: target, direction, roll, result, payout

## Implementation Pseudocode

### Frontend: `openhouse_frontend/src/pages/Dice.tsx` (MODIFY)

Replace the placeholder game area with a complete functional UI:

```typescript
// PSEUDOCODE - Complete Dice Game UI

import React, { useState, useEffect } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import { useAuth } from '../providers/AuthProvider';

interface GameResult {
  // Match DiceResult from backend
  player: Principal;
  bet_amount: bigint;
  target_number: number;
  direction: { Over: null } | { Under: null };
  rolled_number: number;
  win_chance: number;
  multiplier: number;
  payout: bigint;
  is_win: boolean;
  timestamp: bigint;
}

export const Dice: React.FC = () => {
  // Existing connection state...

  // Game state
  const [betAmount, setBetAmount] = useState(1); // Mock ICP amount
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<'Over' | 'Under'>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const [error, setError] = useState('');

  // Calculate odds when target or direction changes
  useEffect(() => {
    async function updateOdds() {
      if (!actor) return;

      try {
        // Call backend to calculate payout info
        const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };
        const result = await actor.calculate_payout_info(targetNumber, directionVariant);

        if ('Ok' in result) {
          const [chance, mult] = result.Ok;
          setWinChance(chance * 100); // Convert to percentage
          setMultiplier(mult);
        } else {
          setError(result.Err);
        }
      } catch (err) {
        console.error('Failed to calculate odds:', err);
      }
    }

    updateOdds();
  }, [targetNumber, direction, actor]);

  // Load game history on mount
  useEffect(() => {
    async function loadHistory() {
      if (!actor) return;

      try {
        const history = await actor.get_recent_games(10);
        setGameHistory(history);
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    }

    loadHistory();
  }, [actor]);

  // Handle dice roll
  async function rollDice() {
    if (!actor || !isAuthenticated) return;

    setIsRolling(true);
    setError('');
    setLastResult(null);

    try {
      // Convert mock ICP to e8s (1 ICP = 100_000_000 e8s)
      const betAmountE8s = BigInt(Math.floor(betAmount * 100_000_000));
      const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };

      // Call play_dice
      const result = await actor.play_dice(betAmountE8s, targetNumber, directionVariant);

      if ('Ok' in result) {
        setLastResult(result.Ok);

        // Update history
        setGameHistory(prev => [result.Ok, ...prev.slice(0, 9)]);
      } else {
        setError(result.Err);
      }
    } catch (err) {
      console.error('Failed to roll dice:', err);
      setError(err.message || 'Failed to roll dice');
    } finally {
      setIsRolling(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Existing header and connection status... */}

      {/* BETTING CONTROLS */}
      <div className="card max-w-4xl mx-auto">
        <h3 className="font-bold mb-4">Place Your Bet</h3>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column: Bet controls */}
          <div className="space-y-4">
            {/* Bet Amount Input */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Bet Amount (ICP)
              </label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={betAmount}
                onChange={(e) => setBetAmount(parseFloat(e.target.value))}
                className="w-full bg-casino-primary border border-casino-accent rounded px-4 py-2"
                disabled={isRolling}
              />
            </div>

            {/* Target Number Slider */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Target Number: <span className="text-white font-bold">{targetNumber}</span>
              </label>
              <input
                type="range"
                min="1"
                max="99"
                value={targetNumber}
                onChange={(e) => setTargetNumber(parseInt(e.target.value))}
                className="w-full"
                disabled={isRolling}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1</span>
                <span>50</span>
                <span>99</span>
              </div>
            </div>

            {/* Direction Toggle */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Direction
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDirection('Over')}
                  disabled={isRolling}
                  className={`flex-1 py-3 px-4 rounded font-bold transition ${
                    direction === 'Over'
                      ? 'bg-green-600 text-white'
                      : 'bg-casino-primary text-gray-400 hover:bg-casino-accent'
                  }`}
                >
                  OVER {targetNumber}
                </button>
                <button
                  onClick={() => setDirection('Under')}
                  disabled={isRolling}
                  className={`flex-1 py-3 px-4 rounded font-bold transition ${
                    direction === 'Under'
                      ? 'bg-red-600 text-white'
                      : 'bg-casino-primary text-gray-400 hover:bg-casino-accent'
                  }`}
                >
                  UNDER {targetNumber}
                </button>
              </div>
            </div>
          </div>

          {/* Right column: Odds display */}
          <div className="space-y-4">
            {/* Win Chance */}
            <div className="bg-casino-primary rounded p-4">
              <div className="text-sm text-gray-400 mb-1">Win Chance</div>
              <div className="text-3xl font-bold text-casino-highlight">
                {winChance.toFixed(2)}%
              </div>
            </div>

            {/* Multiplier */}
            <div className="bg-casino-primary rounded p-4">
              <div className="text-sm text-gray-400 mb-1">Multiplier</div>
              <div className="text-3xl font-bold text-green-400">
                {multiplier.toFixed(2)}x
              </div>
            </div>

            {/* Potential Payout */}
            <div className="bg-casino-primary rounded p-4">
              <div className="text-sm text-gray-400 mb-1">Potential Win</div>
              <div className="text-2xl font-bold">
                {(betAmount * multiplier).toFixed(2)} ICP
              </div>
            </div>
          </div>
        </div>

        {/* Roll Button */}
        <button
          onClick={rollDice}
          disabled={isRolling || !isAuthenticated || !actor}
          className="w-full mt-6 bg-casino-highlight hover:bg-casino-highlight/80 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-lg text-xl transition"
        >
          {isRolling ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              Rolling...
            </span>
          ) : (
            '🎲 ROLL DICE'
          )}
        </button>

        {/* Error Display */}
        {error && (
          <div className="mt-4 bg-red-900/20 border border-red-500/50 rounded p-3 text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* RESULT DISPLAY */}
      {lastResult && (
        <div className="card max-w-4xl mx-auto">
          <h3 className="font-bold mb-4">Result</h3>

          <div className={`rounded-lg p-8 text-center ${
            lastResult.is_win ? 'bg-green-900/20 border-2 border-green-500' : 'bg-red-900/20 border-2 border-red-500'
          }`}>
            {/* Rolled Number Display */}
            <div className="text-8xl font-bold mb-4">
              {lastResult.rolled_number}
            </div>

            {/* Win/Loss Message */}
            <div className={`text-3xl font-bold mb-4 ${lastResult.is_win ? 'text-green-400' : 'text-red-400'}`}>
              {lastResult.is_win ? '🎉 YOU WIN!' : '😢 YOU LOSE'}
            </div>

            {/* Details */}
            <div className="text-gray-300 space-y-1">
              <div>
                Target: {lastResult.target_number} ({Object.keys(lastResult.direction)[0]})
              </div>
              <div>
                Win Chance: {(lastResult.win_chance * 100).toFixed(2)}%
              </div>
              {lastResult.is_win && (
                <div className="text-2xl text-green-400 font-bold mt-2">
                  +{(Number(lastResult.payout) / 100_000_000).toFixed(2)} ICP
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GAME HISTORY */}
      {gameHistory.length > 0 && (
        <div className="card max-w-4xl mx-auto">
          <h3 className="font-bold mb-4">Recent Games</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-casino-accent">
                <tr className="text-gray-400">
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Direction</th>
                  <th className="text-left py-2">Roll</th>
                  <th className="text-left py-2">Result</th>
                  <th className="text-right py-2">Payout</th>
                </tr>
              </thead>
              <tbody>
                {gameHistory.map((game, idx) => (
                  <tr key={idx} className="border-b border-casino-primary/50">
                    <td className="py-2">{game.target_number}</td>
                    <td className="py-2">
                      <span className={Object.keys(game.direction)[0] === 'Over' ? 'text-green-400' : 'text-red-400'}>
                        {Object.keys(game.direction)[0]}
                      </span>
                    </td>
                    <td className="py-2 font-bold">{game.rolled_number}</td>
                    <td className="py-2">
                      <span className={game.is_win ? 'text-green-400' : 'text-red-400'}>
                        {game.is_win ? 'Win' : 'Loss'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {game.is_win ? `+${(Number(game.payout) / 100_000_000).toFixed(2)}` : '0.00'} ICP
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Existing game info section... */}
    </div>
  );
};
```

## Implementation Steps

### Step 1: State Management
- Add state hooks for bet controls
- Add state for game results
- Add state for game history
- Add loading/error states

### Step 2: Odds Calculator
- Create useEffect to call `calculate_payout_info`
- Update whenever target or direction changes
- Display win chance and multiplier in real-time

### Step 3: Roll Handler
- Implement `rollDice` async function
- Convert bet amount to e8s
- Call `play_dice` backend method
- Handle success/error responses
- Update UI with results

### Step 4: Result Display
- Create animated result card
- Show rolled number prominently
- Highlight win/loss with colors
- Display payout amount

### Step 5: History Table
- Fetch recent games on mount
- Display in sortable table
- Show key info: target, direction, roll, result, payout
- Update table after each new roll

## Technical Details

### Type Conversions
```typescript
// ICP to e8s (backend expects nat64)
const e8s = BigInt(Math.floor(icpAmount * 100_000_000));

// Direction to Candid variant
const direction = isOver ? { Over: null } : { Under: null };

// e8s back to ICP (for display)
const icp = Number(e8sBigInt) / 100_000_000;
```

### Backend API Calls
```typescript
// Calculate odds (no state change)
await actor.calculate_payout_info(target: nat8, direction: RollDirection)
  -> Result<(f64, f64), string>

// Play game (state change)
await actor.play_dice(bet: nat64, target: nat8, direction: RollDirection)
  -> Result<DiceResult, string>

// Get history (query)
await actor.get_recent_games(limit: nat32)
  -> Vec<DiceResult>
```

### Styling Notes
- Use existing Tailwind classes from casino theme
- Colors: `casino-primary`, `casino-accent`, `casino-highlight`
- Green for wins, red for losses
- Responsive grid layout for bet controls

## Deployment Notes

### Affected Components
- **Frontend only**: `openhouse_frontend/src/pages/Dice.tsx`
- **Backend**: No changes needed (already deployed)

### Build Process
```bash
cd openhouse_frontend
npm install  # Ensure dependencies
npm run build  # Build production bundle
cd ..
./deploy.sh  # Deploy all canisters (frontend will update)
```

### Testing After Deployment
1. Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
2. Test bet amount input (0.1 - 100)
3. Adjust target slider (1-99)
4. Toggle Over/Under
5. Verify odds update in real-time
6. Click Roll Dice (need to be authenticated)
7. View result display
8. Check history table updates

### Backend Test Commands
```bash
# Test greeting
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai greet '("TestPlayer")'

# Test odds calculation
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai calculate_payout_info '(50 : nat8, variant { Over })'

# Test game stats
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_stats

# Test play dice (with mock bet)
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai play_dice '(100_000_000 : nat64, 50 : nat8, variant { Over })'
```

## Success Criteria

✅ User can adjust bet amount, target, and direction
✅ Win chance and multiplier update in real-time
✅ Roll button triggers backend play_dice call
✅ Result displays rolled number and win/loss status
✅ Game history shows recent games
✅ All interactions work end-to-end
✅ No real ICP transfers (mock mode)
✅ UI matches casino theme
✅ Responsive design works on mobile

## Notes

- **No Real Money**: Backend has TODO for ICP transfers, so this is mock gameplay
- **Authentication Required**: Must be logged in to roll (existing auth flow)
- **VRF Randomness**: Backend uses IC's VRF for provably fair dice rolls
- **House Edge**: 3% built into multiplier calculations
- **Win Chance Range**: 1% - 98% (enforced by backend)

---

🎲 **End of Plan** - Ready for autonomous implementation and PR creation
