import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GameInfo } from '../types';

interface GameCardProps {
  game: GameInfo;
}

export const GameCard: React.FC<GameCardProps> = ({ game }) => {
  const navigate = useNavigate();

  return (
    <div
      className="game-card"
      onClick={() => navigate(game.path)}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter') navigate(game.path);
      }}
    >
      <div className="text-4xl mb-4">{game.icon}</div>
      <div className="flex items-center justify-center gap-2 mb-2">
        <h2 className="text-2xl font-bold">{game.name}</h2>
        {game.badge && (
          <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs font-semibold">
            {game.badge}
          </span>
        )}
      </div>
      <p className="text-gray-400 mb-4">{game.description}</p>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Min Bet:</span>
          <span className="font-semibold">{game.minBet} ICP</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Max Win:</span>
          <span className="font-semibold text-casino-highlight">{game.maxWin}x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">House Edge:</span>
          <span className="font-semibold">{game.houseEdge}%</span>
        </div>
      </div>
    </div>
  );
};
