//! LP Withdrawal Abandonment - Orphaned Funds Test
//!
//! This test proves that LP withdrawal abandonment after a failed transfer
//! creates an accounting discrepancy: tokens stay in canister but aren't
//! tracked by pool_reserve or user_balances.

/// Model that tracks BOTH internal accounting and simulated ledger state
struct LPOrphanModel {
    // Internal accounting (what the canister tracks)
    pool_reserve: u64,
    user_balances: u64,        // simplified: total user balances
    lp_shares: u64,            // simplified: total LP shares
    pending_lp_amount: u64,    // amount locked in pending LP withdrawal

    // External reality (simulated ledger)
    canister_ledger_balance: u64,
}

impl LPOrphanModel {
    fn new() -> Self {
        Self {
            pool_reserve: 0,
            user_balances: 0,
            lp_shares: 0,
            pending_lp_amount: 0,
            canister_ledger_balance: 0,
        }
    }

    /// LP deposits liquidity
    fn lp_deposit(&mut self, amount: u64) {
        // Ledger transfer happens
        self.canister_ledger_balance += amount;
        // Shares minted (simplified: 1:1)
        self.lp_shares += amount;
        // Reserve increased
        self.pool_reserve += amount;
    }

    /// Initiate LP withdrawal - mirrors production code
    fn initiate_lp_withdrawal(&mut self) -> u64 {
        let payout = self.pool_reserve; // simplified: withdraw all

        // Burn shares BEFORE transfer
        self.lp_shares = 0;

        // Reduce reserve BEFORE transfer
        self.pool_reserve = 0;

        // Create pending state
        self.pending_lp_amount = payout;

        payout
    }

    /// Transfer succeeds
    fn transfer_success(&mut self) {
        let amount = self.pending_lp_amount;
        self.pending_lp_amount = 0;

        // Ledger transfer happens
        self.canister_ledger_balance -= amount;
    }

    /// Transfer fails with definite error - rollback is safe
    fn transfer_definite_error(&mut self) {
        let amount = self.pending_lp_amount;
        self.pending_lp_amount = 0;

        // Rollback: restore shares and reserve
        self.lp_shares += amount;
        self.pool_reserve += amount;
        // Ledger unchanged (transfer never happened)
    }

    /// Transfer fails with uncertain error - NO rollback
    fn transfer_uncertain_error(&mut self) {
        // Keep pending, don't rollback
        // Ledger state is unknown
    }

    /// User abandons after uncertain error
    /// This is where orphaned funds are created!
    fn abandon_withdrawal(&mut self, transfer_actually_succeeded: bool) {
        let amount = self.pending_lp_amount;
        self.pending_lp_amount = 0;

        if transfer_actually_succeeded {
            // Transfer did happen, ledger decreased
            self.canister_ledger_balance -= amount;
        }
        // If transfer failed, ledger is unchanged
        // BUT we don't restore shares or reserve!
        // This creates orphaned funds.
    }

    /// Check the accounting invariant
    fn check_accounting(&self) -> Result<(), String> {
        let tracked = self.pool_reserve + self.user_balances + self.pending_lp_amount;

        if self.canister_ledger_balance < tracked {
            return Err(format!(
                "INSOLVENT: ledger {} < tracked {}",
                self.canister_ledger_balance, tracked
            ));
        }

        let orphaned = self.canister_ledger_balance - tracked;
        if orphaned > 0 {
            return Err(format!(
                "ORPHANED FUNDS: ledger {} > tracked {} (orphaned: {})",
                self.canister_ledger_balance, tracked, orphaned
            ));
        }

        Ok(())
    }
}

// =============================================================================
// TESTS
// =============================================================================

#[test]
fn test_lp_happy_path_no_orphan() {
    let mut model = LPOrphanModel::new();

    model.lp_deposit(1000);
    assert!(model.check_accounting().is_ok());

    model.initiate_lp_withdrawal();
    assert!(model.check_accounting().is_ok());

    model.transfer_success();
    assert!(model.check_accounting().is_ok());

    assert_eq!(model.canister_ledger_balance, 0);
    assert_eq!(model.pool_reserve, 0);
}

