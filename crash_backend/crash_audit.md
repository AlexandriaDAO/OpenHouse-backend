# Crash Backend Security Audit

**Audit Date:** 2025-12-11
**Auditor:** Claude Code
**Scope:** crash_backend canister (fws6k-tyaaa-aaaap-qqc7q-cai)

---

## CRITICAL VULNERABILITY: Race Condition in play_crash

### Summary

A Time-of-Check-Time-of-Use (TOCTOU) race condition in `play_crash()` and `play_crash_multi()` allows an attacker to place multiple bets using the same deposited funds. This can drain the liquidity pool and steal from other users.

### Severity: **CRITICAL**

### Location

- `game.rs:181-269` (play_crash)
- `game.rs:271-392` (play_crash_multi)

### The Bug

The code comment at lines 175-179 is **incorrect**:

```rust
// RACE CONDITION SAFETY:
// IC canisters execute messages sequentially - no concurrent threads.
// The balance check → deduct → game → credit sequence has no await points
// between balance check and deduction, ensuring atomicity.
```

**This comment is false.** There IS an await point between the balance check and deduction:

```rust
// Line 183: Balance captured HERE
let user_balance = accounting::get_balance(caller);
if user_balance < bet_amount {
    return Err("INSUFFICIENT_BALANCE".to_string());
}

// ... validation (lines 188-209) ...

// Line 212: AWAIT POINT HERE!
let random_bytes = raw_rand().await
    .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

// Line 220: Uses STALE user_balance from line 183!
let balance_after_bet = user_balance.checked_sub(bet_amount)
    .ok_or("Balance underflow")?;
accounting::update_balance(caller, balance_after_bet)?;
```

During `raw_rand().await`, another message can execute. If a user sends N concurrent `play_crash` calls:

