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
// // WARNING: This function transfers ALL ICP to admin for emergency recovery
// // Admin account: ifuqo-idvcc-eaaea-fpgnw-f52vs-glhdb-55jtt-glws3-jleqc-7nmkd-pae
// // TODO: Remove this function after emergency withdrawal and canister reinstall
// #[update]
// async fn emergency_withdraw_all() -> Result<u64, String> {
//     use ic_ledger_types::{
//         AccountIdentifier, TransferArgs, Tokens, DEFAULT_SUBACCOUNT,
//         MAINNET_LEDGER_CANISTER_ID, Memo, AccountBalanceArgs, Timestamp,
//     };
//     use candid::Principal;

//     // Admin principal
//     let admin = Principal::from_text("ifuqo-idvcc-eaaea-fpgnw-f52vs-glhdb-55jtt-glws3-jleqc-7nmkd-pae")
//         .map_err(|e| format!("Invalid admin principal: {:?}", e))?;

//     // Get current canister balance
//     let balance_result: Result<(Tokens,), _> = ic_cdk::api::call::call(
//         MAINNET_LEDGER_CANISTER_ID,
//         "account_balance",
//         (AccountBalanceArgs {
//             account: AccountIdentifier::new(&ic_cdk::api::canister_self(), &DEFAULT_SUBACCOUNT)
//         },)
//     ).await;

//     let balance = match balance_result {
//         Ok((tokens,)) => tokens.e8s(),
//         Err((code, msg)) => return Err(format!("Failed to get balance: {:?} {}", code, msg)),
//     };

//     if balance == 0 {
//         return Err("No ICP balance to withdraw".to_string());
//     }

//     // Calculate amount after fee
//     const ICP_TRANSFER_FEE: u64 = 10_000; // 0.0001 ICP
//     if balance <= ICP_TRANSFER_FEE {
//         return Err(format!("Balance {} is less than transfer fee", balance));
//     }

//     let transfer_amount = balance - ICP_TRANSFER_FEE;

//     // Transfer to admin
//     let args = TransferArgs {
//         memo: Memo(0),
//         amount: Tokens::from_e8s(transfer_amount),
//         fee: Tokens::from_e8s(ICP_TRANSFER_FEE),
//         from_subaccount: None,
//         to: AccountIdentifier::new(&admin, &DEFAULT_SUBACCOUNT),
//         created_at_time: Some(Timestamp { timestamp_nanos: ic_cdk::api::time() }),
//     };

//     match ic_ledger_types::transfer(MAINNET_LEDGER_CANISTER_ID, &args).await {
//         Ok(Ok(block_index)) => {
//             ic_cdk::println!("EMERGENCY WITHDRAWAL: Transferred {} e8s to admin at block {}",
//                            transfer_amount, block_index);
//             Ok(transfer_amount)
//         }
//         Ok(Err(e)) => Err(format!("Transfer failed: {:?}", e)),
//         Err(e) => Err(format!("Call failed: {:?}", e)),
//     }
// }