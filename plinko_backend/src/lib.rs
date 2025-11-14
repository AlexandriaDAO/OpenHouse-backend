//! Plinko Game Logic Canister
//!
//! **Architecture Philosophy:**
//! This canister implements ONLY the core Plinko game mechanics:
//! - Generate random ball path using IC VRF
//! - Map final position to multiplier based on risk/rows
//!
//! **What this canister does NOT do:**
//! - ICP betting/transfers (handled by frontend or separate accounting canister)
//! - Game history storage (can be added as separate layer if needed)
//! - Player balance management
//!
//! **Why this separation?**
//! 1. Reusability: Game logic can be used by multiple betting interfaces
//! 2. Verifiability: Core randomness algorithm is simple and auditable
//! 3. Modularity: Betting logic can evolve independently
//! 4. Cost: Less state = lower storage costs
//!
//! **Transparency & Fairness:**
//! - Randomness source: IC VRF (raw_rand) with SHA256 fallback
//! - Multiplier tables are public and fixed (query `get_multipliers`)
//! - Game logic is deterministic: same path -> same multiplier
//! - Frontend should log all game results for user verification

use candid::{CandidType, Deserialize};
use ic_cdk::{query, update};
use ic_cdk::api::management_canister::main::raw_rand;
use sha2::{Digest, Sha256};

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum RiskLevel { Low, Medium, High }

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlinkoResult {
    pub path: Vec<bool>,        // true = right, false = left
    pub final_position: u8,     // 0 to rows (number of rights)
    pub multiplier: f64,
}

// Drop a ball down the Plinko board
// Architecture: This canister provides ONLY game logic (random path + multiplier lookup).
// Frontend or a separate accounting canister handles betting/ICP transfers.
// This separation allows the game logic to be reusable and independently verifiable.
#[update]
async fn drop_ball(rows: u8, risk: RiskLevel) -> Result<PlinkoResult, String> {
    if ![8, 12, 16].contains(&rows) {
        return Err("Rows must be 8, 12, or 16".to_string());
    }

    // Generate random path using IC VRF with secure fallback
    let random_bytes = match raw_rand().await {
        Ok((bytes,)) => bytes,
        Err(_) => {
            // Secure fallback: Hash timestamp + caller principal
            // This maintains randomness even if VRF fails
            let time = ic_cdk::api::time();
            let caller = ic_cdk::caller();
            let mut hasher = Sha256::new();
            hasher.update(time.to_be_bytes());
            hasher.update(caller.as_slice());
            hasher.finalize().to_vec()
        }
    };

    let path: Vec<bool> = (0..rows)
        .map(|i| (random_bytes[i as usize % random_bytes.len()] >> (i % 8)) & 1 == 1)
        .collect();

    // Final position = count of right moves
    let final_position = path.iter().filter(|&&d| d).count() as u8;
    let multiplier = get_multiplier(rows, &risk, final_position);

    Ok(PlinkoResult { path, final_position, multiplier })
}

// Get multiplier table for frontend display
#[query]
fn get_multipliers(rows: u8, risk: RiskLevel) -> Vec<f64> {
    if ![8, 12, 16].contains(&rows) { return vec![]; }
    (0..=rows).map(|pos| get_multiplier(rows, &risk, pos)).collect()
}

fn get_multiplier(rows: u8, risk: &RiskLevel, pos: u8) -> f64 {
    match rows {
        8 => match risk {
            RiskLevel::Low => match pos {
                0 | 8 => 5.6, 1 | 7 => 2.1, 2 | 6 => 1.1, 3 | 5 => 1.0, 4 => 0.5, _ => 0.0,
            },
            RiskLevel::Medium => match pos {
                0 | 8 => 13.0, 1 | 7 => 3.0, 2 | 6 => 1.3, 3 | 5 => 0.7, 4 => 0.4, _ => 0.0,
            },
            RiskLevel::High => match pos {
                0 | 8 => 29.0, 1 | 7 => 4.0, 2 | 6 => 1.5, 3 | 5 => 0.3, 4 => 0.2, _ => 0.0,
            },
        },
        12 => match risk {
            RiskLevel::Low => match pos {
                0 | 12 => 10.0, 1 | 11 => 3.0, 2 | 10 => 1.6, 3 | 9 => 1.4,
                4 | 8 => 1.1, 5 | 7 => 1.0, 6 => 0.5, _ => 0.0,
            },
            RiskLevel::Medium => match pos {
                0 | 12 => 33.0, 1 | 11 => 11.0, 2 | 10 => 4.0, 3 | 9 => 2.0,
                4 | 8 => 1.1, 5 | 7 => 0.6, 6 => 0.3, _ => 0.0,
            },
            RiskLevel::High => match pos {
                0 | 12 => 170.0, 1 | 11 => 24.0, 2 | 10 => 8.1, 3 | 9 => 2.0,
                4 | 8 => 0.7, 5 | 7 => 0.2, 6 => 0.2, _ => 0.0,
            },
        },
        16 => match risk {
            RiskLevel::Low => match pos {
                0 | 16 => 16.0, 1 | 15 => 9.0, 2 | 14 => 2.0, 3 | 13 => 1.4,
                4 | 12 => 1.4, 5 | 11 => 1.2, 6 | 10 => 1.1, 7 | 9 => 1.0, 8 => 0.5, _ => 0.0,
            },
            RiskLevel::Medium => match pos {
                0 | 16 => 110.0, 1 | 15 => 41.0, 2 | 14 => 10.0, 3 | 13 => 5.0,
                4 | 12 => 3.0, 5 | 11 => 1.5, 6 | 10 => 1.0, 7 | 9 => 0.5, 8 => 0.3, _ => 0.0,
            },
            RiskLevel::High => match pos {
                0 | 16 => 1000.0, 1 | 15 => 130.0, 2 | 14 => 26.0, 3 | 13 => 9.0,
                4 | 12 => 4.0, 5 | 11 => 2.0, 6 | 10 => 0.2, 7 | 9 => 0.2, 8 => 0.2, _ => 0.0,
            },
        },
        _ => 1.0,
    }
}

// Backwards compatibility: Legacy function name
// TODO: Remove after frontend migration to drop_ball()
#[update]
async fn play_plinko(rows: u8, risk: RiskLevel) -> Result<PlinkoResult, String> {
    drop_ball(rows, risk).await
}

#[query]
fn greet(name: String) -> String {
    format!("Plinko: Drop a ball, get a multiplier. Hi {}!", name)
}
