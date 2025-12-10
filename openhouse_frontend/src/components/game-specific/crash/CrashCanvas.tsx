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
  rocketsSucceeded?: number;
  width?: number;
  height?: number;
}

// Padding to keep rockets visible within canvas bounds
const CANVAS_PADDING = {
    left: 30,   // Space for rocket at start
    right: 30,  // Space for rocket at end
    top: 25,    // Space for rocket at high multipliers
    bottom: 25, // Space for rocket at bottom
};

export const CrashCanvas: React.FC<CrashCanvasProps> = ({
  rocketStates,
  targetMultiplier,
  rocketsSucceeded = 0,
  width: initialWidth = 800,
  height: initialHeight = 400
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use state for dynamic sizing, initialized with props
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });

  // Resize Observer to handle fluid layout
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use contentRect for the content box size
        const { width, height } = entry.contentRect;
        
        // Update if dimensions change (using a small threshold to avoid float jitter)
        setSize(prevSize => {
            if (Math.abs(width - prevSize.width) > 1 || Math.abs(height - prevSize.height) > 1) {
                return { width, height };
            }
            return prevSize;
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Store positions as percentages (0-100) and angle in degrees
  const [rocketPositions, setRocketPositions] = useState<Map<number, { xPercent: number; yPercent: number; angle: number }>>(new Map());

  // Generate stars once
  const stars = useMemo(() => generateStars(50), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = size;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    drawGrid(ctx, width, height);

    // Draw target line if set
    if (targetMultiplier && targetMultiplier > 1) {
      drawTargetLine(ctx, targetMultiplier, width, height);
    }

    // Calculate max X across all rockets for consistent scaling
    const maxHistoryLength = Math.max(
      ...rocketStates.map(r => r.history.length),
      100
    );

    // Draw each rocket's trajectory
    const newPositions = new Map<number, { xPercent: number; yPercent: number; angle: number }>();

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
      let prevX = 0;
      let prevY = height;

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

        prevX = lastX;
        prevY = lastY;
        lastX = x;
        lastY = y;
      });

      ctx.stroke();

      // Calculate angle from the last segment of the trajectory
      // atan2 gives angle in radians, convert to degrees
      const dx = lastX - prevX;
      const dy = lastY - prevY;
      // Canvas Y is inverted (increases downward), so negate dy
      const angleRad = Math.atan2(-dy, dx);
      const trajectoryAngle = (angleRad * 180) / Math.PI;

      // Rocket emoji 🚀 points straight UP (12 o'clock)
      // We want it to follow the trajectory:
      // - Flat trajectory (0°) → rocket at ~2-3 o'clock (rotate ~60° clockwise)
      // - Steep trajectory (90°) → rocket at ~12 o'clock (no rotation)
      // CSS positive rotation = clockwise
      const rocketAngle = 60 - trajectoryAngle;

      // Store rocket position as percentages so it scales with container
      newPositions.set(rocket.index, {
        xPercent: (lastX / width) * 100,
        yPercent: (lastY / height) * 100,
        angle: rocketAngle
      });
    });

    setRocketPositions(newPositions);

  }, [rocketStates, targetMultiplier, size]);

  // Find the highest current multiplier for live display
  const maxCurrentMultiplier = Math.max(
    ...rocketStates.map(r => r.currentMultiplier),
    1.0
  );
  const allCrashed = rocketStates.length > 0 && rocketStates.every(r => r.isCrashed);

  // Calculate actual net return: (winners * target) / total rockets
  const netReturn = rocketStates.length > 0 && targetMultiplier
    ? (rocketsSucceeded * targetMultiplier) / rocketStates.length
    : 0;
  const isProfit = netReturn >= 1.0;

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-gradient-to-b from-pure-black to-dfinity-navy rounded-lg overflow-hidden border border-pure-white/20 shadow-2xl"
    >
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
        width={size.width}
        height={size.height}
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
            className="absolute pointer-events-none"
            style={{
              left: `${pos.xPercent}%`,
              top: `${pos.yPercent}%`,
              transform: `translate(-50%, -50%)${rocket.isCrashed ? '' : ` rotate(${pos.angle}deg)`}`,
              zIndex: rocket.isCrashed ? 25 : 20,
            }}
          >
            {rocket.isCrashed ? (
              <ExplosionSVG color={color} size={40} />
            ) : (
              <RocketSVG color={color} size={32} />
            )}
          </div>
        );
      })}

      {/* Current Multiplier Display */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-30">
        {allCrashed ? (
          <>
            {/* Show net return when game ends */}
            <div className={`text-5xl font-bold font-mono ${isProfit ? 'text-green-400' : 'text-red-500'} drop-shadow-lg`}>
              {netReturn.toFixed(2)}x
            </div>
            <div className={`font-bold text-lg mt-1 ${isProfit ? 'text-green-300' : 'text-red-300'}`}>
              NET RETURN
            </div>
            <div className={`font-bold text-xl mt-2 ${rocketsSucceeded > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {rocketsSucceeded}/{rocketStates.length} reached {targetMultiplier?.toFixed(2)}x
            </div>
          </>
        ) : (
          <>
            {/* Show live max multiplier during flight */}
            <div className="text-5xl font-bold font-mono text-white drop-shadow-lg">
              {maxCurrentMultiplier.toFixed(2)}x
            </div>
          </>
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

// Rocket SVG with customizable color - detailed design
const RocketSVG: React.FC<{ color: string; size?: number }> = ({ color, size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 64 80" style={{ filter: `drop-shadow(0 0 8px ${color})` }}>
    <defs>
      {/* Body gradient - main color with shading */}
      <linearGradient id={`bodyGrad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor={color} stopOpacity="0.7" />
        <stop offset="30%" stopColor={color} />
        <stop offset="70%" stopColor={color} />
        <stop offset="100%" stopColor={color} stopOpacity="0.5" />
      </linearGradient>
      {/* Nose cone gradient */}
      <linearGradient id={`noseGrad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#C0C0C0" />
        <stop offset="30%" stopColor="#E8E8E8" />
        <stop offset="70%" stopColor="#E8E8E8" />
        <stop offset="100%" stopColor="#A0A0A0" />
      </linearGradient>
      {/* Metallic gradient for details */}
      <linearGradient id={`metalGrad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#606060" />
        <stop offset="50%" stopColor="#909090" />
        <stop offset="100%" stopColor="#505050" />
      </linearGradient>
      {/* Window gradient */}
      <radialGradient id={`windowGrad-${color.replace('#','')}`} cx="30%" cy="30%">
        <stop offset="0%" stopColor="#87CEEB" />
        <stop offset="50%" stopColor="#1a3a5c" />
        <stop offset="100%" stopColor="#0a1628" />
      </radialGradient>
      {/* Flame gradients */}
      <linearGradient id="flameOuter" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#FF4500" />
        <stop offset="100%" stopColor="#FF6B00" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="flameInner" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#FFD700" />
        <stop offset="60%" stopColor="#FF8C00" />
        <stop offset="100%" stopColor="#FF4500" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="flameCore" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="50%" stopColor="#FFFACD" />
        <stop offset="100%" stopColor="#FFD700" />
      </linearGradient>
    </defs>

    {/* Flames - behind rocket */}
    <g className="animate-pulse">
      {/* Outer flame */}
      <path d="M24,58 Q20,72 26,78 Q32,68 38,78 Q44,72 40,58 L32,62 Z" fill="url(#flameOuter)" />
      {/* Middle flame */}
      <path d="M26,58 Q24,68 29,74 Q32,66 35,74 Q40,68 38,58 L32,61 Z" fill="url(#flameInner)" />
      {/* Inner flame core */}
      <path d="M28,58 Q27,65 31,70 Q32,64 33,70 Q37,65 36,58 L32,60 Z" fill="url(#flameCore)" />
    </g>

    {/* Left fin */}
    <path d="M20,42 L8,58 L12,58 L20,50 Z" fill={`url(#bodyGrad-${color.replace('#','')})`} stroke={color} strokeWidth="0.5" />
    {/* Left fin detail line */}
    <path d="M18,44 L12,54" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />

    {/* Right fin */}
    <path d="M44,42 L56,58 L52,58 L44,50 Z" fill={`url(#bodyGrad-${color.replace('#','')})`} stroke={color} strokeWidth="0.5" />
    {/* Right fin detail line */}
    <path d="M46,44 L52,54" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />

    {/* Engine bell / nozzle */}
    <path d="M26,52 L24,58 L40,58 L38,52 Z" fill={`url(#metalGrad-${color.replace('#','')})`} stroke="#404040" strokeWidth="0.5" />
    {/* Nozzle inner ring */}
    <ellipse cx="32" cy="58" rx="7" ry="2" fill="#303030" />
    <ellipse cx="32" cy="58" rx="5" ry="1.5" fill="#505050" />

    {/* Main body */}
    <path d="M24,20 L24,52 L40,52 L40,20 Q40,12 32,4 Q24,12 24,20 Z" fill={`url(#bodyGrad-${color.replace('#','')})`} stroke={color} strokeWidth="0.5" />

    {/* Body panel lines */}
    <path d="M28,18 L28,52" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
    <path d="M36,18 L36,52" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />

    {/* Nose cone */}
    <path d="M24,20 Q24,12 32,4 Q40,12 40,20 Z" fill={`url(#noseGrad-${color.replace('#','')})`} stroke="#888" strokeWidth="0.5" />

    {/* Nose cone tip */}
    <circle cx="32" cy="6" r="2" fill="#D0D0D0" />

    {/* Body/nose seam ring */}
    <ellipse cx="32" cy="20" rx="8" ry="2" fill={`url(#metalGrad-${color.replace('#','')})`} />

    {/* Upper window */}
    <circle cx="32" cy="30" r="5" fill={`url(#windowGrad-${color.replace('#','')})`} stroke="#404040" strokeWidth="1" />
    {/* Window frame outer */}
    <circle cx="32" cy="30" r="5.5" fill="none" stroke="#606060" strokeWidth="0.5" />
    {/* Window reflection */}
    <ellipse cx="30" cy="28" rx="1.5" ry="1" fill="rgba(255,255,255,0.6)" />

    {/* Lower porthole */}
    <circle cx="32" cy="42" r="3" fill={`url(#windowGrad-${color.replace('#','')})`} stroke="#404040" strokeWidth="0.8" />
    <ellipse cx="31" cy="41" rx="1" ry="0.7" fill="rgba(255,255,255,0.5)" />

    {/* Rivet details */}
    <circle cx="24.5" cy="25" r="0.8" fill="#505050" />
    <circle cx="24.5" cy="35" r="0.8" fill="#505050" />
    <circle cx="24.5" cy="45" r="0.8" fill="#505050" />
    <circle cx="39.5" cy="25" r="0.8" fill="#505050" />
    <circle cx="39.5" cy="35" r="0.8" fill="#505050" />
    <circle cx="39.5" cy="45" r="0.8" fill="#505050" />

    {/* Highlight stripe */}
    <path d="M26,20 Q26,14 32,8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Explosion SVG - detailed with smoke and debris
const ExplosionSVG: React.FC<{ color: string; size?: number }> = ({ color, size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" style={{ filter: `drop-shadow(0 0 12px ${color})` }}>
    <defs>
      {/* Explosion fire gradient */}
      <radialGradient id={`explodeGrad-${color.replace('#','')}`} cx="50%" cy="50%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="15%" stopColor="#FFFACD" />
        <stop offset="35%" stopColor="#FFD700" />
        <stop offset="55%" stopColor="#FF8C00" />
        <stop offset="75%" stopColor="#FF4500" />
        <stop offset="100%" stopColor={color} stopOpacity="0.6" />
      </radialGradient>
      {/* Smoke gradient */}
      <radialGradient id="smokeGrad" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#666666" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#333333" stopOpacity="0" />
      </radialGradient>
      {/* Secondary fire */}
      <radialGradient id="fireGrad2" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#FFD700" />
        <stop offset="50%" stopColor="#FF6B00" />
        <stop offset="100%" stopColor="#FF4500" stopOpacity="0.3" />
      </radialGradient>
    </defs>

    {/* Smoke clouds - outer layer */}
    <circle cx="25" cy="20" r="12" fill="url(#smokeGrad)" opacity="0.5" />
    <circle cx="55" cy="22" r="10" fill="url(#smokeGrad)" opacity="0.4" />
    <circle cx="20" cy="50" r="11" fill="url(#smokeGrad)" opacity="0.45" />
    <circle cx="60" cy="55" r="9" fill="url(#smokeGrad)" opacity="0.35" />
    <circle cx="40" cy="65" r="10" fill="url(#smokeGrad)" opacity="0.4" />

    {/* Outer fire burst - irregular shape */}
    <path d="M40,5 L48,22 L65,15 L55,30 L75,35 L58,42 L70,60 L50,52 L45,72 L40,55 L35,72 L30,52 L10,60 L22,42 L5,35 L25,30 L15,15 L32,22 Z"
          fill={color} opacity="0.6" />

    {/* Middle fire layer */}
    <path d="M40,12 L46,25 L58,20 L52,32 L68,38 L54,43 L62,55 L48,50 L44,65 L40,52 L36,65 L32,50 L18,55 L26,43 L12,38 L28,32 L22,20 L34,25 Z"
          fill="url(#fireGrad2)" />

    {/* Inner explosion core */}
    <circle cx="40" cy="40" r="18" fill={`url(#explodeGrad-${color.replace('#','')})`} />

    {/* Bright center flash */}
    <circle cx="40" cy="40" r="10" fill="#FFD700" opacity="0.9" />
    <circle cx="40" cy="40" r="5" fill="#FFFACD" />
    <circle cx="40" cy="40" r="2" fill="#FFFFFF" />

    {/* Debris particles */}
    <g fill="#404040">
      <rect x="15" y="30" width="3" height="3" transform="rotate(45 16.5 31.5)" />
      <rect x="62" y="28" width="2.5" height="2.5" transform="rotate(30 63.25 29.25)" />
      <rect x="18" y="55" width="2" height="2" transform="rotate(60 19 56)" />
      <rect x="58" y="58" width="2.5" height="2.5" transform="rotate(15 59.25 59.25)" />
      <rect x="30" y="68" width="2" height="2" transform="rotate(40 31 69)" />
      <rect x="52" y="12" width="2" height="2" transform="rotate(25 53 13)" />
    </g>

    {/* Spark particles */}
    <g fill="#FFD700">
      <circle cx="20" cy="25" r="1.5" />
      <circle cx="60" cy="30" r="1.2" />
      <circle cx="25" cy="58" r="1.3" />
      <circle cx="55" cy="62" r="1" />
      <circle cx="68" cy="45" r="1.4" />
      <circle cx="12" cy="42" r="1.1" />
      <circle cx="45" cy="15" r="1.2" />
      <circle cx="35" cy="70" r="1" />
    </g>

    {/* Flying embers with trails */}
    <g stroke="#FF6B00" strokeWidth="1" fill="none" opacity="0.8">
      <path d="M25,35 L15,28" />
      <path d="M55,35 L65,28" />
      <path d="M35,55 L28,65" />
      <path d="M45,55 L52,65" />
    </g>
    <g fill="#FF8C00">
      <circle cx="15" cy="28" r="1.5" />
      <circle cx="65" cy="28" r="1.5" />
      <circle cx="28" cy="65" r="1.5" />
      <circle cx="52" cy="65" r="1.5" />
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