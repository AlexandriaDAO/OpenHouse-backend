import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  const [ballCount, setBallCount] = useState(10);
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

  // Unified physics state
  const [isFilling, setIsFilling] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [pendingBalls, setPendingBalls] = useState<PendingBall[]>([]);
  const [nextBallId, setNextBallId] = useState(0);

  // Sync between backend response and filling animation
  const fillingCompleteRef = useRef(false);
  const backendResultsRef = useRef<{ path: boolean[] }[] | null>(null);

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

  // Try to release balls when both backend and filling are ready
  const tryReleaseBalls = useCallback(() => {
    if (fillingCompleteRef.current && backendResultsRef.current) {
      const results = backendResultsRef.current;

      // Open the bucket door
      setBucketOpen(true);

      // Wait for door animation, then trigger release
      setTimeout(() => {
        const newBalls: PendingBall[] = results.map((r, i) => ({
          id: nextBallId + i,
          path: r.path,
        }));

        setPendingBalls(newBalls);
        setNextBallId(prev => prev + results.length);
        setIsWaiting(false);
        setIsPlaying(true);
        setIsReleasing(true);

        // Clean up refs for next round
        fillingCompleteRef.current = false;
        backendResultsRef.current = null;
      }, PLINKO_LAYOUT.BUCKET_OPEN_MS);
    }
  }, [nextBallId]);

  // Callback when filling animation settles
  const handleFillingComplete = useCallback(() => {
    fillingCompleteRef.current = true;
    tryReleaseBalls();
  }, [tryReleaseBalls]);

  // Drop balls handler
  const dropBalls = async () => {
    if (!actor || isPlaying || isWaiting || isFilling) return;

    if (!isAuthenticated) {
      setGameError('Please log in to play.');
      return;
    }

    if (balance.game === 0n) {
      setGameError('No chips! Buy chips below.');
      return;
    }

    // Reset state for new game
    setGameError('');
    setCurrentResult(null);
    setMultiBallResult(null);
    setBucketOpen(false);
    setPendingBalls([]);
    fillingCompleteRef.current = false;
    backendResultsRef.current = null;

    // Start filling animation immediately (gives user something to watch)
    setIsFilling(true);
    setIsWaiting(true);

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
        setIsFilling(false);
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

      // Backend responded - store results and try to release
      backendResultsRef.current = results;
      tryReleaseBalls();

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
      setIsFilling(false);
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
    setIsFilling(false);
    setIsReleasing(false);
    gameBalanceContext.refresh();
  }, [gameBalanceContext]);

  const houseEdge = ((1 - expectedValue) * 100).toFixed(2);

  return (
    <GameLayout hideFooter noScroll>
      {/* Full-screen game */}
      <div className="flex-1 flex items-center justify-center overflow-hidden w-full pb-32">

        {/* Game Board - SVG with embedded controls */}
        <div
          className={`cursor-pointer transition-transform duration-100 h-full ${(isPlaying || isWaiting || isFilling) ? 'cursor-default' : 'active:scale-[0.99]'}`}
          onClick={dropBalls}
          style={{ maxHeight: 'calc(100vh - 200px)' }}
        >
          <svg
            viewBox={`0 0 ${PLINKO_LAYOUT.BOARD_WIDTH} ${PLINKO_LAYOUT.BOARD_HEIGHT}`}
            className="h-full w-auto"
          >
            {/* Static board */}
            <PlinkoBoard rows={ROWS} multipliers={multipliers} activeSlots={activeSlots} />

            {/* Release tunnel - structure always visible */}
            <ReleaseTunnel
              ballCount={ballCount}
              isOpen={bucketOpen}
              isVisible={true}
              showBalls={false}
            />

            {/* Unified physics balls - handles both filling and board animation */}
            <PlinkoPhysicsBalls
              rows={ROWS}
              isFilling={isFilling}
              fillBallCount={ballCount}
              onFillingComplete={handleFillingComplete}
              isReleasing={isReleasing}
              pendingBalls={pendingBalls}
              onAllBallsLanded={handleAllBallsLanded}
              onBallLanded={handleBallLanded}
              staggerMs={60}
            />

            {/* LEFT SIDE - Total bet, info & result */}
            <foreignObject x="40" y="20" width="50" height="200">
              <div
                className="flex flex-col items-center"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Total Bet Section */}
                <span className="text-[7px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Total</span>
                <div className="text-sm font-bold text-yellow-500 font-mono tabular-nums leading-tight">
                  ${(betAmount * ballCount).toFixed(2)}
                </div>

                {/* Per ball info */}
                <div className="text-[7px] text-gray-500 font-mono mt-1">
                  ${betAmount.toFixed(2)}×{ballCount}
                </div>

                {/* Info button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal(true); }}
                  className="mt-2 w-6 h-6 rounded-full bg-gray-700/80 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors flex items-center justify-center"
                  title="Game Info"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </button>

                {/* Result display - below bet info */}
                {!isPlaying && !isWaiting && !isFilling && (currentResult || multiBallResult) && (
                  <div className="mt-2 text-center pointer-events-none">
                    {currentResult ? (
                      <div className={currentResult.win ? 'text-green-400' : 'text-red-400'}>
                        <div className="text-sm font-bold drop-shadow-lg">{currentResult.multiplier.toFixed(2)}x</div>
                        <div className="text-[8px] font-mono opacity-80">
                          {currentResult.profit && currentResult.profit >= 0 ? '+' : ''}${currentResult.profit?.toFixed(2)}
                        </div>
                      </div>
                    ) : multiBallResult ? (
                      <div className={(multiBallResult.net_profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        <div className="text-sm font-bold drop-shadow-lg">{multiBallResult.average_multiplier.toFixed(2)}x</div>
                        <div className="text-[8px] font-mono opacity-80">
                          {(multiBallResult.net_profit ?? 0) >= 0 ? '+' : ''}${multiBallResult.net_profit?.toFixed(2)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </foreignObject>

            {/* RIGHT SIDE - Ball count with vertical slider */}
            <foreignObject x="310" y="20" width="50" height="280">
              <div
                className="flex flex-col items-center h-full"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Ball count display */}
                <div className="text-lg font-bold text-yellow-500 font-mono tabular-nums">
                  {ballCount}
                </div>
                <span className="text-[7px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Balls</span>

                {/* Tall vertical slider */}
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={ballCount}
                  onChange={(e) => { e.stopPropagation(); setBallCount(Math.min(30, Math.max(1, Number(e.target.value)))); }}
                  onClick={(e) => e.stopPropagation()}
                  disabled={isPlaying || isWaiting || isFilling}
                  className="w-3 flex-1 bg-gray-700/60 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500
                    [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-yellow-600
                    [&::-webkit-slider-thumb]:shadow-lg
                    [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-yellow-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-yellow-600"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
              </div>
            </foreignObject>

            {/* Tap hint */}
            {!isPlaying && !isWaiting && !isFilling && isAuthenticated && balance.game > 0n && !currentResult && !multiBallResult && (
              <text
                x={PLINKO_LAYOUT.BOARD_WIDTH / 2}
                y="180"
                textAnchor="middle"
                fill="#4a4a4a"
                fontSize="8"
                fontFamily="monospace"
                style={{ letterSpacing: '0.15em' }}
              >
                TAP TO DROP
              </text>
            )}

            {/* Error display */}
            {gameError && (
              <foreignObject x="50" y={PLINKO_LAYOUT.BOARD_HEIGHT - 60} width="300" height="30">
                <div className="text-red-400 text-[9px] text-center bg-red-900/30 px-2 py-1 rounded mx-auto w-fit">
                  {gameError}
                </div>
              </foreignObject>
            )}
          </svg>
        </div>
      </div>

      {/* Betting Controls - Bottom */}
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
          disabled={isPlaying || isWaiting || isFilling}
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
