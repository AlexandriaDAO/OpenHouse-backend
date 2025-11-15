use crate::accounting;
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::StableCell;
use std::cell::RefCell;

// Re-export Memory type from parent
use crate::Memory;

// =============================================================================
// THREAD-LOCAL STORAGE
// =============================================================================

thread_local! {
    // Track last heartbeat refresh to avoid too-frequent updates (volatile)
    static LAST_HEARTBEAT_REFRESH: RefCell<u64> = RefCell::new(0);

    // Track if a heartbeat refresh is in progress to prevent concurrent calls
    static HEARTBEAT_REFRESH_IN_PROGRESS: RefCell<bool> = RefCell::new(false);

    // Stable storage for heartbeat state to persist across upgrades (Memory ID 5)
    // See MEMORY ALLOCATION MAP at top of file for all allocated IDs
    static HEARTBEAT_STATE_CELL: RefCell<StableCell<u64, Memory>> = RefCell::new(
        StableCell::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(5))),
            0_u64
        ).expect("Failed to init heartbeat state cell")
    );
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

// Initialize heartbeat state (called in init())
pub fn init_heartbeat() {
    // Force immediate balance refresh on first heartbeat by resetting last refresh time
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(0).expect("Failed to reset heartbeat state");
    });
}

// Save heartbeat state to stable storage (called in pre_upgrade)
pub fn save_heartbeat_state() {
    let last_refresh = LAST_HEARTBEAT_REFRESH.with(|lr| *lr.borrow());
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(last_refresh).expect("Failed to save heartbeat state");
    });
}

// Restore heartbeat state from stable storage (called in post_upgrade)
pub fn restore_heartbeat_state() {
    let last_heartbeat = HEARTBEAT_STATE_CELL.with(|cell| cell.borrow().get().clone());
    LAST_HEARTBEAT_REFRESH.with(|lr| {
        *lr.borrow_mut() = last_heartbeat;
    });
}

// Heartbeat function - called automatically by IC every ~second
// We use it to refresh balance cache every 30 seconds in background
pub fn heartbeat() {
    const HEARTBEAT_REFRESH_INTERVAL_NS: u64 = 30_000_000_000; // 30 seconds

    // P0-2 fix: Atomically check and set the in-progress flag to prevent race condition
    let should_refresh = HEARTBEAT_REFRESH_IN_PROGRESS.with(|flag| {
        let mut flag_ref = flag.borrow_mut();
        if *flag_ref {
            // Already refreshing, skip this heartbeat
            return false;
        }

        // Get last refresh from stable storage
        let last_refresh = HEARTBEAT_STATE_CELL.with(|cell| cell.borrow().get().clone());
        let now = ic_cdk::api::time();

        // Check if it's time to refresh (30 seconds elapsed)
        if now > last_refresh && (now - last_refresh) >= HEARTBEAT_REFRESH_INTERVAL_NS {
            // Atomically set the flag before proceeding
            *flag_ref = true;
            true
        } else {
            false
        }
    });

    if !should_refresh {
        return;
    }

    // Now we have exclusive access to perform the refresh
    let now = ic_cdk::api::time();

    // Update last refresh timestamp in stable storage (P0 fix: persist across upgrades)
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(now).expect("Failed to update heartbeat state");
    });

    // Also update volatile state for quick access
    LAST_HEARTBEAT_REFRESH.with(|lr| {
        *lr.borrow_mut() = now;
    });

    // P1 fix: Spawn async task with guaranteed flag cleanup
    ic_cdk::spawn(async {
        // Use a struct with Drop to ensure flag is always cleared
        struct FlagGuard;
        impl Drop for FlagGuard {
            fn drop(&mut self) {
                HEARTBEAT_REFRESH_IN_PROGRESS.with(|flag| {
                    *flag.borrow_mut() = false;
                });
            }
        }
        let _guard = FlagGuard;

        ic_cdk::println!("Heartbeat: refreshing balance cache at {}", ic_cdk::api::time());
        accounting::refresh_canister_balance().await;
        // Flag will be cleared when _guard is dropped, even if there's a panic
    });
}
