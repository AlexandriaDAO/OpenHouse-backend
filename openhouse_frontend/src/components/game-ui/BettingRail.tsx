import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Principal } from '@dfinity/principal';
import { CHIP_DENOMINATIONS, ChipDenomination, decomposeIntoChips } from '../game-specific/dice/chipConfig';
import { InteractiveChipStack } from './InteractiveChipStack';
import { DECIMALS_PER_CKUSDT, formatUSDT, TRANSFER_FEE } from '../../types/balance';
import { ApproveArgs } from '../../types/ledger';
import './BettingRail.css';

type HouseLimitStatus = 'healthy' | 'warning' | 'danger';

interface BettingRailProps {
  betAmount: number;
  onBetChange: (amount: number) => void;
  maxBet: number;
  gameBalance: bigint;
  walletBalance: bigint | null;
  houseBalance: bigint;
  ledgerActor: any;
  gameActor: any;
  onBalanceRefresh: () => void;
  disabled?: boolean;
  multiplier: number;
  canisterId: string;
}

export function BettingRail({
  betAmount,
  onBetChange,
  maxBet,
  gameBalance,
  walletBalance,
  houseBalance,
  ledgerActor,
  gameActor,
  onBalanceRefresh,
  disabled = false,
  multiplier,
  canisterId,
}: BettingRailProps) {
  // === Internal State ===
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1');
  const [depositStep, setDepositStep] = useState<'idle' | 'approving' | 'depositing'>('idle');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [accountingError, setAccountingError] = useState<string | null>(null);
  const [accountingSuccess, setAccountingSuccess] = useState<string | null>(null);
  const [showDepositAnimation, setShowDepositAnimation] = useState(false);

  // Convert game balance to USDT for comparison
  const gameBalanceUSDT = Number(gameBalance) / DECIMALS_PER_CKUSDT;

  // === Chip Logic ===
  const canAddChip = useCallback((chipValue: number): boolean => {
    if (disabled) return false;
    const newAmount = betAmount + chipValue;
    const roundedNew = Math.round(newAmount * 100) / 100;
    return roundedNew <= maxBet && roundedNew <= gameBalanceUSDT;
  }, [betAmount, maxBet, gameBalanceUSDT, disabled]);

  const addChip = useCallback((chip: ChipDenomination) => {
    if (!canAddChip(chip.value)) return;
    const newAmount = Math.round((betAmount + chip.value) * 100) / 100;
    onBetChange(newAmount);
  }, [betAmount, onBetChange, canAddChip]);

  const removeChip = useCallback((chipValue: number) => {
    if (disabled) return;
    const newAmount = Math.max(0, Math.round((betAmount - chipValue) * 100) / 100);
    onBetChange(newAmount);
  }, [betAmount, onBetChange, disabled]);

  const clearBet = useCallback(() => {
    if (disabled) return;
    onBetChange(0);
  }, [onBetChange, disabled]);

  // === Deposit Logic ===
  const handleDeposit = async () => {
    if (!gameActor || !ledgerActor) return;

    setIsDepositing(true);
    setAccountingError(null);
    setAccountingSuccess(null);

    try {
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * DECIMALS_PER_CKUSDT));

      if (amount < BigInt(1_000_000)) {
        setAccountingError('Minimum deposit is 1 USDT');
        setIsDepositing(false);
        return;
      }

      if (walletBalance && amount > walletBalance) {
        setAccountingError('Insufficient wallet balance');
        setIsDepositing(false);
        return;
      }

      setDepositStep('approving');
      const approveArgs: ApproveArgs = {
        spender: {
          owner: Principal.fromText(canisterId),
          subaccount: [],
        },
        amount: amount + BigInt(TRANSFER_FEE),
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
        expected_allowance: [],
        expires_at: [],
      };

      const approveResult = await ledgerActor.icrc2_approve(approveArgs);

      if ('Err' in approveResult) {
        setAccountingError(`Approval failed: ${JSON.stringify(approveResult.Err)}`);
        setIsDepositing(false);
        setDepositStep('idle');
        return;
      }

      setDepositStep('depositing');
      const result = await gameActor.deposit(amount);

      if ('Ok' in result) {
        setAccountingSuccess(`Bought ${depositAmount} USDT in chips!`);
        setDepositAmount('1');
        setShowDepositModal(false);
        onBalanceRefresh();
      } else {
        setAccountingError(result.Err);
      }
    } catch (err) {
      setAccountingError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
      setDepositStep('idle');
    }
  };

  // === Withdraw Logic ===
  const handleWithdrawAll = async () => {
    if (!gameActor) return;

    setIsWithdrawing(true);
    setAccountingError(null);
    setAccountingSuccess(null);

    try {
      const result = await gameActor.withdraw_all();

      if ('Ok' in result) {
        const newBalance = result.Ok;
        const withdrawnAmount = (Number(gameBalance) - Number(newBalance)) / DECIMALS_PER_CKUSDT;
        setAccountingSuccess(`Cashed out ${withdrawnAmount.toFixed(2)} USDT!`);
        onBalanceRefresh();
      } else {
        setAccountingError(result.Err);
      }
    } catch (err) {
      setAccountingError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // === House Limit Calculation ===
  const houseLimitStatus: HouseLimitStatus = useMemo(() => {
    const houseBalanceUSDT = Number(houseBalance) / DECIMALS_PER_CKUSDT;
    const maxAllowedPayout = houseBalanceUSDT * 0.1;
    const currentPotentialPayout = betAmount * multiplier;
    const utilizationPct = maxAllowedPayout > 0 ? (currentPotentialPayout / maxAllowedPayout) * 100 : 0;
    if (utilizationPct > 90) return 'danger';
    if (utilizationPct > 70) return 'warning';
    return 'healthy';
  }, [houseBalance, betAmount, multiplier]);

  const displayChips = useMemo(() => decomposeIntoChips(betAmount), [betAmount]);

  useEffect(() => {
    if (gameBalance === 0n && !disabled) {
      setShowDepositAnimation(true);
    } else {
      setShowDepositAnimation(false);
    }
  }, [gameBalance, disabled]);

  return (
    <>
      {/* Fixed bottom container - DESKTOP */}
      <div className="hidden md:block fixed bottom-0 left-0 right-0 z-40">
        {/* Curved top edge */}
        <div className="betting-rail-curve" />

        {/* Main rail surface */}
        <div className="betting-rail">
          <div className="container mx-auto px-6 py-3">
            {/* Three column layout */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-8">

              {/* LEFT: Chip Selector */}
              <div className="flex items-end gap-3">
                {CHIP_DENOMINATIONS.map(chip => (
                  <button
                    key={chip.color}
                    onClick={() => addChip(chip)}
                    disabled={disabled || !canAddChip(chip.value)}
                    className="chip-button"
                    title={`Add $${chip.value.toFixed(2)}`}
                  >
                    <img
                      src={chip.topImg}
                      alt={chip.label}
                      className="w-14 h-14 object-contain"
                    />
                  </button>
                ))}
              </div>

              {/* CENTER: Chip Stack + Bet Amount */}
              <div className="flex flex-col items-center -mt-12">
                {/* Interactive Chip Stack */}
                <div className="mb-2">
                  <InteractiveChipStack
                    amount={betAmount}
                    onRemoveChip={removeChip}
                    disabled={disabled}
                    maxChipsPerPile={10}
                  />
                </div>

                {/* Bet Amount Display */}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-white font-mono font-black text-3xl leading-none drop-shadow-lg">
                      ${betAmount.toFixed(2)}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      max ${maxBet.toFixed(2)}
                    </div>
                  </div>

                  {betAmount > 0 && (
                    <button
                      onClick={clearBet}
                      disabled={disabled}
                      className="rail-button rail-button-secondary text-red-400 border-red-400/30 hover:border-red-400 hover:text-red-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT: Balances & Actions */}
              <div className="flex flex-col items-end gap-2">
                {/* Chips Balance */}
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm">
                    Chips: <span className="text-white font-mono font-bold">${formatUSDT(gameBalance)}</span>
                  </span>
                  <button
                    onClick={() => setShowDepositModal(true)}
                    className={`rail-button ${showDepositAnimation ? 'rail-button-primary deposit-button-pulse' : 'rail-button-primary'}`}
                  >
                    + Buy
                  </button>
                </div>

                {/* Wallet Balance */}
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm">
                    Wallet: <span className="text-gray-300 font-mono">${formatUSDT(walletBalance)}</span>
                  </span>
                  <button
                    onClick={handleWithdrawAll}
                    disabled={isWithdrawing || gameBalance === 0n}
                    className="rail-button rail-button-secondary"
                  >
                    Cash Out
                  </button>
                </div>

                {/* House Limit Warning */}
                {houseLimitStatus !== 'healthy' && (
                  <div className={`text-xs font-bold ${houseLimitStatus === 'danger' ? 'text-red-500' : 'text-yellow-500'}`}>
                    {houseLimitStatus === 'danger' ? 'House limit exceeded' : 'Near house limit'}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* MOBILE: Simplified bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-t border-gray-800">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Chip buttons */}
            <div className="flex gap-2">
              {[CHIP_DENOMINATIONS[0], CHIP_DENOMINATIONS[1], CHIP_DENOMINATIONS[2]].map(chip => (
                <button
                  key={chip.color}
                  onClick={() => addChip(chip)}
                  disabled={disabled || !canAddChip(chip.value)}
                  className="chip-button"
                >
                  <img src={chip.topImg} alt={chip.label} className="w-11 h-11 object-contain" />
                </button>
              ))}
            </div>

            {/* Bet amount */}
            <div className="text-center flex-1">
              <div className="text-white font-mono font-bold text-xl">${betAmount.toFixed(2)}</div>
              <div className="text-gray-500 text-xs">max ${maxBet.toFixed(2)}</div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setShowDepositModal(true)}
                className="rail-button rail-button-primary text-xs"
              >
                + Buy
              </button>
              {betAmount > 0 && (
                <button
                  onClick={clearBet}
                  className="text-red-400 text-xs font-bold"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowDepositModal(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-4 text-white">Buy Chips</h3>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Amount (USDT)</label>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-black/50 border border-gray-600 rounded-lg px-4 py-3 text-white text-lg focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500/50 transition"
                  placeholder="1.0"
                  min="1"
                  step="1"
                  disabled={isDepositing}
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-mono">USDT</span>
              </div>
              <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                <span>Wallet: {formatUSDT(walletBalance)}</span>
                <span>Min: 1 USDT</span>
              </div>
            </div>

            {accountingError && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {accountingError}
              </div>
            )}
            {accountingSuccess && (
              <div className="mb-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg text-green-400 text-sm">
                {accountingSuccess}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDepositModal(false)}
                disabled={isDepositing}
                className="flex-1 px-4 py-3 font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={isDepositing}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isDepositing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {depositStep === 'approving' ? 'Approving...' : 'Depositing...'}
                  </span>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
