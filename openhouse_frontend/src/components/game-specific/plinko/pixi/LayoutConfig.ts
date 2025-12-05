// Plinko board layout constants
// Fixed internal canvas with dense spacing for visibility

export const LAYOUT = {
  // Fixed internal canvas - compact for 8 rows
  CANVAS_WIDTH: 400,
  CANVAS_HEIGHT: 420,

  // DENSE SPACING - key to fitting everything
  PEG_SPACING_X: 38,   // Tighter: 9 slots * 38 = 342px (fits in 400w)
  PEG_SPACING_Y: 36,   // Tighter: 8 rows * 36 = 288px for pegs
  PEG_RADIUS: 8,       // LARGER pegs - visible

  BALL_RADIUS: 10,     // Proportional to pegs

  DROP_ZONE_HEIGHT: 55,  // Compact bucket area
  BUCKET_WIDTH: 100,
  BUCKET_HEIGHT: 50,

  // Slots - readable
  SLOT_WIDTH: 38,        // Match peg spacing
  SLOT_HEIGHT: 32,
  SLOT_GAP: 2,
  SLOT_Y_OFFSET: 8,      // Small gap after pegs

  // Timing
  MS_PER_ROW: 80,        // Slightly faster for compact board
  BALL_STAGGER_MS: 120,
  DOOR_OPEN_DURATION_MS: 300,

  // Colors
  PEG_COLOR: 0xe8e8e8,
  BALL_COLOR: 0xffd700,
  WIN_COLOR: 0x22c55e,
  LOSE_COLOR: 0x6b7280,
  HIGHLIGHT_COLOR: 0xffd700,
  BUCKET_COLOR: 0x2a2a3e,
  BUCKET_BORDER_COLOR: 0x4a4a6e,
  TRAPDOOR_COLOR: 0x3a3a5e,
} as const;

// Layout math (8 rows):
// Bucket: 55px
// Pegs: 8 * 36 = 288px
// Gap + Slots: 8 + 32 = 40px
// Total height: 55 + 288 + 40 = 383px (fits in 420px with margin)
// Width: 9 slots * 38px = 342px centered in 400px

// Get center X position
export function getCenterX(): number {
  return LAYOUT.CANVAS_WIDTH / 2;  // 200
}

// Easing function for smooth animation
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Calculate ball X position based on path progress
export function calculateBallX(
  path: boolean[],
  currentRow: number,
  progress: number,
  centerX: number
): number {
  // Count rights up to current row
  const rightsToCurrentRow = path.slice(0, currentRow).filter((v) => v).length;
  const currentX = centerX + (rightsToCurrentRow - currentRow / 2) * LAYOUT.PEG_SPACING_X;

  if (currentRow >= path.length) {
    return currentX;
  }

  // Calculate next position
  const rightsToNextRow = path.slice(0, currentRow + 1).filter((v) => v).length;
  const nextX = centerX + (rightsToNextRow - (currentRow + 1) / 2) * LAYOUT.PEG_SPACING_X;

  // Interpolate with easing
  const easedProgress = easeInOutQuad(progress);
  return currentX + (nextX - currentX) * easedProgress;
}

// Calculate ball Y position
export function calculateBallY(currentRow: number, progress: number): number {
  const baseY = LAYOUT.DROP_ZONE_HEIGHT + currentRow * LAYOUT.PEG_SPACING_Y;
  return baseY + LAYOUT.PEG_SPACING_Y * easeInOutQuad(progress);
}
