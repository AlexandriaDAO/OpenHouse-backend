# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-blackjack"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-blackjack`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build affected backend(s)
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend
   cd openhouse_frontend && npm run build && cd ..

   # Deploy to mainnet (deploys all canisters - simplest approach)
   ./deploy.sh
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status blackjack_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: replace mines_backend (Motoko plinko) with blackjack_backend (Rust)"
   git push -u origin feature/blackjack-backend
   gh pr create --title "feat: Add Blackjack game, remove Motoko plinko experiment" --body "$(cat <<'EOF'
## Summary
- Removes mines_backend (Motoko plinko experiment) completely
- Adds blackjack_backend as pure Rust canister using same canister ID
- Implements full blackjack game with 1% house edge
- Reuses defi_accounting pattern from dice_backend for deposits/withdrawals/LP

Implements PLAN_BLACKJACK.md

## Affected Canisters
- **Blackjack Backend** (was Mines): `wvrcw-3aaaa-aaaah-arm4a-cai`
- **Frontend**: `pezw3-laaaa-aaaal-qssoa-cai`

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io

🤖 Generated with [Claude Code](https://claude.com/claude-code)
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
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/blackjack-backend`
**Worktree:** `/home/theseus/alexandria/openhouse-blackjack`

---

# Implementation Plan: Blackjack Backend

## Task Classification
**REFACTORING + NEW FEATURE**: Delete Motoko experiment, build Rust blackjack game

## Current State

### Files to DELETE
```
mines_backend/
├── src/
│   └── main.mo              # Motoko plinko experiment (198 lines)
├── mines_backend.did        # Motoko candid interface
└── README.md               # Old README

mines_backend.did            # Root-level duplicate candid file
```

### Files to MODIFY
| File | Action | Description |
|------|--------|-------------|
| `dfx.json` | Modify | Change mines_backend from Motoko to Rust, rename to blackjack_backend |
| `canister_ids.json` | Modify | Rename mines_backend to blackjack_backend |
| `Cargo.toml` | Modify | Add blackjack_backend to workspace |
| `deploy.sh` | Modify | Replace mines references with blackjack |
| `CLAUDE.md` | Modify | Update game list and documentation |
| `README.md` | Modify | Update game list and project structure |
| `openhouse_frontend/src/pages/Home.tsx` | Modify | Replace Plinko V2 with Blackjack game card |
| `openhouse_frontend/src/hooks/actors/useMinesActor.ts` | Delete & Create | Rename to useBlackjackActor.ts |
| `openhouse_frontend/src/providers/GameBalanceProvider.tsx` | Modify | Replace mines with blackjack |
| `openhouse_frontend/src/providers/ActorProvider.tsx` | Modify | Replace mines with blackjack |
| `openhouse_frontend/src/types/balance.ts` | Modify | Replace 'mines' with 'blackjack' |
| `scripts/generateTree.cjs` | Modify | Update tree generation |
| `tree.md` | Modify | Update project tree |

### Files to CREATE
```
blackjack_backend/
├── Cargo.toml
├── blackjack_backend.did
└── src/
    ├── lib.rs                 # Main canister entry point
    ├── game.rs                # Blackjack game logic
    ├── types.rs               # Card, Hand, GameState types
    ├── seed.rs                # Provably fair shuffling (copy from dice)
    └── defi_accounting/       # Copy entire module from dice_backend
        ├── mod.rs
        ├── accounting.rs
        ├── liquidity_pool.rs
        ├── memory_ids.rs
        ├── query.rs
        ├── statistics/
        │   └── mod.rs
        └── types.rs

openhouse_frontend/src/hooks/actors/useBlackjackActor.ts
openhouse_frontend/src/pages/Blackjack.tsx
openhouse_frontend/src/components/game-specific/blackjack/
├── BlackjackTable.tsx
├── Card.tsx
├── Hand.tsx
└── index.ts
```

## Implementation Details

### 1. Delete Motoko Experiment
```bash
# PSEUDOCODE
rm -rf mines_backend/
rm mines_backend.did
```

### 2. Create blackjack_backend Directory Structure

#### `blackjack_backend/Cargo.toml`
```toml
# PSEUDOCODE
[package]
name = "blackjack_backend"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
candid = "0.10"
ic-cdk = "0.19"
ic-cdk-timers = "1.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
sha2 = "0.10"
ic-stable-structures = "0.7"
num-bigint = "0.4"
num-traits = "0.2"
```

#### `blackjack_backend/src/types.rs`
```rust
// PSEUDOCODE
use candid::{CandidType, Deserialize};
use serde::Serialize;

#[derive(CandidType, Deserialize, Serialize, Clone, Copy, PartialEq, Debug)]
pub enum Suit {
    Hearts,
    Diamonds,
    Clubs,
    Spades,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Copy, PartialEq, Debug)]
