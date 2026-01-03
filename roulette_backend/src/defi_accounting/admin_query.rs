use candid::Principal;
use super::accounting;
use super::liquidity_pool;
use super::types::*;

const ADMIN_PRINCIPAL: &str = "p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae";
#[cfg(target_arch = "wasm32")]
const WASM_PAGE_SIZE_BYTES: u64 = 65536;
const REASONABLE_MAX_LIMIT: usize = 10_000; // Safety net for unbounded queries

fn require_admin() -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();
    let admin = Principal::from_text(ADMIN_PRINCIPAL)
        .map_err(|e| format!("Invalid admin principal: {:?}", e))?;
    if caller != admin {
        return Err("Unauthorized: admin only".to_string());
    }
    Ok(())
}

/// Expanded health check - consolidates financial + operational metrics
///
/// # Returns
/// - `Ok(HealthCheck)`: Snapshot of system health including balances, pending withdrawals, and memory usage.
/// - `Err(String)`: "Unauthorized: admin only" if caller is not the admin.
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

    // NEW: Explicit solvency check
    let is_solvent = excess >= 0;

    // Health status (update logic to reflect solvency)
    let (is_healthy, health_status) = if !is_solvent {
        (false, format!("CRITICAL: INSOLVENT (deficit {} USDT)", excess_usdt.abs()))
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
    #[cfg(target_arch = "wasm32")]
    let heap_memory_bytes = (core::arch::wasm32::memory_size(0) as u64)
        .saturating_mul(WASM_PAGE_SIZE_BYTES);
    #[cfg(not(target_arch = "wasm32"))]
    let heap_memory_bytes: u64 = 0; // Placeholder for non-wasm targets (tests)

    let stable_memory_pages = ic_cdk::stable::stable_size();

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
        is_solvent,  // NEW field
    })
}

/// Get all pending withdrawals (for diagnosing stuck states)
pub fn get_all_pending_withdrawals() -> Result<Vec<PendingWithdrawalInfo>, String> {
    require_admin()?;
    Ok(accounting::iter_pending_withdrawals_internal())
}

/// Analyze orphaned funds from audit log
pub fn get_orphaned_funds_report(recent_limit: Option<u64>) -> Result<OrphanedFundsReport, String> {
    require_admin()?;
    let limit = recent_limit.map(|l| l as usize);
    Ok(accounting::build_orphaned_funds_report_internal(limit))
}

/// Paginated list of all user balances
pub fn get_all_balances(offset: u64, limit: u64) -> Result<Vec<UserBalance>, String> {
    require_admin()?;
    Ok(accounting::iter_user_balances_internal(offset as usize, limit as usize))
}

/// Paginated list of all LP positions
pub fn get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<LPPositionInfo>, String> {
    require_admin()?;
    Ok(liquidity_pool::iter_lp_positions_internal(offset as usize, limit as usize))
}

/// Get all user balances without pagination (admin convenience)
pub fn get_all_balances_complete() -> Result<Vec<UserBalance>, String> {
    require_admin()?;
    Ok(accounting::iter_user_balances_internal(0, REASONABLE_MAX_LIMIT))
}

/// Get all LP positions without pagination (admin convenience)
pub fn get_all_lp_positions_complete() -> Result<Vec<LPPositionInfo>, String> {
    require_admin()?;
    Ok(liquidity_pool::iter_lp_positions_internal(0, REASONABLE_MAX_LIMIT))
}

/// Get complete orphaned funds report (all abandonments, no limit)
pub fn get_orphaned_funds_report_full() -> Result<OrphanedFundsReport, String> {
    require_admin()?;
    Ok(accounting::build_orphaned_funds_report_internal(None))
}

/// Get paginated audit log entries (most recent first).
///
/// # Arguments
/// - `limit`: Maximum number of entries to return (max 100)
/// - `offset`: Number of entries to skip from the most recent
pub fn get_audit_log(limit: u64, offset: u64) -> Result<Vec<AuditEntry>, String> {
    require_admin()?;
    // Cap limit to prevent abuse
    let capped_limit = limit.min(100);
    Ok(accounting::get_audit_entries(capped_limit, offset))
}

/// Get the total number of audit log entries.
pub fn get_audit_log_count() -> Result<u64, String> {
    require_admin()?;
    Ok(accounting::get_audit_count())
}