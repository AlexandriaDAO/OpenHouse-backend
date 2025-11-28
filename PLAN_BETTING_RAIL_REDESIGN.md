# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-betting-rail-redesign"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-betting-rail-redesign`
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
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice"
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(betting-rail): Hybrid redesign - clean dark + chips"
   git push -u origin feature/betting-rail-hybrid-redesign
   gh pr create --title "Refactor: Betting Rail Hybrid Redesign" --body "Implements PLAN_BETTING_RAIL_REDESIGN.md

   ## Summary
   - Removes skeuomorphic felt/curve elements
   - Adopts Stake.com-inspired clean dark interface
   - Keeps chip visuals as OpenHouse's unique differentiator
   - Reduces CSS from 294 lines to ~100 lines

   ## Changes
   - BettingRail.css: Major simplification
   - BettingRail.tsx: Remove curve, update classes
   - InteractiveChipStack.tsx: Simplify hover states

   Deployed to mainnet:
   - Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```
6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/betting-rail-hybrid-redesign`
**Worktree:** `/home/theseus/alexandria/openhouse-betting-rail-redesign`

---

# Implementation Plan: Betting Rail Hybrid Redesign

## Task Classification
**REFACTORING** - Improve existing code with subtractive approach (target: negative LOC)

## Goal
Transform the betting rail from heavy skeuomorphic (felt texture, curved lip) to a **clean dark interface with selective casino touches** (chips remain, felt goes), inspired by Stake.com's dice interface.

## Design Direction

**Remove:**
- Felt texture (SVG noise overlay, complex gradients)
- Curved "table lip" element (`.betting-rail-curve`)
- Gold accent lines and pseudo-element decorations
- Heavy box-shadows simulating table depth
- Complex 3D hover transforms