#[test]
fn test_lp_definite_error_no_orphan() {
    let mut model = LPOrphanModel::new();

    model.lp_deposit(1000);
    model.initiate_lp_withdrawal();
    model.transfer_definite_error();

    // Rollback happened, no orphan
    assert!(model.check_accounting().is_ok());
    assert_eq!(model.canister_ledger_balance, 1000);
    assert_eq!(model.pool_reserve, 1000);
}

#[test]
fn test_lp_abandon_transfer_succeeded_no_orphan() {
    let mut model = LPOrphanModel::new();

    model.lp_deposit(1000);
    model.initiate_lp_withdrawal();
    model.transfer_uncertain_error();

    // Transfer actually succeeded on-chain
    model.abandon_withdrawal(true);

    // No orphan - funds left the canister
    assert!(model.check_accounting().is_ok());
    assert_eq!(model.canister_ledger_balance, 0);
}

#[test]
fn test_lp_abandon_transfer_failed_creates_orphan() {
    let mut model = LPOrphanModel::new();

    model.lp_deposit(1000);
    assert!(model.check_accounting().is_ok());

    model.initiate_lp_withdrawal();
    assert!(model.check_accounting().is_ok()); // pending covers it

    model.transfer_uncertain_error();
    assert!(model.check_accounting().is_ok()); // still pending

    // Transfer actually FAILED, but user abandons anyway
    model.abandon_withdrawal(false);

    // THIS IS THE BUG: orphaned funds exist
    let result = model.check_accounting();
    assert!(result.is_err(), "Should detect orphaned funds");

    let err = result.unwrap_err();
    assert!(err.contains("ORPHANED"), "Error should mention orphaned: {}", err);

    println!("Detected: {}", err);
    println!("Canister has: {} tokens", model.canister_ledger_balance);
    println!("Accounting tracks: {} (pool) + {} (users) + {} (pending) = {}",
        model.pool_reserve, model.user_balances, model.pending_lp_amount,
        model.pool_reserve + model.user_balances + model.pending_lp_amount);
}

#[test]
fn test_orphan_accumulation() {
    let mut model = LPOrphanModel::new();
    let mut total_orphaned = 0u64;

    // Multiple LPs deposit and some abandon incorrectly
    for i in 1..=10 {
        model.lp_deposit(100);

        model.initiate_lp_withdrawal();
        model.transfer_uncertain_error();

        // 30% abandon when transfer actually failed
        if i % 3 == 0 {
            model.abandon_withdrawal(false); // transfer failed
            total_orphaned += 100;
        } else {
            model.abandon_withdrawal(true); // transfer succeeded
        }
    }

    let tracked = model.pool_reserve + model.user_balances + model.pending_lp_amount;
    let actual_orphaned = model.canister_ledger_balance - tracked;

    println!("\nOrphan accumulation test:");
    println!("  Total deposited: 1000");
    println!("  Canister balance: {}", model.canister_ledger_balance);
    println!("  Tracked: {}", tracked);
    println!("  Orphaned: {}", actual_orphaned);
    println!("  Expected orphaned: {}", total_orphaned);

    assert_eq!(actual_orphaned, total_orphaned);
    assert_eq!(actual_orphaned, 300); // 3 out of 10 abandoned incorrectly
}

/// This test shows the CONSEQUENCE: future LPs get diluted
#[test]
fn test_orphan_consequence_lp_dilution() {
    let mut model = LPOrphanModel::new();

    // LP1 deposits 1000
    model.lp_deposit(1000);

    // LP1 withdraws, times out, abandons (transfer failed)
    model.initiate_lp_withdrawal();
    model.transfer_uncertain_error();
    model.abandon_withdrawal(false);

    // Now: canister has 1000, but pool_reserve = 0, shares = 0
    assert_eq!(model.canister_ledger_balance, 1000);
    assert_eq!(model.pool_reserve, 0);

    // LP2 deposits 1000
    model.lp_deposit(1000);

    // Pool shows 1000, but canister actually has 2000!
    // The 1000 orphaned tokens benefit LP2 indirectly if they're ever recovered

    println!("\nDilution consequence:");
    println!("  LP2 deposited: 1000");
    println!("  Pool reserve shows: {}", model.pool_reserve);
    println!("  Canister actually has: {}", model.canister_ledger_balance);
    println!("  Hidden surplus: {}", model.canister_ledger_balance - model.pool_reserve);
}
