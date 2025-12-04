# Gemini Audit V4: Findings Report

**Date:** November 29, 2025
**Target:** `dice_backend/src/defi_accounting/`
**Auditor:** Gemini Agent (Theseus)

---

## Executive Summary

The audit focused on the DeFi accounting module, specifically the `liquidity_pool.rs` and `accounting.rs` files. The investigation verified the robustness of the "Pending Withdrawal" pattern for preventing double-spends during ledger uncertainty.

One confirmed logical vulnerability was identified in the rollback mechanism for Liquidity Pool (LP) withdrawals, which can lead to accounting corruption.

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| 1 | Double-Counting of Protocol Fees during LP Withdrawal Rollback | **MEDIUM** | **Verified (Logical)** |
| 2 | Large `min_shares_expected` converts LP deposit to User Deposit | **INFO** | **Intended Behavior** |
| 3 | `UncertainError` locks funds requiring manual intervention | **INFO** | **Trade-off Acceptance** |

---

## Finding 1: Double-Counting of Protocol Fees during LP Withdrawal Rollback

### Severity: MEDIUM

### Claim
The system fails to reverse the credit of protocol fees to the Parent canister when an LP withdrawal transaction is definitely rejected by the ledger (`DefiniteError`). This results in the fee being present in *both* the Parent's user balance AND the restored Pool Reserve, causing an accounting mismatch (Calculated Total > Actual Balance).

### Preconditions
1. A user initiates a liquidity withdrawal (`withdraw_all_liquidity`).
2. The Parent canister does **not** have a pending withdrawal (allowing `credit_parent_fee` to succeed).
3. The subsequent `icrc1_transfer` to the user fails with a `DefiniteError` (e.g., ledger configuration error, subaccount issues, or malformed request).

### Logic Trace
1. **Fee Deduction**: `withdraw_liquidity` calculates `fee_amount` and `payout_nat`.
2. **Reserve Update**: `payout_nat` (which includes the fee) is deducted from `POOL_STATE.reserve`.
3. **Pending State**: A `PendingWithdrawal` is created storing `reserve: payout_nat`.
4. **Fee Credit**: `credit_parent_fee(parent, fee_amount)` is called. If successful, the Parent's balance in `USER_BALANCES` is increased by `fee_amount`.
5. **Transfer Attempt**: `attempt_transfer` is called.
6. **Failure handling**: If `DefiniteError` occurs, `rollback_withdrawal(caller)` is triggered.
7. **Rollback**: `rollback_withdrawal` calls `restore_lp_position`, which adds the value stored in pending state (`payout_nat`) back to `POOL_STATE.reserve`.

**Result**: The `fee_amount` exists in `USER_BALANCES[parent]` *and* has been restored to `POOL_STATE.reserve`. The system has effectively minted "fake" tokens in its internal accounting.

### Code Reference
**File:** `dice_backend/src/defi_accounting/liquidity_pool.rs`

```rust
// Inside withdraw_liquidity
// Step 2: Reserve deducted by FULL payout
pool_state.reserve -= payout_nat.clone();

// Step 3: Fee credited to Parent (increases USER_BALANCES)
if fee_amount > 0 {
    if !accounting::credit_parent_fee(parent, fee_amount) { ... }
}

// Step 4: Transfer fails
match accounting::attempt_transfer(caller, lp_amount, created_at).await {
    accounting::TransferResult::DefiniteError(err) => {
        // Step 5: Rollback restores FULL payout to Reserve
        let _ = accounting::rollback_withdrawal(caller);
        Err(err)
    }
}
```

### Impact
- **Accounting**: `audit_balances` will fail permanently (`pool_reserve + deposits > canister_balance`).
- **Solvency**: The system believes it has more liabilities than it actually holds assets.
- **Exploitability**: Low. Requires triggering a `DefiniteError` on the ledger transfer, which is difficult for a normal user to force without finding an edge case in `icrc1_transfer` arguments. However, system faults could trigger this, permanently corrupting the canister's state.

### Recommendation
Modify the `DefiniteError` handling block in `withdraw_liquidity` to reverse the fee credit if it occurred.

**Proposed Fix:**
```rust
match accounting::attempt_transfer(caller, lp_amount, created_at).await {
    accounting::TransferResult::Success(_) => { ... }
    accounting::TransferResult::DefiniteError(err) => {
        // FIX: Deduct fee from parent if it was credited
        if fee_amount > 0 {
             // Check if we need to reverse the credit
             // This requires a new helper or checking if credit_parent_fee succeeded previously
             // Alternatively, allow rollback_withdrawal to handle this if we store fee info in PendingWithdrawal
             accounting::debit_parent_fee(parent, fee_amount); // Needs implementation
        }
        let _ = accounting::rollback_withdrawal(caller);
        Err(err)
    }
    // ...
}
```

Alternatively, update `PendingWithdrawal` for LP to explicitly store the `fee_credited: bool` status and handle it in `rollback_withdrawal`.

---

## Finding 2: Large `min_shares_expected` converts LP deposit to User Deposit

### Severity: INFO

### Claim
If `deposit_liquidity` encounters slippage (shares < min_shares), the deposited funds are credited to the user's betting balance instead of being refunded to the original wallet.

### Analysis
This is an intentional design choice documented in the code ("Slippage protection (Post-Transfer)"). It prevents the complexity of performing a second generic `transfer` back to the user (which costs another fee and could fail). Crediting the internal balance allows the user to either bet or `withdraw_all` immediately. This is safe and correct.

---

## Finding 3: `UncertainError` locking funds

### Severity: INFO

### Claim
If `withdraw_all` or `withdraw_liquidity` returns an `UncertainError` (e.g., network timeout), the user's funds remain in a "Pending" state. The balance is zeroed, and the transaction is not rolled back.

### Analysis
This is the correct architectural pattern for the Internet Computer to prevent double-spending.
- **Traditional Flaw**: Timeout -> Rollback. **Risk**: Transaction actually succeeded on ledger -> User withdraws again -> Double Spend.
- **Current Implementation**: Timeout -> Pending. **Risk**: Transaction failed on ledger -> Funds locked.
- **Mitigation**: The `retry_withdrawal` and `abandon_withdrawal` functions give the user agency to resolve this state after verifying the ledger state externally.

**Conclusion**: This is not a bug, but a necessary safety mechanism.

---

## Verification Log

### Audit Command Execution
- **Baseline Check**: Passed.
- **Code Review**: Identified logical flaw in `withdraw_liquidity`.
- **Stress Test**: Partial execution confirmed basic stability but was halted due to user time constraints.

### Final Verdict
The accounting system is robust against double-spends (the primary concern). The identified fee-rollback bug is an accounting correctness issue that should be patched to prevent state corruption in edge cases.