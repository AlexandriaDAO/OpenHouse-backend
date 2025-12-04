import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameType } from '../../types/balance';
import { getGameConfig } from '../../config/gameRegistry';
import { useAuth } from '../../providers/AuthProvider';
import { useBalance } from '../../providers/BalanceProvider';

// Sub-components
import { LiquidityStatsBar } from './LiquidityStatsBar';
import { LiquidityRiskReturns } from './LiquidityRiskReturns';
import { LiquidityPosition } from './LiquidityPosition';
import { LiquidityActions } from './LiquidityActions';
import { PendingWithdrawalRecovery } from './PendingWithdrawalRecovery';
import { GameStatistics } from '../statistics/GameStatistics';

// Hooks
import { usePoolStats } from '../../hooks/liquidity/usePoolStats';
import { useApyData } from '../../hooks/liquidity/useApyData';
import { useDepositFlow } from '../../hooks/liquidity/useDepositFlow';
import { useWithdrawalFlow } from '../../hooks/liquidity/useWithdrawalFlow';

interface Props {
  gameId: GameType;
}

export function GameLiquidity({ gameId }: Props) {
  const navigate = useNavigate();
  const config = getGameConfig(gameId);
  const { isAuthenticated } = useAuth();
  const { balance: walletBalance } = useBalance();

  if (!config || !config.liquidity.enabled) {
    return <div className="text-center text-gray-400 py-12">Liquidity not available for this game</div>;
  }

  // Get theme colors from config
  const { theme } = config;

  // Hooks
  const { poolStats, myPosition, refresh: refreshStats } = usePoolStats(gameId);
  const { apy7, isLoading: apyLoading, error: apyError } = useApyData(gameId);

  const handleRefresh = useCallback(async () => {
    await refreshStats();
  }, [refreshStats]);

  const deposit = useDepositFlow(gameId, handleRefresh);
  const withdrawal = useWithdrawalFlow(gameId, handleRefresh);

  // UI State
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showRiskReturns, setShowRiskReturns] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12">
      {/* Back to Game Button - uses theme color */}
      <div className="pt-4 pb-2">
        <button
          onClick={() => navigate(config.routes.base)}
          className={`text-${theme.primary} hover:text-${theme.primary}/80 text-sm font-medium flex items-center gap-2 transition`}
        >
          <span>&larr;</span>
          <span>{config.icon} Back to Game</span>
        </button>
      </div>

      {/* Hero Section */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
          BE THE <span className={`text-${theme.primary}`}>HOUSE</span>
        </h1>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Provide liquidity to the {config.name} bankroll. You take the House's risk and earn the House's 1% statistical edge.
        </p>
      </div>

      {/* Pending Withdrawal Recovery */}
      {isAuthenticated && (
        <PendingWithdrawalRecovery gameId={gameId} onResolved={handleRefresh} />
      )}

      {/* Main Card */}
      <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
        {/* Stats Bar */}
        <LiquidityStatsBar
          poolStats={poolStats}
          apy7={apy7}
          apyLoading={apyLoading}
          apyError={apyError}
          theme={theme}
        />

        {/* Risk & Returns Section */}
        <LiquidityRiskReturns
          isExpanded={showRiskReturns}
          onToggle={() => setShowRiskReturns(!showRiskReturns)}
          withdrawalFeePercent={config.liquidity.withdrawalFeePercent}
        />

        {/* Key Concepts + Position + Actions */}
        <div className={`p-6 bg-gradient-to-b ${theme.gradient}`}>
          {/* Key Concepts Grid - uses theme colors */}
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className={`text-${theme.primary} font-bold mb-1 text-sm`}>Be The House</div>
              <div className="text-xs text-gray-400">Your deposit becomes house money.</div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className="text-green-400 font-bold mb-1 text-sm">1% House Edge</div>
              <div className="text-xs text-gray-400">Statistical advantage ensures long-term growth.</div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-gray-700/30">
              <div className="text-yellow-400 font-bold mb-1 text-sm">1% Withdrawal Fee</div>
              <div className="text-xs text-gray-400">Fee charged on profit + principal when withdrawing.</div>
            </div>
          </div>

          {/* User Position */}
          {isAuthenticated && myPosition && Number(myPosition.shares) > 0 && (
            <LiquidityPosition position={myPosition} theme={theme} />
          )}

          {/* Actions (Deposit/Withdraw) */}
          <LiquidityActions
            isAuthenticated={isAuthenticated}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            deposit={deposit}
            withdrawal={withdrawal}
            myPosition={myPosition}
            walletBalance={walletBalance}
            showWithdrawConfirm={showWithdrawConfirm}
            setShowWithdrawConfirm={setShowWithdrawConfirm}
            config={config}
            theme={theme}
          />

          {/* Feedback Messages */}
          {(deposit.error || withdrawal.error) && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
              {deposit.error || withdrawal.error}
            </div>
          )}
          {(deposit.success || withdrawal.success) && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg text-green-400 text-sm text-center">
              {deposit.success || withdrawal.success}
            </div>
          )}
        </div>

        {/* Statistics Section */}
        {config.liquidity.hasStatistics && (
          <div className="border-t border-gray-700/50">
            <div className="p-4 bg-black/20 border-b border-gray-700/50">
              <span className="text-gray-400 font-bold text-sm">Historical Performance & Charts</span>
            </div>
            <div className="bg-black/10">
              <GameStatistics gameId={gameId} />
            </div>
          </div>
        )}
      </div>

      {/* Withdraw Confirmation Modal */}
      {showWithdrawConfirm && (
        <WithdrawConfirmModal
          onConfirm={() => {
            setShowWithdrawConfirm(false);
            withdrawal.handleWithdrawAll();
          }}
          onCancel={() => setShowWithdrawConfirm(false)}
          withdrawalFeePercent={config.liquidity.withdrawalFeePercent}
        />
      )}
    </div>
  );
}

// Withdraw confirmation modal component
function WithdrawConfirmModal({ onConfirm, onCancel, withdrawalFeePercent }: {
  onConfirm: () => void;
  onCancel: () => void;
  withdrawalFeePercent: number;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-red-500/30 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-black text-white mb-4">Confirm Withdrawal</h3>
        <div className="space-y-4 text-sm text-gray-300 mb-6">
          <p>You are about to withdraw <strong>ALL</strong> your liquidity from the pool.</p>
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p className="text-red-400 font-bold mb-1">{withdrawalFeePercent}% Fee Applies</p>
            <p className="text-xs">A {withdrawalFeePercent}% fee will be deducted and distributed to $ALEX stakers.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition">Confirm Withdraw</button>
        </div>
      </div>
    </div>
  );
}
