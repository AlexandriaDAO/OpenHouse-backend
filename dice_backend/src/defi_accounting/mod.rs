// Module exports

pub mod accounting;
pub mod nat_helpers;
pub mod liquidity_pool;

// Re-export main functions
pub use accounting::{
    deposit,
    withdraw,
    withdraw_all,
    get_balance,
    get_my_balance,
    get_house_balance,
    get_legacy_house_balance,
    get_house_mode,
    get_max_allowed_payout,
    get_accounting_stats,
    audit_balances,
    refresh_canister_balance,
    transfer_to_user,
    update_balance,
    get_canister_balance,
    get_total_user_deposits,
    AccountingStats,
    Account,
};

pub use liquidity_pool::{
    initialize_pool_from_house,
    deposit_liquidity,
    withdraw_liquidity,
    withdraw_all_liquidity,
    get_lp_position,
    get_pool_stats,
    can_accept_bets,
    update_pool_on_win,
    update_pool_on_loss,
    LPPosition,
    PoolStats,
};

// REMOVE timer initialization - no longer needed
