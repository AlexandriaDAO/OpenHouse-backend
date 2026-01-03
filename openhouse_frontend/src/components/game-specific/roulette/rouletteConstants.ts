// European roulette wheel - numbers in clockwise order starting from 0
export const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

export const SEGMENTS = WHEEL_NUMBERS.length; // 37
export const SEGMENT_ANGLE = 360 / SEGMENTS;  // ~9.73 degrees

// Animation timing and speeds
export const ANIMATION = {
  BALL_SPEED: 720,        // degrees/sec during fast spin
  WHEEL_SPEED: 120,       // degrees/sec during fast spin
  LANDING_DURATION: 3500, // ms for ball to settle
  WHEEL_DRIFT: 40,        // degrees wheel drifts during landing
  EXTRA_SPINS: 3,         // full rotations during landing for drama
} as const;

// SVG dimensions (viewBox is 400x400, center at 200,200)
export const DIMENSIONS = {
  VIEW_SIZE: 400,
  CENTER: 200,
  OUTER_RADIUS: 190,
  POCKET_OUTER: 170,
  POCKET_INNER: 125,
  BALL_TRACK: 150,
  BALL_TRACK_INNER: 135,
  INNER_CONE: 110,
  CENTER_HUB: 70,
  BALL_RADIUS: 7,
} as const;

// Colors
export const COLORS = {
  GREEN: '#0D7D3D',
  RED: '#C41E3A',
  BLACK: '#1A1A1A',
  GOLD: '#D4AF37',
  GOLD_DARK: '#8B7355',
  BALL: '#FFFFFF',
  BALL_SHADOW: 'rgba(0,0,0,0.4)',
  FRET: '#C9A227',
  WINNER_HIGHLIGHT: '#FACC15',
} as const;

// Helper to get pocket color
export const getPocketColor = (num: number): string => {
  if (num === 0) return COLORS.GREEN;
  return RED_NUMBERS.has(num) ? COLORS.RED : COLORS.BLACK;
};

// Helper to check if number is red
export const isRed = (num: number): boolean => RED_NUMBERS.has(num);

// Get angle for a specific number on the wheel
export const getNumberAngle = (num: number): number => {
  const index = WHEEL_NUMBERS.indexOf(num);
  return index * SEGMENT_ANGLE;
};
