# DeFi Accounting Module - AI Assistant Guide

## Purpose
Self-contained, auditable accounting module for ckUSDT-based games using a Liquidity Pool system.

## Core Features
- **Liquidity Pool System**: LP providers stake ckUSDT for shares
- **User Deposits/Withdrawals**: Player fund management with ckUSDT ledger (ICRC-2)
- **LP Deposits/Withdrawals**: Liquidity providers can stake ckUSDT for shares
- **Balance Tracking**: Stable storage persistence across upgrades
- **Bet Limits**: 15% of pool balance max payout per bet (frontend shows 10% for safety margin)

## Architecture Overview

### Why No Guards Needed
Unlike multi-step async operations, our liquidity pool follows the Checks-Effects-Interactions pattern:
1. All validations happen BEFORE transfers
2. State updates are atomic (no await points between critical updates)
3. IC guarantees sequential execution - no race conditions possible

## Integration Points
```rust
// Update pool on win/loss
liquidity_pool::update_pool_on_win(profit);
liquidity_pool::update_pool_on_loss(bet_amount);

// Check before accepting bets
let max = defi_accounting::get_max_allowed_payout();
if potential_payout > max { reject }

// Update player balances after game
defi_accounting::update_balance(player, new_balance)?;
```

## Module Structure
- `mod.rs` - Public interface and exports
- `accounting.rs` - Core user accounting
- `liquidity_pool.rs` - LP system (deposits, withdrawals, share calculations)

## Liquidity Pool System

### Key Functions
- `deposit_liquidity(amount)` - Stake ckUSDT, receive LP shares
- `withdraw_all_liquidity()` - Burn all shares, receive proportional ckUSDT
- `get_pool_stats()` - View pool metrics
- `get_lp_position(principal)` - Check LP shares and value

### Security Features
- **Minimum 1 ckUSDT deposit** - Prevents share manipulation attacks
- **Full withdrawal only** - No partial withdrawals (simplicity)
- **No admin control** - Fully decentralized, no special privileges
- **CEI Pattern** - State changes before transfers prevent reentrancy

## Important Constants
- Min LP deposit: 1 ckUSDT (prevents attacks)
- Min user deposit: 10 ckUSDT (prevents dust)
- Min withdraw: 1 ckUSDT
- Transfer fee: 0.01 ckUSDT (10,000 decimals)
- Max payout: 15% of pool balance (frontend shows 10%)
- Minimum liquidity burned: 1000 shares (first depositor)

## When Modifying
- Keep game-agnostic (no game logic here)
- Maintain stable storage compatibility
- Remember IC's sequential execution model (no guards needed)
- Test with real ckUSDT on mainnet (no local env)
- All state changes must happen BEFORE await points