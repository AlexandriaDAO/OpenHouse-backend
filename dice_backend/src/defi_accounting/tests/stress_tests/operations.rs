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
}
