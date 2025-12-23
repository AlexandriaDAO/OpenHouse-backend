# Risk Tutorial Implementation Plans

This folder contains detailed implementation plans for each tutorial slide. Each plan can be worked on independently by a separate agent.

## Project Context

**Game:** Risk - A multiplayer Conway's Game of Life territory control game
**Location:** `/home/theseus/alexandria/openhouse/openhouse_frontend/src/pages/risk/tutorial/`
**Framework:** React + TypeScript + HTML5 Canvas

## Architecture Overview

```
tutorial/
├── index.ts              # Main exports
├── RiskTutorial.tsx      # Modal component (main file to modify)
├── types.ts              # Shared types and constants
├── simulation.ts         # Game of Life simulation logic
├── slides/
│   └── index.ts          # Slide definitions (set implemented: true when done)
└── plans/
    └── *.md              # These plan files
```

## Slides Overview

| # | File | Title | Status | Complexity |
|---|------|-------|--------|------------|
| 1 | `01-place-cells.md` | Place Cells in Your Base | Implemented (polish) | Low |
| 2 | `02-attack-territory.md` | Attack Enemy Territory | Implemented (polish) | Low |
| 3 | `03-territory-cutoff.md` | Protect Your Territory | Not Implemented | Medium |
| 4 | `04-attack-strategy.md` | Wall Siege Strategy | Not Implemented | Medium |
| 5 | `05-wipers.md` | Beware the Wipers | Not Implemented | High |
| 6 | `06-coins-economy.md` | The Coin Economy | Not Implemented | Medium |

## Implementation Guidelines

### For Each Slide

1. **Read the plan document** - Contains visual specs, interaction flow, and technical details

2. **Update `slides/index.ts`** - Set `implemented: true` for your slide

3. **Modify `RiskTutorial.tsx`** - Add slide-specific logic in the appropriate sections:
   - `SLIDE_CONFIGS` - Base positions and layout
   - `initializeSlide()` - Initial state setup
   - Canvas drawing logic
   - Click handling
   - Animation/simulation hooks

4. **Test the slide** - Run `npm run build` and test in browser

### Key Files Reference

**types.ts** - Contains:
- `TutorialCell` interface (alive, owner, territory)
- `BaseState` interface (x, y, owner, coins)
- `TUTORIAL_GRID_SIZE = 24`
- Color constants (PLAYER_COLOR, ENEMY_COLOR, etc.)
- Pattern definitions (GLIDER_DOWN_RIGHT, BLOCK_PATTERN, etc.)
- Utility functions (isWall, isInterior, createEmptyGrid)

**simulation.ts** - Contains:
- `stepGenerationSinglePlayer()` - Basic Game of Life
- `stepGenerationMultiplayer()` - With territory and coin drain callbacks
- `applyWiper()` - Kill cells in a region

**RiskTutorial.tsx** - Main component:
- Manages slide state and transitions
- Renders canvas with cells, territory, bases
- Handles user interaction (clicks)
- Runs animation loops

### Common Patterns

**Adding a new visual element:**
```typescript
// In the canvas drawing useEffect
if (currentSlideData?.id === 'your-slide-id') {
  // Draw your custom elements
  ctx.fillStyle = '#FF0000';
  ctx.fillRect(x, y, width, height);
}
```

**Adding slide-specific state:**
```typescript
// In RiskTutorial component
const [customState, setCustomState] = useState(initialValue);

// Reset in initializeSlide()
if (slideIndex === YOUR_SLIDE_INDEX) {
  setCustomState(initialValue);
}
```

**Adding slide-specific interaction:**
```typescript
// In handleCanvasClick
if (currentSlideData?.id === 'your-slide-id') {
  // Custom click handling
}
```

## Build & Test

```bash
cd /home/theseus/alexandria/openhouse/openhouse_frontend
npm run build

# Then test at the deployed URL or local dev server
```

## Questions?

Refer to the main game implementation at:
- `src/pages/Risk.tsx` - Full game implementation
- `src/pages/riskConstants.ts` - Game constants

The tutorial should teach concepts from the real game in a simplified, interactive way.
