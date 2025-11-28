# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-ui-redesign"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-ui-redesign`
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
   git commit -m "feat(dice): Cypherpunk terminal UI redesign"
   git push -u origin feature/dice-ui-cypherpunk-redesign
   gh pr create --title "Dice UI: Cypherpunk Terminal Redesign" --body "Implements PLAN_DICE_UI_CYPHERPUNK_REDESIGN.md

## Summary
- Transforms dice game UI from generic casino colors to stark terminal aesthetic
- White/gray on black palette replaces DFINITY turquoise/purple
- Keeps dice animation glow and pixel art chips as visual focal points
- Creates premium-through-restraint aesthetic

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice
- No backend changes"
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

**Branch:** `feature/dice-ui-cypherpunk-redesign`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-ui-redesign`

---

# Implementation Plan: Dice UI Cypherpunk Terminal Redesign

## Design Philosophy

**"The shell fades back, the game shines"**

- **UI Chrome**: Minimal, utilitarian, white/gray on black (terminal/hacker aesthetic)
- **Game Elements**: Keep modern, animated, attention-grabbing (dice animation, glow effects)
- **Chips**: Keep as-is (custom ICP pixel art - the one splash of color)

This creates visual hierarchy where the game is the star and the interface is invisible.

---

## Color Palette

### Old (Generic - Remove)
```
Primary:     #29ABE2 (DFINITY turquoise)
Secondary:   #3B00B9 (DFINITY purple)
Accents:     green-500, blue-500, yellow-400, red-400
```

### New (Terminal/Cypherpunk)
```
Primary:     #FFFFFF (white)
Secondary:   #9CA3AF (gray-400)
Muted:       #6B7280 (gray-500)
Subtle:      #374151 (gray-700)
Background:  #000000 (pure black)
Borders:     #1F2937 (gray-800)

Win state:   #FFFFFF (white) - not green
Loss state:  #6B7280 (gray-500) - muted, not red
Active:      #FFFFFF (white)
```

---

## Current State

### Files to Modify

| File | Purpose | Lines |
|------|---------|-------|
| `openhouse_frontend/src/pages/dice/DiceGame.tsx` | Main game component | ~640 |
| `openhouse_frontend/src/components/game-specific/dice/DiceControls.tsx` | Over/Under, slider, presets | ~102 |
| `openhouse_frontend/src/components/game-specific/dice/ChipBetting.tsx` | Betting interface | ~180 |
| `openhouse_frontend/src/components/game-specific/dice/DiceAnimation.css` | Glow effects | ~97 |

### Files to NOT Modify
- `GameButton.tsx` - Shared component, override inline in DiceGame.tsx instead
- `ChipStack.tsx` - Chip visuals are kept as-is
- `chipConfig.ts` - Chip definitions unchanged
- Any backend files - This is frontend-only

---

## Implementation Pseudocode

### 1. DiceGame.tsx

```typescript
// PSEUDOCODE - Color class replacements

// TOP BAR
// Old: text-blue-400 (chips balance)
// New: text-white
<span className="font-mono text-white">{formatUSDT(balance.game)}</span>

// Old: text-gray-500 (wallet balance)
// New: text-gray-500 (keep - already muted)

// Old: bg-dfinity-turquoise/80 text-black (+ Chips button)
// New: bg-white text-black
<button className="px-3 py-1 text-xs font-bold rounded bg-white text-black hover:bg-gray-200">

// Old: bg-yellow-500 text-black animate-pulse (deposit animation)
// New: bg-white text-black animate-pulse

// MAIN CARD
// Old: bg-gray-900/50 border border-gray-700/50
// New: bg-black border border-gray-800
<div className="card max-w-5xl mx-auto bg-black border border-gray-800">

// PAYOUT SUMMARY
// Old: text-yellow-400 (win chance)
// New: text-gray-400
<span className="text-gray-400 font-bold">{winChance.toFixed(0)}%</span>

