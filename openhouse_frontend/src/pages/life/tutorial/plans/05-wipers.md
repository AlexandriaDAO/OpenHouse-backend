# Slide 5: Beware the Wipers

**Status:** Not Implemented

## Overview
Teaches players about the quadrant wiper mechanic - every 5 minutes, one quadrant gets completely wiped of all living cells.

## Core Concept
- The 512x512 grid is divided into 16 quadrants (128x128 each)
- Every 5 minutes, one quadrant is "wiped" - all cells die
- Quadrants rotate in order (0 → 1 → 2 → ... → 15 → 0)
- Territory remains, but living cells are killed
- Bases are NOT affected (walls protect interior)

## Visual Elements

### Canvas Layout (24x24 grid = scaled representation)
Divide canvas into 4 quadrants (6x6 each) to represent the 16 quadrants:
```
┌─────┬─────┬─────┬─────┐
│  0  │  1  │  2  │  3  │
├─────┼─────┼─────┼─────┤
│  4  │  5  │  6  │  7  │
├─────┼─────┼─────┼─────┤
│  8  │  9  │ 10  │ 11  │
├─────┼─────┼─────┼─────┤
│ 12  │ 13  │ 14  │ 15  │
└─────┴─────┴─────┴─────┘
```

For tutorial, simplify to 4 quadrants (2x2 layout):
```
┌───────────┬───────────┐
│     0     │     1     │
│           │   ████    │ ← Cells here
├───────────┼───────────┤
│   [BASE]  │     3     │
│     2     │           │
└───────────┴───────────┘
```

### Timer Display
- Show countdown: "Quadrant 1 wipes in: 0:05"
- Highlight the quadrant about to be wiped (red border or overlay)

### Wipe Animation
- Red sweep/flash across the quadrant
- Cells disappear
- Territory remains (faded color stays)

## Interaction Flow

1. **Initial State**
   - Grid divided into visible quadrants
   - Player base in one quadrant (safe zone demo)
   - Scattered player cells in another quadrant (danger zone)
   - Timer counting down: "Quadrant X wipes in: 5... 4... 3..."
   - Text: "Every 5 minutes, a quadrant gets wiped clean!"

2. **Countdown Phase**
   - Timer ticks down (accelerated for demo: 5 seconds instead of 5 minutes)
   - Target quadrant pulses red as warning
   - Text: "Get your cells out of the danger zone!"

3. **Wipe Event**
   - Flash animation across target quadrant
   - All cells in that quadrant die instantly
   - Cells in base (if any) survive (walls protect)
   - Text: "WIPE! All cells destroyed!"

4. **After Wipe**
   - Show the cleared quadrant (territory intact, cells gone)
   - Timer resets for next quadrant
   - Text: "Bases protect your cells. Plan around wipers!"
   - "Watch Again" button

## Technical Implementation

### Wiper Simulation
```typescript
// In simulation.ts
export const applyWiper = (
  cells: TutorialCell[][],
  quadrantX: number,  // 0 or 1 (for 2x2 layout)
  quadrantY: number,  // 0 or 1
  quadrantSize: number = 12  // Half of 24
): TutorialCell[][] => {
  const next = cells.map(row => row.map(cell => ({ ...cell })));

  const startX = quadrantX * quadrantSize;
  const startY = quadrantY * quadrantSize;

  for (let y = startY; y < startY + quadrantSize; y++) {
    for (let x = startX; x < startX + quadrantSize; x++) {
      // Kill cell but preserve territory
      next[y][x].alive = false;
      // Don't reset owner - territory persists
    }
  }

  return next;
};
```

### Timer Logic
```typescript
const [wiperCountdown, setWiperCountdown] = useState(5);
const [targetQuadrant, setTargetQuadrant] = useState(1);

useEffect(() => {
  if (!isAnimating) return;

  const timer = setInterval(() => {
    setWiperCountdown(prev => {
      if (prev <= 1) {
        // Trigger wipe
        triggerWipe(targetQuadrant);
        return 5; // Reset for next demo
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(timer);
}, [isAnimating, targetQuadrant]);
```

### Files to Modify
- `tutorial/simulation.ts` - add `applyWiper()` (already exists, may need adjustment)
- `tutorial/RiskTutorial.tsx` - add wiper-specific state and rendering
- `tutorial/slides/index.ts` - set `implemented: true`

## Visual Enhancements

### Quadrant Overlay
- Draw quadrant grid lines (thicker than cell grid)
- Number each quadrant in corner

### Warning Effects
- 3 seconds before: Yellow border pulse
- 2 seconds before: Orange border pulse
- 1 second before: Red border pulse + shake
- 0 seconds: WIPE flash

### Wipe Animation Sequence
1. Red overlay sweeps across quadrant (left to right or top to bottom)
2. Cells flash white then disappear
3. Brief "shockwave" effect
4. Quadrant returns to normal (just territory, no cells)

### Base Protection Demo
- Show cells inside base surviving the wipe
- Highlight with green glow: "Safe inside base!"

## Advanced Ideas

1. **Interactive Mode**
   - Let player try to move cells out before wipe
   - Place a glider, watch it escape (or not)

2. **Multiple Wipe Cycles**
   - Show 2-3 wipes in sequence
   - Different quadrants each time

3. **Strategy Tips**
   - "Don't build too far from your base"
   - "Use fast patterns to escape"
   - "Bases are safe havens"

## Success Criteria
- User understands wipers happen every 5 minutes
- User sees cells die but territory remain
- User learns bases provide protection
- User understands the rotation pattern
