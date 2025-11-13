import React, { useState } from 'react';

export interface GameStat {
  label: string;
  value: string | number;
  highlight?: boolean;
  color?: 'default' | 'green' | 'red' | 'yellow' | 'blue';
}

interface GameStatsProps {
  stats: GameStat[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  title?: string;
}

export const GameStats: React.FC<GameStatsProps> = ({
  stats,
  collapsible = true,
  defaultOpen = false,
  title = 'Odds & Payout',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const getColorClass = (color?: GameStat['color'], highlight?: boolean) => {
    if (!highlight) return '';

    switch (color) {
      case 'green':
        return 'text-green-400';
      case 'red':
        return 'text-red-400';
      case 'yellow':
        return 'text-casino-highlight';
      case 'blue':
        return 'text-blue-400';
      default:
        return 'text-casino-highlight';
    }
  };

  const statsContent = (
    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
      {stats.map((stat, index) => (
        <div key={index} className="bg-casino-primary rounded p-2 text-center">
          <div className="text-gray-500 mb-1">{stat.label}</div>
          <div className={`font-bold ${getColorClass(stat.color, stat.highlight)}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );

  if (!collapsible) {
    return <div className="mb-6">{statsContent}</div>;
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-gray-400 hover:text-gray-300 transition flex items-center gap-1"
        type="button"
      >
        <span>{isOpen ? '▼' : '▶'}</span>
        <span>{title}</span>
      </button>

      {isOpen && statsContent}
    </div>
  );
};