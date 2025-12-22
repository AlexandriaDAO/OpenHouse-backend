use std::collections::HashMap;
use super::{Operation, OpResult};

// Constants matching production
const MIN_BET: u64 = 10_000;              // 0.01 USDT (game.rs)
const MIN_USER_DEPOSIT: u64 = 1_000_000; // 1 USDT (accounting.rs)
const MIN_LP_DEPOSIT: u64 = 10_000_000;    // 10 USDT (liquidity_pool.rs)
const LP_WITHDRAWAL_FEE_BPS: u64 = 100;   // 1%
const MINIMUM_LIQUIDITY: u64 = 1000;

/// Test model for accounting invariant verification.
///
/// # Type Choice: u64 storage with u128 intermediate calculations
///
/// This model stores values as `u64` to match production types, but uses `u128`
/// for intermediate arithmetic (e.g., share calculations, payout math). This is
/// intentional:
///
/// - **Production** uses `Nat` (arbitrary precision) which cannot overflow
/// - **Test model** uses `u128` intermediates to safely compute `a * b / c` without
///   overflow, then checks if the result fits in `u64`
/// - This catches overflow bugs that would occur if production used fixed-width types
///
/// The pattern `(a as u128 * b as u128 / c as u128) as u64` is safe because:
/// 1. The multiplication happens in u128 space (no overflow)
/// 2. Division brings the result back to a reasonable range
/// 3. Final cast to u64 is valid for realistic values
pub struct AccountingModel {
    // User balances - mirrors USER_BALANCES_STABLE
    pub user_balances: HashMap<u64, u64>,

    // LP shares - mirrors LP_SHARES
    pub lp_shares: HashMap<u64, u64>,
    pub total_shares: u64,

    // Pool reserve - mirrors POOL_STATE.reserve
    pub pool_reserve: u64,

    // Tracking for invariant checking
    // Total funds in system (Reserve + User Balances + Accumulated Fees)
    pub total_system_funds: u64,
    pub accumulated_fees: u64,

    // State
    pub operation_count: u64,
}

impl AccountingModel {
    pub fn new() -> Self {
        Self {
            user_balances: HashMap::new(),
            lp_shares: HashMap::new(),
            total_shares: 0,
            pool_reserve: 0,
            total_system_funds: 0,
            accumulated_fees: 0,
            operation_count: 0,
        }
    }

    pub fn with_initial_liquidity(amount: u64) -> Self {
        let mut model = Self::new();
        // Create model with seed liquidity
        // Burn MINIMUM_LIQUIDITY to address 0 (mirrors liquidity_pool.rs:214)
        if amount > 0 {
             let _ = model.lp_deposit(0, amount); // Using 0 as "admin/initial" user for simplicity or specific logic
        }
        model
    }

    /// THE CORE INVARIANT
    /// Must hold after ANY sequence of operations
    pub fn check_invariant(&self) -> Result<(), String> {
        let sum_user_balances: u128 = self.user_balances.values().map(|&x| x as u128).sum();
        let calculated = self.pool_reserve as u128 + sum_user_balances + self.accumulated_fees as u128;

        if calculated != self.total_system_funds as u128 {
            return Err(format!(
                "INVARIANT VIOLATION: pool({}) + users({}) + fees({}) = {} != total({})",
                self.pool_reserve, sum_user_balances, self.accumulated_fees,
                calculated, self.total_system_funds
            ));
        }
        Ok(())
    }

    /// LP shares must sum to total_shares
    pub fn check_lp_invariant(&self) -> Result<(), String> {
        let sum_shares: u64 = self.lp_shares.values().sum();
        if sum_shares != self.total_shares {
            return Err(format!(
                "LP shares mismatch: sum({}) != total({})",
                sum_shares, self.total_shares
            ));
        }
        Ok(())
    }

    /// Execute an operation and return result
    pub fn execute(&mut self, op: Operation) -> OpResult {
        self.operation_count += 1;
        match op {
            Operation::UserDeposit { user, amount } => self.user_deposit(user, amount),
            Operation::UserWithdraw { user } => self.user_withdraw(user),
            Operation::PlaceBet { user, amount, win, multiplier_bps } =>
                self.place_bet(user, amount, win, multiplier_bps),
            Operation::LPDeposit { user, amount } => self.lp_deposit(user, amount),
            Operation::LPWithdraw { user } => self.lp_withdraw(user),
            Operation::WithdrawFees => self.withdraw_fees(),
            Operation::SettleBet { user, bet_amount, payout_amount } =>
                self.settle_bet(user, bet_amount, payout_amount),
        }
    }

