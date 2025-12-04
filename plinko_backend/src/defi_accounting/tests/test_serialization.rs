// This test suite validates the serialization integrity of critical DeFi accounting types.
//
// WHY THIS TEST IS USEFUL:
// 1. Verifies the fix for "Serialization Limit DoS" vulnerability (Audit Vuln 2.1).
//    Previously, bounded serialization could cause panics on large data.
//    Now uses unbounded serialization to prevent DoS.
// 2. Ensures that 'PendingWithdrawal' can handle large Nat values without panic.
// 3. Validates the 'sanitize_error' helper to ensure error strings are truncated correctly.
//
// WHAT IT TESTS:
// - Round-trip serialization (struct -> bytes -> struct).
// - Unbounded serialization works with large values.
// - Truncation logic for error messages.
// - Handling of large numbers (Nat) within the struct.

use crate::defi_accounting::types::{PendingWithdrawal, WithdrawalType, sanitize_error};
use ic_stable_structures::Storable;
use ic_stable_structures::storable::Bound;
use candid::Nat;

#[test]
fn test_sanitize_error_truncation() {
    let short_msg = "Short error";
    assert_eq!(sanitize_error(short_msg), "Short error");

    let long_msg = "a".repeat(1000);
    let sanitized = sanitize_error(&long_msg);
    assert_eq!(sanitized.len(), 256, "Error message should be truncated to 256 chars");
    assert_eq!(sanitized, "a".repeat(256));
}

#[test]
fn test_pending_withdrawal_unbounded_serialization() {
    // Test that PendingWithdrawal uses unbounded serialization (Audit Vuln 2.1 fix)
    let bound = <PendingWithdrawal as Storable>::BOUND;
    assert!(
        matches!(bound, Bound::Unbounded),
        "PendingWithdrawal should have Unbounded serialization to prevent DoS"
    );

    // Create a PendingWithdrawal with large Nat values
    // 10^76 is far beyond any realistic value, testing unbounded handling
    let huge_val: u128 = u128::MAX;
    let huge_nat = Nat::from(huge_val) * Nat::from(huge_val); // ~10^76

    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::LP {
            shares: huge_nat.clone(),
            reserve: huge_nat.clone(),
            amount: u64::MAX,
        },
        created_at: u64::MAX,
    };

    // Verify serialization doesn't panic (was the DoS vulnerability)
    let bytes = pending.to_bytes();
    let len = bytes.len();

    println!("Serialized size: {} bytes (unbounded)", len);

    // Verify round-trip integrity
    let decoded = PendingWithdrawal::from_bytes(bytes);
    match decoded.withdrawal_type {
        WithdrawalType::LP { shares, reserve, amount } => {
            assert_eq!(shares, huge_nat, "Shares should survive round-trip");
            assert_eq!(reserve, huge_nat, "Reserve should survive round-trip");
            assert_eq!(amount, u64::MAX, "Amount should survive round-trip");
        },
        _ => panic!("Wrong withdrawal type decoded"),
    }
    assert_eq!(decoded.created_at, u64::MAX, "created_at should survive round-trip");
}
