use candid::Principal;
use ic_cdk::query;
use super::accounting::{self, AccountingStats};
use super::liquidity_pool::{self, LPPosition, PoolStats};

// =============================================================================
// ACCOUNTING QUERIES
// =============================================================================

#[query]
pub fn get_balance(user: Principal) -> u64 {
    accounting::get_balance_internal(user)
}

#[query]
pub fn get_my_balance() -> u64 {
    get_balance(ic_cdk::caller())
}

#[query]
pub fn get_max_allowed_payout() -> u64 {
    accounting::get_max_allowed_payout_internal()
}

#[query]
pub fn get_house_balance() -> u64 {
    liquidity_pool::get_pool_reserve()
}

#[query]
pub fn get_accounting_stats() -> AccountingStats {
    accounting::get_accounting_stats_internal()
}

#[query]
pub fn audit_balances() -> Result<String, String> {
    accounting::audit_balances_internal()
}

// =============================================================================
// LIQUIDITY POOL QUERIES
// =============================================================================

#[query]
pub fn get_lp_position(user: Principal) -> LPPosition {
    liquidity_pool::get_lp_position_internal(user)
}

#[query]
pub fn get_pool_stats() -> PoolStats {
    liquidity_pool::get_pool_stats_internal()
}

#[query]
pub fn get_my_lp_position() -> LPPosition {
    get_lp_position(ic_cdk::caller())
}

#[query]
pub fn get_house_mode() -> String {
    "liquidity_pool".to_string()
}