use crate::types::{RandomnessSeed, MAX_NUMBER};
use crate::defi_accounting::memory_ids::{SEED_STATE_MEMORY_ID, NONCE_COUNTER_MEMORY_ID};
use ic_cdk::management_canister::raw_rand;
use ic_stable_structures::memory_manager::MemoryId;
use ic_stable_structures::StableCell;
use sha2::{Digest, Sha256};
use std::cell::RefCell;

// Re-export Memory type from parent
use crate::Memory;

// =============================================================================
// CONSTANTS
// =============================================================================

pub const SEED_ROTATION_INTERVAL_NS: u64 = 300_000_000_000; // 5 minutes in nanoseconds
pub const MAX_GAMES_PER_SEED: u64 = 10_000; // Rotate after 10k games

// =============================================================================
// THREAD-LOCAL STORAGE
// =============================================================================

thread_local! {
    static SEED_STATE: RefCell<Option<RandomnessSeed>> = const { RefCell::new(None) };
    static SEED_INIT_LOCK: RefCell<bool> = const { RefCell::new(false) };

    // Stable cells for persistence
    static SEED_CELL: RefCell<StableCell<RandomnessSeed, Memory>> = RefCell::new(
        StableCell::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(SEED_STATE_MEMORY_ID))),
            RandomnessSeed::default()
        )
    );

    static LAST_ROTATION_CELL: RefCell<StableCell<u64, Memory>> = RefCell::new(
        StableCell::init(
            crate::MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(NONCE_COUNTER_MEMORY_ID))),
            0u64
        )
    );
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

// Initialize the seed with VRF randomness (with lock to prevent race conditions)
pub async fn initialize_seed() {
    // Check if already initializing
    let is_locked = SEED_INIT_LOCK.with(|lock| *lock.borrow());
    if is_locked {
        return; // Already initializing, skip
    }

    // Set lock
    SEED_INIT_LOCK.with(|lock| {
        *lock.borrow_mut() = true;
    });

    // Double-check seed state after acquiring lock
    let already_initialized = SEED_STATE.with(|s| s.borrow().is_some());
    if already_initialized {
        SEED_INIT_LOCK.with(|lock| {
            *lock.borrow_mut() = false;
        });
        return;
    }

    let random_bytes = match raw_rand().await {
        Ok(bytes) => bytes,
        Err(_) => {
            // Improved fallback: combine timestamp with caller principal
            let time = ic_cdk::api::time();
            let caller = ic_cdk::api::msg_caller();
            let mut hasher = Sha256::new();
            hasher.update(time.to_be_bytes());
            hasher.update(caller.as_slice());
            hasher.finalize().to_vec()
        }
    };

    let mut hasher = Sha256::new();
    hasher.update(&random_bytes);
    let seed_array: [u8; 32] = hasher.finalize()[0..32].try_into().unwrap();

    let now = ic_cdk::api::time();
    let new_seed = RandomnessSeed {
        current_seed: seed_array,
        creation_time: now,
        games_used: 0,
        max_games: MAX_GAMES_PER_SEED,
        nonce: 0,
    };

    // Save to volatile state
    SEED_STATE.with(|s| {
        *s.borrow_mut() = Some(new_seed.clone());
    });

    // Persist to stable cell
    SEED_CELL.with(|cell| {
        cell.borrow_mut().set(new_seed);
    });

    // Update last rotation timestamp
    LAST_ROTATION_CELL.with(|cell| {
        cell.borrow_mut().set(now);
    });

    // Release lock
    SEED_INIT_LOCK.with(|lock| {
        *lock.borrow_mut() = false;
    });
}

// Restore seed state from stable storage (called in post_upgrade)
pub fn restore_seed_state() {
    // Restore seed state from stable cell
    let seed = SEED_CELL.with(|cell| cell.borrow().get().clone());

    // Only restore if seed was actually initialized (not default)
    if seed.creation_time > 0 {
        SEED_STATE.with(|s| {
            *s.borrow_mut() = Some(seed);
        });
    }
}