**Keep:**
- Chip visuals as interactive betting elements (unique to OpenHouse)
- Chip stacking metaphor (differentiator from Stake's manual input)
- Click-to-add, click-to-remove chip interaction
- Essential animations (chip add/remove feedback)

**Adopt from Stake.com:**
- Clean dark background (`#1a1d21` or similar)
- Minimal, flat design with subtle borders
- Clear typography hierarchy
- Focused accent color (green for wins/actions)
- Simple hover states (scale only, no 3D effects)

---

## Current State

### File: `openhouse_frontend/src/components/game-ui/BettingRail.css` (294 lines)

**Lines 6-58**: `.betting-rail-curve` - Curved table lip with pseudo-elements
```css
// CURRENT - DELETE ENTIRELY
.betting-rail-curve {
  height: 28px;
  background: linear-gradient(...);
  border-top-left-radius: 50% 100%;
  // ... pseudo-elements for gold accents
}
```

**Lines 61-83**: `.betting-rail` - Main felt surface
```css
// CURRENT - Heavy gradients + SVG noise
.betting-rail {
  background:
    url("data:image/svg+xml,..."),  // SVG noise texture
    radial-gradient(...),            // Center highlight
    linear-gradient(...);            // Felt gradient
  box-shadow: 0 -6px 40px rgba(0,0,0,0.6), ...;
}
```

**Lines 89-127**: `.chip-button` - Complex hover transforms
```css
// CURRENT - 3D lift effect
.chip-button:hover:not(:disabled) {
  transform: translateY(-6px) scale(1.05);
  filter: brightness(1.15) drop-shadow(0 8px 12px rgba(0,0,0,0.4));
}
```

**Lines 143-173**: `.chip-pile`, `.chip-in-pile` - Complex pile transforms

### File: `openhouse_frontend/src/components/game-ui/BettingRail.tsx` (419 lines)

**Line 197**: Curve element
```tsx
// CURRENT - DELETE
<div className="betting-rail-curve" />
```

**Line 200**: Rail container with custom class
```tsx
// CURRENT
<div className="betting-rail">
```

---

## Implementation

### Step 1: Simplify BettingRail.css

**File:** `openhouse_frontend/src/components/game-ui/BettingRail.css`

```css
// PSEUDOCODE - New simplified CSS (~100 lines)

/* ========================================
   BETTING RAIL - Clean Dark Interface
   ======================================== */

/* Main surface - clean dark background */
.betting-rail {
  background: linear-gradient(180deg, #1e2328 0%, #1a1d21 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
}

/* ========================================
   CHIP BUTTONS - Simple hover
   ======================================== */

.chip-button {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  border-radius: 50%;
  background: transparent;
  border: none;
  padding: 2px;
  cursor: pointer;
}

.chip-button:hover:not(:disabled) {
  transform: scale(1.1);
  /* Subtle green glow on hover */
  filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.3));
}

.chip-button:active:not(:disabled) {
  transform: scale(1.05);
}

.chip-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

/* ========================================
   CHIP STACK - Simplified
   ======================================== */

.chip-stack-container {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: center;
  min-height: 80px;
}

.chip-pile {
  position: relative;
  cursor: pointer;
  margin: 0 -6px;
  transition: transform 0.2s ease;
}

.chip-pile:hover {
  transform: translateY(-2px);
}

.chip-in-pile {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  cursor: pointer;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));
  transition: transform 0.1s ease;
}

.chip-in-pile:hover {
  transform: translateX(-50%) translateY(-2px);
}

/* ========================================
   ANIMATIONS - Keep essential only
   ======================================== */

@keyframes chip-remove {
  0% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px) scale(0.8);
  }
}

.chip-removing {
  animation: chip-remove 0.25s ease-out forwards;
}

@keyframes deposit-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
  }
}

.deposit-button-pulse {
  animation: deposit-pulse 1.5s ease-in-out infinite;
}

/* ========================================
   PLACEHOLDER
   ======================================== */

.bet-placeholder {
  width: 80px;
  height: 80px;
  border: 2px dashed rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}

/* ========================================
   BUTTONS - Keep existing (already clean)
   ======================================== */

.rail-button {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: all 0.15s ease;
  cursor: pointer;
}

.rail-button-primary {
  background: #22c55e;
  color: white;
  border: none;
}

.rail-button-primary:hover {
  background: #16a34a;
}

.rail-button-secondary {
  background: transparent;
  color: #9ca3af;
  border: 1px solid #4b5563;
}

.rail-button-secondary:hover {
  color: white;
  border-color: #6b7280;
}

.rail-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ========================================
   RESPONSIVE
   ======================================== */

@media (max-width: 768px) {
  .chip-button:hover:not(:disabled) {
    transform: scale(1.05);
  }
}
```

### Step 2: Update BettingRail.tsx

**File:** `openhouse_frontend/src/components/game-ui/BettingRail.tsx`

```tsx
// PSEUDOCODE - Changes to make

// Line 197: DELETE the curve div entirely
// BEFORE:
<div className="betting-rail-curve" />

// AFTER:
// (delete this line)

// Line 200: Keep the betting-rail class (CSS handles the new look)
// No change needed here - CSS does the work
```

### Step 3: Simplify InteractiveChipStack.tsx (if needed)

**File:** `openhouse_frontend/src/components/game-ui/InteractiveChipStack.tsx`

Review and simplify any inline styles or complex hover logic. The CSS changes should handle most of this.

---

## Visual Reference

**Before (Skeuomorphic):**
```
    ╭────────────────────────────────╮  ← Curved lip with gold accent
   ╱  [Felt texture with gradients]  ╲
  │  Chips  │  Stack  │  Balance      │
   ╲  [Heavy shadows, 3D effects]    ╱
    ╰────────────────────────────────╯
```

**After (Hybrid Clean):**
```
┌─────────────────────────────────────┐  ← Subtle top border
│  [Clean dark gradient]              │
│  Chips  │  Stack  │  Balance        │
│  [Minimal shadows, flat design]     │
└─────────────────────────────────────┘
```

---

## Files to Modify

| File | Action | LOC Change |
|------|--------|------------|
| `openhouse_frontend/src/components/game-ui/BettingRail.css` | Rewrite (simplify) | 294 → ~120 |
| `openhouse_frontend/src/components/game-ui/BettingRail.tsx` | Delete curve div | -1 line |
| `openhouse_frontend/src/components/game-ui/InteractiveChipStack.tsx` | Review (likely no change) | 0 |

**Net LOC change:** -175 lines (approximately)

---

## Deployment Notes

- **Affected canisters:** Frontend only (`pezw3-laaaa-aaaal-qssoa-cai`)
- **No backend changes required**
- **Test at:** https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice

---

## Sources

- [Stake.com Dice Interface](https://stake.com/casino/games/dice)
- [Casino Website Design Examples - Subframe](https://www.subframe.com/tips/casino-website-design-examples)
- [Stake Dice Strategy - NoDepositz](https://nodepositz.com/blog/stake-dice-strategy/)
