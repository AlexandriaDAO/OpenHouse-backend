import React from 'react';
import { Hand } from './Hand';
import { Card, CardData } from './Card';

interface RouletteTableProps {
  dealerHand: CardData[];
  dealerHidden: boolean;
  playerHands: CardData[][];
  currentHandIndex: number;
  results: (string | null)[];
  gameActive: boolean;
}

export const RouletteTable: React.FC<RouletteTableProps> = ({
  dealerHand,
  dealerHidden,
  playerHands,
  currentHandIndex,
  results,
  gameActive
}) => {
  return (
    <div className="flex flex-col items-center space-y-8 w-full max-w-4xl mx-auto p-6">
      {/* Dealer Area */}
      <div className="flex flex-col items-center">
        <div className="text-gray-400 mb-2 font-pixel">DEALER</div>
        <div className="flex space-x-[-1.5rem]">
          {dealerHand.map((card, idx) => (
            <Card key={`dealer-${idx}`} card={card} />
          ))}
          {dealerHidden && <Card hidden />}
        </div>
      </div>

      {/* Table Center / Decor */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />

      {/* Player Area */}
      <div className="flex flex-wrap justify-center gap-4">
        {playerHands.map((hand, idx) => (
          <Hand 
            key={`player-${idx}`} 
            cards={hand} 
            isActive={gameActive && idx === currentHandIndex} 
            label={playerHands.length > 1 ? `Hand ${idx + 1}` : 'PLAYER'}
            result={results[idx]}
          />
        ))}
        {playerHands.length === 0 && (
             <div className="text-gray-500 italic">Place a bet to start</div>
        )}
      </div>
    </div>
  );
};
