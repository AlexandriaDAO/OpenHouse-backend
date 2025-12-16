# Frontend Migration Plan: Quadrant-Based Navigation

## Overview

Replace the current zoom/pan system with a simpler quadrant-based navigation approach. The 512×512 grid is divided into 16 quadrants of 128×128 cells each. Users navigate between quadrants discretely rather than continuously zooming/panning.

**File to modify:** `openhouse_frontend/src/pages/Life.tsx`

---

## Design Specifications

### Grid Structure
```
512×512 total grid = 16 quadrants (4×4)
Each quadrant = 128×128 cells = 16,384 cells

┌─────┬─────┬─────┬─────┐
│ Q0  │ Q1  │ Q2  │ Q3  │  Row 0: y = 0-127
├─────┼─────┼─────┼─────┤
│ Q4  │ Q5  │ Q6  │ Q7  │  Row 1: y = 128-255
├─────┼─────┼─────┼─────┤
│ Q8  │ Q9  │ Q10 │ Q11 │  Row 2: y = 256-383
├─────┼─────┼─────┼─────┤
│ Q12 │ Q13 │ Q14 │ Q15 │  Row 3: y = 384-511
└─────┴─────┴─────┴─────┘
  x=    x=    x=    x=
 0-127 128-  256-  384-
       255   383   511
```

### View Modes

| Mode | Grid Size | Interactive | Purpose |
|------|-----------|-------------|---------|
| **Overview** | 512×512 | Click only | See entire world, jump to quadrant |
| **Quadrant** | 128×128 | Full | Main gameplay - place cells, watch patterns |

### Key Behaviors

1. **Pattern placement wraps** - A Gosper Gun placed near quadrant edge wraps toroidally into adjacent quadrants
2. **Overview shows actual cells** - Tiny 1px cells, see real activity across entire grid
3. **Mobile navigation** - Both swipe gestures AND button controls

---

## Phase 1: Update Constants & Remove Zoom/Pan

### 1.1 Replace Grid Constants

**Remove:**
```typescript
const GRID_WIDTH = 800;
const GRID_HEIGHT = 800;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
```

**Add:**
```typescript
// Grid dimensions
const GRID_SIZE = 512;
const QUADRANT_SIZE = 128;
const QUADRANTS_PER_ROW = 4;
const TOTAL_QUADRANTS = 16;

// View modes
type ViewMode = 'overview' | 'quadrant';
```

### 1.2 Replace View State

**Remove:**
```typescript
const [zoom, setZoom] = useState(0.5);
const [offset, setOffset] = useState({ x: 0, y: 0 });
```

**Add:**
```typescript
const [viewMode, setViewMode] = useState<ViewMode>('overview');
const [viewX, setViewX] = useState(0);     // 0, 128, 256, or 384
const [viewY, setViewY] = useState(0);     // 0, 128, 256, or 384

// Derived: current quadrant number (0-15)
const currentQuadrant = (viewY / QUADRANT_SIZE) * QUADRANTS_PER_ROW + (viewX / QUADRANT_SIZE);
```

### 1.3 Remove Pan Handling

**Delete entirely:**
- `isPanning` state
- `lastPanPoint` ref
- Pan-related mouse event handlers (shift+drag logic)
- `handleWheel` zoom logic

---

## Phase 2: Implement Quadrant Navigation

### 2.1 Navigation Functions

```typescript
// Navigate to adjacent quadrant
const navigateQuadrant = (direction: 'up' | 'down' | 'left' | 'right') => {
  const step = QUADRANT_SIZE;
  const maxPos = GRID_SIZE - QUADRANT_SIZE; // 384

  switch (direction) {
    case 'up':
      setViewY(y => y === 0 ? maxPos : y - step); // Wrap around
      break;
    case 'down':
      setViewY(y => y === maxPos ? 0 : y + step);
      break;
    case 'left':
      setViewX(x => x === 0 ? maxPos : x - step);
      break;
    case 'right':
      setViewX(x => x === maxPos ? 0 : x + step);
      break;
  }
};

// Jump to specific quadrant (0-15)
const jumpToQuadrant = (quadrant: number) => {
  const qRow = Math.floor(quadrant / QUADRANTS_PER_ROW);
  const qCol = quadrant % QUADRANTS_PER_ROW;
  setViewX(qCol * QUADRANT_SIZE);
  setViewY(qRow * QUADRANT_SIZE);
  setViewMode('quadrant');
};

// Toggle between overview and quadrant view
const toggleViewMode = () => {
  setViewMode(mode => mode === 'overview' ? 'quadrant' : 'overview');
};
```

