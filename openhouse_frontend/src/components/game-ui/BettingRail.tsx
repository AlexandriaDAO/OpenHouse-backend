import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Principal } from '@dfinity/principal';
import { CHIP_DENOMINATIONS, ChipDenomination, decomposeIntoChips } from '../game-specific/dice/chipConfig';
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
  const [chipHistory, setChipHistory] = useState<number[]>([]);
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
    setChipHistory(prev => [...prev, chip.value]);
    onBetChange(newAmount);
  }, [betAmount, onBetChange, canAddChip]);

  const undoLastChip = useCallback(() => {
    if (chipHistory.length === 0 || disabled) return;

    const lastChipValue = chipHistory[chipHistory.length - 1];
    const newAmount = Math.round((betAmount - lastChipValue) * 100) / 100;

    setChipHistory(prev => prev.slice(0, -1));
    onBetChange(Math.max(0, newAmount));
  }, [chipHistory, betAmount, onBetChange, disabled]);

  const clearBet = useCallback(() => {
    if (disabled) return;
    setChipHistory([]);
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

  // === Decompose bet for display ===
  const displayChips = useMemo(() => decomposeIntoChips(betAmount), [betAmount]);

  // Pulse animation trigger
  useEffect(() => {
     if (gameBalance === 0n && !disabled) {
       setShowDepositAnimation(true);
     } else {
       setShowDepositAnimation(false);
     }
  }, [gameBalance, disabled]);

  // === New Chip Arc Visualization ===
  // We want to render chips in an arc. We need to map the `displayChips` array to positions.
  // We'll limit to e.g. 15 chips for visual clarity.
  const arcChips = useMemo(() => {
    // Flatten displayChips to individual chips
    let chips: ChipDenomination[] = [];
    displayChips.forEach(({ chip, count }) => {
      for(let i=0; i<count; i++) chips.push(chip);
    });
    
    // Sort: Large value at bottom? Or just keep order?
    // decomposeIntoChips returns High->Low. 
    // If we stack them, we probably want larger ones at the back or bottom?
    // Let's reverse so smaller chips are on top if we overlap.
    // Actually, standard poker stacks have chips of same color together.
    // Let's just take up to 20 chips.
    const MAX_CHIPS = 20;
    const visibleChips = chips.slice(0, MAX_CHIPS);
    
    const total = visibleChips.length;
    const baseAngle = -40; // Start angle
    const endAngle = 40;   // End angle
    const angleStep = total > 1 ? (endAngle - baseAngle) / (total - 1) : 0;

    return visibleChips.map((chip, index) => {
      // Calculate position
      // We fan them out in an arc.
      // Center is index ~ total/2
      const angle = total === 1 ? 0 : baseAngle + (index * angleStep);
      // Offset Y slightly based on distance from center to create an arch effect?
      // Or just rotate around a bottom point.
      // transform-origin: bottom center is set in CSS.
      
      return {
        chip,
        style: {
          transform: `translateX(-50%) rotate(${angle}deg) translateY(${Math.abs(angle) * 0.5}px)`,
          zIndex: index,
        }
      };
    });
  }, [displayChips]);


  return (
    <>
      {/* Fixed bottom container */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        {/* Curved top edge with Wood Border */}
        <div className="betting-rail-curve" />

        {/* Main rail surface */}
        <div className="betting-rail">
          <div className="container mx-auto px-4 py-3">

            {/* Desktop Layout: 3 columns */}
            <div className="hidden md:grid md:grid-cols-[auto_1fr_auto] gap-6 items-center">

              {/* Column 1: Chip Selector */}
              <div className="flex gap-2">
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

              {/* Column 2: Chip Pile (Semicircle) & Bet Amount */}
              <div className="flex flex-col items-center justify-center relative -mt-4">
                 
                {/* The Chip Arc */}
                <div 
                  className="chip-arc-container cursor-pointer" 
                  onClick={undoLastChip}
                  title="Click to undo last chip"
                >
                  {displayChips.length === 0 ? (
                    <div className="text-white/20 text-sm font-bold border-2 border-dashed border-white/10 rounded-full w-16 h-16 flex items-center justify-center">
                      BET
                    </div>
                  ) : (
                    arcChips.map((item, i) => (
                      <img 
                        key={i}
                        src={item.chip.topImg} // Top view for the arc looks better "stacked" flat or side view? 
                                               // User said "semicircle where they're touching". 
                                               // Usually this means top-down view of flat chips overlapping.
                        alt={item.chip.label}
                        className="chip-in-arc"
                        style={item.style}
                      />
                    ))
                  )}
                </div>

                {/* Bet Amount Label */}
                <div className="mt-1 flex flex-col items-center">
                  <span className="font-mono text-2xl font-black text-white drop-shadow-md">
                    ${betAmount.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>max ${maxBet.toFixed(2)}</span>
                    {betAmount > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); clearBet(); }}
                        disabled={disabled}
                        className="text-red-400 hover:text-red-300 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Column 3: Empty right side for symmetry or additional controls? 
                  User wanted buttons in footer. 
                  We can put a "Repeat Bet" or similar here later.
                  For now, let's keep it balanced.
              */}
              <div className="w-[200px] flex justify-end">
                 {/* Placeholder or move Undo button here explicitly? */}
                 <button 
                   onClick={undoLastChip}
                   disabled={chipHistory.length === 0 || disabled}
                   className="text-gray-400 hover:text-white flex items-center gap-2 transition disabled:opacity-0"
                 >
                   <span>Undo</span>
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                     <path fillRule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
                     <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
                   </svg>
                 </button>
              </div>

            </div>

            {/* Mobile Layout */}
            <div className="md:hidden flex flex-col items-center space-y-4">
               {/* Chips & Bet */}
               <div className="flex items-end justify-between w-full px-2">
                  <div className="flex gap-1">
                    {[CHIP_DENOMINATIONS[0], CHIP_DENOMINATIONS[1], CHIP_DENOMINATIONS[2]].map(chip => (
                        <button key={chip.color} onClick={() => addChip(chip)} disabled={disabled || !canAddChip(chip.value)} className="chip-button">
                            <img src={chip.topImg} alt={chip.label} className="w-10 h-10 object-contain" />
                        </button>
                    ))}
                  </div>
                  <div className="text-right">
                     <div className="font-mono text-xl font-bold text-white">${betAmount.toFixed(2)}</div>
                     <button onClick={clearBet} disabled={betAmount===0} className="text-xs text-red-400">Clear</button>
                  </div>
               </div>
            </div>

            {/* Bottom Info Row - WITH BUTTONS NOW */}
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-gray-800/50 text-gray-400 relative">
              
              <div className="flex items-center gap-4 flex-1">
                  <div className="flex items-center gap-2">
                    <span>Chips: <span className="text-white font-mono font-bold">${formatUSDT(gameBalance)}</span></span>
                    <button 
                        onClick={() => setShowDepositModal(true)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            showDepositAnimation ? 'bg-yellow-500 text-black deposit-button-pulse' : 'bg-green-600 text-white hover:bg-green-500'
                        }`}
                    >
                        + Buy
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span>Wallet: <span className="text-white font-mono">${formatUSDT(walletBalance)}</span></span>
                    <button 
                        onClick={handleWithdrawAll}
                        disabled={isWithdrawing || gameBalance === 0n}
                        className="px-2 py-0.5 rounded text-[10px] border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 disabled:opacity-30"
                    >
                        Cash Out
                    </button>
                  </div>
              </div>

              {houseLimitStatus !== 'healthy' && (
                <span className={houseLimitStatus === 'danger' ? 'text-red-400 font-bold' : 'text-yellow-400 font-bold'}>
                  House limit {houseLimitStatus === 'danger' ? 'exceeded' : 'near'}
                </span>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Deposit Modal (unchanged) */}
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
