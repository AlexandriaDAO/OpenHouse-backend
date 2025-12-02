# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-liquidity-ui"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-liquidity-ui`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Frontend changes:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice/liquidity"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): improve liquidity page UX - integrate key info into default view"
   git push -u origin feature/dice-liquidity-ui-improvements
   gh pr create --title "[Feature]: Dice Liquidity UI Improvements" --body "Implements PLAN_DICE_LIQUIDITY_UI_IMPROVEMENTS.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/dice/liquidity

## Changes
- Integrated APY metrics into default stats bar
- Added collapsible Risk & Returns section with key information from 'How it Works'
- Made Advanced Stats more discoverable with preview metrics
- Removed modal-based 'How it Works' in favor of inline expandable content
- Improved information hierarchy without overwhelming users

## UX Improvements
- Users now see APY immediately (key decision metric for LPs)
- Risk information is visible by default but collapsible
- Advanced stats show preview before expanding full charts
- Better progressive disclosure of complexity"
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

**Branch:** `feature/dice-liquidity-ui-improvements`
**Worktree:** `/home/theseus/alexandria/openhouse-liquidity-ui`

---

# Implementation Plan: Dice Liquidity Page UX Improvements

## Task Classification
**REFACTORING**: Improve existing UI/UX by better organizing and surfacing information

## Current State Analysis

### File Structure
```
openhouse_frontend/src/
├── pages/dice/
│   └── DiceLiquidity.tsx          (Main page - needs modification)
├── components/game-specific/dice/
│   └── statistics/
│       ├── DiceStatistics.tsx     (Stats component - reference for integration)
│       └── StatsCharts.tsx        (Chart components)
└── components/
    └── InfoTooltip.tsx            (Used for explanations)
```

### Current User Flow Issues

**Lines 211-233**: Stats bar shows only 2 metrics (Total House Funds, Share Price)
- **Problem**: Missing the most important metric for LP decision-making: APY
- APY data exists in DiceStatistics but hidden behind "Show Advanced Stats" button

**Lines 236-256**: "Key Concepts" section shows basic info
- **Current**: 3 cards explaining "Be The House", "1% House Edge", "1% Withdrawal Fee"
- **Good**: Visible by default
- **Missing**: The valuable risk/reward information from "How It Works" modal

**Lines 376-390**: Footer controls with hidden sections
- **"Show Advanced Stats" button** (line 378-382): Toggles entire DiceStatistics component
  - Contains: APY cards, Share Price Chart, Pool Reserve Chart, Volume Chart, P&L Chart
  - **Problem**: APY is critical information but completely hidden

- **"How it Works" button** (line 384-389): Opens modal
  - Contains valuable content (lines 396-437):
    - "You are the Bank" explanation
    - Win/Lose scenarios grid
    - The Alexandria Model explanation
  - **Problem**: Modal requires click, hides context from main page

**Lines 396-437**: "How It Works" Modal
- Well-designed content explaining:
  - Risk nature of LP deposits
  - Win/lose scenarios
  - Alexandria's fee model
- **Problem**: Hidden behind modal, users might deposit without reading

**Lines 392-393**: DiceStatistics Component (when expanded)
- Shows comprehensive historical data
- APY cards, multiple charts
- **Problem**: All-or-nothing toggle, can't show just key metrics

### Design Goals

1. **Surface APY prominently** - Add to stats bar (most important LP metric)
2. **Integrate risk information** - Make "How It Works" content visible by default
3. **Progressive disclosure** - Show key stats, allow expansion for deep dive
4. **Remove modal pattern** - Use inline expandable sections instead
5. **Maintain clean aesthetic** - Don't overwhelm, preserve current visual style

## Proposed UI Structure

### New Layout Flow
```
┌─────────────────────────────────────────┐
│ Back to Game                            │
│ BE THE HOUSE (Hero)                     │
├─────────────────────────────────────────┤
│ Stats Bar (3 columns):                  │
│ - Total House Funds                     │
│ - Share Price                           │
│ - 7-Day APY (NEW - with trend)          │ ← SURFACE KEY METRIC
├─────────────────────────────────────────┤
│ Risk & Returns (Collapsible, OPEN):     │ ← INTEGRATE "HOW IT WORKS"
│ ▼ Understanding Liquidity Provision     │
│                                         │
│ [You are the Bank explanation]          │
│ [Win/Lose scenario grid]                │
│ [Alexandria Model]                      │
│                                         │
│ (Click to collapse ▲)                   │
├─────────────────────────────────────────┤
│ Your Position (if any)                  │
│ Deposit/Withdraw Actions                │
├─────────────────────────────────────────┤
│ Performance Metrics (Collapsible):      │ ← BETTER "ADVANCED STATS"
│ ▶ View Historical Performance           │
│                                         │
│ When expanded:                          │
│ - APY Summary                           │
│ - All Charts (Share Price, etc.)        │
└─────────────────────────────────────────┘
```

