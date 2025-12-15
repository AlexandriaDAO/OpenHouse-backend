import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { RocketState } from '../../../pages/Crash';
import './CrashRocket.css';

// Total number of unique rocket designs available (1-10)
const TOTAL_ROCKET_DESIGNS = 10;

// Get image paths for rockets and explosions
// Format: 1a.png (flying), 1b.png (crashed) through 10a.png, 10b.png
const getRocketImage = (variant: number) => `/rockets/${variant}a.png`;
const getCrashedImage = (variant: number) => `/rockets/${variant}b.png`;

// Preload all rocket images to prevent placeholder text showing
const preloadedImages: Map<string, HTMLImageElement> = new Map();
let imagesPreloaded = false;

const preloadAllRocketImages = (): Promise<void> => {
  if (imagesPreloaded) return Promise.resolve();

  const imagePromises: Promise<void>[] = [];

  for (let i = 1; i <= TOTAL_ROCKET_DESIGNS; i++) {
    // Preload flying rocket
    const flyingPath = getRocketImage(i);
    if (!preloadedImages.has(flyingPath)) {
      const flyingImg = new Image();
      imagePromises.push(new Promise((resolve) => {
        flyingImg.onload = () => resolve();
        flyingImg.onerror = () => resolve(); // Don't fail on error
        flyingImg.src = flyingPath;
      }));
      preloadedImages.set(flyingPath, flyingImg);
    }

    // Preload crashed rocket
    const crashedPath = getCrashedImage(i);
    if (!preloadedImages.has(crashedPath)) {
      const crashedImg = new Image();
      imagePromises.push(new Promise((resolve) => {
        crashedImg.onload = () => resolve();
        crashedImg.onerror = () => resolve();
        crashedImg.src = crashedPath;
      }));
      preloadedImages.set(crashedPath, crashedImg);
    }
  }

  return Promise.all(imagePromises).then(() => {
    imagesPreloaded = true;
  });
};

