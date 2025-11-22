Status:
1. Fixed in https://github.com/AlexandriaDAO/OpenHouse/pull/74/files

2. Fixed in https://github.com/AlexandriaDAO/OpenHouse/pull/76/files  (this fixed both 2 and the critical vulnerability in @claude_audit_v1.md)

3. Fixed in https://github.com/AlexandriaDAO/OpenHouse/pull/79/files 


# Gemini Security Audit: `dice_backend` DeFi Module

**Date:** November 21, 2025
**Target:** `@dice_backend/src/defi_accounting`
**Severity Level:** CRITICAL

## Executive Summary

The auditing of `dice_backend` has revealed **multiple critical vulnerabilities** that allow for fund theft (Double Spending) and permanent loss of protocol fees. The flaws stem from a fundamental misunderstanding of the Internet Computer's Inter-Canister Call (ICC) guarantees—specifically, treating "Timeout" errors as "Definite Failures".

This audit identifies **5 specific vulnerabilities**, detailed below with proofs of exploitation and required fixes.

---

## 1. Critical: Double Spend via User Withdrawal (Ledger Timeout)

### The Vulnerability
In `accounting.rs`, the `attempt_transfer` function treats all errors from `ic_ledger_types::transfer` as "Definite Errors".
```rust
// accounting.rs
Err(e) => {
    // BUG: Treats timeout/system errors as failure
    TransferResult::DefiniteError(format!("{:?}", e))
}
```
On the Internet Computer, a system error (like a timeout) means the response was lost, but the request might have been processed. The Ledger executes requests atomically.

### Proof of Exploitation
1.  **Attacker** calls `withdraw_all()` (e.g., for 100 ICP).
2.  `accounting.rs` sets internal balance to 0 and calls `attempt_transfer`.
3.  **Ledger Canister** receives the request and transfers 100 ICP to the attacker.
4.  **Network Timeout:** The success response fails to reach `dice_backend`.
5.  `attempt_transfer` catches the error and returns `DefiniteError`.
6.  `withdraw_all` executes `rollback_withdrawal(caller)`.
7.  **Result:** Attacker has 100 ICP in their wallet AND their 100 ICP balance is restored in the canister. They can withdraw again.

### The Fix
Differentiate between logic errors (e.g., `InsufficientFunds`) and system errors.
*   **Logic Errors:** Safe to rollback.
*   **System Errors:** Must return `UncertainError`. Do **not** rollback. Queue for manual verification or infinite retry.

---

## 2. Critical: Double Spend via LP Liquidity Withdrawal

### The Vulnerability
In `liquidity_pool.rs`, `withdraw_liquidity` suffers from the exact same flaw as the user withdrawal, but strictly worse because it bypasses the `PendingWithdrawal` queue entirely.

```rust
// liquidity_pool.rs
match transfer_to_user(caller, lp_amount).await {
    Ok(_) => { ... }
    Err(e) => {
        // LP transfer failed - ROLLBACK EVERYTHING
        // 1. Restore shares
        // 2. Restore reserve
        Err(...)
    }
}
```

### Proof of Exploitation
1.  **LP** calls `withdraw_all_liquidity()`.
2.  `withdraw_liquidity` burns shares and deducts from reserve.
3.  It awaits `transfer_to_user`.
4.  **Ledger** executes transfer.
5.  **Network Timeout** occurs.
6.  The `Err(e)` branch executes "ROLLBACK EVERYTHING".
7.  **Result:** LP gets their ICP *and* gets their shares back. They can drain the pool repeatedly.

### The Fix
This function needs to be rewritten to use a persistent "pending" state similar to `accounting.rs`.
1.  Record "Withdrawal Started" in stable storage.
2.  Attempt transfer.
3.  If Uncertain: Leave in "Pending" state. Do not restore shares.
4.  Expose a `check_withdrawal_status` or `retry_withdrawal` function.

---

## 3. Critical: "Ghost Fund" Loss via Failed Fee Transfers

### The Vulnerability
In `liquidity_pool.rs`, the protocol fee is transferred to the parent canister using a "fire-and-forget" spawn:

