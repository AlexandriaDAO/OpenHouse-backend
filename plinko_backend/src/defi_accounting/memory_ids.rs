//! Central registry for stable memory IDs.
//!
//! IMPORTANT: All memory IDs must be unique across the entire canister.
//! Run `cargo test` to verify no collisions exist.
//!
//! Allocation strategy:
//! - 0-9: Core game state (seed, nonce)
//! - 10-19: User accounting (balances, LP shares, pool state)
//! - 20-29: Withdrawal & audit (pending, audit log)
//! - 30-39: Statistics (snapshots, accumulator)

// Core game state (0-9)
// DEPRECATED/RETIRED: 1 (Seed State), 2 (Nonce Counter) - Moved to per-game VRF (no persistence)

// User accounting (10-19)
pub const USER_BALANCES_MEMORY_ID: u8 = 10;
pub const LP_SHARES_MEMORY_ID: u8 = 11;
pub const POOL_STATE_MEMORY_ID: u8 = 13;

// Withdrawals & audit (20-29)
pub const PENDING_WITHDRAWALS_MEMORY_ID: u8 = 20;
pub const AUDIT_LOG_MAP_MEMORY_ID: u8 = 24;
pub const AUDIT_LOG_COUNTER_MEMORY_ID: u8 = 25;

// Statistics (30-39)
pub const SNAPSHOTS_MEMORY_ID: u8 = 30;
pub const ACCUMULATOR_MEMORY_ID: u8 = 31;

// ABANDONED (corrupted, do not reuse): 22, 23

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_ids_are_unique() {
        let ids = [
            USER_BALANCES_MEMORY_ID,
            LP_SHARES_MEMORY_ID,
            POOL_STATE_MEMORY_ID,
            PENDING_WITHDRAWALS_MEMORY_ID,
            AUDIT_LOG_MAP_MEMORY_ID,
            AUDIT_LOG_COUNTER_MEMORY_ID,
            SNAPSHOTS_MEMORY_ID,
            ACCUMULATOR_MEMORY_ID,
        ];

        let mut sorted = ids;
        sorted.sort();
        for i in 1..sorted.len() {
            assert_ne!(
                sorted[i - 1],
                sorted[i],
                "Duplicate memory ID found: {}",
                sorted[i]
            );
        }
    }
}
