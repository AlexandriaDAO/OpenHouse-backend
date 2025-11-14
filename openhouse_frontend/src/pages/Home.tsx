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
    <div className="space-y-8">
      {/* Hero Section with pixel font */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-pixel">OpenHouse Casino</h1>
        <p className="text-xl text-pure-white/60 max-w-2xl mx-auto font-mono">
          Play provably fair games with transparent odds on the Internet Computer.
          All games use verifiable randomness (VRF) for guaranteed fairness.
        </p>
      </div>

      {/* Features with DFINITY colors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <div className="card card-accent text-center">
          <div className="text-3xl mb-2">🔓</div>
          <h3 className="font-bold mb-1 font-mono">Open Source</h3>
          <p className="text-sm text-pure-white/60 font-mono">All code is public and auditable</p>
        </div>
        <div className="card card-accent text-center">
          <div className="text-3xl mb-2">✅</div>
          <h3 className="font-bold mb-1 font-mono">Provably Fair</h3>
          <p className="text-sm text-pure-white/60 font-mono">Verify every game result</p>
        </div>
        <div className="card card-accent text-center">
          <div className="text-3xl mb-2">📊</div>
          <h3 className="font-bold mb-1 font-mono">Transparent Odds</h3>
          <p className="text-sm text-pure-white/60 font-mono">Exact house edge displayed</p>
        </div>
      </div>

      {/* Games Grid */}
      <div>
        <h2 className="text-3xl font-pixel text-center mb-6">Choose Your Game</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </div>

      {/* Info Box with terminal styling */}
      <div className="card card-accent max-w-2xl mx-auto">
        <h3 className="font-bold mb-2 font-mono">🎮 How to Play</h3>
        <ol className="text-sm text-pure-white/60 space-y-1 list-decimal list-inside font-mono">
          <li>Browse games anonymously (optional authentication)</li>
          <li>Login with Internet Identity to place bets</li>
          <li>Select your game and place your bet in ICP</li>
          <li>Watch the game play out with verifiable randomness</li>
          <li>Win and collect your payout instantly!</li>
        </ol>
      </div>
    </div>
  );
};
