import React, { useRef, useEffect, useState } from 'react';

interface CrashCanvasProps {
    currentMultiplier: number;
    isCrashed: boolean;
    crashPoint: number | null;
    history: Array<{ multiplier: number; timestamp: number }>;
    width?: number;
    height?: number;
}

export const CrashCanvas: React.FC<CrashCanvasProps> = ({
    currentMultiplier,
    isCrashed,
    crashPoint,
    history,
    width = 800,
    height = 400
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [rocketPos, setRocketPos] = useState({ x: 0, y: height });

    // Draw graph and update rocket position
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid
        drawGrid(ctx, canvas.width, canvas.height);

        // Draw graph if we have history
        if (history.length > 0) {
            // Calculate scales
            // X axis: Time. We need to decide on a time window or scale.
            // For now, let's stick to the existing logic where it fits the available history
            // But to make it look like it's moving forward, we might want a fixed window or expanding window.
            // The existing logic: x = (index / length) * width. This squishes.
            // Let's keep it for now to match previous behavior, but maybe improve later.

            const maxX = Math.max(history.length - 1, 100); // Minimum 100 ticks width to start

            ctx.beginPath();
            ctx.strokeStyle = '#39FF14'; // Lime green hacker terminal theme
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            let lastX = 0;
            let lastY = height;

            history.forEach((point, index) => {
                const x = (index / maxX) * width;
                // Log scale for Y: log10(1) = 0, log10(100) = 2.
                // We map 1..100 to height..0
                const logMult = Math.log10(point.multiplier);
                const logMax = Math.log10(100); // Max graph height is 100x
                const y = height - (Math.min(logMult / logMax, 1) * height);

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                lastX = x;
                lastY = y;
            });

            ctx.stroke();

            // Update rocket position to the tip of the line
            setRocketPos({ x: lastX, y: lastY });
        } else {
            // Reset rocket
            setRocketPos({ x: 0, y: height });
        }

        // Draw crash line ONLY if crashed
        if (isCrashed && crashPoint) {
            drawCrashLine(ctx, crashPoint, canvas.width, canvas.height);
        }

    }, [history, isCrashed, crashPoint, width, height]);

    return (
        <div className="relative bg-gradient-to-b from-pure-black to-dfinity-navy rounded-lg overflow-hidden border border-pure-white/20 shadow-2xl">
            {/* Stars Background */}
            <div className="absolute inset-0 opacity-50">
                {generateStars(50).map(star => (
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

            {/* Rocket Element */}
            <div
                className="absolute z-20 pointer-events-none transition-transform duration-75 ease-linear will-change-transform"
                style={{
                    transform: `translate(${rocketPos.x}px, ${rocketPos.y}px) translate(-50%, -50%) rotate(${-45}deg)`,
                    left: 0,
                    top: 0,
                }}
            >
                <div className={`relative ${isCrashed ? 'animate-ping' : ''}`}>
                    {isCrashed ? (
                        <div className="text-4xl">💥</div>
                    ) : (
                        <RocketSVG />
                    )}
                </div>
            </div>

            {/* Current Multiplier Display (Center or following rocket) */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-30">
                <div className={`text-6xl font-bold font-mono ${isCrashed ? 'text-red-500' : 'text-white'} drop-shadow-lg`}>
                    {currentMultiplier.toFixed(2)}x
                </div>
                {isCrashed && (
                    <div className="text-red-400 font-bold text-xl mt-2 animate-bounce">
                        CRASHED
                    </div>
                )}
            </div>

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

const RocketSVG = () => (
    <svg width="40" height="40" viewBox="0 0 60 80" className="drop-shadow-glow">
        {/* Rocket body */}
        <path d="M30,0 L45,60 L15,60 Z" fill="#39FF14" />
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

    // Horizontal lines (multiplier levels)
    for (let i = 0; i <= 4; i++) {
        const y = height - (i * height / 4);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = '10px monospace';
        // 0 -> 1x, 4 -> 100x (log scale)
        // This is a bit rough, just visual guides
    }
}

function drawCrashLine(
    ctx: CanvasRenderingContext2D,
    crashPoint: number,
    width: number,
    height: number
) {
    const logMult = Math.log10(crashPoint);
    const logMax = Math.log10(100);
    const y = height - (Math.min(logMult / logMax, 1) * height);

    // Red line at crash point
    ctx.strokeStyle = '#ED0047';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);
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
