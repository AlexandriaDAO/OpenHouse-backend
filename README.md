# 🎰 OpenHouse Casino

**The first casino where YOU can be the house**

Built by [Alexandria](https://alexandria.xyz) - an open-source gaming studio on the Internet Computer.

## 🎯 What Makes OpenHouse Different

Traditional online casinos keep all the profits and hide their odds. OpenHouse flips this entirely:

### 💰 Revolutionary Economic Model

**You can own the house** - Instead of playing against a faceless corporation, users provide the house liquidity and own shares of the games. The house money is provided by users like you, who earn a portion of the casino's profits.

**Transparent 1% house edge** - Every game maintains exactly 1% house edge, verifiable through:
- Open-source code you can audit
- Internet Computer's VRF (Verifiable Random Function) for provably fair randomness
- Publicly visible multiplier tables and payout calculations

**$ALEX stakers earn 100% of revenue** - OpenHouse is built by Alexandria studio, and all revenue flows to $ALEX token stakers. The revenue model is beautifully simple: a 1% fee on house money withdrawals goes directly to $ALEX stakers.

### ✨ Core Principles

- **Provably Fair**: Every game result is cryptographically verifiable using IC's VRF
- **Bot Resistant**: VRF randomness cannot be predicted or manipulated
- **Fully Transparent**: All code is open-source, all odds are public
- **Community Owned**: Users provide liquidity, users own shares, users verify fairness

The name "OpenHouse" is a triple play on words:
- We're **the house** (casino)
- Everything is **open-source** with transparent odds
- The house is **open to everyone** - you can become the house

## 🎮 Live Games

| Game | Description | House Edge | Max Win | Play Now |
|------|-------------|------------|---------|----------|
| **Crash** | Multiplier rises until crash - cash out before it's too late | 1% | 1000x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/crash) |
| **Plinko** | Drop a ball through pegs into multiplier slots | 1% | 1000x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko) |
| **Mines** | Navigate a 5x5 minefield, cash out before hitting a mine | 1% | 5000x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/mines) |
| **Dice** | Roll over or under your target number | 1% | 100x | [Play](https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice) |

**Frontend**: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io

## 💎 Economic Model & Revenue

### How Being "The House" Works

In traditional casinos, the house provides all liquidity and takes all profits. At OpenHouse:

1. **Users provide house liquidity** - Deposit ICP to become a liquidity provider (LP)
2. **Receive ownership shares** - Get LP tokens representing your share of the house
3. **Earn from the edge** - The 1% house edge flows to LP holders proportionally
4. **Withdraw anytime** - Pull your liquidity plus earnings whenever you want

### Revenue Distribution

OpenHouse has a transparent, simple revenue model:

- **Players** play games with a transparent 1% house edge
- **Liquidity providers** earn from the house edge on every bet
- **$ALEX stakers** receive 100% of platform revenue via a 1% fee on LP withdrawals
- **No hidden fees** - That's it. No rake, no VIP programs, no misleading promos

### Built by Alexandria

