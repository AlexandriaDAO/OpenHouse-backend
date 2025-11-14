import React, { useState } from 'react';
import { useAuth } from '../../../providers/AuthProvider';
import { useBalance } from '../../../providers/BalanceProvider';
import { useGameBalance } from '../../../providers/GameBalanceProvider';
import { ConnectionStatusMini } from '../../ui/ConnectionStatus';
import useDiceActor from '../../../hooks/actors/useDiceActor';

interface DiceAccountingPanelProps {
  gameBalance: bigint;  // Now required, not nullable
  onBalanceChange: () => void;
}

export const DiceAccountingPanel: React.FC<DiceAccountingPanelProps> = ({
  gameBalance,
  onBalanceChange,
}) => {
  const { isAuthenticated } = useAuth();
  const { balance: walletBalance, refreshBalance } = useBalance();
  const { actor } = useDiceActor();

  // Get house balance from global state
  const gameBalanceContext = useGameBalance('dice');
  const houseBalance = gameBalanceContext.balance.house;

  const [depositAmount, setDepositAmount] = useState('0.1');
  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Handle deposit
  const handleDeposit = async () => {
    if (!actor || !isAuthenticated) return;

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

      // Call deposit
      const result = await actor.deposit(amountE8s);

      if ('Ok' in result) {
        const newBalance = result.Ok;
        setSuccess(`Deposited ${depositAmount} ICP! New balance: ${Number(newBalance) / 100_000_000} ICP`);
        setDepositAmount('0.1');

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
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    if (!actor || !isAuthenticated) return;

    setIsWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      const amountE8s = BigInt(Math.floor(parseFloat(withdrawAmount) * 100_000_000));

      // Validate amount
      if (amountE8s < BigInt(10_000_000)) {
        setError('Minimum withdrawal is 0.1 ICP');
        setIsWithdrawing(false);
        return;
      }

      if (gameBalance && amountE8s > gameBalance) {
        setError('Insufficient game balance');
        setIsWithdrawing(false);
        return;
      }

      // Call withdraw
      const result = await actor.withdraw(amountE8s);

      if ('Ok' in result) {
        const newBalance = result.Ok;
        setSuccess(`Withdrew ${withdrawAmount} ICP! New balance: ${Number(newBalance) / 100_000_000} ICP`);
        setWithdrawAmount('0.1');

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
      <div className="card max-w-2xl mx-auto">
        <p className="text-center text-gray-400">Please log in to manage funds</p>
      </div>
    );
  }

  return (
    <div className="card max-w-2xl mx-auto">
      <h3 className="text-xl font-bold mb-4 text-center">💰 Manage Funds</h3>

      {/* Balance Display */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-purple-900/20 p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-gray-400 mb-1">Wallet Balance</p>
          <p className="text-2xl font-bold text-purple-400">{formatBalance(walletBalance)} ICP</p>
        </div>
        <div className="bg-green-900/20 p-4 rounded-lg border border-green-500/30">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-400">Dice Balance</p>
            <ConnectionStatusMini game="dice" />
          </div>
          <p className="text-2xl font-bold text-green-400">{formatBalance(gameBalance)} ICP</p>
        </div>
        <div className="bg-yellow-900/20 p-4 rounded-lg border border-yellow-500/30">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-400">House Pot</p>
            <ConnectionStatusMini game="dice" />
          </div>
          <p className="text-2xl font-bold text-yellow-400">{formatBalance(houseBalance)} ICP</p>
        </div>
      </div>

      {/* Deposit Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Deposit to Dice Game</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2"
            placeholder="Amount in ICP"
            min="0.1"
            step="0.01"
            disabled={isDepositing}
          />
          <button
            onClick={handleDeposit}
            disabled={isDepositing}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded font-bold disabled:opacity-50"
          >
            {isDepositing ? 'Depositing...' : 'Deposit'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Minimum: 0.1 ICP</p>
      </div>

      {/* Withdraw Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Withdraw from Dice Game</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2"
            placeholder="Amount in ICP"
            min="0.1"
            step="0.01"
            disabled={isWithdrawing}
          />
          <button
            onClick={handleWithdraw}
            disabled={isWithdrawing}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded font-bold disabled:opacity-50"
          >
            {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Minimum: 0.1 ICP (fee: 0.0001 ICP)</p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/20 border border-green-500 text-green-400 px-4 py-3 rounded">
          {success}
        </div>
      )}
    </div>
  );
};
