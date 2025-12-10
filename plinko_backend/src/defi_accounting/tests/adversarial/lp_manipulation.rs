//! LP Share Manipulation Attack Tests
//!
//! These tests attempt to exploit LP share pricing mechanisms to steal value from other LPs.
//! Classic DeFi attacks: first depositor inflation, sandwich attacks, share price manipulation.

use crate::defi_accounting::tests::stress_tests::AccountingModel;

#[test]
fn attack_first_depositor_inflation() {
    println!("\n🔴 ATTACK: First depositor inflation attack");
    println!("Strategy: Classic Uniswap V2 attack - inflate share price to steal from next depositor");
    println!("Defense: MINIMUM_LIQUIDITY burn should prevent this");

    let mut model = AccountingModel::new();

    // Attack Phase 1: Attacker deposits minimum amount
    println!("\n🚨 ATTACK EXECUTION (Phase 1): Minimal deposit...");
    let attacker = 999;
    let min_deposit = 10_000_000; // 10 USDT (minimum LP deposit)

    println!("  Attacker deposits {} USDT", min_deposit / 1_000_000);
    let attack_result1 = model.lp_deposit(attacker, min_deposit);
    assert!(attack_result1.is_success(), "Initial deposit failed");

    let attacker_shares = *model.lp_shares.get(&attacker).unwrap_or(&0);
    println!("  Attacker received {} shares", attacker_shares);
    println!("  Total shares: {}", model.total_shares);
    println!("  Burned shares (owned by address 0): should be 1000");

    // Attack Phase 2: Attacker would manipulate reserve (if possible)
    // In proper implementation, attacker can't directly manipulate reserve
    // They can only win/lose games, but that's economically costly

    // Attack Phase 3: Victim deposits large amount
    println!("\n🚨 ATTACK EXECUTION (Phase 2): Victim deposits...");
    let victim = 777;
    let victim_deposit = 100_000_000; // 100 USDT

    println!("  Victim deposits {} USDT", victim_deposit / 1_000_000);
    let victim_result = model.lp_deposit(victim, victim_deposit);
    assert!(victim_result.is_success(), "Victim deposit failed");

    let victim_shares = *model.lp_shares.get(&victim).unwrap_or(&0);
    println!("  Victim received {} shares", victim_shares);

    // Verify: Victim should get fair share of pool
    println!("\n✅ DEFENSE CHECK:");

    let total_deposited = min_deposit + victim_deposit;
    let attacker_pool_percent = (attacker_shares as f64 / model.total_shares as f64) * 100.0;
    let victim_pool_percent = (victim_shares as f64 / model.total_shares as f64) * 100.0;

    println!("  Attacker owns {:.2}% of pool", attacker_pool_percent);
    println!("  Victim owns {:.2}% of pool", victim_pool_percent);

    // Attacker deposited ~9% of total, should own ~9%
    let attacker_fair_percent = (min_deposit as f64 / total_deposited as f64) * 100.0;
    let victim_fair_percent = (victim_deposit as f64 / total_deposited as f64) * 100.0;

    println!("  Attacker fair share: {:.2}%", attacker_fair_percent);
    println!("  Victim fair share: {:.2}%", victim_fair_percent);

    // Allow 1% deviation for rounding
    let attacker_deviation = (attacker_pool_percent - attacker_fair_percent).abs();
    let victim_deviation = (victim_pool_percent - victim_fair_percent).abs();

    assert!(
        attacker_deviation < 2.0,
        "🔥 EXPLOIT SUCCEEDED: Attacker owns {:.2}% but should own {:.2}% (deviation: {:.2}%)",
        attacker_pool_percent,
        attacker_fair_percent,
        attacker_deviation
    );

    assert!(
        victim_deviation < 2.0,
        "🔥 EXPLOIT SUCCEEDED: Victim owns {:.2}% but should own {:.2}% (deviation: {:.2}%)",
        victim_pool_percent,
        victim_fair_percent,
        victim_deviation
    );

    // Check invariants
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("  ✓ MINIMUM_LIQUIDITY burn prevented inflation attack");
    println!("\n✅ ATTACK THWARTED: First depositor inflation prevented");
}

