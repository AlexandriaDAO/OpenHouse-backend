# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-mines-betting"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-mines-betting`
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
   dfx canister --network ic status mines_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(mines): add ICP betting with 1% house edge"
   git push -u origin feature/mines-icp-betting
   gh pr create --title "Feature: Add ICP betting to Mines game" --body "Implements MINES_ICP_BETTING_PLAN.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Affected canisters: mines_backend (wvrcw-3aaaa-aaaah-arm4a-cai)"
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

**Branch:** `feature/mines-icp-betting`
**Worktree:** `/home/theseus/alexandria/openhouse-mines-betting`

---

# Implementation Plan

## Current State Documentation

### Existing Mines Backend
- **File**: `mines_backend/src/lib.rs` (630 lines)
- **Current Features**:
  - 5×5 grid (25 tiles)
  - Variable mines (1-24)
  - 3% house edge (0.97 multiplier)
  - No betting/ICP integration
  - Stable storage with BTreeMap
  - Rate limiting (5 games per player)

### Current API
```rust
// mines_backend/mines_backend.did
start_game: (nat8) -> (variant { Ok: nat64; Err: text });
reveal_tile: (nat64, nat8) -> (variant { Ok: RevealResult; Err: text });
cash_out: (nat64) -> (variant { Ok: float64; Err: text });
```

### Missing Features
1. No ICP transfer on bet placement
2. No ICP payout on cash_out
3. No bankroll management
4. No bet amount tracking

## Implementation Changes

### Backend: `mines_backend/src/lib.rs` (MODIFY)

#### 1. Update Constants (lines 13-17)
```rust
// PSEUDOCODE - Replace existing constants
const GRID_SIZE: usize = 25; // 5x5
const FIXED_MINES: u8 = 5;    // Fixed 5 mines
const HOUSE_EDGE: f64 = 0.99; // 1% house edge (was 0.97)
const MIN_BET: u64 = 10_000_000;  // 0.1 ICP
const MAX_BET: u64 = 100_000_000; // 1 ICP
const MAX_WIN: u64 = 1_000_000_000; // 10 ICP
const MIN_TILES_FOR_CASHOUT: usize = 1;
const MAX_MULTIPLIER: f64 = 10.0; // Cap at 10x
```

#### 2. Add ICP Transfer Types
```rust
// PSEUDOCODE - Add after line 10
use ic_ledger_types::{
    AccountIdentifier, Tokens, DEFAULT_FEE,
    MAINNET_LEDGER_CANISTER_ID, transfer
};
use ic_cdk::api::call::CallResult;

// Add to Cargo.toml dependencies:
// ic-ledger-types = "0.9"
```

#### 3. Update MinesGame Struct (lines 20-28)
```rust
// PSEUDOCODE - Replace MinesGame struct
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MinesGame {
    pub player: Principal,
    pub bet_amount: u64,      // NEW: Track bet amount
    pub mines: [bool; GRID_SIZE],
    pub revealed: [bool; GRID_SIZE],
    pub num_mines: u8,         // Always 5 now
    pub is_active: bool,
    pub timestamp: u64,
    pub payout_sent: bool,     // NEW: Track if payout sent
}
```

#### 4. Update Multiplier Calculation (lines 31-48)
```rust
// PSEUDOCODE - Replace calculate_multiplier method
fn calculate_multiplier(&self) -> f64 {
    let revealed_count = self.revealed.iter().filter(|&&r| r).count();
    if revealed_count == 0 {
        return 1.0;
    }

    let safe_tiles = (GRID_SIZE - FIXED_MINES as usize) as f64;
    let mut multiplier = 1.0;

    for i in 0..revealed_count {
        let remaining_safe = safe_tiles - i as f64;
        let remaining_total = (GRID_SIZE - i) as f64;
        multiplier *= remaining_total / remaining_safe;
    }

    // Apply 1% house edge and cap at 10x
    let final_multiplier = multiplier * HOUSE_EDGE;
    if final_multiplier > MAX_MULTIPLIER {
        MAX_MULTIPLIER
    } else {
        final_multiplier
    }
}
```

#### 5. Add Bankroll Management
```rust
// PSEUDOCODE - Add after GameStats (line 103)
#[derive(CandidType, Deserialize, Serialize, Clone, Default)]
pub struct Bankroll {
    pub total_wagered: u64,
    pub total_paid_out: u64,
    pub house_profit: i64,  // Can be negative
    pub balance: u64,        // Canister ICP balance
}

// Add to thread_local storage (after line 198)
static BANKROLL: RefCell<StableCell<Bankroll, Memory>> = RefCell::new(
    StableCell::init(
        MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(3))),
        Bankroll::default()
    ).expect("Failed to initialize BANKROLL")
);
```

