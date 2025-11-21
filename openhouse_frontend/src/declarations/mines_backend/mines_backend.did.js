export const idlFactory = ({ IDL }) => {
  const Bankroll = IDL.Record({
    'total_paid_out' : IDL.Nat64,
    'balance' : IDL.Nat64,
    'total_wagered' : IDL.Nat64,
    'house_profit' : IDL.Int64,
  });
  const GameInfo = IDL.Record({
    'player' : IDL.Principal,
    'current_multiplier' : IDL.Float64,
    'revealed' : IDL.Vec(IDL.Bool),
    'num_mines' : IDL.Nat8,
    'is_active' : IDL.Bool,
  });
  const GameSummary = IDL.Record({
    'num_mines' : IDL.Nat8,
    'game_id' : IDL.Nat64,
    'timestamp' : IDL.Nat64,
    'is_active' : IDL.Bool,
  });
  const GameStats = IDL.Record({
    'total_games' : IDL.Nat64,
    'total_busted' : IDL.Nat64,
    'total_completed' : IDL.Nat64,
  });
  const RevealResult = IDL.Record({
    'multiplier' : IDL.Float64,
    'busted' : IDL.Bool,
  });
  return IDL.Service({
    'cash_out' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
    'deposit_to_bankroll' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Null, 'Err' : IDL.Text })],
        [],
      ),
    'get_bankroll' : IDL.Func([], [Bankroll], ['query']),
    'get_game' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : GameInfo, 'Err' : IDL.Text })],
        ['query'],
      ),
    'get_recent_games' : IDL.Func(
        [IDL.Nat32],
        [IDL.Vec(GameSummary)],
        ['query'],
      ),
    'get_stats' : IDL.Func([], [GameStats], ['query']),
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
    'reveal_tile' : IDL.Func(
        [IDL.Nat64, IDL.Nat8],
        [IDL.Variant({ 'Ok' : RevealResult, 'Err' : IDL.Text })],
        [],
      ),
    'start_game' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text })],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