// Old: text-green-400 (multiplier)
// New: text-white
<span className="text-white font-bold">{multiplier.toFixed(2)}x</span>

// Old: text-dfinity-turquoise (potential win)
// New: text-white
<span className="text-white font-mono font-bold">Win ${(betAmount * multiplier).toFixed(2)}</span>

// Old: text-gray-500 hover:text-dfinity-turquoise (? button)
// New: text-gray-600 hover:text-white

// RIGHT COLUMN (Game area)
// Old: bg-black/20 ... bg-gradient-to-br from-dfinity-turquoise/5 to-purple-900/10
// New: bg-black border-gray-800 (remove gradient)
<div className="flex flex-col ... bg-black rounded-xl border border-gray-800">
// Remove the gradient overlay div entirely

// RESULT DISPLAY
// Old: text-green-400 (win), text-red-400 (loss)
// New: text-white (win), text-gray-500 (loss)
<div className={`text-center ${lastResult.is_win ? 'text-white' : 'text-gray-500'}`}>

// Old: text-dfinity-turquoise (payout amount)
// New: text-white
<div className="text-2xl font-mono text-white">+{formatUSDT(lastResult.payout)}</div>

// DEPOSIT MODAL
// Old: bg-gray-900 border-gray-700
// New: bg-black border-gray-800

// Old: focus:border-dfinity-turquoise
// New: focus:border-white

// Old: bg-dfinity-turquoise text-black (confirm button)
// New: bg-white text-black hover:bg-gray-200

// ODDS EXPLAINER MODAL
// Old: text-dfinity-turquoise (headers)
// New: text-white

// Old: bg-black/30 (example boxes)
// New: bg-gray-900 border border-gray-800

// GAME BUTTON OVERRIDE
// Instead of using GameButton component with turquoise, override inline:
<button
  onClick={rollDice}
  disabled={!actor || isPlaying}
  className="w-full font-mono font-bold py-4 text-xl border-2
             border-white text-white bg-transparent
             hover:bg-white hover:text-black
             disabled:border-gray-700 disabled:text-gray-700
             transition"
>
  {isPlaying ? 'Rolling...' : 'ROLL DICE'}
</button>
```

### 2. DiceControls.tsx

```typescript
// PSEUDOCODE - Button and slider styling

// OVER/UNDER BUTTONS
// Old Over active: bg-green-500 text-black shadow-lg shadow-green-500/30
// New Over active: bg-white text-black
// Old Under active: bg-blue-500 text-black shadow-lg shadow-blue-500/30
// New Under active: border-2 border-white text-white (outline variant for differentiation)

// Old inactive: bg-gray-800/50 text-gray-400 hover:bg-gray-700/50
// New inactive: bg-transparent border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300

<button
  onClick={() => onDirectionChange('Over')}
  disabled={disabled}
  className={`flex-1 py-3 text-sm font-bold rounded-lg transition ${
    direction === 'Over'
      ? 'bg-white text-black'
      : 'bg-transparent border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
  }`}
>
  OVER
</button>

<button
  onClick={() => onDirectionChange('Under')}
  disabled={disabled}
  className={`flex-1 py-3 text-sm font-bold rounded-lg transition ${
    direction === 'Under'
      ? 'border-2 border-white text-white'
      : 'bg-transparent border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
  }`}
>
  UNDER
</button>

// SLIDER CONTAINER
// Old: bg-gray-800/30 border-gray-700/30
// New: bg-black border border-gray-800
<div className="bg-black p-3 rounded-lg border border-gray-800">

// SLIDER INPUT
// Old: accent-dfinity-turquoise
// New: accent-white (or custom CSS for white thumb)
<input
  type="range"
  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-white"
/>

// PRESET BUTTONS
// Old active: bg-dfinity-turquoise text-black
// New active: bg-white text-black

// Old inactive: bg-gray-800/50 text-gray-400
// New inactive: bg-transparent border border-gray-700 text-gray-500

<button
  className={`flex-1 py-2 text-xs font-bold rounded transition ${
    isActive
      ? 'bg-white text-black'
      : 'bg-transparent border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
  }`}
