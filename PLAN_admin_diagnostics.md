# Admin Diagnostic Queries - Dice Backend

**Type:** NEW FEATURE
**Scope:** Dice Backend only (defi_accounting module)
**Purpose:** Comprehensive admin diagnostic queries for the /admin dashboard

---

## Autonomous PR Orchestrator

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

### Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

### Workflow
1. Verify isolation in worktree: `/home/theseus/alexandria/openhouse-admin-diagnostics`
2. Implement the feature below
3. Build & Deploy: `./deploy.sh --dice-only`
4. Create PR (MANDATORY)
5. Iterate on review feedback

**Branch:** `feature/admin-diagnostics`
**Worktree:** `/home/theseus/alexandria/openhouse-admin-diagnostics`

---

## Feature Summary

Add comprehensive admin diagnostic queries to enable monitoring of:
- Pending withdrawals (stuck/orphaned states)
- Memory usage (heap + stable storage)
- Orphaned funds (abandoned withdrawals from audit log)
- All user balances and LP positions (paginated)

All queries are admin-restricted except the expanded `admin_health_check` which consolidates key metrics into a single call.

**Admin Principal:** `p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae`

---

## Current State

### File Structure
```
dice_backend/src/defi_accounting/
├── accounting.rs      # Contains admin_health_check + ADMIN_PRINCIPAL (lines 693-741)
├── liquidity_pool.rs  # LP logic with *_internal functions
├── query.rs           # Public query wrappers (open access)
├── types.rs           # Data structures (HealthCheck at lines 101-114)
├── statistics/        # Daily stats
└── mod.rs             # Re-exports
```

### Key Data Structures (in accounting.rs)
- `USER_BALANCES_STABLE`: `StableBTreeMap<Principal, u64>` (line 30-34)
- `PENDING_WITHDRAWALS`: `StableBTreeMap<Principal, PendingWithdrawal>` (line 36-40)
- `AUDIT_LOG_MAP`: `StableBTreeMap<u64, AuditEntry>` (line 45-49)

### Key Data Structures (in liquidity_pool.rs)
- `LP_SHARES`: `StableBTreeMap<Principal, StorableNat>` (line 89-93)

---

## Implementation

### 1. Create `admin_query.rs` (NEW FILE)