OpenHouse is created by [Alexandria](https://alexandria.xyz), an open-source gaming studio building on the Internet Computer. All OpenHouse revenue flows to $ALEX token stakers, making this casino a revenue-generating product for the Alexandria ecosystem.

**Why this matters:**
- Aligned incentives: Alexandria succeeds when OpenHouse succeeds
- Long-term thinking: Not a cash grab, but ecosystem building
- Open-source commitment: Transparency is core to Alexandria's mission
- Community first: $ALEX stakers benefit from all Alexandria products

## 🏗️ Architecture

OpenHouse is built as a modular system where each game runs in its own Internet Computer canister:

```
openhouse/
├── crash_backend/          # Crash game canister (fws6k-tyaaa-aaaap-qqc7q-cai)
├── plinko_backend/         # Plinko game canister (weupr-2qaaa-aaaap-abl3q-cai)
├── mines_backend/          # Mines game canister (wvrcw-3aaaa-aaaah-arm4a-cai)
├── dice_backend/           # Dice game canister (whchi-hyaaa-aaaao-a4ruq-cai)
└── openhouse_frontend/     # Multi-game UI (pezw3-laaaa-aaaal-qssoa-cai)
```

Each game backend is written in Rust and independently manages:
- Game logic and rules
- Random number generation via IC VRF
- Bet placement and payout calculation
- Game history and statistics

## 🚀 Quick Start

**⚠️ Important**: OpenHouse runs entirely on IC mainnet. There is no local testing environment - all development and testing happens in production.

```bash
# Deploy all games and frontend
./deploy.sh

# Deploy specific game
./deploy.sh --crash-only
./deploy.sh --plinko-only
./deploy.sh --mines-only
./deploy.sh --dice-only

# Deploy frontend only
./deploy.sh --frontend-only

# Deploy with tests
./deploy.sh --test
```

## 🔬 How Provable Fairness Works

### 1. Verifiable Random Function (VRF)
Every game uses the Internet Computer's `raw_rand()` function, which provides cryptographically secure randomness that:
- Cannot be predicted before generation
- Cannot be manipulated after request
- Can be verified by anyone on-chain

### 2. Transparent House Edge
The house edge is hardcoded in the game logic and visible in the source code:

```rust
// Example from Plinko
const HOUSE_EDGE: f64 = 0.01; // 1% house edge

fn calculate_payout(multiplier: f64, bet: u64) -> u64 {
    let payout = (bet as f64) * multiplier * (1.0 - HOUSE_EDGE);
    payout as u64
}
```

### 3. Open Source Verification
Anyone can:
1. Read the game logic on GitHub
2. Verify the deployed canister matches the source code
3. Calculate expected return from multiplier tables
4. Confirm house edge matches claims

## 🎲 Game Details

### Crash
- Multiplier starts at 1.00x and increases
- Cash out before the crash to win
- Crash point determined by VRF
- Min bet: 1 ICP | Max win: 1000x

### Plinko
- Drop ball through 8, 12, or 16 rows of pegs
- Choose risk level: Low, Medium, or High
- Different multiplier distributions per configuration
- Min bet: 1 ICP | Max win: 1000x

### Mines
- 5x5 grid with hidden mines
- Reveal safe tiles to increase multiplier
- Cash out anytime or lose everything on a mine
- Min bet: 1 ICP | Max win: 5000x

### Dice
- Roll a number from 0-100
- Predict over or under your target
- Adjustable win chance from 1% to 98%
- Min bet: 1 ICP | Max win: 100x

## 🛠️ Development

### Prerequisites
- [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install) (IC SDK)
- Rust and Cargo
- Git

### Project Structure
```
openhouse/
├── crash_backend/
│   ├── src/lib.rs           # Crash game logic
│   └── crash_backend.did    # Candid interface
├── plinko_backend/
│   ├── src/lib.rs           # Plinko game logic
│   └── plinko_backend.did   # Candid interface
├── mines_backend/
│   ├── src/lib.rs           # Mines game logic
│   └── mines_backend.did    # Candid interface
├── dice_backend/
│   ├── src/lib.rs           # Dice game logic
│   └── dice_backend.did     # Candid interface
├── openhouse_frontend/
│   └── dist/                # Static HTML/CSS/JS
├── deploy.sh                # Deployment script
├── dfx.json                 # IC configuration
└── CLAUDE.md               # Detailed developer guide
```

### Testing on Mainnet
```bash
# Deploy changes
./deploy.sh

# Test Crash backend
dfx canister --network ic call crash_backend get_game_state

# Test Plinko backend
dfx canister --network ic call plinko_backend get_stats
dfx canister --network ic call plinko_backend get_multipliers '(16, variant { High })'

# Test Mines backend
dfx canister --network ic call mines_backend get_stats

# Test Dice backend
dfx canister --network ic call dice_backend get_stats
dfx canister --network ic call dice_backend calculate_payout_info '(50 : nat8, variant { Over })'

# Check frontend
open https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
```

## 📊 Monitoring

Check canister status and health:
```bash
# View canister cycles
dfx canister --network ic status crash_backend
dfx canister --network ic status plinko_backend
dfx canister --network ic status mines_backend
dfx canister --network ic status dice_backend

# View on IC Dashboard
open https://dashboard.internetcomputer.org/canister/fws6k-tyaaa-aaaap-qqc7q-cai
```

## 🤝 Contributing

OpenHouse is open-source and welcomes contributions:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Deploy and test on mainnet
5. Submit a pull request

### Adding New Games
See `CLAUDE.md` for detailed instructions on adding new games to the platform.

## 📚 Resources

- **Frontend**: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- **Developer Guide**: [CLAUDE.md](./CLAUDE.md)
- **IC Documentation**: https://internetcomputer.org/docs
- **VRF Spec**: https://internetcomputer.org/docs/current/references/ic-interface-spec#ic-raw_rand
- **Candid Guide**: https://internetcomputer.org/docs/current/developer-docs/backend/candid/

## 🔐 Security

- All randomness from IC's VRF - cryptographically secure
- Each game manages its own treasury independently
- Open source allows public security audits
- Mainnet-only deployment ensures production-grade security

## 📜 License

OpenHouse is open-source software. See LICENSE file for details.

---

**The house always has an edge. At OpenHouse, that edge is transparent - and you can own it.**

Built with ❤️ by [Alexandria](https://alexandria.xyz)
