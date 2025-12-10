export const PLINKO_LAYOUT = {
  // SVG viewBox dimensions (scales naturally)
  BOARD_WIDTH: 400,
  BOARD_HEIGHT: 550,  // Extra height for release tunnel at top + multiplier slots

  // Padding - increased for mobile compatibility (370px screens)
  PADDING_X: 35,      // Increased from 27 to ensure slots don't clip on edges
  PADDING_TOP: 80,    // Room for release tunnel above first row
  PADDING_BOTTOM: 80,  // Bottom padding for slots (increased for visibility)

  // Pin radius scales with row count: (24 - rows) / 2, scaled for 400px canvas
  // For 8 rows: (24-8)/2 * 0.53 ≈ 4.2
  PEG_RADIUS: 4,

  // Ball radius = pin radius * 2
  BALL_RADIUS: 8,

  // Slot configuration
  SLOT_WIDTH: 34,
  SLOT_HEIGHT: 32,
  SLOT_GAP: 2,
  SLOT_OFFSET_Y: 16,

  // Legacy constants (kept for compatibility)
  PEG_SPACING_X: 38,
  PEG_SPACING_Y: 36,
  DROP_ZONE_Y: 80,      // Same as PADDING_TOP - where balls enter pin grid
  BALL_START_Y: 60,     // Balls start just above first row (below tunnel)

  // Release tunnel configuration (above first row of pins)
  TUNNEL: {
    WIDTH: 100,         // Wider funnel to hold more balls
    HEIGHT: 55,         // Taller to accommodate more balls
    Y: 0,               // Top of tunnel
    GATE_HEIGHT: 4,     // Height of release gate
    BALL_RADIUS: 8,     // Matches board balls for unified appearance
  },

  // Legacy bucket config (deprecated, use TUNNEL)
  BUCKET: {
    WIDTH: 120,
    HEIGHT: 55,
    Y: -10,
    WALL_THICKNESS: 3,
    DOOR_HEIGHT: 5,
  },

  // Animation timing
  MS_PER_ROW: 100,
  BALL_STAGGER_MS: 40,
  BUCKET_OPEN_MS: 300,

  // Colors (Tailwind-compatible) - Aligned with OpenHouse brand
  COLORS: {
    peg: '#e8e8e8',
    ball: '#E8D5B5',      // Champagne gold
    win: '#00E19B',       // Brand green
    lose: '#ED0047',      // Brand red
    board: 'transparent',
    bucket: '#4a5568',
    bucketAccent: '#2d3748',
    tunnel: '#1a1a2e',
    tunnelAccent: '#16213e',
  }
};

// Multiplier slot colors - reversed for outcome visualization
// Center = LOW multipliers = losses = RED
// Edges = HIGH multipliers = big wins = PURPLE
export const BUCKET_COLORS = {
  // High multiplier (edges) - PURPLE (big wins!)
  high: {
    bg: { r: 59, g: 0, b: 185 },       // Brand purple #3B00B9
    shadow: { r: 35, g: 0, b: 110 },
  },
  // Low multiplier (center) - RED (losses)
  low: {
    bg: { r: 237, g: 0, b: 71 },       // Brand red #ED0047
    shadow: { r: 150, g: 0, b: 45 },
  },
};

