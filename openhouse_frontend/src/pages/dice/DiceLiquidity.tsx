import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Principal } from '@dfinity/principal';
import { useAuth } from '../../providers/AuthProvider';
import useDiceActor from '../../hooks/actors/useDiceActor';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import { DECIMALS_PER_CKUSDT, TRANSFER_FEE } from '../../types/balance';
import { DiceStatistics } from '../../components/game-specific/dice';
import { PendingWithdrawalRecovery } from '../../components/game-specific/dice/PendingWithdrawalRecovery';
import { InfoTooltip } from '../../components/InfoTooltip';
import { useApyData } from '../../components/game-specific/dice/statistics/useApyData';

// Local interfaces matching what DiceLiquidityPanel used
interface PoolStats {
  total_shares: bigint;
  pool_reserve: bigint;
  share_price: bigint;
  total_liquidity_providers: bigint;
  minimum_liquidity_burned: bigint;
  is_initialized: boolean;
}

interface LPPosition {
  shares: bigint;
  pool_ownership_percent: number;
  redeemable_icp: bigint;
}

const DICE_BACKEND_CANISTER_ID = 'whchi-hyaaa-aaaao-a4ruq-cai';

export function DiceLiquidity() {
  const navigate = useNavigate();
  const { isAuthenticated, principal } = useAuth();
  const { actor: diceActor } = useDiceActor();
  const { actor: ledgerActor } = useLedgerActor();

  // State
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [myPosition, setMyPosition] = useState<LPPosition | null>(null);
  const [depositAmount, setDepositAmount] = useState('10');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRiskReturns, setShowRiskReturns] = useState(true);  // Default open
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);  // Default closed
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Fetch APY data for stats bar using lightweight hook
  const { apy7, isLoading: apyLoading, error: apyError } = useApyData();

  // Load pool stats
  useEffect(() => {
    const loadPoolStats = async () => {
      if (!diceActor) return;

      try {
        const stats = await diceActor.get_pool_stats();
        setPoolStats(stats);

        if (isAuthenticated) {
          const position = await diceActor.get_my_lp_position();
          setMyPosition(position);
        }
      } catch (err) {
        console.error('Failed to load pool stats:', err);
      }
    };

    loadPoolStats();

    // Refresh every 30s
    const interval = setInterval(loadPoolStats, 30000);
    return () => clearInterval(interval);
  }, [diceActor, isAuthenticated]);

  // Handle deposit with ICRC-2 approval flow
  const handleDeposit = async () => {
    if (!diceActor || !ledgerActor || !principal) return;

    setIsDepositing(true);
    setError(null);
    setSuccess(null);

    try {
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * DECIMALS_PER_CKUSDT));

      // Validate (Min 10 USDT)
      if (amount < BigInt(10_000_000)) {
        setError('Minimum LP deposit is 10 USDT');
        setIsDepositing(false);
        return;
      }

      // CRITICAL: ICRC-2 Approval Flow
      const diceBackendPrincipal = Principal.fromText(DICE_BACKEND_CANISTER_ID);

      // Approve amount + fee (not just amount)
      const approvalAmount = amount + BigInt(TRANSFER_FEE);

      const approveArgs = {
        spender: {
          owner: diceBackendPrincipal,
          subaccount: [] as [],
        },
        amount: approvalAmount,
        fee: [] as [],
        memo: [] as [],
        from_subaccount: [] as [],
        created_at_time: [] as [],
        expected_allowance: [] as [],
        expires_at: [] as [],
      };

      const approveResult = await ledgerActor.icrc2_approve(approveArgs);

      if ('Err' in approveResult) {
        throw new Error(`Approval failed: ${JSON.stringify(approveResult.Err)}`);
      }

      // Step 2: Call deposit_liquidity
      const result = await diceActor.deposit_liquidity(amount, []);

      if ('Ok' in result) {
        const shares = result.Ok;
        setSuccess(`Deposited ${depositAmount} USDT! Received ${shares.toString()} shares`);
        setDepositAmount('10');

        // Refresh stats
        const stats = await diceActor.get_pool_stats();
        setPoolStats(stats);
        const position = await diceActor.get_my_lp_position();
        setMyPosition(position);
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
    }
  };

  // Handle withdraw all
  const handleWithdrawAll = async () => {
    if (!diceActor) return;

    setShowWithdrawConfirm(false);
    setIsWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await diceActor.withdraw_all_liquidity();

      if ('Ok' in result) {
        const amount = result.Ok;
        const amountUSDT = Number(amount) / DECIMALS_PER_CKUSDT;
        setSuccess(`Withdrew ${amountUSDT.toFixed(2)} USDT!`);

        // Refresh stats
        const stats = await diceActor.get_pool_stats();
        setPoolStats(stats);
        setMyPosition(null); // Clear position
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const formatValue = (val: bigint) => (Number(val) / DECIMALS_PER_CKUSDT).toFixed(2);

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12">
      {/* Back to Game Button */}
      <div className="pt-4 pb-2">
        <button
          onClick={() => navigate('/dice')}
          className="text-dfinity-turquoise hover:text-dfinity-turquoise/80 text-sm font-medium flex items-center gap-2 transition"
        >
          <span>←</span>
          <span>🎲 Back to Game</span>
        </button>
      </div>

      {/* HERO SECTION - BE THE HOUSE */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
          BE THE <span className="text-dfinity-turquoise">HOUSE</span>
        </h1>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Provide liquidity to the game bankroll. You take the House's risk and earn the House's 1% statistical edge.
        </p>
      </div>

      {isAuthenticated && (
        <PendingWithdrawalRecovery onResolved={async () => {
          if (!diceActor) return;
          const stats = await diceActor.get_pool_stats();
          setPoolStats(stats);
          const position = await diceActor.get_my_lp_position();
          setMyPosition(position);
        }} />
      )}

      {/* MAIN CARD */}
      <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
        
        {/* Stats Bar - 3 Columns with APY */}
        <div className="grid grid-cols-1 md:grid-cols-3 border-b border-gray-700/50 bg-black/20">
          <div className="p-4 text-center border-b md:border-b-0 md:border-r border-gray-700/50">
             <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total House Funds</div>
             <div className="text-xl md:text-2xl font-bold text-white">
               ${poolStats ? formatValue(poolStats.pool_reserve) : '---'}
             </div>
          </div>
          <div className="p-4 text-center border-b md:border-b-0 md:border-r border-gray-700/50">
             <div className="text-gray-500 text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
               Share Price
               <InfoTooltip content="Share price = Pool Value ÷ Total Shares. Trends upward over time as the house profits." />
             </div>
             <div className="text-xl md:text-2xl font-mono font-bold text-purple-400">
               ${poolStats ? (Number(poolStats.share_price) / 100_000_000).toFixed(6) : '---'}
             </div>
          </div>
          {/* NEW: Third column - 7-Day APY */}
          <div className="p-4 text-center">
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
              7-Day APY
              <InfoTooltip content="Annual Percentage Yield based on last 7 days of pool performance. Reflects actual returns vs theoretical 1% house edge." />
            </div>
            <div className={`text-xl md:text-2xl font-mono font-bold ${
              apyLoading ? 'text-gray-600' :
              apyError ? 'text-red-500' :
              apy7 && apy7.actual_apy_percent >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {apyLoading ? '...' :
               apyError ? '⚠️' :
               apy7 ? `${apy7.actual_apy_percent >= 0 ? '+' : ''}${apy7.actual_apy_percent.toFixed(2)}%` :
               'N/A'}
            </div>
            {apy7 && (
              <div className="text-[10px] text-gray-600 mt-0.5 hidden md:block">
                Expected: {apy7.expected_apy_percent.toFixed(2)}%
              </div>
            )}
          </div>
        </div>

        {/* NEW: Risk & Returns Section (Replaces "How It Works" Modal) */}
        <div className="border-b border-gray-700/50">
          {/* Header - Always visible, clickable to toggle */}
          <button
            onClick={() => setShowRiskReturns(!showRiskReturns)}
            aria-expanded={showRiskReturns}
            aria-controls="risk-returns-content"
            className="w-full p-4 flex items-center justify-between bg-gradient-to-r from-purple-900/10 to-transparent hover:from-purple-900/20 transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="text-purple-400 font-bold text-sm">📚 Understanding Liquidity Provision</span>
            </div>
            <span className="text-gray-500 text-lg">{showRiskReturns ? '▼' : '▶'}</span>
          </button>

          {/* Content - Collapsible */}
          {showRiskReturns && (
            <div id="risk-returns-content" className="p-6 space-y-5 text-sm animate-in fade-in slide-in-from-top-2 duration-200 bg-black/10">
              {/* YOU ARE THE BANK */}
              <div className="bg-black/30 p-4 rounded-xl border border-gray-800">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                  <span>🏦</span> You are the Bank
                </h4>
                <p className="text-gray-400 text-xs leading-relaxed">
                  When you deposit, your money is pooled to form the game's bankroll.
                  Unlike a regular deposit, <strong>this money is at risk</strong>. You're taking the House's
                  position in every bet.
                </p>
              </div>

              {/* WIN/LOSE SCENARIOS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-900/10 p-3 rounded-lg border border-green-900/30">
                  <h4 className="font-bold text-green-400 mb-1 text-xs flex items-center gap-1">
                    <span>✅</span> You Win When...
                  </h4>
                  <p className="text-gray-500 text-[10px]">
                    Players lose their bets. The House has a 1% statistical advantage that compounds over time.
                  </p>
                </div>
                <div className="bg-red-900/10 p-3 rounded-lg border border-red-900/30">
                  <h4 className="font-bold text-red-400 mb-1 text-xs flex items-center gap-1">
                    <span>⚠️</span> You Lose When...
                  </h4>
                  <p className="text-gray-500 text-[10px]">
                    Players get lucky and win big payouts. Short-term variance can be significant.
                  </p>
                </div>
              </div>

              {/* ALEXANDRIA MODEL */}
              <div className="bg-yellow-900/10 p-4 rounded-xl border border-yellow-900/30">
                <h4 className="font-bold text-yellow-400 mb-1 flex items-center gap-2">
                  <span>⚡</span> The Alexandria Model
                </h4>
                <p className="text-gray-400 text-xs leading-relaxed">
                  This is an Alexandria project. We charge <strong>no fees on gameplay</strong>.
                  Instead, a <strong>1% fee is charged only when you withdraw</strong> your liquidity.
                  This fee is distributed to $ALEX token stakers. This aligns incentives: we want you
                  to keep liquidity in the pool and profit alongside the house.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Key Concepts - Simplified (kept as sticky summary) */}
        <div className="p-6 bg-gradient-to-b from-dfinity-turquoise/5 to-transparent">
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className="text-dfinity-turquoise font-bold mb-1 text-sm">Be The House</div>
              <div className="text-xs text-gray-400">
                Your deposit becomes house money.
              </div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className="text-green-400 font-bold mb-1 text-sm">1% House Edge</div>
              <div className="text-xs text-gray-400">
                Statistical advantage ensures long-term growth.
              </div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className="text-yellow-400 font-bold mb-1 text-sm">1% Withdrawal Fee</div>
              <div className="text-xs text-gray-400">
                Fee charged on profit + principal when withdrawing.
              </div>
            </div>
          </div>

          {/* YOUR POSITION */}
          {isAuthenticated && myPosition && Number(myPosition.shares) > 0 && (
            <div className="mb-6 p-4 bg-dfinity-turquoise/10 border border-dfinity-turquoise/20 rounded-xl flex justify-between items-center">
              <div>
                <div className="text-dfinity-turquoise text-sm font-bold uppercase tracking-wider">Your Position</div>
                <div className="text-gray-400 text-xs">
                  {myPosition.pool_ownership_percent.toFixed(4)}% ownership
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">
                  ${formatValue(myPosition.redeemable_icp)}
                </div>
              </div>
            </div>
          )}

          {/* ACTIONS */}
          {isAuthenticated ? (
            <div>
              {/* Tabs */}
              <div className="flex gap-4 mb-4 border-b border-gray-700/50 pb-1">
                <button
                  onClick={() => setActiveTab('deposit')}
                  className={`pb-2 px-2 text-sm font-bold transition-colors border-b-2 ${
                    activeTab === 'deposit'
                      ? 'border-dfinity-turquoise text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  DEPOSIT
                </button>
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className={`pb-2 px-2 text-sm font-bold transition-colors border-b-2 ${
                    activeTab === 'withdraw'
                      ? 'border-dfinity-turquoise text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  WITHDRAW
                </button>
              </div>

              {/* Deposit View */}
              {activeTab === 'deposit' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="w-full bg-gray-950/50 border border-gray-700 rounded-lg px-4 py-3 pr-16 text-white font-mono focus:ring-2 focus:ring-dfinity-turquoise/50 outline-none"
                        placeholder="10"
                        min="10"
                        disabled={isDepositing}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold pointer-events-none select-none bg-transparent">
                        USDT
                      </span>
                    </div>
                    <button
                      onClick={handleDeposit}
                      disabled={isDepositing}
                      className="px-8 py-3 bg-dfinity-turquoise hover:bg-dfinity-turquoise/90 text-black font-black rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                    >
                      {isDepositing ? '...' : 'DEPOSIT'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Deposits are instantly added to the pool. You will receive LP shares representing your ownership.
                  </p>
                </div>
              )}

              {/* Withdraw View */}
              {activeTab === 'withdraw' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 bg-red-900/10 border border-red-900/30 rounded-xl text-center">
                    <p className="text-sm text-red-300 font-bold mb-2">Warning: 1% Withdrawal Fee</p>
                    <p className="text-xs text-gray-400 mb-4">
                      This fee is deducted from your total withdrawal and distributed to $ALEX stakers.
                    </p>
                    
                    <button
                      onClick={() => setShowWithdrawConfirm(true)}
                      disabled={isWithdrawing || !myPosition || Number(myPosition.shares) === 0}
                      className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isWithdrawing ? 'Processing...' : 'WITHDRAW ALL LIQUIDITY'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 bg-black/20 rounded-lg border border-dashed border-gray-700">
              <p className="text-gray-400 mb-2">Connect your wallet to become a House Owner</p>
            </div>
          )}
          
          {/* Feedback Messages */}
          {error && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg text-green-400 text-sm text-center">
              {success}
            </div>
          )}

        </div>
      </div>

      {/* MODIFIED: Advanced Stats Section (Replaces footer toggle) */}
      <div className="mt-6 bg-gray-900/40 border border-gray-700/50 rounded-2xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setShowAdvancedStats(!showAdvancedStats)}
          aria-expanded={showAdvancedStats}
          aria-controls="advanced-stats-content"
          className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-bold text-sm">📊 Historical Performance & Charts</span>
          </div>
          <span className="text-gray-500 text-xl">{showAdvancedStats ? '▼' : '▶'}</span>
        </button>

        {/* Full Stats Component */}
        {showAdvancedStats && (
          <div id="advanced-stats-content" className="animate-in fade-in slide-in-from-top-2 duration-200 border-t border-gray-700/50">
            <DiceStatistics />
          </div>
        )}
      </div>

      {/* WITHDRAW CONFIRMATION MODAL */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
             onClick={() => setShowWithdrawConfirm(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-red-500/30 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-black text-white mb-4">Confirm Withdrawal</h3>
            
            <div className="space-y-4 text-sm text-gray-300 mb-6">
              <p>
                You are about to withdraw <strong>ALL</strong> your liquidity from the pool.
              </p>
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                <p className="text-red-400 font-bold mb-1">⚠️ 1% Fee Applies</p>
                <p className="text-xs">
                  A 1% fee will be deducted from your withdrawal amount and distributed to $ALEX stakers.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawConfirm(false)}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdrawAll}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition"
              >
                Confirm Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}