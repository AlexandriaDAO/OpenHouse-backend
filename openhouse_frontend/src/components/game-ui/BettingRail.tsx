import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Principal } from '@dfinity/principal';
import { CHIP_DENOMINATIONS, ChipDenomination, decomposeIntoChips } from '../game-specific/dice/chipConfig';
import { ChipStack } from '../game-specific/dice/ChipStack';
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
      {/* Fixed bottom container */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        {/* Curved top edge */}
        <div className="betting-rail-curve" />

        {/* Main rail surface */}
        <div className="betting-rail">
          {/* Fixed-width column layout for perfect centering */}
          <div className="container mx-auto px-4 py-2 h-[88px] grid grid-cols-[280px_1fr_280px] items-center">

            {/* Left: Chip Selector Buttons */}
            <div className="flex gap-2 justify-start">
                {CHIP_DENOMINATIONS.map(chip => (
                  <button
                    key={chip.color}
                    onClick={() => addChip(chip)}
                    disabled={disabled || !canAddChip(chip.value)}
                    className="chip-button"
                  >
                    <img src={chip.topImg} alt={chip.label} className="w-14 h-14 object-contain drop-shadow-lg" />
                  </button>
                ))}
            </div>

            {/* Center: Large Chip Stack & Amount */}
            <div className="flex items-center justify-center gap-6 relative z-10 -mt-8"> {/* Negative top margin to pull up into the curve */}
                 {/* Big Stack */}
                 <div className="transition-all duration-200 transform scale-110 origin-bottom">
                  {displayChips.length === 0 ? (
                    <div className="opacity-10 font-bold text-white text-xs tracking-widest border-2 border-dashed border-white/20 rounded-full w-20 h-20 flex items-center justify-center mb-2">
                      BET
                    </div>
                  ) : (
                    <ChipStack 
                      amount={betAmount} 
                      maxChipsShown={20} 
                      showValue={false} 
                      size="xl" 
                    />
                  )}
                 </div>

                 {/* Bet Amount Display */}
                 <div className="flex flex-col pt-4"> {/* Add padding to align with stack base */}
                    <div className="text-white font-mono font-black text-3xl leading-none drop-shadow-md">
                      ${betAmount.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-3 text-gray-500 text-xs mt-1">
                      <span>max ${maxBet.toFixed(2)}</span>
                      {betAmount > 0 && (
                        <button 
                           onClick={clearBet}
                           disabled={disabled}
                           className="text-red-400 hover:text-white uppercase font-bold text-[10px] tracking-wider hover:bg-red-500/20 px-1.5 py-0.5 rounded transition"
                        >
                           Clear
                        </button>
                      )}
                    </div>
                 </div>
            </div>

            {/* Right: Account/Balances */}
            <div className="flex flex-col items-end gap-2 text-xs justify-end">
                {/* Chips Row */}
                <div className="flex items-center gap-3">
                    <span className="text-gray-400">Chips: <span className="text-white font-mono font-bold text-sm">${formatUSDT(gameBalance)}</span></span>
                    <button 
                        onClick={() => setShowDepositModal(true)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-[70px] ${
                            showDepositAnimation ? 'bg-yellow-500 text-black deposit-button-pulse' : 'bg-green-600 text-white hover:bg-green-500'
                        }`}
                    >
                        + Buy
                    </button>
                </div>
                {/* Wallet Row */}
                <div className="flex items-center gap-3">
                    <span className="text-gray-500">Wallet: <span className="text-gray-300 font-mono">${formatUSDT(walletBalance)}</span></span>
                    <button 
                        onClick={handleWithdrawAll}
                        disabled={isWithdrawing || gameBalance === 0n}
                        className="px-2 py-0.5 rounded text-[10px] border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 disabled:opacity-30 w-[70px]"
                    >
                        Cash Out
                    </button>
                </div>
                {/* Limit Warning (Absolute or integrated?) */}
                {houseLimitStatus !== 'healthy' && (
                   <div className={`text-[10px] font-bold ${houseLimitStatus === 'danger' ? 'text-red-500' : 'text-yellow-500'}`}>
                      Limit {houseLimitStatus === 'danger' ? 'Exceeded' : 'Near'}
                   </div>
                )}
            </div>

          </div>
        </div>

        {/* Mobile Fallback (Stacked) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-2 z-50">
            <div className="flex items-center justify-between">
                <div className="flex gap-1">
                    {[CHIP_DENOMINATIONS[0], CHIP_DENOMINATIONS[1], CHIP_DENOMINATIONS[2]].map(chip => (
                        <button key={chip.color} onClick={() => addChip(chip)} disabled={disabled || !canAddChip(chip.value)} className="chip-button">
                            <img src={chip.topImg} alt={chip.label} className="w-10 h-10 object-contain" />
                        </button>
                    ))}
                </div>
                <div className="text-right">
                    <div className="text-white font-mono font-bold">${betAmount.toFixed(2)}</div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowDepositModal(true)} className="text-green-400 text-xs font-bold">+ Buy</button>
                        <button onClick={clearBet} disabled={betAmount===0} className="text-red-400 text-xs">Clear</button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowDepositModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-white">Buy Chips</h3>
            
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Amount (USDT)</label>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-black/50 border border-gray-600 rounded-lg px-4 py-3 text-white text-lg focus:border-white focus:outline-none transition"
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
              <div className="mb-4 p-3 bg-red-900/20 border border-red-500/20 rounded text-red-400 text-xs">
                {accountingError}
              </div>
            )}
             {accountingSuccess && (
              <div className="mb-4 p-3 bg-green-900/20 border border-green-500/20 rounded text-green-400 text-xs">
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
                className="flex-1 px-4 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition relative overflow-hidden"
              >
                 {isDepositing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">...</span>
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
