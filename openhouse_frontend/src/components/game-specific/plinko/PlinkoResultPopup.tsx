import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PlinkoResultPopupProps {
  multiplier: number;
  profit: number;
  isWin: boolean;
  show: boolean;
  onHide?: () => void;
  duration?: number; // How long to show before fade out (ms)
}

export const PlinkoResultPopup: React.FC<PlinkoResultPopupProps> = ({
  multiplier,
  profit,
  isWin,
  show,
  onHide,
  duration = 2500,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onHide?.();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [show, duration, onHide]);

  const profitStr = profit >= 0 ? `+$${profit.toFixed(2)}` : `$${profit.toFixed(2)}`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -10 }}
          transition={{
            duration: 0.3,
            ease: [0.175, 0.885, 0.32, 1.275], // Bouncy ease-out
          }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
        >
          <div
            className={`
              relative px-6 py-4 rounded-2xl backdrop-blur-md
              border-2 shadow-2xl
              ${isWin
                ? 'bg-green-900/80 border-green-400/60 shadow-green-500/30'
                : 'bg-red-900/80 border-red-400/60 shadow-red-500/30'
              }
            `}
          >
            {/* Glow effect */}
            <div
              className={`
                absolute inset-0 rounded-2xl blur-xl opacity-40
                ${isWin ? 'bg-green-500' : 'bg-red-500'}
              `}
            />

            {/* Content */}
            <div className="relative text-center">
              {/* Multiplier */}
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: [0.8, 1.1, 1] }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className={`
                  text-4xl font-black tracking-tight
                  ${isWin ? 'text-green-300' : 'text-red-300'}
                `}
                style={{
                  textShadow: isWin
                    ? '0 0 20px rgba(74, 222, 128, 0.5)'
                    : '0 0 20px rgba(248, 113, 113, 0.5)',
                }}
              >
                {multiplier.toFixed(2)}x
              </motion.div>

              {/* Profit/Loss */}
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className={`
                  text-xl font-bold font-mono mt-1
                  ${isWin ? 'text-green-200' : 'text-red-200'}
                `}
              >
                {profitStr}
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PlinkoResultPopup;
