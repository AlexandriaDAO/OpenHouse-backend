use candid::{CandidType, Deserialize, Principal, Nat};
use ic_stable_structures::Storable;
use std::borrow::Cow;
use ic_stable_structures::storable::Bound;

pub fn sanitize_error(msg: &str) -> String {
    msg.chars().take(256).collect()
}

/// Pending withdrawal awaiting confirmation or user action.
///
/// # Design Note
/// The system does not auto-retry or auto-rollback transactions.
/// Users must manually call `retry_withdrawal()` or `abandon_withdrawal()`.
/// This prevents double-spend vulnerabilities from uncertain transfer outcomes.
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PendingWithdrawal {
    pub withdrawal_type: WithdrawalType,
    pub created_at: u64,        // Ledger idempotency key (used for deduplication)
}

impl PendingWithdrawal {
    /// Helper to extract amount regardless of withdrawal type.
    pub fn get_amount(&self) -> u64 {
        match &self.withdrawal_type {
            WithdrawalType::User { amount } => *amount,
            WithdrawalType::LP { amount, .. } => *amount,
        }
    }
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum WithdrawalType {
    User { amount: u64 },
    LP { shares: Nat, reserve: Nat, amount: u64, fee: u64 },
}

impl Storable for PendingWithdrawal {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(
            candid::encode_one(self).expect(
                "CRITICAL: Failed to encode PendingWithdrawal. \
                 This should never happen unless there's a bug in candid serialization. \
                 If this occurs, it indicates a serious system integrity issue."
            )
        )
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<'_, [u8]>) -> Self {
        candid::decode_one(&bytes).expect(
            "CRITICAL: Failed to decode PendingWithdrawal from stable storage. \
             This indicates storage corruption or an incompatible canister upgrade. \
             Manual intervention required - check upgrade path and stable storage state."
        )
    }

    const BOUND: Bound = Bound::Unbounded;
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct AuditEntry {
    pub timestamp: u64,
    pub event: AuditEvent,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum AuditEvent {
    WithdrawalInitiated { user: Principal, amount: u64 },
    WithdrawalCompleted { user: Principal, amount: u64 },
    WithdrawalFailed { user: Principal, amount: u64 },
    /// User voluntarily abandoned a stuck withdrawal.
    /// CRITICAL: This does NOT restore balance - funds may be orphaned.
    /// This is intentional to prevent double-spend.
    WithdrawalAbandoned { user: Principal, amount: u64 },
    WithdrawalExpired { user: Principal, amount: u64 },
    BalanceRestored { user: Principal, amount: u64 },
    LPRestored { user: Principal, amount: u64 },
    SystemError { error: String },
    ParentFeeCredited { amount: u64 },
    ParentFeeFallback { amount: u64, reason: String },
    SystemInfo { message: String },
    BalanceCredited {
        user: Principal,
        amount: u64,
        new_balance: u64,
    },
    SlippageProtectionTriggered {
        user: Principal,
        deposit_amount: u64,
        expected_min_shares: Nat,
        actual_shares: Nat,
    },
}

/// Health check result for admin monitoring.
/// Mirrors the logic of scripts/check_balance.sh
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct HealthCheck {
    // Financial health (existing)
    pub pool_reserve: u64,
    pub total_deposits: u64,
    pub canister_balance: u64,
    pub calculated_total: u64,
    pub excess: i64,
    pub excess_usdt: f64,
    pub is_healthy: bool,
    pub health_status: String,
    pub timestamp: u64,
    
    pub pending_withdrawals_count: u64,
    pub pending_withdrawals_total_amount: u64,
    pub heap_memory_bytes: u64,
    pub stable_memory_pages: u64,
    pub total_abandoned_amount: u64,
    pub unique_users: u64,
    pub unique_lps: u64,
    pub is_solvent: bool,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PendingWithdrawalInfo {
    pub user: Principal,
    pub withdrawal_type: String,
    pub amount: u64,
    pub created_at: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct OrphanedFundsReport {
    pub total_abandoned_amount: u64,
    pub abandoned_count: u64,
    pub recent_abandonments: Vec<AbandonedEntry>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct AbandonedEntry {
    pub user: Principal,
    pub amount: u64,
    pub timestamp: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct UserBalance {
    pub user: Principal,
    pub balance: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct LPPositionInfo {
    pub user: Principal,
    pub shares: Nat,
}

impl Storable for AuditEntry {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(
            candid::encode_one(self).expect(
                "CRITICAL: Failed to encode AuditEntry. \
                 This should never happen unless there's a bug in candid serialization. \
                 Audit logging is failing - system integrity may be compromised."
            )
        )
    }

    fn into_bytes(self) -> Vec<u8> {
        self.to_bytes().into_owned()
    }

    fn from_bytes(bytes: Cow<'_, [u8]>) -> Self {
        candid::decode_one(&bytes).expect(
            "CRITICAL: Failed to decode AuditEntry from stable storage. \
             This indicates audit log corruption or an incompatible upgrade. \
             Audit trail integrity cannot be guaranteed."
        )
    }

    const BOUND: Bound = Bound::Unbounded;
}
