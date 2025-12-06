export const PLINKO_LAYOUT = {
  // SVG viewBox dimensions (scales naturally)
  BOARD_WIDTH: 400,
  BOARD_HEIGHT: 440,

  // Spacing (same as old LayoutConfig for consistency)
  PEG_SPACING_X: 38,
  PEG_SPACING_Y: 36,
  PEG_RADIUS: 5, 
  BALL_RADIUS: 8,

  // Slot configuration
  SLOT_WIDTH: 34,
  SLOT_HEIGHT: 32,
  SLOT_GAP: 2,
  SLOT_OFFSET_Y: 16,

  // Vertical layout constants
  DROP_ZONE_Y: 70,    // Where the first peg row starts
  BALL_START_Y: 50,   // Where balls spawn

  // Animation timing
  MS_PER_ROW: 150,        
  BALL_STAGGER_MS: 120,  // Delay between multi-ball drops

  // Colors (Tailwind-compatible)
  COLORS: {
    peg: '#e8e8e8',
    ball: '#ffd700',
    win: '#22c55e',
    lose: '#6b7280',
    board: 'transparent',
  }
};

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
