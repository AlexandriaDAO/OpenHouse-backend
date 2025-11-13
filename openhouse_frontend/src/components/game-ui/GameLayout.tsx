import React, { ReactNode } from 'react';

interface GameLayoutProps {
  title: string;
  icon?: string;
  description?: string;
  children: ReactNode;
  minBet?: number;
  maxWin?: number;
  houseEdge?: number;
}

export const GameLayout: React.FC<GameLayoutProps> = ({
  title,
  icon,
  description,
  children,
  minBet = 1,
  maxWin = 1000,
  houseEdge = 3,
}) => {
  return (
    <div className="space-y-6">
      {/* Game Header */}
      <div className="text-center">
        {icon && <div className="text-6xl mb-4">{icon}</div>}
        <h1 className="text-4xl font-bold mb-2">{title}</h1>
        {description && <p className="text-gray-400">{description}</p>}
      </div>

      {/* Game Content */}
      {children}

      {/* Game Info Footer */}
      <div className="text-center text-xs text-gray-500 mt-6">
        Min: {minBet} ICP • Max Win: {maxWin}x • House Edge: {houseEdge}%
      </div>
    </div>
  );
};