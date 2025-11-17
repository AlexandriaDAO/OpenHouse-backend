// =============================================================================
// DEFI ACCOUNTING MODULE
// =============================================================================
// A self-contained, auditable accounting module for ICP-based games.
// This module handles all DeFi-related functionality including deposits,
// withdrawals, balance tracking, and bet limit calculations.
//
// FEATURES:
// - User deposit/withdrawal management
// - Balance tracking with stable storage
// - House balance calculation
// - Dynamic bet limits (10% of house balance)
// - Hourly cache refresh for cost efficiency
// - Game-agnostic design for easy reuse
//
// SECURITY:
// - All balances stored in stable memory
// - Re-entrancy protection on withdrawals
// - Self-limiting damage (max loss = house balance)
// - Transparent 10% house limit
//
// COST:
// - ~$0.27/month for hourly balance refresh (99% savings vs 30s refresh)
// - Fast queries using cached values
// - No expensive ledger calls during gameplay

pub mod accounting;
pub mod heartbeat;

// Re-export the main public interface
pub use accounting::{
    // Core functions
    deposit,
    withdraw,
    withdraw_all,
    get_balance,
    get_my_balance,
    get_house_balance,
    get_max_allowed_payout,
    get_accounting_stats,
    audit_balances,

    // Internal functions (for game integration)
    update_balance,
    refresh_canister_balance,

    // Types
    Account,
    AccountingStats,
};

pub use heartbeat::{
    init_heartbeat,
    save_heartbeat_state,
    restore_heartbeat_state,
    heartbeat,
};

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================
// Configuration constants are defined in accounting.rs
// MAX_PAYOUT_PERCENTAGE = 10% of house balance
// MIN_DEPOSIT = 0.1 ICP
// MIN_WITHDRAW = 0.1 ICP
// ICP_TRANSFER_FEE = 0.0001 ICP

// =============================================================================
// INTEGRATION GUIDE
// =============================================================================
//
// To integrate this module into your game:
//
// 1. Copy the entire defi_accounting folder to your game's src/
//
// 2. In your lib.rs, add:
//    ```
//    mod defi_accounting;
//    use defi_accounting as accounting;
//    ```
//
// 3. In your init() function:
//    ```
//    accounting::init_heartbeat();
//    ```
//
// 4. In your pre_upgrade():
//    ```
//    accounting::save_heartbeat_state();
//    ```
//
// 5. In your post_upgrade():
//    ```
//    accounting::restore_heartbeat_state();
//    accounting::init_heartbeat();
//    ```
//
// 6. Export the heartbeat:
//    ```
//    #[heartbeat]
//    fn heartbeat() {
//        accounting::heartbeat();
//    }
//    ```
//
// 7. In your game logic, check max bets:
//    ```
//    let max_allowed = accounting::get_max_allowed_payout();
//    if potential_payout > max_allowed {
//        return Err("Exceeds house limit");
//    }
//    ```
//
// 8. Update balances after game results:
//    ```
//    if player_won {
//        accounting::update_balance(player, true, payout)?;
//    } else {
//        accounting::update_balance(player, false, bet_amount)?;
//    }
//    ```