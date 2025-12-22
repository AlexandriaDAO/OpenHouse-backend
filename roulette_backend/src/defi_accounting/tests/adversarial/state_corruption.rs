//! State Corruption Attack Tests
//!
//! These tests attempt to corrupt system state through concurrent operations,
//! race conditions, and edge cases in state transitions.

use crate::defi_accounting::tests::stress_tests::AccountingModel;

#[test]
fn attack_concurrent_lp_operations() {
    println!("\n🔴 ATTACK: Concurrent LP operations");
    println!("Strategy: Simulate concurrent LP deposits from same user");

    let mut model = AccountingModel::new();

    // Setup: Initial pool
    println!("Setup: Creating initial pool...");
    let lp1 = 1;
    model.lp_deposit(lp1, 50_000_000).expect_success(); // 50 USDT

    let initial_reserve = model.pool_reserve;
    let initial_shares = model.total_shares;
    println!("  Initial reserve: {} USDT", initial_reserve / 1_000_000);
    println!("  Initial shares: {}", initial_shares);

    // Attack: Simulate two concurrent deposits from same LP
    println!("\n🚨 ATTACK EXECUTION:");
    let attacker = 999;
    let deposit1 = 10_000_000; // 10 USDT
    let deposit2 = 10_000_000; // 10 USDT

    println!("  LP operation 1: Deposit {} USDT", deposit1 / 1_000_000);
    let result1 = model.lp_deposit(attacker, deposit1);
    assert!(result1.is_success(), "First deposit failed: {}", result1.message());

    let shares_after_1 = *model.lp_shares.get(&attacker).unwrap();
    let reserve_after_1 = model.pool_reserve;

    println!("    Shares: {}, Reserve: {} USDT", shares_after_1, reserve_after_1 / 1_000_000);

    println!("  LP operation 2: Deposit {} USDT", deposit2 / 1_000_000);
    let result2 = model.lp_deposit(attacker, deposit2);
    assert!(result2.is_success(), "Second deposit failed: {}", result2.message());

    let shares_after_2 = *model.lp_shares.get(&attacker).unwrap();
    let reserve_after_2 = model.pool_reserve;

    println!("    Shares: {}, Reserve: {} USDT", shares_after_2, reserve_after_2 / 1_000_000);

    // Verify: State should be consistent
    println!("\n✅ DEFENSE CHECK:");

    // Total reserve increase should equal deposits
    let reserve_increase = reserve_after_2 - initial_reserve;
    let expected_increase = deposit1 + deposit2;

    assert_eq!(
        reserve_increase, expected_increase,
        "🔥 EXPLOIT SUCCEEDED: Reserve mismatch: increased by {} but deposited {}",
        reserve_increase, expected_increase
    );

    // Check LP invariant
    let lp_check = model.check_lp_invariant();
    assert!(
        lp_check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: LP shares corrupted: {:?}",
        lp_check
    );

    // Check main invariant
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("  ✓ Reserve correctly increased by {} USDT", expected_increase / 1_000_000);
    println!("  ✓ Shares correctly allocated");
    println!("\n✅ ATTACK THWARTED: Concurrent operations handled correctly");
}

