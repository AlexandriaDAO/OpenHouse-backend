# 1. Medium, fixed in https://github.com/AlexandriaDAO/OpenHouse/pull/89/files & https://github.com/AlexandriaDAO/OpenHouse/pull/90/files







# Gemini Audit V2 - Findings & Remediation

**Auditor:** Gemini (Model 2.5)
**Date:** November 24, 2025
**Target:** `dice_backend/src/defi_accounting/**`

## 1. Findings

### [Medium] Serialization Limit DoS in Audit Log

**Location**: `dice_backend/src/defi_accounting/types.rs:59` (AuditEntry Storable impl)

**The Failure Scenario**:
1. The system encounters an error with a long description (e.g., a verbose Rejection Message from the Ledger or a complex panic message).
2. `process_single_withdrawal` calls `log_audit(AuditEvent::SystemError { error })`.
3. `candid::encode_one(entry)` produces a byte array larger than 500 bytes.
4. `Storable::BOUND` claims `max_size: 500`.
5. `StableVec::push` (or the underlying memory manager) may panic or corrupt data when writing an entry exceeding the declared bound.
6. **Result**: `process_pending_withdrawals` traps. The withdrawal queue is halted. If the error condition persists (e.g., a specific user's withdrawal always triggers a long error), the queue is permanently blocked (DoS).

### [Medium] Zero-Share Deposit (Dust Loss)

**Location**: `dice_backend/src/defi_accounting/liquidity_pool.rs:153`

**The Failure Scenario**:
1. The `share_price` is high (e.g., 100 ICP/share) due to low supply and high reserve (possible if LPs withdraw leaving fees, or just naturally).
2. **User** calls `deposit_liquidity` with 0.5 ICP.
3. `shares_to_mint = (amount * total_shares) / current_reserve` results in `0` due to integer division.
4. The code continues:
   - Updates `LP_SHARES` with `+0`.
   - Updates `POOL_STATE.reserve` with `+0.5 ICP`.
5. **Result**: User transfers 0.5 ICP to the pool but receives 0 shares. The funds are effectively donated to existing LPs.

### [Low] Unbounded Error Message in PendingWithdrawal

**Location**: `dice_backend/src/defi_accounting/types.rs:28` (PendingWithdrawal Storable impl)

**The Failure Scenario**:
1. `attempt_transfer` fails with `UncertainError(msg)`.
2. `msg` is a very long string (e.g., > 1000 bytes) returned by the IC replica.
3. `update_pending_error` tries to save this `msg` in `PendingWithdrawal.last_error`.
4. `Storable::to_bytes` panics or `StableBTreeMap` fails because the encoded size exceeds the `BOUND` of 1000 bytes.
5. **Result**: The withdrawal state update traps. The user's retry counter is not incremented. The system might retry infinitely (if it doesn't trap the whole loop) or trap the processor.

## 2. Remediation Plan

### A. Fix Audit Log & Pending Serialization
Increase bounds and truncate strings.

```rust
// types.rs

// 1. Increase BOUNDs to be safe
impl Storable for PendingWithdrawal {
    const BOUND: Bound = Bound::Bounded {
        max_size: 2048, // Increased from 1000
        is_fixed_size: false,
    };
}

impl Storable for AuditEntry {
    const BOUND: Bound = Bound::Bounded {
        max_size: 1024, // Increased from 500
        is_fixed_size: false,
    };
}

// 2. Truncate strings before storage
pub fn truncate_error(s: &str) -> String {
    s.chars().take(200).collect() // Cap at 200 chars
}

// Apply in accounting.rs
TransferResult::UncertainError(msg) => {
    let safe_msg = crate::defi_accounting::types::truncate_error(&msg);
    // ...
}
```

### B. Fix Zero-Share Deposit
Enforce minimum share minting.

```rust
// liquidity_pool.rs

// Inside deposit_liquidity
let shares_to_mint = POOL_STATE.with(|state| {
    // ... calculation ...
    Ok(shares)
})?;

if shares_to_mint == Nat::from(0u64) {
    return Err("Deposit too small: results in 0 shares".to_string());
}
```

### C. Robust Retry Logic (Process Pending)
Ensure `log_audit` failure doesn't halt processing.

```rust
// accounting.rs
pub(crate) fn log_audit(event: AuditEvent) {
    // Wrap in a catch_unwind or just ensure data fits? 
    // Since we can't catch_unwind in wasm easily without hooks, 
    // PREVENT the panic by truncating data in the event constructors 
    // or checking size before push.
}
```