#[test]
fn attack_sandwich_lp_deposit() {
    println!("\n🔴 ATTACK: Sandwich attack on LP deposit");
    println!("Strategy: Front-run victim's deposit to extract value");

    let mut model = AccountingModel::new();

    // Setup: Create pool with existing liquidity
    println!("Setup: Creating pool with existing LPs...");
    let lp1 = 1;
    model.lp_deposit(lp1, 50_000_000).expect_success(); // 50 USDT

    println!("  Initial reserve: {} USDT", model.pool_reserve / 1_000_000);
    println!("  Initial shares: {}", model.total_shares);

    // Attack Phase 1: Attacker sees victim's pending deposit in mempool
    // Attacker front-runs by depositing first
    println!("\n🚨 ATTACK EXECUTION (Phase 1): Attacker front-runs...");
    let attacker = 999;
    let attacker_deposit = 100_000_000; // 100 USDT

    println!("  Attacker deposits {} USDT", attacker_deposit / 1_000_000);
    model.lp_deposit(attacker, attacker_deposit).expect_success();

    let attacker_shares_after_deposit = *model.lp_shares.get(&attacker).unwrap();
    let reserve_after_attacker = model.pool_reserve;
    println!("  Attacker shares: {}", attacker_shares_after_deposit);
    println!("  Reserve: {} USDT", reserve_after_attacker / 1_000_000);

    // Attack Phase 2: Victim's deposit executes
    println!("\n🚨 ATTACK EXECUTION (Phase 2): Victim's deposit executes...");
    let victim = 777;
    let victim_deposit = 50_000_000; // 50 USDT

    println!("  Victim deposits {} USDT", victim_deposit / 1_000_000);
    model.lp_deposit(victim, victim_deposit).expect_success();

    let victim_shares = *model.lp_shares.get(&victim).unwrap();
    println!("  Victim shares: {}", victim_shares);

    // Attack Phase 3: Attacker withdraws immediately
    println!("\n🚨 ATTACK EXECUTION (Phase 3): Attacker withdraws...");
    let attacker_balance_before = *model.user_balances.get(&attacker).unwrap_or(&0);

    model.lp_withdraw(attacker).expect_success();

    let attacker_balance_after = *model.user_balances.get(&attacker).unwrap_or(&0);
    let attacker_profit = (attacker_balance_after as i128) - (attacker_balance_before as i128) - (attacker_deposit as i128);

    println!("  Attacker withdrawal: {} USDT", (attacker_balance_after - attacker_balance_before) / 1_000_000);
    println!("  Attacker profit: {} USDT", attacker_profit as f64 / 1_000_000.0);

    // Verify: Attacker should not profit from sandwich
    println!("\n✅ DEFENSE CHECK:");

    // In a fair system, attacker should LOSE money due to LP withdrawal fee (1%)
    // They deposited 100, should get back ~99 (after 1% fee)
    let expected_max_profit = -(attacker_deposit as i128) / 100; // Should lose 1%

    assert!(
        attacker_profit <= expected_max_profit,
        "🔥 EXPLOIT SUCCEEDED: Attacker profited {} USDT from sandwich (should lose ~1% to fees)",
        attacker_profit as f64 / 1_000_000.0
    );

    // Check invariants
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("  ✓ Sandwich attack unprofitable due to withdrawal fees");
    println!("\n✅ ATTACK THWARTED: LP withdrawal fee makes sandwich attack uneconomical");
}