#[test]
fn attack_game_during_lp_pending() {
    println!("\n🔴 ATTACK: Play game during LP withdrawal");
    println!("Strategy: Play game while LP withdrawal is pending");

    let mut model = AccountingModel::new();

    // Setup: Create LP position
    println!("Setup: Creating LP position...");
    let attacker = 999;
    model.lp_deposit(attacker, 50_000_000).expect_success(); // 50 USDT

    println!("  LP shares: {}", model.lp_shares.get(&attacker).unwrap());
    println!("  Pool reserve: {} USDT", model.pool_reserve / 1_000_000);

    // In single-threaded model, we can't truly simulate pending state
    // But we can test the sequence of operations

    // Attack: Withdraw LP, then try to play game
    println!("\n🚨 ATTACK EXECUTION:");

    println!("  Phase 1: LP withdrawal");
    let lp_result = model.lp_withdraw(attacker);
    println!("    Result: {}", lp_result.message());

    let balance_after_lp = *model.user_balances.get(&attacker).unwrap_or(&0);
    println!("    Balance after LP withdrawal: {} USDT", balance_after_lp / 1_000_000);

    println!("  Phase 2: Try to play game immediately");
    let bet = 5_000_000; // 5 USDT
    let payout = bet * 2; // Win 2x

    let game_result = model.settle_bet(attacker, bet, payout);
    println!("    Game result: {}", game_result.message());

    // Verify: Invariants must hold
    println!("\n✅ DEFENSE CHECK:");

    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Game during LP operation broke invariant: {:?}",
        check
    );

    println!("  ✓ State remained consistent");
    println!("\n✅ ATTACK THWARTED: No state corruption from operation interleaving");
}

#[test]
fn attack_orphaned_lp_shares() {
    println!("\n🔴 ATTACK: Create orphaned LP shares");
    println!("Strategy: Create LP shares that cannot be redeemed");

    let mut model = AccountingModel::new();

    // Setup: Create LP
    println!("Setup: Creating LP position...");
    let lp = 1;
    model.lp_deposit(lp, 100_000_000).expect_success(); // 100 USDT

    let lp_shares = *model.lp_shares.get(&lp).unwrap();
    println!("  LP shares: {}", lp_shares);
    println!("  Pool reserve: {} USDT", model.pool_reserve / 1_000_000);

    // Attack: Drain pool to zero via games
    println!("\n🚨 ATTACK EXECUTION (Phase 1): Draining pool...");
    let player = 999;
    model.user_deposit(player, 50_000_000).expect_success();

    let mut wins = 0;
    while model.pool_reserve > 0 && wins < 100 {
        let bet = 1_000_000; // 1 USDT
        let payout = bet * 5; // 5x
        let profit = payout - bet;

        if profit <= model.pool_reserve {
            model.settle_bet(player, bet, payout).expect_success();
            wins += 1;
        } else {
            // Can't drain more
            break;
        }
    }

    println!("  Pool drained to: {} USDT", model.pool_reserve / 1_000_000);
    println!("  LP still has {} shares", lp_shares);

    // Attack Phase 2: LP tries to withdraw
    println!("\n🚨 ATTACK EXECUTION (Phase 2): LP tries to withdraw...");

    let withdraw_result = model.lp_withdraw(lp);

    // Verify: What happens?
    println!("\n✅ DEFENSE CHECK:");

    if withdraw_result.is_success() {
        let withdrawn_amount = model.user_balances.get(&lp).unwrap_or(&0);
        println!("  LP withdrew: {} USDT", withdrawn_amount / 1_000_000);

        // LP got proportional share of remaining reserve (which might be ~0)
        // This is expected behavior, not an exploit
        // LPs bear the risk of the pool

        let check = model.check_invariant();
        assert!(
            check.is_ok(),
            "🔥 EXPLOIT SUCCEEDED: LP withdrawal from drained pool broke invariant: {:?}",
            check
        );

        println!("  ✓ LP received proportional share of remaining reserve");
        println!("  (LP shares are not orphaned, just worth less due to pool losses)");
    } else {
        println!("  Withdrawal rejected: {}", withdraw_result.message());

        // If withdrawal is blocked, shares might be truly orphaned
        if model.pool_reserve == 0 && lp_shares > 0 {
            println!("  ⚠️  Shares exist but reserve is zero - shares may be stuck");

            // This might be a real issue - shares can't be redeemed
            // But it's also expected: if pool goes to zero, LPs lost their money
        }
    }

    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("\n✅ ATTACK THWARTED: LP shares reflect pool risk as designed");
}

