// European Roulette Backend - Canister Endpoints

use ic_cdk::{query, update, init};

mod types;
mod game;
mod board;

pub use types::*;
use board::{RED_NUMBERS, BLACK_NUMBERS};

#[init]
fn init() {
    ic_cdk::println!("Roulette Backend Initialized - European Roulette (2.70% house edge)");
}

/// Execute a spin with the given bets
/// Returns the winning number, color, and results for each bet
#[update]
async fn spin(bets: Vec<Bet>) -> Result<SpinResult, String> {
    game::spin(bets).await
}

/// Get the board layout (red and black numbers)
#[query]
fn get_board_layout() -> BoardLayout {
    BoardLayout {
        red_numbers: RED_NUMBERS.to_vec(),
        black_numbers: BLACK_NUMBERS.to_vec(),
    }
}

/// Get payout information for all bet types
#[query]
fn get_payouts() -> Vec<PayoutInfo> {
    vec![
        PayoutInfo {
            bet_type: "Straight".into(),
            payout_multiplier: 35,
            description: "Single number (0-36)".into(),
        },
        PayoutInfo {
            bet_type: "Split".into(),
            payout_multiplier: 17,
            description: "Two adjacent numbers".into(),
        },
        PayoutInfo {
            bet_type: "Street".into(),
            payout_multiplier: 11,
            description: "Three numbers in a row".into(),
        },
        PayoutInfo {
            bet_type: "Corner".into(),
            payout_multiplier: 8,
            description: "Four numbers in a square".into(),
        },
        PayoutInfo {
            bet_type: "Six Line".into(),
            payout_multiplier: 5,
            description: "Six numbers (two rows)".into(),
        },
        PayoutInfo {
            bet_type: "Column".into(),
            payout_multiplier: 2,
            description: "12 numbers in a column".into(),
        },
        PayoutInfo {
            bet_type: "Dozen".into(),
            payout_multiplier: 2,
            description: "12 numbers (1-12, 13-24, 25-36)".into(),
        },
        PayoutInfo {
            bet_type: "Red/Black".into(),
            payout_multiplier: 1,
            description: "18 numbers by color".into(),
        },
        PayoutInfo {
            bet_type: "Even/Odd".into(),
            payout_multiplier: 1,
            description: "18 numbers by parity".into(),
        },
        PayoutInfo {
            bet_type: "Low/High".into(),
            payout_multiplier: 1,
            description: "1-18 or 19-36".into(),
        },
    ]
}

/// Greet a player
#[query]
fn greet(name: String) -> String {
    format!(
        "Welcome to OpenHouse Roulette, {}! Place your bets - European rules, 2.70% house edge.",
        name
    )
}

/// Get the user's balance in the roulette game
/// TODO: Integrate with defi_accounting module like dice/plinko/crash backends
#[query]
fn get_my_balance() -> u64 {
    // Stub: Return 0 until DeFi integration is complete
    0
}

/// Get the house balance (pot) for roulette
/// TODO: Integrate with defi_accounting module like dice/plinko/crash backends
#[query]
fn get_house_balance() -> u64 {
    // Stub: Return a dummy value until DeFi integration is complete
    1_000_000_000_000 // 10,000 USDT in e8s
}

ic_cdk::export_candid!();
