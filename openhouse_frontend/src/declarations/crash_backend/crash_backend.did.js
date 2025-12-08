export const idlFactory = ({ IDL }) => {
  const PlayCrashResult = IDL.Record({
    'won' : IDL.Bool,
    'randomness_hash' : IDL.Text,
    'target_multiplier' : IDL.Float64,
    'crash_point' : IDL.Float64,
    'payout' : IDL.Nat64,
  });
  const SingleRocketResult = IDL.Record({
    'reached_target' : IDL.Bool,
    'crash_point' : IDL.Float64,
    'rocket_index' : IDL.Nat8,
    'payout' : IDL.Nat64,
  });
  const MultiCrashResult = IDL.Record({
    'master_randomness_hash' : IDL.Text,
    'rockets' : IDL.Vec(SingleRocketResult),
    'rockets_succeeded' : IDL.Nat8,
    'total_payout' : IDL.Nat64,
    'rocket_count' : IDL.Nat8,
    'target_multiplier' : IDL.Float64,
  });
  const CrashResult = IDL.Record({
    'randomness_hash' : IDL.Text,
    'crash_point' : IDL.Float64,
  });
  return IDL.Service({
    'get_crash_formula' : IDL.Func([], [IDL.Text], ['query']),
    'get_expected_value' : IDL.Func([], [IDL.Float64], ['query']),
    'get_probability_table' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Float64, IDL.Float64))],
        ['query'],
      ),
    'get_win_probability' : IDL.Func(
        [IDL.Float64],
        [IDL.Variant({ 'Ok' : IDL.Float64, 'Err' : IDL.Text })],
        ['query'],
      ),
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
    'play_crash' : IDL.Func(
        [IDL.Float64],
        [IDL.Variant({ 'Ok' : PlayCrashResult, 'Err' : IDL.Text })],
        [],
      ),
    'play_crash_multi' : IDL.Func(
        [IDL.Float64, IDL.Nat8],
        [IDL.Variant({ 'Ok' : MultiCrashResult, 'Err' : IDL.Text })],
        [],
      ),
    'simulate_crash' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : CrashResult, 'Err' : IDL.Text })],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
