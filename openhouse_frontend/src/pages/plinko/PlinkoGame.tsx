import React, { useEffect, useState, useCallback } from 'react';
import usePlinkoActor from '../../hooks/actors/usePlinkoActor';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import { GameLayout } from '../../components/game-ui';
import { BettingRail } from '../../components/betting';
import { PlinkoBoard, ReleaseTunnel, PlinkoPhysicsBalls, PLINKO_LAYOUT } from '../../components/game-specific/plinko';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { useBalance } from '../../providers/BalanceProvider';
import { useAuth } from '../../providers/AuthProvider';
import { DECIMALS_PER_CKUSDT } from '../../types/balance';
import type { PlinkoGameResult as BackendPlinkoResult } from '../../declarations/plinko_backend/plinko_backend.did';

// Constants
const ROWS = 8; // Note: Backend currently supports fixed 8 rows. 
const PLINKO_BACKEND_CANISTER_ID = 'weupr-2qaaa-aaaap-abl3q-cai';
const DEFAULT_MULTIPLIER = 0.2;

// --- Interfaces ---
interface PlinkoGameResult {
  path: boolean[];
  final_position: number;
  multiplier: number;
  win: boolean;
  timestamp: number;
  bet_amount?: number;
  payout?: number;
  profit?: number;
}

interface MultiBallBackendResult {
  results: {
    path: boolean[];
    final_position: number;
    multiplier: number;
    win: boolean;
  }[];
  total_balls: number;
  total_wins: number;
  average_multiplier: number;
  total_bet?: number;
  total_payout?: number;
  net_profit?: number;
}

