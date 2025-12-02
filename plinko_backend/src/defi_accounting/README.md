# DeFi Accounting Module for ckUSDT Games

A secure, auditable, and reusable accounting module for Internet Computer Protocol (ICP) based games using a Liquidity Pool system with ckUSDT.

## 🎯 Overview

This module provides complete DeFi functionality for ckUSDT-based games using a Liquidity Pool system:

- Liquidity providers stake ckUSDT for shares
- Players win/lose from the pool
- Distributed risk among LPs
- Fully decentralized (no admin control)

## 🏗️ Architecture

### Why No Guards Needed

Unlike protocols with multi-step async operations (e.g., icp_swap), our design follows the Checks-Effects-Interactions pattern:

1. **All validations happen BEFORE transfers**
2. **State updates are atomic** (no await points between critical updates)
3. **IC guarantees sequential execution** - no race conditions possible

This eliminates the need for reentrancy guards while maintaining security.

## 📁 Module Structure

```
defi_accounting/
├── mod.rs              # Public interface and exports
├── accounting.rs       # Core user accounting
├── liquidity_pool.rs   # LP system (deposits, withdrawals, shares)
├── CLAUDE.md          # AI assistant guide
└── README.md          # This file
```

## 🚀 Quick Integration

### For Games Using the Module

```rust
// Handle game outcomes
if is_win {
    liquidity_pool::update_pool_on_win(profit);
} else {
    liquidity_pool::update_pool_on_loss(bet_amount);
}

// Check bet limits
let max = defi_accounting::get_max_allowed_payout();
if potential_payout > max {
    return Err("Exceeds limit");
}
```

### For Liquidity Providers

```rust
// Deposit ckUSDT to receive LP shares (minimum 1 ckUSDT)
let shares = deposit_liquidity(1_000_000).await?;

// Check position
let position = get_lp_position(caller);
// Returns: shares owned, ckUSDT value, % of pool

// Withdraw all (no partial withdrawals)
let usdt_received = withdraw_all_liquidity().await?;
```

## 📊 API Reference

### Player Functions

| Function | Type | Description |
|----------|------|-------------|
| `deposit(amount: u64)` | Update | Deposit ckUSDT into player account |
| `withdraw(amount: u64)` | Update | Withdraw ckUSDT from player account |
| `withdraw_all()` | Update | Withdraw entire player balance |
| `get_balance(user: Principal)` | Query | Get user's balance |
| `get_my_balance()` | Query | Get caller's balance |

### Liquidity Pool Functions

| Function | Type | Description |
|----------|------|-------------|
| `deposit_liquidity(amount: u64)` | Update | Stake ckUSDT, receive LP shares (min 1 ckUSDT) |
| `withdraw_all_liquidity()` | Update | Burn all shares, receive proportional ckUSDT |
| `get_lp_position(user: Principal)` | Query | Get LP shares and value |
| `get_pool_stats()` | Query | Get pool metrics |

### System Functions

| Function | Type | Description |
|----------|------|-------------|
| `get_house_mode()` | Query | Returns current operating mode |
| `get_house_balance()` | Query | Get house/pool balance |
| `get_max_allowed_payout()` | Query | Get 10% of house/pool balance |
| `get_accounting_stats()` | Query | Get comprehensive stats |
| `can_accept_bets()` | Query | Check if system can accept bets |

## 🔒 Security Features

### Liquidity Pool Security
- **Minimum 1 ckUSDT deposit** - Prevents share manipulation attacks
- **Full withdrawal only** - Simplifies accounting, prevents gaming
- **No admin privileges** - Fully decentralized
- **CEI Pattern** - State changes before transfers
- **Minimum liquidity burn** - 1000 shares burned on first deposit

### General Security
- **Stable Storage** - All balances persist across upgrades
- **Overflow Protection** - Uses Nat (arbitrary precision) for calculations
- **Sequential Execution** - IC's model prevents race conditions
- **Transparent Limits** - Clear 10% house/pool limit

## 🔧 Configuration

Key constants in the module:

```rust
// Liquidity Pool
const MIN_DEPOSIT: u64 = 1_000_000;        // 1 ckUSDT minimum for LP
const MINIMUM_LIQUIDITY: u64 = 1000;       // Burned on first deposit

// Player Accounts
const MIN_DEPOSIT: u64 = 10_000_000;       // 10 ckUSDT for players (prevents dust)
const MIN_WITHDRAW: u64 = 1_000_000;       // 1 ckUSDT minimum

// System
const TRANSFER_FEE: u64 = 10_000;          // 0.01 ckUSDT (10,000 decimals)
const MAX_PAYOUT_PERCENTAGE: f64 = 0.10;   // 10% of pool/house
```

## 💡 Design Decisions

### Why Liquidity Pool?
- **Distributed Risk** - Multiple LPs share wins/losses
- **Deeper Liquidity** - Larger pool enables bigger bets
- **Decentralized** - No single point of failure
- **Transparent** - All shares and reserves on-chain

### Why 1 ckUSDT Minimum?
- **Prevents Attacks** - Share manipulation requires significant capital
- **Avoids Precision Loss** - Integer math works well at this scale
- **Serious LPs Only** - Filters out dust deposits

### Why Full Withdrawal Only?
- **Simplicity** - No complex partial share calculations
- **Security** - Prevents gaming the system
- **UX** - Clear all-or-nothing choice

### Trade-offs Accepted
1. **No Partial Withdrawals** - Simplicity over flexibility
2. **No Admin Control** - Decentralization over management
3. **Sequential Execution** - IC's model over complex guards

## 🔍 Audit Focus Areas

When reviewing this module:

- [ ] Share calculation math (no rounding exploits)
- [ ] Minimum deposit enforcement (before transfers)
- [ ] State update ordering (CEI pattern)
- [ ] Nat arithmetic (overflow protection)
- [ ] Pool solvency checks
- [ ] First depositor handling

## 📈 Monitoring

Key metrics to track:
- Total pool reserve
- Number of LPs
- Total shares outstanding
- Player deposit volume
- Win/loss ratio
- Max bet capacity

Use `get_pool_stats()` and `get_accounting_stats()` for monitoring.

## 🐛 Known Considerations

1. **First Depositor** - Gets slightly fewer shares due to minimum liquidity burn
2. **Integer Division** - Very small deposits may experience rounding
3. **No Partial Withdrawals** - LPs must withdraw entire position

These are conscious design choices for security and simplicity.

## 📝 License

This module is open-source and can be freely used in any ICP project.

## 🤝 Contributing

To improve this module:
1. Maintain game-agnostic design
2. Preserve the CEI pattern
3. Document security implications
4. Ensure backward compatibility
5. Remember IC's execution model

## 📞 Support

For questions or issues, refer to the OpenHouse repository on GitHub.