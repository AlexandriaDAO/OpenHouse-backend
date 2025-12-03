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