#### 6. Update start_game Function (lines 265-321)
```rust
// PSEUDOCODE - Replace start_game function
#[update]
async fn start_game(bet_amount: u64) -> Result<u64, String> {
    // Validate bet amount
    if bet_amount < MIN_BET {
        return Err(format!("Minimum bet is {} ICP", MIN_BET as f64 / 100_000_000.0));
    }
    if bet_amount > MAX_BET {
        return Err(format!("Maximum bet is {} ICP", MAX_BET as f64 / 100_000_000.0));
    }

    let caller = ic_cdk::caller();

    // Check active games (rate limiting)
    let active_games = GAMES.with(|games| {
        games.borrow().iter()
            .filter(|(_, game)| game.player == caller && game.is_active)
            .count()
    });

    if active_games >= MAX_ACTIVE_GAMES_PER_PLAYER {
        return Err("Too many active games".to_string());
    }

    // Check bankroll can cover max payout
    let max_payout = (bet_amount as f64 * MAX_MULTIPLIER) as u64;
    let canister_balance = ic_cdk::api::canister_balance();

    if canister_balance < max_payout {
        return Err("Insufficient house bankroll".to_string());
    }

    // Transfer ICP from player to canister
    let transfer_result = transfer_from_player(caller, bet_amount).await?;

    // Generate mines (fixed 5 mines)
    let mines = generate_mines(FIXED_MINES).await?;

    let game = MinesGame {
        player: caller,
        bet_amount,
        mines,
        revealed: [false; GRID_SIZE],
        num_mines: FIXED_MINES,
        is_active: true,
        timestamp: ic_cdk::api::time(),
        payout_sent: false,
    };

    // Save game and update stats
    let game_id = NEXT_ID.with(|id| {
        let mut id_cell = id.borrow_mut();
        let current = id_cell.get().clone();
        id_cell.set(GameId(current.0 + 1)).expect("Failed to increment");
        current.0
    });

    GAMES.with(|games| games.borrow_mut().insert(game_id, game));

    // Update bankroll
    BANKROLL.with(|bankroll| {
        let mut br = bankroll.borrow_mut();
        let mut current = br.get().clone();
        current.total_wagered += bet_amount;
        current.balance += bet_amount;
        br.set(current).expect("Failed to update bankroll");
    });

    STATS.with(|stats| {
        let mut stats_cell = stats.borrow_mut();
        let mut current = stats_cell.get().clone();
        current.total_games += 1;
        stats_cell.set(current).expect("Failed to update stats");
    });

    Ok(game_id)
}
```

#### 7. Add ICP Transfer Functions
```rust
// PSEUDOCODE - Add after generate_mines function (line 247)
async fn transfer_from_player(player: Principal, amount: u64) -> Result<(), String> {
    // Get player's default subaccount
    let player_account = AccountIdentifier::new(&player, &DEFAULT_SUBACCOUNT);

    // Get canister's account
    let canister_id = ic_cdk::id();
    let canister_account = AccountIdentifier::new(&canister_id, &DEFAULT_SUBACCOUNT);

    // Call ledger to transfer
    let transfer_args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(amount),
        fee: Tokens::from_e8s(DEFAULT_FEE.e8s()),
        from_subaccount: None,
        to: canister_account,
        created_at_time: None,
    };

    match transfer(MAINNET_LEDGER_CANISTER_ID, transfer_args).await {
        Ok(Ok(block_index)) => Ok(()),
        Ok(Err(err)) => Err(format!("Transfer failed: {:?}", err)),
        Err(err) => Err(format!("Transfer call failed: {:?}", err)),
    }
}

async fn transfer_to_player(player: Principal, amount: u64) -> Result<(), String> {
    let player_account = AccountIdentifier::new(&player, &DEFAULT_SUBACCOUNT);

    let transfer_args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(amount - DEFAULT_FEE.e8s()), // Deduct fee
        fee: Tokens::from_e8s(DEFAULT_FEE.e8s()),
        from_subaccount: None,
        to: player_account,
        created_at_time: None,
    };

    match transfer(MAINNET_LEDGER_CANISTER_ID, transfer_args).await {
        Ok(Ok(block_index)) => Ok(()),
        Ok(Err(err)) => Err(format!("Payout failed: {:?}", err)),
        Err(err) => Err(format!("Payout call failed: {:?}", err)),
    }
}
```