```rust
// liquidity_pool.rs
if net_fee > 0 {
     ic_cdk::spawn(async move {
        let _ = accounting::transfer_to_user(get_parent_principal(), net_fee).await;
     });
}
```

If this spawned call fails (e.g., network congestion, parent canister out of cycles, or simple trap), the `net_fee` is lost. It has already been deducted from the `PoolState.reserve`, but it sits in the canister's ICP account, unaccounted for. It becomes "Ghost ICP" that technically belongs to the protocol but is not tracked by any internal variable.

### Proof of Failure
1.  LP withdraws. Fee is calculated (e.g., 1 ICP).
2.  Reserve is reduced by Payout + Fee.
3.  LP gets Payout.
4.  Spawn starts.
5.  `transfer_to_user` for fee fails (e.g., `SysTransient`).
6.  The spawn creates a future that panics or returns Err. The result is ignored (`let _ = ...`).
7.  **Result:** The 1 ICP fee remains in `dice_backend`'s ledger account, but `PoolState.reserve` does not include it. The Parent Canister never receives it.

### The Fix
Do not transfer immediately.
1.  Credit a `system_fees` internal balance (StableBTreeMap entry for `ParentCanisterID`).
2.  Allow the Parent Canister to call `withdraw_all()` (standard flow) to collect fees.
3.  Or, use a robust cron-job that retries the transfer until verified success.

---

## 4. High: Premature Rollback Mechanism

### The Vulnerability
In `accounting.rs`, `process_single_withdrawal` has a retry limit:

```rust
// accounting.rs
if pending.retries >= MAX_RETRIES {
    rollback_withdrawal(user)?;
    return Ok(());
}
```

Even if `attempt_transfer` were fixed to return `UncertainError`, this logic forces a rollback after ~50 minutes. If the transfer *did* succeed but the network was flaky for 50 minutes (unlikely but possible during subnet attacks), the system defaults to "Fail Open" (Double Spend) instead of "Fail Safe".

### The Fix
**Never** rollback an Uncertain state automatically.
*   **Infinite Retry:** Keep retrying forever (with exponential backoff).
*   **Manual Intervention:** Flag as "Stuck" and require admin/user trigger to re-check Ledger status.

---

## 5. Medium: Precision Loss in Payout Calculation

### The Vulnerability
In `accounting.rs`:
```rust
(house_balance as f64 * MAX_PAYOUT_PERCENTAGE) as u64
```
Converting `u64` to `f64` loses precision for values > $2^{53}$ (approx 9 quadrillion e8s, or 90 million ICP). While current ICP supply makes this edge case rare, a "future proof" financial module should not rely on lossy floating-point math for ledger accounting.

### The Fix
Use integer arithmetic: `(house_balance * 10) / 100`.

---

## 6. Code Quality & Architectural Issues

### A. Inconsistent Withdrawal Paths
*   User withdrawals use `PendingWithdrawal` queue.
*   LP withdrawals use an inline "atomic" (but flawed) flow.
*   **Recommendation:** Unify both under the `PendingWithdrawal` system. `schedule_lp_withdrawal` exists in `accounting.rs` but is unused. It should be used.

### B. Dead Code
*   `schedule_lp_withdrawal` in `accounting.rs` is never called by `liquidity_pool.rs`.

### C. Timer Robustness
*   *Audit Note:* `lib.rs` correctly restarts the timer in `post_upgrade`. This is GOOD. However, the timer depends on `process_pending_withdrawals`, which currently has the "Premature Rollback" bug (#4).

---

## Summary of Required Actions

1.  **Rewrite `attempt_transfer`** to return `UncertainError` on system failures.
2.  **Rewrite `process_single_withdrawal`** to REMOVE the auto-rollback on max retries.
3.  **Refactor `withdraw_liquidity`** to use the `PendingWithdrawal` queue instead of inline transfers.
4.  **Refactor Fee Handling** to credit an internal balance instead of spawning a transfer.
5.  **Fix Math** to use integer arithmetic.

This set of fixes will transition the module from "High Risk" to "Production Ready".