// 10 distinct colors for trajectory lines
export const ROCKET_COLORS = [
  '#39FF14', // Lime green
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
  isWaitingForBackend?: boolean;
  rocketCount?: number;
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Rocket size as percentage of canvas height (scales with screen size)
// ~85px on a 400px tall canvas, scales proportionally
const ROCKET_SIZE_PERCENT = 0.21; // 21% of canvas height

// Y axis margins - add bottom padding so rockets don't start cut off
const Y_TOP_MARGIN = 0.05;
const Y_BOTTOM_MARGIN = 0.12;
const Y_RANGE = 1 - Y_TOP_MARGIN - Y_BOTTOM_MARGIN;

export const CrashCanvas: React.FC<CrashCanvasProps> = ({
  rocketStates,
  targetMultiplier,
  rocketsSucceeded = 0,
  width: initialWidth = 800,
  height: initialHeight = 400,
  isWaitingForBackend = false,
  rocketCount = 10,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use state for dynamic sizing, initialized with props
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });

  // Track when images are preloaded
  const [imagesReady, setImagesReady] = useState(imagesPreloaded);

  // Preload images on mount
  useEffect(() => {
    if (!imagesReady) {
      preloadAllRocketImages().then(() => setImagesReady(true));
    }
  }, []);

  // Resize Observer to handle fluid layout
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

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

  // Assign each rocket a unique design (no duplicates)
  // Shuffle all available designs and assign them to rockets by index
  const rocketDesigns = useMemo(() => {
    // Create array of all design numbers [1, 2, 3, ..., 10]
    const allDesigns = Array.from({ length: TOTAL_ROCKET_DESIGNS }, (_, i) => i + 1);
    // Shuffle to randomize assignment
    const shuffled = shuffleArray(allDesigns);

    // Map rocket index to design number
    const designs = new Map<number, number>();
    rocketStates.forEach((rocket, i) => {
      if (!designs.has(rocket.index)) {
        // Use modulo in case we ever have more rockets than designs
        designs.set(rocket.index, shuffled[i % shuffled.length]);
      }
    });
    return designs;
  }, [rocketStates.map(r => r.index).join(',')]);

  // Pre-launch rocket designs (stable during waiting period)
  const preLaunchDesigns = useMemo(() => {
    const allDesigns = Array.from({ length: TOTAL_ROCKET_DESIGNS }, (_, i) => i + 1);
    const shuffled = shuffleArray(allDesigns);
    return shuffled.slice(0, rocketCount);
  }, [rocketCount]);

  // Generate stars once - more stars for deep space effect
  const stars = useMemo(() => generateStars(100), []);

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

    // Keep everything in view - scale X to fit all history
    // Use a minimum "window" size so rockets don't instantly reach the edge
    const maxHistoryLength = Math.max(
      ...rocketStates.map(r => r.history.length),
      100
    );

    // Define the visible X range for rockets (as percentage of canvas width)
    // Rockets start at 10% and can go up to 85% (leaving room for rocket sprite)
    const X_START_PERCENT = 0.10;
    const X_END_PERCENT = 0.85;
    const X_RANGE = X_END_PERCENT - X_START_PERCENT;

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

      // Store recent points for smooth angle calculation
      // Using a longer lookback prevents jitter when dy becomes small at high multipliers
      const recentPoints: { x: number; y: number }[] = [];
      const ANGLE_LOOKBACK = 50;

      rocket.history.forEach((point, i) => {
        // Base X position from time progression
        const timeProgress = i / maxHistoryLength;
        // Map time progress to our visible range (float coords for smooth lines)
        const x = (X_START_PERCENT + timeProgress * X_RANGE) * width;

        const logMult = Math.log10(point.multiplier);
        const logMax = Math.log10(100);
        // Y position with margins: starts at (1 - Y_BOTTOM_MARGIN) and goes up to Y_TOP_MARGIN
        const yProgress = Math.min(logMult / logMax, 1);
        const y = height * (1 - Y_BOTTOM_MARGIN - yProgress * Y_RANGE);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        lastX = x;
        lastY = y;

        // Track recent points for angle smoothing
        recentPoints.push({ x, y });
        if (recentPoints.length > ANGLE_LOOKBACK) {
          recentPoints.shift();
        }
      });

      ctx.stroke();

      // Calculate angle from a longer segment of the trajectory
      // This smooths out jitter caused by tiny dy values at high multipliers
      let rocketAngle = 0;
      if (recentPoints.length >= 2) {
        const startPoint = recentPoints[0];
        const endPoint = recentPoints[recentPoints.length - 1];
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        // Canvas Y is inverted (increases downward), so negate dy for proper angle
        const angleRad = Math.atan2(-dy, dx);
        const trajectoryAngle = (angleRad * 180) / Math.PI;
        // Rocket PNG points straight UP (nose at 12 o'clock position)
        rocketAngle = 90 - trajectoryAngle;
      }

      // Use the exact line endpoint coordinates for the rocket position
      // This ensures the rocket is always precisely at the end of its trajectory line
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

  // Calculate atmosphere progression (0 = ground level, 1 = deep space)
  // Using logarithmic scale: 1x=0%, 10x=50%, 100x=100%
  // This spreads the atmosphere transition across a much wider multiplier range
  const atmosphereProgress = Math.min(Math.log10(maxCurrentMultiplier) / Math.log10(100), 1);

  // Dynamic background colors based on altitude
  // Cypherpunk aesthetic: dark ionosphere dusk -> void of space -> cosmic depths
  const getAtmosphereGradient = () => {
    if (atmosphereProgress < 0.15) {
      // Ionosphere at dusk: more purple/blue, subtle rust horizon
      const t = atmosphereProgress / 0.15;
      return {
        top: `rgb(${Math.round(12 + t * 3)}, ${Math.round(8 + t * 4)}, ${Math.round(30 + t * 10)})`,      // Dark purple-blue
        bottom: `rgb(${Math.round(50 - t * 10)}, ${Math.round(20 + t * 5)}, ${Math.round(35 + t * 5)})`,  // Muted rust with purple
      };
    } else if (atmosphereProgress < 0.35) {
      // Upper ionosphere: deeper purple, fading warmth
      const t = (atmosphereProgress - 0.15) / 0.2;
      return {
        top: `rgb(${Math.round(15 - t * 8)}, ${Math.round(12 - t * 6)}, ${Math.round(40 - t * 15)})`,     // Darker purple-blue
        bottom: `rgb(${Math.round(40 - t * 20)}, ${Math.round(25 - t * 12)}, ${Math.round(40 - t * 15)})`, // Fading to deep purple
      };
    } else if (atmosphereProgress < 0.6) {
      // Exosphere: last traces of atmosphere
      const t = (atmosphereProgress - 0.35) / 0.25;
      return {
        top: `rgb(${Math.round(7 - t * 4)}, ${Math.round(6 - t * 4)}, ${Math.round(25 - t * 15)})`,
        bottom: `rgb(${Math.round(20 - t * 12)}, ${Math.round(13 - t * 8)}, ${Math.round(25 - t * 15)})`,
      };
    } else if (atmosphereProgress < 0.85) {
      // Thermosphere: entering the void
      const t = (atmosphereProgress - 0.6) / 0.25;
      return {
        top: `rgb(${Math.round(3 - t * 2)}, ${Math.round(2 - t * 1)}, ${Math.round(10 - t * 7)})`,
        bottom: `rgb(${Math.round(8 - t * 5)}, ${Math.round(5 - t * 3)}, ${Math.round(10 - t * 6)})`,
      };
    } else {
      // Deep space: the void
      return {
        top: '#010102',
        bottom: '#030204',
      };
    }
  };

  const atmosphereColors = getAtmosphereGradient();

  // Star visibility increases with altitude
  const starOpacity = 0.2 + atmosphereProgress * 0.6;

  // Horizon glow fades as we leave atmosphere - darker ember glow
  const horizonGlowOpacity = Math.max(0, 0.35 - atmosphereProgress * 0.45);

  // Deep space effects kick in at high multipliers (20x+)
  // Using a separate scale: 20x=0%, 50x=40%, 100x=55%, 500x=85%, 2000x=100%
  const deepSpaceProgress = maxCurrentMultiplier > 20
    ? Math.min(Math.log10(maxCurrentMultiplier / 20) / Math.log10(100), 1)
    : 0;

  // Nebula glow intensity - cosmic clouds appearing in deep space
  const nebulaOpacity = deepSpaceProgress * 0.35;

  // Extra bright stars at extreme distances - starts appearing early
  const cosmicStarIntensity = deepSpaceProgress;

  // Calculate actual net return: (winners * target) / total rockets
  const netReturn = rocketStates.length > 0 && targetMultiplier
    ? (rocketsSucceeded * targetMultiplier) / rocketStates.length
    : 0;
  const isProfit = netReturn >= 1.0;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full rounded-lg border border-pure-white/20 shadow-2xl overflow-hidden"
      style={{
        background: `linear-gradient(to bottom, ${atmosphereColors.top}, ${atmosphereColors.bottom})`,
        transition: 'background 0.3s ease-out',
      }}
    >
      {/* Horizon glow effect - muted rust/purple glow at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1/4 pointer-events-none"
        style={{
          background: `linear-gradient(to top, rgba(80, 35, 45, ${horizonGlowOpacity}), rgba(50, 20, 50, ${horizonGlowOpacity * 0.5}), transparent)`,
          transition: 'opacity 0.3s ease-out',
        }}
      />

      {/* Stars Background - visibility increases with altitude */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ opacity: starOpacity, transition: 'opacity 0.3s ease-out' }}
      >
        {stars.map(star => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white star"
            style={{
              left: star.style.left,
              top: star.style.top,
              width: star.style.width,
              height: star.style.height,
              opacity: star.style.opacity,
              animationDelay: star.style.animationDelay,
            }}
          />
        ))}
      </div>

      {/* Deep space nebula effect - appears at high multipliers */}
      {deepSpaceProgress > 0 && (
        <>
          {/* Purple/blue nebula cloud - top left */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: '10%',
              left: '5%',
              width: '40%',
              height: '35%',
              background: `radial-gradient(ellipse at center, rgba(60, 20, 80, ${nebulaOpacity}) 0%, rgba(30, 15, 60, ${nebulaOpacity * 0.5}) 40%, transparent 70%)`,
              filter: 'blur(30px)',
              transition: 'opacity 0.5s ease-out',
            }}
          />
          {/* Cyan/teal nebula wisp - right side */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: '30%',
              right: '10%',
              width: '30%',
              height: '40%',
              background: `radial-gradient(ellipse at center, rgba(20, 50, 70, ${nebulaOpacity * 0.8}) 0%, rgba(15, 35, 55, ${nebulaOpacity * 0.4}) 50%, transparent 75%)`,
              filter: 'blur(25px)',
              transition: 'opacity 0.5s ease-out',
            }}
          />
          {/* Distant galaxy cluster glow - bottom */}
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: '15%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '25%',
              height: '20%',
              background: `radial-gradient(ellipse at center, rgba(80, 40, 100, ${nebulaOpacity * 0.6}) 0%, transparent 60%)`,
              filter: 'blur(20px)',
              transition: 'opacity 0.5s ease-out',
            }}
          />
          {/* Bright cosmic stars - appear in deep space (starts ~30x) */}
          {cosmicStarIntensity > 0.1 && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {/* A few bright distant stars */}
              <div
                className="absolute rounded-full"
                style={{
                  top: '15%',
                  left: '70%',
                  width: '4px',
                  height: '4px',
                  backgroundColor: `rgba(200, 220, 255, ${cosmicStarIntensity * 0.9})`,
                  boxShadow: `0 0 ${8 * cosmicStarIntensity}px rgba(200, 220, 255, ${cosmicStarIntensity * 0.6})`,
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  top: '45%',
                  left: '20%',
                  width: '3px',
                  height: '3px',
                  backgroundColor: `rgba(255, 230, 200, ${cosmicStarIntensity * 0.8})`,
                  boxShadow: `0 0 ${6 * cosmicStarIntensity}px rgba(255, 230, 200, ${cosmicStarIntensity * 0.5})`,
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  top: '70%',
                  left: '80%',
                  width: '3px',
                  height: '3px',
                  backgroundColor: `rgba(180, 200, 255, ${cosmicStarIntensity * 0.85})`,
                  boxShadow: `0 0 ${7 * cosmicStarIntensity}px rgba(180, 200, 255, ${cosmicStarIntensity * 0.5})`,
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  top: '25%',
                  left: '35%',
                  width: '2px',
                  height: '2px',
                  backgroundColor: `rgba(255, 200, 180, ${cosmicStarIntensity * 0.7})`,
                  boxShadow: `0 0 ${5 * cosmicStarIntensity}px rgba(255, 200, 180, ${cosmicStarIntensity * 0.4})`,
                }}
              />
            </div>
          )}
        </>
      )}

      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="relative z-10 w-full h-full"
      />

      {/* Rocket Elements - only render when images are preloaded to prevent placeholder text */}
      {imagesReady && rocketStates.map((rocket) => {
        const pos = rocketPositions.get(rocket.index);
        if (!pos) return null;

        // Get the unique design number for this rocket (1-10)
        const designNum = rocketDesigns.get(rocket.index) || 1;

        // Calculate rocket size based on canvas height (responsive)
        const rocketSize = Math.round(size.height * ROCKET_SIZE_PERCENT);

        // Show crash label for high-flyers (10x+)
        const showCrashLabel = rocket.isCrashed && rocket.crashPoint >= 10;

        return (
          <div
            key={rocket.index}
            className="absolute pointer-events-none"
            style={{
              left: `${pos.xPercent}%`,
              top: `${pos.yPercent}%`,
              transform: `translate(-50%, -50%) rotate(${pos.angle}deg)`,
              zIndex: rocket.isCrashed ? 25 : 20,
            }}
          >
            <img
              src={rocket.isCrashed ? getCrashedImage(designNum) : getRocketImage(designNum)}
              alt=""
              style={{
                height: `${rocketSize}px`,
                width: 'auto', // Preserve aspect ratio
                filter: rocket.isCrashed
                  ? 'drop-shadow(0 0 6px rgba(255, 100, 0, 0.4))'
                  : 'drop-shadow(0 0 5px rgba(255, 200, 100, 0.35))'
              }}
            />
            {/* Crash point label for high-flyers (10x+) */}
            {showCrashLabel && (
              <div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap animate-in fade-in zoom-in duration-300"
                style={{
                  bottom: `${rocketSize + 8}px`,
                  transform: `translateX(-50%) rotate(${-pos.angle}deg)`, // Counter-rotate to keep text upright
                }}
              >
                <div
                  className="px-2 py-1 rounded text-xs font-bold font-mono"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: rocket.crashPoint >= 50 ? '#FFD700' : '#FF6B6B',
                    border: `1px solid ${rocket.crashPoint >= 50 ? '#FFD700' : '#FF6B6B'}`,
                    boxShadow: `0 0 8px ${rocket.crashPoint >= 50 ? 'rgba(255, 215, 0, 0.5)' : 'rgba(255, 107, 107, 0.5)'}`,
                  }}
                >
                  {rocket.crashPoint.toFixed(2)}x
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Pre-launch rockets - slide onto starting line while waiting for backend */}
      {imagesReady && isWaitingForBackend && rocketStates.length === 0 && preLaunchDesigns.map((designNum, i) => {
        // Calculate rocket size based on canvas height (responsive)
        const rocketSize = Math.round(size.height * ROCKET_SIZE_PERCENT);

        // All rockets start at the same point: X=10%, Y=88% (multiplier 1.0)
        // This matches exactly where flight rockets begin
        const xPercent = 10; // X_START_PERCENT * 100
        const yPercent = (1 - Y_BOTTOM_MARGIN) * 100; // 88%

        return (
          <div
            key={`prelaunch-${i}`}
            className="absolute pointer-events-none"
            style={{
              left: `${xPercent}%`,
              top: `${yPercent}%`,
              // Rocket PNGs point UP, rotate 90deg to point RIGHT (horizontal)
              transform: 'translate(-50%, -50%) rotate(90deg)',
              zIndex: 20 + i,
              animation: `slideInFromLeft 300ms ease-out ${i * 150}ms both`,
            }}
          >
            <img
              src={getRocketImage(designNum)}
              alt=""
              style={{
                height: `${rocketSize}px`,
                width: 'auto',
                filter: 'drop-shadow(0 0 5px rgba(255, 200, 100, 0.35))'
              }}
            />
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
  // Use same Y margins as rockets for consistent positioning
  const yProgress = Math.min(logMult / logMax, 1);
  const y = height * (1 - Y_BOTTOM_MARGIN - yProgress * Y_RANGE);

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
      animationDelay: `${Math.random() * 3}s`,
    }
  }));
}
