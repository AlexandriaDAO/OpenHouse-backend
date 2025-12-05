# Audit Report: Plinko Backend DeFi Accounting

**Date:** December 4, 2025
**Module:** `@plinko_backend/src/defi_accounting/`

## 1. Race Condition in Liquidity Deposit Refund causing Orphaned Funds

**Severity:** High

**Consequence in theory:**
A user attempting to deposit liquidity (`deposit_liquidity`) while simultaneously withdrawing their betting balance (`withdraw_all`) can end up in a state where the liquidity deposit fails (e.g., due to slippage) but the refund mechanism fails to credit the funds back to the user. This results in the user's tokens being transferred to the canister but not recorded in any balance, effectively causing a permanent loss of funds (orphaned funds) for the user.

**Consequence in practice:**
This fails because the slippage refund logic in `deposit_liquidity` relies on `accounting::credit_balance`, which strictly enforces that no pending withdrawals exist for the user. However, `deposit_liquidity` does not lock the user's account during the asynchronous transfer phase.

**How it fails (Step-by-Step Exploit):**
1.  **Initial State:** A user has a betting balance of 10 USDT and 100 ckUSDT in their wallet.
2.  **Action 1:** User calls `deposit_liquidity(100_000_000)` (100 USDT) with a strict `min_shares_expected` (or a value calculated based on current state).
3.  **Check:** `deposit_liquidity` checks `accounting::get_withdrawal_status()`. It is `None`. The call proceeds.
4.  **Async Transfer:** `deposit_liquidity` calls `icrc2_transfer_from`. This is an `await` point. The execution yields.
5.  **Action 2 (Race):** While the transfer is pending, the user (or a script/bot) calls `withdraw_all()` to withdraw their 10 USDT betting balance.
6.  **Locking:** `withdraw_internal` runs. It sees no pending withdrawal (yet). It creates a `PendingWithdrawal` for the 10 USDT and sets the user's betting balance to 0.
7.  **Resume:** The `icrc2_transfer_from` in `deposit_liquidity` completes successfully. The canister has received the 100 USDT.
8.  **Slippage Trigger:** `deposit_liquidity` recalculates shares. Suppose the share price changed slightly during the await (or the user set tight bounds), causing `shares_to_mint < min_shares_expected`.
9.  **Refund Attempt:** The code enters the refund block:
    ```rust
    // @plinko_backend/src/defi_accounting/liquidity_pool.rs

    if shares_to_mint < min_shares {
        // ...
        // Refund to user's betting balance
        accounting::credit_balance(caller, amount)?; // <--- THIS FAILS
        // ...
    }
    ```
10. **The Failure:** `accounting::credit_balance` executes:
    ```rust
    // @plinko_backend/src/defi_accounting/accounting.rs

    pub fn credit_balance(user: Principal, amount: u64) -> Result<(), String> {
        if PENDING_WITHDRAWALS.with(|p| p.borrow().contains_key(&user)) {
            return Err("Cannot credit: withdrawal pending".to_string());
        }
        // ...
    }
    ```
    It sees the `PendingWithdrawal` created in Step 6. It returns an `Err`.
11. **Result:** `deposit_liquidity` receives the `Err` from `credit_balance` and bubbles it up to the user (via the `?` operator or implicit return).
    - The 100 USDT transfer **happened**.
    - The `LP_SHARES` were **not minted**.
    - The `credit_balance` refund **failed**.
    - **Outcome:** The 100 USDT sits in the canister's generic balance, unallocated to anyone. The user has lost 100 USDT.

**How to prove it fails:**
Write a test case in `test_slippage_audit.rs` (or similar) that:
1.  Mock the state.
2.  Simulate `deposit_liquidity` pausing after transfer.
3.  Inject a `PendingWithdrawal` for that user into the state.
4.  Resume `deposit_liquidity` and force the slippage condition.
5.  Assert that the function returns an Error and that `USER_BALANCES` was *not* incremented, despite `canister_balance` increasing.

**Conditions for exploitation:**
- User must have a non-zero betting balance (to initiate a withdrawal) OR the ability to initiate a withdrawal that creates a pending state.
- User must perform a liquidity deposit that triggers slippage (can be self-induced by setting `min_shares_expected` unreasonably high).
- User must time the `withdraw_all` call to occur during the `await` of the deposit transfer (standard race condition).

---

## 2. Potential DoS via Audit Log Pruning (Minor)

**Severity:** Low / Gas Optimization

**Consequence in theory:**
The `prune_oldest_audit_entries` function in `accounting.rs` iterates through keys to remove them. While `MAX_AUDIT_ENTRIES` is currently small (1000), if this limit were raised significantly, the linear iteration and removal from `StableBTreeMap` could consume excessive cycles, potentially making the `log_audit` function (and thus all financial operations) expensive or hitting instruction limits.

**Consequence in practice:**
Currently bounded at 1000 entries. 1000 iterations is negligible for canister operations. This is a "future-proof" warning rather than an immediate exploit.
- **Fails if:** The constant `MAX_AUDIT_ENTRIES` is increased to a large number (e.g., 50,000) without changing the pruning logic.

---

## 3. Integer Overflow in `calculate_shares_for_deposit` (Theoretical)

**Severity:** Low (Safety checks present)

**Consequence in theory:**
In `liquidity_pool.rs`, the share calculation uses:
`let numerator = amount_nat.clone() * total_shares;`
If `amount_nat` and `total_shares` are both extremely large, this multiplication could overflow memory or cycle limits if `Nat` grows too large (it is arbitrary precision, so it won't "overflow" like u64, but it consumes resources).

**Consequence in practice:**
`Nat` handles arbitrarily large numbers. The constraint is cycle consumption. Given the `u64` input limits on amounts, realistic values will never cause resource exhaustion here. The logic handles division by zero (checks `current_reserve == 0`).

---

## Recommendation for Critical Fix (Vulnerability #1)

Modify `liquidity_pool.rs` to handle the refund explicitly, bypassing the `credit_balance` check if necessary, OR strictly lock the user account at the start of `deposit_liquidity` in a way that prevents `withdraw_all` from running concurrently.

**Preferred Fix:**
In `accounting.rs`, add a specific `force_credit_balance` function strictly for internal system refunds that is allowed to execute even if a withdrawal is pending (since adding funds does not interfere with the logic of withdrawing *existing* funds, as long as the pending withdrawal amount is fixed).

```rust
// Suggestion for accounting.rs
pub(crate) fn force_credit_balance_system(user: Principal, amount: u64) -> Result<(), String> {
    // Does NOT check PENDING_WITHDRAWALS
    // Safe because this is a NEW deposit refund, not a modification of the withdrawing amount
    USER_BALANCES_STABLE.with(|balances| {
        let mut balances = balances.borrow_mut();
        let current = balances.get(&user).unwrap_or(0);
        // ... overflow checks ...
        let new_balance = current + amount;
        balances.insert(user, new_balance);
        // ... log audit ...
        Ok(())
    })
}
```
