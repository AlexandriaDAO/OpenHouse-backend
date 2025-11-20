pub mod accounting;
pub mod guard;
pub mod liquidity_pool;
pub mod query;
pub mod types;

// Re-export types and update functions from original modules
pub use accounting::{
    deposit,
    withdraw_all,
    refresh_canister_balance,
    update_balance,
    AccountingStats,
};

pub use liquidity_pool::{
    deposit_liquidity,
    withdraw_all_liquidity,
    can_accept_bets,
    LPPosition,
    PoolStats,
};

// Re-export query functions from query module
pub use query::{
    get_balance,
    get_my_balance,
    get_house_balance,
    get_max_allowed_payout,
    get_accounting_stats,
    audit_balances,
    get_lp_position,
    get_pool_stats,
};
