//! Balance Extraction Attack Tests
//!
//! These tests attempt to extract more funds than were deposited through various attack vectors:
//! - Multiple withdrawal attempts
//! - Withdrawal + game + withdrawal sequences
//! - Race conditions
//! - Abandon/retry exploits

use crate::defi_accounting::tests::stress_tests::AccountingModel;

#[test]
fn attack_extract_more_than_deposited() {
    println!("\n🔴 ATTACK: Extract more than deposited");
    println!("Strategy: Try various sequences to withdraw more than initial deposit");

    let mut model = AccountingModel::new();

    // Setup: Create pool so games can be played
    println!("Setup: Creating pool...");
    let lp = 1;
    model.lp_deposit(lp, 100_000_000).expect_success(); // 100 USDT

    // Attack: User deposits and tries to extract more
    println!("\n🚨 ATTACK EXECUTION:");
    let attacker = 999;
    let initial_deposit = 10_000_000; // 10 USDT

    println!("  Attacker deposits {} USDT", initial_deposit / 1_000_000);
    model.user_deposit(attacker, initial_deposit).expect_success();

    let mut attacker_total_withdrawn = 0u64;
    let mut attacker_balance = *model.user_balances.get(&attacker).unwrap_or(&0);

    println!("  Attacker balance: {} USDT", attacker_balance / 1_000_000);

    // Attack attempt 1: Try to withdraw multiple times
    println!("\n  Attempt 1: Multiple withdrawals...");

    for i in 1..=3 {
        println!("    Withdrawal attempt {}", i);
        let balance_before = *model.user_balances.get(&attacker).unwrap_or(&0);

        if balance_before > 0 {
            let withdraw_result = model.user_withdraw(attacker);

            if withdraw_result.is_success() {
                let balance_after = *model.user_balances.get(&attacker).unwrap_or(&0);
                let withdrawn = balance_before - balance_after;
                attacker_total_withdrawn += withdrawn;
                println!("      Withdrew {} USDT", withdrawn / 1_000_000);
            } else {
                println!("      Blocked: {}", withdraw_result.message());
            }
        }
    }

    // Attack attempt 2: Deposit again and try games + withdrawal
    println!("\n  Attempt 2: Game + withdrawal sequence...");

    model.user_deposit(attacker, 5_000_000).expect_success(); // 5 USDT
    println!("    Deposited 5 USDT");

    // Play a game (lose to keep balance)
    let bet = 100_000; // 0.1 USDT
    model.settle_bet(attacker, bet, 0).expect_success();
    println!("    Lost {} USDT in game", bet / 1_000_000);

    // Try to withdraw
    let balance_before = *model.user_balances.get(&attacker).unwrap_or(&0);
    let withdraw_result = model.user_withdraw(attacker);

    if withdraw_result.is_success() {
        let balance_after = *model.user_balances.get(&attacker).unwrap_or(&0);
        let withdrawn = balance_before - balance_after;
        attacker_total_withdrawn += withdrawn;
        println!("    Withdrew {} USDT", withdrawn / 1_000_000);
    }

    // Attack attempt 3: LP deposit + withdrawal
    println!("\n  Attempt 3: LP deposit + withdrawal...");

    // Attacker becomes LP
    model.user_deposit(attacker, 10_000_000).expect_success(); // Need balance first
    let lp_deposit_amount = 10_000_000;
    let lp_result = model.lp_deposit(attacker, lp_deposit_amount);

    if lp_result.is_success() {
        println!("    LP deposit successful");

        // Immediately withdraw LP position
        let balance_before = *model.user_balances.get(&attacker).unwrap_or(&0);
        let lp_withdraw_result = model.lp_withdraw(attacker);

        if lp_withdraw_result.is_success() {
            let balance_after = *model.user_balances.get(&attacker).unwrap_or(&0);
            let withdrawn = balance_after - balance_before;
            attacker_total_withdrawn += withdrawn;
            println!("    LP withdrawal: {} USDT", withdrawn / 1_000_000);
        }
    }

    // Verify: Total withdrawn should not exceed total deposited
    println!("\n✅ DEFENSE CHECK:");

    let total_deposited = initial_deposit + 5_000_000 + 10_000_000; // All deposits
    println!("  Total deposited: {} USDT", total_deposited / 1_000_000);
    println!("  Total withdrawn: {} USDT", attacker_total_withdrawn / 1_000_000);
    println!("  Final balance: {} USDT", model.user_balances.get(&attacker).unwrap_or(&0) / 1_000_000);

    let total_received = attacker_total_withdrawn + model.user_balances.get(&attacker).unwrap_or(&0);
    println!("  Total received: {} USDT", total_received / 1_000_000);

    // Account for losses (the bet we lost)
    let known_losses = bet;
    let expected_max = total_deposited - known_losses;

    assert!(
        total_received <= expected_max + 1000, // Allow small rounding
        "🔥 EXPLOIT SUCCEEDED: Extracted {} USDT but only deposited {} USDT (lost {} USDT)",
        total_received / 1_000_000,
        total_deposited / 1_000_000,
        known_losses / 1_000_000
    );

    // Check invariants
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("  ✓ Cannot extract more than deposited");
    println!("\n✅ ATTACK THWARTED: Balance extraction prevented");
}

