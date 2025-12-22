//! Withdrawal Recovery Protocol Tests
//!
//! These tests verify the three-phase withdrawal protocol handles all edge cases:
//! 1. Initiate - Create pending state, zero balance
//! 2. Transfer - Attempt ICRC-1 transfer (may fail or timeout)
//! 3. Complete/Rollback/Abandon - Handle outcome
//!
//! The key property: NO double-spend is possible, even in timeout scenarios.

use std::collections::HashMap;

// =============================================================================
// WITHDRAWAL STATE MACHINE MODEL
// =============================================================================

/// Models the three-phase withdrawal protocol
/// This mirrors the production logic in accounting.rs
#[derive(Debug, Clone, PartialEq)]
enum WithdrawalState {
    None,
    Pending {
        amount: u64,
        created_at: u64,
        attempts: u32,
    },
}

/// Possible outcomes of a transfer attempt
#[derive(Debug, Clone, Copy)]
enum TransferOutcome {
    Success,
    DefiniteError, // Transfer failed, safe to rollback
    UncertainError, // Timeout - don't know if it succeeded
}

/// Withdrawal protocol state machine
struct WithdrawalModel {
    user_balances: HashMap<u64, u64>,
    pending_withdrawals: HashMap<u64, WithdrawalState>,
    on_chain_balances: HashMap<u64, u64>, // Simulates ledger state
    canister_balance: u64,
    timestamp: u64,
}

impl WithdrawalModel {
    fn new() -> Self {
        Self {
            user_balances: HashMap::new(),
            pending_withdrawals: HashMap::new(),
            on_chain_balances: HashMap::new(),
            canister_balance: 0,
            timestamp: 0,
        }
    }

    /// Deposit funds (for setup)
    fn deposit(&mut self, user: u64, amount: u64) {
        *self.user_balances.entry(user).or_insert(0) += amount;
        self.canister_balance += amount;
    }

    /// Phase 1: Initiate withdrawal
    fn initiate_withdrawal(&mut self, user: u64) -> Result<u64, &'static str> {
        // Check no pending withdrawal exists
        if matches!(self.pending_withdrawals.get(&user), Some(WithdrawalState::Pending { .. })) {
            return Err("Already has pending withdrawal");
        }

        // Get and zero balance atomically
        let balance = self.user_balances.get(&user).copied().unwrap_or(0);
        if balance == 0 {
            return Err("No balance to withdraw");
        }

        // Zero balance
        self.user_balances.insert(user, 0);

        // Create pending state
        self.timestamp += 1;
        self.pending_withdrawals.insert(
            user,
            WithdrawalState::Pending {
                amount: balance,
                created_at: self.timestamp,
                attempts: 0,
            },
        );

        Ok(balance)
    }

    /// Phase 2: Attempt transfer (simulated with explicit outcome)
    fn attempt_transfer(&mut self, user: u64, outcome: TransferOutcome) -> Result<(), &'static str> {
        let state = self.pending_withdrawals.get_mut(&user)
            .ok_or("No pending withdrawal")?;

        if let WithdrawalState::Pending { amount, attempts, .. } = state {
            *attempts += 1;

            match outcome {
                TransferOutcome::Success => {
                    // Transfer succeeded - update on-chain balance
                    *self.on_chain_balances.entry(user).or_insert(0) += *amount;
                    self.canister_balance -= *amount;

                    // Clear pending state
                    self.pending_withdrawals.remove(&user);
                    Ok(())
                }
                TransferOutcome::DefiniteError => {
                    // Transfer definitely failed - safe to rollback on first attempt
                    if *attempts == 1 {
                        // Rollback balance
                        *self.user_balances.entry(user).or_insert(0) += *amount;
                        self.pending_withdrawals.remove(&user);
                    }
                    // Keep pending if not first attempt
                    Err("Transfer failed")
                }
                TransferOutcome::UncertainError => {
                    // Timeout - DON'T rollback automatically (would cause double-spend)
                    // Keep pending, user must check on-chain and decide
                    Err("Transfer uncertain - check on-chain balance")
                }
            }
        } else {
            Err("Invalid state")
        }
    }

    /// User checks on-chain and confirms receipt
    fn confirm_receipt(&mut self, user: u64) -> Result<(), &'static str> {
        if !matches!(self.pending_withdrawals.get(&user), Some(WithdrawalState::Pending { .. })) {
            return Err("No pending withdrawal");
        }

        // User verified funds arrived on-chain
        // Clear pending without restoring balance
        self.pending_withdrawals.remove(&user);
        Ok(())
    }

    /// User checks on-chain and abandons (funds not received)
    fn abandon_withdrawal(&mut self, user: u64) -> Result<(), &'static str> {
        if !matches!(self.pending_withdrawals.get(&user), Some(WithdrawalState::Pending { .. })) {
            return Err("No pending withdrawal");
        }

        // CRITICAL: Do NOT restore balance
        // This prevents double-spend if transfer actually succeeded
        // Worst case: user loses funds (better than protocol insolvency)
        self.pending_withdrawals.remove(&user);
        Ok(())
    }

    /// Retry withdrawal with idempotency
    fn retry_withdrawal(&mut self, user: u64, outcome: TransferOutcome) -> Result<(), &'static str> {
        // Retry uses same created_at for ledger idempotency
        self.attempt_transfer(user, outcome)
    }

    /// Check invariant: canister has enough to cover all obligations
    fn check_solvency(&self) -> bool {
        let total_user_balances: u64 = self.user_balances.values().sum();
        let total_pending: u64 = self.pending_withdrawals.values()
            .filter_map(|s| match s {
                WithdrawalState::Pending { amount, .. } => Some(*amount),
                _ => None,
            })
            .sum();

        // Canister must cover user balances + pending withdrawals
        self.canister_balance >= total_user_balances + total_pending
    }
}

