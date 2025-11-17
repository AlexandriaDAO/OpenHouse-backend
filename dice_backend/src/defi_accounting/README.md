# DeFi Accounting Module for ICP Games

A secure, auditable, and reusable accounting module for Internet Computer Protocol (ICP) based games.

## 🎯 Overview

This module provides complete DeFi functionality for any ICP-based game, handling:
- User deposits and withdrawals
- Balance tracking with stable storage
- House balance management
- Dynamic bet limits (10% of house balance)
- Cost-efficient hourly cache refresh

## 💰 Cost Efficiency

- **Previous approach**: 30-second refresh = ~$33/month
- **This module**: Hourly refresh = ~$0.27/month
- **Savings**: 99% reduction in cycle costs

## 🔒 Security Features

1. **Stable Storage**: All balances persist across canister upgrades
2. **Re-entrancy Protection**: Debit-before-transfer pattern
3. **Self-limiting**: Maximum loss capped at house balance
4. **Transparent Limits**: Clear 10% house limit

## 📁 Module Structure

```
defi_accounting/
├── mod.rs           # Public interface, integration guide, timer initialization
├── accounting.rs    # Core deposit/withdrawal/balance logic
└── README.md        # This file
```

## 🚀 Quick Integration

### Step 1: Copy Module

Copy the entire `defi_accounting` folder to your game's `src/` directory.

### Step 2: Update lib.rs

```rust
// Add module
mod defi_accounting;

// Re-export what you need
pub use defi_accounting::{
    deposit, withdraw, get_balance, get_house_balance,
    get_max_allowed_payout, AccountingStats
};

// In init()
#[init]
fn init() {
    defi_accounting::init_balance_refresh_timer();
}

// In pre_upgrade()
#[pre_upgrade]
fn pre_upgrade() {
    // StableBTreeMap persists automatically
}

// In post_upgrade()
#[post_upgrade]
fn post_upgrade() {
    defi_accounting::init_balance_refresh_timer();
    // StableBTreeMap restores automatically
}

// No heartbeat function needed - timers handle refresh automatically
```

### Step 3: Use in Game Logic

```rust
// Check max bet before accepting
let max_allowed = defi_accounting::get_max_allowed_payout();
if potential_payout > max_allowed {
    return Err("Exceeds house limit");
}

// Update balance after game
if player_won {
    defi_accounting::update_balance(player, true, payout)?;
} else {
    defi_accounting::update_balance(player, false, bet_amount)?;
}
```

## 📊 API Reference

### Core Functions

| Function | Type | Description |
|----------|------|-------------|
| `deposit(amount: u64)` | Update | Deposit ICP into account |
| `withdraw(amount: u64)` | Update | Withdraw ICP from account |
| `withdraw_all()` | Update | Withdraw entire balance |
| `get_balance(user: Principal)` | Query | Get user's balance |
| `get_my_balance()` | Query | Get caller's balance |
| `get_house_balance()` | Query | Get house balance |
| `get_max_allowed_payout()` | Query | Get 10% of house balance |
| `get_accounting_stats()` | Query | Get comprehensive stats |
| `audit_balances()` | Query | Verify accounting integrity |

### Internal Functions (for game integration)

| Function | Description |
|----------|-------------|
| `update_balance(user, is_win, amount)` | Update balance after game result |
| `refresh_canister_balance()` | Manually refresh cached balance |

## 🔧 Configuration

Edit these constants in `mod.rs` to customize:

```rust
/// Maximum percentage of house balance for single bet
pub const MAX_PAYOUT_PERCENTAGE: f64 = 0.10; // 10%

/// Minimum deposit amount
pub const MIN_DEPOSIT: u64 = 10_000_000; // 0.1 ICP

/// Minimum withdrawal amount
pub const MIN_WITHDRAW: u64 = 10_000_000; // 0.1 ICP

/// ICP transfer fee
pub const ICP_TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP
```

## 🏗️ Architecture Decisions

### Why 10% House Limit?
- **Conservative**: Protects house from variance
- **Flexible**: Scales with house balance
- **Simple**: Easy to audit and understand

### Why Hourly Refresh?
- **Cost-effective**: 99% cheaper than frequent refreshes
- **Good enough**: Acceptable staleness for most games
- **Performance**: Fast queries, no gameplay delays

### Trade-offs Accepted
1. **Cache Staleness**: Max payout updates hourly, not on deposits
2. **Race Conditions**: Multiple concurrent bets could exceed 10%
3. **Simplicity over Perfection**: No atomic locks or complex synchronization

## 🔍 Audit Checklist

When auditing this module, focus on:

- [ ] Balance arithmetic (no overflows/underflows)
- [ ] Re-entrancy protection in withdrawals
- [ ] Stable storage persistence
- [ ] Cache refresh mechanism
- [ ] Max payout calculation
- [ ] Transfer error handling
- [ ] Memory management

## 📈 Monitoring

Key metrics to track:
- Total user deposits
- House balance
- Unique depositors
- Cache refresh frequency
- Failed transfers

Use `get_accounting_stats()` for comprehensive monitoring.

## 🐛 Known Limitations

1. **Hourly Staleness**: After deposits/withdrawals, max payout is stale for up to 1 hour
2. **Race Condition**: Concurrent bets could collectively exceed 10% limit
3. **External Transfers**: Direct ICP transfers to canister bypass accounting

These are conscious trade-offs for simplicity and performance.

## 📝 License

This module is open-source and can be freely used in any ICP project.

## 🤝 Contributing

To improve this module:
1. Keep it game-agnostic
2. Maintain the simple architecture
3. Document any new trade-offs
4. Ensure backward compatibility

## 📞 Support

For questions or issues with this module, please refer to the OpenHouse repository.