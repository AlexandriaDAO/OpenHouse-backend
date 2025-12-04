import { LPPosition } from '../../types/liquidity';
import { GameConfig, GameTheme } from '../../config/gameRegistry';
import { useDepositFlow } from '../../hooks/liquidity/useDepositFlow';
import { useWithdrawalFlow } from '../../hooks/liquidity/useWithdrawalFlow';

interface Props {
  isAuthenticated: boolean;
  activeTab: 'deposit' | 'withdraw';
  onTabChange: (tab: 'deposit' | 'withdraw') => void;
  deposit: ReturnType<typeof useDepositFlow>;
  withdrawal: ReturnType<typeof useWithdrawalFlow>;
  myPosition: LPPosition | null;
  walletBalance: bigint | null;
  showWithdrawConfirm: boolean;
  setShowWithdrawConfirm: (show: boolean) => void;
  config: GameConfig;
  theme: GameTheme;
}

export function LiquidityActions({
  isAuthenticated,
  activeTab,
  onTabChange,
  deposit,
  withdrawal,
  myPosition,
  walletBalance,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showWithdrawConfirm,
  setShowWithdrawConfirm,
  config,
  theme,
}: Props) {
  
  if (!isAuthenticated) {
    return (
      <div className="text-center py-8 bg-black/20 rounded-lg border border-dashed border-gray-700">
        <p className="text-gray-400 mb-2">Connect your wallet to become a House Owner</p>
      </div>
    );
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-4 mb-4 border-b border-gray-700/50 pb-1">
        <button
          onClick={() => onTabChange('deposit')}
          className={`pb-2 px-2 text-sm font-bold transition-colors border-b-2 ${
            activeTab === 'deposit'
              ? `border-${theme.primary} text-white`
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          DEPOSIT
        </button>
        <button
          onClick={() => onTabChange('withdraw')}
          className={`pb-2 px-2 text-sm font-bold transition-colors border-b-2 ${
            activeTab === 'withdraw'
              ? `border-${theme.primary} text-white`
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
                value={deposit.depositAmount}
                onChange={(e) => deposit.setDepositAmount(e.target.value)}
                className={`w-full bg-gray-950/50 border border-gray-700 rounded-lg px-4 py-3 pr-24 text-white font-mono focus:ring-2 focus:ring-${theme.primary}/50 outline-none`}
                placeholder="10"
                min={config.liquidity.minDeposit}
                disabled={deposit.isDepositing}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => walletBalance && deposit.handleMaxClick(walletBalance)}
                  disabled={deposit.isDepositing || !walletBalance}
                  className={`px-2 py-1 text-xs font-bold bg-${theme.primary}/20 hover:bg-${theme.primary}/30 text-${theme.primary} rounded border border-${theme.primary}/30 disabled:opacity-50 disabled:cursor-not-allowed transition`}
                >
                  MAX
                </button>
                <span className="text-gray-500 text-sm font-bold pointer-events-none select-none">
                  USDT
                </span>
              </div>
            </div>
            <button
              onClick={deposit.handleDeposit}
              disabled={deposit.isDepositing}
              className={`px-8 py-3 bg-${theme.primary} hover:bg-${theme.primary}/90 text-black font-black rounded-lg transition disabled:opacity-50 whitespace-nowrap`}
            >
              {deposit.isDepositing ? '...' : 'DEPOSIT'}
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
            <p className="text-sm text-red-300 font-bold mb-2">Warning: {config.liquidity.withdrawalFeePercent}% Withdrawal Fee</p>
            <p className="text-xs text-gray-400 mb-4">
              This fee is deducted from your total withdrawal and distributed to $ALEX stakers.
            </p>
            
            <button
              onClick={() => setShowWithdrawConfirm(true)}
              disabled={withdrawal.isWithdrawing || !myPosition || Number(myPosition.shares) === 0}
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {withdrawal.isWithdrawing ? 'Processing...' : 'WITHDRAW ALL LIQUIDITY'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
