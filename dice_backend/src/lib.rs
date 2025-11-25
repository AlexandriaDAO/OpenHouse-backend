use ic_cdk::{init, post_upgrade, pre_upgrade, query, update};
use ic_stable_structures::memory_manager::{MemoryManager, VirtualMemory};
use ic_stable_structures::DefaultMemoryImpl;
use std::cell::RefCell;

// =============================================================================
// MODULE DECLARATIONS
// =============================================================================

mod defi_accounting;
pub mod types;
pub mod seed;
pub mod game;
mod analytics;

// =============================================================================
// RE-EXPORTS
// =============================================================================

pub use types::{RollDirection, DiceResult, GameStats, DetailedGameHistory, SeedRotationRecord};

// =============================================================================
// MEMORY MANAGEMENT
// =============================================================================

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
}

// =============================================================================
// LIFECYCLE HOOKS
// =============================================================================

#[init]
fn init() {
    // Initialize game state
    ic_cdk::println!("Dice Game Backend Initialized");

    // Start retry timer for pending withdrawals
    defi_accounting::accounting::start_retry_timer();
    defi_accounting::accounting::start_parent_withdrawal_timer();
}

#[pre_upgrade]
fn pre_upgrade() {
    // Note: StableBTreeMap persists automatically, no special handling needed
}

#[post_upgrade]
fn post_upgrade() {
    // Restore game state
    seed::restore_seed_state();

    // Start retry timer for pending withdrawals
    defi_accounting::accounting::start_retry_timer();
    defi_accounting::accounting::start_parent_withdrawal_timer();
    // Note: StableBTreeMap restores automatically, no accounting restore needed
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

#[update]
async fn play_dice(bet_amount: u64, target_number: u8, direction: RollDirection, client_seed: String) -> Result<DiceResult, String> {
    game::play_dice(bet_amount, target_number, direction, client_seed, ic_cdk::api::msg_caller()).await
}

#[query]
fn get_stats() -> GameStats {
    game::get_stats()
}

#[query]
fn get_recent_games(limit: u32) -> Vec<DiceResult> {
    game::get_recent_games(limit)
}

#[query]
fn get_game(game_id: u64) -> Option<DiceResult> {
    game::get_game(game_id)
}

#[query]
fn get_detailed_history(limit: u32) -> Vec<DetailedGameHistory> {
    analytics::get_detailed_history(limit)
}

#[query]
fn export_history_csv(limit: u32) -> String {
    analytics::export_history_csv(limit)
}

#[query]
fn get_current_seed_hash() -> String {
    seed::get_current_seed_hash()
}

#[query]
fn verify_game_result(server_seed: [u8; 32], client_seed: String, nonce: u64, expected_roll: u8) -> Result<bool, String> {
    seed::verify_game_result(server_seed, client_seed, nonce, expected_roll)
}

#[query]
fn get_seed_info() -> (String, u64, u64) {
    seed::get_seed_info()
}

#[query]
fn get_rotation_history(limit: u32) -> Vec<(u64, SeedRotationRecord)> {
    seed::get_rotation_history(limit)
}

#[query]
fn calculate_payout_info(target_number: u8, direction: RollDirection) -> Result<(f64, f64), String> {
    game::calculate_payout_info(target_number, direction)
}

#[query]
fn greet(name: String) -> String {
    format!("Welcome to OpenHouse Dice, {}! Roll the dice and test your luck!", name)
}

// // =============================================================================
// // TEMPORARY EMERGENCY FUNCTION - TO BE REMOVED
// // =============================================================================
// // WARNING: This function transfers ALL ckUSDT to admin for emergency recovery
// // Admin account: p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae
// // TODO: Remove this function after emergency withdrawal and canister reinstall
// #[update]
// async fn emergency_withdraw_all() -> Result<u64, String> {
//     use candid::{Principal, Nat};
//     use crate::types::{Account, TransferArg, TransferError, CKUSDT_CANISTER_ID, CKUSDT_TRANSFER_FEE};

//     // Admin principal
//     let admin = Principal::from_text("p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae")
//         .map_err(|e| format!("Invalid admin principal: {:?}", e))?;

//     let ck_usdt_principal = Principal::from_text(CKUSDT_CANISTER_ID)
//         .map_err(|e| format!("Invalid ckUSDT canister principal: {:?}", e))?;

//     // Get current canister balance using ICRC-1
//     let canister_account = Account {
//         owner: ic_cdk::api::canister_self(),
//         subaccount: None,
//     };

//     let balance_result: Result<(Nat,), _> = ic_cdk::api::call::call(
//         ck_usdt_principal,
//         "icrc1_balance_of",
//         (canister_account,)
//     ).await;

//     let balance = match balance_result {
//         Ok((nat_balance,)) => {
//             nat_balance.0.try_into().unwrap_or_else(|_| {
//                 ic_cdk::println!("CRITICAL: Balance exceeds u64::MAX");
//                 u64::MAX
//             })
//         },
//         Err((code, msg)) => return Err(format!("Failed to get balance: {:?} {}", code, msg)),
//     };

//     if balance == 0 {
//         return Err("No ckUSDT balance to withdraw".to_string());
//     }

//     // Calculate amount after fee (ckUSDT fee is 0.01 USDT = 10,000 decimals)
//     if balance <= CKUSDT_TRANSFER_FEE {
//         return Err(format!("Balance {} decimals is less than transfer fee {}", balance, CKUSDT_TRANSFER_FEE));
//     }

//     let transfer_amount = balance - CKUSDT_TRANSFER_FEE;

//     // Transfer to admin using ICRC-1
//     let args = TransferArg {
//         from_subaccount: None,
//         to: Account {
//             owner: admin,
//             subaccount: None,
//         },
//         amount: Nat::from(transfer_amount),
//         fee: Some(Nat::from(CKUSDT_TRANSFER_FEE)),
//         memo: None,
//         created_at_time: Some(ic_cdk::api::time()),
//     };

//     let transfer_result: Result<(Result<Nat, TransferError>,), _> =
//         ic_cdk::api::call::call(ck_usdt_principal, "icrc1_transfer", (args,)).await;

//     match transfer_result {
//         Ok((Ok(block_index),)) => {
//             let block_idx = block_index.0.try_into().unwrap_or(0);
//             ic_cdk::println!("EMERGENCY WITHDRAWAL: Transferred {} decimals ({} USDT) to admin at block {}",
//                            transfer_amount, transfer_amount / types::DECIMALS_PER_CKUSDT, block_idx);
//             Ok(transfer_amount)
//         }
//         Ok((Err(e),)) => Err(format!("Transfer failed: {:?}", e)),
//         Err((code, msg)) => Err(format!("Call failed: {:?} {}", code, msg)),
//     }
// }
