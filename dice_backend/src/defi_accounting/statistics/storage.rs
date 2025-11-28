use ic_stable_structures::{StableVec, StableCell, memory_manager::MemoryId};
use std::cell::RefCell;
use crate::{MEMORY_MANAGER, Memory};
use crate::defi_accounting::memory_ids::{SNAPSHOTS_MEMORY_ID, ACCUMULATOR_MEMORY_ID};
use super::types::{DailySnapshot, DailyAccumulator};

thread_local! {
    /// Historical daily snapshots - append-only, never deleted
    pub static DAILY_SNAPSHOTS: RefCell<StableVec<DailySnapshot, Memory>> = RefCell::new(
        StableVec::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(SNAPSHOTS_MEMORY_ID)))
        )
    );

    /// Current day accumulator - reset when snapshot is taken
    pub static DAILY_ACCUMULATOR: RefCell<StableCell<DailyAccumulator, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(ACCUMULATOR_MEMORY_ID))),
            DailyAccumulator::default()
        )
    );
}
