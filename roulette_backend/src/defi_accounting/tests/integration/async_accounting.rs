//! Async Accounting Model Tests
//!
//! This model simulates the REAL async behavior of the production code,
//! including transfer failures, pending states, and orphaned funds.
//!
//! Key insight: The in-memory stress tests use a simplified synchronous model.
//! This test simulates the actual async flow with failures.

use std::collections::HashMap;
use rand::{SeedableRng, Rng};
use rand_chacha::ChaCha8Rng;

// =============================================================================
// ASYNC ACCOUNTING MODEL - Simulates real production behavior
// =============================================================================

#[derive(Debug, Clone)]
struct PendingWithdrawal {
    amount: u64,
    is_lp: bool,
    fee: u64, // Only for LP withdrawals
}

#[derive(Debug, Clone, Copy)]
enum TransferOutcome {
    Success,
    DefiniteError,
    UncertainError,
}

/// Model that tracks what production code ACTUALLY does
struct AsyncAccountingModel {
    // Canister state (what we track internally)
    user_balances: HashMap<u64, u64>,
    pool_reserve: u64,
    pending_withdrawals: HashMap<u64, PendingWithdrawal>,
    accumulated_fees: u64,

    // Ledger state (simulated external reality)
    canister_ledger_balance: u64,
    user_ledger_balances: HashMap<u64, u64>,

    // Tracking orphaned funds
    orphaned_funds: u64,

    // Stats
    total_deposits: u64,
    total_withdrawals: u64,
    abandoned_count: u64,
}

impl AsyncAccountingModel {
    fn new() -> Self {
        Self {
            user_balances: HashMap::new(),
            pool_reserve: 0,
            pending_withdrawals: HashMap::new(),
            accumulated_fees: 0,
            canister_ledger_balance: 0,
            user_ledger_balances: HashMap::new(),
            orphaned_funds: 0,
            total_deposits: 0,
            total_withdrawals: 0,
            abandoned_count: 0,
        }
    }

    /// The REAL solvency invariant
    /// Canister must have enough to cover all obligations
    fn check_solvency(&self) -> Result<(), String> {
        let sum_user_balances: u64 = self.user_balances.values().sum();
        let sum_pending: u64 = self.pending_withdrawals.values().map(|p| p.amount).sum();

        let obligations = sum_user_balances + self.pool_reserve + sum_pending;

        if self.canister_ledger_balance < obligations {
            return Err(format!(
                "INSOLVENT: Ledger {} < obligations {} (users={}, pool={}, pending={})",
                self.canister_ledger_balance, obligations,
                sum_user_balances, self.pool_reserve, sum_pending
            ));
        }

        // The difference is orphaned funds + accumulated fees
        let excess = self.canister_ledger_balance - obligations;
        let expected_excess = self.orphaned_funds + self.accumulated_fees;

        if excess != expected_excess {
            return Err(format!(
                "ACCOUNTING MISMATCH: excess {} != orphaned {} + fees {}",
                excess, self.orphaned_funds, self.accumulated_fees
            ));
        }

        Ok(())
    }

    /// Deposit: Always succeeds (ICRC-2 approval assumed)
    fn deposit(&mut self, user: u64, amount: u64) {
        // Ledger transfer happens
        self.canister_ledger_balance += amount;

        // Credit user balance
        *self.user_balances.entry(user).or_insert(0) += amount;

        self.total_deposits += amount;
    }

    /// LP deposit: Always succeeds
    fn lp_deposit(&mut self, amount: u64) {
        self.canister_ledger_balance += amount;
        self.pool_reserve += amount;
        self.total_deposits += amount;
    }

    /// Initiate withdrawal (Phase 1)
    fn initiate_withdrawal(&mut self, user: u64) -> Result<u64, &'static str> {
        if self.pending_withdrawals.contains_key(&user) {
            return Err("Already pending");
        }

        let balance = self.user_balances.get(&user).copied().unwrap_or(0);
        if balance == 0 {
            return Err("No balance");
        }

        // Zero balance, create pending
        self.user_balances.insert(user, 0);
        self.pending_withdrawals.insert(user, PendingWithdrawal {
            amount: balance,
            is_lp: false,
            fee: 0,
        });

