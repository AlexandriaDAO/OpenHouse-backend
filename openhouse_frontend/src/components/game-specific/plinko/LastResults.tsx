import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBucketColors } from './plinkoAnimations';

export interface ResultRecord {
  id: string;
  multiplier: number;
  binIndex: number;
  totalBins: number;
}

interface LastResultsProps {
  /**
   * Array of recent results to display.
   */
  results: ResultRecord[];
  /**
   * Number of results to show (default: 5)
   */
  maxResults?: number;
}

/**
 * Vertical stack of recent game results showing multipliers.
 * Inspired by Stake.com's Plinko results bar.
 * Results slide in from top as new ones arrive.
 * Styled to be subtle/faded compared to main multiplier slots.
 */
export const LastResults: React.FC<LastResultsProps> = ({
  results,
  maxResults = 5,
}) => {
  // Take last N results and reverse so newest is at top
  const displayResults = results.slice(-maxResults).reverse();

  return (
    <div
      className="flex flex-col overflow-hidden rounded-sm opacity-80"
      style={{
        width: '28px',
        gap: '2px',
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {displayResults.map((result) => {
          const colors = getBucketColors(result.binIndex, result.totalBins);

          return (
            <motion.div
              key={result.id}
              initial={{
                opacity: 0,
                y: -16,
                scale: 0.8,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.8,
                transition: { duration: 0.15 }
              }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30,
                mass: 0.8,
              }}
              className="flex items-center justify-center font-bold text-white rounded-sm"
              style={{
                backgroundColor: colors.background,
                width: '28px',
                height: '20px',
                fontSize: '8px',
                textShadow: '0 1px 1px rgba(0,0,0,0.3)',
              }}
            >
              {result.multiplier.toFixed(1)}×
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
