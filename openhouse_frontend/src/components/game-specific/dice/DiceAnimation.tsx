import React, { useEffect, useState, useRef, useCallback } from 'react';
import './DiceAnimation.css';
import type { SingleDiceResult } from '../../../declarations/dice_backend/dice_backend.did';

// Animation timing constants
const ANIMATION_CONFIG = {
  FAST_INTERVAL: 50,            // Fast rolling interval
  SLOWDOWN_DELAYS: [100, 150, 250, 400, 600], // Progressive slowdown steps
  STAGGER_DELAY: 500,           // Delay between each dice reveal
  RESULT_DISPLAY_DURATION: 2000
} as const;

// Dice size scaling based on count
const DICE_SCALE = {
  1: 1.0,    // 100% - full size
  2: 0.8,    // 80%
  3: 0.65    // 65%
} as const;

interface DiceAnimationProps {
  results: SingleDiceResult[] | null;  // Array of results (null when rolling)
  diceCount: 1 | 2 | 3;
  isRolling: boolean;
  targetNumber: number;   // For win/lose determination
  direction: 'Over' | 'Under';
  onAnimationComplete?: () => void;
  onClick?: () => void;
}

interface SingleDiceState {
  displayNumber: number;
  isRevealed: boolean;
  isWin: boolean | null;
}

