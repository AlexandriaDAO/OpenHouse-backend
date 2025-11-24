import React from 'react';

export interface GameHistoryItem {
  clientId?: string;
  is_win: boolean;
  payout: bigint;
  bet_amount: bigint;
  timestamp: bigint;
  // Game-specific fields can be added via renderCustom
  [key: string]: any;
}

interface GameHistoryProps<T extends GameHistoryItem = GameHistoryItem> {
  items: T[];
  maxDisplay?: number;
  title?: string;
  renderCustom?: (item: T) => React.ReactNode;
}

export function GameHistory<T extends GameHistoryItem = GameHistoryItem>({
  items,
  maxDisplay = 5,
  title = 'Recent Games',
  renderCustom,
}: GameHistoryProps<T>) {
  if (items.length === 0) {
    return null;
  }

  const displayItems = items.slice(0, maxDisplay);

  return (
    <div className="card max-w-2xl mx-auto">
      <h3 className="text-sm font-bold mb-3 text-gray-400">{title}</h3>

      <div className="space-y-1">
        {displayItems.map((item, index) => (
          <div
            key={item.clientId || `item-${index}`}
            className="flex items-center justify-between text-sm py-2 border-b border-gray-800"
          >
            {renderCustom ? (
              renderCustom(item)
            ) : (
              <>
                <span className="text-gray-400">
                  Bet: {(Number(item.bet_amount) / 1_000_000).toFixed(2)} USDT
                </span>
                <span className={item.is_win ? 'text-green-400' : 'text-red-400'}>
                  {item.is_win ? (
                    <>✓ +{(Number(item.payout) / 1_000_000).toFixed(2)} USDT</>
                  ) : (
                    '✗'
                  )}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {items.length > maxDisplay && (
        <div className="text-center text-xs text-gray-500 mt-2">
          ... and {items.length - maxDisplay} more
        </div>
      )}
    </div>
  );
}