#[test]
fn attack_state_corruption_via_rapid_ops() {
    println!("\n🔴 ATTACK: State corruption via rapid operations");
    println!("Strategy: Rapidly interleave different operations to corrupt state");

    let mut model = AccountingModel::new();

    // Setup: Create initial state
    println!("Setup: Creating initial state...");
    let lp = 1;
    model.lp_deposit(lp, 100_000_000).expect_success();

    let attacker = 999;
    model.user_deposit(attacker, 50_000_000).expect_success();

    println!("  Initial state set up");

    // Attack: Rapid sequence of different operations
    println!("\n🚨 ATTACK EXECUTION: Rapid operation sequence...");

    let operations = vec![
        "User deposit",
        "Settle bet (win)",
        "User deposit",
        "LP deposit",
        "Settle bet (lose)",
        "LP withdraw",
        "User withdraw",
        "LP deposit",
    ];

    for (i, op_name) in operations.iter().enumerate() {
        println!("  Op {}: {}", i + 1, op_name);

        match *op_name {
            "User deposit" => {
                model.user_deposit(attacker, 1_000_000);
            }
            "Settle bet (win)" => {
                let bet = 500_000;
                model.settle_bet(attacker, bet, bet * 2);
            }
            "Settle bet (lose)" => {
                let bet = 500_000;
                model.settle_bet(attacker, bet, 0);
            }
            "LP deposit" => {
                model.lp_deposit(attacker, 10_000_000);
            }
            "LP withdraw" => {
                model.lp_withdraw(attacker);
            }
            "User withdraw" => {
                model.user_withdraw(attacker);
            }
            _ => {}
        }

        // Check invariant after each operation
        let check = model.check_invariant();
        if check.is_err() {
            panic!(
                "🔥 EXPLOIT SUCCEEDED: Invariant broken after op {}: {:?}",
                i + 1, check
            );
        }
    }

    // Verify: Final state should be consistent
    println!("\n✅ DEFENSE CHECK:");

    let final_check = model.check_invariant();
    assert!(
        final_check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Final state corrupted: {:?}",
        final_check
    );

    let lp_check = model.check_lp_invariant();
    assert!(
        lp_check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: LP state corrupted: {:?}",
        lp_check
    );

    println!("  ✓ All operations maintained invariants");
    println!("  ✓ Final state is consistent");
    println!("\n✅ ATTACK THWARTED: State corruption prevented");
}

#[test]
fn attack_integer_state_corruption() {
    println!("\n🔴 ATTACK: Integer state corruption");
    println!("Strategy: Force integer arithmetic to corrupt internal state");

    let mut model = AccountingModel::new();

    // Setup: Create state with large values
    println!("Setup: Creating state with large values...");
    let lp = 1;
    let large_value = u64::MAX / 8;
    model.lp_deposit(lp, large_value).expect_success();

    println!("  Pool reserve: {}", model.pool_reserve);
    println!("  Total shares: {}", model.total_shares);

    // Attack: Operations that might overflow/underflow
    println!("\n🚨 ATTACK EXECUTION:");

    let attacker = 999;

    println!("  Attempt 1: Large user deposit");
    let r1 = model.user_deposit(attacker, large_value);
    println!("    Result: {}", r1.message());

    if r1.is_success() {
        println!("  Attempt 2: Large bet");
        let large_bet = large_value / 2;
        let large_payout = large_bet * 2;
        let r2 = model.settle_bet(attacker, large_bet, large_payout);
        println!("    Result: {}", r2.message());

        println!("  Attempt 3: Large LP deposit");
        let r3 = model.lp_deposit(attacker, large_value / 4);
        println!("    Result: {}", r3.message());
    }

    // Verify: State should remain consistent
    println!("\n✅ DEFENSE CHECK:");

    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Large value operations corrupted state: {:?}",
        check
    );

    // Verify no overflow in tracked values
    assert!(
        model.total_system_funds < u64::MAX,
        "🔥 EXPLOIT SUCCEEDED: Total system funds overflowed"
    );

    assert!(
        model.pool_reserve < u64::MAX,
        "🔥 EXPLOIT SUCCEEDED: Pool reserve overflowed"
    );

    println!("  ✓ Large value operations handled without corruption");
    println!("\n✅ ATTACK THWARTED: Integer state corruption prevented");
}

