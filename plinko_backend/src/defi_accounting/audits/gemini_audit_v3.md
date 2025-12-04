Status: Completed

- Fixed #1 in https://github.com/AlexandriaDAO/OpenHouse/pull/99/files
- Fixed #2 in https://github.com/AlexandriaDAO/OpenHouse/pull/100/files
- #3 is not a real set of issues. It is a false positive.




# Comprehensive Audit Report: `defi_accounting` Module

**Date:** November 25, 2025
**Auditor:** Gemini Expert Auditor
**Scope:** `src/defi_accounting/` and subdirectories.

## Executive Summary

The `defi_accounting` module implements a Liquidity Pool (LP) based accounting system for an Internet Computer (IC) application. It handles user deposits, withdrawals, and LP management using `ckUSDT` (ICRC-2).

The codebase generally follows the Checks-Effects-Interactions pattern and utilizes `ic-stable-structures` for robust state persistence. However, **CRITICAL** vulnerabilities regarding fund safety were identified, particularly concerning the handling of uncertain ledger transfers and potential double-spending scenarios during retries. Additionally, there are Denial-of-Service (DoS) risks related to serialization limits and potential "zombie" states for stuck withdrawals.

## Vulnerability Severity Scale

- **CRITICAL**: Immediate risk of fund loss or permanent state corruption.
- **HIGH**: High risk of fund loss or severe service disruption requiring manual intervention.
- **MEDIUM**: Potential for DoS or partial malfunction; difficult to exploit.
- **LOW/INFO**: Best practices, minor issues, or theoretical risks.

---

## 1. Critical Vulnerabilities

### 1.1. Double Spending via "Uncertain" Withdrawal Rollback
**Severity: CRITICAL**
**Location:** `accounting.rs` -> `withdraw_internal`, `process_single_withdrawal`, `rollback_withdrawal`

**Description:**
The withdrawal logic correctly treats `UncertainError` (e.g., network timeout) by retrying. However, if the retry loop persists for longer than the ledger's deduplication window (typically 24 hours) or if the ledger rejects a retry due to the `created_at` timestamp being too old, the function `attempt_transfer` will return a `DefiniteError` (mapped from the ledger's `TooOld` error).

**Failure Scenario:**
1. User initiates withdrawal of 100 USDT. Balance is zeroed, `PendingWithdrawal` created.
2. `attempt_transfer` sends the transaction. The ledger executes it successfully, but the response is lost (network issue). Result: `UncertainError`.
3. The `process_pending_withdrawals` timer retries the transaction periodically using the *same* `created_at` timestamp.
4. For ~24 hours, retries fail or remain uncertain (e.g., if the replica is partitioned).
5. After 24 hours, a retry reaches the ledger. The ledger sees the `created_at` timestamp is older than the ingress window (typically 24h) and returns a `TooOld` error.
6. `attempt_transfer` receives this error and treats it as a `DefiniteError`.
7. `process_single_withdrawal` catches `DefiniteError` and calls `rollback_withdrawal`.
8. `rollback_withdrawal` refunds the 100 USDT to the user's internal balance.

**Consequence:**
The user receives the funds on the ledger (from step 2) AND gets their internal balance restored (step 8). They can now withdraw the same 100 USDT again. **Double Spend.**

**Recommendation:**
- **Never rollback autoHmatically after an Uncertain state.** If a transaction result is uncertain, and subsequent checks fail or the window expires, the system *must* assume success or require manual intervention.
- Implement a `check_transaction_status` function using `icrc1_get_transactions` (if available on the index canister) or by querying the ledger for the specific transaction block (if known) or checking the user's balance/history before rolling back.
- If the transaction window has passed and the status is still unknown, transition the `PendingWithdrawal` to a `ManualReview` state rather than rolling back.

---

### 1.2. Funds Locked in "Zombie" Pending State
**Severity: HIGH**
**Location:** `accounting.rs` -> `process_single_withdrawal`

**Description:**
If a withdrawal hits `MAX_RETRIES` (approx. 21 hours), the code logs a `SystemError` and returns `Ok(())`.
```rust
if pending.retries >= MAX_RETRIES {
    log_audit(AuditEvent::SystemError { ... });
    return Ok(());
}
```
It does *not* remove the entry from `PENDING_WITHDRAWALS`.

**Failure Scenario:**
1. A withdrawal fails repeatedly (e.g., due to a configuration error or prolonged network issue).
2. `retries` reaches `MAX_RETRIES`.
3. The system logs an error.
4. The user tries to `withdraw_all` again: fails ("Withdrawal already pending").
5. The user tries to play a game (which calls `update_balance`): fails ("Cannot update balance: withdrawal pending").
6. The user tries to deposit: succeeds, but they cannot withdraw the new funds or play with them because the account is locked.

**Consequence:**
The user's account is effectively frozen indefinitely. No funds can be moved out, and no games can be played. This requires direct admin intervention (which is difficult if there are no admin control functions exposed in the code) or a canister upgrade to fix.