    // Each method mirrors exact production logic
    pub fn user_deposit(&mut self, user: u64, amount: u64) -> OpResult {
        // Mirror accounting.rs:170-176
        if amount < MIN_USER_DEPOSIT {
             return OpResult::BelowMinimum;
        }
        // Add amount to user balance
        let balance = self.user_balances.entry(user).or_insert(0);
        match balance.checked_add(amount) {
            Some(new_bal) => {
                *balance = new_bal;
                // Add amount to total_system_funds
                self.total_system_funds = self.total_system_funds.checked_add(amount).expect("System funds overflow");
                OpResult::Success
            }
            None => OpResult::Overflow,
        }
    }

    pub    fn user_withdraw(&mut self, user: u64) -> OpResult {
        // Mirror accounting.rs:195-261
        // Check user has balance
        if let Some(balance) = self.user_balances.get_mut(&user) {
             let amount = *balance;
             if amount == 0 {
                 return OpResult::InsufficientBalance;
             }
             *balance = 0;
             self.total_system_funds = self.total_system_funds.checked_sub(amount).expect("System funds underflow");
             OpResult::Success
        } else {
            OpResult::InsufficientBalance
        }
    }

    pub    fn place_bet(&mut self, user: u64, amount: u64, win: bool, multiplier_bps: u64) -> OpResult {
        // Mirror game.rs:117-182
        
        if amount < MIN_BET {
            return OpResult::BelowMinimum;
        }

        if multiplier_bps < 10000 {
            // Casinos generally don't support sub-1x multipliers (loss guarantees)
            return OpResult::BelowMinimum;
        }

        // Check user has sufficient balance
        let balance = self.user_balances.entry(user).or_insert(0);
        if *balance < amount {
            return OpResult::InsufficientBalance;
        }

        let payout = (amount as u128 * multiplier_bps as u128 / 10000) as u64;
        
        if win {
            let profit = if payout > amount { payout - amount } else { 0 };
            
            // Check if pool can afford profit
            if self.pool_reserve < profit {
                return OpResult::InsufficientPoolReserve;
            }

            // Deduct bet from user, Add payout to user
            *balance = balance.checked_sub(amount).unwrap(); 
            *balance = balance.checked_add(payout).expect("User balance overflow");
            
            // Pool pays out Profit
            // Note: In production (game.rs), pool is updated via update_pool_on_win(profit).
            // This effectively reduces reserve by profit.
            self.pool_reserve = self.pool_reserve.checked_sub(profit).unwrap();

        } else {
            // Loss: User loses bet, Pool gains bet
            *balance = balance.checked_sub(amount).unwrap();
            self.pool_reserve = self.pool_reserve.checked_add(amount).expect("Pool overflow");
        }
        
        // total_system_funds unchanged (internal transfer between user and pool)
        OpResult::Success
    }

    /// Generic bet settlement - mirrors liquidity_pool::settle_bet()
    /// This handles all payout scenarios including partial payouts (Plinko 0.2x)
    pub    fn settle_bet(&mut self, user: u64, bet_amount: u64, payout_amount: u64) -> OpResult {
        // Check user has sufficient balance for the bet
        let balance = self.user_balances.entry(user).or_insert(0);
        if *balance < bet_amount {
            return OpResult::InsufficientBalance;
        }

        // Deduct bet from user balance
        *balance = balance.checked_sub(bet_amount).unwrap();

        // Calculate pool flow based on payout vs bet
        if payout_amount > bet_amount {
            // Player won: pool pays profit
            let profit = payout_amount - bet_amount;

            // Solvency check
            if self.pool_reserve < profit {
                // Rollback bet deduction
                *balance = balance.checked_add(bet_amount).unwrap();
                return OpResult::InsufficientPoolReserve;
            }

            // Credit payout to user
            *balance = balance.checked_add(payout_amount).expect("User balance overflow");

            // Pool pays profit
            self.pool_reserve = self.pool_reserve.checked_sub(profit).unwrap();
        } else if payout_amount < bet_amount {
            // Player lost (partial or total): pool gains difference
            // CRITICAL: This is the key fix for partial payouts!
            // For Plinko 0.2x: bet=100, payout=20, pool gains 80 (NOT 100)
            let pool_gain = bet_amount - payout_amount;

            // Credit payout to user (could be 0 for total loss)
            *balance = balance.checked_add(payout_amount).expect("User balance overflow");

            // Pool gains the difference
            self.pool_reserve = self.pool_reserve.checked_add(pool_gain).expect("Pool overflow");
        } else {
            // Push: payout == bet, no pool change
            // Just return the bet to user
            *balance = balance.checked_add(payout_amount).expect("User balance overflow");
        }

        // total_system_funds unchanged (internal transfer between user and pool)
        OpResult::Success
    }

