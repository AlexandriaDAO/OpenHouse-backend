# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-dynamic-limits"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-dynamic-limits`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Both backend + frontend:
     ```bash
     cargo build --target wasm32-unknown-unknown --release
     cd openhouse_frontend && npm run build && cd ..
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: implement dynamic max bet limits for dice game based on 10 ICP max win"
   git push -u origin feature/dice-dynamic-max-bet
   gh pr create --title "Dice: Dynamic Max Bet Based on 10 ICP Max Win" --body "Implements DICE_DYNAMIC_MAX_BET_PLAN.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
- Affected canisters: dice_backend, openhouse_frontend"
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

**Branch:** `feature/dice-dynamic-max-bet`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-dynamic-limits`

---

# Implementation Plan

## Task Classification
**REFACTORING**: Improve existing dice game bet validation → targeted fixes

## Current State Documentation

### Backend Constants (`dice_backend/src/lib.rs:100-101`)
```rust
const MIN_BET: u64 = 1_000_000; // 0.01 ICP
const MAX_BET: u64 = 10_000_000_000; // 100 ICP (static, problematic)
```

### Current Validation Flow
1. Backend validates bet against static MIN_BET/MAX_BET (lines 349-354)
2. Backend calculates multiplier: `(1 - 0.03) / win_chance` capped at 100x (line 290)
3. Backend checks if max payout exceeds house balance (lines 386-392)
4. Frontend uses static max of 100 ICP (Dice.tsx:206)

### Problem
- Max bet is static 100 ICP regardless of multiplier
- With 100x multiplier, max payout would be 10,000 ICP
- Need dynamic max bet: `10 ICP / multiplier`

### Affected Components
- **Backend**: `dice_backend/src/lib.rs`
- **Frontend**: `openhouse_frontend/src/pages/Dice.tsx`
- **Documentation**: `CLAUDE.md`

## Implementation Pseudocode

### Backend: `dice_backend/src/lib.rs` (MODIFY)

#### 1. Update Constants (line ~101)
```rust
// PSEUDOCODE - Replace MAX_BET constant
const MIN_BET: u64 = 1_000_000; // 0.01 ICP
const MAX_WIN: u64 = 1_000_000_000; // 10 ICP max win (NEW)
// Remove: const MAX_BET - now calculated dynamically
```

#### 2. Add Dynamic Max Bet Calculation (NEW function after line ~291)
```rust
// PSEUDOCODE - Add new function
fn calculate_max_bet(target_number: u8, direction: &RollDirection) -> u64 {
    // Calculate win chance for this bet
    let win_chance = calculate_win_chance(target_number, direction);

    // Calculate multiplier
    let multiplier = calculate_multiplier(win_chance);

    // Max bet = max win / multiplier
    // Use floor to ensure we never exceed max win
    let max_bet_f64 = (MAX_WIN as f64) / multiplier;
    max_bet_f64.floor() as u64
}
```

#### 3. Add Query Method for Frontend (NEW after line ~473)
```rust
// PSEUDOCODE - Add query method
#[query]
fn get_max_bet(target_number: u8, direction: RollDirection) -> u64 {
    calculate_max_bet(target_number, &direction)
}
```

#### 4. Update play_dice Validation (MODIFY lines ~349-354)
```rust
// PSEUDOCODE - Replace static MAX_BET validation
// Validate input
if bet_amount < MIN_BET {
    return Err(format!("Minimum bet is {} ICP", MIN_BET / 100_000_000));
}

// Calculate dynamic max bet for this specific bet
let max_bet = calculate_max_bet(target_number, &direction);
if bet_amount > max_bet {
    return Err(format!(
        "Maximum bet is {:.4} ICP for {}x multiplier (10 ICP max win)",
        max_bet as f64 / 100_000_000.0,
        calculate_multiplier(calculate_win_chance(target_number, &direction))
    ));
}
```

#### 5. Update Candid Interface (`dice_backend/dice_backend.did`)
```candid
// PSEUDOCODE - Add to service interface
service : {
    // ... existing methods ...
    get_max_bet : (nat8, RollDirection) -> (nat64) query;
}
```

### Frontend: `openhouse_frontend/src/pages/Dice.tsx` (MODIFY)

#### 1. Add Max Bet State (after line ~48)
```typescript
// PSEUDOCODE
const [maxBet, setMaxBet] = useState(10); // Dynamic max bet in ICP
```

