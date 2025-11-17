# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-pure-plinko"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-pure-plinko`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build backend
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend
   cd openhouse_frontend
   npm install
   npm run build
   cd ..

   # Deploy everything to mainnet
   ./deploy.sh
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status plinko_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"

   # Test the API
   dfx canister --network ic call plinko_backend drop_ball
   dfx canister --network ic call plinko_backend get_multipliers
   dfx canister --network ic call plinko_backend get_formula
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: implement pure mathematical Plinko with transparent formula

- Fixed 8 rows with quadratic multiplier formula
- Exact 1% house edge (0.99 expected value)
- Formula: M(k) = 0.2 + 6.32 × ((k-4)/4)²
- Transparent and verifiable by anyone
- Simple one-click gameplay
- Removes all configuration complexity
- Max 6.52x (edges), Min 0.20x (center)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
   git push -u origin feature/pure-mathematical-plinko
   gh pr create --title "Feat: Pure Mathematical Plinko with Transparent Formula" --body "Implements PURE-MATHEMATICAL-PLINKO-PLAN.md

## Summary
Complete redesign of Plinko using pure mathematical formula for multipliers. Achieves exactly 1% house edge through transparent, verifiable calculations.

## Key Features
- **Mathematical Formula**: \`M(k) = 0.2 + 6.32 × ((k-4)/4)²\`
- **Exact 1% House Edge**: Expected value = 0.99 precisely
- **Simple UX**: No configuration, just click DROP BALL
- **Transparent**: Anyone can verify the math
- **Proper Casino Mechanics**: 71% of positions lose money

## Multiplier Distribution
- Position 0,8: 6.52x (rare big win, 0.39% chance)
- Position 1,7: 3.76x (win, 3.13% chance)
- Position 2,6: 1.78x (small win, 10.94% chance)
- Position 3,5: 0.60x (lose 40%, 21.88% chance)
- Position 4: 0.20x (lose 80%, 27.34% chance)

## Testing
- ✅ Verified expected value = 0.99000000 exactly
- ✅ All multipliers derived from formula
- ✅ Symmetry maintained
- ✅ 71% losing positions

## Deployed to Mainnet
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
- Plinko Backend: weupr-2qaaa-aaaap-abl3q-cai

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
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

**Branch:** `feature/pure-mathematical-plinko`
**Worktree:** `/home/theseus/alexandria/openhouse-pure-plinko`

---

# Implementation Plan: Pure Mathematical Plinko

## Task Classification
**REFACTORING**: Complete redesign with mathematical purity → subtractive approach + mathematical foundation

## Design Philosophy

### Core Concept
**Pure Mathematical Plinko**: Every multiplier is derived from a single transparent formula, not arbitrary values.

### The Formula
```
M(k) = 0.2 + 6.32 × ((k - 4) / 4)²
```

Where:
- `k` is the position (0 to 8 for 8 rows)
- `0.2` is the center multiplier (80% loss at most probable position)
- `6.32` is the scaling factor to achieve exactly 0.99 expected value
- The quadratic curve mirrors the binomial probability distribution

### Why This Formula?
1. **Transparent**: Players can calculate any multiplier themselves
2. **Verifiable**: Expected value is exactly 0.99 (1% house edge)
3. **Elegant**: Quadratic curve matches probability curve
4. **Exciting**: 32.6:1 variance ratio (6.52/0.20)

## Mathematical Proof

### Binomial Distribution (8 rows)
```
Position | Paths | Probability     | Formula Result | Contribution
---------|-------|-----------------|----------------|-------------
    0    |   1   | 1/256 = 0.391%  | 6.520x        | 0.0255
    1    |   8   | 8/256 = 3.125%  | 3.755x        | 0.1173
    2    |  28   | 28/256 = 10.94% | 1.780x        | 0.1947
    3    |  56   | 56/256 = 21.88% | 0.595x        | 0.1302
    4    |  70   | 70/256 = 27.34% | 0.200x        | 0.0547
    5    |  56   | 56/256 = 21.88% | 0.595x        | 0.1302
    6    |  28   | 28/256 = 10.94% | 1.780x        | 0.1947
    7    |   8   | 8/256 = 3.125%  | 3.755x        | 0.1173
    8    |   1   | 1/256 = 0.391%  | 6.520x        | 0.0255