>
  {val}
</button>
```

### 3. ChipBetting.tsx

```typescript
// PSEUDOCODE - Betting area styling

// CONTAINER
// Old: bg-gray-800/30 border-gray-700/50
// New: bg-black border-gray-800
<div className={`bg-black rounded-lg p-3 border border-gray-800 ${borderClass} transition-all`}>

// Note: Keep houseLimitStatus colors (red/yellow) - these are functional warnings, not decorative

// DIVIDER
// Old: bg-gray-700/50
// New: bg-gray-800
<div className="w-px h-12 bg-gray-800"></div>

// BET DISPLAY AREA
// Old: hover:bg-gray-700/20
// New: hover:bg-gray-900
<div className="flex-1 flex items-center justify-between cursor-pointer hover:bg-gray-900 rounded px-2 py-1 transition">

// Text colors are already white/gray - keep as-is
```

### 4. DiceAnimation.css

```css
/* PSEUDOCODE - Glow color change only */

/* Keep dice box styling unchanged - white box with black border looks great */

/* RESULT GLOW - Change from turquoise to white */
/* Old: rgba(41, 171, 226, 0.6) - turquoise */
/* New: rgba(255, 255, 255, 0.3) - white, slightly more subtle */

.result-glow-turquoise {
  /* ... keep positioning ... */
  background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
  /* ... keep animation ... */
}

/* Also update the box-shadow on .dice-box */
/* Old: box-shadow: 0 0 20px rgba(0, 209, 255, 0.2); */
/* New: box-shadow: 0 0 20px rgba(255, 255, 255, 0.15); */
```

---

## Class Replacement Quick Reference

| Old Class | New Class | Context |
|-----------|-----------|---------|
| `text-dfinity-turquoise` | `text-white` | All accent text |
| `bg-dfinity-turquoise` | `bg-white` | Buttons, highlights |
| `border-dfinity-turquoise` | `border-white` | Button borders |
| `hover:text-dfinity-turquoise` | `hover:text-white` | Hover states |
| `focus:border-dfinity-turquoise` | `focus:border-white` | Input focus |
| `text-blue-400` | `text-white` | Chips balance |
| `text-green-400` | `text-white` | Multiplier, win text |
| `text-yellow-400` | `text-gray-400` | Win chance % |
| `text-red-400` (result) | `text-gray-500` | Loss state |
| `bg-green-500` | `bg-white` | Over button active |
| `bg-blue-500` | `border-2 border-white` | Under button active |
| `shadow-green-500/30` | (remove) | Button shadows |
| `shadow-blue-500/30` | (remove) | Button shadows |
| `bg-gray-900/50` | `bg-black` | Main card |
| `bg-gray-800/30` | `bg-black` | Control containers |
| `border-gray-700/50` | `border-gray-800` | Borders |
| `accent-dfinity-turquoise` | `accent-white` | Slider |

---

## What to Keep Unchanged

1. **Chip images and ChipStack component** - Pixel art stays colorful
2. **Dice animation timing/behavior** - Just change glow color
3. **Layout structure** - Grid, spacing, responsive breakpoints
4. **Functional error states** - Red for actual errors is fine
5. **House limit warnings** - Yellow/red indicators serve a purpose
6. **Typography** - JetBrains Mono fits terminal aesthetic perfectly

---

## Deployment Notes

- **Scope**: Frontend only - no backend changes
- **Canisters affected**: `pezw3-laaaa-aaaal-qssoa-cai` (frontend)
- **Other games**: Unaffected - this is dice-specific
- **Verification**: Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice after deploy

---

## Expected Result

**Before**: Generic casino UI with corporate DFINITY colors. Looks like every other crypto gambling site. The turquoise/purple palette feels safe and forgettable.

**After**: Stark terminal interface. Black void with white text and borders. The pixel art chips and glowing white dice animation pop against the austere background. Feels like hacking a casino from a bunker. Premium through restraint. Memorable.
