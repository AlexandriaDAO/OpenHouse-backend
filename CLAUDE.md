# OpenHouse Backend - Claude Deployment Guide

## 🎰 CRITICAL: Mainnet-Only Backend Canisters

**⚠️ IMPORTANT: There is no local testing environment. ALL testing happens on mainnet.**

This repository contains only the **backend canisters** for the OpenHouse casino platform. The frontend is maintained separately in the [OpenHouse](https://github.com/AlexandriaDAO/OpenHouse) repository.

## 🎯 Project Philosophy

**"Open House"** - A play on words:
- We're **the house** (casino)
- Everything is **open-source** with transparent odds
- All games are **provably fair** using IC's VRF

## 🚀 Quick Start

```bash
# Deploy all backends to mainnet
./deploy.sh

# Deploy specific game backend
./deploy.sh --roulette-only
./deploy.sh --life-only
./deploy.sh --life2-only
./deploy.sh --life3-only

# Deploy with tests
./deploy.sh --test
```

## 📦 Canister Architecture

| Component | Canister ID | Purpose |
|-----------|-------------|---------|
| **Dice Backend** | `whchi-hyaaa-aaaao-a4ruq-cai` | Dice game logic |
| **Plinko Backend** | `weupr-2qaaa-aaaap-abl3q-cai` | Plinko game logic |
| **Crash Backend** | `fws6k-tyaaa-aaaap-qqc7q-cai` | Crash game logic |
| **Roulette Backend** | `wvrcw-3aaaa-aaaah-arm4a-cai` | Roulette game logic |
| **Life1 Backend** | `pijnb-7yaaa-aaaae-qgcuq-cai` | Game of Life - Server 1 |
| **Life2 Backend** | `qoski-4yaaa-aaaai-q4g4a-cai` | Game of Life - Server 2 |
| **Life3 Backend** | `66p3s-uaaaa-aaaad-ac47a-cai` | Game of Life - Server 3 |

**Note:** Frontend is deployed separately from the [OpenHouse](https://github.com/AlexandriaDAO/OpenHouse) repo.

## 🎮 Games Overview

### 1. Dice
- **Mechanics**: Roll a number from 0-100, predict over or under target
- **Objective**: Choose target number and direction, win if roll matches prediction
- **Min Bet**: 0.01 USDT
- **Max Bet**: Dynamic based on multiplier (100 USDT max win / multiplier)
- **Max Win**: 100 USDT
- **House Edge**: 1%
- **Win Chance**: 1% to 98% (adjustable via target number)
- **Canister**: `dice_backend`

### 2. Plinko
- **Mechanics**: Ball bounces through pegs to land in multiplier slots
- **Features**: Adjustable rows (8/12/16) and risk levels (Low/Medium/High)
- **Min Bet**: 0.01 USDT
- **Max Win**: 1000x (16 rows, high risk)
- **House Edge**: 1%
- **Canister**: `plinko_backend`

### 3. Crash Game
- **Mechanics**: Multiplier increases from 1.00x until it crashes
- **Objective**: Cash out before the crash
- **Min Bet**: 1 USDT
- **Max Win**: 1000x
- **House Edge**: 1%
- **Canister**: `crash_backend`

### 4. Roulette
- **Mechanics**: European roulette (single zero, 0-36)
- **Objective**: Predict where the ball lands on the wheel
- **Bet Types**: Straight (35:1), Split (17:1), Street (11:1), Corner (8:1), Six Line (5:1), Column/Dozen (2:1), Red/Black/Odd/Even/High/Low (1:1)
- **Min Bet**: 0.01 USDT
- **Max Bets Per Spin**: 20
- **House Edge**: 2.70% (European rules)
- **Canister**: `roulette_backend`

### Future Games
- **Slots**: Traditional slot machine with crypto themes
- **Blackjack**: Classic card game against the dealer

## 🏗️ Development Workflow

### Step 1: Make Code Changes
```bash
# Game backend changes
vim dice_backend/src/lib.rs
vim plinko_backend/src/lib.rs
vim crash_backend/src/lib.rs
vim roulette_backend/src/lib.rs
vim life1_backend/src/lib.rs
vim life2_backend/src/lib.rs
vim life3_backend/src/lib.rs
```

### Step 2: Deploy to Mainnet (MANDATORY)
```bash
# Deploy all backends
./deploy.sh

# Or deploy specific components
./deploy.sh --roulette-only
./deploy.sh --life-only
./deploy.sh --life2-only
./deploy.sh --life3-only
```

### Step 3: Test on Mainnet
```bash
# Run automated tests
./deploy.sh --test

# Manual testing - Dice game
dfx canister --network ic call dice_backend greet '("Player")'
dfx canister --network ic call dice_backend get_stats
dfx canister --network ic call dice_backend calculate_payout_info '(50 : nat8, variant { Over })'

# Manual testing - Plinko game
dfx canister --network ic call plinko_backend greet '("Player")'
dfx canister --network ic call plinko_backend get_stats
dfx canister --network ic call plinko_backend get_multipliers '(16, variant { High })'

# Manual testing - Crash game
dfx canister --network ic call crash_backend greet '("Player")'
dfx canister --network ic call crash_backend get_game_state

# Manual testing - Roulette game
dfx canister --network ic call roulette_backend greet '("Player")'
dfx canister --network ic call roulette_backend get_board_layout
dfx canister --network ic call roulette_backend get_payouts
dfx canister --network ic call roulette_backend get_max_bet
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

### Roulette Backend
```rust
// Spin the wheel with bets
spin(bets: Vec<Bet>) -> Result<SpinResult, String>

// Query functions
get_max_bet() -> u64
get_board_layout() -> BoardLayout
get_payouts() -> Vec<PayoutInfo>
greet(name: String) -> String

// Bet types: Straight(u8), Split(u8,u8), Street(u8), Corner(u8),
// SixLine(u8), Column(u8), Dozen(u8), Red, Black, Even, Odd, Low, High
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

### 3. Coordinate with Frontend
The frontend is maintained in the separate [OpenHouse](https://github.com/AlexandriaDAO/OpenHouse) repository.
After adding a new backend canister, coordinate with the frontend team to add the corresponding UI.

## 🐛 Common Issues & Solutions

### Handling Stuck Withdrawals

If a withdrawal times out (rare ~1 in 30B), users will see a recovery panel:

1. **Check On-Chain Balance First**: View ckUSDT balance in wallet
2. **If Funds Arrived**: Click "Confirm Receipt" to clear pending state
3. **If Funds Missing**: Click "Retry Transfer" to attempt again

The system will never automatically rollback a timeout to prevent double-spend.

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
dfx canister --network ic status dice_backend
dfx canister --network ic status plinko_backend
dfx canister --network ic status crash_backend
dfx canister --network ic status roulette_backend

# Check recent activity
dfx canister --network ic call dice_backend get_stats
dfx canister --network ic call plinko_backend get_stats
dfx canister --network ic call crash_backend get_game_state
dfx canister --network ic call roulette_backend get_stats
```

## 🚨 Emergency Procedures

### Pause All Games
```bash
dfx canister --network ic call dice_backend pause_game
dfx canister --network ic call plinko_backend pause_game
dfx canister --network ic call crash_backend pause_game
dfx canister --network ic call roulette_backend pause_game
```

### Resume Games
```bash
dfx canister --network ic call dice_backend resume_game
dfx canister --network ic call plinko_backend resume_game
dfx canister --network ic call crash_backend resume_game
dfx canister --network ic call roulette_backend resume_game
```

## 📝 Deployment Checklist

Before each deployment:
- [ ] Run `cargo test` for all backends
- [ ] Check for security vulnerabilities: `cargo audit`
- [ ] Verify randomness implementation
- [ ] Review betting limits across games
- [ ] Test error handling paths
- [ ] Ensure stable memory persistence

After deployment:
- [ ] Run integration tests: `./deploy.sh --test`
- [ ] Test each game's core functionality via dfx calls
- [ ] Monitor canister cycles balance
- [ ] Watch initial user interactions
- [ ] Notify frontend team if API changes were made

## 🔗 Resources

- **Frontend Repo**: https://github.com/AlexandriaDAO/OpenHouse
- **Live Frontend**: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- **IC Dashboard**: https://dashboard.internetcomputer.org
- **Dice Backend**: https://dashboard.internetcomputer.org/canister/whchi-hyaaa-aaaao-a4ruq-cai
- **Plinko Backend**: https://dashboard.internetcomputer.org/canister/weupr-2qaaa-aaaap-abl3q-cai
- **Crash Backend**: https://dashboard.internetcomputer.org/canister/fws6k-tyaaa-aaaap-qqc7q-cai
- **Roulette Backend**: https://dashboard.internetcomputer.org/canister/wvrcw-3aaaa-aaaah-arm4a-cai
- **Life1 Backend**: https://dashboard.internetcomputer.org/canister/pijnb-7yaaa-aaaae-qgcuq-cai
- **Life2 Backend**: https://dashboard.internetcomputer.org/canister/qoski-4yaaa-aaaai-q4g4a-cai
- **Life3 Backend**: https://dashboard.internetcomputer.org/canister/66p3s-uaaaa-aaaad-ac47a-cai
- **VRF Documentation**: https://internetcomputer.org/docs/current/references/ic-interface-spec#ic-raw_rand

## ⚡ Key Principles

1. **ALWAYS deploy to mainnet** - No local environment exists
2. **Each game is independent** - Separate canisters for modularity
3. **Transparent odds always** - No hidden mechanics
4. **Use VRF for all randomness** - Ensures provable fairness
5. **Test on mainnet immediately** - Every change is live
6. **Document everything** - Future developers need context
7. **Backend-only repo** - Frontend is maintained separately in the OpenHouse repo

---

**Remember**: You're working directly on mainnet. Every deployment affects real users immediately. The house always needs an edge, but at OpenHouse, that edge is transparent!

**Note**: This repository contains only backend canisters. For frontend changes, see the [OpenHouse](https://github.com/AlexandriaDAO/OpenHouse) repository.