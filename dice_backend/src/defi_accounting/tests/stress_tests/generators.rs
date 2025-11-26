use proptest::prelude::*;
use super::Operation;

// User IDs 1-100 (0 reserved for burned shares)
pub fn user_id() -> impl Strategy<Value = u64> {
    1..=100u64
}

// Deposit amounts: mix of small (but valid), medium, large
pub fn deposit_amount() -> impl Strategy<Value = u64> {
    prop_oneof![
        (10_000_000..100_000_000u64),      // 10 - 100 USDT (Valid User Deposits)
        (100_000_000..10_000_000_000u64),  // 100 - 10,000 USDT
        // Note: We exclude < 10 USDT to avoid BelowMinimum noise in general tests,
        // but edge case tests explicitly check small amounts.
    ]
}

// Bet amounts: 0.01 - 10 USDT
pub fn bet_amount() -> impl Strategy<Value = u64> {
    10_000..10_000_000u64
}

// Realistic multipliers (in basis points)
pub fn multiplier_bps() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(20000),   // 2x
        Just(40000),   // 4x
        Just(100000),  // 10x
        Just(500000),  // 50x
    ]
}

// Win probability weighted toward house edge (25% wins)
pub fn win_probability() -> impl Strategy<Value = bool> {
    prop_oneof![
        3 => Just(false),  // 75% losses
        1 => Just(true),   // 25% wins
    ]
}

// Generate random operation (weighted distribution)
pub fn operation() -> impl Strategy<Value = Operation> {
    prop_oneof![
        3 => (user_id(), deposit_amount()).prop_map(|(user, amount)| Operation::UserDeposit { user, amount }),   // 15%
        1 => user_id().prop_map(|user| Operation::UserWithdraw { user }),  // 5%
        4 => (user_id(), bet_amount(), win_probability(), multiplier_bps()).prop_map(|(user, amount, win, multiplier_bps)| Operation::PlaceBet { user, amount, win, multiplier_bps }),      // 20%
        10 => (user_id(), deposit_amount()).prop_map(|(user, amount)| Operation::LPDeposit { user, amount }),    // 50%
        2 => user_id().prop_map(|user| Operation::LPWithdraw { user }),    // 10%
        1 => Just(Operation::WithdrawFees), // 5% roughly
    ]
}

// Generate sequence of N operations
pub fn operation_sequence(len: usize) -> impl Strategy<Value = Vec<Operation>> {
    proptest::collection::vec(operation(), len)
}
