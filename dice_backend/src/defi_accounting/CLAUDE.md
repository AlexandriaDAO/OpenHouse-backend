# DeFi Accounting Module - AI Assistant Guide

## Purpose
Self-contained, auditable accounting module for ICP-based games. Handles all cryptocurrency operations.

## Core Features
- **Deposits/Withdrawals**: User fund management with ICP ledger
- **Balance Tracking**: Stable storage persistence across upgrades
- **Bet Limits**: 10% of house balance max payout per bet
- **Cost Efficient**: Hourly cache refresh (~$0.27/month)

## Key Design Decisions
- **Cache staleness accepted**: Performance > perfect accuracy
- **Race conditions accepted**: Simplicity > perfect atomicity
- **10% limit**: Conservative but allows reasonable bets
- **StableBTreeMap**: Auto-persists, no manual save/restore needed

## Integration Points
```rust
// Check before accepting bets
let max = defi_accounting::get_max_allowed_payout();
if potential_payout > max { reject }

// Update after game results
defi_accounting::update_balance(player, is_win, amount)?;
```

## Module Structure
- `mod.rs` - Public interface
- `accounting.rs` - Core logic (ICP transfers, balances)
- `heartbeat.rs` - Hourly cache refresh

## Important Constants
- Min deposit/withdraw: 0.1 ICP
- Transfer fee: 0.0001 ICP
- Max payout: 10% of house
- Refresh interval: 1 hour

## When Modifying
- Keep game-agnostic (no game logic here)
- Maintain stable storage compatibility
- Document any new trade-offs
- Test with real ICP on mainnet (no local env)