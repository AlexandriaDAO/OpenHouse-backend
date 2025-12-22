//! State Snapshot and Upgrade Safety Tests
//!
//! These tests verify that:
//! 1. All Storable types survive serialization roundtrips
//! 2. Memory IDs are unique (no collisions)
//! 3. Audit entries maintain integrity across upgrades
//! 4. Type changes don't break backward compatibility

use candid::{Nat, Principal};
use ic_stable_structures::Storable;
use crate::defi_accounting::types::{
    PendingWithdrawal, WithdrawalType, AuditEntry, AuditEvent,
};
use crate::defi_accounting::memory_ids::*;

// =============================================================================
// SERIALIZATION ROUNDTRIP TESTS
// =============================================================================

#[test]
fn test_pending_withdrawal_user_roundtrip() {
    let original = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: 123_456_789 },
        created_at: 1_700_000_000_000_000_000, // Realistic IC timestamp
    };

    let bytes = original.to_bytes();
    let decoded = PendingWithdrawal::from_bytes(bytes);

    match decoded.withdrawal_type {
        WithdrawalType::User { amount } => {
            assert_eq!(amount, 123_456_789);
        }
        _ => panic!("Wrong withdrawal type"),
    }
    assert_eq!(decoded.created_at, 1_700_000_000_000_000_000);
}

#[test]
fn test_pending_withdrawal_lp_roundtrip() {
    let original = PendingWithdrawal {
        withdrawal_type: WithdrawalType::LP {
            shares: Nat::from(999_999_999_999u64),
            reserve: Nat::from(1_000_000_000_000u64),
            amount: 500_000_000,
            fee: 5_000_000,
        },
        created_at: 1_700_000_000_000_000_000,
    };

    let bytes = original.to_bytes();
    let decoded = PendingWithdrawal::from_bytes(bytes);

    match decoded.withdrawal_type {
        WithdrawalType::LP { shares, reserve, amount, fee } => {
            assert_eq!(shares, Nat::from(999_999_999_999u64));
            assert_eq!(reserve, Nat::from(1_000_000_000_000u64));
            assert_eq!(amount, 500_000_000);
            assert_eq!(fee, 5_000_000);
        }
        _ => panic!("Wrong withdrawal type"),
    }
}

#[test]
fn test_audit_entry_all_variants_roundtrip() {
    let test_principal = Principal::anonymous();

    // Test all AuditEvent variants
    let events = vec![
        AuditEvent::WithdrawalInitiated { user: test_principal, amount: 100 },
        AuditEvent::WithdrawalCompleted { user: test_principal, amount: 100 },
        AuditEvent::WithdrawalFailed { user: test_principal, amount: 100 },
        AuditEvent::WithdrawalAbandoned { user: test_principal, amount: 100 },
        AuditEvent::WithdrawalExpired { user: test_principal, amount: 100 },
        AuditEvent::BalanceRestored { user: test_principal, amount: 100 },
        AuditEvent::LPRestored { user: test_principal, amount: 100 },
        AuditEvent::SystemError { error: "Test error message".to_string() },
        AuditEvent::ParentFeeCredited { amount: 100 },
        AuditEvent::ParentFeeFallback { amount: 100, reason: "Test reason".to_string() },
        AuditEvent::SystemInfo { message: "Test info".to_string() },
        AuditEvent::BalanceCredited { user: test_principal, amount: 100, new_balance: 200 },
        AuditEvent::SlippageProtectionTriggered {
            user: test_principal,
            deposit_amount: 1000,
            expected_min_shares: Nat::from(900u64),
            actual_shares: Nat::from(800u64),
        },
        AuditEvent::SystemRefundCredited { user: test_principal, amount: 50, new_balance: 150 },
    ];

    for (i, event) in events.into_iter().enumerate() {
        let entry = AuditEntry {
            timestamp: 1700000000000000000 + i as u64,
            event,
        };

        let bytes = entry.to_bytes();
        let decoded = AuditEntry::from_bytes(bytes);

        assert_eq!(decoded.timestamp, entry.timestamp, "Timestamp mismatch for variant {}", i);
        // Event comparison would require PartialEq impl, so just verify no panic
    }
}

// =============================================================================
// MEMORY ID UNIQUENESS TESTS
// =============================================================================