interface PendingBall {
  id: number;
  path: boolean[];
}

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();
  
  // Balance State
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('plinko');
  const balance = gameBalanceContext.balance;

  const handleBalanceRefresh = useCallback(async () => {
    refreshWalletBalance();
    gameBalanceContext.refresh();
  }, [refreshWalletBalance, gameBalanceContext]);

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);  // Waiting for IC response
  const [bucketOpen, setBucketOpen] = useState(false); // Bucket door state
  const [ballCount, setBallCount] = useState(1);
  const [betAmount, setBetAmount] = useState(0.01);
  const [maxBet, setMaxBet] = useState(100);
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [gameError, setGameError] = useState('');
  
  // Stats & Info
  const [currentResult, setCurrentResult] = useState<PlinkoGameResult | null>(null);
  const [multiBallResult, setMultiBallResult] = useState<MultiBallBackendResult | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [formula, setFormula] = useState<string>('');
  const [expectedValue, setExpectedValue] = useState<number>(0);

  // Animation state - balls waiting to be dropped by physics engine
  const [pendingBalls, setPendingBalls] = useState<PendingBall[]>([]);
  const [nextBallId, setNextBallId] = useState(0);

  // Track recently landed slots for highlighting
  const [activeSlots, setActiveSlots] = useState<Set<number>>(new Set());

  // Load game data on mount
  useEffect(() => {
    async function loadGameData() {
      if (!actor) return;
      try {
        const [multsBp, formulaText, ev] = await Promise.all([
          actor.get_multipliers_bp(),
          actor.get_formula(),
          actor.get_expected_value()
        ]);

        const mults = Array.from(multsBp).map(bp => Number(bp) / 10000);
        setMultipliers(mults);
        setFormula(formulaText);
        setExpectedValue(ev);
      } catch (err) {
        console.error("Failed to load game data", err);
        setGameError('Failed to load game configuration. Please refresh.');
      }
    }
    loadGameData();
  }, [actor]);

  // Max bet calculation
  useEffect(() => {
    const updateMaxBet = async () => {
      if (!actor) return;
      try {
        const result = await actor.get_max_bet_per_ball(ballCount);
        if ('Ok' in result) {
          const maxBetUSDT = (Number(result.Ok) / DECIMALS_PER_CKUSDT) * 0.95;
          const newMaxBet = Math.max(0.01, maxBetUSDT);
          setMaxBet(newMaxBet);
          if (betAmount > newMaxBet) {
            setBetAmount(newMaxBet);
          }
        }
      } catch (err) {
        console.error('Failed to get max bet:', err);
        setMaxBet(10);
      }
    };
    updateMaxBet();
  }, [actor, ballCount, betAmount]);

  // Drop balls handler
  const dropBalls = async () => {
    if (!actor || isPlaying || isWaiting) return;

    if (!isAuthenticated) {
      setGameError('Please log in to play.');
      return;
    }

    if (balance.game === 0n) {
      setGameError('No chips! Buy chips below.');
      return;
    }

    // Start waiting state - show bucket filling with balls
    setIsWaiting(true);
    setBucketOpen(false);
    setGameError('');
    setCurrentResult(null);
    setMultiBallResult(null);

    // DEBUG: Log pre-play state
    const prePlayTimestamp = Date.now();
    console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] === PRE-PLAY STATE ===`);
    console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] Game balance: ${balance.game.toString()} (${Number(balance.game) / DECIMALS_PER_CKUSDT} USDT)`);
    console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] House balance: ${balance.house.toString()} (${Number(balance.house) / DECIMALS_PER_CKUSDT} USDT)`);
    console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] Bet: ${betAmount} USDT x ${ballCount} balls = ${betAmount * ballCount} USDT total`);

    try {
      const betAmountE8s = BigInt(Math.floor(betAmount * DECIMALS_PER_CKUSDT));
      const totalBetE8s = betAmountE8s * BigInt(ballCount);

      if (totalBetE8s > balance.game) {
        console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] FAILED: Insufficient balance (frontend check)`);
        setGameError(`Insufficient balance. Total bet: $${(betAmount * ballCount).toFixed(2)}`);
        setIsWaiting(false);
        return;
      }

      // Call backend based on ball count
      let results: { path: boolean[] }[] = [];

      console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] Calling backend...`);
      const callStartTime = Date.now();

      if (ballCount === 1) {
        const result = await actor.play_plinko(betAmountE8s);
        console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] Backend responded in ${Date.now() - callStartTime}ms`);
        if ('Ok' in result) {
          const r = result.Ok;
          results = [{ path: r.path }];

          console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] SUCCESS: bet=${Number(r.bet_amount)/DECIMALS_PER_CKUSDT}, payout=${Number(r.payout)/DECIMALS_PER_CKUSDT}, profit=${Number(r.profit)/DECIMALS_PER_CKUSDT}, mult=${r.multiplier}`);

          setCurrentResult({
            path: r.path,
            final_position: r.final_position,
            multiplier: r.multiplier,
            win: r.is_win,
            timestamp: Date.now(),
            bet_amount: Number(r.bet_amount) / DECIMALS_PER_CKUSDT,
            payout: Number(r.payout) / DECIMALS_PER_CKUSDT,
            profit: Number(r.profit) / DECIMALS_PER_CKUSDT,
          });
        } else {
          console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] BACKEND ERROR: ${result.Err}`);
          throw new Error(result.Err);
        }
      } else {
        const result = await actor.play_multi_plinko(ballCount, betAmountE8s);
        console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] Backend responded in ${Date.now() - callStartTime}ms`);
        if ('Ok' in result) {
          const r = result.Ok;
          results = r.results.map(res => ({ path: res.path }));

          console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] MULTI SUCCESS: total_bet=${Number(r.total_bet)/DECIMALS_PER_CKUSDT}, total_payout=${Number(r.total_payout)/DECIMALS_PER_CKUSDT}, net_profit=${Number(r.net_profit)/DECIMALS_PER_CKUSDT}, avg_mult=${r.average_multiplier}`);

          setMultiBallResult({
            results: r.results.map((res: BackendPlinkoResult) => ({
              path: res.path,
              final_position: res.final_position,
              multiplier: res.multiplier,
              win: res.is_win,
            })),
            total_balls: r.total_balls,
            total_wins: r.results.filter((res: BackendPlinkoResult) => res.is_win).length,
            average_multiplier: r.average_multiplier,
            total_bet: Number(r.total_bet) / DECIMALS_PER_CKUSDT,
            total_payout: Number(r.total_payout) / DECIMALS_PER_CKUSDT,
            net_profit: Number(r.net_profit) / DECIMALS_PER_CKUSDT,
          });
        } else {
          console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] MULTI BACKEND ERROR: ${result.Err}`);
          throw new Error(result.Err);
        }
      }

      // IC responded - open the bucket door
      setBucketOpen(true);

      // Wait for bucket door animation, then start physics ball drops
      setTimeout(() => {
        // Create pending balls for physics engine
        const newBalls: PendingBall[] = results.map((r, i) => ({
          id: nextBallId + i,
          path: r.path,
        }));

        setPendingBalls(newBalls);
        setNextBallId(prev => prev + ballCount);
        setIsWaiting(false);
        setIsPlaying(true);
      }, PLINKO_LAYOUT.BUCKET_OPEN_MS);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to play';
      console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] EXCEPTION: ${errorMsg}`);
      console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] Full error:`, err);

      // Refresh balance after error to check if state changed
      setTimeout(async () => {
        await gameBalanceContext.refresh();
        console.log(`[PLINKO-DEBUG ${prePlayTimestamp}] POST-ERROR balance refresh: game=${gameBalanceContext.balance?.game?.toString()}, house=${gameBalanceContext.balance?.house?.toString()}`);
      }, 1000);

      setGameError(errorMsg);
      setIsWaiting(false);
      setBucketOpen(false);
    }
  };

  // Callback when a single ball lands in a slot
  const handleBallLanded = useCallback((slotIndex: number) => {
    // Add this slot to active set
    setActiveSlots(prev => {
      const next = new Set(prev);
      next.add(slotIndex);
      return next;
    });

    // Remove from active after animation (600ms matches MultiplierSlot animation)
    setTimeout(() => {
      setActiveSlots(prev => {
        const next = new Set(prev);
        next.delete(slotIndex);
        return next;
      });
    }, 600);
  }, []);

  // Callback when all balls have landed (from physics engine)
  const handleAllBallsLanded = useCallback(() => {
    setPendingBalls([]);
    setIsPlaying(false);
    gameBalanceContext.refresh();
  }, [gameBalanceContext]);

  const houseEdge = ((1 - expectedValue) * 100).toFixed(2);

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center justify-center px-2 pb-40 overflow-hidden w-full">
        
        {/* Game Stats Bar - New compact design */}
        <div className="w-full max-w-lg mx-auto mb-2 px-4 min-h-[40px] flex items-center justify-center">
          {isWaiting ? (
            <div className="text-yellow-400 text-xs font-mono tracking-widest uppercase animate-pulse">
              Loading balls...
            </div>
          ) : !isPlaying && currentResult ? (
            <div className={`flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 ${currentResult.win ? 'text-green-400' : 'text-red-400'}`}>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Multiplier</span>
                <span className="font-bold text-xl">{currentResult.multiplier.toFixed(2)}x</span>
              </div>
              <div className="h-8 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Profit</span>
                <span className="font-bold text-xl">
                  {currentResult.profit && currentResult.profit >= 0 ? '+' : ''}{currentResult.profit?.toFixed(2)}
                </span>
              </div>
            </div>
          ) : !isPlaying && multiBallResult ? (
            <div className={`flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 ${(multiBallResult.net_profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Avg Mult</span>
                <span className="font-bold text-xl">{multiBallResult.average_multiplier.toFixed(2)}x</span>
              </div>
              <div className="h-8 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Net Profit</span>
                <span className="font-bold text-xl">
                  {(multiBallResult.net_profit ?? 0) >= 0 ? '+' : ''}{multiBallResult.net_profit?.toFixed(2)}
                </span>
              </div>
              <div className="h-8 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Wins</span>
                <span className="font-bold text-xl">{multiBallResult.total_wins}/{multiBallResult.total_balls}</span>
              </div>
            </div>
          ) : (
            <div className="text-gray-600 text-xs font-mono tracking-widest opacity-50 uppercase">
              {isPlaying ? 'Dropping Balls...' : 'Place your bet'}
            </div>
          )}
        </div>

        {/* Game Board Area */}
        <div className="card max-w-4xl mx-auto relative p-0 overflow-hidden bg-transparent border-none shadow-none">
          <div
            className={`cursor-pointer transition-transform duration-100 ${(isPlaying || isWaiting) ? 'cursor-default' : 'active:scale-95'}`}
            onClick={dropBalls}
            style={{ width: '400px', maxWidth: '100%' }}
          >
            <div style={{ aspectRatio: `${PLINKO_LAYOUT.BOARD_WIDTH}/${PLINKO_LAYOUT.BOARD_HEIGHT}` }}>
              <svg viewBox={`0 0 ${PLINKO_LAYOUT.BOARD_WIDTH} ${PLINKO_LAYOUT.BOARD_HEIGHT}`} className="w-full h-full overflow-visible">
                {/* Static board */}
                <PlinkoBoard rows={ROWS} multipliers={multipliers} activeSlots={activeSlots} />

                {/* Release tunnel - shows balls loading while waiting for IC response */}
                <ReleaseTunnel
                  ballCount={ballCount}
                  isOpen={bucketOpen}
                  isVisible={isWaiting}
                />

                {/* Physics-based animated balls */}
                {pendingBalls.length > 0 && (
                  <PlinkoPhysicsBalls
                    rows={ROWS}
                    pendingBalls={pendingBalls}
                    onAllBallsLanded={handleAllBallsLanded}
                    onBallLanded={handleBallLanded}
                    staggerMs={PLINKO_LAYOUT.BALL_STAGGER_MS}
                  />
                )}
              </svg>
            </div>

            {/* Tap to Play Hint */}
            {!isPlaying && !isWaiting && isAuthenticated && balance.game > 0n && (
              <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 text-[10px] text-gray-500 font-mono tracking-widest opacity-60 pointer-events-none">
                TAP TO DROP
              </div>
            )}
          </div>
        </div>

        {/* Controls - Ball Count & Info */}
        <div className="w-full max-w-md mx-auto mt-2 px-4 flex flex-col gap-2">
          {/* Slider Row */}
          <div className="flex items-center justify-between bg-[#0a0a14] p-3 rounded-lg border border-gray-800/50">
            <span className="text-xs text-gray-500 uppercase font-bold w-10">Balls</span>
            <div className="flex items-center flex-1 mx-4">
              <input
                type="range"
                min={1}
                max={30}
                value={ballCount}
                onChange={(e) => setBallCount(Math.min(30, Math.max(1, Number(e.target.value))))}
                disabled={isPlaying || isWaiting}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dfinity-turquoise"
              />
            </div>
            <span className="text-lg text-white font-mono font-bold w-8 text-center">{ballCount}</span>
          </div>

          {/* Info/Stats Row */}
          <div className="flex items-center justify-between gap-2">
             <div className="flex-1 bg-[#0a0a14] p-2 rounded-lg border border-gray-800/50 flex justify-between items-center px-3">
               <span className="text-[10px] text-gray-500 uppercase">Total Bet</span>
               <span className="text-sm font-mono text-yellow-400 font-bold">${(betAmount * ballCount).toFixed(2)}</span>
             </div>
             
             <button 
               onClick={() => setShowInfoModal(true)}
               className="bg-[#0a0a14] hover:bg-gray-800 border border-gray-800/50 text-gray-400 hover:text-white p-2 rounded-lg transition-colors"
               title="Game Info"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <circle cx="12" cy="12" r="10"></circle>
                 <line x1="12" y1="16" x2="12" y2="12"></line>
                 <line x1="12" y1="8" x2="12.01" y2="8"></line>
               </svg>
             </button>
          </div>
        </div>

        {gameError && (
          <div className="text-red-400 text-center mt-2 bg-red-900/10 p-2 rounded border border-red-900/20 text-xs">{gameError}</div>
        )}
      </div>

      {/* Betting Controls */}
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
          disabled={isPlaying || isWaiting}
          multiplier={multipliers[Math.floor(multipliers.length / 2)] || DEFAULT_MULTIPLIER}
          canisterId={PLINKO_BACKEND_CANISTER_ID}
          isBalanceLoading={gameBalanceContext.isLoading}
          isBalanceInitialized={gameBalanceContext.isInitialized}
        />
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <InfoModal
          onClose={() => setShowInfoModal(false)}
          formula={formula}
          houseEdge={houseEdge}
          expectedValue={expectedValue}
          multipliers={multipliers}
        />
      )}
    </GameLayout>
  );
};

// --- Info Modal Component ---
interface InfoModalProps {
  onClose: () => void;
  formula: string;
  houseEdge: string;
  expectedValue: number;
  multipliers: number[];
}

const InfoModal: React.FC<InfoModalProps> = (props) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         onClick={props.onClose}>
      <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-gray-700 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">How Plinko Works</h3>
          <button onClick={props.onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="text-sm text-gray-300 space-y-4">
          <div>
            <p className="font-semibold text-white mb-1">The Formula</p>
            <code className="text-sm font-mono text-dfinity-turquoise bg-black/50 px-3 py-1 rounded block">
              {props.formula || 'M(k) = 0.2 + 6.32 × ((k-4)/4)²'}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="bg-black/20 p-2 rounded border border-gray-800">
                <p className="font-semibold text-white mb-1 text-xs uppercase">House Edge</p>
                <p className="font-mono text-red-400">{props.houseEdge}%</p>
             </div>
             <div className="bg-black/20 p-2 rounded border border-gray-800">
                <p className="font-semibold text-white mb-1 text-xs uppercase">Expected Value</p>
                <p className="font-mono text-green-400">{props.expectedValue.toFixed(4)}</p>
             </div>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">Probability Distribution</p>
            <p className="font-mono text-xs text-gray-400 bg-black/20 p-2 rounded">
              0.4% | 3.1% | 10.9% | 21.9% | 27.3% | 21.9% | 10.9% | 3.1% | 0.4%
            </p>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">Win Zones</p>
            <p className="text-xs">
              <span className="text-green-400 font-bold">Edges (29%)</span> = Win (1x+) |
              <span className="text-red-400 font-bold ml-1">Center (71%)</span> = Loss (&lt;1x)
            </p>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">Multipliers</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {props.multipliers.map((m, i) => (
                <span key={i} className={`text-xs px-2 py-1 rounded font-mono font-bold ${m >= 1 ? 'bg-green-900/40 text-green-400 border border-green-900/50' : 'bg-red-900/40 text-red-400 border border-red-900/50'}`}>
                  {m.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