**Recommendation:**
- After `MAX_RETRIES`, the system should transition the withdrawal to a `Failed` state or a separate `StuckWithdrawals` map to unblock the user's main account (potentially locking only the disputed amount).
- Alternatively, expose an admin function (guarded) to clear stuck withdrawals or force a status check.

---

## 2. High / Medium Vulnerabilities

### 2.1. Serialization DoS (Panic on Storage)
**Severity: HIGH**
**Location:** `types.rs` -> `PendingWithdrawal::to_bytes`

**Description:**
The `PendingWithdrawal` struct implements `Storable` with a `max_size: 2048`. The struct contains `WithdrawalType::LP` which includes two `Nat` fields (`shares` and `reserve`) and a `u64`.
`Nat` (arbitrary precision integer) has no fixed size. While unlikely for normal usage, extremely large values (or a specially crafted attack) could cause the Candid encoding of the struct to exceed 2048 bytes.
The `to_bytes` implementation uses `expect`, which will **trap** (panic) if serialization fails or exceeds bounds.

**Failure Scenario:**
1. A user (or attacker) manages to acquire a massive number of shares or the pool reserve grows exponentially (e.g., hyperinflation simulation).
2. User calls `withdraw_all`.
3. `withdraw_internal` attempts to insert into `PENDING_WITHDRAWALS`.
4. `PendingWithdrawal::to_bytes` is called.
5. Candid encoding exceeds 2048 bytes.
6. The canister traps.
7. Since the trap happens during the "Checks" phase (inserting pending), the transaction rolls back. The user is unable to withdraw.
8. If this `PendingWithdrawal` was somehow already in storage (e.g., size grew after upgrade), the canister would panic on *decoding*, effectively bricking the memory.

**Recommendation:**
- Use `BoundedStorable` properly or increase the limit significantly (e.g., 8KB or 16KB) to be safe with `Nat`.
- Implement graceful error handling in `to_bytes` (though the `Storable` trait signature makes this hard; usually one panics, but the limit should be impossible to reach).
- Add a check in `withdraw_internal` to ensure the serialized size is within bounds *before* attempting to insert, returning a user-friendly error instead of trapping.

### 2.2. Unbounded Growth of Audit Log
**Severity: MEDIUM**
**Location:** `accounting.rs` -> `AUDIT_LOG`

**Description:**
The `AUDIT_LOG` is a `StableVec` that grows indefinitely. Every withdrawal (initiated, completed, failed) adds an entry. There is no pruning mechanism.
While stable memory is large (up to 400GB), an unbounded vector will eventually become unmanageable or expensive to query/serialize if accessed improperly.

**Recommendation:**
- Implement a circular buffer or a pruning mechanism (e.g., keep only the last 10,000 entries).
- Or, use a separate canister for logging to avoid filling the main canister's memory.

---

## 3. Low / Info Findings

### 3.1. Fee Logic Hardcoding
**Severity: LOW**
**Location:** `accounting.rs` -> `CKUSDT_TRANSFER_FEE`

**Description:**
The transfer fee is hardcoded. If the `ckUSDT` ledger updates its fee structure, withdrawals might fail (if fee increases) or the protocol might overcharge/undercharge (if fee decreases).
**Recommendation:** Periodically query the `ckUSDT` ledger for the current fee structure or allow it to be updated via an admin call.

### 3.2. Parent Fee Credit Loss
**Severity: INFO**
**Location:** `liquidity_pool.rs` -> `withdraw_liquidity`

**Description:**
If the parent canister has a pending withdrawal, `credit_parent_fee` returns `false` and the fee is returned to the pool reserve instead of the parent.
**Consequence:** The parent protocol loses that specific fee revenue (it is redistributed to LPs).
**Recommendation:** Acceptable trade-off for simplicity and safety, but worth noting.

### 3.3. Liquidity Pool "Donation" Attack Mitigation
**Severity: INFO**
**Location:** `liquidity_pool.rs`

**Analysis:**
The code uses internal accounting (`POOL_STATE.reserve`) rather than `balance_of` to calculate share prices. This effectively **neutralizes** the classic "donation attack" where an attacker sends tokens directly to the canister to manipulate the share ratio. Direct transfers to the canister do not increase `POOL_STATE.reserve`, so the share price remains unaffected. This is a **good design choice**.

---

## Conclusion

The module is well-structured but contains a critical double-spending vulnerability inherent to the "Rollback on Error" pattern when dealing with distributed systems (IC Ledger). The assumption that a "Too Old" error implies the transaction *never* happened is false; it only means the *retry* failed, but an earlier attempt might have succeeded.

**Immediate Actions Required:**
1.  Refactor `rollback_withdrawal` to strictly verify transaction status before refunding funds.
2.  Fix the "Zombie" withdrawal state where users get locked out after `MAX_RETRIES`.
3.  Review serialization bounds for `Nat` types.
