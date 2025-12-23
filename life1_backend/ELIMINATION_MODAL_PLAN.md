# Risk Game: Elimination Modal Implementation Plan

## Problem Statement

When a player's base is destroyed (coins reach 0), the UI continues to show them as "Player X" with full game controls, rather than acknowledging their elimination. This creates confusion:

1. Player doesn't realize they've been eliminated
2. They can still attempt to place patterns (which will fail)
3. No clear path to rejoin or spectate
4. Stats table still highlights their (now non-existent) row

## Solution: Elimination Modal (Option A)

Display a modal overlay when elimination is detected, giving the player clear feedback and options to continue.

### Modal Content
```
┌─────────────────────────────────────────┐
│                                         │
│            💀 ELIMINATED                │
│                                         │
│       Your base was destroyed!          │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ Survived: 1,247 generations     │   │
│   │ Peak territory: 3,500 cells     │   │
│   │ Coins earned: 47                │   │
│   └─────────────────────────────────┘   │
│                                         │
│   Wallet balance: 🪙 52                 │
│                                         │
│   ┌──────────────┐  ┌──────────────┐   │
│   │   Spectate   │  │    Rejoin    │   │
│   └──────────────┘  └──────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

## Files Involved

### Primary File
- **`openhouse_frontend/src/pages/Risk.tsx`** - Main game component
  - Add elimination detection logic
  - Add modal state and component
  - Track stats for display (peak territory, generations survived)
  - Handle spectate/rejoin actions

### Supporting Files (may need minor changes)
- **`risk_backend/lib.rs`** - Backend game logic
  - Already handles elimination (base.coins = 0)
  - May need to expose elimination timestamp or cause

- **`openhouse_frontend/src/pages/riskConstants.ts`** - Constants
  - Add any new constants (animation durations, etc.)

## Implementation Details

### 1. State Additions (Risk.tsx)

```typescript
// New state variables
const [isEliminated, setIsEliminated] = useState(false);
const [eliminationStats, setEliminationStats] = useState<{
  generationsSurvived: bigint;
  peakTerritory: number;
  coinsEarned: number;
} | null>(null);

// Tracking variables (useRef)
const joinedAtGeneration = useRef<bigint | null>(null);
const peakTerritoryRef = useRef<number>(0);
const initialWalletRef = useRef<number>(0);
```

### 2. Elimination Detection

In the game state sync effect, after updating bases:

```typescript
// Check for elimination
if (myPlayerNum && !isEliminated) {
  const myBase = newBases.get(myPlayerNum);

  // Was in game (had base) but now base is gone
  if (!myBase && bases.get(myPlayerNum)) {
    // Eliminated!
    setIsEliminated(true);
    setEliminationStats({
      generationsSurvived: state.generation - (joinedAtGeneration.current || 0n),
      peakTerritory: peakTerritoryRef.current,
      coinsEarned: myBalance - initialWalletRef.current,
    });
  }
}
```

### 3. Peak Territory Tracking

Update peak territory whenever territory changes:

```typescript
// In the effect that computes territoryCounts
if (myPlayerNum) {
  const myTerritory = territoryCounts[myPlayerNum] || 0;
  if (myTerritory > peakTerritoryRef.current) {
    peakTerritoryRef.current = myTerritory;
  }
}
```

### 4. Join Tracking

When player joins (in join_game success handler):

```typescript
joinedAtGeneration.current = state.generation;
initialWalletRef.current = myBalance;
peakTerritoryRef.current = 0;
```

### 5. Modal Component

```tsx
{isEliminated && (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
    <div className="bg-gray-900 border border-red-500/50 rounded-lg p-6 max-w-sm mx-4 text-center">
      <div className="text-4xl mb-2">💀</div>
      <h2 className="text-2xl font-bold text-red-400 mb-2">ELIMINATED</h2>
      <p className="text-gray-400 mb-4">Your base was destroyed!</p>

      {eliminationStats && (
        <div className="bg-black/50 rounded p-3 mb-4 text-sm text-left">
          <div className="flex justify-between text-gray-500">
            <span>Survived:</span>
            <span className="text-white">{eliminationStats.generationsSurvived.toLocaleString()} gen</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Peak territory:</span>
            <span className="text-white">{eliminationStats.peakTerritory.toLocaleString()} cells</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Coins earned:</span>
            <span className={eliminationStats.coinsEarned >= 0 ? 'text-green-400' : 'text-red-400'}>
              {eliminationStats.coinsEarned >= 0 ? '+' : ''}{eliminationStats.coinsEarned}
            </span>
          </div>
        </div>
      )}

      <div className="text-gray-500 text-sm mb-4">
        Wallet: <span className="text-green-400">🪙 {myBalance}</span>
      </div>

      <div className="flex gap-3 justify-center">
        <button
          onClick={handleSpectate}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
        >
          Spectate
        </button>
        <button
          onClick={handleRejoin}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded"
        >
          Rejoin
        </button>
      </div>
    </div>
  </div>
)}
```

### 6. Action Handlers

```typescript
const handleSpectate = () => {
  setIsEliminated(false);
  setMyPlayerNum(null);  // Clear player association
  // Keep watching the game without controls
};

