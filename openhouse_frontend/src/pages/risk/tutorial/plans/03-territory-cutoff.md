# Slide 3: Protect Your Territory (Territory Cutoff)

**Status:** Not Implemented

## Overview
Teaches players that territory disconnected from their base is lost. This is a critical defensive concept.

## Core Concept
In Risk, territory must maintain a connection to your base. If enemy cells cut through your territory, severing the connection, the disconnected portion is lost (reverts to neutral).

## Visual Elements

### Canvas Layout (24x24 grid)
- **Player Base**: 8x8 base at position (8, 14) - bottom center
- **Player Territory**: Extended corridor going upward from base
  - Shape like an "I" or elongated strip reaching toward top
  - Make it visually clear this is connected territory

- **Enemy Cells** (pre-placed, not from a base):
  - A horizontal line of enemy cells positioned to cut through the corridor
  - OR an enemy glider that will pass through and sever the connection

### Suggested Layout
```
    [Enemy cells moving right →]
         ████████
            ↓ (will cut here)
    ┌─────────────┐
    │  Territory  │  ← This part will be lost
    │             │
    ├─────────────┤  ← Cut point
    │  Territory  │
    │             │
    │   [BASE]    │  ← This stays connected
    └─────────────┘
```

### Colors
- Territory before cut: Green overlay
- Territory after cut (disconnected): Fades to neutral (no overlay)
- Enemy cells: Red
- Visual "severing" effect: Brief flash or fade animation

## Interaction Flow

1. **Initial State**
   - Show player base with extended territory corridor
   - Show enemy cells positioned to cut through
   - Text: "Territory disconnected from your base is lost!"
   - Automatic animation OR click to start

2. **Animation Sequence** (could be automatic)
   - Enemy cells move/activate
   - They pass through the narrow part of the corridor
   - The connection is severed
   - Upper portion of territory fades away (lost)

3. **After Cut**
   - Show the reduced territory (only base-connected portion remains)
   - Text: "Keep your cells connected to protect territory!"
   - "Try Again" or "Watch Again" button

## Technical Implementation

### New Logic Needed
The current simulation doesn't implement territory cutoff. Options:

**Option A: Simulate cutoff in tutorial only**
```typescript
// After each generation, check territory connectivity
const checkTerritoryConnectivity = (
  cells: TutorialCell[][],
  baseX: number,
  baseY: number,
  playerId: number
): TutorialCell[][] => {
  // BFS/flood fill from base interior
  // Mark all connected territory
  // Any territory not reached = disconnected = reset to neutral
};
```

**Option B: Pre-scripted animation**
- Don't actually simulate cutoff logic
- Pre-script the sequence: enemy moves, territory fades at specific frames
- Simpler but less interactive

### Recommended: Option A (simulated)
More educational and allows user to experiment with "Try Again"

### Files to Modify
- `tutorial/simulation.ts` - add `checkTerritoryConnectivity()`
- `tutorial/RiskTutorial.tsx` - add slide-specific logic
- `tutorial/slides/index.ts` - set `implemented: true`

## Animation Details

### Territory Loss Animation
When disconnected territory is detected:
1. Flash the disconnected area briefly (white or red tint)
2. Fade the territory overlay from green to transparent over 500ms
3. Cells in that area could optionally die or change to neutral color

### Timing
- Enemy movement: 200ms per generation (5 gen/sec)
- Cut detection: Check after each generation
- Fade animation: 500ms

## Polish Ideas

1. **Before/After Comparison**
   - Show territory count before and after cut
   - "Territory: 45 → 28 (-17 lost!)"

2. **Warning Indicator**
   - When territory is about to be cut, show warning
   - Highlight the "weak point" in the connection

3. **Interactive Mode**
   - Let user place cells to try to prevent the cut
   - Advanced: Let user experience both success and failure

## Success Criteria
- User understands territory must stay connected to base
- User sees the visual consequence of territory being cut off
- User learns to think about defensive positioning
