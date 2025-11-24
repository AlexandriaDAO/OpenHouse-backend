use candid::{CandidType, Deserialize, Principal, Nat};
use ic_stable_structures::Storable;
use std::borrow::Cow;
use ic_stable_structures::storable::Bound;

pub fn sanitize_error(msg: &str) -> String {
    msg.chars().take(256).collect()
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PendingWithdrawal {
    pub withdrawal_type: WithdrawalType,
    pub created_at: u64,        // Ledger idempotency key
    pub retries: u8,
    pub last_error: Option<String>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum WithdrawalType {
    User { amount: u64 },
    LP { shares: Nat, reserve: Nat, amount: u64 },
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

    const BOUND: Bound = Bound::Bounded {
        max_size: 2048, // Increased from 1000
        is_fixed_size: false,
    };
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
    WithdrawalExpired { user: Principal, amount: u64 },
    BalanceRestored { user: Principal, amount: u64 },
    LPRestored { user: Principal, amount: u64 },
    SystemError { error: String },
    ParentFeeCredited { amount: u64 },
    ParentFeeFallback { amount: u64, reason: String },
    SystemInfo { message: String },
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

    const BOUND: Bound = Bound::Bounded {
        max_size: 2048, // Increased from 500
        is_fixed_size: false,
    };
}