// =============================================================================
// TEST SCENARIOS
// =============================================================================

#[test]
fn test_withdrawal_happy_path() {
    let mut model = WithdrawalModel::new();

    // Setup
    model.deposit(1, 100);
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 100);
    assert!(model.check_solvency());

    // Initiate
    let amount = model.initiate_withdrawal(1).unwrap();
    assert_eq!(amount, 100);
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 0);
    assert!(model.check_solvency());

    // Transfer succeeds
    model.attempt_transfer(1, TransferOutcome::Success).unwrap();

    // Verify final state
    assert_eq!(model.on_chain_balances.get(&1).copied().unwrap_or(0), 100);
    assert_eq!(model.canister_balance, 0);
    assert!(!matches!(model.pending_withdrawals.get(&1), Some(WithdrawalState::Pending { .. })));
    assert!(model.check_solvency());
}

#[test]
fn test_withdrawal_definite_error_first_attempt() {
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);

    model.initiate_withdrawal(1).unwrap();

    // Transfer definitely fails
    let result = model.attempt_transfer(1, TransferOutcome::DefiniteError);
    assert!(result.is_err());

    // Balance should be restored (first attempt rollback is safe)
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 100);
    assert!(!matches!(model.pending_withdrawals.get(&1), Some(WithdrawalState::Pending { .. })));
    assert!(model.check_solvency());
}

#[test]
fn test_withdrawal_timeout_no_auto_rollback() {
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);

    model.initiate_withdrawal(1).unwrap();

    // Transfer times out (uncertain)
    let result = model.attempt_transfer(1, TransferOutcome::UncertainError);
    assert!(result.is_err());

    // Balance should NOT be restored (could cause double-spend)
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 0);

    // Pending should still exist
    assert!(matches!(
        model.pending_withdrawals.get(&1),
        Some(WithdrawalState::Pending { amount: 100, .. })
    ));

    // Solvency holds because canister still has the funds
    assert!(model.check_solvency());
}

#[test]
fn test_timeout_then_confirm_receipt() {
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);

    model.initiate_withdrawal(1).unwrap();
    let _ = model.attempt_transfer(1, TransferOutcome::UncertainError);

    // Simulate: transfer actually succeeded on-chain
    // (In real scenario, user checks their wallet)
    model.on_chain_balances.insert(1, 100);
    model.canister_balance = 0;

    // User confirms receipt
    model.confirm_receipt(1).unwrap();

    // Pending cleared, no double-spend
    assert!(!matches!(model.pending_withdrawals.get(&1), Some(WithdrawalState::Pending { .. })));
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 0);
}

#[test]
fn test_timeout_then_abandon() {
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);

    model.initiate_withdrawal(1).unwrap();
    let _ = model.attempt_transfer(1, TransferOutcome::UncertainError);

    // User checks on-chain, funds didn't arrive
    // They call abandon (accepting potential loss)
    model.abandon_withdrawal(1).unwrap();

    // Balance NOT restored (prevents double-spend)
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 0);

    // Funds remain in canister (orphaned)
    assert_eq!(model.canister_balance, 100);
    assert!(model.check_solvency());
}