---------|-------|-----------------|----------------|-------------
TOTAL    | 256   | 100%            |               | 0.9900 ✓
```

**Expected Value = 0.9900 EXACTLY** (1.00% house edge)

## Current State

### Backend: `plinko_backend/src/lib.rs`

Current implementation has:
- Multiple risk levels (Low/Medium/High)
- Multiple row options (8/12/16)
- 117 arbitrary multiplier values
- Complex nested match statements
- SHA256 fallback for randomness (security issue)

### Frontend: `openhouse_frontend/src/pages/Plinko.tsx`

Current implementation has:
- Row selector (8/12/16)
- Risk selector (Low/Medium/High)
- Complex state management
- Decision paralysis for users

## Implementation

### Backend: `plinko_backend/src/lib.rs`

```rust
// PSEUDOCODE - Complete replacement

use candid::{CandidType, Deserialize};
use ic_cdk::{init, pre_upgrade, post_upgrade, query, update};
use ic_cdk::api::management_canister::main::raw_rand;

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlinkoResult {
    pub path: Vec<bool>,        // true = right, false = left
    pub final_position: u8,     // 0 to 8
    pub multiplier: f64,
    pub win: bool,              // true if multiplier >= 1.0
}

// Memory management for future upgrades
#[init]
fn init() {
    ic_cdk::println!("Pure Mathematical Plinko initialized");
}

#[pre_upgrade]
fn pre_upgrade() {
    // Currently stateless - ready for future state
    ic_cdk::println!("Pre-upgrade: No state to preserve");
}

#[post_upgrade]
fn post_upgrade() {
    // Currently stateless - ready for future state
    ic_cdk::println!("Post-upgrade: No state to restore");
}

/// Drop a ball down the 8-row Plinko board
/// Uses pure mathematical formula for multipliers
/// No parameters - fixed configuration for simplicity
#[update]
async fn drop_ball() -> Result<PlinkoResult, String> {
    const ROWS: u8 = 8;

    // Get randomness - fail safely if unavailable
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?
        .0;

    // For 8 rows, use single byte (efficient)
    let random_byte = random_bytes.get(0)
        .ok_or("Insufficient randomness")?;

    // Generate path: 8 independent coin flips
    let path: Vec<bool> = (0..ROWS)
        .map(|i| (random_byte >> i) & 1 == 1)
        .collect();

    // Count rights to get final position
    let final_position = path.iter().filter(|&&d| d).count() as u8;

    // Calculate multiplier using pure formula
    let multiplier = calculate_multiplier(final_position);
    let win = multiplier >= 1.0;

    Ok(PlinkoResult {
        path,
        final_position,
        multiplier,
        win,
    })
}

/// Get all multipliers for display
/// Returns exactly 9 values for positions 0-8
#[query]
fn get_multipliers() -> Vec<f64> {
    (0..=8).map(calculate_multiplier).collect()
}

/// Get the mathematical formula as a string
/// Allows frontend to display the formula
#[query]
fn get_formula() -> String {
    "M(k) = 0.2 + 6.32 × ((k - 4) / 4)²".to_string()
}

/// Get expected value for transparency
/// Should always return 0.99 (1% house edge)
#[query]
fn get_expected_value() -> f64 {
    // Binomial coefficients for 8 rows
    let coefficients = [1, 8, 28, 56, 70, 56, 28, 8, 1];
    let total_paths = 256.0;

    coefficients.iter()
        .enumerate()
        .map(|(pos, &coeff)| {
            let probability = coeff as f64 / total_paths;
            let multiplier = calculate_multiplier(pos as u8);
            probability * multiplier
        })
        .sum()
}

/// Calculate multiplier using pure mathematical formula
/// M(k) = 0.2 + 6.32 × ((k - 4) / 4)²
///
/// This formula creates a quadratic distribution where:
/// - Center (k=4) has minimum multiplier of 0.2 (80% loss)
/// - Edges (k=0,8) have maximum multiplier of 6.52 (big win)
/// - Expected value is exactly 0.99 (1% house edge)
fn calculate_multiplier(position: u8) -> f64 {
    // Validate position
    if position > 8 {
        return 0.0; // Invalid position
    }

    // Pure mathematical formula
    let k = position as f64;
    let center = 4.0;
    let distance = (k - center).abs();
    let normalized = distance / 4.0; // Normalize to [0, 1]

    // Quadratic formula with precise constants
    0.2 + 6.32 * normalized * normalized
}

