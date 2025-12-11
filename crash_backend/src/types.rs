use candid::{CandidType, Deserialize, Principal};
use serde::Serialize;

// =============================================================================
// CONSTANTS
// =============================================================================

pub const DECIMALS_PER_CKUSDT: u64 = 1_000_000; // 1 ckUSDT = 1,000,000 decimals (6 decimals)
pub const MIN_BET: u64 = 100_000; // 0.1 USDT
pub const CKUSDT_CANISTER_ID: &str = "cngnf-vqaaa-aaaar-qag4q-cai";
pub const CKUSDT_TRANSFER_FEE: u64 = 10_000; // 0.01 USDT

// =============================================================================
// ICRC-2 TYPES
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
