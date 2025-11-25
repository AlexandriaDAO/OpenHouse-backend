use candid::{CandidType, Deserialize};
use ic_stable_structures::{Storable, storable::Bound};
use std::borrow::Cow;

/// Daily snapshot - stored permanently for historical tracking
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
pub struct DailySnapshot {
    /// Midnight timestamp for this day (nanoseconds)
    pub day_timestamp: u64,
    /// Pool reserve at end of day (in decimals, divide by 1_000_000 for USDT)
    pub pool_reserve_end: u64,
    /// Day's profit/loss - SIGNED to handle negative days (decimals)
    pub daily_pool_profit: i64,
    /// Total wagered that day (decimals)
    pub daily_volume: u64,
}

impl Storable for DailySnapshot {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(self).expect(
            "CRITICAL: Failed to encode DailySnapshot. \
             This should never happen unless there's a bug in candid serialization."
        ))
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<'_, [u8]>) -> Self {
        candid::decode_one(&bytes).expect(
            "CRITICAL: Failed to decode DailySnapshot from stable storage. \
             This indicates storage corruption or an incompatible canister upgrade."
        )
    }

    const BOUND: Bound = Bound::Bounded {
        max_size: 128,
        is_fixed_size: false,
    };
}

/// Accumulator for current day - reset when snapshot is taken
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
pub struct DailyAccumulator {
    /// When this day started (midnight timestamp in nanoseconds)
    pub day_start: u64,
    /// Running total of bets placed today
    pub volume_accumulated: u64,
    /// Pool reserve at the start of this day (for calculating daily profit)
    pub last_pool_reserve: u64,
}

impl Storable for DailyAccumulator {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(self).expect(
            "CRITICAL: Failed to encode DailyAccumulator."
        ))
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<'_, [u8]>) -> Self {
        candid::decode_one(&bytes).expect(
            "CRITICAL: Failed to decode DailyAccumulator from stable storage."
        )
    }

    const BOUND: Bound = Bound::Bounded {
        max_size: 64,
        is_fixed_size: false,
    };
}

/// APY calculation result for queries
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct ApyInfo {
    /// Actual APY based on real profit/loss (can be negative)
    pub actual_apy_percent: f64,
    /// Expected APY based on theoretical 1% house edge
    pub expected_apy_percent: f64,
    /// Number of days used in calculation
    pub days_calculated: u32,
    /// Total volume over the period (decimals)
    pub total_volume: u64,
    /// Total profit over the period (decimals, can be negative)
    pub total_profit: i64,
}

impl Default for ApyInfo {
    fn default() -> Self {
        Self {
            actual_apy_percent: 0.0,
            expected_apy_percent: 0.0,
            days_calculated: 0,
            total_volume: 0,
            total_profit: 0,
        }
    }
}