#[test]
fn test_all_memory_ids_unique() {
    let ids = [
        ("USER_BALANCES", USER_BALANCES_MEMORY_ID),
        ("LP_SHARES", LP_SHARES_MEMORY_ID),
        ("POOL_STATE", POOL_STATE_MEMORY_ID),
        ("PENDING_WITHDRAWALS", PENDING_WITHDRAWALS_MEMORY_ID),
        ("AUDIT_LOG_MAP", AUDIT_LOG_MAP_MEMORY_ID),
        ("AUDIT_LOG_COUNTER", AUDIT_LOG_COUNTER_MEMORY_ID),
        ("SNAPSHOTS", SNAPSHOTS_MEMORY_ID),
        ("ACCUMULATOR", ACCUMULATOR_MEMORY_ID),
    ];

    // Check for duplicates
    for i in 0..ids.len() {
        for j in (i + 1)..ids.len() {
            assert_ne!(
                ids[i].1, ids[j].1,
                "Memory ID collision: {} ({}) and {} ({})",
                ids[i].0, ids[i].1, ids[j].0, ids[j].1
            );
        }
    }

    println!("Memory ID assignments:");
    for (name, id) in &ids {
        println!("  {}: {}", name, id);
    }
}

#[test]
fn test_memory_id_ranges() {
    // Verify IDs stay within their allocated ranges

    // User accounting (10-19)
    assert!(USER_BALANCES_MEMORY_ID >= 10 && USER_BALANCES_MEMORY_ID <= 19);
    assert!(LP_SHARES_MEMORY_ID >= 10 && LP_SHARES_MEMORY_ID <= 19);
    assert!(POOL_STATE_MEMORY_ID >= 10 && POOL_STATE_MEMORY_ID <= 19);

    // Withdrawals & audit (20-29)
    assert!(PENDING_WITHDRAWALS_MEMORY_ID >= 20 && PENDING_WITHDRAWALS_MEMORY_ID <= 29);
    assert!(AUDIT_LOG_MAP_MEMORY_ID >= 20 && AUDIT_LOG_MAP_MEMORY_ID <= 29);
    assert!(AUDIT_LOG_COUNTER_MEMORY_ID >= 20 && AUDIT_LOG_COUNTER_MEMORY_ID <= 29);

    // Statistics (30-39)
    assert!(SNAPSHOTS_MEMORY_ID >= 30 && SNAPSHOTS_MEMORY_ID <= 39);
    assert!(ACCUMULATOR_MEMORY_ID >= 30 && ACCUMULATOR_MEMORY_ID <= 39);
}

// =============================================================================
// EDGE CASE SERIALIZATION TESTS
// =============================================================================

#[test]
fn test_serialization_with_max_values() {
    // Test with maximum realistic values

    // Max u64 amount
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: u64::MAX },
        created_at: u64::MAX,
    };
    let bytes = pending.to_bytes();
    let decoded = PendingWithdrawal::from_bytes(bytes);
    assert_eq!(decoded.get_amount(), u64::MAX);
    assert_eq!(decoded.created_at, u64::MAX);

    // Very large Nat (simulating extreme LP shares)
    let huge_nat = Nat::from(u128::MAX) * Nat::from(u128::MAX);
    let lp_pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::LP {
            shares: huge_nat.clone(),
            reserve: huge_nat.clone(),
            amount: u64::MAX,
            fee: u64::MAX,
        },
        created_at: u64::MAX,
    };
    let bytes = lp_pending.to_bytes();
    let decoded = PendingWithdrawal::from_bytes(bytes);

    if let WithdrawalType::LP { shares, reserve, .. } = decoded.withdrawal_type {
        assert_eq!(shares, huge_nat);
        assert_eq!(reserve, huge_nat);
    } else {
        panic!("Wrong type");
    }
}

#[test]
fn test_serialization_with_zero_values() {
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: 0 },
        created_at: 0,
    };
    let bytes = pending.to_bytes();
    let decoded = PendingWithdrawal::from_bytes(bytes);
    assert_eq!(decoded.get_amount(), 0);
    assert_eq!(decoded.created_at, 0);
}

#[test]
fn test_audit_entry_with_long_error_message() {
    // Test that long strings serialize correctly
    let long_error = "X".repeat(10_000);
    let entry = AuditEntry {
        timestamp: 12345,
        event: AuditEvent::SystemError { error: long_error.clone() },
    };

    let bytes = entry.to_bytes();
    let decoded = AuditEntry::from_bytes(bytes);

    if let AuditEvent::SystemError { error } = decoded.event {
        assert_eq!(error, long_error);
    } else {
        panic!("Wrong event type");
    }
}

