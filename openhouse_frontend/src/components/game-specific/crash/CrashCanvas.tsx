import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { RocketState } from '../../../pages/Crash';

// 10 distinct colors for rockets
export const ROCKET_COLORS = [
  '#39FF14', // Lime green (original)
  '#FF6B6B', // Coral red
  '#4ECDC4', // Teal
  '#FFE66D', // Yellow
  '#FF8C00', // Orange
  '#E040FB', // Purple
  '#00BCD4', // Cyan
  '#FF4081', // Pink
  '#7C4DFF', // Indigo
  '#64FFDA', // Aqua
];

interface CrashCanvasProps {
  rocketStates: RocketState[];
  targetMultiplier?: number;
  width?: number;
  height?: number;
}

export const CrashCanvas: React.FC<CrashCanvasProps> = ({
  rocketStates,
  targetMultiplier,
  width = 800,
  height = 400
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rocketPositions, setRocketPositions] = useState<Map<number, { x: number; y: number }>>(new Map());

  // Generate stars once
  const stars = useMemo(() => generateStars(50), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height);

    // Draw target line if set
    if (targetMultiplier && targetMultiplier > 1) {
      drawTargetLine(ctx, targetMultiplier, canvas.width, canvas.height);
    }

    // Calculate max X across all rockets for consistent scaling
    const maxHistoryLength = Math.max(
      ...rocketStates.map(r => r.history.length),
      100
    );

    // Draw each rocket's trajectory
    const newPositions = new Map<number, { x: number; y: number }>();

    rocketStates.forEach((rocket) => {
      if (rocket.history.length === 0) return;

      const color = ROCKET_COLORS[rocket.index % ROCKET_COLORS.length];

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let lastX = 0;
      let lastY = height;

      rocket.history.forEach((point, i) => {
        const x = (i / maxHistoryLength) * width;
        const logMult = Math.log10(point.multiplier);
        const logMax = Math.log10(100);
        const y = height - (Math.min(logMult / logMax, 1) * height);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        lastX = x;
        lastY = y;
      });

      ctx.stroke();

      // Store rocket position
      newPositions.set(rocket.index, { x: lastX, y: lastY });
    });

    setRocketPositions(newPositions);

  }, [rocketStates, targetMultiplier, width, height]);

  // Find the highest current multiplier for display
  const maxCurrentMultiplier = Math.max(
    ...rocketStates.map(r => r.currentMultiplier),
    1.0
  );
  const allCrashed = rocketStates.length > 0 && rocketStates.every(r => r.isCrashed);

  return (
    <div className="relative bg-gradient-to-b from-pure-black to-dfinity-navy rounded-lg overflow-hidden border border-pure-white/20 shadow-2xl">
      {/* Stars Background */}
      <div className="absolute inset-0 opacity-50">
        {stars.map(star => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: star.style.left,
              top: star.style.top,
              width: star.style.width,
              height: star.style.height,
              opacity: star.style.opacity,
            }}
          />
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="relative z-10 w-full h-full"
      />

      {/* Rocket Elements - one for each rocket */}
      {rocketStates.map((rocket) => {
        const pos = rocketPositions.get(rocket.index);
        if (!pos) return null;

        const color = ROCKET_COLORS[rocket.index % ROCKET_COLORS.length];

        return (
          <div
            key={rocket.index}
            className="absolute z-20 pointer-events-none transition-transform duration-75 ease-linear will-change-transform"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) rotate(-45deg)`,
              left: 0,
              top: 0,
            }}
          >
            <div className={`relative ${rocket.isCrashed ? 'animate-ping' : ''}`}>
              {rocket.isCrashed ? (
                <div className="text-3xl">💥</div>
              ) : (
                <RocketSVG color={color} size={30} />
              )}
            </div>
          </div>
        );
      })}

      {/* Current Max Multiplier Display */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-30">
        <div className={`text-5xl font-bold font-mono ${allCrashed ? 'text-red-500' : 'text-white'} drop-shadow-lg`}>
          {maxCurrentMultiplier.toFixed(2)}x
        </div>
        {allCrashed && (
          <div className="text-red-400 font-bold text-xl mt-2 animate-bounce">
            ALL CRASHED
          </div>
        )}
      </div>

      {/* Rocket count indicator */}
      {rocketStates.length > 0 && (
        <div className="absolute top-2 right-2 flex gap-1 z-30">
          {rocketStates.map((rocket) => (
            <div
              key={rocket.index}
              className={`w-3 h-3 rounded-full ${rocket.isCrashed ? 'opacity-30' : ''}`}
              style={{ backgroundColor: ROCKET_COLORS[rocket.index % ROCKET_COLORS.length] }}
            />
          ))}
        </div>
      )}

      {/* Axes labels */}
      <div className="absolute bottom-2 right-2 text-xs text-pure-white/40 font-mono">
        Time
      </div>
      <div className="absolute top-2 left-2 text-xs text-pure-white/40 font-mono">
        Multiplier
      </div>
    </div>
  );
};

// Rocket SVG with customizable color
const RocketSVG: React.FC<{ color: string; size?: number }> = ({ color, size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 60 80" className="drop-shadow-glow">
    {/* Rocket body */}
    <path d="M30,0 L45,60 L15,60 Z" fill={color} />
    {/* Fins */}
    <path d="M15,60 L5,80 L15,70 Z" fill="#3B00B9" />
    <path d="M45,60 L55,80 L45,70 Z" fill="#3B00B9" />
    {/* Window */}
    <circle cx="30" cy="30" r="8" fill="#FFFFFF" />
    {/* Flames */}
    <g className="animate-pulse">
      <path d="M20,70 L25,80 L30,75 L35,80 L40,70" fill="#F15A24" />
    </g>
  </svg>
);

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = height - (i * height / 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawTargetLine(
  ctx: CanvasRenderingContext2D,
  targetMultiplier: number,
  width: number,
  height: number
) {
  const logMult = Math.log10(targetMultiplier);
  const logMax = Math.log10(100);
  const y = height - (Math.min(logMult / logMax, 1) * height);

  // Green dashed line at target
  ctx.strokeStyle = '#22C55E';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = '#22C55E';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`TARGET ${targetMultiplier.toFixed(2)}x`, width - 120, y - 5);
}

function generateStars(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    style: {
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      width: `${Math.random() * 2 + 1}px`,
      height: `${Math.random() * 2 + 1}px`,
      opacity: Math.random() * 0.7 + 0.3,
    }
  }));
}
