# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-history"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-history`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build affected backend(s)
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet (deploys all canisters - simplest approach)
     ./deploy.sh
     ```
   - Frontend changes:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh
     ```
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
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): enhanced game history with detailed debugging data"
   git push -u origin feature/dice-enhanced-history
   gh pr create --title "feat(dice): Enhanced game history with detailed debugging data" --body "Implements DICE_ENHANCED_HISTORY_PLAN.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: dice_backend"
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

**Branch:** `feature/dice-enhanced-history`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-history`

---

# Implementation Plan: Enhanced Dice Game History

## Task Type: NEW FEATURE
Building new functionality to enhance dice game history with detailed debugging data for house odds analysis.

## Current State Documentation

### Backend Structure (`dice_backend/src/lib.rs`)
- **Lines 117-132**: Current `DiceResult` struct with basic fields
- **Lines 488-496**: Game history storage using `StableBTreeMap<u64, DiceResult, Memory>`
- **Lines 520-530**: `get_recent_games` query method returning `Vec<DiceResult>`
- **Dependencies**: Already using IC-Stable Structures v0.6 for persistence
- **Canister ID**: `whchi-hyaaa-aaaao-a4ruq-cai`

### Frontend Structure (`openhouse_frontend/src/pages/Dice.tsx`)
- **Lines 204-211**: Custom history renderer showing only rolled number and win/loss indicator
- **Lines 295-300**: GameHistory component displaying recent rolls
- **Line 17-18**: E8S_PER_ICP conversion constant

### Current History Display
```
Recent Rolls
49✗
30✗
2✗
10✗
58✓
```

### Required Enhancement
Show comprehensive game data:
- Bet amount in ICP
- Win amount in ICP
- Target number
- Over/Under direction
- Rolled number
- Multiplier
- Win chance percentage
- Timestamp
- Make data copyable for analysis

## Implementation Pseudocode

### Backend: `dice_backend/src/lib.rs` (MODIFY)

#### Enhanced DiceResult struct (Lines 117-132)
```rust
// PSEUDOCODE - Add game_id field for better tracking
pub struct DiceResult {
    pub game_id: u64,  // NEW: Add unique game ID
    pub player: Principal,
    pub bet_amount: u64,
    pub target_number: u8,
    pub direction: RollDirection,
    pub rolled_number: u8,
    pub win_chance: f64,
    pub multiplier: f64,
    pub payout: u64,
    pub is_win: bool,
    pub timestamp: u64,
    // Verification fields remain unchanged
    pub client_seed: String,
    pub nonce: u64,
    pub server_seed_hash: String,
}
```

#### Update play_dice function (Lines 462-509)
```rust
// PSEUDOCODE - Add game_id to result
let result = DiceResult {
    game_id,  // NEW: Include game ID
    player: caller,
    bet_amount,
    // ... rest of fields unchanged
};
```

#### Add new detailed history query method (After line 530)
```rust
// PSEUDOCODE - New method for detailed history with formatted data
#[query]
fn get_detailed_history(limit: u32) -> Vec<DetailedGameHistory> {
    GAME_HISTORY.with(|history| {
        let history = history.borrow();
        history
            .iter()
            .rev()
            .take(limit as usize)
            .map(|(game_id, game)| {
                DetailedGameHistory {
                    game_id,
                    player: game.player.to_text(),
                    bet_icp: (game.bet_amount as f64 / E8S_PER_ICP as f64),
                    won_icp: if game.is_win { (game.payout as f64 / E8S_PER_ICP as f64) } else { 0.0 },
                    target_number: game.target_number,
                    direction: match game.direction {
                        RollDirection::Over => "Over".to_string(),
                        RollDirection::Under => "Under".to_string(),
                    },
                    rolled_number: game.rolled_number,
                    win_chance: game.win_chance * 100.0,  // Convert to percentage
                    multiplier: game.multiplier,
                    is_win: game.is_win,
                    timestamp: game.timestamp,
                    // For debugging/analysis
                    profit_loss: if game.is_win {
                        (game.payout as i64 - game.bet_amount as i64)
                    } else {
                        -(game.bet_amount as i64)
                    },
                    expected_value: (game.win_chance * game.payout as f64) - game.bet_amount as f64,
                    house_edge_actual: if game.is_win {
                        -(1.0 - (game.bet_amount as f64 / game.payout as f64))
                    } else {
                        1.0
                    },
                }
            })
            .collect()
    })
}

