import React, { useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { useAuth } from '../../providers/AuthProvider';
import useDiceActor from '../../hooks/actors/useDiceActor';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import { DECIMALS_PER_CKUSDT, TRANSFER_FEE } from '../../types/balance';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HealthDashboard, DiceStatistics } from '../../components/game-specific/dice';

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

// Compact tooltip text
const LP_INFO_TOOLTIP = `Deposit USDT → Receive LP shares → Earn from 1% house edge.
Share price grows as players lose. Withdraw anytime (1% fee).`;

const DICE_BACKEND_CANISTER_ID = 'whchi-hyaaa-aaaao-a4ruq-cai';

export function DiceLiquidity() {
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
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showHealth, setShowHealth] = useState(false);

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
          subaccount: [],
        },
        amount: approvalAmount,
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
        expected_allowance: [],
        expires_at: [],
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
    <div className="max-w-xl mx-auto px-4">
      {/* HERO SECTION - Pool Value Display */}
      <div className="text-center py-8">
        <div className="text-gray-500 text-xs uppercase tracking-widest mb-2">
          House Liquidity Pool
        </div>

        {/* Main metric */}
        <div className="text-5xl font-black text-white mb-1">
          ${poolStats ? formatValue(poolStats.pool_reserve) : '---'}
        </div>
        <div className="text-gray-500 text-sm">Total Pool Reserve</div>

        {/* Your position */}
        {isAuthenticated && myPosition && Number(myPosition.shares) > 0 && (
          <div className="mt-4 p-3 bg-dfinity-turquoise/10 rounded-lg inline-block">
            <div className="text-dfinity-turquoise text-2xl font-bold">
              ${formatValue(myPosition.redeemable_icp)}
            </div>
            <div className="text-gray-400 text-xs">
              Your Position ({myPosition.pool_ownership_percent.toFixed(2)}% ownership)
            </div>
          </div>
        )}
      </div>

      {/* ACTION SECTION */}
      <div className="bg-black/30 rounded-xl p-4 border border-gray-800/50 mb-4">
        {isAuthenticated ? (
          <div className="space-y-3">
            {/* Deposit row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono"
                  placeholder="10"
                  min="10"
                  disabled={isDepositing}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  USDT
                </span>
              </div>
              <button
                onClick={handleDeposit}
                disabled={isDepositing}
                className="px-6 py-3 bg-dfinity-turquoise hover:bg-dfinity-turquoise/80 rounded-lg font-bold text-black disabled:opacity-50 transition"
              >
                {isDepositing ? '...' : 'DEPOSIT'}
              </button>
            </div>

            {/* Withdraw button */}
            <button
              onClick={handleWithdrawAll}
              disabled={isWithdrawing || !myPosition || Number(myPosition.shares) === 0}
              className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg font-bold disabled:opacity-30 transition"
            >
              {isWithdrawing ? 'WITHDRAWING...' : 'WITHDRAW ALL'}
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-4">
            Please log in to become an owner
          </div>
        )}

        {/* Error/Success messages */}
        {error && (
          <div className="mt-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 p-2 bg-green-900/20 border border-green-500/30 rounded text-green-400 text-sm">
            {success}
          </div>
        )}
      </div>

      {/* STATS ROW */}
      <div className="flex justify-between items-center bg-black/20 rounded-lg p-3 border border-gray-800/50 mb-4">
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Share Price</span>
          <span className="text-purple-400 font-mono font-bold">
            ${poolStats ? (Number(poolStats.share_price) / DECIMALS_PER_CKUSDT).toFixed(4) : '---'}
          </span>
        </div>
        <div className="h-6 w-px bg-gray-800"></div>
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">LPs</span>
          <span className="text-blue-400 font-mono font-bold">
            {poolStats ? poolStats.total_liquidity_providers.toString() : '---'}
          </span>
        </div>
        <div className="h-6 w-px bg-gray-800"></div>
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">House Edge</span>
          <span className="text-green-400 font-mono font-bold">1%</span>
        </div>
        <div className="h-6 w-px bg-gray-800"></div>
        <div className="flex flex-col text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Withdraw Fee</span>
          <span className="text-yellow-400 font-mono font-bold">1%</span>
        </div>
        <InfoTooltip content={LP_INFO_TOOLTIP} />
      </div>

      {/* OPTIONAL SECTIONS */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowStats(!showStats)}
          className="flex-1 py-2 text-sm text-gray-400 hover:text-white bg-black/20 rounded-lg border border-gray-800/50 hover:border-gray-700 transition"
        >
          {showStats ? 'Hide' : 'View'} Performance
        </button>
        <button
          onClick={() => setShowHealth(!showHealth)}
          className="flex-1 py-2 text-sm text-gray-400 hover:text-white bg-black/20 rounded-lg border border-gray-800/50 hover:border-gray-700 transition"
        >
          {showHealth ? 'Hide' : 'System'} Health
        </button>
        <button
          onClick={() => setShowHowItWorks(true)}
          className="py-2 px-4 text-sm text-gray-500 hover:text-white"
          title="How it works"
        >
          ?
        </button>
      </div>

      {/* Expandable Statistics */}
      {showStats && <DiceStatistics />}

      {/* Expandable Health Dashboard */}
      {showHealth && <HealthDashboard inline={true} />}

      {/* Risk disclaimer */}
      <div className="text-center text-xs text-gray-600 mt-4">
        Risk: You can lose funds if players win big. Only invest what you can afford to lose.
      </div>

      {/* HOW IT WORKS MODAL */}
      {showHowItWorks && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
             onClick={() => setShowHowItWorks(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-700"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">How Liquidity Providing Works</h3>
              <button onClick={() => setShowHowItWorks(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>

            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <h4 className="font-bold text-green-400 mb-1">You Earn When</h4>
                <ul className="text-xs space-y-1">
                  <li>• Players lose bets (1% house edge)</li>
                  <li>• Share price increases as pool grows</li>
                  <li>• Other LPs withdraw (their 1% fee stays)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-red-400 mb-1">You Lose When</h4>
                <ul className="text-xs space-y-1">
                  <li>• Players win big payouts</li>
                  <li>• Share price decreases as pool shrinks</li>
                  <li>• You withdraw (1% fee deducted)</li>
                </ul>
              </div>

              <div className="pt-2 border-t border-gray-700">
                <h4 className="font-bold text-purple-400 mb-1">Share Math</h4>
                <p className="text-xs text-gray-400">
                  shares = (deposit × total_shares) / pool_reserve<br/>
                  Your USDT = (your_shares × pool_reserve) / total_shares
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}