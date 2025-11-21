export const idlFactory = ({ IDL }) => {
  const PlayCrashResult = IDL.Record({
    'won' : IDL.Bool,
    'randomness_hash' : IDL.Text,
    'target_multiplier' : IDL.Float64,
    'crash_point' : IDL.Float64,
    'payout' : IDL.Nat64,
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
    'simulate_crash' : IDL.Func(
        [],
        [IDL.Variant({ 'Ok' : CrashResult, 'Err' : IDL.Text })],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
