use std::time::Duration;
use super::storage::{DAILY_SNAPSHOTS, DAILY_ACCUMULATOR};
use super::types::{DailySnapshot, DailyAccumulator};
use crate::defi_accounting::liquidity_pool;

/// Nanoseconds per day (24 * 60 * 60 * 1e9)
const NANOS_PER_DAY: u64 = 86_400_000_000_000;

/// Record bet volume - called by game logic after each bet
///
/// This function is game-agnostic: any game just reports the bet amount.
/// Snapshots are automatically taken when a new day starts.
pub fn record_bet_volume(amount: u64) {
    let now = ic_cdk::api::time();
    let current_day_start = get_day_start(now);

    DAILY_ACCUMULATOR.with(|acc| {
        let current = acc.borrow().get().clone();

        // Check if new day started
        if current.day_start != current_day_start && current.day_start > 0 {
            // New day - take snapshot of previous day first
            take_snapshot_internal(&current);
        }

        // Reset accumulator if new day OR first ever bet
        let mut new_acc = if current.day_start != current_day_start {
            DailyAccumulator {
                day_start: current_day_start,
                volume_accumulated: 0,
                last_pool_reserve: liquidity_pool::get_pool_reserve(),
            }
        } else {
            current
        };

        // Accumulate volume (saturating to prevent overflow)
        new_acc.volume_accumulated = new_acc.volume_accumulated.saturating_add(amount);

        acc.borrow_mut().set(new_acc);
    });
}

/// Take snapshot of the accumulated day's data
/// Returns true if snapshot was taken, false if duplicate (already exists for this day)
fn take_snapshot_internal(acc: &DailyAccumulator) -> bool {
    // RACE CONDITION FIX: Check if we already have a snapshot for this day
    // This prevents duplicate snapshots when multiple bets arrive at day boundary
    let already_exists = DAILY_SNAPSHOTS.with(|snapshots| {
        let snapshots = snapshots.borrow();
        let len = snapshots.len();
        if len == 0 {
            return false;
        }
        // Check if last snapshot is for the same day
        snapshots.get(len - 1)
            .map(|last| last.day_timestamp == acc.day_start)
            .unwrap_or(false)
    });

    if already_exists {
        ic_cdk::println!(
            "Snapshot already exists for day={}, skipping duplicate",
            acc.day_start
        );
        return false;
    }

    let current_reserve = liquidity_pool::get_pool_reserve();

    // Calculate profit (can be negative if house lost)
    let daily_profit = (current_reserve as i64) - (acc.last_pool_reserve as i64);

    let snapshot = DailySnapshot {
        day_timestamp: acc.day_start,
        pool_reserve_end: current_reserve,
        daily_pool_profit: daily_profit,
        daily_volume: acc.volume_accumulated,
    };

    DAILY_SNAPSHOTS.with(|snapshots| {
        snapshots.borrow_mut().push(&snapshot);
    });

    ic_cdk::println!(
        "Daily snapshot taken: day={}, reserve={}, profit={}, volume={}",
        acc.day_start, current_reserve, daily_profit, acc.volume_accumulated
    );

    true
}

/// Manual snapshot trigger (for timer backup on quiet days)
pub fn take_daily_snapshot() {
    let now = ic_cdk::api::time();

    DAILY_ACCUMULATOR.with(|acc| {
        let current = acc.borrow().get().clone();

        // Only snapshot if we have data from a previous day
        if current.day_start > 0 && current.day_start != get_day_start(now) {
            take_snapshot_internal(&current);

            // Reset for new day
            let new_acc = DailyAccumulator {
                day_start: get_day_start(now),
                volume_accumulated: 0,
                last_pool_reserve: liquidity_pool::get_pool_reserve(),
            };
            acc.borrow_mut().set(new_acc);
        }
    });
}

/// Start backup timer (runs daily in case no bets trigger snapshot)
/// This ensures we get a snapshot even on days with no activity
pub fn start_stats_timer() {
    ic_cdk_timers::set_timer_interval(Duration::from_secs(86_400), || async {
        take_daily_snapshot();
    });
}

/// Get the start of day timestamp (midnight) for a given nanosecond timestamp
fn get_day_start(nanos: u64) -> u64 {
    (nanos / NANOS_PER_DAY) * NANOS_PER_DAY
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_day_start() {
        // Test that timestamps within the same day return the same day_start
        let ts1 = 1735689600_000_000_000u64; // Some timestamp
        let ts2 = ts1 + 3600_000_000_000; // 1 hour later

        assert_eq!(get_day_start(ts1), get_day_start(ts2));
    }

    #[test]
    fn test_get_day_start_different_days() {
        let ts1 = 1735689600_000_000_000u64;
        let ts2 = ts1 + NANOS_PER_DAY; // Next day

        assert_ne!(get_day_start(ts1), get_day_start(ts2));
    }
}
