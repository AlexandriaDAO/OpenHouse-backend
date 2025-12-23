# Slide 4: Winning Strategy - Wall Siege

**Status:** Not Implemented

## Overview
Teaches players the optimal attack strategy: placing a stable "block" pattern adjacent to enemy walls to continuously drain their coins without the cells dying.

## Core Concept
- A **Block** (2x2 still life) is stable - it never dies
- When placed adjacent to enemy walls, it continuously touches enemy territory
- Each generation, it drains coins from the enemy base
- This is the most efficient attack: zero maintenance, constant damage

## Visual Elements

### Canvas Layout (24x24 grid)
- **Player Base**: 8x8 at position (2, 14) - bottom-left
- **Enemy Base**: 8x8 at position (14, 2) - top-right
  - Coin counter in center (starts at 30 for faster demo)
  - Extended red territory around base

### The Block Pattern
```
██
██
```
Pattern: `[[0,0], [1,0], [0,1], [1,1]]`

### Ideal Placement Position
Adjacent to enemy wall (touching the territory just outside the wall):
```
        Enemy Base
    ┌────────────┐
    │            │
    │     30     │  ← Coins draining
    │            │
    └────────────┘
  ██ ← Block here (touching wall/territory)
  ██
```

## Interaction Flow

1. **Initial State**
   - Both bases visible
   - Text: "Place a Block next to enemy walls for constant damage!"
   - Hint: Pulse near the ideal placement spot (adjacent to enemy base)
   - Show block pattern preview where cursor hovers

2. **User Clicks to Place Block**
   - Block pattern spawns at click position
   - Must be:
     - On player territory OR neutral ground touching enemy territory
     - Adjacent to enemy walls/territory for the drain effect

3. **Animation Running**
   - Block sits stationary (it's a still life - doesn't move)
   - Each generation, enemy coins drain
   - Text: "The block is stable and drains coins forever!"
   - Show coin counter rapidly decreasing

4. **Victory**
   - When coins hit 0: "Enemy destroyed! Blocks are deadly siege weapons!"

## Technical Implementation

### Pattern Definition (already exists)
```typescript
// In types.ts
export const BLOCK_PATTERN: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [1, 1]
];
```

### Placement Logic
```typescript
// On click, place block instead of glider
const pattern = BLOCK_PATTERN;
for (const [dx, dy] of pattern) {
  next[cellY + dy][cellX + dx] = {
    alive: true,
    owner: PLAYER_ID,
    territory: PLAYER_ID
  };
}
```

### Drain Logic
The existing `stepGenerationMultiplayer` already handles territory touching.
Block cells are stable (2x2 has each cell with exactly 3 neighbors = survives).

### Files to Modify
- `tutorial/RiskTutorial.tsx`:
  - Add slide-specific pattern selection (block vs glider)
  - Adjust placement hint location (near enemy base)
- `tutorial/slides/index.ts` - set `implemented: true`

## Visual Enhancements

### Pattern Preview
- Show ghost/preview of block pattern following cursor
- Green when valid placement, red when invalid

### Placement Hint
- Instead of pulsing player base, pulse the area near enemy walls
- Draw arrow or highlight showing "place here"

### Coin Drain Effect
- Emphasize the steady drain with:
  - Coin particles flying from enemy base
  - Pulsing red on enemy base
  - Rapid counter decrease animation

### Comparison Note
- Maybe add text: "Gliders move away. Blocks stay and siege!"

## Advanced Polish Ideas

1. **Show Both Strategies**
   - Split screen or sequence: glider vs block
   - Glider: drains some, then moves away
   - Block: drains continuously

2. **Efficiency Counter**
   - Show "Damage per second" or "Coins drained"
   - Block shows consistent drain rate

3. **Multiple Blocks**
   - Allow placing 2-3 blocks to speed up demonstration
   - Show multiplicative effect

## Success Criteria
- User understands blocks are stable (don't die)
- User sees continuous coin drain without cell death
- User learns this is the optimal siege strategy
- User can replicate this in the real game