#[test]
fn test_retry_after_timeout_succeeds() {
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);

    model.initiate_withdrawal(1).unwrap();

    // First attempt times out
    let _ = model.attempt_transfer(1, TransferOutcome::UncertainError);

    // Retry succeeds
    model.retry_withdrawal(1, TransferOutcome::Success).unwrap();

    // Funds transferred, no double-spend
    assert_eq!(model.on_chain_balances.get(&1).copied().unwrap_or(0), 100);
    assert_eq!(model.canister_balance, 0);
    assert_eq!(model.user_balances.get(&1).copied().unwrap_or(0), 0);
}

#[test]
fn test_concurrent_withdrawal_blocked() {
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);

    model.initiate_withdrawal(1).unwrap();

    // Try to initiate again while pending
    let result = model.initiate_withdrawal(1);
    assert_eq!(result, Err("Already has pending withdrawal"));
}

#[test]
fn test_no_double_spend_scenarios() {
    // Scenario 1: Timeout, then retry succeeds, then malicious confirm
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);

    model.initiate_withdrawal(1).unwrap();
    let _ = model.attempt_transfer(1, TransferOutcome::UncertainError);
    model.retry_withdrawal(1, TransferOutcome::Success).unwrap();

    // Malicious user tries to confirm again (no pending exists)
    let result = model.confirm_receipt(1);
    assert!(result.is_err());

    // Only 100 on-chain, not 200
    assert_eq!(model.on_chain_balances.get(&1).copied().unwrap_or(0), 100);
}

#[test]
fn test_solvency_invariant_all_scenarios() {
    let mut model = WithdrawalModel::new();

    // Multiple users
    for user in 1..=5 {
        model.deposit(user, 100);
    }
    assert!(model.check_solvency());

    // Various withdrawal states
    model.initiate_withdrawal(1).unwrap(); // Pending
    model.attempt_transfer(1, TransferOutcome::Success).unwrap(); // Completed
    assert!(model.check_solvency());

    model.initiate_withdrawal(2).unwrap();
    let _ = model.attempt_transfer(2, TransferOutcome::UncertainError); // Stuck
    assert!(model.check_solvency());

    model.initiate_withdrawal(3).unwrap();
    let _ = model.attempt_transfer(3, TransferOutcome::DefiniteError); // Rolled back
    assert!(model.check_solvency());

    // Solvency must hold throughout
    assert!(model.check_solvency());
}

// =============================================================================
// STRESS TESTS
// =============================================================================

#[test]
fn test_many_concurrent_users() {
    use rand::{SeedableRng, Rng};
    use rand_chacha::ChaCha8Rng;

    let mut model = WithdrawalModel::new();
    let mut rng = ChaCha8Rng::seed_from_u64(42);

    // 100 users deposit
    for user in 1..=100 {
        model.deposit(user, 1000);
    }

    // Random withdrawal operations
    for _ in 0..1000 {
        let user = rng.gen_range(1..=100);

        match rng.gen_range(0..5) {
            0 => {
                // Try to initiate
                let _ = model.initiate_withdrawal(user);
            }
            1 => {
                // Try success transfer
                let _ = model.attempt_transfer(user, TransferOutcome::Success);
            }
            2 => {
                // Try timeout
                let _ = model.attempt_transfer(user, TransferOutcome::UncertainError);
            }
            3 => {
                // Try confirm
                let _ = model.confirm_receipt(user);
            }
            4 => {
                // Try abandon
                let _ = model.abandon_withdrawal(user);
            }
            _ => {}
        }

        // Solvency must always hold
        assert!(
            model.check_solvency(),
            "Solvency violated after operation"
        );
    }
}

#[test]
fn test_withdrawal_ordering_independence() {
    // Verify that user A's withdrawal doesn't affect user B
    let mut model = WithdrawalModel::new();
    model.deposit(1, 100);
    model.deposit(2, 200);

    // User 1 starts withdrawal
    model.initiate_withdrawal(1).unwrap();

    // User 2 should still be able to withdraw
    model.initiate_withdrawal(2).unwrap();

    // Both have pending
    assert!(matches!(model.pending_withdrawals.get(&1), Some(WithdrawalState::Pending { amount: 100, .. })));
    assert!(matches!(model.pending_withdrawals.get(&2), Some(WithdrawalState::Pending { amount: 200, .. })));

    // User 1 times out
    let _ = model.attempt_transfer(1, TransferOutcome::UncertainError);

    // User 2 succeeds
    model.attempt_transfer(2, TransferOutcome::Success).unwrap();

    // User 2's funds arrived, user 1's still pending
    assert_eq!(model.on_chain_balances.get(&2).copied().unwrap_or(0), 200);
    assert!(matches!(model.pending_withdrawals.get(&1), Some(WithdrawalState::Pending { .. })));

    assert!(model.check_solvency());
}
