# Slide 2: Attack Enemy Territory

**Status:** Implemented (needs polish)

## Overview
Teaches players that touching enemy territory drains coins from the enemy's base.

## Visual Elements

### Canvas Layout (24x24 grid)
- **Player Base**: 8x8 base at position (2, 14) - bottom-left
  - Green territory overlay in interior
  - Pulsing hint on interior

- **Enemy Base**: 8x8 base at position (14, 2) - top-right
  - Red territory overlay (extended 2 cells around base)
  - Coin counter displayed in center of base (starts at 50)

### Colors
- `PLAYER_COLOR`: `#39FF14` (Neon Green)
- `ENEMY_COLOR`: `#FF3939` (Red)
- `PLAYER_TERRITORY_COLOR`: `rgba(57, 255, 20, 0.15)`
- `ENEMY_TERRITORY_COLOR`: `rgba(255, 57, 57, 0.15)`
- Coin counter: `#FFD700` (gold) normally, `#FF4444` when <= 10

### UI Above Canvas
- Left: "You: Base"
- Right: "Enemy: {coins} coins" (pulses red when low)

## Interaction Flow

1. **Initial State**
   - Both bases visible with their territories
   - Enemy coin counter shows "50"
   - Player's base interior pulses green
   - Text: "Click inside YOUR base (bottom-left) to attack!"

2. **User Clicks Inside Player Base**
   - Glider spawns moving up-left toward enemy
   - Pattern: `GLIDER_UP_LEFT` - `[1,2], [0,1], [2,0], [1,0], [0,0]`
   - 500ms pause, then animation starts

3. **Animation Running**
   - Glider moves diagonally toward enemy territory
   - When player cells touch enemy territory (red):
     - Enemy coins decrease by 1 per cell per generation
     - Territory converts from red to green
   - Text: "Your cells are draining enemy coins!"

4. **Victory Condition**
   - When enemy coins reach 0:
     - Animation stops
     - Text: "Enemy base destroyed! You win!" (bouncing animation)
   - "Try Again" button available

## Technical Details

### Files to Modify
- `tutorial/RiskTutorial.tsx` - already implemented
- `tutorial/simulation.ts` - uses `stepGenerationMultiplayer()`

### Key Logic
```typescript
// Callback when enemy territory touched
const handleEnemyTerritoryTouched = (enemyOwner: number) => {
  if (enemyOwner === ENEMY_ID) {
    setEnemyCoins(prev => Math.max(0, prev - 1));
  }
};

// In stepGenerationMultiplayer:
if (previousTerritory !== 0 && previousTerritory !== cellOwner) {
  onEnemyTerritoryTouched(previousTerritory);
}
```

## Polish Needed

1. **Visual Improvements**
   - Add coin drain animation (coins flying out of enemy base)
   - Flash effect when territory is captured
   - Maybe show damage numbers floating up

2. **Clarity Improvements**
   - Label bases with "YOU" and "ENEMY"
   - Add visual arrow showing attack direction
   - Highlight the moment of "contact" with enemy territory

3. **Audio (if applicable)**
   - Coin drain sound effect
   - Victory fanfare

## Success Criteria
- User understands attacking = touching enemy territory
- User sees coins drain in real-time
- User experiences the victory condition
- Clear distinction between player (green) and enemy (red)
