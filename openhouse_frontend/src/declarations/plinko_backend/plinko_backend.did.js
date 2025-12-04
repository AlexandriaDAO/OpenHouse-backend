export const idlFactory = ({ IDL }) => {
  const UserBalance = IDL.Record({
    'balance' : IDL.Nat64,
    'user' : IDL.Principal,
  });
  const LPPositionInfo = IDL.Record({
    'shares' : IDL.Nat,
    'user' : IDL.Principal,
  });
  const PendingWithdrawalInfo = IDL.Record({
    'user' : IDL.Principal,
    'created_at' : IDL.Nat64,
    'amount' : IDL.Nat64,
    'withdrawal_type' : IDL.Text,
  });
  const AbandonedEntry = IDL.Record({
    'user' : IDL.Principal,
    'timestamp' : IDL.Nat64,
    'amount' : IDL.Nat64,
  });
  const OrphanedFundsReport = IDL.Record({
    'abandoned_count' : IDL.Nat64,
    'total_abandoned_amount' : IDL.Nat64,
    'recent_abandonments' : IDL.Vec(AbandonedEntry),
  });
  const HealthCheck = IDL.Record({
    'stable_memory_pages' : IDL.Nat64,
    'total_deposits' : IDL.Nat64,
    'is_healthy' : IDL.Bool,
    'calculated_total' : IDL.Nat64,
    'heap_memory_bytes' : IDL.Nat64,
    'is_solvent' : IDL.Bool,
    'total_abandoned_amount' : IDL.Nat64,
    'health_status' : IDL.Text,
    'unique_lps' : IDL.Nat64,
    'unique_users' : IDL.Nat64,
    'pool_reserve' : IDL.Nat64,
    'timestamp' : IDL.Nat64,
    'excess' : IDL.Int64,
    'excess_usdt' : IDL.Float64,
    'pending_withdrawals_count' : IDL.Nat64,
    'canister_balance' : IDL.Nat64,
    'pending_withdrawals_total_amount' : IDL.Nat64,
  });
  const PlinkoResult = IDL.Record({
    'win' : IDL.Bool,
    'multiplier' : IDL.Float64,
    'path' : IDL.Vec(IDL.Bool),
    'final_position' : IDL.Nat8,
  });
  const MultiBallResult = IDL.Record({
    'total_balls' : IDL.Nat8,
    'results' : IDL.Vec(PlinkoResult),
    'total_wins' : IDL.Nat8,
    'average_multiplier' : IDL.Float64,
  });
  const DailySnapshot = IDL.Record({
    'day_timestamp' : IDL.Nat64,
    'daily_volume' : IDL.Nat64,
    'share_price' : IDL.Nat64,
    'pool_reserve_end' : IDL.Nat64,
    'daily_pool_profit' : IDL.Int64,
  });
  const LPPosition = IDL.Record({
    'shares' : IDL.Nat,
    'pool_ownership_percent' : IDL.Float64,
    'redeemable_usdt' : IDL.Nat,
  });
  const WithdrawalType = IDL.Variant({
    'LP' : IDL.Record({
      'shares' : IDL.Nat,
      'reserve' : IDL.Nat,
      'amount' : IDL.Nat64,
    }),
    'User' : IDL.Record({ 'amount' : IDL.Nat64 }),
  });
  const PendingWithdrawal = IDL.Record({
    'created_at' : IDL.Nat64,
    'withdrawal_type' : WithdrawalType,
  });
  const ApyInfo = IDL.Record({
    'days_calculated' : IDL.Nat32,
    'total_volume' : IDL.Nat64,
    'expected_apy_percent' : IDL.Float64,
    'actual_apy_percent' : IDL.Float64,
    'total_profit' : IDL.Int64,
  });
  const PoolStats = IDL.Record({
    'total_shares' : IDL.Nat,
    'share_price' : IDL.Nat,
    'pool_reserve' : IDL.Nat,
    'total_liquidity_providers' : IDL.Nat64,
    'is_initialized' : IDL.Bool,
    'minimum_liquidity_burned' : IDL.Nat,
  });
  const PlinkoGameResult = IDL.Record({
    'multiplier' : IDL.Float64,
    'bet_amount' : IDL.Nat64,
    'path' : IDL.Vec(IDL.Bool),
    'is_win' : IDL.Bool,
    'final_position' : IDL.Nat8,
    'profit' : IDL.Int64,
    'multiplier_bp' : IDL.Nat64,
    'payout' : IDL.Nat64,
  });
  const MultiBallGameResult = IDL.Record({
    'total_balls' : IDL.Nat8,
    'total_payout' : IDL.Nat64,
    'results' : IDL.Vec(PlinkoGameResult),
    'total_bet' : IDL.Nat64,
    'average_multiplier' : IDL.Float64,
    'net_profit' : IDL.Int64,
  });
  return IDL.Service({
    'abandon_withdrawal' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
    'admin_get_all_balances' : IDL.Func(
        [IDL.Nat64, IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Vec(UserBalance), 'Err' : IDL.Text })],
        ['query'],
      ),
    'admin_get_all_balances_complete' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Vec(UserBalance), 'Err' : IDL.Text })],
        ['query'],
      ),
    'admin_get_all_lp_positions' : IDL.Func(
        [IDL.Nat64, IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Vec(LPPositionInfo), 'Err' : IDL.Text })],
        ['query'],
      ),
    'admin_get_all_lp_positions_complete' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Vec(LPPositionInfo), 'Err' : IDL.Text })],
        ['query'],
      ),
    'admin_get_all_pending_withdrawals' : IDL.Func(
        [],
        [
          IDL.Variant({
            'Ok' : IDL.Vec(PendingWithdrawalInfo),
            'Err' : IDL.Text,
          }),
        ],
        ['query'],
      ),
    'admin_get_orphaned_funds_report' : IDL.Func(
        [IDL.Opt(IDL.Nat64)],
        [IDL.Variant({ 'Ok' : OrphanedFundsReport, 'Err' : IDL.Text })],
        ['query'],
      ),
    'admin_get_orphaned_funds_report_full' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : OrphanedFundsReport, 'Err' : IDL.Text })],
        ['query'],
      ),
    'admin_health_check' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : HealthCheck, 'Err' : IDL.Text })],
        [],
      ),
    'calculate_shares_preview' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Nat, 'Err' : IDL.Text })],
        ['query'],
      ),
    'can_accept_bets' : IDL.Func([], [IDL.Bool], ['query']),
    'deposit' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
    'deposit_liquidity' : IDL.Func(
        [IDL.Nat64, IDL.Opt(IDL.Nat)],
        [IDL.Variant({ 'Ok' : IDL.Nat, 'Err' : IDL.Text })],
        [],
      ),
    'drop_ball' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : PlinkoResult, 'Err' : IDL.Text })],
        [],
      ),
    'drop_multiple_balls' : IDL.Func(
        [IDL.Nat8],
        [IDL.Variant({ 'Ok' : MultiBallResult, 'Err' : IDL.Text })],
        [],
      ),
    'get_balance' : IDL.Func([IDL.Principal], [IDL.Nat64], ['query']),
    'get_daily_stats' : IDL.Func(
        [IDL.Nat32],
        [IDL.Vec(DailySnapshot)],
        ['query'],
      ),
    'get_effective_multiplier' : IDL.Func(
        [IDL.Nat8],
        [IDL.Tuple(IDL.Nat64, IDL.Nat64)],
        ['query'],
      ),
    'get_expected_value' : IDL.Func([], [IDL.Float64], ['query']),
    'get_formula' : IDL.Func([], [IDL.Text], ['query']),
    'get_house_balance' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_house_mode' : IDL.Func([], [IDL.Text], ['query']),
    'get_lp_position' : IDL.Func([IDL.Principal], [LPPosition], ['query']),
    'get_max_allowed_payout' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_max_bet' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_max_bet_per_ball' : IDL.Func(
        [IDL.Nat8],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        ['query'],
      ),
    'get_multipliers_bp' : IDL.Func([], [IDL.Vec(IDL.Nat64)], ['query']),
    'get_my_balance' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_my_lp_position' : IDL.Func([], [LPPosition], ['query']),
    'get_my_withdrawal_status' : IDL.Func(
        [],
        [IDL.Opt(PendingWithdrawal)],
        ['query'],
      ),
    'get_pool_apy' : IDL.Func([IDL.Opt(IDL.Nat32)], [ApyInfo], ['query']),
    'get_pool_stats' : IDL.Func([], [PoolStats], ['query']),
    'get_stats_count' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_stats_range' : IDL.Func(
        [IDL.Nat64, IDL.Nat64],
        [IDL.Vec(DailySnapshot)],
        ['query'],
      ),
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
    'play_multi_plinko' : IDL.Func(
        [IDL.Nat8, IDL.Nat64],
        [IDL.Variant({ 'Ok' : MultiBallGameResult, 'Err' : IDL.Text })],
        [],
      ),
    'play_plinko' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : PlinkoGameResult, 'Err' : IDL.Text })],
        [],
      ),
    'retry_withdrawal' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
    'withdraw_all' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
    'withdraw_all_liquidity' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
