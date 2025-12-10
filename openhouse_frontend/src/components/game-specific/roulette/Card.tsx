import React from 'react';

export interface CardData {
  suit: { [key: string]: null };
  rank: { [key: string]: null };
}

interface CardProps {
  card?: CardData;
  hidden?: boolean;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ card, hidden, className = '' }) => {
  if (hidden) {
    return (
      <div className={`w-16 h-24 bg-gray-800 border-2 border-white rounded-lg shadow-md flex items-center justify-center ${className}`}>
        <span className="text-2xl">?</span>
      </div>
    );
  }

  if (!card) return null;

  const suitKey = Object.keys(card.suit)[0];
  const rankKey = Object.keys(card.rank)[0];

  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'Hearts': return '♥';
      case 'Diamonds': return '♦';
      case 'Clubs': return '♣';
      case 'Spades': return '♠';
      default: return '?';
    }
  };

  const getRankDisplay = (rank: string) => {
    switch (rank) {
      case 'Ace': return 'A';
      case 'Two': return '2';
      case 'Three': return '3';
      case 'Four': return '4';
      case 'Five': return '5';
      case 'Six': return '6';
      case 'Seven': return '7';
      case 'Eight': return '8';
      case 'Nine': return '9';
      case 'Ten': return '10';
      case 'Jack': return 'J';
      case 'Queen': return 'Q';
      case 'King': return 'K';
      default: return rank;
    }
  };

  const symbol = getSuitSymbol(suitKey);
  const color = (suitKey === 'Hearts' || suitKey === 'Diamonds') ? 'text-red-600' : 'text-black';
  
  return (
    <div className={`w-16 h-24 bg-white rounded-lg shadow-md flex flex-col items-center justify-between p-1 border border-gray-300 ${className}`}>
       <div className={`text-sm font-bold self-start ${color}`}>{getRankDisplay(rankKey)}</div>
       <div className={`text-3xl ${color}`}>{symbol}</div>
       <div className={`text-sm font-bold self-end ${color} rotate-180`}>{getRankDisplay(rankKey)}</div>
    </div>
  );
};