### 2.2 Keyboard Navigation

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't capture if typing in input
    if (e.target instanceof HTMLInputElement) return;

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        if (viewMode === 'quadrant') navigateQuadrant('up');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        if (viewMode === 'quadrant') navigateQuadrant('down');
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        if (viewMode === 'quadrant') navigateQuadrant('left');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        if (viewMode === 'quadrant') navigateQuadrant('right');
        break;
      case ' ':  // Space to toggle view mode
      case 'Tab':
        e.preventDefault();
        toggleViewMode();
        break;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [viewMode]);
```

### 2.3 Touch/Swipe Navigation (Mobile)

```typescript
const touchStartRef = useRef<{ x: number; y: number } | null>(null);
const SWIPE_THRESHOLD = 50; // pixels

const handleTouchStart = (e: React.TouchEvent) => {
  const touch = e.touches[0];
  touchStartRef.current = { x: touch.clientX, y: touch.clientY };
};

const handleTouchEnd = (e: React.TouchEvent) => {
  if (!touchStartRef.current || viewMode !== 'quadrant') return;

  const touch = e.changedTouches[0];
  const deltaX = touch.clientX - touchStartRef.current.x;
  const deltaY = touch.clientY - touchStartRef.current.y;

  // Determine swipe direction (if significant)
  if (Math.abs(deltaX) > SWIPE_THRESHOLD || Math.abs(deltaY) > SWIPE_THRESHOLD) {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe - swipe left means go right (reveal content to the right)
      navigateQuadrant(deltaX < 0 ? 'right' : 'left');
    } else {
      // Vertical swipe - swipe up means go down
      navigateQuadrant(deltaY < 0 ? 'down' : 'up');
    }
  }

  touchStartRef.current = null;
};
```

---

## Phase 3: Simplified Rendering

### 3.1 Calculate Cell Size Dynamically

```typescript
const draw = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const canvasSize = canvas.width; // Assume square canvas

  if (viewMode === 'overview') {
    // Overview: show all 512×512, each cell is tiny
    const cellSize = canvasSize / GRID_SIZE;
    drawCells(ctx, 0, 0, GRID_SIZE, GRID_SIZE, cellSize);
    drawQuadrantGrid(ctx, cellSize);
  } else {
    // Quadrant: show 128×128, cells are larger
    const cellSize = canvasSize / QUADRANT_SIZE;
    drawCells(ctx, viewX, viewY, QUADRANT_SIZE, QUADRANT_SIZE, cellSize);
    drawGridLines(ctx, cellSize); // Optional: show cell grid at this zoom
  }
}, [viewMode, viewX, viewY, cells]);
```

### 3.2 Draw Cells (Simplified)

```typescript
const drawCells = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  width: number,
  height: number,
  cellSize: number
) => {
  // Clear canvas
  ctx.fillStyle = DEAD_COLOR;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Draw living cells
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const gridRow = startY + row;
      const gridCol = startX + col;
      const idx = gridRow * GRID_SIZE + gridCol;
      const cell = cells[idx];

      if (cell && cell.owner > 0) {
        ctx.fillStyle = PLAYER_COLORS[cell.owner] || '#FFFFFF';
        ctx.fillRect(
          col * cellSize,
          row * cellSize,
          cellSize - (cellSize > 2 ? 1 : 0), // Gap only if cells large enough
          cellSize - (cellSize > 2 ? 1 : 0)
        );
      }
    }
  }
};
```

### 3.3 Draw Quadrant Grid (Overview Mode)

```typescript
const drawQuadrantGrid = (ctx: CanvasRenderingContext2D, cellSize: number) => {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;

  // Draw 4×4 quadrant grid lines
  for (let i = 1; i < QUADRANTS_PER_ROW; i++) {
    const pos = i * QUADRANT_SIZE * cellSize;

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, GRID_SIZE * cellSize);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(GRID_SIZE * cellSize, pos);
    ctx.stroke();
  }
};
```

---

## Phase 4: Click Handling (Simplified)

### 4.1 Canvas Click to Grid Coordinates

```typescript
const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  if (viewMode === 'overview') {
    // Click in overview = jump to that quadrant
    const cellSize = canvas.width / GRID_SIZE;
    const gridCol = Math.floor(canvasX / cellSize);
    const gridRow = Math.floor(canvasY / cellSize);
    const quadrant = Math.floor(gridRow / QUADRANT_SIZE) * QUADRANTS_PER_ROW
                   + Math.floor(gridCol / QUADRANT_SIZE);
    jumpToQuadrant(quadrant);
  } else {
    // Click in quadrant = place cell/pattern
    const cellSize = canvas.width / QUADRANT_SIZE;
    const localCol = Math.floor(canvasX / cellSize);
    const localRow = Math.floor(canvasY / cellSize);
    const gridCol = viewX + localCol;
    const gridRow = viewY + localRow;

    placeAtPosition(gridRow, gridCol);
  }
};
```

### 4.2 Pattern Placement (Wraps Across Boundaries)

```typescript
const placePattern = (centerRow: number, centerCol: number, pattern: [number, number][]) => {
  const cellsToPlace: [number, number][] = pattern.map(([dy, dx]) => {
    // Toroidal wrapping - pattern wraps across quadrant/grid boundaries
    const row = (centerRow + dy + GRID_SIZE) % GRID_SIZE;
    const col = (centerCol + dx + GRID_SIZE) % GRID_SIZE;
    return [row, col];
  });

  // Send to backend (existing place_cells logic)
  placeMultipleCells(cellsToPlace);
};
```

---

## Phase 5: Minimap Component

### 5.1 Minimap in Sidebar

```typescript
const Minimap: React.FC<{
  cells: Cell[];
  currentQuadrant: number;
  onQuadrantClick: (quadrant: number) => void;
}> = ({ cells, currentQuadrant, onQuadrantClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const quadSize = size / QUADRANTS_PER_ROW;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    // Draw cell density per quadrant (heatmap)
    for (let q = 0; q < TOTAL_QUADRANTS; q++) {
      const qRow = Math.floor(q / QUADRANTS_PER_ROW);
      const qCol = q % QUADRANTS_PER_ROW;
      const density = calculateQuadrantDensity(cells, q);

      // Color based on density
      const alpha = Math.min(0.8, density * 2);
      ctx.fillStyle = `rgba(57, 255, 20, ${alpha})`;
      ctx.fillRect(qCol * quadSize + 1, qRow * quadSize + 1, quadSize - 2, quadSize - 2);
    }

    // Highlight current quadrant
    const curRow = Math.floor(currentQuadrant / QUADRANTS_PER_ROW);
    const curCol = currentQuadrant % QUADRANTS_PER_ROW;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.strokeRect(curCol * quadSize, curRow * quadSize, quadSize, quadSize);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= QUADRANTS_PER_ROW; i++) {
      const pos = i * quadSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }
  }, [cells, currentQuadrant]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const quadSize = canvas.width / QUADRANTS_PER_ROW;

    const qCol = Math.floor(x / quadSize);
    const qRow = Math.floor(y / quadSize);
    const quadrant = qRow * QUADRANTS_PER_ROW + qCol;

    onQuadrantClick(quadrant);
  };

  return (
    <div className="minimap-container">
      <div className="text-xs text-gray-400 mb-1">World Map</div>
      <canvas
        ref={canvasRef}
        width={120}
        height={120}
        className="cursor-pointer border border-gray-700 rounded"
        onClick={handleClick}
      />
      <div className="text-xs text-gray-500 mt-1">
        Q{currentQuadrant} ({viewX}, {viewY})
      </div>
    </div>
  );
};

