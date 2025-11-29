import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

export function DiceLayout() {
  const location = useLocation();
  const isLiquidityRoute = location.pathname.includes('/liquidity');

  return (
    <div className="container mx-auto px-4 pt-4 pb-2"> {/* Reduced padding */}
      {/* Tab Navigation - smaller */}
      <div className="flex gap-3 mb-3 border-b border-gray-700">
        <Link
          to="/dice"
          className={`px-3 py-1.5 text-sm -mb-px transition-colors ${
            !isLiquidityRoute
              ? 'border-b-2 border-dfinity-turquoise text-white'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          🎲 Play Game
        </Link>
        <Link
          to="/dice/liquidity"
          className={`px-3 py-1.5 text-sm -mb-px transition-colors ${
            isLiquidityRoute
              ? 'border-b-2 border-dfinity-turquoise text-white'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          💰 Become an Owner
        </Link>
      </div>

      {/* Render child route (DiceGame or DiceLiquidity) */}
      <Outlet />
    </div>
  );
}