export const idlFactory = ({ IDL }) => {
  const RollDirection = IDL.Variant({ 'Over' : IDL.Null, 'Under' : IDL.Null });
  const AccountingStats = IDL.Record({
    'total_user_deposits' : IDL.Nat64,
    'unique_depositors' : IDL.Nat64,
    'house_balance' : IDL.Nat64,
    'canister_balance' : IDL.Nat64,
  });
  const DetailedGameHistory = IDL.Record({
    'multiplier' : IDL.Float64,
    'expected_value' : IDL.Float64,
    'direction' : IDL.Text,
    'player' : IDL.Text,
    'won_icp' : IDL.Float64,
    'bet_icp' : IDL.Float64,
    'is_win' : IDL.Bool,
    'target_number' : IDL.Nat8,
    'game_id' : IDL.Nat64,
    'win_chance' : IDL.Float64,
    'timestamp' : IDL.Nat64,
    'profit_loss' : IDL.Int64,
    'rolled_number' : IDL.Nat8,
    'house_edge_actual' : IDL.Float64,
  });
  const DiceResult = IDL.Record({
    'multiplier' : IDL.Float64,
    'bet_amount' : IDL.Nat64,
    'direction' : RollDirection,
    'player' : IDL.Principal,
    'is_win' : IDL.Bool,
    'target_number' : IDL.Nat8,
    'win_chance' : IDL.Float64,
    'timestamp' : IDL.Nat64,
    'rolled_number' : IDL.Nat8,
    'payout' : IDL.Nat64,
  });
  const LPPosition = IDL.Record({
    'shares' : IDL.Nat,
    'redeemable_icp' : IDL.Nat,
    'pool_ownership_percent' : IDL.Float64,
  });
  const PoolStats = IDL.Record({
    'total_shares' : IDL.Nat,
    'share_price' : IDL.Nat,
    'pool_reserve' : IDL.Nat,
    'total_liquidity_providers' : IDL.Nat64,
    'is_initialized' : IDL.Bool,
    'minimum_liquidity_burned' : IDL.Nat,
  });
  const GameStats = IDL.Record({
    'total_games' : IDL.Nat64,
    'total_payouts' : IDL.Nat64,
    'total_volume' : IDL.Nat64,
    'house_profit' : IDL.Int64,
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
    'emergency_withdraw_all' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
    'export_history_csv' : IDL.Func([IDL.Nat32], [IDL.Text], ['query']),
    'get_accounting_stats' : IDL.Func([], [AccountingStats], ['query']),
    'get_balance' : IDL.Func([IDL.Principal], [IDL.Nat64], ['query']),
    'get_canister_balance' : IDL.Func([], [IDL.Nat64], []),
    'get_current_seed_hash' : IDL.Func([], [IDL.Text], ['query']),
    'get_detailed_history' : IDL.Func(
        [IDL.Nat32],
        [IDL.Vec(DetailedGameHistory)],
        ['query'],
      ),
    'get_game' : IDL.Func([IDL.Nat64], [IDL.Opt(DiceResult)], ['query']),
    'get_house_balance' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_house_mode' : IDL.Func([], [IDL.Text], ['query']),
    'get_lp_position' : IDL.Func([IDL.Principal], [LPPosition], ['query']),
    'get_max_allowed_payout' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_my_balance' : IDL.Func([], [IDL.Nat64], ['query']),
    'get_my_lp_position' : IDL.Func([], [LPPosition], ['query']),
    'get_pool_stats' : IDL.Func([], [PoolStats], ['query']),
    'get_recent_games' : IDL.Func(
        [IDL.Nat32],
        [IDL.Vec(DiceResult)],
        ['query'],
      ),
    'get_seed_info' : IDL.Func([], [IDL.Text, IDL.Nat64, IDL.Nat64], ['query']),
    'get_stats' : IDL.Func([], [GameStats], ['query']),
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
    'play_dice' : IDL.Func(
        [IDL.Nat64, IDL.Nat8, RollDirection, IDL.Text],
        [IDL.Variant({ 'Ok' : DiceResult, 'Err' : IDL.Text })],
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
