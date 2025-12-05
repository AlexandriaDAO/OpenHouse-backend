# Plinko Game - Development Constraints

## Canvas Architecture

The Plinko game uses a Pixi.js canvas with **fixed internal resolution** that scales via CSS.

### Fixed Values (Don't Change)
```
Internal Canvas: 400 x 420 pixels
Aspect Ratio: 400:420 (0.952)
```
All peg positions, ball physics, slots, and bucket are calculated from these values in `LayoutConfig.ts`.

### How Sizing Works
1. Pixi renders at 400x420 internal coordinates
2. Canvas element uses `width: 100%; height: 100%` to fill container
3. **Container's aspect ratio determines displayed size**

### Required Container Pattern
```tsx
<div style={{ aspectRatio: '400/420' }}>
  <PlinkoCanvas ... />
</div>
```

## Common Mistakes That Break Sizing

| Problem | Cause |
|---------|-------|
| Canvas is tiny/collapsed | Missing `aspectRatio` or parent flex has no height |
| Canvas is stretched | Wrong aspect ratio on container |
| Canvas overflows | Parent missing `overflow-hidden` |

## Safe vs Dangerous Changes

**Safe:**
- Side panel content/widths
- Padding/margins around game container
- Mobile layouts below canvas
- Colors, borders, styling
- Elements outside the canvas container

**Dangerous:**
- Removing `aspectRatio: '400/420'`
- Changing LayoutConfig.ts dimensions
- Adding height constraints that conflict with aspect ratio
- Wrapping canvas in new divs without preserving constraints
- Modifying parent flex properties

## Quick Sizing Debug

If canvas goes tiny, check in order:
1. Canvas container has `aspectRatio: '400/420'`?
2. Canvas container has width (`w-full`, `flex-1`)?
3. Parent flexboxes have `flex-1` or explicit heights?

## File Structure
```
pixi/
├── LayoutConfig.ts   # Dimensions, spacing, colors (source of truth)
├── PlinkoPixiApp.ts  # Main app, game phases, orchestration
├── PegRenderer.ts    # Peg grid rendering
├── SlotRenderer.ts   # Multiplier slots at bottom
├── BallRenderer.ts   # Ball physics and animation
└── BucketRenderer.ts # Drop bucket and door animation
```