#### 2. Update Odds Calculation Effect (MODIFY lines ~52-73)
```typescript
// PSEUDOCODE - Update existing useEffect
useEffect(() => {
    const updateOdds = async () => {
        if (!actor) return;

        try {
            const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };

            // Get payout info (existing)
            const result = await actor.calculate_payout_info(targetNumber, directionVariant);

            if ('Ok' in result) {
                const [chance, mult] = result.Ok;
                setWinChance(chance * 100);
                setMultiplier(mult);
            } else if ('Err' in result) {
                gameState.setGameError(result.Err);
            }

            // Get max bet (NEW)
            const maxBetE8s = await actor.get_max_bet(targetNumber, directionVariant);
            const maxBetICP = Number(maxBetE8s) / 100_000_000;
            setMaxBet(maxBetICP);

            // Adjust current bet if it exceeds new max (NEW)
            if (gameState.betAmount > maxBetICP) {
                gameState.setBetAmount(maxBetICP);
            }
        } catch (err) {
            console.error('Failed to calculate odds:', err);
        }
    };

    updateOdds();
}, [targetNumber, direction, actor]);
```

#### 3. Update BetAmountInput (MODIFY lines ~202-211)
```typescript
// PSEUDOCODE - Pass dynamic max
<BetAmountInput
    value={gameState.betAmount}
    onChange={gameState.setBetAmount}
    min={0.01}
    max={maxBet}  // Use dynamic max instead of 100
    disabled={gameState.isPlaying}
    isPracticeMode={gameMode.isPracticeMode}
    error={gameState.betError}
    variant="slider"
/>
```

#### 4. Update useGameState Call (MODIFY line ~35)
```typescript
// PSEUDOCODE - Pass dynamic max to validation
const gameState = useGameState<DiceGameResult>(0.01, maxBet);
```

#### 5. Update Stats Display (MODIFY lines ~164-168)
```typescript
// PSEUDOCODE - Add max bet to stats
const stats: GameStat[] = [
    { label: 'Win Chance', value: `${winChance.toFixed(2)}%`, highlight: true, color: 'yellow' },
    { label: 'Multiplier', value: `${multiplier.toFixed(2)}x`, highlight: true, color: 'green' },
    { label: 'Max Bet', value: `${maxBet.toFixed(4)} ICP`, highlight: true, color: 'purple' }, // NEW
    { label: 'Win Amount', value: `${(gameState.betAmount * multiplier).toFixed(2)} ICP` },
];
```

### Documentation: `CLAUDE.md` (MODIFY)

#### Update Dice Game Section (lines ~176-182)
```markdown
### 4. Dice
- **Mechanics**: Roll a number from 0-100, predict over or under target
- **Objective**: Choose target number and direction, win if roll matches prediction
- **Min Bet**: 0.01 ICP
- **Max Bet**: Dynamic based on multiplier (10 ICP max win / multiplier)
- **Max Win**: 10 ICP
- **House Edge**: 3%
- **Win Chance**: 1% to 98% (adjustable via target number)
- **Canister**: `dice_backend`
```

## Testing Requirements

**Manual verification only:**

1. **Backend Tests**:
```bash
# Test get_max_bet for various multipliers
dfx canister --network ic call dice_backend get_max_bet '(99 : nat8, variant { Over })' # Should return ~10_000_000 (0.1 ICP for 100x)
dfx canister --network ic call dice_backend get_max_bet '(50 : nat8, variant { Over })' # Should return ~500_000_000 (5 ICP for 2x)
```

2. **Frontend Tests**:
- Select high target (99) → verify max bet shows ~0.1 ICP
- Select medium target (50) → verify max bet shows ~5 ICP
- Try betting above dynamic max → verify error message
- Verify slider adjusts max dynamically

## Deployment Notes

**Affected Canisters:**
- `dice_backend` (whchi-hyaaa-aaaao-a4ruq-cai)
- `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai)

**Breaking Changes:**
- New query method `get_max_bet` added
- Frontend will need new backend declarations

**Rollback Plan:**
- Revert to static MAX_BET constant
- Remove get_max_bet method
- Restore frontend to use static 100 ICP max

## Summary

This plan implements dynamic max bet limits for the dice game based on a 10 ICP maximum win. The max bet is calculated as `10 ICP / multiplier`, ensuring that no single bet can win more than 10 ICP regardless of the odds selected. This protects the house from excessive exposure while still allowing flexible betting within safe limits.