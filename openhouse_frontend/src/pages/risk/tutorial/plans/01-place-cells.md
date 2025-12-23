# Slide 1: Place Cells in Your Base

**Status:** Implemented (needs polish)

## Overview
This is the introductory slide teaching players how to place their first cells inside their base.

## Visual Elements

### Canvas Layout (24x24 grid)
- **Player Base**: 8x8 base centered at position (8, 8)
  - Gray walls forming the perimeter
  - Interior (6x6) shown with faded green territory overlay
  - Pulsing green highlight on interior to indicate clickable area

### Colors
- `PLAYER_COLOR`: `#39FF14` (Neon Green) - living cells
- `PLAYER_TERRITORY_COLOR`: `rgba(57, 255, 20, 0.15)` - territory overlay
- `BASE_WALL_COLOR`: `#4A4A4A` - fortress walls
- Background: `#0a0a0a`

## Interaction Flow

1. **Initial State**
   - Base is displayed with walls
   - Interior pulses green to attract attention
   - Text: "Click inside the base to spawn a Glider"

2. **User Clicks Inside Base**
   - Glider pattern (5 cells) spawns at click position
   - Pattern: `[1,0], [2,1], [0,2], [1,2], [2,2]` (moves down-right)
   - Pulsing stops
   - 500ms pause before animation starts

3. **Animation Running**
   - Conway's Game of Life simulation runs at 5 gen/sec (200ms intervals)
   - Glider moves diagonally down-right
   - Territory expands as cells touch new ground
   - Text: "Watch the glider claim territory as it moves!"

4. **Reset Available**
   - "Try Again" button appears after placement
   - Clicking resets to initial state

## Technical Details

### Files to Modify
- `tutorial/RiskTutorial.tsx` - main component (already implemented)
- `tutorial/simulation.ts` - uses `stepGenerationSinglePlayer()`

### Key Functions
```typescript
// Glider pattern
const GLIDER_DOWN_RIGHT: [number, number][] = [
  [1, 0], [2, 1], [0, 2], [1, 2], [2, 2]
];

// Check if click is in base interior
isInterior(cellX, cellY, baseX, baseY)
```

## Polish Needed

1. **Visual Improvements**
   - Add a small label or icon on the base to make it clearer it's "your base"
   - Consider adding a brief "spawn" animation when glider appears

2. **Educational Enhancements**
   - Maybe show cell count increasing as territory expands
   - Add arrow or visual indicator showing glider's movement direction

## Success Criteria
- User understands they must click inside the base to place cells
- User sees territory (faded green) expand as glider moves
- Animation is smooth and clear
