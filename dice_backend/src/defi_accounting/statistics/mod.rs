//! Daily Statistics Module for defi_accounting
//!
//! This module provides game-agnostic daily statistics tracking for volume and APY graphs.
//! It is completely isolated from critical defi logic (accounting.rs, liquidity_pool.rs).
//!
//! ## Usage
//!
//! Games should call `record_bet_volume(amount)` after each bet is placed.
//! Snapshots are automatically taken when a new day starts or via the backup timer.
//!
//! ## Storage
//!
//! - Uses StableVec for historical snapshots (unlimited retention)
//! - Uses StableCell for current day accumulator
//! - Memory IDs: 22 (snapshots), 23 (accumulator)
//!
//! ## APY Calculations
//!
//! - **Actual APY**: Based on real profit/loss (can be negative)
//! - **Expected APY**: Based on theoretical 1% house edge

mod types;
mod storage;
mod collector;
mod queries;

pub use types::{DailySnapshot, ApyInfo};
pub use collector::{record_bet_volume, start_stats_timer};
pub use queries::{get_daily_snapshots, get_snapshots_range, get_snapshot_count, get_apy_info};