// PSEUDOCODE - New struct for detailed history
#[derive(CandidType, Deserialize, Serialize)]
pub struct DetailedGameHistory {
    pub game_id: u64,
    pub player: String,
    pub bet_icp: f64,
    pub won_icp: f64,
    pub target_number: u8,
    pub direction: String,
    pub rolled_number: u8,
    pub win_chance: f64,
    pub multiplier: f64,
    pub is_win: bool,
    pub timestamp: u64,
    pub profit_loss: i64,  // e8s
    pub expected_value: f64,  // e8s
    pub house_edge_actual: f64,  // percentage
}
```

#### Add export method for CSV-like data (After new detailed history method)
```rust
// PSEUDOCODE - Export method for easy copy/paste analysis
#[query]
fn export_history_csv(limit: u32) -> String {
    let history = get_detailed_history(limit);

    let mut csv = String::from("game_id,player,bet_icp,won_icp,target,direction,rolled,win_chance_%,multiplier,is_win,profit_loss_e8s,timestamp\n");

    for game in history {
        csv.push_str(&format!(
            "{},{},{:.4},{:.4},{},{},{},{:.2},{:.2},{},{},{}\n",
            game.game_id,
            game.player,
            game.bet_icp,
            game.won_icp,
            game.target_number,
            game.direction,
            game.rolled_number,
            game.win_chance,
            game.multiplier,
            game.is_win,
            game.profit_loss,
            game.timestamp
        ));
    }

    csv
}
```

#### IMPORTANT: Reinstall Canister to Clear Old Data
Since we're adding the game_id field to DiceResult, we need to reinstall the canister:
```bash
# PSEUDOCODE - In deploy script or manually
dfx canister --network ic uninstall-code dice_backend
dfx deploy --network ic dice_backend --reinstall
```

### Frontend: `openhouse_frontend/src/pages/Dice.tsx` (MODIFY)

#### Update imports and interfaces (Lines 1-32)
```typescript
// PSEUDOCODE - Add new interface for detailed history
interface DetailedGameHistory {
  game_id: bigint;
  player: string;
  bet_icp: number;
  won_icp: number;
  target_number: number;
  direction: string;
  rolled_number: number;
  win_chance: number;
  multiplier: number;
  is_win: boolean;
  timestamp: bigint;
  profit_loss: bigint;
  expected_value: number;
  house_edge_actual: number;
}
```

#### Add state for detailed history (After line 52)
```typescript
// PSEUDOCODE
const [detailedHistory, setDetailedHistory] = useState<DetailedGameHistory[]>([]);
const [showDetailedView, setShowDetailedView] = useState(false);
const [csvExport, setCsvExport] = useState<string>('');
```

#### Load detailed history (Modify useEffect at lines 97-119)
```typescript
// PSEUDOCODE - Load both regular and detailed history
useEffect(() => {
  const loadHistory = async () => {
    if (!actor) return;

    try {
      // Load regular history for animation
      const games = await actor.get_recent_games(10);
      // Process games...

      // Load detailed history for display
      const detailed = await actor.get_detailed_history(20);
      setDetailedHistory(detailed);

      // Get CSV export
      const csv = await actor.export_history_csv(100);
      setCsvExport(csv);
    } catch (err) {
      console.error('Failed to load game history:', err);
    }
  };

  loadHistory();
}, [actor]);
```

#### Update after game completes (Modify lines 173-179)
```typescript
// PSEUDOCODE - Refresh detailed history after each game
if ('Ok' in result) {
  setAnimatingResult(result.Ok.rolled_number);
  gameState.addToHistory(result.Ok);

  // Refresh detailed history
  const detailed = await actor.get_detailed_history(20);
  setDetailedHistory(detailed);

  // Refresh CSV export
  const csv = await actor.export_history_csv(100);
  setCsvExport(csv);

  await refreshBalance();
}
```

#### Replace history display (Lines 294-300)
```typescript
// PSEUDOCODE - Enhanced history with toggle and copy functionality
{/* Game History Section */}
<div className="card max-w-4xl mx-auto">
  <div className="flex justify-between items-center mb-4">
    <h3 className="text-xl font-bold">Game History</h3>
    <div className="flex gap-2">
      <button
        className="btn btn-sm"
        onClick={() => setShowDetailedView(!showDetailedView)}
      >
        {showDetailedView ? 'Simple' : 'Detailed'} View
      </button>
      <button
        className="btn btn-sm"
        onClick={() => {
          navigator.clipboard.writeText(csvExport);
          alert('History copied to clipboard!');
        }}
      >
        Copy CSV
      </button>
    </div>
  </div>

  {showDetailedView ? (
    // Detailed table view
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>ID</th>
            <th>Bet (ICP)</th>
            <th>Target</th>
            <th>Dir</th>
            <th>Roll</th>
            <th>Chance</th>
            <th>Multi</th>
            <th>Won (ICP)</th>
            <th>P/L</th>
          </tr>
        </thead>
        <tbody>
          {detailedHistory.slice(0, 10).map((game) => (
            <tr key={game.game_id} className={game.is_win ? 'text-green-400' : 'text-red-400'}>
              <td>{game.game_id}</td>
              <td>{game.bet_icp.toFixed(4)}</td>
              <td>{game.target_number}</td>
              <td>{game.direction}</td>
              <td>{game.rolled_number}</td>
              <td>{game.win_chance.toFixed(1)}%</td>
              <td>{game.multiplier.toFixed(2)}x</td>
              <td>{game.won_icp.toFixed(4)}</td>
              <td>{game.is_win ? '+' : '-'}{Math.abs(Number(game.profit_loss) / E8S_PER_ICP).toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Stats */}
      <div className="mt-4 p-4 bg-gray-800 rounded">
        <h4 className="font-bold mb-2">Session Statistics</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            Total Games: {detailedHistory.length}
          </div>
          <div>
            Win Rate: {((detailedHistory.filter(g => g.is_win).length / detailedHistory.length) * 100).toFixed(1)}%
          </div>
          <div>
            Total P/L: {detailedHistory.reduce((sum, g) => sum + Number(g.profit_loss), 0) / E8S_PER_ICP).toFixed(4)} ICP
          </div>
        </div>
      </div>
    </div>
  ) : (
    // Simple view (existing)
    <GameHistory<DiceGameResult>
      items={gameState.history}
      maxDisplay={5}
      title="Recent Rolls"
      renderCustom={renderHistoryItem}
    />
  )}

  {/* Copy-pasteable text area for analysis */}
  {showDetailedView && (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm text-gray-400">
        Raw Data for Analysis (Click to expand)
      </summary>
      <textarea
        className="w-full h-32 mt-2 p-2 bg-gray-900 text-xs font-mono"
        readOnly
        value={csvExport}
        onClick={(e) => e.currentTarget.select()}
      />
    </details>
  )}
</div>
```

### Frontend: Update dice actor interface (Create new file)
`openhouse_frontend/src/declarations/dice_backend/dice_backend.did.d.ts` (UPDATE)
```typescript
// PSEUDOCODE - Add new type declarations
export interface DetailedGameHistory {
  game_id: bigint;
  player: string;
  bet_icp: number;
  won_icp: number;
  target_number: number;
  direction: string;
  rolled_number: number;
  win_chance: number;
  multiplier: number;
  is_win: boolean;
  timestamp: bigint;
  profit_loss: bigint;
  expected_value: number;
  house_edge_actual: number;
}

export interface _SERVICE {
  // Existing methods...
  get_detailed_history: (limit: number) => Promise<DetailedGameHistory[]>;
  export_history_csv: (limit: number) => Promise<string>;
}
```

## Deployment Notes

### Affected Canisters
- **dice_backend** (`whchi-hyaaa-aaaao-a4ruq-cai`) - REINSTALL REQUIRED
- **openhouse_frontend** (`pezw3-laaaa-aaaal-qssoa-cai`) - UPDATE REQUIRED

### Deployment Steps
1. Build dice backend with new structure
2. **REINSTALL** dice_backend canister (clears old data as requested)
3. Build and deploy frontend with enhanced UI
4. Verify on mainnet

### Testing Checklist
- [ ] Dice backend builds successfully
- [ ] Frontend builds without TypeScript errors
- [ ] Canister reinstalled (old data cleared)
- [ ] Detailed history loads correctly
- [ ] CSV export works
- [ ] Copy to clipboard functional
- [ ] Toggle between simple/detailed view works
- [ ] Game statistics calculate correctly
- [ ] New games appear in history immediately

## Benefits of This Implementation

1. **Complete Transparency**: Every bet shows exact ICP amounts in and out
2. **House Edge Analysis**: Can derive actual vs theoretical house edge
3. **Debugging Data**: All parameters visible for verification
4. **Export Capability**: CSV format for Excel/analysis tools
5. **Session Statistics**: Real-time P/L tracking
6. **Copyable Data**: Easy to share/analyze game results
7. **Persistent Storage**: Uses IC-Stable Structures for reliability

## Migration Strategy

Since we're reinstalling the canister:
1. No migration needed - fresh start as requested
2. All new games will have enhanced data
3. IC-Stable Structures ensures persistence across upgrades

---

**Implementation complete. The implementing agent should follow this plan exactly to add detailed debugging data to the dice game history.**