        Ok(balance)
    }

    /// Process transfer result (Phase 2)
    fn process_transfer(&mut self, user: u64, outcome: TransferOutcome, is_first_attempt: bool) -> Result<(), String> {
        let pending = self.pending_withdrawals.get(&user)
            .ok_or("No pending")?
            .clone();

        match outcome {
            TransferOutcome::Success => {
                // Ledger transfer happened
                self.canister_ledger_balance -= pending.amount;
                *self.user_ledger_balances.entry(user).or_insert(0) += pending.amount;

                // Clear pending
                self.pending_withdrawals.remove(&user);
                self.total_withdrawals += pending.amount;
                Ok(())
            }
            TransferOutcome::DefiniteError => {
                if is_first_attempt {
                    // Rollback: restore balance
                    *self.user_balances.entry(user).or_insert(0) += pending.amount;
                    self.pending_withdrawals.remove(&user);
                }
                // If not first attempt, stay pending
                Err("Transfer failed".to_string())
            }
            TransferOutcome::UncertainError => {
                // Stay pending, don't rollback (could cause double-spend)
                Err("Uncertain".to_string())
            }
        }
    }

    /// Abandon withdrawal - THE CRITICAL ORPHAN SOURCE
    fn abandon_withdrawal(&mut self, user: u64, transfer_actually_succeeded: bool) -> Result<(), &'static str> {
        let pending = self.pending_withdrawals.get(&user)
            .ok_or("No pending")?
            .clone();

        // Remove pending WITHOUT restoring balance
        self.pending_withdrawals.remove(&user);

        if transfer_actually_succeeded {
            // User got the money on-chain, this is correct behavior
            self.canister_ledger_balance -= pending.amount;
            *self.user_ledger_balances.entry(user).or_insert(0) += pending.amount;
            self.total_withdrawals += pending.amount;
        } else {
            // User did NOT get the money, but we're not restoring balance
            // This creates ORPHANED FUNDS
            self.orphaned_funds += pending.amount;
            self.abandoned_count += 1;
        }

        Ok(())
    }

    /// Simulate a game (simplified)
    fn play_game(&mut self, user: u64, bet: u64, payout: u64) -> Result<(), &'static str> {
        let balance = self.user_balances.get(&user).copied().unwrap_or(0);
        if balance < bet {
            return Err("Insufficient balance");
        }

        // Deduct bet
        self.user_balances.insert(user, balance - bet);

        // Settle with pool
        if payout > bet {
            let profit = payout - bet;
            if self.pool_reserve < profit {
                // Rollback
                self.user_balances.insert(user, balance);
                return Err("Pool can't pay");
            }
            self.pool_reserve -= profit;
        } else if payout < bet {
            self.pool_reserve += bet - payout;
        }

        // Credit payout
        *self.user_balances.entry(user).or_insert(0) += payout;

        Ok(())
    }
}

// =============================================================================
// TESTS
// =============================================================================

#[test]
fn test_orphaned_funds_from_wrong_abandon() {
    let mut model = AsyncAccountingModel::new();

    // User deposits 100
    model.deposit(1, 100);
    assert!(model.check_solvency().is_ok());

    // User initiates withdrawal
    model.initiate_withdrawal(1).unwrap();
    assert!(model.check_solvency().is_ok());

    // Transfer times out (uncertain)
    let _ = model.process_transfer(1, TransferOutcome::UncertainError, true);
    assert!(model.check_solvency().is_ok());

    // User checks on-chain, doesn't see funds (transfer failed)
    // User abandons - THIS CREATES ORPHANED FUNDS
    model.abandon_withdrawal(1, false).unwrap();

    assert!(model.check_solvency().is_ok());
    assert_eq!(model.orphaned_funds, 100, "Should have 100 orphaned");
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 0, "User balance should be 0");
    assert_eq!(model.canister_ledger_balance, 100, "Canister still has the funds");

    println!("Orphaned funds scenario verified:");
    println!("  User balance: 0");
    println!("  Canister ledger: 100");
    println!("  Orphaned: 100");
}

#[test]
fn test_correct_abandon_no_orphan() {
    let mut model = AsyncAccountingModel::new();

    model.deposit(1, 100);
    model.initiate_withdrawal(1).unwrap();
    let _ = model.process_transfer(1, TransferOutcome::UncertainError, true);

    // Transfer actually succeeded on-chain
    // User checks, sees funds, abandons correctly
    model.abandon_withdrawal(1, true).unwrap();

    assert!(model.check_solvency().is_ok());
    assert_eq!(model.orphaned_funds, 0, "No orphans");
    assert_eq!(model.user_ledger_balances.get(&1).copied().unwrap_or(0), 100);
}

