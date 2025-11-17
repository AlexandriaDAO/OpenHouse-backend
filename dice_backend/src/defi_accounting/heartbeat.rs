// =============================================================================
// DEFI ACCOUNTING HEARTBEAT MODULE
// =============================================================================
// This module handles periodic refresh of the cached canister balance.
// It's designed to be game-agnostic and can be used in any ICP-based game.

use super::accounting;
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::StableCell;
use std::cell::RefCell;
use crate::{Memory, MEMORY_MANAGER};

// =============================================================================
// CONFIGURATION
// =============================================================================

/// How often to refresh the cached balance (1 hour = 3600 seconds)
/// This balances cost (~$0.27/month) vs freshness
pub const HEARTBEAT_REFRESH_INTERVAL_NS: u64 = 3_600_000_000_000; // 1 hour in nanoseconds

/// Memory ID for heartbeat state persistence
pub const HEARTBEAT_MEMORY_ID: u8 = 5;

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

thread_local! {
    /// Track last heartbeat refresh to avoid too-frequent updates (volatile)
    static LAST_HEARTBEAT_REFRESH: RefCell<u64> = RefCell::new(0);

    /// Track if a heartbeat refresh is in progress to prevent concurrent calls
    static HEARTBEAT_REFRESH_IN_PROGRESS: RefCell<bool> = RefCell::new(false);

    /// Stable storage for heartbeat state to persist across upgrades
    static HEARTBEAT_STATE_CELL: RefCell<StableCell<u64, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(HEARTBEAT_MEMORY_ID))),
            0_u64
        ).expect("Failed to init heartbeat state cell")
    );
}

// =============================================================================
// PUBLIC API
// =============================================================================

/// Initialize heartbeat state (call in canister init)
pub fn init_heartbeat() {
    // Force immediate balance refresh on first heartbeat by resetting last refresh time
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(0).expect("Failed to reset heartbeat state");
    });
}

/// Save heartbeat state to stable storage (call in pre_upgrade)
pub fn save_heartbeat_state() {
    let last_refresh = LAST_HEARTBEAT_REFRESH.with(|lr| *lr.borrow());
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(last_refresh).expect("Failed to save heartbeat state");
    });
}

/// Restore heartbeat state from stable storage (call in post_upgrade)
pub fn restore_heartbeat_state() {
    let last_heartbeat = HEARTBEAT_STATE_CELL.with(|cell| cell.borrow().get().clone());
    LAST_HEARTBEAT_REFRESH.with(|lr| {
        *lr.borrow_mut() = last_heartbeat;
    });
}

/// Main heartbeat function - called automatically by IC every ~1 second
/// Refreshes the cached balance every hour to save on cycles
pub fn heartbeat() {
    // Atomically check and set the in-progress flag to prevent race condition
    let should_refresh = HEARTBEAT_REFRESH_IN_PROGRESS.with(|flag| {
        let mut flag_ref = flag.borrow_mut();
        if *flag_ref {
            // Already refreshing, skip this heartbeat
            return false;
        }

        // Get last refresh from stable storage
        let last_refresh = HEARTBEAT_STATE_CELL.with(|cell| cell.borrow().get().clone());
        let now = ic_cdk::api::time();

        // Check if it's time to refresh (1 hour elapsed)
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

    // Update last refresh timestamp in stable storage (persists across upgrades)
    HEARTBEAT_STATE_CELL.with(|cell| {
        cell.borrow_mut().set(now).expect("Failed to update heartbeat state");
    });

    // Also update volatile state for quick access
    LAST_HEARTBEAT_REFRESH.with(|lr| {
        *lr.borrow_mut() = now;
    });

    // Spawn async task with guaranteed flag cleanup
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

        ic_cdk::println!("DeFi Accounting: refreshing balance cache at {}", ic_cdk::api::time());
        accounting::refresh_canister_balance().await;
        // Flag will be cleared when _guard is dropped, even if there's a panic
    });
}