### Key Changes

1. **Stats Bar Enhancement** (Lines 211-233)
   - Add 3rd column: "7-Day APY"
   - Fetch APY from `useStatsData` hook
   - Show loading/error states gracefully
   - Add trend indicator (↑/↓) for visual appeal

2. **New "Risk & Returns" Section** (Insert after Stats Bar)
   - Replaces "How It Works" modal
   - Collapsible section, **default expanded**
   - Contains content from modal (lines 407-433)
   - Improved layout: grid for win/lose scenarios
   - Add collapse button at bottom

3. **Improved "Advanced Stats"** (Lines 392-393)
   - Change from toggle to collapsible section
   - Default collapsed to reduce initial load
   - Better header: "Historical Performance & Charts"
   - Keep full DiceStatistics component when expanded

4. **Remove Footer Controls** (Lines 376-390)
   - Delete "Show Advanced Stats" button (now inline collapsible)
   - Delete "How it Works" button (now integrated above)

5. **Remove Modal** (Lines 396-437)
   - Delete entire "How It Works" modal code
   - Content moved to inline collapsible section

## Implementation Pseudocode

### File: `openhouse_frontend/src/pages/dice/DiceLiquidity.tsx`

```typescript
// PSEUDOCODE - Enhanced Dice Liquidity Page

// Add new imports
import { useStatsData } from '../../components/game-specific/dice/statistics/useStatsData';

export function DiceLiquidity() {
  // ... existing state ...

  // NEW: Add state for collapsible sections
  const [showRiskReturns, setShowRiskReturns] = useState(true);  // Default open
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);  // Default closed

  // NEW: Fetch APY data for stats bar
  const { apy7, isLoading: apyLoading } = useStatsData(false); // Only fetch if needed

  // REMOVE: showHowItWorks state (no longer needed)
  // REMOVE: showStats state (replaced by showAdvancedStats)

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12">
      {/* ... existing back button and hero ... */}

      {/* MODIFIED: Stats Bar - Add APY Column */}
      <div className="grid grid-cols-3 border-b border-gray-700/50 bg-black/20">
        {/* Existing columns... */}

        {/* NEW: Third column - 7-Day APY */}
        <div className="p-4 text-center">
          <div className="text-gray-500 text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            7-Day APY
            <InfoTooltip content="Annual Percentage Yield based on last 7 days of pool performance. Reflects actual returns vs theoretical 1% house edge." />
          </div>
          <div className={`text-xl font-mono font-bold ${
            apyLoading ? 'text-gray-600' :
            apy7 && apy7.actual_apy_percent >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {apyLoading ? '...' :
             apy7 ? `${apy7.actual_apy_percent >= 0 ? '+' : ''}${apy7.actual_apy_percent.toFixed(2)}%` :
             'N/A'}
          </div>
          {apy7 && (
            <div className="text-[10px] text-gray-600 mt-0.5">
              Expected: {apy7.expected_apy_percent.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* NEW: Risk & Returns Section (Replaces "How It Works" Modal) */}
      <div className="mt-6 bg-gray-900/40 border border-gray-700/50 rounded-2xl overflow-hidden">
        {/* Header - Always visible, clickable to toggle */}
        <button
          onClick={() => setShowRiskReturns(!showRiskReturns)}
          className="w-full p-4 flex items-center justify-between bg-gradient-to-r from-purple-900/20 to-transparent hover:from-purple-900/30 transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="text-purple-400 font-bold">📚 Understanding Liquidity Provision</span>
          </div>
          <span className="text-gray-500 text-xl">{showRiskReturns ? '▼' : '▶'}</span>
        </button>

        {/* Content - Collapsible */}
        {showRiskReturns && (
          <div className="p-6 space-y-5 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
            {/* YOU ARE THE BANK */}
            <div className="bg-black/30 p-4 rounded-xl border border-gray-800">
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                <span>🏦</span> You are the Bank
              </h4>
              <p className="text-gray-400 text-xs leading-relaxed">
                When you deposit, your money is pooled to form the game's bankroll.
                Unlike a regular deposit, <strong>this money is at risk</strong>. You're taking the House's
                position in every bet.
              </p>
            </div>

            {/* WIN/LOSE SCENARIOS */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-900/10 p-3 rounded-lg border border-green-900/30">
                <h4 className="font-bold text-green-400 mb-1 text-xs flex items-center gap-1">
                  <span>✅</span> You Win When...
                </h4>
                <p className="text-gray-500 text-[10px]">
                  Players lose their bets. The House has a 1% statistical advantage that compounds over time.
                </p>
              </div>
              <div className="bg-red-900/10 p-3 rounded-lg border border-red-900/30">
                <h4 className="font-bold text-red-400 mb-1 text-xs flex items-center gap-1">
                  <span>⚠️</span> You Lose When...
                </h4>
                <p className="text-gray-500 text-[10px]">
                  Players get lucky and win big payouts. Short-term variance can be significant.
                </p>
              </div>
            </div>

            {/* ALEXANDRIA MODEL */}
            <div className="bg-yellow-900/10 p-4 rounded-xl border border-yellow-900/30">
              <h4 className="font-bold text-yellow-400 mb-1 flex items-center gap-2">
                <span>⚡</span> The Alexandria Model
              </h4>
              <p className="text-gray-400 text-xs leading-relaxed">
                This is an Alexandria project. We charge <strong>no fees on gameplay</strong>.
                Instead, a <strong>1% fee is charged only when you withdraw</strong> your liquidity.
                This fee is distributed to $ALEX token stakers. This aligns incentives: we want you
                to keep liquidity in the pool and profit alongside the house.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ... existing Key Concepts, Position, Actions ... */}

      {/* MODIFIED: Advanced Stats Section (Replaces footer toggle) */}
      <div className="mt-6 bg-gray-900/40 border border-gray-700/50 rounded-2xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setShowAdvancedStats(!showAdvancedStats)}
          className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-bold text-sm">📊 Historical Performance & Charts</span>
          </div>
          <span className="text-gray-500 text-xl">{showAdvancedStats ? '▼' : '▶'}</span>
        </button>

        {/* Full Stats Component */}
        {showAdvancedStats && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
            <DiceStatistics />
          </div>
        )}
      </div>

      {/* REMOVE: Footer controls section (lines 376-390) */}
      {/* REMOVE: "How It Works" modal (lines 396-437) */}

      {/* Keep withdraw confirmation modal */}
      {/* ... */}
    </div>
  );
}
```

### Visual Hierarchy Changes

**Before:**
```
Hero → Stats (2 cols) → Key Concepts → Actions → Footer Links → [Hidden: Modal, Stats]
```

**After:**
```
Hero → Stats (3 cols w/ APY) → Risk & Returns (expanded) → Key Concepts → Actions → Advanced Stats (collapsed)
```

## Deployment Notes

### Affected Files
- `openhouse_frontend/src/pages/dice/DiceLiquidity.tsx` (MODIFY)

### Canisters
- **Frontend**: `pezw3-laaaa-aaaal-qssoa-cai`

### Build & Deploy
```bash
cd openhouse_frontend
npm run build
cd ..
./deploy.sh --frontend-only
```

### Testing Checklist
1. Visit `/dice/liquidity` route
2. Verify 3-column stats bar shows APY
3. Check "Risk & Returns" section renders open by default
4. Test collapse/expand behavior
5. Verify "Advanced Stats" section starts collapsed
6. Expand advanced stats, verify charts load
7. Test deposit/withdraw flows still work
8. Check mobile responsiveness
9. Verify no console errors

## UX Impact Analysis

### Improvements
1. **Faster Decision Making**: APY visible immediately (no click required)
2. **Better Risk Communication**: Important warnings visible by default
3. **Progressive Disclosure**: Complexity hidden but discoverable
4. **Cleaner Footer**: No orphaned links at bottom
5. **Consistent Patterns**: Collapsible sections vs. modals

### Metrics to Watch
- LP deposit rate (should increase with better info)
- Time-to-first-deposit (should decrease)
- Advanced stats expansion rate (measure engagement)

## Edge Cases

### No APY Data Yet
- Show "N/A" with tooltip: "Needs 24h of activity"
- Don't break layout

### Loading States
- APY: Show "..." during fetch
- Don't delay page render

### Mobile View
- Stats bar: Stack 3 columns vertically on mobile
- Collapsible sections: Work well on mobile
- Touch targets: Ensure collapse buttons are big enough

## Alternative Approaches Considered

### ❌ Show all stats inline
- **Problem**: Too much data, overwhelming
- **Decision**: Use progressive disclosure

### ❌ Keep modal for "How It Works"
- **Problem**: Context switching, easy to skip
- **Decision**: Inline collapsible keeps context

### ❌ Always show all advanced stats
- **Problem**: Page becomes very long, charts slow to load
- **Decision**: Collapsible with clear header

## Success Criteria

- [ ] APY visible in stats bar on page load
- [ ] Risk & Returns section visible by default (collapsible)
- [ ] Advanced stats accessible but not overwhelming
- [ ] No modals (replaced with inline content)
- [ ] Mobile responsive
- [ ] No performance regression
- [ ] Clean, maintainable code

---

**End of Implementation Plan**
