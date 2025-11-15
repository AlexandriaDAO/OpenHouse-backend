# Mines Backend - DEMO MODE

## ⚠️ CRITICAL WARNING - DEMO MODE ONLY ⚠️

**This canister is in DEMO MODE for testing game mechanics.**

### What This Means:

- ❌ **NO REAL ICP TRANSFERS** - All transfer functions are stubbed
- ❌ **SIMULATED BALANCES** - Bankroll values are fictional
- ❌ **NOT PRODUCTION READY** - Do not use with real funds
- ✅ **GAME MECHANICS ONLY** - For testing gameplay only

### Current Implementation Status:

#### ✅ Implemented (Working):
- Game mechanics (5x5 grid, 5 mines)
- Multiplier calculation with 1% house edge
- Bet validation (0.1 - 1 ICP range)
- Max win cap (10 ICP / 10x multiplier)
- Bankroll tracking (simulated)
- Game state management
- Statistics tracking

#### ❌ NOT Implemented (TODO):
- **Actual ICP ledger transfers** (CRITICAL - currently stubbed)
- Real balance verification
- Transaction error handling
- Deposit/withdrawal from real ledger
- Production security audit

### Before Production Use:

1. **Implement Real ICP Transfers**:
   - Replace `transfer_from_player()` stub with actual ledger calls
   - Replace `transfer_to_player()` stub with actual ledger calls
   - Add proper error handling for transfer failures
   - Implement transaction rollback on errors

2. **Security Audit**:
   - Review all fund handling code
   - Test transfer failure scenarios
   - Verify bankroll accounting matches reality
   - Add circuit breakers for anomalies

3. **Testing**:
   - Unit tests for all transfer scenarios
   - Integration tests with real ledger (testnet)
   - Load testing for concurrent games
   - Failure mode testing

### API Overview:

#### Game Functions:
- `start_game(bet_amount: nat64)` - ⚠️ DEMO: Simulates accepting bet
- `reveal_tile(game_id, position)` - Reveals a tile
- `cash_out(game_id)` - ⚠️ DEMO: Simulates payout

#### Query Functions:
- `get_game(game_id)` - Get game state
- `get_stats()` - Get game statistics
- `get_bankroll()` - ⚠️ DEMO: Returns simulated balances

### Configuration:

```rust
const GRID_SIZE: usize = 25;           // 5x5 grid
const FIXED_MINES: u8 = 5;             // Always 5 mines
const HOUSE_EDGE: f64 = 0.99;          // 1% house edge
const MIN_BET: u64 = 10_000_000;       // 0.1 ICP
const MAX_BET: u64 = 100_000_000;      // 1 ICP
const MAX_WIN: u64 = 1_000_000_000;    // 10 ICP
const MAX_MULTIPLIER: f64 = 10.0;      // 10x cap
```

### Deployment:

**Mainnet Canister ID**: `wvrcw-3aaaa-aaaah-arm4a-cai`

**⚠️ WARNING**: Deployed to mainnet but in DEMO MODE only!

### Contact:

For questions about implementing real ICP transfers or production readiness, please consult the IC ledger documentation and security best practices.

---

**Remember**: This is a DEMONSTRATION. Do NOT use with real funds!