#### 8. Update cash_out Function (lines 354-378)
```rust
// PSEUDOCODE - Replace cash_out function
#[update]
async fn cash_out(game_id: u64) -> Result<u64, String> {
    let (player, bet_amount, multiplier) = GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let mut game = games.get(&game_id).ok_or("Game not found")?;

        if game.player != ic_cdk::caller() {
            return Err("Not your game".to_string());
        }

        if game.payout_sent {
            return Err("Payout already sent".to_string());
        }

        let revealed_count = game.revealed.iter().filter(|&&r| r).count();
        if revealed_count < MIN_TILES_FOR_CASHOUT {
            return Err("Must reveal at least 1 tile".to_string());
        }

        let multiplier = game.calculate_multiplier();
        game.is_active = false;
        game.payout_sent = true;

        let player = game.player;
        let bet_amount = game.bet_amount;

        games.insert(game_id, game);
        Ok((player, bet_amount, multiplier))
    })?;

    // Calculate payout
    let payout = (bet_amount as f64 * multiplier) as u64;
    let capped_payout = if payout > MAX_WIN { MAX_WIN } else { payout };

    // Send ICP to player
    if capped_payout > DEFAULT_FEE.e8s() {
        transfer_to_player(player, capped_payout).await?;
    }

    // Update stats and bankroll
    STATS.with(|stats| {
        let mut stats_cell = stats.borrow_mut();
        let mut current = stats_cell.get().clone();
        current.total_completed += 1;
        stats_cell.set(current).expect("Failed to update stats");
    });

    BANKROLL.with(|bankroll| {
        let mut br = bankroll.borrow_mut();
        let mut current = br.get().clone();
        current.total_paid_out += capped_payout;
        current.balance = current.balance.saturating_sub(capped_payout);
        current.house_profit = (current.total_wagered as i64) - (current.total_paid_out as i64);
        br.set(current).expect("Failed to update bankroll");
    });

    Ok(capped_payout)
}
```

#### 9. Update reveal_tile to Handle Busts (lines 324-351)
```rust
// PSEUDOCODE - Update reveal_tile function
#[update]
async fn reveal_tile(game_id: u64, position: u8) -> Result<RevealResult, String> {
    let (busted, player, bet_amount) = GAMES.with(|games| {
        let mut games = games.borrow_mut();
        let mut game = games.get(&game_id).ok_or("Game not found")?;

        if game.player != ic_cdk::caller() {
            return Err("Not your game".to_string());
        }

        let (busted, multiplier) = game.reveal_tile(position)?;

        let player = game.player;
        let bet_amount = game.bet_amount;

        games.insert(game_id, game);
        Ok((busted, player, bet_amount))
    })?;

    if busted {
        // Update stats for bust
        STATS.with(|stats| {
            let mut stats_cell = stats.borrow_mut();
            let mut current = stats_cell.get().clone();
            current.total_busted += 1;
            stats_cell.set(current).expect("Failed to update stats");
        });

        // Update bankroll (house keeps the bet)
        BANKROLL.with(|bankroll| {
            let mut br = bankroll.borrow_mut();
            let mut current = br.get().clone();
            current.house_profit += bet_amount as i64;
            br.set(current).expect("Failed to update bankroll");
        });

        Ok(RevealResult { busted: true, multiplier: 0.0 })
    } else {
        let multiplier = GAMES.with(|games| {
            games.borrow().get(&game_id).unwrap().calculate_multiplier()
        });

        Ok(RevealResult { busted: false, multiplier })
    }
}
```

#### 10. Add Query Functions
```rust
// PSEUDOCODE - Add after get_stats (line 401)
#[query]
fn get_bankroll() -> Bankroll {
    BANKROLL.with(|br| br.borrow().get().clone())
}

#[update]
async fn deposit_to_bankroll(amount: u64) -> Result<(), String> {
    // Admin only - seed the bankroll
    if ic_cdk::caller() != Principal::from_text("YOUR_ADMIN_PRINCIPAL").unwrap() {
        return Err("Unauthorized".to_string());
    }

    transfer_from_player(ic_cdk::caller(), amount).await?;

    BANKROLL.with(|bankroll| {
        let mut br = bankroll.borrow_mut();
        let mut current = br.get().clone();
        current.balance += amount;
        br.set(current).expect("Failed to update bankroll");
    });

    Ok(())
}
```

### Backend: `mines_backend/Cargo.toml` (MODIFY)
```toml
# PSEUDOCODE - Add to dependencies
[dependencies]
# ... existing dependencies ...
ic-ledger-types = "0.9"
```

