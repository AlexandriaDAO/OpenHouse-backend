import React from 'react';
import { Card, CardData } from './Card';

interface HandProps {
  cards: CardData[];
  isActive?: boolean;
  label?: string;
  result?: string | null; // 'Win', 'Loss', 'Push'
}

export const Hand: React.FC<HandProps> = ({ cards, isActive, label, result }) => {
  
  const calculateScore = (cards: CardData[]) => {
    let score = 0;
    let aces = 0;
    
    cards.forEach(card => {
      const rank = Object.keys(card.rank)[0];
      if (rank === 'Ace') {
        aces += 1;
        score += 11;
      } else if (['Ten', 'Jack', 'Queen', 'King'].includes(rank)) {
        score += 10;
      } else {
        const val = {
            'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5,
            'Six': 6, 'Seven': 7, 'Eight': 8, 'Nine': 9
        }[rank] || 0;
        score += val;
      }
    });
    
    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }
    return score;
  };
  
  const score = calculateScore(cards);

  const getResultColor = (res: string | null) => {
    if (!res) return 'bg-gray-700';
    if (res.includes('Win')) return 'bg-green-600';
    if (res.includes('Push')) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  return (
    <div className={`flex flex-col items-center p-4 rounded-xl transition-all ${isActive ? 'bg-gray-800 ring-2 ring-yellow-400' : 'bg-gray-900/50'}`}>
      {label && <div className="text-gray-400 text-sm mb-2">{label}</div>}
      
      <div className="flex space-x-[-1.5rem] mb-4">
        {cards.map((card, idx) => (
          <Card key={idx} card={card} className="transform hover:-translate-y-2 transition-transform" />
        ))}
        {cards.length === 0 && <div className="w-16 h-24 border-2 border-dashed border-gray-600 rounded-lg" />}
      </div>
      
      <div className="flex items-center space-x-2">
        <div className="px-3 py-1 bg-gray-700 rounded-full font-mono font-bold">
          {score}
        </div>
        {result && (
          <div className={`px-3 py-1 rounded-full font-bold text-sm ${getResultColor(result)}`}>
            {result}
          </div>
        )}
      </div>
    </div>
  );
};
