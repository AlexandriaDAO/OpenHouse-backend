import React, { useEffect, useState, useCallback } from 'react';
import useRouletteActor from '@/hooks/actors/useRouletteActor';
import useLedgerActor from '@/hooks/actors/useLedgerActor';
import { GameLayout } from '@/components/game-ui';
import { BettingRail } from '@/components/betting';
import { RouletteTable, CardData } from '@/components/game-specific/roulette';
import { useGameBalance } from '@/providers/GameBalanceProvider';
import { useBalance } from '@/providers/BalanceProvider';
import { useAuth } from '@/providers/AuthProvider';
import { DECIMALS_PER_CKUSDT, formatUSDT } from '@/types/balance';

const ROULETTE_BACKEND_CANISTER_ID = 'wvrcw-3aaaa-aaaah-arm4a-cai';

export function Roulette() {
  const { actor } = useRouletteActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();

  // Balance
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('roulette');
  const balance = gameBalanceContext.balance;

  const handleBalanceRefresh = useCallback(() => {
    refreshWalletBalance();
    gameBalanceContext.refresh();
  }, [refreshWalletBalance, gameBalanceContext]);

  // Game State
  const [gameId, setGameId] = useState<bigint | null>(null);
  const [dealerHand, setDealerHand] = useState<CardData[]>([]);
  const [dealerHidden, setDealerHidden] = useState(false);
  const [playerHands, setPlayerHands] = useState<CardData[][]>([]);
  const [currentHandIndex, setCurrentHandIndex] = useState(0);
  const [results, setResults] = useState<(string | null)[]>([]);
  const [gameActive, setGameActive] = useState(false);
  const [betAmount, setBetAmount] = useState(1);
  const [canDouble, setCanDouble] = useState(false);
  const [canSplit, setCanSplit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [maxBet] = useState(10); // Default max bet

  // Update balances periodically - initial refresh is now handled by GameBalanceProvider
  useEffect(() => {
    if (actor) {
      const interval = setInterval(() => gameBalanceContext.refresh().catch(console.error), 30000);
      return () => clearInterval(interval);
    }
  }, [actor]);

  const mapHand = (hand: any): CardData[] => hand.cards;

  const startGame = async () => {
    if (!actor || !isAuthenticated) return;
    if (balance.game < BigInt(Math.floor(betAmount * DECIMALS_PER_CKUSDT))) {
      setError('Insufficient funds');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResults([]);
    setDealerHidden(true);
    
    try {
      const amount = BigInt(Math.floor(betAmount * DECIMALS_PER_CKUSDT));
      const seed = Math.random().toString(36).substring(7);
      
      const res = await actor.start_game(amount, seed);
      if ('Ok' in res) {
        const data = res.Ok;
        setGameId(data.game_id);
        setPlayerHands([mapHand(data.player_hand)]);
        setDealerHand([data.dealer_showing]);
        setDealerHidden(!data.is_roulette); // Reveal if instant roulette
        setCurrentHandIndex(0);
        setCanDouble(data.can_double);
        setCanSplit(data.can_split);
        setGameActive(!data.is_roulette); // If roulette, game over immediately
        
        if (data.is_roulette) {
             // We need to check result. But start_game returns game_id and initial state.
             // If is_roulette is true, the game is effectively over on backend, but backend might not return result in GameStartResult.
             // My backend impl sets is_active=false if roulette.
             // I should fetch game state or infer result.
             // If dealer showing Ace/10, they might have roulette too (Push).
             // Else Player Roulette (Win).
             // Backend handled payout.
             // I'll fetch full game state to be sure or display animation.
             // Let's quickly fetch updated game state.
             const game = await actor.get_game(data.game_id);
             if (game && game.length > 0) {
                  updateGameState(game[0]);
             }
        }
        
        gameBalanceContext.refresh();
      } else {
        setError(res.Err);
      }
    } catch (e) {
      setError('Failed to start game: ' + String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const updateGameState = (game: any) => {
    setPlayerHands(game.player_hands.map(mapHand));
    setDealerHand(mapHand(game.dealer_hand));
    setDealerHidden(game.is_active && !game.dealer_hidden_card.length); // Logic check: dealer_hidden_card is Opt
    // If game.dealer_hidden_card is Some, we hide the second card.
    // But dealer_hand usually contains ALL cards revealed SO FAR.
    // My backend: dealer_hand has 1 card if hidden, 2 if revealed?
    // Backend: dealer_hand starts with 1 card. Hidden is separate.
    // When resolved, hidden is added to dealer_hand.
    // So if game.dealer_hidden_card is Some, it means we are still playing and hidden card exists.
    
    setDealerHidden(game.dealer_hidden_card.length > 0); 
    
    setCurrentHandIndex(game.current_hand_index);
    setGameActive(game.is_active);
    
    // Check actions for current hand
    // Backend doesn't send 'can_double' in get_game. It sends it in ActionResult.
    // We can infer or just use ActionResult if this was called from action.
    // But for now assume false until action updates.
    
    // Update results
    const newResults = game.results.map((r: any) => {
         if (r.length === 0) return null;
         const res = Object.keys(r[0])[0]; // Variant
         return res;
    });
    setResults(newResults);
  };

  const handleAction = async (actionFn: () => Promise<any>) => {
    if (!gameId || !actor) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await actionFn();
      if ('Ok' in res) {
        const data = res.Ok;
        setPlayerHands((prev) => {
             const newHands = [...prev];
             // If split, we might have more hands now.
             // The backend returns 'player_hand' (the ACTIVE hand).
             // It doesn't return all hands in ActionResult.
             // But my backend impl for split returns just the active hand?
             // Let's look at backend again.
             // ActionResult has `player_hand`.
             // Split modifies game.player_hands.
             // I should probably just refetch the game state or rely on ActionResult if comprehensive.
             // ActionResult has `player_hand`.
             // Split logic in backend: returns first hand of split.
             // It's better to get full game state to ensure sync, especially for Split.
             return newHands; 
        });
        
        // For simplicity/reliability, I'll fetch full game state after every action.
        // It costs an extra query but ensures UI is perfectly synced.
        const game = await actor.get_game(gameId);
        if (game && game.length > 0) {
             updateGameState(game[0]);
             setCanDouble(data.can_double);
             setCanSplit(data.can_split);
        }
        
        if (data.game_over) {
             gameBalanceContext.refresh();
        }
      } else {
        setError(res.Err);
      }
    } catch (e) {
      setError('Action failed: ' + String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center w-full max-w-6xl mx-auto px-4 overflow-y-auto">
        
        {!isAuthenticated && (
          <div className="text-center text-gray-400 text-sm py-2">
            Please log in to play
          </div>
        )}

        <RouletteTable
            dealerHand={dealerHand}
            dealerHidden={dealerHidden}
            playerHands={playerHands}
            currentHandIndex={currentHandIndex}
            results={results}
            gameActive={gameActive}
        />

        {/* Controls */}
        {gameActive ? (
             <div className="flex gap-4 mt-8 mb-8">
                <button
                    onClick={() => handleAction(() => actor!.hit(gameId!))}
                    disabled={isLoading}
                    className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-xl shadow-lg transform active:scale-95 transition disabled:opacity-50 disabled:scale-100"
                >
                    HIT
                </button>
                <button 
                    onClick={() => handleAction(() => actor!.stand(gameId!))}
                    disabled={isLoading}
                    className="px-8 py-4 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold text-xl shadow-lg transform active:scale-95 transition disabled:opacity-50 disabled:scale-100"
                >
                    STAND
                </button>
                {canDouble && (
                    <button 
                        onClick={() => handleAction(() => actor!.double_down(gameId!))}
                        disabled={isLoading}
                        className="px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-xl shadow-lg transform active:scale-95 transition disabled:opacity-50 disabled:scale-100"
                    >
                        DOUBLE
                    </button>
                )}
                {canSplit && (
                    <button 
                        onClick={() => handleAction(() => actor!.split(gameId!))}
                        disabled={isLoading}
                        className="px-8 py-4 bg-orange-600 hover:bg-orange-500 rounded-xl font-bold text-xl shadow-lg transform active:scale-95 transition disabled:opacity-50 disabled:scale-100"
                    >
                        SPLIT
                    </button>
                )}
             </div>
        ) : (
             <div className="mt-8 mb-8">
                <button 
                    onClick={startGame}
                    disabled={isLoading || !isAuthenticated}
                    className="px-12 py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-2xl shadow-lg transform active:scale-95 transition disabled:opacity-50 disabled:scale-100"
                >
                    {playerHands.length > 0 ? 'PLAY AGAIN' : 'DEAL'}
                </button>
             </div>
        )}

        {error && (
            <div className="text-red-400 bg-red-900/20 border border-red-900/50 p-4 rounded-lg mb-4">
                {error}
            </div>
        )}

      </div>

      <div className="flex-shrink-0">
        <BettingRail
            betAmount={betAmount}
            onBetChange={setBetAmount}
            maxBet={maxBet}
            gameBalance={balance.game}
            walletBalance={walletBalance}
            houseBalance={balance.house}
            ledgerActor={ledgerActor}
            gameActor={actor}
            onBalanceRefresh={handleBalanceRefresh}
            disabled={gameActive || isLoading}
            multiplier={2} // Estimated
            canisterId={ROULETTE_BACKEND_CANISTER_ID}
            isBalanceLoading={gameBalanceContext.isLoading}
            isBalanceInitialized={gameBalanceContext.isInitialized}
        />
      </div>
    </GameLayout>
  );
}