```rust
// dice_backend/src/defi_accounting/admin_query.rs
use candid::{CandidType, Deserialize, Principal, Nat};
use super::accounting;
use super::liquidity_pool;
use super::types::*;

const ADMIN_PRINCIPAL: &str = "p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae";

fn require_admin() -> Result<(), String> {
    let caller = ic_cdk::api::caller();
    let admin = Principal::from_text(ADMIN_PRINCIPAL)
        .map_err(|_| "Invalid admin principal")?;
    if caller != admin {
        return Err("Unauthorized: admin only".to_string());
    }
    Ok(())
}

/// Expanded health check - consolidates financial + operational metrics
pub async fn admin_health_check() -> Result<HealthCheck, String> {
    require_admin()?;

    // Refresh canister balance from ledger
    let canister_balance = accounting::refresh_canister_balance().await;

    // Financial metrics
    let pool_reserve = liquidity_pool::get_pool_reserve();
    let total_deposits = accounting::calculate_total_deposits_internal();
    let calculated_total = pool_reserve.checked_add(total_deposits)
        .ok_or("Accounting overflow")?;
    let excess = canister_balance as i64 - calculated_total as i64;
    let excess_usdt = excess as f64 / 1_000_000.0;

    // Health status
    let (is_healthy, health_status) = if excess < 0 {
        (false, "CRITICAL: DEFICIT".to_string())
    } else if excess < 1_000_000 {
        (true, "HEALTHY".to_string())
    } else if excess < 5_000_000 {
        (true, "WARNING: Excess 1-5 USDT".to_string())
    } else {
        (false, "ACTION REQUIRED: Excess >5 USDT".to_string())
    };

    // Operational metrics (NEW)
    let (pending_count, pending_total) = accounting::get_pending_stats_internal();
    let (unique_users, unique_lps) = (
        accounting::count_user_balances_internal(),
        liquidity_pool::count_lp_positions_internal()
    );
    let total_abandoned = accounting::sum_abandoned_from_audit_internal();

    // Memory metrics (NEW)
    let heap_memory_bytes = (core::arch::wasm32::memory_size(0) * 65536) as u64;
    let stable_memory_pages = ic_cdk::api::stable::stable_size();

    Ok(HealthCheck {
        pool_reserve,
        total_deposits,
        canister_balance,
        calculated_total,
        excess,
        excess_usdt,
        is_healthy,
        health_status,
        timestamp: ic_cdk::api::time(),
        // NEW fields
        pending_withdrawals_count: pending_count,
        pending_withdrawals_total_amount: pending_total,
        heap_memory_bytes,
        stable_memory_pages,
        total_abandoned_amount: total_abandoned,
        unique_users,
        unique_lps,
    })
}

/// Get all pending withdrawals (for diagnosing stuck states)
pub fn get_all_pending_withdrawals() -> Result<Vec<PendingWithdrawalInfo>, String> {
    require_admin()?;
    Ok(accounting::iter_pending_withdrawals_internal())
}

/// Analyze orphaned funds from audit log
pub fn get_orphaned_funds_report() -> Result<OrphanedFundsReport, String> {
    require_admin()?;
    Ok(accounting::build_orphaned_funds_report_internal())
}

/// Paginated list of all user balances
pub fn get_all_balances(offset: u64, limit: u64) -> Result<Vec<UserBalance>, String> {
    require_admin()?;
    let limit = limit.min(100); // Cap at 100
    Ok(accounting::iter_user_balances_internal(offset as usize, limit as usize))
}

/// Paginated list of all LP positions
pub fn get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<LPPositionInfo>, String> {
    require_admin()?;
    let limit = limit.min(100); // Cap at 100
    Ok(liquidity_pool::iter_lp_positions_internal(offset as usize, limit as usize))
}
```

### 2. Add Types to `types.rs`

Add after existing `HealthCheck` struct (around line 114):

```rust
/// Expanded HealthCheck with operational metrics
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
    // Operational health (NEW)
    pub pending_withdrawals_count: u64,
    pub pending_withdrawals_total_amount: u64,
    pub heap_memory_bytes: u64,
    pub stable_memory_pages: u64,
    pub total_abandoned_amount: u64,
    pub unique_users: u64,
    pub unique_lps: u64,
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
```

### 3. Add Internal Helpers to `accounting.rs`

Add after existing `admin_health_check` function (around line 741):

