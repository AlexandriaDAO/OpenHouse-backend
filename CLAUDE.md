# OpenHouse Casino - Claude Deployment Guide

## 🎰 CRITICAL: Mainnet-Only Multi-Game Casino

**⚠️ IMPORTANT: There is no local testing environment. ALL testing happens on mainnet.**

OpenHouse is an open-source, transparent odds casino platform on the Internet Computer. Every change you make goes directly to production canisters.

## 🎯 Project Philosophy

**"Open House"** - A play on words:
- We're **the house** (casino)
- Everything is **open-source** with transparent odds
- All games are **provably fair** using IC's VRF

## 🚀 Quick Start

```bash
# Deploy everything to mainnet
./deploy.sh

# Deploy specific game backend
./deploy.sh --crash-only
./deploy.sh --plinko-only
./deploy.sh --blackjack-only
./deploy.sh --dice-only

# Deploy frontend only
./deploy.sh --frontend-only

# Deploy with tests
./deploy.sh --test
```

## 📦 Canister Architecture

| Component | Canister ID | Purpose | URL |
|-----------|-------------|---------|-----|
| **Crash Backend** | `fws6k-tyaaa-aaaap-qqc7q-cai` | Crash game logic | - |
| **Plinko Backend** | `weupr-2qaaa-aaaap-abl3q-cai` | Plinko game logic | - |
| **Blackjack Backend** | `wvrcw-3aaaa-aaaah-arm4a-cai` | Blackjack game logic | - |
| **Dice Backend** | `whchi-hyaaa-aaaao-a4ruq-cai` | Dice game logic | - |
| **OpenHouse Frontend** | `pezw3-laaaa-aaaal-qssoa-cai` | Multi-game router UI | https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io |

### Frontend Routes
- `/` - Game selection homepage
- `/crash` - Crash game interface
- `/plinko` - Plinko game interface
- `/blackjack` - Blackjack game interface
- `/dice` - Dice game interface

## 🎮 Games Overview

### 1. Crash Game
- **Mechanics**: Multiplier increases from 1.00x until it crashes
- **Objective**: Cash out before the crash
- **Min Bet**: 1 USDT
- **Max Win**: 1000x
- **House Edge**: 1%
- **Canister**: `crash_backend`

### 2. Plinko
- **Mechanics**: Ball bounces through pegs to land in multiplier slots
- **Features**: Adjustable rows (8/12/16) and risk levels (Low/Medium/High)
- **Min Bet**: 1 USDT
- **Max Win**: 1000x (16 rows, high risk)
- **House Edge**: 1%
- **Canister**: `plinko_backend`

### 3. Blackjack
- **Mechanics**: Classic blackjack against the dealer
- **Objective**: Get closer to 21 than dealer without busting
- **Actions**: Hit, Stand, Double Down, Split
- **Min Bet**: 0.01 USDT
- **Max Win**: 10 USDT
- **House Edge**: ~1%
- **Canister**: `blackjack_backend`

### 4. Dice
- **Mechanics**: Roll a number from 0-100, predict over or under target
- **Objective**: Choose target number and direction, win if roll matches prediction
- **Min Bet**: 0.01 USDT
- **Max Bet**: Dynamic based on multiplier (10 USDT max win / multiplier)
- **Max Win**: 10 USDT
- **House Edge**: 1%
- **Win Chance**: 1% to 98% (adjustable via target number)
- **Canister**: `dice_backend`

### Future Games
- **Slots**: Traditional slot machine with crypto themes
- **Roulette**: European roulette with single zero

## 🏗️ Development Workflow

### Step 1: Make Code Changes
```bash
# Game backend changes
vim crash_backend/src/lib.rs
vim plinko_backend/src/lib.rs
vim mines_backend/src/lib.rs
vim dice_backend/src/lib.rs

# Frontend changes
vim openhouse_frontend/dist/index.html
# (Will add proper React/Vue setup later)
```

### Step 2: Deploy to Mainnet (MANDATORY)
```bash
# Deploy everything
./deploy.sh

# Or deploy specific components
./deploy.sh --crash-only
./deploy.sh --dice-only
./deploy.sh --plinko-only
./deploy.sh --mines-only
./deploy.sh --frontend-only
```

### Step 3: Test on Mainnet
```bash
# Run automated tests
./deploy.sh --test

# Manual testing - Crash game
dfx canister --network ic call crash_backend greet '("Player")'
dfx canister --network ic call crash_backend get_game_state

# Manual testing - Plinko game
dfx canister --network ic call plinko_backend greet '("Player")'
dfx canister --network ic call plinko_backend get_stats
dfx canister --network ic call plinko_backend get_multipliers '(16, variant { High })'

# Manual testing - Mines game
dfx canister --network ic call mines_backend greet '("Player")'
dfx canister --network ic call mines_backend get_stats

# Manual testing - Dice game
dfx canister --network ic call dice_backend greet '("Player")'
dfx canister --network ic call dice_backend get_stats
dfx canister --network ic call dice_backend calculate_payout_info '(50 : nat8, variant { Over })'

# Check frontend
open https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
```

### Step 4: Commit Changes
```bash
git add .
git commit -m "feat: update OpenHouse casino feature"
git push
```

## 🔐 Security & Fairness

### Randomness
- All games use IC's VRF (Verifiable Random Function)
- Players can verify fairness of each game result
- Commit-reveal scheme prevents prediction

### House Edge Transparency
- Exact house edge displayed for each game
- All multiplier tables public in code
- No hidden fees or mechanics

