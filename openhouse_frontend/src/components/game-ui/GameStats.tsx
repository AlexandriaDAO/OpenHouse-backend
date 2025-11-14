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
    if (!highlight) return 'text-pure-white/60';

    switch (color) {
      case 'green':
        return 'text-dfinity-green';
      case 'red':
        return 'text-dfinity-red';
      case 'yellow':
        return 'text-dfinity-turquoise'; // Use turquoise instead of yellow
      case 'blue':
        return 'text-dfinity-purple';
      default:
        return 'text-dfinity-turquoise';
    }
  };

  const statsContent = (
    <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-mono">
      {stats.map((stat, index) => (
        <div key={index} className="bg-pure-black border border-pure-white/10 p-2 text-center">
          <div className="text-pure-white/40 mb-1">{stat.label}</div>
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
        className="text-xs text-pure-white/60 hover:text-dfinity-turquoise transition flex items-center gap-1 font-mono"
        type="button"
      >
        <span>{isOpen ? '▼' : '▶'}</span>
        <span>{title}</span>
      </button>

      {isOpen && statsContent}
    </div>
  );
};