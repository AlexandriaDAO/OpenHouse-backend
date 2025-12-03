use ic_cdk::management_canister::raw_rand;
use sha2::{Digest, Sha256};
use crate::types::MAX_NUMBER;

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/// Generate dice roll using per-game VRF
/// Returns: (rolled_number, server_seed, nonce) for verification
pub async fn generate_dice_roll_vrf(client_seed: &str) -> Result<(u8, [u8; 32], u64), String> {
    // Get fresh VRF randomness (async call to IC consensus)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("VRF unavailable: {:?}. Please retry.", e))?;

    // Use first 32 bytes as server seed
    let server_seed: [u8; 32] = random_bytes[0..32]
        .try_into()
        .map_err(|_| "Insufficient randomness")?;

    // Generate unique nonce from timestamp
    let nonce = ic_cdk::api::time();

    // Combine server_seed + client_seed + nonce
    let mut hasher = Sha256::new();
    hasher.update(server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    let hash = hasher.finalize();

    // Convert to 0-100 range
    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    let roll = (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8;

    Ok((roll, server_seed, nonce))
}

/// Verify game result for provable fairness
/// Players can call this with the server_seed revealed after game
pub fn verify_game_result(
    server_seed: [u8; 32],
    client_seed: String,
    nonce: u64,
    expected_roll: u8
) -> Result<bool, String> {
    let mut hasher = Sha256::new();
    hasher.update(server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    let hash = hasher.finalize();

    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    let calculated_roll = (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8;

    Ok(calculated_roll == expected_roll)
}

/// Get hash of server seed for pre-game commitment (provable fairness)
pub fn hash_server_seed(server_seed: &[u8; 32]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(server_seed);
    format!("{:x}", hasher.finalize())
}

// =============================================================================
// MULTI-DICE VRF FUNCTIONS
// =============================================================================

/// Derive a single roll from server_seed + client_seed + nonce + dice_index
/// This is deterministic and verifiable by players
fn derive_single_roll(
    server_seed: &[u8; 32],
    client_seed: &str,
    nonce: u64,
    dice_index: u8,
) -> u8 {
    let mut hasher = Sha256::new();
    hasher.update(server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    hasher.update([dice_index]); // Critical: include dice index for independence
    let hash = hasher.finalize();

    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8
}

/// Generate multiple dice rolls using per-game VRF with deterministic derivation
/// Single raw_rand() call, derive N independent rolls
pub async fn generate_multi_dice_roll_vrf(
    dice_count: u8,
    client_seed: &str,
) -> Result<(Vec<u8>, [u8; 32], u64), String> {
    use crate::types::MAX_DICE_COUNT;

    if dice_count == 0 || dice_count > MAX_DICE_COUNT {
        return Err(format!("Dice count must be 1-{}", MAX_DICE_COUNT));
    }

    // Get fresh VRF randomness (single async call to IC consensus)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("VRF unavailable: {:?}. Please retry.", e))?;

    let server_seed: [u8; 32] = random_bytes[0..32]
        .try_into()
        .map_err(|_| "Insufficient randomness")?;

    let nonce = ic_cdk::api::time();

    // Derive each dice roll independently using index-based hashing
    let mut rolls = Vec::with_capacity(dice_count as usize);
    for i in 0..dice_count {
        let roll = derive_single_roll(&server_seed, client_seed, nonce, i);
        rolls.push(roll);
    }

    Ok((rolls, server_seed, nonce))
}

/// Verify multi-dice game result for provable fairness
pub fn verify_multi_dice_result(
    server_seed: [u8; 32],
    client_seed: String,
    nonce: u64,
    expected_rolls: Vec<u8>,
) -> Result<bool, String> {
    use crate::types::MAX_DICE_COUNT;

    // Bounds validation to prevent DoS via excessive computation
    if expected_rolls.is_empty() || expected_rolls.len() > MAX_DICE_COUNT as usize {
        return Err(format!("Expected rolls count must be 1-{}", MAX_DICE_COUNT));
    }

    for (i, &expected_roll) in expected_rolls.iter().enumerate() {
        let calculated_roll = derive_single_roll(&server_seed, &client_seed, nonce, i as u8);
        if calculated_roll != expected_roll {
            return Ok(false);
        }
    }
    Ok(true)
}