pub enum Rank {
    Ace,    // 1 or 11
    Two,    // 2
    Three,  // 3
    Four,   // 4
    Five,   // 5
    Six,    // 6
    Seven,  // 7
    Eight,  // 8
    Nine,   // 9
    Ten,    // 10
    Jack,   // 10
    Queen,  // 10
    King,   // 10
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Card {
    pub suit: Suit,
    pub rank: Rank,
}

impl Card {
    pub fn value(&self) -> u8 {
        // Return card value (Ace = 11, face cards = 10)
    }

    pub fn is_ace(&self) -> bool {
        // Return true if Ace
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Hand {
    pub cards: Vec<Card>,
}

impl Hand {
    pub fn value(&self) -> u8 {
        // Calculate hand value with soft/hard ace handling
        // Sum card values, reduce aces from 11 to 1 if over 21
    }

    pub fn is_blackjack(&self) -> bool {
        // True if exactly 2 cards totaling 21
    }

    pub fn is_bust(&self) -> bool {
        // True if value > 21
    }

    pub fn can_split(&self) -> bool {
        // True if exactly 2 cards of same rank
    }

    pub fn is_soft(&self) -> bool {
        // True if has ace counting as 11
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum GameAction {
    Hit,
    Stand,
    Double,
    Split,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum GameResult {
    PlayerWin,
    DealerWin,
    Push,         // Tie
    Blackjack,    // Player blackjack (3:2 payout)
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct BlackjackGame {
    pub game_id: u64,
    pub player: candid::Principal,
    pub bet_amount: u64,
    pub player_hands: Vec<Hand>,      // Multiple for splits
    pub dealer_hand: Hand,
    pub dealer_hidden_card: Option<Card>,  // Revealed on stand
    pub current_hand_index: u8,       // Which hand is active (for splits)
    pub is_active: bool,
    pub is_doubled: Vec<bool>,        // Per hand
    pub results: Vec<Option<GameResult>>,
    pub payout: u64,
    pub timestamp: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct GameStartResult {
    pub game_id: u64,
    pub player_hand: Hand,
    pub dealer_showing: Card,
    pub is_blackjack: bool,
    pub can_double: bool,
    pub can_split: bool,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct ActionResult {
    pub player_hand: Hand,
    pub dealer_hand: Option<Hand>,    // Revealed when round ends
    pub result: Option<GameResult>,
    pub payout: u64,
    pub can_hit: bool,
    pub can_double: bool,
    pub can_split: bool,
    pub game_over: bool,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct GameStats {
    pub total_games: u64,
    pub total_player_wins: u64,
    pub total_dealer_wins: u64,
    pub total_pushes: u64,
    pub total_blackjacks: u64,
}
```

#### `blackjack_backend/src/game.rs`
```rust
// PSEUDOCODE
use crate::types::*;
use crate::seed;
use crate::defi_accounting;
use candid::Principal;
use std::cell::RefCell;
use ic_stable_structures::{StableBTreeMap, Memory, DefaultMemoryImpl};
use ic_stable_structures::memory_manager::{MemoryId, VirtualMemory};

thread_local! {
    static GAMES: RefCell<StableBTreeMap<u64, BlackjackGame, Memory>> = ...;
    static NEXT_GAME_ID: RefCell<u64> = RefCell::new(1);
    static STATS: RefCell<GameStats> = RefCell::new(GameStats::default());
}

// House edge: 1%
// Standard blackjack rules:
// - Dealer stands on 17
// - Blackjack pays 3:2
// - Double on any first two cards
// - Split pairs once
// - No insurance (simplifies game)

const MIN_BET: u64 = 100_000; // 0.001 ICP (1M = 0.01 ICP)
const MAX_WIN: u64 = 1_000_000_000; // 10 ICP

pub async fn start_game(bet_amount: u64, client_seed: String, caller: Principal) -> Result<GameStartResult, String> {
    // PSEUDOCODE
    // 1. Validate bet amount >= MIN_BET
    // 2. Check player balance via defi_accounting::get_balance(caller)
    // 3. Check max payout via defi_accounting::get_max_allowed_payout()
    // 4. Deduct bet from player balance
    // 5. Generate shuffle using IC VRF + seed module
    // 6. Deal: player gets 2 cards, dealer gets 2 (one hidden)
    // 7. Check for player blackjack (instant 3:2 payout)
    // 8. Store game state
    // 9. Return initial state
}

pub async fn hit(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    // PSEUDOCODE
    // 1. Verify game exists and belongs to caller
    // 2. Verify game is active
    // 3. Draw card from deck
    // 4. Add to player's current hand
    // 5. If bust, resolve hand (loss)
    // 6. If 21, auto-stand
    // 7. Return updated state
}

pub async fn stand(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    // PSEUDOCODE
    // 1. Verify game exists and belongs to caller
    // 2. If more hands to play (splits), move to next hand
    // 3. If all hands done, play dealer's hand:
    //    - Reveal hidden card
    //    - Dealer hits until 17+
    // 4. Determine outcomes for all hands
    // 5. Calculate payouts:
    //    - Win: bet * 2 (1:1)
    //    - Blackjack: bet * 2.5 (3:2)
    //    - Push: bet returned
    //    - Loss: 0
    // 6. Credit winnings via defi_accounting::update_balance()
    // 7. Update stats
    // 8. Mark game complete
}

pub async fn double_down(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    // PSEUDOCODE
    // 1. Verify game is active, first two cards only
    // 2. Verify player has balance for doubled bet
    // 3. Deduct additional bet
    // 4. Draw exactly one card
    // 5. Auto-stand
    // 6. Play dealer's hand
    // 7. Resolve with doubled stakes
}

pub async fn split(game_id: u64, caller: Principal) -> Result<ActionResult, String> {
    // PSEUDOCODE
    // 1. Verify first two cards are same rank
    // 2. Verify player has balance for second bet
    // 3. Deduct additional bet
    // 4. Split into two hands
    // 5. Draw one card for each hand
    // 6. Continue play on first hand
}

fn deal_card(game: &mut BlackjackGame) -> Card {
    // PSEUDOCODE
    // Use seed to deterministically draw next card from shuffled deck
}

fn play_dealer_hand(game: &mut BlackjackGame) {
    // PSEUDOCODE
    // Dealer hits until 17 or higher
    // Dealer stands on soft 17
}

fn calculate_payout(bet: u64, result: &GameResult, is_doubled: bool) -> u64 {
    // PSEUDOCODE
    let multiplier = match result {
        GameResult::PlayerWin => 2.0,
        GameResult::Blackjack => 2.5,  // 3:2 payout
        GameResult::Push => 1.0,       // Return bet
        GameResult::DealerWin => 0.0,
    };

    let stake = if is_doubled { bet * 2 } else { bet };
    (stake as f64 * multiplier) as u64
}

// House edge calculation:
// Standard blackjack with these rules has ~0.5% house edge
// We achieve 1% by slightly reducing blackjack payout
// Blackjack pays 3:2 (1.5x profit) = 2.5x return
// With our simplified rules, house edge is ~1%

pub fn get_game(game_id: u64) -> Option<BlackjackGame> {
    // Query game by ID
}

pub fn get_stats() -> GameStats {
    // Return game statistics
}
```

#### `blackjack_backend/src/seed.rs`
```rust
// PSEUDOCODE - Copy from dice_backend/src/seed.rs
// Same provably fair system:
// - Server seed (hidden, hashed)
// - Client seed (player provided)
// - Nonce (incrementing)
// - Combined hash determines shuffle order

pub async fn generate_server_seed() {
    // Use IC VRF: ic_cdk::api::management_canister::main::raw_rand()
}

pub fn get_current_seed_hash() -> String {
    // Return hash of current server seed
}

pub fn verify_game_result(...) -> Result<bool, String> {
    // Allow verification after game reveal
}
```

#### `blackjack_backend/src/lib.rs`
```rust
// PSEUDOCODE
use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};

mod defi_accounting;
pub mod types;
pub mod seed;
pub mod game;

pub use types::{Card, Hand, GameResult, GameAction, GameStartResult, ActionResult, GameStats};

#[init]
fn init() {
    ic_cdk::println!("Blackjack Backend Initialized");
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::start_stats_timer();
}

#[pre_upgrade]
fn pre_upgrade() {
    // StableBTreeMap persists automatically
}

#[post_upgrade]
fn post_upgrade() {
    seed::restore_seed_state();
    defi_accounting::accounting::start_parent_withdrawal_timer();
    defi_accounting::start_stats_timer();
}

// === GAME ENDPOINTS ===

#[update]
async fn start_game(bet_amount: u64, client_seed: String) -> Result<GameStartResult, String> {
    game::start_game(bet_amount, client_seed, ic_cdk::api::msg_caller()).await
}

#[update]
async fn hit(game_id: u64) -> Result<ActionResult, String> {
    game::hit(game_id, ic_cdk::api::msg_caller()).await
}

#[update]
async fn stand(game_id: u64) -> Result<ActionResult, String> {
    game::stand(game_id, ic_cdk::api::msg_caller()).await
}

#[update]
async fn double_down(game_id: u64) -> Result<ActionResult, String> {
    game::double_down(game_id, ic_cdk::api::msg_caller()).await
}

#[update]
async fn split(game_id: u64) -> Result<ActionResult, String> {
    game::split(game_id, ic_cdk::api::msg_caller()).await
}

#[query]
fn get_game(game_id: u64) -> Option<types::BlackjackGame> {
    game::get_game(game_id)
}

#[query]
fn get_stats() -> GameStats {
    game::get_stats()
}

// === PROVABLY FAIR ===

#[query]
fn get_current_seed_hash() -> String {
    seed::get_current_seed_hash()
}

#[query]
fn get_seed_info() -> (String, u64, u64) {
    seed::get_seed_info()
}

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Blackjack, {}! Hit or Stand?", name)
}

// === ACCOUNTING ENDPOINTS ===
// (Same pattern as dice_backend)

#[update]
async fn deposit(amount: u64) -> Result<u64, String> {
    defi_accounting::accounting::deposit(amount).await
}

#[update]
async fn withdraw_all() -> Result<u64, String> {
    defi_accounting::accounting::withdraw_all().await
}

// ... all other accounting endpoints from dice_backend
```

#### `blackjack_backend/blackjack_backend.did`
```candid
// PSEUDOCODE
type Suit = variant { Hearts; Diamonds; Clubs; Spades };
type Rank = variant { Ace; Two; Three; Four; Five; Six; Seven; Eight; Nine; Ten; Jack; Queen; King };

type Card = record {
  suit: Suit;
  rank: Rank;
};

type Hand = record {
  cards: vec Card;
};

type GameResult = variant {
  PlayerWin;
  DealerWin;
  Push;
  Blackjack;
};

type GameStartResult = record {
  game_id: nat64;
  player_hand: Hand;
  dealer_showing: Card;
  is_blackjack: bool;
  can_double: bool;
  can_split: bool;
};

type ActionResult = record {
  player_hand: Hand;
  dealer_hand: opt Hand;
  result: opt GameResult;
  payout: nat64;
  can_hit: bool;
  can_double: bool;
  can_split: bool;
  game_over: bool;
};

type GameStats = record {
  total_games: nat64;
  total_player_wins: nat64;
  total_dealer_wins: nat64;
  total_pushes: nat64;
  total_blackjacks: nat64;
};

// Include all defi_accounting types from dice_backend.did

service : {
  // Game methods
  start_game: (nat64, text) -> (variant { Ok: GameStartResult; Err: text });
  hit: (nat64) -> (variant { Ok: ActionResult; Err: text });
  stand: (nat64) -> (variant { Ok: ActionResult; Err: text });
  double_down: (nat64) -> (variant { Ok: ActionResult; Err: text });
  split: (nat64) -> (variant { Ok: ActionResult; Err: text });

  // Query methods
  get_game: (nat64) -> (opt BlackjackGame) query;
  get_stats: () -> (GameStats) query;

  // Provably fair
  get_current_seed_hash: () -> (text) query;
  get_seed_info: () -> (text, nat64, nat64) query;

  greet: (text) -> (text) query;

  // All accounting endpoints from dice_backend.did
  deposit: (nat64) -> (variant { Ok: nat64; Err: text });
  withdraw_all: () -> (variant { Ok: nat64; Err: text });
  // ... etc
}
```

### 3. Update Configuration Files

#### `dfx.json`
```json
// PSEUDOCODE - Replace mines_backend with:
"blackjack_backend": {
  "type": "rust",
  "package": "blackjack_backend",
  "candid": "blackjack_backend/blackjack_backend.did",
  "specified_id": "wvrcw-3aaaa-aaaah-arm4a-cai"
}

// Update frontend dependencies:
"dependencies": ["crash_backend", "plinko_backend", "blackjack_backend", "dice_backend"]
```

#### `canister_ids.json`
```json
// PSEUDOCODE - Rename mines_backend to blackjack_backend:
"blackjack_backend": {
  "ic": "wvrcw-3aaaa-aaaah-arm4a-cai"
}
```

#### `Cargo.toml`
```toml
// PSEUDOCODE
[workspace]
members = [
    "crash_backend",
    "plinko_backend",
    "blackjack_backend",
    "dice_backend",
]
```

#### `deploy.sh`
```bash
# PSEUDOCODE
# Replace all "mines" with "blackjack"
# Update deploy_mines() to deploy_blackjack()
# Change --mines-only to --blackjack-only
# Update help text
```

### 4. Update Frontend

#### `openhouse_frontend/src/hooks/actors/useBlackjackActor.ts`
```typescript
// PSEUDOCODE
import { createActorHook } from 'ic-use-actor';
import { _SERVICE } from '@declarations/blackjack_backend/blackjack_backend.did';
import { idlFactory } from '@declarations/blackjack_backend/blackjack_backend.did.js';

const canisterId = 'wvrcw-3aaaa-aaaah-arm4a-cai';

const useBlackjackActor = createActorHook<_SERVICE>({
  canisterId,
  idlFactory,
});

export default useBlackjackActor;
```

#### `openhouse_frontend/src/pages/Home.tsx`
```typescript
// PSEUDOCODE - Replace plinko-v2 entry:
{
  id: 'blackjack',
  name: 'Blackjack',
  description: 'Beat the dealer! Hit or Stand to reach 21',
  minBet: 0.01,
  maxWin: 10,
  houseEdge: 1,
  path: '/blackjack',
  icon: '🃏',
}
```

#### `openhouse_frontend/src/pages/Blackjack.tsx`
```typescript
// PSEUDOCODE
import React, { useState } from 'react';
import { useBlackjackActor } from '../hooks/actors';
import { BlackjackTable } from '../components/game-specific/blackjack';

export const Blackjack: React.FC = () => {
  // State: game, player hand, dealer hand, bet amount
  // Actions: start_game, hit, stand, double, split
  // Display: cards, actions, balance, results

  return (
    <div className="blackjack-container">
      <h1>Blackjack</h1>
      {/* Bet controls */}
      {/* Card table */}
      {/* Action buttons */}
      {/* Game result */}
    </div>
  );
};
```

#### Update Providers
```typescript
// PSEUDOCODE - In GameBalanceProvider.tsx and ActorProvider.tsx:
// Replace all 'mines' references with 'blackjack'
// Replace useMinesActor with useBlackjackActor
```

### 5. Update Documentation

#### `CLAUDE.md` and `README.md`
```markdown
// PSEUDOCODE - Update game list:
### 4. Blackjack
- **Mechanics**: Classic blackjack against the dealer
- **Objective**: Get closer to 21 than dealer without busting
- **Actions**: Hit, Stand, Double Down, Split
- **Min Bet**: 0.01 ICP
- **Max Win**: 10 ICP
- **House Edge**: 1%
- **Blackjack Payout**: 3:2
- **Canister**: `blackjack_backend`
```

## Deployment Notes

### Affected Canisters
| Canister | ID | Change |
|----------|-----|--------|
| Blackjack Backend | `wvrcw-3aaaa-aaaah-arm4a-cai` | REPLACE (was Mines/Motoko Plinko) |
| Frontend | `pezw3-laaaa-aaaal-qssoa-cai` | UPDATE |

### Deployment Order
1. Build blackjack_backend
2. Deploy blackjack_backend (will overwrite mines_backend on same canister ID)
3. Build and deploy frontend

### Verification Steps
```bash
# Test greet function
dfx canister --network ic call blackjack_backend greet '("Player")'

# Check stats
dfx canister --network ic call blackjack_backend get_stats

# Verify frontend
curl -s https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/blackjack
```

## Risk Mitigation

### Canister State
- The mines_backend (Motoko) has no real user data - it was an experiment
- Deploying Rust canister to same ID will wipe Motoko state (acceptable)
- New blackjack_backend starts fresh

### Testing on Mainnet
- No local environment exists
- All testing happens directly on mainnet
- Start with small bets to verify functionality

## Checklist

- [ ] Worktree created at `/home/theseus/alexandria/openhouse-blackjack`
- [ ] Orchestrator header embedded at top of plan
- [ ] mines_backend deleted
- [ ] blackjack_backend created with all files
- [ ] dfx.json updated
- [ ] canister_ids.json updated
- [ ] Cargo.toml updated
- [ ] deploy.sh updated
- [ ] Frontend components created
- [ ] Documentation updated
- [ ] Built and deployed to mainnet
- [ ] PR created