```rust
// =============================================================================
// ADMIN QUERY HELPERS (called by admin_query.rs)
// =============================================================================

/// Expose total deposits calculation for admin queries
pub(crate) fn calculate_total_deposits_internal() -> u64 {
    calculate_total_deposits()
}

/// Count unique users with balances
pub(crate) fn count_user_balances_internal() -> u64 {
    USER_BALANCES_STABLE.with(|b| b.borrow().len())
}

/// Get pending withdrawal stats (count, total amount)
pub(crate) fn get_pending_stats_internal() -> (u64, u64) {
    PENDING_WITHDRAWALS.with(|p| {
        let pending = p.borrow();
        let count = pending.len();
        let total: u64 = pending.iter()
            .map(|entry| entry.value().get_amount())
            .sum();
        (count, total)
    })
}

/// Iterate all pending withdrawals
pub(crate) fn iter_pending_withdrawals_internal() -> Vec<super::types::PendingWithdrawalInfo> {
    PENDING_WITHDRAWALS.with(|p| {
        p.borrow().iter().map(|entry| {
            let (user, pending) = (entry.key(), entry.value());
            super::types::PendingWithdrawalInfo {
                user: user.clone(),
                withdrawal_type: match &pending.withdrawal_type {
                    WithdrawalType::User { .. } => "User".to_string(),
                    WithdrawalType::LP { .. } => "LP".to_string(),
                },
                amount: pending.get_amount(),
                created_at: pending.created_at,
            }
        }).collect()
    })
}

/// Paginated user balances
pub(crate) fn iter_user_balances_internal(offset: usize, limit: usize) -> Vec<super::types::UserBalance> {
    USER_BALANCES_STABLE.with(|b| {
        b.borrow().iter()
            .skip(offset)
            .take(limit)
            .map(|entry| super::types::UserBalance {
                user: entry.key().clone(),
                balance: entry.value().clone(),
            })
            .collect()
    })
}

/// Sum all abandoned amounts from audit log
pub(crate) fn sum_abandoned_from_audit_internal() -> u64 {
    AUDIT_LOG_MAP.with(|log| {
        log.borrow().iter()
            .filter_map(|entry| {
                if let AuditEvent::WithdrawalAbandoned { amount, .. } = &entry.value().event {
                    Some(*amount)
                } else {
                    None
                }
            })
            .sum()
    })
}

/// Build orphaned funds report from audit log
pub(crate) fn build_orphaned_funds_report_internal() -> super::types::OrphanedFundsReport {
    AUDIT_LOG_MAP.with(|log| {
        let mut total = 0u64;
        let mut count = 0u64;
        let mut recent: Vec<super::types::AbandonedEntry> = Vec::new();

        for entry in log.borrow().iter() {
            if let AuditEvent::WithdrawalAbandoned { user, amount } = &entry.value().event {
                total += amount;
                count += 1;
                // Keep last 50 abandonments
                if recent.len() < 50 {
                    recent.push(super::types::AbandonedEntry {
                        user: user.clone(),
                        amount: *amount,
                        timestamp: entry.value().timestamp,
                    });
                }
            }
        }

        super::types::OrphanedFundsReport {
            total_abandoned_amount: total,
            abandoned_count: count,
            recent_abandonments: recent,
        }
    })
}
```

Also **REMOVE** the existing `admin_health_check` function and `ADMIN_PRINCIPAL` constant from `accounting.rs` (lines 693-741) since they're moving to `admin_query.rs`.

### 4. Add Internal Helpers to `liquidity_pool.rs`

Add at end of file:

```rust
// =============================================================================
// ADMIN QUERY HELPERS
// =============================================================================

/// Count LP positions (excluding burned shares)
pub(crate) fn count_lp_positions_internal() -> u64 {
    LP_SHARES.with(|shares| {
        shares.borrow().iter()
            .filter(|entry| entry.key() != &Principal::anonymous())
            .count() as u64
    })
}

/// Paginated LP positions
pub(crate) fn iter_lp_positions_internal(offset: usize, limit: usize) -> Vec<super::types::LPPositionInfo> {
    LP_SHARES.with(|shares| {
        shares.borrow().iter()
            .filter(|entry| entry.key() != &Principal::anonymous())
            .skip(offset)
            .take(limit)
            .map(|entry| super::types::LPPositionInfo {
                user: entry.key().clone(),
                shares: entry.value().0.clone(),
            })
            .collect()
    })
}
```

### 5. Update `mod.rs`

Add the new module:

```rust
pub mod admin_query;  // NEW
pub mod accounting;
pub mod liquidity_pool;
// ... rest unchanged
```

### 6. Update `lib.rs` Endpoints

Replace existing `admin_health_check` and add new endpoints:

```rust
// =============================================================================
// ADMIN DIAGNOSTIC ENDPOINTS
// =============================================================================

#[update]
async fn admin_health_check() -> Result<defi_accounting::types::HealthCheck, String> {
    defi_accounting::admin_query::admin_health_check().await
}

#[query]
fn admin_get_all_pending_withdrawals() -> Result<Vec<defi_accounting::types::PendingWithdrawalInfo>, String> {
    defi_accounting::admin_query::get_all_pending_withdrawals()
}

#[query]
fn admin_get_orphaned_funds_report() -> Result<defi_accounting::types::OrphanedFundsReport, String> {
    defi_accounting::admin_query::get_orphaned_funds_report()
}

#[query]
fn admin_get_all_balances(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::UserBalance>, String> {
    defi_accounting::admin_query::get_all_balances(offset, limit)
}

#[query]
fn admin_get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<defi_accounting::types::LPPositionInfo>, String> {
    defi_accounting::admin_query::get_all_lp_positions(offset, limit)
}
```