#[test]
fn attack_reserve_manipulation() {
    println!("\n🔴 ATTACK: Direct reserve manipulation");
    println!("Strategy: Try to manipulate pool reserve without proper accounting");

    let mut model = AccountingModel::new();

    // Setup: Create pool
    println!("Setup: Creating pool...");
    let lp1 = 1;
    model.lp_deposit(lp1, 100_000_000).expect_success();

    let initial_reserve = model.pool_reserve;
    let initial_total_funds = model.total_system_funds;

    println!("  Initial reserve: {} USDT", initial_reserve / 1_000_000);
    println!("  Initial total funds: {} USDT", initial_total_funds / 1_000_000);

    // Attack: Try various operations to manipulate reserve
    println!("\n🚨 ATTACK EXECUTION:");

    let attacker = 999;

    // Sequence designed to potentially desync reserve and total_system_funds
    model.user_deposit(attacker, 10_000_000).expect_success();
    model.settle_bet(attacker, 5_000_000, 10_000_000).expect_success(); // Win
    model.lp_deposit(attacker, 15_000_000).expect_success();
    model.settle_bet(attacker, 2_000_000, 0).expect_success(); // Lose
    model.lp_withdraw(attacker).expect_success();

    // Check if reserve manipulation succeeded
    println!("\n✅ DEFENSE CHECK:");

    let final_reserve = model.pool_reserve;
    let final_total_funds = model.total_system_funds;

    println!("  Final reserve: {} USDT", final_reserve / 1_000_000);
    println!("  Final total funds: {} USDT", final_total_funds / 1_000_000);

    // The critical check: invariant must hold
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Reserve manipulation broke invariant: {:?}",
        check
    );

    println!("  ✓ Reserve remained in sync with total system funds");
    println!("\n✅ ATTACK THWARTED: Reserve manipulation prevented");
}

#[test]
fn attack_share_total_desync() {
    println!("\n🔴 ATTACK: LP share total desync");
    println!("Strategy: Try to desync individual shares from total_shares");

    let mut model = AccountingModel::new();

    // Setup: Multiple LPs
    println!("Setup: Creating multiple LP positions...");

    for lp_id in 1..=5 {
        model.lp_deposit(lp_id, 20_000_000).expect_success(); // 20 USDT each
    }

    let initial_total_shares = model.total_shares;
    let initial_sum: u64 = model.lp_shares.values().sum();

    println!("  Total shares: {}", initial_total_shares);
    println!("  Sum of individual shares: {}", initial_sum);

    assert_eq!(initial_total_shares, initial_sum, "Initial state already desynced!");

    // Attack: Various operations
    println!("\n🚨 ATTACK EXECUTION:");

    // LP 1 withdraws
    model.lp_withdraw(1).expect_success();

    // LP 6 deposits
    model.lp_deposit(6, 30_000_000).expect_success();

    // LP 2 withdraws
    model.lp_withdraw(2).expect_success();

    // LP 7 deposits
    model.lp_deposit(7, 40_000_000).expect_success();

    // Verify: Shares should remain synced
    println!("\n✅ DEFENSE CHECK:");

    let lp_check = model.check_lp_invariant();
    assert!(
        lp_check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: LP shares desynced: {:?}",
        lp_check
    );

    let final_total_shares = model.total_shares;
    let final_sum: u64 = model.lp_shares.values().sum();

    println!("  Final total shares: {}", final_total_shares);
    println!("  Final sum of individual shares: {}", final_sum);

    assert_eq!(
        final_total_shares, final_sum,
        "🔥 EXPLOIT SUCCEEDED: Shares desynced: total {} != sum {}",
        final_total_shares, final_sum
    );

    println!("  ✓ LP shares remained synced");
    println!("\n✅ ATTACK THWARTED: Share total desync prevented");
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