// Linear interpolation between two RGB colors
function lerpColor(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number },
  t: number
): string {
  const r = Math.round(color1.r + (color2.r - color1.r) * t);
  const g = Math.round(color1.g + (color2.g - color1.g) * t);
  const b = Math.round(color1.b + (color2.b - color1.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Get bucket colors based on position (center=red losses, edges=green wins)
export function getBucketColors(index: number, totalBuckets: number): {
  background: string;
  shadow: string;
  glow: string;
} {
  const center = (totalBuckets - 1) / 2;
  const distanceFromCenter = Math.abs(index - center);
  const maxDistance = center;

  // t = 0 at center (yellow), t = 1 at edges (red)
  const t = maxDistance > 0 ? distanceFromCenter / maxDistance : 0;

  return {
    background: lerpColor(BUCKET_COLORS.low.bg, BUCKET_COLORS.high.bg, t),
    shadow: lerpColor(BUCKET_COLORS.low.shadow, BUCKET_COLORS.high.shadow, t),
    glow: lerpColor(
      { r: 237, g: 50, b: 100 },   // Red glow at center (losses)
      { r: 100, g: 50, b: 255 },   // Purple glow at edges (wins)
      t
    ),
  };
}

// Calculate ball position at a given path step
export function calculateBallPosition(
  path: boolean[],
  currentRow: number,
  progress: number // 0-1 within current row
): { x: number; y: number } {
  // Count rights up to current row to get X offset
  const rightsToCurrentRow = path.slice(0, currentRow).filter(v => v).length;

  // Calculate X position (center board is 200, adjust by rights)
  const currentX = PLINKO_LAYOUT.BOARD_WIDTH / 2 +
    (rightsToCurrentRow - currentRow / 2) * PLINKO_LAYOUT.PEG_SPACING_X;

  // Calculate next X for interpolation
  const rightsToNextRow = path.slice(0, currentRow + 1).filter(v => v).length;
  const nextX = PLINKO_LAYOUT.BOARD_WIDTH / 2 +
    (rightsToNextRow - (currentRow + 1) / 2) * PLINKO_LAYOUT.PEG_SPACING_X;

  // Interpolate X with easing
  const x = currentX + (nextX - currentX) * easeInOutQuad(progress);

  // Calculate Y position
  const baseY = PLINKO_LAYOUT.DROP_ZONE_Y + currentRow * PLINKO_LAYOUT.PEG_SPACING_Y;
  const y = baseY + PLINKO_LAYOUT.PEG_SPACING_Y * easeInOutQuad(progress);

  return { x, y };
}

// Easing function
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Generate Framer Motion keyframes from path
export function generateBallKeyframes(path: boolean[]) {
  const keyframes: { x: number; y: number }[] = [];

  // Start at top
  keyframes.push({ x: PLINKO_LAYOUT.BOARD_WIDTH / 2, y: PLINKO_LAYOUT.BALL_START_Y });

  // Add keyframe for each row
  for (let row = 0; row < path.length; row++) {
    const rightsSoFar = path.slice(0, row + 1).filter(v => v).length;
    const x = PLINKO_LAYOUT.BOARD_WIDTH / 2 + (rightsSoFar - (row + 1) / 2) * PLINKO_LAYOUT.PEG_SPACING_X;
    const y = PLINKO_LAYOUT.DROP_ZONE_Y + (row + 1) * PLINKO_LAYOUT.PEG_SPACING_Y;
    
    keyframes.push({ x, y });
  }

  return keyframes;
}

// Physics keyframe with optional transform properties
interface PhysicsKeyframe {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

// Generate physics-enhanced keyframes from path
export function generatePhysicsKeyframes(path: boolean[]): PhysicsKeyframe[] {
  const keyframes: PhysicsKeyframe[] = [];
  const { BOARD_WIDTH, DROP_ZONE_Y, PEG_SPACING_X, PEG_SPACING_Y, BALL_START_Y } = PLINKO_LAYOUT;

  // Start position
  keyframes.push({
    x: BOARD_WIDTH / 2,
    y: BALL_START_Y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  });

  for (let row = 0; row < path.length; row++) {
    const goesRight = path[row];
    const rightsSoFar = path.slice(0, row + 1).filter(v => v).length;

    // Calculate positions
    const pinX = BOARD_WIDTH / 2 + (rightsSoFar - row / 2 - 0.5) * PEG_SPACING_X;
    const pinY = DROP_ZONE_Y + row * PEG_SPACING_Y;
    const landX = BOARD_WIDTH / 2 + (rightsSoFar - (row + 1) / 2) * PEG_SPACING_X;
    const landY = DROP_ZONE_Y + (row + 1) * PEG_SPACING_Y;

    // Approach pin (slight vertical stretch from falling)
    keyframes.push({
      x: pinX,
      y: pinY - 2,
      scaleX: 0.95,
      scaleY: 1.05,
      rotation: goesRight ? 5 : -5
    });

    // Impact (squash)
    keyframes.push({
      x: pinX + (goesRight ? 2 : -2),
      y: pinY,
      scaleX: 1.12,
      scaleY: 0.88,
      rotation: goesRight ? 10 : -10
    });

    // Bounce away (stretch)
    const bounceX = pinX + (goesRight ? PEG_SPACING_X * 0.3 : -PEG_SPACING_X * 0.3);
    const bounceY = pinY + PEG_SPACING_Y * 0.3;
    keyframes.push({
      x: bounceX,
      y: bounceY,
      scaleX: 0.92,
      scaleY: 1.08,
      rotation: goesRight ? 12 : -12
    });

    // Land (normalize)
    keyframes.push({
      x: landX,
      y: landY,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    });
  }

  return keyframes;
}

// Generate timing array with gravity acceleration feel
export function generatePhysicsTiming(keyframeCount: number): number[] {
  const times: number[] = [];
  let accumulated = 0;

  for (let i = 0; i < keyframeCount; i++) {
    times.push(accumulated);

    // Vary timing based on keyframe type (4 per row after initial)
    const segmentType = i === 0 ? -1 : (i - 1) % 4;
    let segmentDuration: number;

    switch (segmentType) {
      case -1: segmentDuration = 0.1; break;  // Initial drop
      case 0: segmentDuration = 0.12; break;  // Approach
      case 1: segmentDuration = 0.04; break;  // Impact (quick)
      case 2: segmentDuration = 0.10; break;  // Bounce
      case 3: segmentDuration = 0.08; break;  // Land
      default: segmentDuration = 0.08;
    }

    // Gradually speed up (gravity effect) - max 30% faster at bottom
    const progress = i / keyframeCount;
    const gravityMultiplier = 1 - progress * 0.3;
    accumulated += segmentDuration * gravityMultiplier;
  }

  // Normalize to 0-1
  return times.map(t => t / accumulated);
}