const calculateQuadrantDensity = (cells: Cell[], quadrant: number): number => {
  const qRow = Math.floor(quadrant / QUADRANTS_PER_ROW);
  const qCol = quadrant % QUADRANTS_PER_ROW;
  const startY = qRow * QUADRANT_SIZE;
  const startX = qCol * QUADRANT_SIZE;

  let livingCells = 0;
  for (let row = startY; row < startY + QUADRANT_SIZE; row++) {
    for (let col = startX; col < startX + QUADRANT_SIZE; col++) {
      const cell = cells[row * GRID_SIZE + col];
      if (cell && cell.owner > 0) livingCells++;
    }
  }

  return livingCells / (QUADRANT_SIZE * QUADRANT_SIZE);
};
```

---

## Phase 6: Navigation Controls in Sidebar

### 6.1 Navigation Buttons

```typescript
const NavigationControls: React.FC<{
  viewMode: ViewMode;
  onNavigate: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onToggleView: () => void;
}> = ({ viewMode, onNavigate, onToggleView }) => (
  <div className="navigation-controls">
    <button
      onClick={onToggleView}
      className="w-full mb-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
    >
      {viewMode === 'overview' ? '🔍 Enter Quadrant' : '🗺️ View Overview'}
    </button>

    {viewMode === 'quadrant' && (
      <div className="grid grid-cols-3 gap-1">
        <div />
        <button onClick={() => onNavigate('up')} className="nav-btn">↑</button>
        <div />
        <button onClick={() => onNavigate('left')} className="nav-btn">←</button>
        <div className="nav-btn bg-gray-800">•</div>
        <button onClick={() => onNavigate('right')} className="nav-btn">→</button>
        <div />
        <button onClick={() => onNavigate('down')} className="nav-btn">↓</button>
        <div />
      </div>
    )}

    <div className="text-xs text-gray-500 mt-2">
      {viewMode === 'quadrant'
        ? 'Arrow keys or WASD to navigate'
        : 'Click a quadrant to enter'}
    </div>
  </div>
);
```

---

## Code to Delete

Remove these elements entirely:

1. **Zoom state & controls:**
   - `const [zoom, setZoom] = useState(0.5);`
   - Zoom slider JSX
   - `handleWheel` zoom handler

2. **Pan state & handling:**
   - `const [offset, setOffset] = useState({ x: 0, y: 0 });`
   - `isPanning`, `lastPanPoint` refs
   - Shift+drag mouse handlers

3. **Viewport calculations:**
   - All `* zoom` and `/ zoom` math in draw()
   - Offset calculations in coordinate transforms
   - `MIN_ZOOM`, `MAX_ZOOM`, `ZOOM_STEP` constants

4. **Old grid constants:**
   - `GRID_WIDTH = 800`
   - `GRID_HEIGHT = 800`

---

## Sidebar Layout

```
┌─────────────────────────┐
│      MINIMAP            │  ← World Map (120×120)
│   ┌──┬──┬──┬──┐        │
│   │  │  │▓▓│  │        │
│   ├──┼──┼──┼──┤        │
│   │  │  │  │  │        │
│   └──┴──┴──┴──┘        │
│   Q2 (256, 0)          │
├─────────────────────────┤
│   [🗺️ View Overview]    │  ← Toggle view mode
│                         │
│      ↑                  │
│    ← • →                │  ← D-pad navigation
│      ↓                  │
│                         │
│   Arrow keys to move    │
├─────────────────────────┤
│   PATTERN SELECT        │  ← Existing pattern picker
│   • Single Cell         │
│   • Glider              │
│   • Gosper Gun          │
│   • ...                 │
├─────────────────────────┤
│   PLAYER INFO           │  ← Existing player stats
│   Color: 🟢             │
│   Cells: 42             │
└─────────────────────────┘
```

---

## Testing Checklist

After implementation:

- [ ] Overview shows full 512×512 grid with actual cells
- [ ] Click on overview jumps to correct quadrant
- [ ] Quadrant view shows 128×128 cells correctly
- [ ] Arrow keys navigate between quadrants
- [ ] WASD keys navigate between quadrants
- [ ] Navigation wraps at grid edges (right from Q3 → Q0)
- [ ] Swipe gestures work on mobile
- [ ] Navigation buttons work
- [ ] Minimap shows current position
- [ ] Minimap click jumps to quadrant
- [ ] Cell placement works in quadrant view
- [ ] Patterns wrap across quadrant boundaries (toroidal)
- [ ] Space/Tab toggles view mode
- [ ] Canvas resizes correctly on different screens

---

## Performance Notes

| Metric | Old (800×800 + zoom) | New (512×512 + quadrants) |
|--------|----------------------|---------------------------|
| Cells rendered (quadrant) | Variable (zoom-dependent) | 16,384 (fixed) |
| Cells rendered (overview) | N/A | 262,144 (tiny, fast) |
| Coordinate math | Complex viewport transforms | Simple offset addition |
| Event handling | Zoom + pan + click | Click + swipe only |
| Code complexity | ~300 lines for view | ~100 lines for view |

---

## Future Enhancements (Not in Initial Scope)

1. **Responsive view sizes** - Desktop shows 256×128 (2 quadrants)
2. **Mobile detail mode** - Drill into 64×64 or 32×32
3. **Smooth transitions** - Animate between quadrants
4. **Quadrant labels** - Show Q0-Q15 labels in overview
5. **Activity indicators** - Pulse effect on quadrants with active patterns