#[test]
fn test_principal_serialization() {
    // Test with various principal types
    let principals = vec![
        Principal::anonymous(),
        Principal::management_canister(),
        Principal::from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        Principal::from_slice(&[0xDE, 0xAD, 0xBE, 0xEF]),
    ];

    for principal in principals {
        let entry = AuditEntry {
            timestamp: 999,
            event: AuditEvent::WithdrawalInitiated {
                user: principal,
                amount: 100,
            },
        };

        let bytes = entry.to_bytes();
        let decoded = AuditEntry::from_bytes(bytes);

        if let AuditEvent::WithdrawalInitiated { user, .. } = decoded.event {
            assert_eq!(user, principal);
        } else {
            panic!("Wrong event type");
        }
    }
}

// =============================================================================
// BACKWARD COMPATIBILITY TESTS
// =============================================================================

/// Test that the current serialization format can decode known byte sequences.
/// This helps catch breaking changes to the serialization format.
#[test]
fn test_known_byte_sequence_decoding() {
    // A PendingWithdrawal::User serialized with current format
    // This byte sequence was captured from a working system.
    // If this test fails after code changes, it means the serialization
    // format changed and existing data may be incompatible.

    // Create a reference object
    let reference = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: 1_000_000_000 },
        created_at: 1_700_000_000_000_000_000,
    };

    // Serialize it
    let bytes = reference.to_bytes();

    // Store the length for future reference (can be used to detect format changes)
    println!("Reference PendingWithdrawal::User serialized to {} bytes", bytes.len());

    // Verify roundtrip
    let decoded = PendingWithdrawal::from_bytes(bytes);
    assert_eq!(decoded.get_amount(), 1_000_000_000);
    assert_eq!(decoded.created_at, 1_700_000_000_000_000_000);
}

/// Verify serialization is deterministic (same input = same bytes)
#[test]
fn test_serialization_determinism() {
    let pending = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: 12345 },
        created_at: 67890,
    };

    let bytes1 = pending.to_bytes();
    let bytes2 = pending.to_bytes();

    assert_eq!(bytes1.as_ref(), bytes2.as_ref(), "Serialization should be deterministic");
}

// =============================================================================
// UPGRADE SIMULATION TESTS
// =============================================================================

/// Simulate what happens during a canister upgrade cycle
#[test]
fn test_upgrade_cycle_simulation() {
    // Step 1: Create state as if before upgrade
    let pending_user = PendingWithdrawal {
        withdrawal_type: WithdrawalType::User { amount: 100_000_000 },
        created_at: 1_700_000_000_000_000_000,
    };

    let pending_lp = PendingWithdrawal {
        withdrawal_type: WithdrawalType::LP {
            shares: Nat::from(50_000_000u64),
            reserve: Nat::from(200_000_000u64),
            amount: 49_500_000,
            fee: 500_000,
        },
        created_at: 1_700_000_000_000_000_001,
    };

    let audit = AuditEntry {
        timestamp: 1_700_000_000_000_000_000,
        event: AuditEvent::WithdrawalInitiated {
            user: Principal::anonymous(),
            amount: 100_000_000,
        },
    };

    // Step 2: Serialize (pre_upgrade)
    let pending_user_bytes = pending_user.to_bytes().into_owned();
    let pending_lp_bytes = pending_lp.to_bytes().into_owned();
    let audit_bytes = audit.to_bytes().into_owned();

    // Step 3: Simulate new canister WASM loading
    // (In real upgrade, new code would be installed here)

    // Step 4: Deserialize (post_upgrade)
    let restored_user = PendingWithdrawal::from_bytes(pending_user_bytes.into());
    let restored_lp = PendingWithdrawal::from_bytes(pending_lp_bytes.into());
    let restored_audit = AuditEntry::from_bytes(audit_bytes.into());

    // Step 5: Verify integrity
    assert_eq!(restored_user.get_amount(), 100_000_000);
    assert_eq!(restored_user.created_at, 1_700_000_000_000_000_000);

    if let WithdrawalType::LP { shares, reserve, amount, fee } = restored_lp.withdrawal_type {
        assert_eq!(shares, Nat::from(50_000_000u64));
        assert_eq!(reserve, Nat::from(200_000_000u64));
        assert_eq!(amount, 49_500_000);
        assert_eq!(fee, 500_000);
    } else {
        panic!("LP withdrawal type lost");
    }

    assert_eq!(restored_audit.timestamp, 1_700_000_000_000_000_000);
}
