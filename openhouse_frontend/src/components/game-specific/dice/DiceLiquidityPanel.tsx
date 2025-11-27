import React, { useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { useAuth } from '../../../providers/AuthProvider';
import useDiceActor from '../../../hooks/actors/useDiceActor';
import useLedgerActor from '../../../hooks/actors/useLedgerActor';
import { DECIMALS_PER_CKUSDT, TRANSFER_FEE, formatUSDT } from '../../../types/balance';

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

export const DiceLiquidityPanel: React.FC = () => {
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
      // Step 1: Approve dice_backend to spend funds
      // The backend's icrc2_transfer_from needs allowance for BOTH amount AND fee
      const diceBackendPrincipal = Principal.fromText('whchi-hyaaa-aaaao-a4ruq-cai');

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

      // Step 2: Call deposit_liquidity (uses transfer_from internally)
      // Second parameter is optional min_shares_expected for slippage protection ([] = no slippage check)
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

  // Helper for formatting USDT values
  const formatValue = (val: bigint) => {
      return (Number(val) / DECIMALS_PER_CKUSDT).toFixed(2);
  };

  // Render UI
  return (
    <div className="card max-w-2xl mx-auto p-4 mb-4">
      <h2 className="text-xl font-bold mb-4">House Liquidity Pool</h2>

      {/* Pool Stats Dashboard */}
      {poolStats && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-blue-900/10 p-2 rounded border border-blue-500/20">
            <p className="text-xs text-gray-400">Total Pool Reserve</p>
            <p className="text-sm font-bold text-blue-400">
              {formatValue(poolStats.pool_reserve)} USDT
            </p>
          </div>
          <div className="bg-purple-900/10 p-2 rounded border border-purple-500/20">
            <p className="text-xs text-gray-400">Share Price</p>
            <p className="text-sm font-bold text-purple-400">
              {/* Share price needs high precision */}
              {(Number(poolStats.share_price) / DECIMALS_PER_CKUSDT).toFixed(6)} USDT
            </p>
          </div>
          <div className="bg-green-900/10 p-2 rounded border border-green-500/20">
            <p className="text-xs text-gray-400">Total LPs</p>
            <p className="text-sm font-bold text-green-400">
              {poolStats.total_liquidity_providers.toString()}
            </p>
          </div>
          <div className="bg-yellow-900/10 p-2 rounded border border-yellow-500/20">
            <p className="text-xs text-gray-400">Your Ownership</p>
            <p className="text-sm font-bold text-yellow-400">
              {myPosition ? `${myPosition.pool_ownership_percent.toFixed(2)}%` : '0.00%'}
            </p>
          </div>
        </div>
      )}

      {/* My Position */}
      {isAuthenticated && myPosition && Number(myPosition.shares) > 0 && (
        <div className="bg-gray-800 p-3 rounded mb-4">
          <h3 className="text-sm font-bold mb-2">Your Position</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-400">Shares:</span>
              <span className="ml-2 text-white font-mono">{myPosition.shares.toString()}</span>
            </div>
            <div>
              <span className="text-gray-400">Redeemable:</span>
              <span className="ml-2 text-white font-mono">
                {formatValue(myPosition.redeemable_icp)} USDT
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {isAuthenticated ? (
        <div className="space-y-2">
          {/* Deposit */}
          <div className="flex gap-2">
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="flex-1 bg-gray-900/50 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Amount (USDT)"
              min="10"
              step="1"
              disabled={isDepositing}
            />
            <button
              onClick={handleDeposit}
              disabled={isDepositing}
              className="px-4 py-2 bg-blue-600/80 hover:bg-blue-600 rounded text-sm font-bold disabled:opacity-50"
            >
              {isDepositing ? 'Depositing...' : 'Deposit LP'}
            </button>
          </div>

          {/* Withdraw */}
          <button
            onClick={handleWithdrawAll}
            disabled={isWithdrawing || !myPosition || Number(myPosition.shares) === 0}
            className="w-full px-4 py-2 bg-red-600/80 hover:bg-red-600 rounded text-sm font-bold disabled:opacity-50"
          >
            {isWithdrawing ? 'Withdrawing...' : 'Withdraw All Liquidity'}
          </button>
        </div>
      ) : (
        <p className="text-center text-gray-400 text-sm">Please log in to provide liquidity</p>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-red-900/10 border border-red-500/50 text-red-400 px-2 py-1 rounded mt-2 text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/10 border border-green-500/50 text-green-400 px-2 py-1 rounded mt-2 text-xs">
          {success}
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-400 mt-3 p-2 bg-gray-800/50 rounded">
        <strong>How it works:</strong> Deposit USDT to earn from house profits.
        You receive shares representing your pool ownership. Withdraw anytime (1% fee).
        ICRC-2 approval required before deposit.
      </div>
    </div>
  );
};