const handleRejoin = () => {
  setIsEliminated(false);
  setMyPlayerNum(null);
  setShowSlotSelection(true);  // Go back to slot selection
  // Reset tracking refs
  joinedAtGeneration.current = null;
  peakTerritoryRef.current = 0;
  initialWalletRef.current = myBalance;
};
```

### 7. UI Adjustments for Spectator Mode

When `myPlayerNum === null` but game is loaded:
- Hide pattern selector
- Hide placement controls
- Show "Spectating" indicator
- Show "Join Game" button

## Potential Issues & Edge Cases

### 1. Race Condition on Join
**Issue**: Player joins, state syncs, but base hasn't appeared yet in the state.
**Solution**: Don't check for elimination until player has had a base for at least one sync cycle. Track `hadBase` boolean.

### 2. Temporary Disconnection
**Issue**: Network glitch causes state to temporarily show no base.
**Solution**: Add a 2-3 second debounce before declaring elimination. Only trigger if base is consistently missing.

### 3. Multiple Eliminations
**Issue**: Player rejoins, gets eliminated again - stats should reset.
**Solution**: Reset all tracking refs in `handleRejoin()`.

### 4. Wallet Sync Timing
**Issue**: Wallet balance might not be updated at exact moment of elimination.
**Solution**: Fetch fresh balance when elimination detected before showing modal.

### 5. Grace Period Interaction
**Issue**: New players have grace period - should we show different message if eliminated during grace?
**Solution**: Check `in_grace_period` from SlotInfo. If true, show "Grace period ended - base destroyed!" instead.

### 6. Spectator Can't See Controls
**Issue**: After spectating, if they refresh, they might be stuck without join option.
**Solution**: Always show "Join Game" button when `myPlayerNum === null` and user is authenticated.

### 7. Animation/Polish
**Issue**: Abrupt modal appearance feels jarring.
**Solution**:
- Brief red flash on canvas when base destroyed
- Fade-in animation on modal
- Optional: camera pan to where base was

### 8. Mobile Layout
**Issue**: Modal might not fit well on small screens.
**Solution**: Use `max-w-sm mx-4` and responsive padding. Test on mobile viewport.

## Testing Checklist

- [ ] Player sees modal when base coins reach 0
- [ ] Stats display correctly (generations, territory, coins)
- [ ] "Spectate" dismisses modal, clears player controls
- [ ] "Rejoin" takes player to slot selection
- [ ] Spectator mode hides placement controls
- [ ] Spectator can still pan/zoom the map
- [ ] Join button visible in spectator mode
- [ ] No false positives (modal doesn't show on page load)
- [ ] Works after multiple join/eliminate cycles
- [ ] Mobile responsive

## Future Enhancements

1. **Death Animation**: Brief explosion or particle effect at base location
2. **Kill Attribution**: "Destroyed by Player 3" if we track attacker
3. **Leaderboard**: Show ranking among eliminated players
4. **Revenge Option**: "Spawn near Player 3" button
5. **Sound Effects**: Dramatic elimination sound
6. **Screenshot**: "Share your run" with auto-generated image

## Implementation Order

1. Add state variables and refs for tracking
2. Add elimination detection in sync effect
3. Add modal component (static first)
4. Wire up handlers (spectate/rejoin)
5. Add spectator mode UI changes
6. Add debounce/edge case handling
7. Polish animations and mobile layout
8. Test all scenarios
