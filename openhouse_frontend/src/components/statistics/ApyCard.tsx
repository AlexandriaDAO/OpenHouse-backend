import React from 'react';
import { ApyInfo } from '../../types/liquidity';
import { InfoTooltip } from '../InfoTooltip';

interface ApyCardProps {
  label: string;
  accurateApy: number;
  backendApy?: ApyInfo;
  showComparison?: boolean;
}

export const ApyCard: React.FC<ApyCardProps> = ({ 
  label, 
  accurateApy, 
  backendApy,
  showComparison = false 
}) => {
  const isPositive = accurateApy >= 0;
  
  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-4 flex flex-col items-center hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
        <InfoTooltip
          variant="badge"
          content="APY calculated from share price returns.

This shows your annualized return as a liquidity provider, based on how the share price has changed over the period.

Formula: (Price Change %) × (365 / Days) × 100

This is the TRUE return you would have earned as an LP."
        />
      </div>
      <div className={`text-2xl font-mono font-bold ${isPositive ? 'text-dfinity-green' : 'text-dfinity-red'}`}>
        {isPositive ? '+' : ''}{accurateApy.toFixed(2)}%
      </div>
      
      {/* Optional: Show expected APY based on 1% house edge */}
      {backendApy && (
        <div className="text-[10px] text-gray-600 mt-1">
          Expected (1% edge): {backendApy.expected_apy_percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
};
