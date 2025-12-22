// European Roulette Type Definitions

use candid::{CandidType, Deserialize, Principal};
use serde::Serialize;

// =============================================================================
// CONSTANTS (Required by defi_accounting)
// =============================================================================

pub const DECIMALS_PER_CKUSDT: u64 = 1_000_000; // 1 ckUSDT = 1,000,000 decimals (6 decimals)
pub const MIN_BET: u64 = 10_000; // 0.01 USDT minimum per bet
pub const CKUSDT_CANISTER_ID: &str = "cngnf-vqaaa-aaaar-qag4q-cai";
pub const CKUSDT_TRANSFER_FEE: u64 = 10_000; // 0.01 USDT

// =============================================================================
// ICRC-2 TYPES (Required by defi_accounting)
// =============================================================================

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Account {
    pub owner: Principal,
    pub subaccount: Option<[u8; 32]>,
}

impl From<Principal> for Account {
    fn from(owner: Principal) -> Self {
        Self {
            owner,
            subaccount: None,
        }
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct TransferFromArgs {
    pub from: Account,
    pub to: Account,
    pub amount: candid::Nat,
    pub fee: Option<candid::Nat>,
    pub memo: Option<Vec<u8>>,
    pub created_at_time: Option<u64>,
    pub spender_subaccount: Option<[u8; 32]>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum TransferFromError {
    BadFee { expected_fee: candid::Nat },
    BadBurn { min_burn_amount: candid::Nat },
    InsufficientFunds { balance: candid::Nat },
    InsufficientAllowance { allowance: candid::Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: candid::Nat },
    TemporarilyUnavailable,
    GenericError { error_code: candid::Nat, message: String },
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct TransferArg {
    pub from_subaccount: Option<[u8; 32]>,
    pub to: Account,
    pub amount: candid::Nat,
    pub fee: Option<candid::Nat>,
    pub memo: Option<Vec<u8>>,
    pub created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum TransferError {
    BadFee { expected_fee: candid::Nat },
    BadBurn { min_burn_amount: candid::Nat },
    InsufficientFunds { balance: candid::Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: candid::Nat },
    TemporarilyUnavailable,
    GenericError { error_code: candid::Nat, message: String },
}

// =============================================================================
// ROULETTE TYPES
// =============================================================================

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
pub enum Color {
    Green,
    Red,
    Black,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum BetType {
    // Inside bets
    Straight(u8),           // Single number 0-36
    Split(u8, u8),          // Two adjacent numbers
    Street(u8),             // Row of 3 (start number: 1,4,7,...)
    Corner(u8),             // Square of 4 (top-left number)
    SixLine(u8),            // Two rows of 3 (start number)

    // Outside bets
    Column(u8),             // Column 1, 2, or 3
    Dozen(u8),              // Dozen 1, 2, or 3
    Red,
    Black,
    Even,
    Odd,
    Low,                    // 1-18
    High,                   // 19-36
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Bet {
    pub bet_type: BetType,
    pub amount: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct BetResult {
    pub bet_type: BetType,
    pub amount: u64,
    pub won: bool,
    pub payout: u64,        // 0 if lost, includes original bet if won
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct SpinResult {
    pub winning_number: u8,
    pub color: Color,
    pub bets: Vec<BetResult>,
    pub total_bet: u64,
    pub total_payout: u64,
    pub net_result: i64,    // total_payout - total_bet (can be negative)
    pub randomness_hash: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct BoardLayout {
    pub red_numbers: Vec<u8>,
    pub black_numbers: Vec<u8>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct PayoutInfo {
    pub bet_type: String,
    pub payout_multiplier: u8,
    pub description: String,
}
