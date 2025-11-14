import React from 'react';
import { GameCard } from '../components/GameCard';
import { GameInfo } from '../types';

const games: GameInfo[] = [
  {
    id: 'crash',
    name: 'Crash',
    description: 'Watch the multiplier rise and cash out before it crashes',
    minBet: 1,
    maxWin: 1000,
    houseEdge: 3,
    path: '/crash',
    icon: '🚀',
  },
  {
    id: 'plinko',
    name: 'Plinko',
    description: 'Drop the ball and watch it bounce to a multiplier',
    minBet: 1,
    maxWin: 1000,
    houseEdge: 3,
    path: '/plinko',
    icon: '🎯',
  },
  {
    id: 'mines',
    name: 'Mines',
    description: 'Navigate the minefield to increase your multiplier',
    minBet: 1,
    maxWin: 5000,
    houseEdge: 3,
    path: '/mines',
    icon: '💣',
  },
  {
    id: 'dice',
    name: 'Dice',
    description: 'Roll over or under your target number',
    minBet: 1,
    maxWin: 100,
    houseEdge: 3,
    path: '/dice',
    icon: '🎲',
  },
];

export const Home: React.FC = () => {
  return (
    <div>
      {/* Games Grid */}
      <h2 className="text-3xl font-pixel text-center mb-6">Choose Your Game</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
};
