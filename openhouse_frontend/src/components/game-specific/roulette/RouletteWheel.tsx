import React, { useMemo } from 'react';
import { useRouletteAnimation } from './useRouletteAnimation';
import {
  WHEEL_NUMBERS,
  SEGMENTS,
  SEGMENT_ANGLE,
  DIMENSIONS as D,
  COLORS,
  getPocketColor,
  isRed,
} from './rouletteConstants';

interface RouletteWheelProps {
  winningNumber: number | null;
  isWaitingForResult: boolean;
  isLanding: boolean;
  onAnimationComplete?: () => void;
}

// Convert polar to cartesian coordinates
const polarToCartesian = (angle: number, radius: number): [number, number] => {
  const rad = (angle - 90) * (Math.PI / 180); // Start from top
  return [
    D.CENTER + radius * Math.cos(rad),
    D.CENTER + radius * Math.sin(rad),
  ];
};

// Create SVG path for a pie segment
const createSegmentPath = (index: number, innerR: number, outerR: number): string => {
  const startAngle = index * SEGMENT_ANGLE;
  const endAngle = startAngle + SEGMENT_ANGLE;

  const [x1, y1] = polarToCartesian(startAngle, outerR);
  const [x2, y2] = polarToCartesian(endAngle, outerR);
  const [x3, y3] = polarToCartesian(endAngle, innerR);
  const [x4, y4] = polarToCartesian(startAngle, innerR);

  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`;
};

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
  winningNumber,
  isWaitingForResult,
  isLanding,
  onAnimationComplete,
}) => {
  const { ballAngle, wheelAngle, ballRadius, showResult } = useRouletteAnimation({
    winningNumber,
    isSpinning: isWaitingForResult,
    isLanding,
    onComplete: onAnimationComplete,
  });

  // Pre-compute segment paths (static, won't change)
  const segments = useMemo(() =>
    WHEEL_NUMBERS.map((num, i) => ({
      num,
      path: createSegmentPath(i, D.POCKET_INNER, D.POCKET_OUTER),
      color: getPocketColor(num),
      textAngle: i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2,
      textRadius: (D.POCKET_INNER + D.POCKET_OUTER) / 2,
    })),
  []);

  // Pre-compute fret lines
  const frets = useMemo(() =>
    Array.from({ length: SEGMENTS }, (_, i) => {
      const angle = i * SEGMENT_ANGLE;
      const [x1, y1] = polarToCartesian(angle, D.POCKET_INNER);
      const [x2, y2] = polarToCartesian(angle, D.POCKET_OUTER);
      return { x1, y1, x2, y2 };
    }),
  []);

  // Ball position
  const ballY = D.CENTER - D.BALL_TRACK + ((100 - ballRadius) * 0.2);

  const winnerIsRed = winningNumber !== null && isRed(winningNumber);
  const winnerIsGreen = winningNumber === 0;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox={`0 0 ${D.VIEW_SIZE} ${D.VIEW_SIZE}`}
        className="w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96"
      >
        <defs>
          {/* Gradients */}
          <radialGradient id="rimGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#F4D03F" />
            <stop offset="50%" stopColor={COLORS.GOLD} />
            <stop offset="100%" stopColor={COLORS.GOLD_DARK} />
          </radialGradient>

          <radialGradient id="coneGradient" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#5D4E37" />
            <stop offset="100%" stopColor="#2A1F14" />
          </radialGradient>

          <radialGradient id="hubGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#F4D03F" />
            <stop offset="50%" stopColor={COLORS.GOLD} />
            <stop offset="100%" stopColor="#6B5B3D" />
          </radialGradient>

          <radialGradient id="ballGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#E8E8E8" />
            <stop offset="100%" stopColor="#CCCCCC" />
          </radialGradient>

          {/* Ball shadow/glow */}
          <filter id="ballGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="winnerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={COLORS.WINNER_HIGHLIGHT} floodOpacity="0.8" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Wheel group - rotates */}
        <g transform={`rotate(${wheelAngle} ${D.CENTER} ${D.CENTER})`}>
          {/* Outer rim */}
          <circle
            cx={D.CENTER}
            cy={D.CENTER}
            r={D.OUTER_RADIUS}
            fill="url(#rimGradient)"
            stroke={COLORS.GOLD_DARK}
            strokeWidth="2"
          />

          {/* Ball track groove */}
          <circle
            cx={D.CENTER}
            cy={D.CENTER}
            r={D.BALL_TRACK}
            fill="none"
            stroke="#3D3D3D"
            strokeWidth="12"
            opacity="0.5"
          />

          {/* Pocket segments */}
          {segments.map(({ num, path, color }) => {
            const isWinner = showResult && num === winningNumber;
            return (
              <path
                key={`pocket-${num}`}
                d={path}
                fill={isWinner ? COLORS.WINNER_HIGHLIGHT : color}
                stroke="#1A1A1A"
                strokeWidth="0.5"
                filter={isWinner ? 'url(#winnerGlow)' : undefined}
              />
            );
          })}

          {/* Frets (pocket dividers) */}
          {frets.map((f, i) => (
            <line
              key={`fret-${i}`}
              x1={f.x1}
              y1={f.y1}
              x2={f.x2}
              y2={f.y2}
              stroke={COLORS.FRET}
              strokeWidth="2"
            />
          ))}

          {/* Numbers */}
          {segments.map(({ num, textAngle, textRadius }) => {
            const [tx, ty] = polarToCartesian(textAngle, textRadius);
            const isWinner = showResult && num === winningNumber;
            return (
              <text
                key={`num-${num}`}
                x={tx}
                y={ty}
                fill={isWinner ? '#000' : '#FFF'}
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${textAngle + 90} ${tx} ${ty})`}
              >
                {num}
              </text>
            );
          })}

          {/* Inner cone */}
          <circle
            cx={D.CENTER}
            cy={D.CENTER}
            r={D.INNER_CONE}
            fill="url(#coneGradient)"
            stroke={COLORS.GOLD_DARK}
            strokeWidth="2"
          />

          {/* Center hub */}
          <circle
            cx={D.CENTER}
            cy={D.CENTER}
            r={D.CENTER_HUB}
            fill="url(#hubGradient)"
            stroke={COLORS.GOLD_DARK}
            strokeWidth="2"
          />

          {/* Hub decoration - cross */}
          <line
            x1={D.CENTER - 25}
            y1={D.CENTER}
            x2={D.CENTER + 25}
            y2={D.CENTER}
            stroke={COLORS.GOLD_DARK}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1={D.CENTER}
            y1={D.CENTER - 25}
            x2={D.CENTER}
            y2={D.CENTER + 25}
            stroke={COLORS.GOLD_DARK}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* Ball - rotates independently */}
        <g transform={`rotate(${-ballAngle} ${D.CENTER} ${D.CENTER})`}>
          <circle
            cx={D.CENTER}
            cy={ballY}
            r={D.BALL_RADIUS}
            fill="url(#ballGradient)"
            filter={(isWaitingForResult || isLanding || showResult) ? 'url(#ballGlow)' : undefined}
          />
        </g>
      </svg>

      {/* Result overlay */}
      {showResult && winningNumber !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/90 rounded-full w-20 h-20 flex flex-col items-center justify-center border-2 border-yellow-400 animate-pulse shadow-lg shadow-yellow-400/50">
            <span
              className={`text-3xl font-bold ${
                winnerIsRed ? 'text-red-500' : winnerIsGreen ? 'text-green-500' : 'text-white'
              }`}
            >
              {winningNumber}
            </span>
            <span className="text-xs text-gray-400">
              {winnerIsRed ? 'RED' : winnerIsGreen ? 'GREEN' : 'BLACK'}
            </span>
          </div>
        </div>
      )}

      {/* Status indicator */}
      {(isWaitingForResult || isLanding) && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            {isWaitingForResult ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="animate-pulse">Spinning...</span>
              </>
            ) : (
              <span className="text-white animate-pulse">Ball landing...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