// Generate instant random number using seed+nonce+client_seed (0-100)
// Returns: (rolled_number, nonce, server_seed_hash)
pub fn generate_dice_roll_instant(client_seed: &str) -> Result<(u8, u64, String), String> {
    // Get current seed state and compute hash
    let (server_seed, nonce, server_seed_hash) = SEED_STATE.with(|s| {
        let mut state = s.borrow_mut();
        let seed_state = state.as_mut().ok_or(
            "Randomness seed initializing, please retry in a moment"
        )?;

        // Increment nonce for this game
        seed_state.nonce += 1;
        seed_state.games_used += 1;

        // Compute server seed hash for verification
        let mut seed_hasher = Sha256::new();
        seed_hasher.update(seed_state.current_seed);
        let seed_hash = format!("{:x}", seed_hasher.finalize());

        // Update stable cell with new state
        SEED_CELL.with(|cell| {
            let _ = cell.borrow_mut().set(seed_state.clone());
        });

        Ok::<_, String>((seed_state.current_seed, seed_state.nonce, seed_hash))
    })?;

    // Combine server seed + client seed + nonce for unique result
    let mut hasher = Sha256::new();
    hasher.update(server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    let hash = hasher.finalize();

    // Convert to 0-100 range
    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    let roll = (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8;
    Ok((roll, nonce, server_seed_hash))
}

// Check if seed needs rotation and schedule if necessary
pub fn maybe_schedule_seed_rotation() {
    let needs_init = SEED_STATE.with(|s| s.borrow().is_none());

    if needs_init {
        // Initialize seed on first game
        ic_cdk::futures::spawn(async {
            initialize_seed().await;
        });
        return;
    }

    let should_rotate = SEED_STATE.with(|s| {
        let state = s.borrow();
        if let Some(seed_state) = state.as_ref() {
            let now = ic_cdk::api::time();
            let time_elapsed = now - seed_state.creation_time;

            // Rotate if: too many games OR too much time
            seed_state.games_used >= seed_state.max_games ||
            time_elapsed >= SEED_ROTATION_INTERVAL_NS
        } else {
            false
        }
    });

    if should_rotate {
        // Schedule async rotation (non-blocking)
        ic_cdk::futures::spawn(async {
            rotate_seed_async().await;
        });
    }
}

// Rotate the seed asynchronously
pub async fn rotate_seed_async() {
    // Check if we already rotated recently (prevent double rotation)
    let last_rotation = LAST_ROTATION_CELL.with(|cell| *cell.borrow().get());
    let now = ic_cdk::api::time();

    if now - last_rotation < 10_000_000_000 { // 10 seconds minimum between rotations
        return;
    }

    // Get new VRF seed
    if let Ok(random_bytes) = raw_rand().await {
        let mut hasher = Sha256::new();
        hasher.update(&random_bytes);
        let seed_array: [u8; 32] = hasher.finalize()[0..32].try_into().unwrap();

        let new_seed = RandomnessSeed {
            current_seed: seed_array,
            creation_time: now,
            games_used: 0,
            max_games: MAX_GAMES_PER_SEED,
            nonce: 0,
        };

        // Update volatile state
        SEED_STATE.with(|s| {
            *s.borrow_mut() = Some(new_seed.clone());
        });

        // Persist to stable cells
        SEED_CELL.with(|cell| {
            let _ = cell.borrow_mut().set(new_seed);
        });

        LAST_ROTATION_CELL.with(|cell| {
            let _ = cell.borrow_mut().set(now);
        });

        ic_cdk::println!("Seed rotated successfully at {}", now);
    }
}

// Get current seed hash for provable fairness
pub fn get_current_seed_hash() -> String {
    SEED_STATE.with(|s| {
        s.borrow().as_ref().map(|seed_state| {
            let mut hasher = Sha256::new();
            hasher.update(seed_state.current_seed);
            format!("{:x}", hasher.finalize())
        }).unwrap_or_else(|| "No seed initialized".to_string())
    })
}

// Verify game result for provable fairness
pub fn verify_game_result(
    server_seed: [u8; 32],
    client_seed: String,
    nonce: u64,
    expected_roll: u8
) -> Result<bool, String> {
    // Reconstruct the hash
    let mut hasher = Sha256::new();
    hasher.update(server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    let hash = hasher.finalize();

    // Calculate the roll
    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    let calculated_roll = (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8;

    Ok(calculated_roll == expected_roll)
}

// Get seed information
pub fn get_seed_info() -> (String, u64, u64) {
    SEED_STATE.with(|s| {
        s.borrow().as_ref().map(|seed_state| {
            let hash = {
                let mut hasher = Sha256::new();
                hasher.update(seed_state.current_seed);
                format!("{:x}", hasher.finalize())
            };
            (hash, seed_state.games_used, seed_state.creation_time)
        }).unwrap_or(("Not initialized".to_string(), 0, 0))
    })
}