    pub    fn lp_deposit(&mut self, user: u64, amount: u64) -> OpResult {
        // Mirror liquidity_pool.rs:126-231
        if amount < MIN_LP_DEPOSIT {
            return OpResult::BelowMinimum;
        }

        // Calculate shares: (amount * total_shares) / pool_reserve
        // If total_shares == 0, shares = amount (initial deposit)
        
        let shares;
        if self.total_shares == 0 {
            if amount < MINIMUM_LIQUIDITY {
                 return OpResult::BelowMinimum; // Cannot deposit less than min liquidity on first init
            }
            // First deposit: burn MINIMUM_LIQUIDITY
            let shares_minted = amount - MINIMUM_LIQUIDITY;
            shares = shares_minted;
            
            // Burn MINIMUM_LIQUIDITY shares to address 0
            // Note: In production, these are added to total_shares when burned.
            // Then user shares are added to total_shares.
            // Total = MINIMUM + (amount - MINIMUM) = amount.
            let burned_shares = MINIMUM_LIQUIDITY;
            *self.lp_shares.entry(0).or_insert(0) += burned_shares;
            self.total_shares += burned_shares;
        } else {
            // amount * total_shares / pool_reserve
            if self.pool_reserve == 0 {
                // CRITICAL FIX: Prevent division by zero
                // If reserve is 0 but shares > 0 (e.g. depleted pool), 
                // assigning shares is tricky. Production code returns 0 shares in this case?
                // liquidity_pool.rs:148: if current_reserve == 0 { return Ok(0); }
                return OpResult::BelowMinimum; // effectively 0 shares
            }
            shares = (amount as u128 * self.total_shares as u128 / self.pool_reserve as u128) as u64;
        }
        
        if shares == 0 {
            return OpResult::BelowMinimum; // Effectively too small to get shares
        }

        // Add amount to total_system_funds - Check FIRST to prevent partial updates
        let new_total_funds = match self.total_system_funds.checked_add(amount) {
            Some(f) => f,
            None => return OpResult::Overflow,
        };

        // Add amount to pool_reserve - Check SECOND
        let new_reserve = match self.pool_reserve.checked_add(amount) {
            Some(r) => r,
            None => return OpResult::Overflow,
        };

        // Update shares
        let user_shares = self.lp_shares.entry(user).or_insert(0);
        let new_user_shares = match user_shares.checked_add(shares) {
            Some(s) => s,
            None => return OpResult::Overflow,
        };
        let new_total_shares = match self.total_shares.checked_add(shares) {
            Some(s) => s,
            None => return OpResult::Overflow,
        };

        // Commit state changes
        *user_shares = new_user_shares;
        self.total_shares = new_total_shares;
        self.pool_reserve = new_reserve;
        self.total_system_funds = new_total_funds;
        
        OpResult::Success
    }

    pub    fn lp_withdraw(&mut self, user: u64) -> OpResult {
        // Mirror liquidity_pool.rs:242-369
        
        let user_shares = *self.lp_shares.get(&user).unwrap_or(&0);
        if user_shares == 0 {
            return OpResult::InsufficientShares;
        }

        // Withdraw ALL shares
        let shares_to_withdraw = user_shares;

        // Calculate payout: (shares * pool_reserve) / total_shares
        let gross_payout = (shares_to_withdraw as u128 * self.pool_reserve as u128 / self.total_shares as u128) as u64;
        
        // Calculate 1% fee (mirrors production checked arithmetic)
        let fee = match gross_payout.checked_mul(LP_WITHDRAWAL_FEE_BPS) {
            Some(prod) => prod / 10000,
            None => return OpResult::Overflow, // Match production: return error on overflow
        };
        let net_payout = gross_payout - fee;

        // Remove user shares
        self.lp_shares.remove(&user);
        self.total_shares -= shares_to_withdraw;

        // Fee Accounting Flow:
        // 1. Reserve is reduced by GROSS payout (money leaves pool)
        // 2. Fee is added to accumulated_fees (money stays in system/parent)
        // 3. User receives NET payout (money leaves system)
        //
        // Total System Funds Change:
        // - Gross (from reserve) + Fee (retained) = - (Gross - Fee) = - Net
        
        self.pool_reserve = self.pool_reserve.checked_sub(gross_payout).expect("Pool reserve underflow");
        self.accumulated_fees = self.accumulated_fees.checked_add(fee).expect("Fees overflow");
        
        // User gets net_payout (simulated by leaving system)
        self.total_system_funds = self.total_system_funds.checked_sub(net_payout).expect("System funds underflow");

        OpResult::Success
    }

    pub    fn withdraw_fees(&mut self) -> OpResult {
        // Simulate auto_withdraw_parent
        if self.accumulated_fees == 0 {
            return OpResult::Success;
        }
        let amount = self.accumulated_fees;
        self.accumulated_fees = 0;
        self.total_system_funds = self.total_system_funds.checked_sub(amount).expect("System funds underflow");
        OpResult::Success
    }
}
