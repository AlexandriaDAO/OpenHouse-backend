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

        // Check if new day started - need to snapshot previous day
        let ending_reserve = if current.day_start != current_day_start && current.day_start > 0 {
            // New day - take snapshot of previous day first
            // Returns the ending reserve to use as next day's starting reserve
            take_snapshot_internal(&current)
        } else {
            None
        };

        // Reset accumulator if new day OR first ever bet
        let mut new_acc = if current.day_start != current_day_start {
            // CONSISTENCY FIX: Use the snapshot's ending reserve as the new day's starting reserve
            // This ensures continuity even if concurrent transactions occur
            let starting_reserve = ending_reserve.unwrap_or_else(liquidity_pool::get_pool_reserve);
            DailyAccumulator {
                day_start: current_day_start,
                volume_accumulated: 0,
                last_pool_reserve: starting_reserve,
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
/// Returns Some(ending_reserve) if snapshot was taken, None if duplicate (already exists for this day)
fn take_snapshot_internal(acc: &DailyAccumulator) -> Option<u64> {
    // RACE CONDITION FIX: Check if we already have a snapshot for this day
    // This prevents duplicate snapshots when multiple bets arrive at day boundary
    let existing_reserve = DAILY_SNAPSHOTS.with(|snapshots| {
        let snapshots = snapshots.borrow();
        let len = snapshots.len();
        if len == 0 {
            return None;
        }
        // Check if last snapshot is for the same day - return its reserve if so
        snapshots.get(len - 1)
            .filter(|last| last.day_timestamp == acc.day_start)
            .map(|last| last.pool_reserve_end)
    });

    if let Some(reserve) = existing_reserve {
        ic_cdk::println!(
            "Snapshot already exists for day={}, skipping duplicate",
            acc.day_start
        );
        // Return the existing snapshot's reserve for consistency
        return Some(reserve);
    }

    let current_reserve = liquidity_pool::get_pool_reserve();
    let share_price = liquidity_pool::get_share_price();

    // Calculate profit (can be negative if house lost)
    let daily_profit = (current_reserve as i64) - (acc.last_pool_reserve as i64);

    let snapshot = DailySnapshot {
        day_timestamp: acc.day_start,
        pool_reserve_end: current_reserve,
        daily_pool_profit: daily_profit,
        daily_volume: acc.volume_accumulated,
        share_price,
    };

    DAILY_SNAPSHOTS.with(|snapshots| {
        snapshots.borrow_mut().push(&snapshot);
    });

    ic_cdk::println!(
        "Daily snapshot taken: day={}, reserve={}, profit={}, volume={}, share_price={}",
        acc.day_start, current_reserve, daily_profit, acc.volume_accumulated, share_price
    );

    Some(current_reserve)
}

/// Manual snapshot trigger (for timer backup on quiet days)
pub fn take_daily_snapshot() {
    let now = ic_cdk::api::time();

    DAILY_ACCUMULATOR.with(|acc| {
        let current = acc.borrow().get().clone();

        // Only snapshot if we have data from a previous day
        if current.day_start > 0 && current.day_start != get_day_start(now) {
            // Take snapshot and get ending reserve for consistency
            let ending_reserve = take_snapshot_internal(&current);

            // Reset for new day using snapshot's ending reserve
            let starting_reserve = ending_reserve.unwrap_or_else(liquidity_pool::get_pool_reserve);
            let new_acc = DailyAccumulator {
                day_start: get_day_start(now),
                volume_accumulated: 0,
                last_pool_reserve: starting_reserve,
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