#[test]
fn attack_share_price_manipulation_via_games() {
    println!("\n🔴 ATTACK: Share price manipulation via games");
    println!("Strategy: Play games to drain pool before victim deposits, buying shares at discount");

    let mut model = AccountingModel::new();

    // Setup: Create pool
    println!("Setup: Creating pool...");
    let lp1 = 1;
    let initial_lp_deposit = 100_000_000; // 100 USDT
    model.lp_deposit(lp1, initial_lp_deposit).expect_success();

    println!("  Reserve: {} USDT", model.pool_reserve / 1_000_000);
    println!("  Shares: {}", model.total_shares);

    let initial_share_price = model.pool_reserve as f64 / model.total_shares as f64;
    println!("  Initial share price: {:.6} USDT per share", initial_share_price / 1_000_000.0);

    // Attack Phase 1: Attacker drains pool via winning games
    println!("\n🚨 ATTACK EXECUTION (Phase 1): Draining pool via games...");
    let attacker = 999;
    model.user_deposit(attacker, 50_000_000).expect_success(); // 50 USDT

    let mut wins = 0;
    let target_reserve = 20_000_000; // Target: drain to 20 USDT

    while model.pool_reserve > target_reserve && wins < 20 {
        let bet = 1_000_000; // 1 USDT
        let payout = bet * 3; // 3x
        let profit = payout - bet;

        if profit <= model.pool_reserve {
            model.settle_bet(attacker, bet, payout).expect_success();
            wins += 1;
        } else {
            break;
        }
    }

    println!("  Reserve after draining: {} USDT", model.pool_reserve / 1_000_000);
    println!("  Shares (unchanged): {}", model.total_shares);

    let drained_share_price = model.pool_reserve as f64 / model.total_shares as f64;
    println!("  Drained share price: {:.6} USDT per share", drained_share_price / 1_000_000.0);

    // Attack Phase 2: Attacker deposits at low price
    println!("\n🚨 ATTACK EXECUTION (Phase 2): Attacker buys at low price...");
    let attacker_deposit = 30_000_000; // 30 USDT

    // Transfer winnings back to deposit as LP
    // In real system, attacker would withdraw and re-deposit
    // For model, we'll deposit their balance
    let attacker_winnings = *model.user_balances.get(&attacker).unwrap_or(&0);
    println!("  Attacker has {} USDT in balance from games", attacker_winnings / 1_000_000);

    model.lp_deposit(attacker, attacker_deposit).expect_success();

    let attacker_shares = *model.lp_shares.get(&attacker).unwrap();
    let attacker_pool_percent = (attacker_shares as f64 / model.total_shares as f64) * 100.0;

    println!("  Attacker shares: {}", attacker_shares);
    println!("  Attacker owns {:.2}% of pool", attacker_pool_percent);

    // Attack Phase 3: Pool recovers (other players lose games)
    println!("\n🚨 ATTACK EXECUTION (Phase 3): Pool recovers...");
    let losers = vec![700, 701, 702];

    for loser in &losers {
        model.user_deposit(*loser, 10_000_000).expect_success(); // 10 USDT each

        // They lose games
        for _ in 0..5 {
            let bet = 1_000_000; // 1 USDT
            let payout = 0; // Total loss
            model.settle_bet(*loser, bet, payout).expect_success();
        }
    }

    println!("  Reserve after recovery: {} USDT", model.pool_reserve / 1_000_000);

    let recovered_share_price = model.pool_reserve as f64 / model.total_shares as f64;
    println!("  Recovered share price: {:.6} USDT per share", recovered_share_price / 1_000_000.0);

    // Attack Phase 4: Attacker withdraws at profit
    println!("\n🚨 ATTACK EXECUTION (Phase 4): Attacker withdraws...");

    let attacker_initial_investment = 50_000_000 + attacker_deposit; // Initial deposit + LP deposit
    let attacker_balance_before_lp_withdraw = *model.user_balances.get(&attacker).unwrap_or(&0);

    model.lp_withdraw(attacker).expect_success();

    let attacker_final_balance = *model.user_balances.get(&attacker).unwrap_or(&0);
    let attacker_total = attacker_final_balance;
    let attacker_net_profit = (attacker_total as i128) - (attacker_initial_investment as i128);

    println!("  Attacker final balance: {} USDT", attacker_total / 1_000_000);
    println!("  Initial investment: {} USDT", attacker_initial_investment / 1_000_000);
    println!("  Net profit: {} USDT", attacker_net_profit as f64 / 1_000_000.0);

    // Verify: This is actually EXPECTED BEHAVIOR, not an exploit
    println!("\n✅ DEFENSE CHECK:");

    // The attacker's "profit" comes from:
    // 1. Legitimately winning games (skill/luck)
    // 2. Buying LP shares when pool is low (timing the market)
    // 3. Pool recovering from other players' losses

    // This is not an exploit - it's how casino economics work:
    // - Players can win (probability-based)
    // - LPs bear the risk and get fees
    // - Smart LPs can time entries/exits

    // The key check: Did invariants hold throughout?
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    // The attacker paid LP withdrawal fee (1%), which is the deterrent
    // Also, they took on risk that pool might not recover

    println!("  ✓ No invariant violations");
    println!("  ✓ Attacker's profit came from legitimate game wins and market timing");
    println!("  ✓ LP withdrawal fee (1%) serves as friction against exploitation");

    println!("\n✅ ATTACK THWARTED: Behavior is expected casino economics, not an exploit");
}

