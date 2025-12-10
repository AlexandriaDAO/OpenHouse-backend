import React, { useEffect, useState } from 'react';

interface RawPolymarketMarket {
  id: string;
  question: string;
  description: string;
  outcomes: string | string[];
  outcomePrices: string | string[];
  volume: string;
  volumeNum: number;
  liquidity: string;
  liquidityNum: number;
  image: string;
  icon: string;
  endDate: string;
  closed: boolean;
  active: boolean;
  slug: string;
}

interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  volumeNum: number;
  liquidity: string;
  liquidityNum: number;
  image: string;
  icon: string;
  endDate: string;
  closed: boolean;
  active: boolean;
  slug: string;
}

// Parse outcomes/prices which can be JSON strings or arrays
const parseArrayField = (field: string | string[]): string[] => {
  if (Array.isArray(field)) return field;
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const Predict: React.FC = () => {
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        // Use CORS proxy for internal development
        const apiUrl = 'https://gamma-api.polymarket.com/markets?limit=50&closed=false&active=true';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch markets');
        }
        const rawData: RawPolymarketMarket[] = await response.json();

        // Parse and normalize the data
        const data: PolymarketMarket[] = rawData.map(m => ({
          ...m,
          outcomes: parseArrayField(m.outcomes),
          outcomePrices: parseArrayField(m.outcomePrices),
        }));

        // Sort by volume (descending) and take top 10
        // Filter out markets with no valid outcomes
        const sortedMarkets = data
          .filter(m => m.volumeNum > 0 && m.outcomes.length > 0 && m.outcomePrices.length > 0)
          .sort((a, b) => b.volumeNum - a.volumeNum)
          .slice(0, 10);

        setMarkets(sortedMarkets);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchMarkets();
  }, []);

  const formatVolume = (volume: number): string => {
    if (volume >= 1_000_000) {
      return `$${(volume / 1_000_000).toFixed(2)}M`;
    }
    if (volume >= 1_000) {
      return `$${(volume / 1_000).toFixed(1)}K`;
    }
    return `$${volume.toFixed(2)}`;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'No end date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getOutcomeColor = (index: number, price: string): string => {
    const priceNum = parseFloat(price);
    if (index === 0) {
      // "Yes" outcome - green shades
      if (priceNum > 0.7) return 'text-green-400';
      if (priceNum > 0.5) return 'text-green-500';
      return 'text-gray-400';
    }
    // "No" outcome - red shades
    if (priceNum > 0.7) return 'text-red-400';
    if (priceNum > 0.5) return 'text-red-500';
    return 'text-gray-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dfinity-turquoise mx-auto mb-4"></div>
          <p className="text-gray-400">Loading markets from Polymarket...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
        <p className="text-red-400">Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded text-red-400"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Prediction Markets</h1>
        <p className="text-gray-400">
          Top 10 active markets by volume from Polymarket
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Internal development - Data from gamma-api.polymarket.com
        </p>
      </div>

      <div className="space-y-4">
        {markets.map((market, index) => (
          <div
            key={market.id}
            className="game-card hover:border-dfinity-turquoise/50 transition-all cursor-pointer"
            onClick={() => window.open(`https://polymarket.com/event/${market.slug}`, '_blank')}
          >
            <div className="flex gap-4">
              {/* Rank */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-dfinity-turquoise/20 flex items-center justify-center">
                <span className="text-dfinity-turquoise font-bold text-sm">
                  {index + 1}
                </span>
              </div>

              {/* Market icon */}
              {market.image && (
                <div className="flex-shrink-0">
                  <img
                    src={market.image}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Market info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium mb-2 line-clamp-2">
                  {market.question}
                </h3>

                {/* Outcomes and prices */}
                <div className="flex gap-4 mb-3">
                  {market.outcomes.map((outcome, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-gray-500 text-sm">{outcome}:</span>
                      <span
                        className={`font-mono font-bold ${getOutcomeColor(
                          i,
                          market.outcomePrices[i]
                        )}`}
                      >
                        {(parseFloat(market.outcomePrices[i]) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex gap-6 text-xs text-gray-500">
                  <div>
                    <span className="text-gray-600">Volume:</span>{' '}
                    <span className="text-dfinity-turquoise">
                      {formatVolume(market.volumeNum)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Liquidity:</span>{' '}
                    <span className="text-purple-400">
                      {formatVolume(market.liquidityNum)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Ends:</span>{' '}
                    <span className="text-gray-400">
                      {formatDate(market.endDate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {markets.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No active markets found
        </div>
      )}
    </div>
  );
};