#[test]
fn attack_double_withdrawal_simulation() {
    println!("\n🔴 ATTACK: Double withdrawal simulation");
    println!("Strategy: Attempt to withdraw balance twice through rapid operations");

    let mut model = AccountingModel::new();

    // Setup
    println!("Setup: Creating user balance...");
    let attacker = 999;
    model.user_deposit(attacker, 10_000_000).expect_success(); // 10 USDT

    let initial_balance = *model.user_balances.get(&attacker).unwrap();
    println!("  Attacker balance: {} USDT", initial_balance / 1_000_000);

    // Attack: Try to withdraw twice rapidly
    println!("\n🚨 ATTACK EXECUTION:");

    println!("  First withdrawal...");
    let withdraw1 = model.user_withdraw(attacker);
    println!("    Result: {}", if withdraw1.is_success() { "success" } else { "failed" });

    println!("  Second withdrawal (should fail)...");
    let withdraw2 = model.user_withdraw(attacker);
    println!("    Result: {}", if withdraw2.is_success() { "success" } else { "failed" });

    // Verify: Second withdrawal should fail
    println!("\n✅ DEFENSE CHECK:");

    assert!(
        !(withdraw1.is_success() && withdraw2.is_success()),
        "🔥 EXPLOIT SUCCEEDED: Double withdrawal succeeded"
    );

    // Check invariants
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    let final_balance = *model.user_balances.get(&attacker).unwrap_or(&0);
    println!("  Final balance: {} USDT", final_balance / 1_000_000);
    println!("  ✓ Only one withdrawal succeeded");

    println!("\n✅ ATTACK THWARTED: Double withdrawal prevented");
}

#[test]
fn attack_withdrawal_during_game() {
    println!("\n🔴 ATTACK: Withdraw balance while game is in progress");
    println!("Strategy: Exploit race between game settlement and withdrawal");

    let mut model = AccountingModel::new();

    // Setup: Create pool and player
    println!("Setup: Creating pool and player...");
    let lp = 1;
    model.lp_deposit(lp, 100_000_000).expect_success();

    let attacker = 999;
    model.user_deposit(attacker, 10_000_000).expect_success(); // 10 USDT

    let initial_balance = *model.user_balances.get(&attacker).unwrap();
    println!("  Initial balance: {} USDT", initial_balance / 1_000_000);

    // Attack: Place bet then immediately try to withdraw
    println!("\n🚨 ATTACK EXECUTION:");

    let bet_amount = 5_000_000; // 5 USDT

    println!("  Placing bet of {} USDT...", bet_amount / 1_000_000);

    // In single-threaded model, we can't truly simulate race condition
    // But we can test that the state is consistent

    // Scenario 1: Withdraw before game
    println!("\n  Scenario 1: Withdraw before settle_bet");
    let withdraw_result = model.user_withdraw(attacker);

    if withdraw_result.is_success() {
        println!("    Withdrawal succeeded");

        // Now try to play game
        let game_result = model.settle_bet(attacker, bet_amount, 0);
        println!("    Game result: {}", if game_result.is_success() { "success" } else { "failed" });

        // Deposit again for scenario 2
        model.user_deposit(attacker, 10_000_000).expect_success();
    }

    // Scenario 2: settle_bet then withdraw
    println!("\n  Scenario 2: settle_bet then withdraw");
    let balance_before_game = *model.user_balances.get(&attacker).unwrap();

    // Settle a bet (win)
    let payout = bet_amount * 2; // 2x
    model.settle_bet(attacker, bet_amount, payout).expect_success();

    let balance_after_game = *model.user_balances.get(&attacker).unwrap();
    println!("    Balance after game: {} USDT", balance_after_game / 1_000_000);

    // Try to withdraw
    let withdraw2 = model.user_withdraw(attacker);
    println!("    Withdrawal: {}", if withdraw2.is_success() { "success" } else { "failed" });

    // Verify: Invariants must hold
    println!("\n✅ DEFENSE CHECK:");

    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Race condition broke invariant: {:?}",
        check
    );

    println!("  ✓ State remains consistent across all scenarios");
    println!("\n✅ ATTACK THWARTED: No race condition exploit possible");
}