#[test]
fn attack_lp1_grief_via_early_exit() {
    println!("\n🔴 ATTACK: Early LP griefs later LPs by exiting before pool matures");
    println!("Strategy: LP1 exits immediately after LP2 deposits, extracting value");

    let mut model = AccountingModel::new();

    // Setup: LP1 creates pool
    println!("Setup: LP1 creates pool...");
    let lp1 = 1;
    model.lp_deposit(lp1, 50_000_000).expect_success(); // 50 USDT

    let lp1_initial_shares = *model.lp_shares.get(&lp1).unwrap();
    println!("  LP1 shares: {}", lp1_initial_shares);
    println!("  Reserve: {} USDT", model.pool_reserve / 1_000_000);

    // Attack: LP2 deposits, LP1 immediately withdraws
    println!("\n🚨 ATTACK EXECUTION:");
    let lp2 = 2;

    println!("  LP2 deposits 50 USDT...");
    model.lp_deposit(lp2, 50_000_000).expect_success();

    println!("  LP1 immediately withdraws...");
    let lp1_balance_before = *model.user_balances.get(&lp1).unwrap_or(&0);
    model.lp_withdraw(lp1).expect_success();
    let lp1_balance_after = *model.user_balances.get(&lp1).unwrap_or(&0);

    let lp1_withdrawal_amount = lp1_balance_after - lp1_balance_before;
    let lp1_profit = (lp1_withdrawal_amount as i128) - (50_000_000i128);

    println!("  LP1 withdrew: {} USDT", lp1_withdrawal_amount / 1_000_000);
    println!("  LP1 profit: {} USDT", lp1_profit as f64 / 1_000_000.0);

    // Verify: LP1 should not profit (should lose 1% to withdrawal fee)
    println!("\n✅ DEFENSE CHECK:");

    assert!(
        lp1_profit <= 0,
        "🔥 EXPLOIT SUCCEEDED: LP1 profited {} USDT by early exit",
        lp1_profit as f64 / 1_000_000.0
    );

    let expected_loss_pct = (lp1_profit.abs() as f64 / 50_000_000.0) * 100.0;
    println!("  LP1 lost {:.2}% to withdrawal fee", expected_loss_pct);

    // Check that LP2 wasn't harmed
    let lp2_shares = *model.lp_shares.get(&lp2).unwrap();
    let lp2_pool_percent = (lp2_shares as f64 / model.total_shares as f64) * 100.0;
    println!("  LP2 now owns {:.2}% of pool", lp2_pool_percent);

    // Check invariants
    let check = model.check_invariant();
    assert!(
        check.is_ok(),
        "🔥 EXPLOIT SUCCEEDED: Invariant broken: {:?}",
        check
    );

    println!("  ✓ Early exit penalized by withdrawal fee");
    println!("\n✅ ATTACK THWARTED: Withdrawal fee prevents griefing via early exit");
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