### 7. Update `dice_backend.did`

Add new types and methods:

```candid
// Add to types section
type HealthCheck = record {
  pool_reserve: nat64;
  total_deposits: nat64;
  canister_balance: nat64;
  calculated_total: nat64;
  excess: int64;
  excess_usdt: float64;
  is_healthy: bool;
  health_status: text;
  timestamp: nat64;
  // NEW fields
  pending_withdrawals_count: nat64;
  pending_withdrawals_total_amount: nat64;
  heap_memory_bytes: nat64;
  stable_memory_pages: nat64;
  total_abandoned_amount: nat64;
  unique_users: nat64;
  unique_lps: nat64;
};

type PendingWithdrawalInfo = record {
  user: principal;
  withdrawal_type: text;
  amount: nat64;
  created_at: nat64;
};

type OrphanedFundsReport = record {
  total_abandoned_amount: nat64;
  abandoned_count: nat64;
  recent_abandonments: vec AbandonedEntry;
};

type AbandonedEntry = record {
  user: principal;
  amount: nat64;
  timestamp: nat64;
};

type UserBalance = record {
  user: principal;
  balance: nat64;
};

type LPPositionInfo = record {
  user: principal;
  shares: nat;
};

// Add to service section
  admin_health_check: () -> (variant { Ok: HealthCheck; Err: text });
  admin_get_all_pending_withdrawals: () -> (variant { Ok: vec PendingWithdrawalInfo; Err: text }) query;
  admin_get_orphaned_funds_report: () -> (variant { Ok: OrphanedFundsReport; Err: text }) query;
  admin_get_all_balances: (nat64, nat64) -> (variant { Ok: vec UserBalance; Err: text }) query;
  admin_get_all_lp_positions: (nat64, nat64) -> (variant { Ok: vec LPPositionInfo; Err: text }) query;
```

---

## Files to Modify

| File | Action |
|------|--------|
| `dice_backend/src/defi_accounting/admin_query.rs` | **CREATE** |
| `dice_backend/src/defi_accounting/types.rs` | **MODIFY** - expand HealthCheck, add 5 new types |
| `dice_backend/src/defi_accounting/mod.rs` | **MODIFY** - add `pub mod admin_query;` |
| `dice_backend/src/defi_accounting/accounting.rs` | **MODIFY** - add helpers, remove old admin_health_check |
| `dice_backend/src/defi_accounting/liquidity_pool.rs` | **MODIFY** - add LP iteration helpers |
| `dice_backend/src/lib.rs` | **MODIFY** - update admin_health_check, add 4 new endpoints |
| `dice_backend/dice_backend.did` | **MODIFY** - add Candid types and methods |

---

## Deployment

```bash
# Build
cargo build --target wasm32-unknown-unknown --release -p dice_backend

# Deploy
./deploy.sh --dice-only
```

---

## Testing

```bash
# Test as admin
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai admin_health_check
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai admin_get_all_pending_withdrawals
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai admin_get_orphaned_funds_report
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai admin_get_all_balances '(0, 10)'
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai admin_get_all_lp_positions '(0, 10)'

# Test as non-admin (should fail with "Unauthorized")
dfx identity use default
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai admin_health_check
# Expected: (variant { Err = "Unauthorized: admin only" })
```

---

## PR Template

```
feat(dice): Add comprehensive admin diagnostic queries

## Summary
- Creates new `admin_query.rs` module for admin-only diagnostics
- Expands `HealthCheck` with operational metrics (memory, pending, orphaned)
- Adds 4 new query endpoints for detailed drill-down

## New Endpoints
- `admin_health_check()` - Expanded overview (financial + operational)
- `admin_get_all_pending_withdrawals()` - List stuck withdrawals
- `admin_get_orphaned_funds_report()` - Analyze abandoned funds
- `admin_get_all_balances(offset, limit)` - Paginated user data
- `admin_get_all_lp_positions(offset, limit)` - Paginated LP data

## Security
All endpoints restricted to admin principal only.

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai
```
