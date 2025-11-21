export const idlFactory = ({ IDL }) => {
  const PlinkoResult = IDL.Record({
    'win' : IDL.Bool,
    'multiplier' : IDL.Float64,
    'path' : IDL.Vec(IDL.Bool),
    'final_position' : IDL.Nat8,
  });
  const Result_1 = IDL.Variant({ 'ok' : PlinkoResult, 'err' : IDL.Text });
  const MultiBallResult = IDL.Record({
    'total_multiplier' : IDL.Float64,
    'ball_count' : IDL.Nat8,
    'balls' : IDL.Vec(PlinkoResult),
    'average_multiplier' : IDL.Float64,
  });
  const Result = IDL.Variant({ 'ok' : MultiBallResult, 'err' : IDL.Text });
  return IDL.Service({
    'drop_ball' : IDL.Func([], [Result_1], []),
    'drop_balls' : IDL.Func([IDL.Nat8], [Result], []),
    'get_expected_value' : IDL.Func([], [IDL.Float64], ['query']),
    'get_formula' : IDL.Func([], [IDL.Text], ['query']),
    'get_multipliers' : IDL.Func([], [IDL.Vec(IDL.Float64)], ['query']),
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };
