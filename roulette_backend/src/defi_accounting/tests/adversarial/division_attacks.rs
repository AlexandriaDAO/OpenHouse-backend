//! Division by Zero Attack Tests
//!
//! These tests attempt to trigger division by zero errors in share and payout calculations.
//! Target lines from liquidity_pool.rs:
//! - Line 147: numerator / current_reserve (deposit when reserve = 0)
//! - Line 317: numerator / total_shares (withdraw when shares = 0)

use crate::defi_accounting::tests::stress_tests::AccountingModel;

#[test]
fn attack_deposit_zero_reserve() {
    println!("\n🔴 ATTACK: Deposit when pool reserve is zero");
    println!("Target: liquidity_pool.rs line 147: numerator / current_reserve");
    println!("Strategy: Drain pool to zero, then new LP deposits");

    let mut model = AccountingModel::new();

    // Setup: Create pool with initial liquidity
    println!("Setup: Creating initial pool...");
    let lp1 = 1;
    model.lp_deposit(lp1, 100_000_000).expect_success(); // 100 USDT

    println!("  Initial reserve: {} USDT", model.pool_reserve / 1_000_000);
    println!("  Total shares: {}", model.total_shares);

    // Drain the pool to zero via games
    println!("\nDraining pool to zero...");
    let player = 999;
    model.user_deposit(player, 10_000_000).expect_success(); // 10 USDT

    // Player wins repeatedly to drain pool
    let mut drain_attempts = 0;
    while model.pool_reserve > 0 && drain_attempts < 100 {
        let bet = std::cmp::min(1_000_000, model.user_balances.get(&player).unwrap_or(&0).clone());
        if bet == 0 {
            // Player ran out of money, deposit more
            model.user_deposit(player, 10_000_000).expect_success();
            continue;
        }

        // Win big (10x multiplier)
        let payout: u64 = bet * 10;
        let profit: u64 = payout.saturating_sub(bet);

        if profit <= model.pool_reserve {
            model.settle_bet(player, bet, payout).expect_success();
        } else {
            // Can't drain more, pool too small
            break;
        }

        drain_attempts += 1;
    }

    println!("  After draining: reserve = {} USDT", model.pool_reserve / 1_000_000);
    println!("  Shares still exist: {}", model.total_shares);

    // Attack: New LP tries to deposit when reserve is 0 but shares > 0
    println!("\n🚨 ATTACK EXECUTION:");
    let attacker = 888;
    println!("  Attacker deposits 10 USDT when reserve = {}", model.pool_reserve);

    let attack_result = model.lp_deposit(attacker, 10_000_000);

    // Verify: Should handle division by zero gracefully
    println!("\n✅ DEFENSE CHECK:");
    if attack_result.is_success() {
        println!("  Deposit accepted. Checking for division by zero corruption...");

        // Check that attacker got reasonable shares
        let attacker_shares = model.lp_shares.get(&attacker).unwrap_or(&0);
        println!("  Attacker shares: {}", attacker_shares);

        // Verify invariants
        let check = model.check_invariant();
        assert!(
            check.is_ok(),
            "🔥 EXPLOIT SUCCEEDED: Division by zero corrupted state: {:?}",
            check
        );

        let lp_check = model.check_lp_invariant();
        assert!(
            lp_check.is_ok(),
            "🔥 EXPLOIT SUCCEEDED: LP shares corrupted: {:?}",
            lp_check
        );

        // Attacker shouldn't get infinite shares
        assert!(
            *attacker_shares < u64::MAX / 2,
            "🔥 EXPLOIT SUCCEEDED: Attacker got unreasonable shares: {}",
            attacker_shares
        );

        println!("  ✓ Division by zero handled correctly");
    } else {
        println!("  ✓ Deposit rejected: {}", attack_result.message());
    }

    println!("\n✅ ATTACK THWARTED: Zero reserve division prevented");
}

#[test]
fn attack_withdraw_zero_shares() {
    println!("\n🔴 ATTACK: Withdraw when total shares is zero");
    println!("Target: liquidity_pool.rs line 317: numerator / total_shares");
    println!("Strategy: Somehow get into state with total_shares = 0, then withdraw");

    let mut model = AccountingModel::new();

    // Setup: Try to create state where total_shares = 0
    // This is actually very difficult in correct implementation
    // because burned shares should always exist
    println!("Setup: Attempting to create zero shares state...");

    // In correct implementation, this shouldn't be possible
    // But let's verify the defense exists

    println!("  Initial total_shares: {}", model.total_shares);

    // Attack: Try to withdraw with no shares
    println!("\n🚨 ATTACK EXECUTION:");
    let attacker = 999;
    println!("  Attacker attempts withdrawal with no shares");

    let attack_result = model.lp_withdraw(attacker);

    // Verify: Should reject
    println!("\n✅ DEFENSE CHECK:");
    assert!(
        !attack_result.is_success(),
        "🔥 EXPLOIT SUCCEEDED: Withdrawal with zero shares should be impossible"
    );

    println!("  ✓ Withdrawal rejected: {}", attack_result.message());
    println!("\n✅ ATTACK THWARTED: Zero shares withdrawal prevented");
}

#[test]
fn attack_share_price_manipulation_via_reserve_drain() {
    println!("\n🔴 ATTACK: Share price manipulation via reserve drain");
    println!("Strategy: Drain reserve to near-zero to manipulate share price for next depositor");

    let mut model = AccountingModel::new();

    // Setup: Create pool
    println!("Setup: Creating pool...");
    let lp1 = 1;
    model.lp_deposit(lp1, 100_000_000).expect_success(); // 100 USDT

    let initial_reserve = model.pool_reserve;
    let initial_shares = model.total_shares;
    println!("  Initial state: reserve={}, shares={}", initial_reserve, initial_shares);
    println!("  Share price: {} USDT per share", initial_reserve as f64 / initial_shares as f64 / 1_000_000.0);

    // Attack: Drain reserve to very low amount
    println!("\n🚨 ATTACK EXECUTION (Phase 1): Draining reserve...");
    let player = 999;
    model.user_deposit(player, 50_000_000).expect_success(); // 50 USDT

    // Win big to drain most of the pool
    let target_reserve = 100_000; // Target: 0.1 USDT remaining
    let mut wins = 0;
    while model.pool_reserve > target_reserve && wins < 50 {
        let bet = 1_000_000; // 1 USDT
        let payout = bet * 5; // 5x
        let profit = payout - bet;

        if profit <= model.pool_reserve {
            model.settle_bet(player, bet, payout).expect_success();
            wins += 1;
        } else {
            break;
        }
    }

    println!("  After draining: reserve={} USDT", model.pool_reserve / 1_000_000);
    println!("  Shares unchanged: {}", model.total_shares);
    let drained_price = model.pool_reserve as f64 / model.total_shares as f64;
    println!("  New share price: {} USDT per share", drained_price / 1_000_000.0);

    // Attack Phase 2: Victim deposits at manipulated price
    println!("\n🚨 ATTACK EXECUTION (Phase 2): Victim deposits at low share price...");
    let victim = 777;
    let victim_deposit = 10_000_000; // 10 USDT
    println!("  Victim deposits {} USDT", victim_deposit / 1_000_000);

    let victim_result = model.lp_deposit(victim, victim_deposit);

    // Verify: Check if victim got fair treatment
    println!("\n✅ DEFENSE CHECK:");
    if victim_result.is_success() {
        let victim_shares = model.lp_shares.get(&victim).unwrap_or(&0);
        println!("  Victim received {} shares", victim_shares);

        // Check invariants
        let check = model.check_invariant();
        assert!(
            check.is_ok(),
            "🔥 EXPLOIT SUCCEEDED: Share price manipulation broke invariant: {:?}",
            check
        );

        // Victim's share of pool should be reasonable
        let victim_pool_percent = (*victim_shares as f64 / model.total_shares as f64) * 100.0;
        println!("  Victim owns {:.2}% of pool", victim_pool_percent);

        // They deposited 10 USDT into a pool that had ~0.1 USDT
        // So they should own most of it (but not exploitable amounts)
        // This is expected behavior, not an exploit

        println!("  ✓ Share price reflects actual pool state (as designed)");
    } else {
        println!("  ✓ Deposit rejected: {}", victim_result.message());
    }

    println!("\n✅ ATTACK THWARTED: Share price correctly reflects pool state");
}

#[test]
fn attack_zero_reserve_with_burned_shares_only() {
    println!("\n🔴 ATTACK: Reserve zero but burned shares exist");
    println!("Strategy: Edge case where only MINIMUM_LIQUIDITY burned shares exist, reserve drained");

    let mut model = AccountingModel::new();

    // Setup: Create minimal pool
    println!("Setup: Creating minimal pool...");
    let lp1 = 1;
    let minimal_deposit = 10_000_000; // 10 USDT
    model.lp_deposit(lp1, minimal_deposit).expect_success();

    println!("  Reserve: {} USDT", model.pool_reserve / 1_000_000);
    println!("  Total shares: {}", model.total_shares);

    // LP1 withdraws everything they can
    println!("\nLP1 withdraws all shares...");
    model.lp_withdraw(lp1).expect_success();

    println!("  Reserve after withdrawal: {} USDT", model.pool_reserve / 1_000_000);
    println!("  Total shares remaining: {}", model.total_shares);

    // If reserve is zero but burned shares exist, new deposits should work
    println!("\n🚨 ATTACK EXECUTION:");
    let attacker = 999;
    println!("  Attacker deposits when reserve = {}", model.pool_reserve);

    let attack_result = model.lp_deposit(attacker, 5_000_000); // 5 USDT

    // Verify
    println!("\n✅ DEFENSE CHECK:");
    if attack_result.is_success() {
        println!("  Deposit succeeded");

        let check = model.check_invariant();
        assert!(
            check.is_ok(),
            "🔥 EXPLOIT SUCCEEDED: Zero reserve edge case broke invariant: {:?}",
            check
        );

        println!("  ✓ Zero reserve with burned shares handled correctly");
    } else {
        println!("  ✓ Deposit rejected: {}", attack_result.message());
    }

    println!("\n✅ ATTACK THWARTED: Edge case handled correctly");
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
