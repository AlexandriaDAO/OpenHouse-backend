export const idlFactory = ({ IDL }) => {
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
  return IDL.Service({
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
    'get_expected_value' : IDL.Func([], [IDL.Float64], ['query']),
    'get_formula' : IDL.Func([], [IDL.Text], ['query']),
    'get_multipliers_bp' : IDL.Func([], [IDL.Vec(IDL.Nat64)], ['query']),
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };
