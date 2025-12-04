import React from 'react';
import { ApyInfo } from '../../types/liquidity';

interface ApyCardProps {
  label: string;
  info: ApyInfo;
}

export const ApyCard: React.FC<ApyCardProps> = ({ label, info }) => {
  const isPositive = info.actual_apy_percent >= 0;
  
  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-4 flex flex-col items-center hover:border-white/10 transition-colors">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-mono font-bold ${isPositive ? 'text-dfinity-green' : 'text-dfinity-red'}`}>
        {isPositive ? '+' : ''}{info.actual_apy_percent.toFixed(2)}%
      </div>
      <div className="text-[10px] text-gray-600 mt-1">
        Expected: {info.expected_apy_percent.toFixed(2)}%
      </div>
    </div>
  );
};
