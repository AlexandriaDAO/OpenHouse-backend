use super::storage::DAILY_SNAPSHOTS;
use super::types::{DailySnapshot, ApyInfo};

/// Get recent snapshots (for graphing)
/// Returns the most recent `limit` snapshots in chronological order
pub fn get_daily_snapshots(limit: u32) -> Vec<DailySnapshot> {
    DAILY_SNAPSHOTS.with(|snapshots| {
        let snapshots = snapshots.borrow();
        let len = snapshots.len();
        let start = len.saturating_sub(limit as u64);
        (start..len).filter_map(|i| snapshots.get(i)).collect()
    })
}

/// Get snapshots in a date range
/// Both timestamps are inclusive (nanoseconds)
///
/// PERFORMANCE: Uses early termination since snapshots are stored chronologically.
/// Stops scanning once past end_ts instead of scanning entire history.
pub fn get_snapshots_range(start_ts: u64, end_ts: u64) -> Vec<DailySnapshot> {
    DAILY_SNAPSHOTS.with(|snapshots| {
        let snapshots = snapshots.borrow();
        let mut result = Vec::new();

        for i in 0..snapshots.len() {
            if let Some(snap) = snapshots.get(i) {
                // Early termination: snapshots are chronological, stop if past end
                if snap.day_timestamp > end_ts {
                    break;
                }
                if snap.day_timestamp >= start_ts {
                    result.push(snap);
                }
            }
        }

        result
    })
}

/// Get total snapshot count
pub fn get_snapshot_count() -> u64 {
    DAILY_SNAPSHOTS.with(|s| s.borrow().len())
}

/// Maximum days allowed for APY calculation (prevents excessive computation)
const MAX_APY_DAYS: u32 = 365;

/// Calculate APY over last N days (default 7, max 365)
///
/// Returns both actual APY (from real results) and expected APY (theoretical 1% edge)
///
/// # APY Calculation
///
/// **Actual APY** (from real profit/loss):
/// ```text
/// period_profit = sum(daily_pool_profit for last N days)
/// actual_apy = (period_profit / starting_reserve) * (365 / days) * 100
/// ```
///
/// **Expected APY** (theoretical 1% house edge):
/// ```text
/// period_volume = sum(daily_volume for last N days)
/// expected_profit = period_volume * 0.01
/// expected_apy = (expected_profit / starting_reserve) * (365 / days) * 100
/// ```
///
/// # Parameters
/// - `days`: Number of days to calculate APY over (1-365, default 7)
///   Values above 365 are capped to prevent excessive computation.
pub fn get_apy_info(days: Option<u32>) -> ApyInfo {
    // Cap at MAX_APY_DAYS to prevent excessive computation
    let days = days.unwrap_or(7).clamp(1, MAX_APY_DAYS) as u64;

    DAILY_SNAPSHOTS.with(|snapshots| {
        let snapshots = snapshots.borrow();
        let len = snapshots.len();

        if len == 0 {
            return ApyInfo::default();
        }

        // Use min(days, available) snapshots
        let use_days = days.min(len);
        let start_idx = len - use_days;

        // Sum profit and volume over period
        let mut total_profit: i64 = 0;
        let mut total_volume: u64 = 0;

        for i in start_idx..len {
            if let Some(snap) = snapshots.get(i) {
                total_profit = total_profit.saturating_add(snap.daily_pool_profit);
                total_volume = total_volume.saturating_add(snap.daily_volume);
            }
        }

        // Get starting pool reserve (from day before the period starts)
        let start_reserve = if start_idx > 0 {
            // Use the pool_reserve_end from the day before our period
            snapshots.get(start_idx - 1).map_or(0, |s| s.pool_reserve_end)
        } else {
            // For the first snapshot(s), estimate starting reserve
            // by subtracting the first day's profit from the first day's ending reserve
            snapshots.get(0).map_or(0, |s| {
                // If profit is positive, starting reserve was lower
                // If profit is negative, starting reserve was higher
                let end_reserve = s.pool_reserve_end as i64;
                let start = end_reserve - s.daily_pool_profit;
                start.max(0) as u64
            })
        };

        if start_reserve == 0 {
            return ApyInfo {
                actual_apy_percent: 0.0,
                expected_apy_percent: 0.0,
                days_calculated: use_days as u32,
                total_volume,
                total_profit,
            };
        }

        // Calculate APYs (annualized)
        let days_f = use_days as f64;
        let reserve_f = start_reserve as f64;

        // Actual APY from real profit (can be negative)
        let actual_apy = (total_profit as f64 / reserve_f) * (365.0 / days_f) * 100.0;

        // Expected APY from theoretical 1% edge
        let expected_profit = total_volume as f64 * 0.01;
        let expected_apy = (expected_profit / reserve_f) * (365.0 / days_f) * 100.0;

        ApyInfo {
            actual_apy_percent: actual_apy,
            expected_apy_percent: expected_apy,
            days_calculated: use_days as u32,
            total_volume,
            total_profit,
        }
    })
}
