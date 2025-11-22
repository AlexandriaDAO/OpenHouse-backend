import React, { useState } from 'react';
import { Principal } from '@dfinity/principal';
import { useAuth } from '../../../providers/AuthProvider';
import { useBalance } from '../../../providers/BalanceProvider';
import { useGameBalance } from '../../../providers/GameBalanceProvider';
import { ConnectionStatusMini } from '../../ui/ConnectionStatus';
import useDiceActor from '../../../hooks/actors/useDiceActor';
import useLedgerActor from '../../../hooks/actors/useLedgerActor';
import { ApproveArgs } from '../../../types/ledger';

interface DiceAccountingPanelProps {
  gameBalance: bigint;  // Now required, not nullable
  onBalanceChange: () => void;
  showDepositAnimation?: boolean;  // NEW: Animation prop for deposit prompt
}

export const DiceAccountingPanel: React.FC<DiceAccountingPanelProps> = ({
  gameBalance,
  onBalanceChange,
  showDepositAnimation = false,
}) => {
  const { isAuthenticated } = useAuth();
  const { balance: walletBalance, refreshBalance } = useBalance();
  const { actor } = useDiceActor();
  const { actor: ledgerActor } = useLedgerActor();

  // Get house balance from global state
  const gameBalanceContext = useGameBalance('dice');
  const houseBalance = gameBalanceContext.balance.house;

  const [depositAmount, setDepositAmount] = useState('0.1');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'idle' | 'approving' | 'depositing'>('idle');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Handle deposit
  const handleDeposit = async () => {
    if (!actor || !ledgerActor || !isAuthenticated) return;

    setIsDepositing(true);
    setError(null);
    setSuccess(null);

    try {
      const amountE8s = BigInt(Math.floor(parseFloat(depositAmount) * 100_000_000));

      // Validate amount
      if (amountE8s < BigInt(10_000_000)) {
        setError('Minimum deposit is 0.1 ICP');
        setIsDepositing(false);
        return;
      }

      if (walletBalance && amountE8s > walletBalance) {
        setError('Insufficient wallet balance');
        setIsDepositing(false);
        return;
      }

      // STEP 1: Approve the dice backend to spend ICP
      setDepositStep('approving');
      const DICE_BACKEND_CANISTER_ID = 'whchi-hyaaa-aaaao-a4ruq-cai';
      const approveArgs: ApproveArgs = {
        spender: {
          owner: Principal.fromText(DICE_BACKEND_CANISTER_ID),
          subaccount: [],
        },
        amount: amountE8s + BigInt(10_000), // Add fee buffer
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
        expected_allowance: [],
        expires_at: [],
      };

      const approveResult = await ledgerActor.icrc2_approve(approveArgs);

      if ('Err' in approveResult) {
        setError(`Approval failed: ${JSON.stringify(approveResult.Err)}`);
        setIsDepositing(false);
        setDepositStep('idle');
        return;
      }

      // STEP 2: Call backend deposit (which will use transferFrom)
      setDepositStep('depositing');
      const result = await actor.deposit(amountE8s);

      if ('Ok' in result) {
        const newBalance = result.Ok;
        setSuccess(`💰 Bought ${depositAmount} ICP in chips! New balance: ${Number(newBalance) / 100_000_000} ICP`);
        setDepositAmount('0.1');
        setShowDepositModal(false);

        // Refresh all balances
        await refreshBalance(); // Wallet balance
        onBalanceChange(); // Game balance (triggers global refresh)
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
      setDepositStep('idle');
    }
  };

  // Handle withdraw all
  const handleWithdrawAll = async () => {
    if (!actor || !isAuthenticated) return;

    setIsWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      // Call withdraw_all (no amount parameter needed)
      const result = await actor.withdraw_all();

      if ('Ok' in result) {
        const newBalance = result.Ok;
        const withdrawnAmount = (Number(gameBalance) - Number(newBalance)) / 100_000_000;
        setSuccess(`💵 Cashed out all chips! (${withdrawnAmount.toFixed(4)} ICP) New balance: ${Number(newBalance) / 100_000_000} ICP`);

        // Refresh all balances
        await refreshBalance(); // Wallet balance
        onBalanceChange(); // Game balance (triggers global refresh)
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Format balances
  const formatBalance = (e8s: bigint | null): string => {
    if (e8s === null) return '0.00000000';
    return (Number(e8s) / 100_000_000).toFixed(8);
  };

  if (!isAuthenticated) {
    return (
      <div className="card max-w-2xl mx-auto p-3">
        <p className="text-center text-gray-400 text-sm">Please log in to manage funds</p>
      </div>
    );
  }

  return (
    <>
      <div className="card max-w-2xl mx-auto p-4">
        {/* Compact Balance Display */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-green-900/10 p-2 rounded border border-green-500/20">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Dice Betting</p>
              <ConnectionStatusMini game="dice" />
            </div>
            <p className="text-sm font-bold text-green-400">{formatBalance(gameBalance)}</p>
          </div>
          <div className="bg-yellow-900/10 p-2 rounded border border-yellow-500/20">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">House Money</p>
              <ConnectionStatusMini game="dice" />
            </div>
            <p className="text-sm font-bold text-yellow-400">{formatBalance(houseBalance)}</p>
          </div>
        </div>

        {/* Compact Button Row with Icon Refresh */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowDepositModal(true)}
            disabled={isDepositing}
            className={`flex-1 px-3 py-2 bg-dfinity-turquoise/90 hover:bg-dfinity-turquoise rounded text-sm font-bold text-pure-black disabled:opacity-50 transition ${
              showDepositAnimation ? 'animate-pulse ring-4 ring-yellow-400 shadow-lg shadow-yellow-400/50' : ''
            }`}
            title="Buy chips to play Dice"
          >
            {depositStep === 'approving' ? 'Approving...' : depositStep === 'depositing' ? 'Buying...' : '💰 Buy Chips'}
          </button>

          <button
            onClick={handleWithdrawAll}
            disabled={isWithdrawing || gameBalance === BigInt(0)}
            className="flex-1 px-3 py-2 bg-dfinity-turquoise/90 hover:bg-dfinity-turquoise rounded text-sm font-bold text-pure-black disabled:opacity-50 transition"
            title="Cash out all chips from Dice Game"
          >
            {isWithdrawing ? 'Cashing out...' : '💵 Cash Out'}
          </button>

          <button
            onClick={async () => {
              await refreshBalance();
              onBalanceChange();
            }}
            className="px-3 py-2 bg-dfinity-turquoise/90 hover:bg-dfinity-turquoise rounded text-sm font-bold text-pure-black transition"
            title="Refresh all balances from blockchain"
          >
            🔄
          </button>
        </div>

        {/* Attention text when animation active */}
        {showDepositAnimation && (
          <p className="text-yellow-400 animate-pulse font-semibold text-xs text-center mt-2">
            ☝️ Buy chips here to start playing! ☝️
          </p>
        )}

        {/* Compact Messages */}
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
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDepositModal(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">💰 Buy Chips</h3>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Amount (ICP)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-700 rounded px-4 py-2 text-white"
                placeholder="Enter amount"
                min="0.1"
                step="0.01"
                disabled={isDepositing}
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Minimum: 0.1 ICP</p>
              <p className="text-xs text-blue-400 mt-2 bg-blue-900/20 border border-blue-500/20 rounded px-2 py-1">
                ℹ️ Deposit requires two steps: approve spending, then transfer
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowDepositModal(false)}
                disabled={isDepositing}
                className="flex-1 px-4 py-3 font-mono font-bold border-2 bg-transparent border-pure-white/20 text-pure-white/60 hover:bg-pure-white/10 disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={isDepositing}
                className="flex-1 px-4 py-3 font-mono font-bold border-2 bg-transparent border-dfinity-turquoise text-dfinity-turquoise hover:bg-dfinity-turquoise hover:text-pure-black disabled:border-pure-white/20 disabled:text-pure-white/20 transition"
              >
                {depositStep === 'approving' ? '🔐 Approving...' : depositStep === 'depositing' ? '↓ Depositing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
