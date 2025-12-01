use candid::Principal;
use super::accounting;
use super::liquidity_pool;
use super::types::*;

const ADMIN_PRINCIPAL: &str = "p7336-jmpo5-pkjsf-7dqkd-ea3zu-g2ror-ctcn2-sxtuo-tjve3-ulrx7-wae";
const WASM_PAGE_SIZE_BYTES: u64 = 65536;
const MAX_PAGINATION_LIMIT: u64 = 100;

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
    let heap_memory_bytes = (core::arch::wasm32::memory_size(0) as u64)
        .checked_mul(WASM_PAGE_SIZE_BYTES)
        .unwrap_or(u64::MAX);
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
    let limit = limit.min(MAX_PAGINATION_LIMIT);
    Ok(accounting::iter_user_balances_internal(offset as usize, limit as usize))
}

/// Paginated list of all LP positions
pub fn get_all_lp_positions(offset: u64, limit: u64) -> Result<Vec<LPPositionInfo>, String> {
    require_admin()?;
    let limit = limit.min(MAX_PAGINATION_LIMIT);
    Ok(liquidity_pool::iter_lp_positions_internal(offset as usize, limit as usize))
}
