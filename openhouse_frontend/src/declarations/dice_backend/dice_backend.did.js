export const idlFactory = ({ IDL }) => {
  const RollDirection = IDL.Variant({ 'Over' : IDL.Null, 'Under' : IDL.Null });
  const AccountingStats = IDL.Record({
    'total_user_deposits' : IDL.Nat64,
    'unique_depositors' : IDL.Nat64,
    'house_balance' : IDL.Nat64,
    'canister_balance' : IDL.Nat64,
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
    'redeemable_icp' : IDL.Nat,
    'pool_ownership_percent' : IDL.Float64,
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
  const MinimalGameResult = IDL.Record({
    'is_win' : IDL.Bool,
    'rolled_number' : IDL.Nat8,
    'payout' : IDL.Nat64,
  });
  return IDL.Service({
    'audit_balances' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Text, 'Err' : IDL.Text })],
        ['query'],
      ),
    'calculate_payout_info' : IDL.Func(
        [IDL.Nat8, RollDirection],
        [
          IDL.Variant({
            'Ok' : IDL.Tuple(IDL.Float64, IDL.Float64),
            'Err' : IDL.Text,
          }),
        ],
        ['query'],
      ),
    'can_accept_bets' : IDL.Func([], [IDL.Bool], ['query']),
    'deposit' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
    'deposit_liquidity' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Nat, 'Err' : IDL.Text })],
        [],
      ),
    'get_accounting_stats' : IDL.Func([], [AccountingStats], ['query']),
    'get_balance' : IDL.Func([IDL.Principal], [IDL.Nat64], ['query']),
    'get_canister_balance' : IDL.Func([], [IDL.Nat64], []),
    'get_current_seed_hash' : IDL.Func([], [IDL.Text], ['query']),
    'get_daily_stats' : IDL.Func(
        [IDL.Nat32],
        [IDL.Vec(DailySnapshot)],
        ['query'],
      ),
    'get_house_balance' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_house_mode' : IDL.Func([], [IDL.Text], ['query']),
    'get_lp_position' : IDL.Func([IDL.Principal], [LPPosition], ['query']),
    'get_max_allowed_payout' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_my_balance' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_my_lp_position' : IDL.Func([], [LPPosition], ['query']),
    'get_pool_apy' : IDL.Func([IDL.Opt(IDL.Nat32)], [ApyInfo], ['query']),
    'get_pool_stats' : IDL.Func([], [PoolStats], ['query']),
    'get_seed_info' : IDL.Func([], [IDL.Text, IDL.Nat64, IDL.Nat64], ['query']),
    'get_stats_count' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_stats_range' : IDL.Func(
        [IDL.Nat64, IDL.Nat64],
        [IDL.Vec(DailySnapshot)],
        ['query'],
      ),
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
    'play_dice' : IDL.Func(
        [IDL.Nat64, IDL.Nat8, RollDirection, IDL.Text],
        [IDL.Variant({ 'Ok' : MinimalGameResult, 'Err' : IDL.Text })],
        [],
      ),
    'refresh_canister_balance' : IDL.Func([], [IDL.Nat64], []),
    'verify_game_result' : IDL.Func(
        [IDL.Vec(IDL.Nat8), IDL.Text, IDL.Nat64, IDL.Nat8],
        [IDL.Variant({ 'Ok' : IDL.Bool, 'Err' : IDL.Text })],
        ['query'],
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