### Fund Management
- Each game backend manages its own treasury
- Implement deposit/withdrawal limits
- Circuit breakers for anomaly detection

## 🎲 Game-Specific APIs

### Crash Backend
```rust
// Start new round
start_new_round() -> Result<GameRound, String>

// Place bet
place_bet(amount: u64) -> Result<PlayerBet, String>

// Cash out
cash_out() -> Result<u64, String>

// Query game state
get_game_state() -> GameState
get_round(round_id: u64) -> Option<GameRound>
get_recent_rounds(limit: u32) -> Vec<GameRound>
```

### Blackjack Backend
```rust
// Game methods
start_game(bet: u64, seed: String) -> Result<GameStartResult, String>
hit(game_id: u64) -> Result<ActionResult, String>
stand(game_id: u64) -> Result<ActionResult, String>
double_down(game_id: u64) -> Result<ActionResult, String>
split(game_id: u64) -> Result<ActionResult, String>

// Query functions
get_game(game_id: u64) -> Option<BlackjackGame>
get_stats() -> GameStats
```

### Dice Backend
```rust
// Play a game
play_dice(bet_amount: u64, target_number: u8, direction: RollDirection) -> Result<DiceResult, String>

// Query functions
get_stats() -> GameStats
get_recent_games(limit: u32) -> Vec<DiceResult>
get_game(game_id: u64) -> Option<DiceResult>
calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String>
get_max_bet(target_number: u8, direction: RollDirection) -> u64
```

## 🛠️ Adding New Games

### 1. Create Backend Canister
```bash
# Create new game directory
mkdir <game>_backend
cd <game>_backend

# Add Cargo.toml
# Add src/lib.rs with game logic
# Add <game>_backend.did for interface
```

### 2. Update Configuration
```bash
# Add to dfx.json
# Add to Cargo.toml workspace
# Update deploy.sh
```

### 3. Add Frontend Route
```bash
# Add game card to homepage
# Create game-specific UI page
# Connect to backend canister
```

## 🐛 Common Issues & Solutions

### Issue: Frontend can't call backend methods
**Solution:** Sync declarations after backend changes
```bash
# After any backend deployment
cp -r src/declarations/* openhouse_frontend/src/declarations/
./deploy.sh --frontend-only
```

### Issue: Deployment fails with permission error
**Solution:** Ensure using daopad identity
```bash
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use daopad
./deploy.sh
```

### Issue: Game state lost after upgrade
**Solution:** Use stable variables in backend
```rust
#[ic_cdk::pre_upgrade]
fn pre_upgrade() {
    // Save state to stable memory
}

#[ic_cdk::post_upgrade]
fn post_upgrade() {
    // Restore state from stable memory
}
```

## 📊 Monitoring & Analytics

### Key Metrics to Track
- Total volume per game
- House profit/loss
- Active players
- Average bet size
- Popular games/times

### Health Checks
```bash
# Check canister cycles
dfx canister --network ic status crash_backend
dfx canister --network ic status plinko_backend
dfx canister --network ic status dice_backend

# Check recent activity
dfx canister --network ic call crash_backend get_game_state
dfx canister --network ic call plinko_backend get_stats
dfx canister --network ic call dice_backend get_stats
```

## 🚨 Emergency Procedures

### Pause All Games
```bash
dfx canister --network ic call crash_backend pause_game
dfx canister --network ic call plinko_backend pause_game
```

### Resume Games
```bash
dfx canister --network ic call crash_backend resume_game
dfx canister --network ic call plinko_backend resume_game
```

## 📝 Deployment Checklist

Before each deployment:
- [ ] Run `cargo test` for all backends
- [ ] Check for security vulnerabilities: `cargo audit`
- [ ] Verify randomness implementation
- [ ] Review betting limits across games
- [ ] Test error handling paths
- [ ] Ensure stable memory persistence
- [ ] Check frontend routing works

After deployment:
- [ ] Run integration tests: `./deploy.sh --test`
- [ ] Verify frontend at https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- [ ] Test each game's core functionality
- [ ] Check all routes work correctly
- [ ] Monitor canister cycles balance
- [ ] Watch initial user interactions

## 🔗 Resources

- **Frontend**: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- **IC Dashboard**: https://dashboard.internetcomputer.org
- **Crash Backend**: https://dashboard.internetcomputer.org/canister/fws6k-tyaaa-aaaap-qqc7q-cai
- **Plinko Backend**: https://dashboard.internetcomputer.org/canister/weupr-2qaaa-aaaap-abl3q-cai
- **Mines Backend**: https://dashboard.internetcomputer.org/canister/wvrcw-3aaaa-aaaah-arm4a-cai
- **Dice Backend**: https://dashboard.internetcomputer.org/canister/whchi-hyaaa-aaaao-a4ruq-cai
- **VRF Documentation**: https://internetcomputer.org/docs/current/references/ic-interface-spec#ic-raw_rand

## ⚡ Key Principles

1. **ALWAYS deploy to mainnet** - No local environment exists
2. **Each game is independent** - Separate canisters for modularity
3. **Transparent odds always** - No hidden mechanics
4. **Use VRF for all randomness** - Ensures provable fairness
5. **Test on mainnet immediately** - Every change is live
6. **Document everything** - Future developers need context

---

**Remember**: You're working directly on mainnet. Every deployment affects real users immediately. The house always needs an edge, but at OpenHouse, that edge is transparent!