#[test]
fn test_stress_with_failures() {
    let mut model = AsyncAccountingModel::new();
    let mut rng = ChaCha8Rng::seed_from_u64(42);

    // Seed pool
    model.lp_deposit(1_000_000);

    // 100 users
    for user in 1..=100 {
        model.deposit(user, 10_000);
    }

    // 10,000 random operations
    for _ in 0..10_000 {
        let user = rng.gen_range(1..=100);

        match rng.gen_range(0..10) {
            0..=3 => {
                // Play a game (60% of operations)
                let bet = rng.gen_range(10..100);
                let multiplier = [2000, 5000, 10000, 20000, 50000][rng.gen_range(0..5)];
                let payout = (bet as u128 * multiplier as u128 / 10000) as u64;
                let _ = model.play_game(user, bet, payout);
            }
            4..=5 => {
                // Deposit
                model.deposit(user, rng.gen_range(100..1000));
            }
            6..=8 => {
                // Initiate withdrawal
                if model.initiate_withdrawal(user).is_ok() {
                    // Simulate transfer outcome
                    let outcome = match rng.gen_range(0..100) {
                        0..=90 => TransferOutcome::Success,
                        91..=95 => TransferOutcome::DefiniteError,
                        _ => TransferOutcome::UncertainError,
                    };

                    if model.process_transfer(user, outcome, true).is_err() {
                        // Still pending, maybe abandon
                        if rng.gen_bool(0.3) {
                            // 50% chance transfer actually succeeded
                            let actually_succeeded = rng.gen_bool(0.5);
                            let _ = model.abandon_withdrawal(user, actually_succeeded);
                        }
                    }
                }
            }
            _ => {} // Skip
        }

        // Check solvency after EVERY operation
        model.check_solvency().expect("Solvency violated!");
    }

    println!("\nStress test results:");
    println!("  Total deposits: {}", model.total_deposits);
    println!("  Total withdrawals: {}", model.total_withdrawals);
    println!("  Orphaned funds: {}", model.orphaned_funds);
    println!("  Abandoned count: {}", model.abandoned_count);
    println!("  Canister ledger: {}", model.canister_ledger_balance);
    println!("  Pool reserve: {}", model.pool_reserve);

    // Orphaned funds WILL occur in this simulation
    // This is expected behavior, not a bug
    if model.orphaned_funds > 0 {
        println!("\n  {} abandonments created {} orphaned funds",
            model.abandoned_count, model.orphaned_funds);
    }
}

#[test]
fn test_solvency_always_holds() {
    // Even with orphaned funds, the system is SOLVENT
    // Solvency = canister_balance >= obligations
    // Orphaned funds are excess, not a deficit

    let mut model = AsyncAccountingModel::new();
    model.deposit(1, 1000);
    model.lp_deposit(1000);

    // Create orphaned funds
    model.initiate_withdrawal(1).unwrap();
    let _ = model.process_transfer(1, TransferOutcome::UncertainError, true);
    model.abandon_withdrawal(1, false).unwrap();

    // System is still solvent
    assert!(model.check_solvency().is_ok());

    // Canister has more than obligations (the orphan is excess)
    let obligations: u64 = model.user_balances.values().sum::<u64>() + model.pool_reserve;
    assert!(model.canister_ledger_balance > obligations);
}

/// Quantify orphan rate under realistic conditions
#[test]
fn test_orphan_rate_estimation() {
    let mut total_orphaned = 0u64;
    let mut total_volume = 0u64;
    const SESSIONS: usize = 100;

    for seed in 0..SESSIONS {
        let mut model = AsyncAccountingModel::new();
        let mut rng = ChaCha8Rng::seed_from_u64(seed as u64);

        model.lp_deposit(100_000);
        for user in 1..=10 {
            model.deposit(user, 1_000);
        }

        for _ in 0..1000 {
            let user = rng.gen_range(1..=10);

            // 80% games, 20% withdrawals
            if rng.gen_bool(0.8) {
                let bet = rng.gen_range(1..50);
                let payout = bet * rng.gen_range(0..3);
                let _ = model.play_game(user, bet, payout);
            } else {
                if model.initiate_withdrawal(user).is_ok() {
                    // 99% success, 0.5% definite error, 0.5% uncertain
                    let outcome = match rng.gen_range(0..200) {
                        0 => TransferOutcome::UncertainError,
                        1 => TransferOutcome::DefiniteError,
                        _ => TransferOutcome::Success,
                    };

                    if model.process_transfer(user, outcome, true).is_err() {
                        if matches!(outcome, TransferOutcome::UncertainError) {
                            // User abandons incorrectly 50% of the time
                            if rng.gen_bool(0.5) {
                                let _ = model.abandon_withdrawal(user, false);
                            } else {
                                // Retry succeeds
                                let _ = model.process_transfer(user, TransferOutcome::Success, false);
                            }
                        }
                    }
                }
            }
        }

        total_orphaned += model.orphaned_funds;
        total_volume += model.total_deposits;
    }

    let orphan_rate = total_orphaned as f64 / total_volume as f64 * 100.0;
    println!("\nOrphan Rate Estimation ({} sessions):", SESSIONS);
    println!("  Total volume: {}", total_volume);
    println!("  Total orphaned: {}", total_orphaned);
    println!("  Orphan rate: {:.4}%", orphan_rate);

    // Orphan rate should be very low (< 0.1% under normal conditions)
    // But it's NOT zero
}