1. All N calls capture `user_balance = X` before their await
2. All N calls pass the balance check
3. All N calls hit `raw_rand().await` and suspend
4. As they resume, each computes `balance_after_bet = X - bet` using the **stale** value
5. Each calls `update_balance(caller, balance_after_bet)` which **overwrites** (doesn't subtract)

### Exploit Scenario

**Setup:** Attacker deposits 100 USDT

**Attack:**
1. Send 10 concurrent `play_crash(100, 2.0)` calls
2. All 10 see balance = 100, pass validation
3. All 10 hit the await and suspend
4. As they resume:
   - Each computes `balance_after_bet = 100 - 100 = 0`
   - Each calls `update_balance(caller, 0)` - all write 0
5. For winning games (say 5 win):
   - Line 241: `current_balance = get_balance(caller)` reads **current** value
   - Line 242-244: Adds payout to current and writes
   - Payouts accumulate: 0 → 200 → 400 → 600 → 800 → 1000
6. For losing games: add 0, no change

**Result:**
- Attacker deposited: 100 USDT
- Attacker balance: 1000 USDT (if 5/10 win at 2x)
- **Attacker profit: 900 USDT stolen from pool**

### Why This Works

1. **Stale read:** `user_balance` captured at line 183 is used at line 220, after an await where state can change

2. **Overwrite instead of subtract:** `update_balance()` does:
   ```rust
   balances.borrow_mut().insert(user, new_balance);  // OVERWRITES
   ```
   It doesn't check or use the current balance - it just sets the new value.

3. **Cumulative payouts:** Line 241-244 correctly reads current balance and adds payout. But when multiple games are running concurrently, this causes payouts to stack while deductions all wrote the same value.

### Pool Impact

For each game, `settle_bet(bet_amount, payout)` adjusts the pool:
- Win at 2x: `settle_bet(100, 200)` → pool pays 100 profit
- Loss: `settle_bet(100, 0)` → pool receives 100

With 10 concurrent games (5 wins, 5 losses):
- Pool receives: 5 × 100 = 500 (from "phantom" bets that weren't actually deducted)
- Pool pays: 5 × 100 = 500 (real payouts)
- Net pool change: 0

**But the attacker's balance went from 100 to 1000!**

The 900 USDT came from **accounting inflation** - the system thinks it deducted 1000 (10 × 100) but only actually deducted 100 due to the overwrites.

### Theft from Other Users

When the attacker withdraws 1000 USDT:
- Canister has: their original 100 + other users' deposits
- Attacker takes: 1000 from the canister's ckUSDT
- **Other users' funds are stolen**

### Recommended Fix

**Option 1: Re-read balance after await**
```rust
let random_bytes = raw_rand().await...;

// RE-READ balance after await
let current_balance = accounting::get_balance(caller);
if current_balance < bet_amount {
    return Err("Balance changed during VRF call".to_string());
}

let balance_after_bet = current_balance.checked_sub(bet_amount)?;
accounting::update_balance(caller, balance_after_bet)?;
```

**Option 2: Atomic try_deduct (better)**
```rust
// In accounting.rs - new function
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

// In game.rs - call after await
let random_bytes = raw_rand().await...;
let _balance_after = accounting::try_deduct_balance(caller, bet_amount)?;
```

**Option 3: Add betting lock flag**
```rust
// Add USERS_BETTING: BTreeMap<Principal, bool> similar to PENDING_WITHDRAWALS
// Set flag before await, check flag at start, clear flag at end
```

---

## Secondary Issues

### 1. Same Bug in play_crash_multi

`game.rs:271-392` has the identical pattern:

```rust
let user_balance = accounting::get_balance(caller);  // Line 298
// ... validation ...
let random_bytes = raw_rand().await...;  // Line 315 - AWAIT!
let balance_after_bet = user_balance.checked_sub(total_bet)?;  // Line 323 - STALE!
```

Same fix required.

### 2. Misleading Comments

The comment at line 175-179 should be removed or corrected. It gives false confidence about race condition safety.

### 3. Solvency Check Timing

`is_canister_solvent()` is only checked at the start of `play_crash` (line 128-130 in lib.rs). After the exploit inflates balances, the solvency check would fail for subsequent games, but the damage is already done.

---

## What's NOT Vulnerable

### Deposits (accounting.rs:148-210)
Safe because the balance credit happens **after** the transfer succeeds, and uses a fresh read inside the critical section:
```rust
let current = balances.get(&caller).unwrap_or(0);  // Fresh read
let new_bal = current.checked_add(amount)?;         // Safe add
balances.insert(caller, new_bal);                   // Write
```

### Withdrawals (accounting.rs:221-289)
Safe because state changes happen **before** the await:
```rust
PENDING_WITHDRAWALS.with(|p| p.borrow_mut().insert(user, pending));  // Before await
USER_BALANCES_STABLE.with(|b| b.borrow_mut().insert(user, 0));       // Before await
match attempt_transfer(...).await { ... }  // Await comes after state change
```

### LP Operations (liquidity_pool.rs)
Safe - uses CEI pattern with state changes before async calls, and has pending withdrawal protection.

---

## Proof of Concept

To exploit (DO NOT RUN ON MAINNET):

```typescript
// Attacker script pseudocode
const deposit = 100_000_000n; // 100 USDT
await crash.deposit(deposit);

// Send 10 concurrent bets
const promises = [];
for (let i = 0; i < 10; i++) {
    promises.push(crash.play_crash(deposit, 2.0));
}

// All execute concurrently, all using same deposited funds
const results = await Promise.all(promises);

// Check inflated balance
const balance = await crash.get_my_balance();
console.log(`Started with ${deposit}, now have ${balance}`);
// Expected: balance >> deposit if some games won

await crash.withdraw_all(); // Drain other users' funds
```

---

## Severity Assessment

| Factor | Assessment |
|--------|------------|
| Exploitability | Easy - just send concurrent transactions |
| Impact | Critical - steal from all users and LPs |
| Likelihood | High - any user can exploit |
| Discoverability | Medium - requires understanding IC async |

**CVSS Score: 9.8 (Critical)**

---

## Immediate Actions Required

1. **Pause the game** - Call `pause_game` if available, or set max_bet to 0
2. **Deploy fix** - Implement Option 2 (atomic try_deduct)
3. **Audit transactions** - Look for patterns of concurrent bets from same principal
4. **Consider compensation** - If exploited, LPs may have losses

---

## Conclusion

The crash backend has a **critical TOCTOU vulnerability** that allows attackers to multiply their bets without having the funds. The code comment claiming safety is incorrect - there IS an await point between balance check and deduction.

This is not a theoretical issue - it's a straightforward exploit that any user could execute to drain the pool.

**The game should not accept bets until this is fixed.**
