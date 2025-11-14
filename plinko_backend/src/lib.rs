use candid::{CandidType, Deserialize};
use ic_cdk::{query, update};
use ic_cdk::api::management_canister::main::raw_rand;

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum RiskLevel { Low, Medium, High }

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PlinkoResult {
    pub path: Vec<bool>,        // true = right, false = left
    pub final_position: u8,     // 0 to rows (number of rights)
    pub multiplier: f64,
}

// Drop a ball down the Plinko board
#[update]
async fn drop_ball(rows: u8, risk: RiskLevel) -> Result<PlinkoResult, String> {
    if ![8, 12, 16].contains(&rows) {
        return Err("Rows must be 8, 12, or 16".to_string());
    }

    // Generate random path using IC VRF
    let random_bytes = raw_rand().await.map(|(bytes,)| bytes).unwrap_or_default();
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

#[query]
fn greet(name: String) -> String {
    format!("Plinko: Drop a ball, get a multiplier. Hi {}!", name)
}
