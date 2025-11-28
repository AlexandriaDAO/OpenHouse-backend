pub mod accounting;
pub mod liquidity_pool;
pub mod memory_ids;
pub mod query;
pub mod statistics;
pub mod types;

// Re-export types and update functions from original modules
pub use accounting::update_balance;

// Re-export query functions from query module
pub use query::{
    get_balance,
    get_max_allowed_payout,
};

// Re-export statistics functions for daily volume and APY tracking
pub use statistics::{
    record_bet_volume,
    get_daily_snapshots,
    get_snapshots_range,
    get_snapshot_count,
    get_apy_info,
    start_stats_timer,
    DailySnapshot,
    ApyInfo,
};

#[cfg(test)]
mod tests;