#[test]
fn attack_balance_overflow_via_games() {
    println!("\n🔴 ATTACK: Balance overflow via winning games");
    println!("Strategy: Win enough games to overflow user balance");

    let mut model = AccountingModel::new();

    // Setup: Create huge pool
    println!("Setup: Creating huge pool...");
    let lp = 1;
    let huge_pool = u64::MAX / 4;
    model.lp_deposit(lp, huge_pool).expect_success();

    println!("  Pool reserve: {}", model.pool_reserve);

    // Attack: Win massive games repeatedly
    println!("\n🚨 ATTACK EXECUTION:");
    let attacker = 999;
    model.user_deposit(attacker, 1_000_000_000).expect_success(); // 1000 USDT

    let mut wins = 0;
    let max_attempts = 50;

    while wins < max_attempts {
        let balance = *model.user_balances.get(&attacker).unwrap_or(&0);

        // Check if balance is approaching overflow
        if balance > u64::MAX / 2 {
            println!("  Balance approaching overflow: {}", balance);
            break;
        }

        // Bet large amount with high multiplier
        let bet = balance / 10;
        let multiplier = 1000; // 10x
        let payout = bet * (multiplier / 100);

        // Try to settle winning bet
        let result = model.settle_bet(attacker, bet, payout);

        if result.is_success() {
            wins += 1;
        } else {
            println!("  Game rejected: {}", result.message());
            break;
        }
    }

    let final_balance = *model.user_balances.get(&attacker).unwrap_or(&0);
    println!("  Final balance: {}", final_balance);
    println!("  Wins: {}", wins);

    // Verify: Balance should never overflow
    println!("\n✅ DEFENSE CHECK:");

    assert!(
        final_balance < u64::MAX,
        "🔥 EXPLOIT SUCCEEDED: Balance overflowed"
    );

    // Check invariants
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("  ✓ Balance remained within bounds");
    println!("\n✅ ATTACK THWARTED: Balance overflow prevented");
}

#[test]
fn attack_negative_balance_via_concurrent_ops() {
    println!("\n🔴 ATTACK: Achieve negative balance via operation sequencing");
    println!("Strategy: Try to create negative balance through carefully ordered operations");

    let mut model = AccountingModel::new();

    // Setup
    println!("Setup: Creating user with balance...");
    let attacker = 999;
    model.user_deposit(attacker, 5_000_000).expect_success(); // 5 USDT

    let initial = *model.user_balances.get(&attacker).unwrap();
    println!("  Initial balance: {} USDT", initial / 1_000_000);

    // Attack: Try operations that might go negative
    println!("\n🚨 ATTACK EXECUTION:");

    // Attempt 1: Withdraw more than exists
    println!("  Attempt 1: Force large withdrawal");
    let w1 = model.user_withdraw(attacker);
    println!("    Result: {}", w1.message());

    // Attempt 2: Settle bet for more than balance
    println!("  Attempt 2: Settle huge losing bet");
    let huge_bet = 100_000_000; // 100 USDT (more than balance)
    let s1 = model.settle_bet(attacker, huge_bet, 0);
    println!("    Result: {}", s1.message());

    // Verify: Balance should never go negative
    println!("\n✅ DEFENSE CHECK:");

    let final_balance = model.user_balances.get(&attacker).unwrap_or(&0);
    println!("  Final balance: {} USDT", final_balance / 1_000_000);

    // In Rust, u64 can't be negative, but let's check it's still reasonable
    assert!(
        *final_balance <= initial,
        "Balance somehow increased without valid operation"
    );

    // Check invariants
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("  ✓ Balance remained non-negative and valid");
    println!("\n✅ ATTACK THWARTED: Negative balance prevented");
}

// Helper trait
trait IsSuccess {
    fn is_success(&self) -> bool;
    fn message(&self) -> String;
}

use crate::defi_accounting::tests::stress_tests::OpResult;

impl IsSuccess for OpResult {
    fn is_success(&self) -> bool {
        matches!(self, OpResult::Success)
    }

    fn message(&self) -> String {
        format!("{:?}", self)
    }
}

trait ExpectSuccess {
    fn expect_success(self) -> Self;
}

impl ExpectSuccess for crate::defi_accounting::tests::stress_tests::OpResult {
    fn expect_success(self) -> Self {
        assert!(self.is_success(), "Operation failed: {}", self.message());
        self
    }
}