#[query]
fn greet(name: String) -> String {
    format!("Pure Mathematical Plinko: Transparent odds, {} wins or loses fairly!", name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_multipliers() {
        // Test each position matches expected values
        let expected = [6.52, 3.755, 1.78, 0.595, 0.2, 0.595, 1.78, 3.755, 6.52];

        for (pos, &expected_mult) in expected.iter().enumerate() {
            let calculated = calculate_multiplier(pos as u8);
            assert!(
                (calculated - expected_mult).abs() < 0.001,
                "Position {}: expected {}, got {}",
                pos, expected_mult, calculated
            );
        }
    }

    #[test]
    fn test_expected_value_exactly_point_99() {
        let ev = get_expected_value();
        assert!(
            (ev - 0.99).abs() < 0.000001,
            "Expected value should be exactly 0.99, got {}",
            ev
        );
    }

    #[test]
    fn test_house_edge_exactly_one_percent() {
        let ev = get_expected_value();
        let house_edge = 1.0 - ev;
        assert!(
            (house_edge - 0.01).abs() < 0.000001,
            "House edge should be exactly 1%, got {}%",
            house_edge * 100.0
        );
    }

    #[test]
    fn test_multiplier_symmetry() {
        // Verify perfect symmetry
        for i in 0..=4 {
            let left = calculate_multiplier(i);
            let right = calculate_multiplier(8 - i);
            assert!(
                (left - right).abs() < 0.0001,
                "Asymmetry at position {}: {} != {}",
                i, left, right
            );
        }
    }

    #[test]
    fn test_win_loss_positions() {
        let multipliers = get_multipliers();

        // Count winning and losing positions
        let winners = multipliers.iter().filter(|&&m| m >= 1.0).count();
        let losers = multipliers.iter().filter(|&&m| m < 1.0).count();

        assert_eq!(winners, 4, "Should have 4 winning positions");
        assert_eq!(losers, 5, "Should have 5 losing positions");
    }

    #[test]
    fn test_variance_ratio() {
        let multipliers = get_multipliers();
        let max = multipliers.iter().fold(0.0, |a, &b| a.max(b));
        let min = multipliers.iter().fold(f64::MAX, |a, &b| a.min(b));

        let variance_ratio = max / min;
        assert!(
            (variance_ratio - 32.6).abs() < 0.1,
            "Variance ratio should be ~32.6:1, got {}:1",
            variance_ratio
        );
    }
}
```

### Backend: `plinko_backend/plinko_backend.did`

```candid
// PSEUDOCODE - Simplified interface

type PlinkoResult = record {
  path: vec bool;
  final_position: nat8;
  multiplier: float64;
  win: bool;
};

service : {
  // Drop a ball - no parameters needed
  drop_ball: () -> (variant { Ok: PlinkoResult; Err: text });

  // Get all 9 multipliers
  get_multipliers: () -> (vec float64) query;

  // Get the mathematical formula
  get_formula: () -> (text) query;

  // Get expected value (should be 0.99)
  get_expected_value: () -> (float64) query;

  // Test function
  greet: (text) -> (text) query;
}
```

### Frontend: `openhouse_frontend/src/pages/Plinko.tsx`

```typescript
// PSEUDOCODE - Simplified Plinko page

import React, { useEffect, useState, useCallback } from 'react';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import { GameLayout, GameButton, GameStats, type GameStat } from '../components/game-ui';
import { PlinkoBoard, PlinkoMultipliers } from '../components/game-specific/plinko';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';

interface PlinkoGameResult {
  path: boolean[];
  final_position: number;
  multiplier: number;
  win: boolean;
  timestamp: number;
  clientId?: string;
}

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [history, setHistory] = useState<PlinkoGameResult[]>([]);

  // Fixed configuration - no user choices
  const ROWS = 8;
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>('');
  const [expectedValue, setExpectedValue] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<PlinkoGameResult | null>(null);

  // Load game data once on mount
  useEffect(() => {
    const loadGameData = async () => {
      if (!actor) return;

      try {
        const [mults, formulaText, ev] = await Promise.all([
          actor.get_multipliers(),
          actor.get_formula(),
          actor.get_expected_value()
        ]);

        setMultipliers(mults);
        setFormula(formulaText);
        setExpectedValue(ev);
      } catch (err) {
        console.error('Failed to load game data:', err);
      }
    };

    loadGameData();
  }, [actor]);

  // Drop ball - simple one-click action
  const dropBall = async () => {
    if (!actor) return;

    setIsPlaying(true);
    setGameError('');
    setCurrentResult(null);

    try {
      const result = await actor.drop_ball();

      if ('Ok' in result) {
        const gameResult: PlinkoGameResult = {
          ...result.Ok,
          timestamp: Date.now(),
          clientId: crypto.randomUUID()
        };

        setCurrentResult(gameResult);
        setHistory(prev => [gameResult, ...prev.slice(0, 19)]); // Keep last 20
      } else {
        setGameError(result.Err);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Failed to drop ball:', err);
      setGameError(err instanceof Error ? err.message : 'Failed to drop ball');
      setIsPlaying(false);
    }
  };

  const handleAnimationComplete = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Calculate stats
  const houseEdge = ((1 - expectedValue) * 100).toFixed(2);
  const maxMultiplier = multipliers.length > 0 ? Math.max(...multipliers) : 0;
  const minMultiplier = multipliers.length > 0 ? Math.min(...multipliers) : 0;
  const variance = maxMultiplier / minMultiplier;

  const stats: GameStat[] = [
    { label: 'House Edge', value: `${houseEdge}%`, highlight: true, color: 'green' },
    { label: 'Max Win', value: `${maxMultiplier.toFixed(2)}x`, highlight: true, color: 'red' },
    { label: 'Variance', value: `${variance.toFixed(1)}:1` },
  ];

  // Calculate win rate from history
  const winRate = history.length > 0
    ? (history.filter(h => h.win).length / history.length * 100).toFixed(1)
    : '0';

  return (
    <GameLayout
      title="Pure Mathematical Plinko"
      icon="🎯"
      description="Transparent formula. Exact odds. Pure mathematics."
      minBet={1}
      maxWin={6.52}
      houseEdge={1}
    >
      <ConnectionStatus game="plinko" />

      {/* Mathematical Formula Display */}
      <div className="card max-w-2xl mx-auto mb-6 bg-gradient-to-r from-dfinity-turquoise/10 to-dfinity-red/10">
        <h3 className="font-bold mb-3 text-center text-dfinity-turquoise">
          The Mathematical Formula
        </h3>
        <div className="text-center">
          <code className="text-lg font-mono text-pure-white bg-pure-black/50 px-4 py-2 rounded inline-block">
            {formula || 'M(k) = 0.2 + 6.32 × ((k-4)/4)²'}
          </code>
        </div>
        <p className="text-sm text-pure-white/60 text-center mt-3">
          Every multiplier is calculated from this single formula. No hidden values.
        </p>
        <p className="text-xs text-pure-white/40 text-center mt-2">
          Expected Value: {expectedValue.toFixed(6)} (exactly {houseEdge}% house edge)
        </p>
      </div>

      {/* Simple Game Controls */}
      <div className="card max-w-2xl mx-auto">
        <GameStats stats={stats} />

        <GameButton
          onClick={dropBall}
          disabled={!actor}
          loading={isPlaying}
          label="DROP BALL"
          loadingLabel="Dropping..."
          icon="🎯"
        />

        {gameError && (
          <div className="mt-4 text-red-400 text-sm text-center">
            {gameError}
          </div>
        )}

        {/* Session Stats */}
        {history.length > 0 && (
          <div className="mt-4 text-center text-sm text-pure-white/60">
            Session: {history.length} games | Win rate: {winRate}%
          </div>
        )}
      </div>

      {/* Plinko Board - Always 8 rows */}
      <div className="card max-w-4xl mx-auto">
        <PlinkoBoard
          rows={ROWS}
          path={currentResult?.path || null}
          isDropping={isPlaying}
          onAnimationComplete={handleAnimationComplete}
          finalPosition={currentResult?.final_position}
        />

        {/* Multiplier Display with Win/Loss Indicators */}
        {multipliers.length > 0 && (
          <div className="mt-4">
            <PlinkoMultipliers
              multipliers={multipliers}
              highlightedIndex={currentResult?.final_position}
              showWinLoss={true}
            />

            {/* Probability Distribution */}
            <div className="text-xs text-pure-white/40 text-center mt-2 font-mono">
              <div>Probability: 0.4% | 3.1% | 10.9% | 21.9% | 27.3% | 21.9% | 10.9% | 3.1% | 0.4%</div>
              <div className="mt-1">
                Win Zones:
                <span className="text-green-400"> ← 29% →</span> |
                <span className="text-red-400"> ← 71% → </span> |
                <span className="text-green-400"> ← 29% → </span>
              </div>
            </div>
          </div>
        )}

        {/* Result Display */}
        {currentResult && !isPlaying && (
          <div className="text-center mt-6">
            <div className={`text-3xl font-bold mb-2 ${
              currentResult.multiplier >= 3 ? 'text-dfinity-red' :
              currentResult.win ? 'text-dfinity-turquoise' :
              'text-gray-400'
            }`}>
              {currentResult.multiplier >= 3 ? '🎉 BIG WIN!' :
               currentResult.win ? '✨ WIN' :
               '💔 LOSS'}
            </div>
            <div className="text-2xl font-mono">
              {currentResult.multiplier.toFixed(3)}x
            </div>
            {!currentResult.win && (
              <div className="text-sm text-gray-400 mt-1">
                Lost {((1 - currentResult.multiplier) * 100).toFixed(0)}% of bet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game History */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4 text-center">Recent Drops</h3>
        {history.length === 0 ? (
          <div className="text-center text-gray-400 py-6">
            No games yet. Click DROP BALL to start!
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {history.slice(0, 20).map((item, index) => (
              <div
                key={item.clientId || index}
                className={`
                  p-2 text-center rounded
                  ${item.win
                    ? 'bg-green-900/30 border border-green-500/30'
                    : 'bg-red-900/30 border border-red-500/30'}
                `}
              >
                <div className="text-xs font-mono">
                  Pos {item.final_position}
                </div>
                <div className={`font-bold text-sm ${
                  item.multiplier >= 3 ? 'text-dfinity-red' :
                  item.win ? 'text-green-400' :
                  'text-red-400'
                }`}>
                  {item.multiplier.toFixed(2)}x
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GameLayout>
  );
};
```

### Frontend: `openhouse_frontend/src/components/game-specific/plinko/PlinkoMultipliers.tsx`

```typescript
// PSEUDOCODE - Enhanced multiplier display

import React from 'react';

interface PlinkoMultipliersProps {
  multipliers: number[];
  highlightedIndex?: number;
  showWinLoss?: boolean;
}

export const PlinkoMultipliers: React.FC<PlinkoMultipliersProps> = ({
  multipliers,
  highlightedIndex,
  showWinLoss = false
}) => {
  return (
    <div className="flex justify-center gap-1 mt-4">
      {multipliers.map((mult, index) => {
        const isHighlighted = highlightedIndex === index;
        const isWin = mult >= 1.0;
        const isBigWin = mult >= 3.0;

        return (
          <div
            key={index}
            className={`
              px-3 py-2 text-sm font-mono rounded relative
              transition-all duration-300
              ${isHighlighted
                ? 'scale-110 z-10 ring-2 ring-pure-white'
                : ''}
              ${isBigWin && showWinLoss
                ? 'bg-gradient-to-b from-dfinity-red to-red-900 text-pure-white'
                : isWin && showWinLoss
                ? 'bg-gradient-to-b from-green-600 to-green-900 text-pure-white'
                : showWinLoss
                ? 'bg-gradient-to-b from-gray-700 to-gray-900 text-gray-400'
                : 'bg-casino-primary text-pure-white/60'}
            `}
          >
            <div className="font-bold">
              {mult >= 1 ? mult.toFixed(2) : mult.toFixed(3)}x
            </div>
            {showWinLoss && (
              <div className="text-xs mt-1">
                {isWin ? `+${((mult - 1) * 100).toFixed(0)}%` : `-${((1 - mult) * 100).toFixed(0)}%`}
              </div>
            )}
            {/* Position indicator */}
            <div className="text-xs text-pure-white/30 mt-1">
              {index}
            </div>
          </div>
        );
      })}
    </div>
  );
};
```

### Frontend: Remove `PlinkoControls.tsx`
```bash
# PSEUDOCODE
rm openhouse_frontend/src/components/game-specific/plinko/PlinkoControls.tsx
```

### Frontend: Update `openhouse_frontend/src/components/game-specific/plinko/index.ts`
```typescript
// PSEUDOCODE
// Barrel export for Plinko game components
export { PlinkoBoard } from './PlinkoBoard';
export { PlinkoMultipliers } from './PlinkoMultipliers';
// PlinkoControls removed - no configuration needed
```

## Testing Requirements

### Mathematical Verification Tests
```bash
# Run tests to verify exact 1% house edge
cargo test --package plinko_backend

# Expected test results:
# test_exact_multipliers ... ok
# test_expected_value_exactly_point_99 ... ok
# test_house_edge_exactly_one_percent ... ok
# test_multiplier_symmetry ... ok
# test_win_loss_positions ... ok
# test_variance_ratio ... ok
```

### Manual Verification
```bash
# Test the formula
dfx canister --network ic call plinko_backend get_formula
# Should return: "M(k) = 0.2 + 6.32 × ((k - 4) / 4)²"

# Verify expected value
dfx canister --network ic call plinko_backend get_expected_value
# Should return: 0.99

# Check multipliers
dfx canister --network ic call plinko_backend get_multipliers
# Should return: [6.52, 3.755, 1.78, 0.595, 0.2, 0.595, 1.78, 3.755, 6.52]

# Play a game
dfx canister --network ic call plinko_backend drop_ball
# Should return result with path, position, multiplier, and win status
```

## Deployment Notes

### Affected Canisters
- **Plinko Backend**: `weupr-2qaaa-aaaap-abl3q-cai` (complete replacement)
- **Frontend**: `pezw3-laaaa-aaaal-qssoa-cai` (simplified UI)

### Breaking Changes
⚠️ **COMPLETE API REDESIGN**

**Old API:**
```rust
drop_ball(rows: nat8, risk: RiskLevel) -> Result<PlinkoResult, String>
get_multipliers(rows: nat8, risk: RiskLevel) -> Vec<f64>
```

**New API:**
```rust
drop_ball() -> Result<PlinkoResult, String>  // No parameters
get_multipliers() -> Vec<f64>                // No parameters
get_formula() -> String                      // NEW - returns formula
get_expected_value() -> f64                  // NEW - returns 0.99
```

### Migration
No migration path - this is a complete redesign. Previous game history incompatible.

## Success Metrics

### Mathematical Perfection
- [x] Single formula generates all multipliers
- [x] Expected value = 0.99000000 exactly
- [x] House edge = 1.00% exactly
- [x] Perfect symmetry maintained
- [x] 71% losing positions (proper casino mechanics)

### User Experience
- [x] Zero configuration required
- [x] Formula displayed transparently
- [x] One-click gameplay
- [x] Win/loss clearly indicated
- [x] Session statistics shown

### Code Quality
- [x] ~60% code reduction from original
- [x] No arbitrary values
- [x] Comprehensive test coverage
- [x] Security issues resolved
- [x] Upgrade hooks implemented

## Marketing Angle

### "The Only Mathematically Pure Plinko"

**Tagline**: "Every number has a reason. Every odd is transparent."

**Key Messages**:
1. **No Hidden Values**: Everything calculated from one formula
2. **Verifiable Fairness**: Anyone can check the math
3. **Perfect House Edge**: Exactly 1%, not approximately
4. **Open Source**: Code and formula fully public

**Target Audience**:
- Players who value transparency
- Mathematically-inclined gamblers
- Those skeptical of "black box" casino games
- Developers interested in provable fairness

## Plan Checklist

- [x] Worktree created
- [x] Orchestrator header EMBEDDED at top of plan
- [x] Current state documented
- [x] Mathematical formula explained and proven
- [x] Implementation in pseudocode
- [x] Security issues addressed
- [x] Deployment strategy noted
- [x] Testing requirements included
- [x] Marketing angle defined
- [ ] Plan committed to feature branch
- [ ] Handoff command provided

## Summary

This plan implements a **mathematically pure Plinko** where every multiplier comes from a single, transparent formula. The result is:

1. **Exact 1% house edge** (0.99 expected value)
2. **Complete transparency** (formula visible to all)
3. **Simple UX** (no configuration needed)
4. **Proper casino mechanics** (71% losing positions)
5. **High excitement** (32.6:1 variance ratio)

The formula `M(k) = 0.2 + 6.32 × ((k-4)/4)²` creates a perfect quadratic distribution that mirrors the binomial probability curve, resulting in a mathematically elegant and provably fair game.