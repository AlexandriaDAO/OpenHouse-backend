import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SingleResult {
  multiplier: number;
  win: boolean;
  profit?: number;
}

interface MultiResult {
  total_balls: number;
  total_wins: number;
  average_multiplier: number;
  net_profit?: number;
}

interface ResultOverlayProps {
  singleResult?: SingleResult | null;
  multiResult?: MultiResult | null;
  isVisible: boolean;
}

export const ResultOverlay: React.FC<ResultOverlayProps> = ({
  singleResult,
  multiResult,
  isVisible,
}) => {
  const hasResult = singleResult || multiResult;

  return (
    <AnimatePresence>
      {isVisible && hasResult && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
        >
          {singleResult && (
            <SingleResultDisplay result={singleResult} />
          )}
          {multiResult && !singleResult && (
            <MultiResultDisplay result={multiResult} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const SingleResultDisplay: React.FC<{ result: SingleResult }> = ({ result }) => {
  const isWin = result.win;
  const profit = result.profit ?? 0;

  return (
    <motion.div
      className={`
        px-6 py-3 rounded-lg backdrop-blur-sm
        ${isWin ? 'bg-green-900/80 border border-green-500' : 'bg-red-900/80 border border-red-500'}
      `}
      initial={{ scale: 0.8 }}
      animate={{ scale: 1 }}
      transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
    >
      <div className="flex items-center gap-4">
        <motion.span
          className={`text-2xl font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
        >
          {result.multiplier.toFixed(2)}x
        </motion.span>

        <div className="flex flex-col">
          <span className={`text-xs uppercase tracking-wide ${isWin ? 'text-green-300' : 'text-red-300'}`}>
            {isWin ? 'WIN' : 'LOSS'}
          </span>
          <motion.span
            className={`text-sm font-mono ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            {profit >= 0 ? '+' : ''}{profit.toFixed(2)} USDT
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
};

const MultiResultDisplay: React.FC<{ result: MultiResult }> = ({ result }) => {
  const netProfit = result.net_profit ?? 0;
  const isProfit = netProfit >= 0;

  return (
    <motion.div
      className={`
        px-6 py-3 rounded-lg backdrop-blur-sm
        ${isProfit ? 'bg-green-900/80 border border-green-500' : 'bg-red-900/80 border border-red-500'}
      `}
      initial={{ scale: 0.8 }}
      animate={{ scale: 1 }}
      transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
    >
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center">
          <motion.span
            className="text-2xl font-bold text-white"
            initial={{ scale: 1.5 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
          >
            {result.average_multiplier.toFixed(2)}x
          </motion.span>
          <span className="text-xs text-gray-400 uppercase">AVG</span>
        </div>

        <div className="h-8 w-px bg-gray-600" />

        <div className="flex flex-col">
          <span className="text-sm text-gray-300">
            {result.total_wins}/{result.total_balls} wins
          </span>
          <motion.span
            className={`text-lg font-bold font-mono ${isProfit ? 'text-green-400' : 'text-red-400'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            {isProfit ? '+' : ''}{netProfit.toFixed(2)} USDT
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
};