export const DiceAnimation: React.FC<DiceAnimationProps> = ({
  results,
  diceCount,
  isRolling,
  targetNumber,
  direction,
  onAnimationComplete,
  onClick
}) => {
  // Track state for each dice
  const [diceStates, setDiceStates] = useState<SingleDiceState[]>(() =>
    Array(3).fill(null).map(() => ({ displayNumber: 0, isRevealed: false, isWin: null }))
  );
  const [allRevealed, setAllRevealed] = useState(false);

  const intervalRefs = useRef<(ReturnType<typeof setInterval> | null)[]>([null, null, null]);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear all timers helper
  const clearAllTimers = useCallback(() => {
    intervalRefs.current.forEach((interval, i) => {
      if (interval) {
        clearInterval(interval);
        intervalRefs.current[i] = null;
      }
    });
    timeoutRefs.current.forEach(t => clearTimeout(t));
    timeoutRefs.current = [];
  }, []);

  // Start rolling animation for a specific dice
  const startRolling = useCallback((diceIndex: number) => {
    if (intervalRefs.current[diceIndex]) {
      clearInterval(intervalRefs.current[diceIndex]!);
    }
    intervalRefs.current[diceIndex] = setInterval(() => {
      setDiceStates(prev => {
        const newStates = [...prev];
        newStates[diceIndex] = {
          ...newStates[diceIndex],
          displayNumber: Math.floor(Math.random() * 101)
        };
        return newStates;
      });
    }, ANIMATION_CONFIG.FAST_INTERVAL);
  }, []);

  // Reveal a specific dice with slowdown animation
  const revealDice = useCallback((diceIndex: number, result: SingleDiceResult) => {
    // Stop rolling interval for this dice
    if (intervalRefs.current[diceIndex]) {
      clearInterval(intervalRefs.current[diceIndex]!);
      intervalRefs.current[diceIndex] = null;
    }

    // Slowdown sequence
    let totalDelay = 0;
    ANIMATION_CONFIG.SLOWDOWN_DELAYS.forEach((delay) => {
      totalDelay += delay;
      const timeout = setTimeout(() => {
        setDiceStates(prev => {
          const newStates = [...prev];
          newStates[diceIndex] = {
            ...newStates[diceIndex],
            displayNumber: Math.floor(Math.random() * 101)
          };
          return newStates;
        });
      }, totalDelay);
      timeoutRefs.current.push(timeout);
    });

    // Final reveal
    totalDelay += ANIMATION_CONFIG.SLOWDOWN_DELAYS[ANIMATION_CONFIG.SLOWDOWN_DELAYS.length - 1];
    const finalTimeout = setTimeout(() => {
      setDiceStates(prev => {
        const newStates = [...prev];
        newStates[diceIndex] = {
          displayNumber: result.rolled_number,
          isRevealed: true,
          isWin: result.is_win
        };
        return newStates;
      });
    }, totalDelay);
    timeoutRefs.current.push(finalTimeout);

    return totalDelay;
  }, []);

  // Main animation effect
  useEffect(() => {
    clearAllTimers();

    if (isRolling && results === null) {
      // Start rolling - all dice roll simultaneously
      setAllRevealed(false);
      setDiceStates(Array(diceCount).fill(null).map(() => ({
        displayNumber: Math.floor(Math.random() * 101),
        isRevealed: false,
        isWin: null
      })));

      for (let i = 0; i < diceCount; i++) {
        startRolling(i);
      }
    } else if (isRolling && results !== null) {
      // We have results - stagger the reveals
      setAllRevealed(false);

      let lastRevealTime = 0;
      results.forEach((result, index) => {
        const staggerDelay = index * ANIMATION_CONFIG.STAGGER_DELAY;
        const timeout = setTimeout(() => {
          const revealDuration = revealDice(index, result);
          lastRevealTime = staggerDelay + revealDuration;
        }, staggerDelay);
        timeoutRefs.current.push(timeout);
      });

      // Call onAnimationComplete after all dice are revealed
      const totalDuration = (results.length - 1) * ANIMATION_CONFIG.STAGGER_DELAY +
        ANIMATION_CONFIG.SLOWDOWN_DELAYS.reduce((a, b) => a + b, 0) +
        ANIMATION_CONFIG.SLOWDOWN_DELAYS[ANIMATION_CONFIG.SLOWDOWN_DELAYS.length - 1];

      const completeTimeout = setTimeout(() => {
        setAllRevealed(true);
        onAnimationComplete?.();
      }, totalDuration);
      timeoutRefs.current.push(completeTimeout);
    }
    // Note: We do NOT reset dice states when !isRolling - let them stay visible
    // Reset only happens after RESULT_DISPLAY_DURATION or when starting a new roll

    return () => clearAllTimers();
  }, [isRolling, results, diceCount, clearAllTimers, startRolling, revealDice, onAnimationComplete]);

  // Reset display after result shown (with delay so user can see results)
  useEffect(() => {
    if (allRevealed && !isRolling) {
      const timer = setTimeout(() => {
        setAllRevealed(false);
        // Reset dice states back to 0 after display duration
        setDiceStates(Array(diceCount).fill(null).map(() => ({
          displayNumber: 0,
          isRevealed: false,
          isWin: null
        })));
      }, ANIMATION_CONFIG.RESULT_DISPLAY_DURATION);
      return () => clearTimeout(timer);
    }
  }, [allRevealed, isRolling, diceCount]);

  const scale = DICE_SCALE[diceCount];
  const isAnimating = isRolling && !allRevealed;

  return (
    <div
      className={`multi-dice-container dice-count-${diceCount} ${onClick && !isRolling ? 'cursor-pointer' : ''}`}
      onClick={!isRolling && onClick ? onClick : undefined}
    >
      <div className="dice-row">
        {Array(diceCount).fill(null).map((_, index) => {
          const state = diceStates[index] || { displayNumber: 0, isRevealed: false, isWin: null };
          const isThisDiceAnimating = isRolling && !state.isRevealed;

          return (
            <div key={index} className="single-dice-wrapper" style={{ '--dice-scale': scale } as React.CSSProperties}>
              <div
                className={`dice-box
                  ${state.isRevealed ? 'result-landed' : ''}
                  ${isThisDiceAnimating ? 'rolling' : ''}
                  ${state.isRevealed && state.isWin === true ? 'win' : ''}
                  ${state.isRevealed && state.isWin === false ? 'lose' : ''}
                `}
              >
                <div className="number-display">
                  {state.displayNumber}
                </div>
              </div>

              {/* Individual dice glow */}
              {state.isRevealed && (
                <div className={`result-glow ${state.isWin ? 'glow-win' : 'glow-lose'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Win summary - shown after all revealed */}
      {allRevealed && results && results.length > 1 && (
        <div className="result-summary">
          <span className={`summary-text ${results.filter(r => r.is_win).length > 0 ? 'has-wins' : 'no-wins'}`}>
            {results.filter(r => r.is_win).length}/{results.length} WINS
          </span>
        </div>
      )}
    </div>
  );
};
