# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-life-fullscreen"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-life-fullscreen`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```
4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/life"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(life): fullscreen grid with collapsible sidebar"
   git push -u origin feature/life-fullscreen-sidebar
   gh pr create --title "Life: Fullscreen grid with collapsible sidebar" --body "$(cat <<'EOF'
## Summary
- Grid now takes full screen height (except page header)
- Combined info + pattern selector in collapsible left sidebar (desktop)
- Bottom bar for mobile devices
- Sidebar state persisted to localStorage

## Test plan
- [ ] Visit /life route on desktop - sidebar should be visible on left
- [ ] Collapse sidebar - grid expands, state persists on refresh
- [ ] Test on mobile viewport - bottom bar should appear instead
- [ ] Verify zoom controls still work in top-right overlay
- [ ] Verify pattern selection and cell placement still work

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/life

Generated with Claude Code
EOF
)"
   ```
6. **Iterate autonomously** - Fix any P0 issues from review

## CRITICAL RULES
- NO questions ("should I?", "want me to?")
- NO skipping PR creation
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/life-fullscreen-sidebar`
**Worktree:** `/home/theseus/alexandria/openhouse-life-fullscreen`

---

# Implementation Plan: Life Fullscreen Grid with Collapsible Sidebar

## Goal
Redesign `/life` route so the grid takes full screen (except page header), with a collapsible left sidebar containing info + pattern selection on desktop, and a bottom bar on mobile.

## Current State

**File:** `openhouse_frontend/src/pages/Life.tsx` (606 lines)

Current layout structure:
```
div (h-[calc(100vh-120px)])           // Lines 462
├── Header row (mb-3)                  // Lines 464-501
├── Error display                      // Lines 503-508
├── Pattern selector (mb-3)            // Lines 510-570
└── Canvas container (flex-1)          // Lines 572-602
    ├── Zoom controls (top-right)
    ├── Info text (bottom-left)
    └── Canvas element
```

## Target State

```
div (h-[calc(100vh-80px)] flex)
├── Sidebar (w-72 when open, w-12 when collapsed) [desktop: hidden on mobile]
│   ├── Toggle button (chevron)
│   ├── Info section
│   │   ├── Title "Game of Life"
│   │   ├── Player status
│   │   ├── Generation counter
│   │   ├── Player count
│   │   └── Territory/cell stats
│   └── Pattern section
│       ├── Category filters
│       └── Pattern buttons
├── Canvas container (flex-1)
│   ├── Zoom controls (top-right overlay)
│   └── Canvas element
└── Bottom bar [mobile only: hidden on desktop]
    ├── Collapsed: Gen, players, expand button
    └── Expanded: Info + horizontal pattern scroller
```

## Implementation Steps

### Step 1: Add sidebar state management

Add at top of component (after existing state declarations around line 172):

```typescript
// PSEUDOCODE
// Sidebar collapsed state with localStorage persistence
const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
  // Check localStorage for saved preference
  const saved = localStorage.getItem('life-sidebar-collapsed');
  return saved === 'true';
});

// Mobile bottom bar expanded state
const [mobileExpanded, setMobileExpanded] = useState(false);

// Persist sidebar state
useEffect(() => {
  localStorage.setItem('life-sidebar-collapsed', String(sidebarCollapsed));
}, [sidebarCollapsed]);
```

### Step 2: Create Sidebar component (inline)

Add before the return statement (around line 439):

```typescript
// PSEUDOCODE
const Sidebar = () => (
  <div className={`
    hidden lg:flex flex-col
    ${sidebarCollapsed ? 'w-12' : 'w-72'}
    transition-all duration-300 ease-in-out
    bg-black border-r border-white/20
    overflow-hidden
  `}>
    {/* Toggle button */}
    <button
      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      className="p-3 hover:bg-white/10 flex items-center justify-center"
    >
      {sidebarCollapsed ? '>' : '<'} {/* Chevron icons */}
    </button>

    {/* Content - hidden when collapsed */}
    <div className={`${sidebarCollapsed ? 'hidden' : 'flex flex-col'} flex-1 overflow-y-auto p-3`}>
      {/* Info Section */}
      <div className="mb-4">
        <h1 className="text-lg font-bold text-white">Game of Life</h1>
        <p className="text-gray-500 text-xs">
          {/* Player status - same as current header */}
        </p>
        <div className="mt-2 text-sm font-mono">
          <div>Gen: {gameState?.generation.toString() || 0}</div>
          <div>Players: {gameState?.players.length || 0}/10</div>
        </div>
        {/* Territory and cell counts */}
        <div className="mt-2 space-y-1">
          {/* Map over territoryCounts and cellCounts */}
        </div>
      </div>

      {/* Pattern Section */}
      <div className="flex-1">
        <div className="text-xs text-gray-400 mb-2">Patterns</div>
        {/* Category filter buttons - vertical stack */}
        <div className="flex flex-col gap-1 mb-3">
          {/* All button + category buttons */}
        </div>
        {/* Pattern buttons - grid layout */}
        <div className="grid grid-cols-2 gap-1">
          {/* Pattern buttons */}
        </div>
        {/* Selected pattern info */}
        <div className="mt-3 pt-3 border-t border-white/10 text-xs">
          <div>{selectedPattern.name} ({parsedPattern.length} cells)</div>
          <div className="text-gray-500">{selectedPattern.description}</div>
          <div className="text-gray-400 mt-1">Click grid to place</div>
        </div>
      </div>
    </div>

    {/* Collapsed indicators - shown when collapsed */}
    <div className={`${sidebarCollapsed ? 'flex flex-col items-center py-4 gap-2' : 'hidden'}`}>
      <div className="text-xs text-gray-400">G</div>
      <div className="text-dfinity-turquoise text-xs">{gameState?.generation.toString() || 0}</div>
      <div className="text-xs text-gray-400 mt-2">P</div>
      <div className="text-white text-xs">{gameState?.players.length || 0}</div>
    </div>
  </div>
);
```

### Step 3: Create Mobile Bottom Bar component (inline)

```typescript
// PSEUDOCODE
const MobileBottomBar = () => (
  <div className="lg:hidden bg-black border-t border-white/20">
    {/* Collapsed view */}
    <div className="flex items-center justify-between p-2">
      <div className="flex items-center gap-4 text-xs font-mono">
        <span>Gen: {gameState?.generation.toString() || 0}</span>
        <span>{gameState?.players.length || 0}/10 players</span>
      </div>
      <button
        onClick={() => setMobileExpanded(!mobileExpanded)}
        className="p-2 text-gray-400"
      >
        {mobileExpanded ? 'v' : '^'}
      </button>
    </div>

    {/* Expanded view */}
    {mobileExpanded && (
      <div className="p-3 border-t border-white/10">
        {/* Territory/cell stats in row */}
        <div className="flex gap-4 mb-3 text-xs overflow-x-auto">
          {/* Stats */}
        </div>
        {/* Horizontal scrolling pattern selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {filteredPatterns.map(pattern => (
            <button key={pattern.name} /* pattern button styles */}>
              {pattern.name}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);
```

### Step 4: Update main return statement

Replace the entire return statement (lines 461-603) with:

```typescript
// PSEUDOCODE
return (
  <div className="flex flex-col h-[calc(100vh-80px)]">
    {/* Error display - keep at top */}
    {error && (
      <div className="p-2 bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
        {error}
      </div>
    )}

    {/* Main content area */}
    <div className="flex flex-1 min-h-0">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Canvas Container */}
      <div className="flex-1 flex flex-col relative bg-black">
        {/* Zoom controls - top right overlay */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-black/70 rounded-lg p-2">
          {/* Same zoom buttons as current */}
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 w-full h-full min-h-0">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ display: 'block' }}
          />
        </div>
      </div>
    </div>

    {/* Mobile Bottom Bar */}
    <MobileBottomBar />
  </div>
);
```

### Step 5: Update login screen height

Change line 442 from:
```typescript
<div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] gap-6">
```
to:
```typescript
<div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-6">
```

## Key Changes Summary

| Section | Before | After |
|---------|--------|-------|
| Outer height | `h-[calc(100vh-120px)]` | `h-[calc(100vh-80px)]` |
| Header row | Separate div at top | Moved into sidebar |
| Pattern selector | Full-width panel | Inside sidebar (desktop) / bottom bar (mobile) |
| Canvas | Takes remaining flex space | Same, but more space available |
| Info text overlay | Bottom-left of canvas | Removed (now in sidebar) |

## Responsive Breakpoints

- `lg` (1024px+): Sidebar visible, bottom bar hidden
- Below `lg`: Sidebar hidden, bottom bar visible

## Files Modified

- `openhouse_frontend/src/pages/Life.tsx` - All changes in single file

## Testing Notes

1. Desktop: Sidebar should appear on left, collapsible
2. Collapse state should persist across page refresh (localStorage)
3. Mobile: Bottom bar should appear, expandable
4. Zoom controls remain functional in top-right
5. Pattern selection and placement still work
6. Canvas should resize correctly when sidebar collapses/expands