### Backend: `mines_backend/mines_backend.did` (MODIFY)
```candid
// PSEUDOCODE - Update interface
service : {
  // Updated: now takes bet_amount instead of num_mines
  start_game: (nat64) -> (variant { Ok: nat64; Err: text });

  // Unchanged
  reveal_tile: (nat64, nat8) -> (variant { Ok: RevealResult; Err: text });

  // Updated: now returns actual ICP payout amount
  cash_out: (nat64) -> (variant { Ok: nat64; Err: text });

  // New: bankroll management
  get_bankroll: () -> (Bankroll) query;
  deposit_to_bankroll: (nat64) -> (variant { Ok; Err: text });

  // ... rest unchanged ...
}
```

### Frontend: `openhouse_frontend/src/pages/Mines.tsx` (MODIFY)

```typescript
// PSEUDOCODE - Update to handle betting
import { transferICP } from '../utils/ledger';

// Update startGame to include bet amount
const startGame = async (betAmount: number) => {
    // Validate bet
    if (betAmount < 0.1 || betAmount > 1) {
        showError("Bet must be between 0.1 and 1 ICP");
        return;
    }

    // Convert to e8s
    const betE8s = BigInt(Math.floor(betAmount * 100_000_000));

    try {
        // Start game with bet
        const gameId = await minesActor.start_game(betE8s);
        setCurrentGameId(gameId);
        setGameActive(true);
        showSuccess(`Game started! Bet: ${betAmount} ICP`);
    } catch (error) {
        showError(`Failed to start game: ${error}`);
    }
};

// Update cashOut to show winnings
const cashOut = async () => {
    try {
        const payout = await minesActor.cash_out(currentGameId);
        const payoutICP = Number(payout) / 100_000_000;
        showSuccess(`You won ${payoutICP} ICP!`);
        setGameActive(false);
    } catch (error) {
        showError(`Cash out failed: ${error}`);
    }
};

// Add bet amount input
<div className="bet-controls">
    <input
        type="number"
        min="0.1"
        max="1"
        step="0.1"
        value={betAmount}
        onChange={(e) => setBetAmount(e.target.value)}
    />
    <button onClick={() => startGame(betAmount)}>
        Start Game ({betAmount} ICP)
    </button>
</div>

// Show current multiplier and potential payout
<div className="game-info">
    <div>Current Multiplier: {currentMultiplier}x</div>
    <div>Potential Win: {(betAmount * currentMultiplier).toFixed(2)} ICP</div>
    {currentMultiplier >= 10 && <div className="max-win">MAX WIN REACHED!</div>}
</div>
```

## Testing Requirements

**NONE REQUIRED** - This is experimental pre-production. Manual verification only.

Optional manual checks after deployment:
```bash
# Test game start with bet
dfx canister --network ic call wvrcw-3aaaa-aaaah-arm4a-cai start_game '(10000000 : nat64)'

# Get game state
dfx canister --network ic call wvrcw-3aaaa-aaaah-arm4a-cai get_game '(0 : nat64)'

# Check bankroll
dfx canister --network ic call wvrcw-3aaaa-aaaah-arm4a-cai get_bankroll
```

## Deployment Notes

**Affected Canisters:**
- `mines_backend` (wvrcw-3aaaa-aaaah-arm4a-cai) - Main changes
- `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai) - UI updates

**Pre-deployment:**
1. Seed bankroll with initial ICP (recommended: 20 ICP)
2. Test on one game before announcing

**Post-deployment:**
1. Monitor bankroll balance
2. Watch for any stuck games
3. Check payout calculations are correct

## Configuration Summary

- **Grid**: 5×5 (25 tiles)
- **Mines**: 5 (fixed)
- **House Edge**: 1% (0.99 multiplier)
- **Min Bet**: 0.1 ICP
- **Max Bet**: 1 ICP
- **Max Win**: 10 ICP
- **Max Multiplier**: 10x (reached at ~tile 9)

## Risk Analysis

1. **Bankroll Risk**: House needs sufficient ICP to cover max wins
2. **Smart Contract Risk**: All payouts are automatic and irreversible
3. **Randomness**: Uses IC VRF - provably fair but deterministic per block

---

**END OF PLAN**

The plan is ready with embedded PR orchestrator.

When done, return this prompt to the user: "Execute @/home/theseus/alexandria/openhouse-mines-betting/MINES_ICP_BETTING_PLAN.md"

The implementing agent MUST:
1. Read the orchestrator header (cannot skip - it's at the top)
2. Verify worktree isolation
3. Implement the plan
4. Deploy to mainnet (mandatory)
5. Create PR (mandatory step)
6. Iterate autonomously until approved