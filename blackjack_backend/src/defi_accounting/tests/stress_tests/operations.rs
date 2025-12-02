#[derive(Debug, Clone, PartialEq)]
pub enum OpResult {
    Success,
    InsufficientBalance,
    InsufficientShares,
    InsufficientPoolReserve,
    BelowMinimum,
    Overflow,
}

#[derive(Debug, Clone)]
pub enum Operation {
    UserDeposit { user: u64, amount: u64 },
    UserWithdraw { user: u64 },
    PlaceBet { user: u64, amount: u64, win: bool, multiplier_bps: u64 },
    LPDeposit { user: u64, amount: u64 },
    LPWithdraw { user: u64 },
    WithdrawFees,

    /// Generic bet settlement for games with variable payouts (e.g., Plinko)
    /// Unlike PlaceBet which takes win/multiplier, this takes the actual payout amount
    /// enabling partial payouts (0.2x, 0.5x) that the old API couldn't handle
    SettleBet { user: u64, bet_amount: u64, payout_amount: u64 },
}
