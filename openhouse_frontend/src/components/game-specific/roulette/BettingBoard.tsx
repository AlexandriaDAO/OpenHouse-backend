import React from 'react';
import { BetType } from '@/declarations/roulette_backend/roulette_backend.did';

export interface PlacedBet {
  betType: BetType;
  amount: number;
  numbers: number[];
  displayText: string;
}

interface BettingBoardProps {
  bets: PlacedBet[];
  chipValue: number;
  onPlaceBet: (bet: PlacedBet) => void;
  onRemoveBet: (bet: PlacedBet) => void;
  disabled?: boolean;
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

// Chip configuration matching the betting rail
const CHIP_CONFIG = [
  { value: 0.01, color: 'white', img: '/chips/optimized/white_top.png' },
  { value: 0.10, color: 'red', img: '/chips/optimized/red_top.png' },
  { value: 1.00, color: 'green', img: '/chips/optimized/green_top.png' },
  { value: 5.00, color: 'blue', img: '/chips/optimized/blue_top.png' },
  { value: 10.00, color: 'black', img: '/chips/optimized/black_top.png' },
];

// Get best chip representation for an amount
const getChipsForAmount = (amount: number): { img: string; count: number }[] => {
  const chips: { img: string; count: number }[] = [];
  let remaining = Math.round(amount * 100) / 100;

  // Go from highest to lowest
  for (let i = CHIP_CONFIG.length - 1; i >= 0 && remaining > 0; i--) {
    const chip = CHIP_CONFIG[i];
    const count = Math.floor(remaining / chip.value);
    if (count > 0) {
      chips.push({ img: chip.img, count: Math.min(count, 3) }); // Max 3 of each for visual
      remaining = Math.round((remaining - count * chip.value) * 100) / 100;
    }
  }

  return chips;
};

export const BettingBoard: React.FC<BettingBoardProps> = ({
  bets,
  chipValue,
  onPlaceBet,
  onRemoveBet,
  disabled = false
}) => {

  const getBetAmount = (numbers: number[], betType: BetType): number => {
    const existingBet = bets.find(b => {
      const bNumbers = b.numbers.sort().join(',');
      const compareNumbers = numbers.sort().join(',');
      return bNumbers === compareNumbers;
    });
    return existingBet?.amount || 0;
  };

  const handleBetClick = (numbers: number[], betType: BetType, displayText: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;

    const bet: PlacedBet = { betType, amount: chipValue, numbers, displayText };

    if (e.type === 'contextmenu') {
      onRemoveBet(bet);
    } else {
      onPlaceBet(bet);
    }
  };

  const renderChip = (numbers: number[], betType: BetType) => {
    const amount = getBetAmount(numbers, betType);
    if (amount === 0) return null;

    const chipStack = getChipsForAmount(amount);

    return (
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
        {/* Chip stack */}
        <div className="relative">
          {chipStack.flatMap(({ img, count }, stackIdx) =>
            Array.from({ length: count }).map((_, i) => (
              <img
                key={`${stackIdx}-${i}`}
                src={img}
                alt="chip"
                className="w-6 h-6 absolute drop-shadow-md"
                style={{
                  top: `-${(stackIdx * count + i) * 2}px`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              />
            ))
          )}
          {/* Amount label */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-black/80 px-1 rounded text-[9px] text-white font-bold whitespace-nowrap">
            ${amount.toFixed(amount < 1 ? 2 : 0)}
          </div>
        </div>
      </div>
    );
  };

  // Generate number blocks (1-36)
  const renderNumberGrid = () => {
    const rows = [];
    for (let row = 0; row < 3; row++) {
      const cells = [];
      for (let col = 0; col < 12; col++) {
        const num = 3 - row + (col * 3);
        const isRed = RED_NUMBERS.includes(num);

        cells.push(
          <div
            key={`num-${num}`}
            className={`relative w-10 h-10 sm:w-12 sm:h-12 border border-gray-700 flex items-center justify-center cursor-pointer hover:bg-white/10 transition ${
              isRed ? 'bg-red-700' : 'bg-black'
            } text-white font-bold text-sm`}
            onClick={(e) => handleBetClick([num], { Straight: num }, `${num}`, e)}
            onContextMenu={(e) => handleBetClick([num], { Straight: num }, `${num}`, e)}
          >
            {num}
            {renderChip([num], { Straight: num })}
          </div>
        );
      }

      // Add 2:1 column bet at the end of each row
      const columnNums = Array.from({ length: 12 }, (_, i) => 3 - row + (i * 3));
      rows.push(
        <div key={`row-${row}`} className="flex">
          {cells}
          <div
            className="relative w-16 h-10 sm:h-12 bg-gray-800 border border-gray-700 flex items-center justify-center cursor-pointer hover:bg-gray-700 transition text-white font-bold text-xs"
            onClick={(e) => handleBetClick(columnNums, { Column: (3 - row) }, `Column ${3 - row}`, e)}
            onContextMenu={(e) => handleBetClick(columnNums, { Column: (3 - row) }, `Column ${3 - row}`, e)}
          >
            2:1
            {renderChip(columnNums, { Column: (3 - row) })}
          </div>
        </div>
      );
    }
    return rows;
  };

  return (
    <div className="bg-gradient-to-b from-green-900 to-green-950 p-3 sm:p-4 rounded-lg border-4 border-yellow-700 shadow-2xl select-none">
      {/* Main betting area */}
      <div className="flex">
        {/* Zero - spans only the number rows (3 rows × cell height) */}
        <div
          className="relative w-10 sm:w-12 h-[calc(3*2.5rem)] sm:h-[calc(3*3rem)] bg-green-600 border border-gray-700 flex items-center justify-center cursor-pointer hover:bg-green-500 transition text-white font-bold text-sm rounded-l self-start"
          onClick={(e) => handleBetClick([0], { Straight: 0 }, '0', e)}
          onContextMenu={(e) => handleBetClick([0], { Straight: 0 }, '0', e)}
          style={{ writingMode: 'vertical-rl' }}
        >
          <span className="py-4">0</span>
          {renderChip([0], { Straight: 0 })}
        </div>

        {/* Right side: numbers + outside bets */}
        <div className="flex flex-col">
          {/* Numbers grid + 2:1 columns */}
          {renderNumberGrid()}

          {/* Dozen bets - use same 12-column grid as numbers */}
          <div className="flex mt-1">
            {[
              { label: '1st 12', nums: Array.from({ length: 12 }, (_, i) => i + 1), variant: 1 },
              { label: '2nd 12', nums: Array.from({ length: 12 }, (_, i) => i + 13), variant: 2 },
              { label: '3rd 12', nums: Array.from({ length: 12 }, (_, i) => i + 25), variant: 3 },
            ].map(({ label, nums, variant }) => (
              <div
                key={label}
                className="relative w-[calc(4*2.5rem)] sm:w-[calc(4*3rem)] h-8 bg-gray-800 border border-gray-700 flex items-center justify-center cursor-pointer hover:bg-gray-700 transition text-white font-bold text-xs"
                onClick={(e) => handleBetClick(nums, { Dozen: variant }, label, e)}
                onContextMenu={(e) => handleBetClick(nums, { Dozen: variant }, label, e)}
              >
                {label}
                {renderChip(nums, { Dozen: variant })}
              </div>
            ))}
          </div>

          {/* Even money bets - single row of 6, each spans 2 number columns */}
          <div className="flex mt-1">
            {[
              { label: '1-18', nums: Array.from({ length: 18 }, (_, i) => i + 1), betType: { Low: null } },
              { label: 'EVEN', nums: Array.from({ length: 36 }, (_, i) => i + 1).filter(n => n % 2 === 0), betType: { Even: null } },
              { label: 'RED', nums: RED_NUMBERS, betType: { Red: null }, className: 'bg-red-700' },
              { label: 'BLACK', nums: Array.from({ length: 36 }, (_, i) => i + 1).filter(n => !RED_NUMBERS.includes(n)), betType: { Black: null }, className: 'bg-black' },
              { label: 'ODD', nums: Array.from({ length: 36 }, (_, i) => i + 1).filter(n => n % 2 === 1), betType: { Odd: null } },
              { label: '19-36', nums: Array.from({ length: 18 }, (_, i) => i + 19), betType: { High: null } },
            ].map(({ label, nums, betType, className = 'bg-gray-800' }) => (
              <div
                key={label}
                className={`relative w-[calc(2*2.5rem)] sm:w-[calc(2*3rem)] h-8 ${className} border border-gray-700 flex items-center justify-center cursor-pointer hover:brightness-110 transition text-white font-bold text-[10px]`}
                onClick={(e) => handleBetClick(nums, betType, label, e)}
                onContextMenu={(e) => handleBetClick(nums, betType, label, e)}
              >
                {label}
                {renderChip(nums, betType)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-2 text-xs text-gray-400 text-center">
        Click to bet • Right-click to remove
      </div>
    </div>
  );
};
