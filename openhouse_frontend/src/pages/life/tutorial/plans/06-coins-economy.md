# Slide 6: The Coin Economy

**Status:** Not Implemented

## Overview
Teaches players how coins flow in the game - earning, spending, and the strategic implications.

## Core Concepts

### Coin Sources (Earning)
1. **Territory Generation**: Your territory generates coins over time
2. **Attacking Enemies**: Touching enemy territory drains THEIR base, coins go to YOUR wallet
3. **Faucet**: Free coins button (1000 coins, for testing/new players)

### Coin Sinks (Spending)
1. **Placing Cells**: Each cell costs 1 coin from your wallet
2. **Base Treasury**: Coins spent go to your base treasury (not lost)
3. **Being Attacked**: Enemy cells touching your territory drain your base treasury

### The Flow
```
[Faucet] ──→ [Your Wallet] ──→ [Your Base Treasury]
                   ↑                    ↓
                   │              (when attacked)
                   │                    ↓
            [Enemy Base] ←── [Enemy Territory Contact]
```

## Visual Elements

### Canvas Layout (24x24 grid)
- **Player Base**: 8x8 centered at (8, 8)
- Territory extending outward
- Show coin counters prominently

### UI Elements (Above/Below Canvas)
```
┌─────────────────────────────────────┐
│  Wallet: 🪙 150    Base: 🪙 50      │
│  [+1000 Faucet]                     │
├─────────────────────────────────────┤
│                                     │
│            [CANVAS]                 │
│                                     │
├─────────────────────────────────────┤
│  Territory: 36 cells (+0.5/sec)     │
│  Placing costs: 5 coins (5 cells)   │
└─────────────────────────────────────┘
```

### Animated Coin Flows
- Coins visually moving between wallet → base when placing
- Coins flying from base when being attacked
- Coins accumulating from territory (subtle pulse/glow)

## Interaction Flow

### Phase 1: Earning (Passive)
1. **Initial State**
   - Base with some territory already
   - Wallet at 50, Base Treasury at 25
   - Text: "Your territory generates coins over time"
   - Show coins slowly incrementing (accelerated for demo)

2. **Demonstration**
   - Every second, wallet increases by small amount
   - Territory count shown: "36 cells = +0.5 coins/sec"
   - Visual: Subtle coin particles floating toward wallet

### Phase 2: Spending
3. **Prompt to Place**
   - Text: "Click in your territory to place cells (1 coin each)"
   - Show cost preview: "This pattern costs 5 coins"

4. **User Places Cells**
   - Wallet decreases (150 → 145)
   - Base treasury increases (50 → 55)
   - Animated coin transfer: wallet → base
   - Text: "Coins go to your base treasury!"

### Phase 3: Combat Impact (Optional)
5. **Show Attack Effect**
   - Spawn enemy cells touching player territory
   - Base treasury drains (55 → 50 → 45...)
   - Text: "Defend your territory or lose coins!"

### Phase 4: Faucet
6. **Faucet Demo**
   - Show the "+1000" button
   - Text: "Need more coins? Use the faucet!"
   - Click adds 1000 to wallet (animated)

## Technical Implementation

### State Variables
```typescript
const [walletCoins, setWalletCoins] = useState(50);
const [baseCoins, setBaseCoins] = useState(25);
const [territoryCount, setTerritoryCount] = useState(36);
```

### Passive Income Simulation
```typescript
useEffect(() => {
  if (!isAnimating) return;

  const incomeInterval = setInterval(() => {
    // Accelerated: 1 coin per second per 10 territory
    const income = Math.floor(territoryCount / 10);
    setWalletCoins(prev => prev + income);
  }, 1000);

  return () => clearInterval(incomeInterval);
}, [isAnimating, territoryCount]);
```

### Placement Cost
```typescript
const handlePlace = (pattern: [number, number][]) => {
  const cost = pattern.length;

  if (walletCoins < cost) {
    setError("Not enough coins!");
    return;
  }

  setWalletCoins(prev => prev - cost);
  setBaseCoins(prev => prev + cost);

  // Animate coin transfer
  triggerCoinTransferAnimation('wallet', 'base', cost);

  // Place the cells...
};
```

### Files to Modify
- `tutorial/RiskTutorial.tsx` - coin economy specific UI and logic
- `tutorial/types.ts` - may need animation types
- `tutorial/slides/index.ts` - set `implemented: true`

## Visual Enhancements

### Coin Counter Animations
- Numbers count up/down smoothly (not instant)
- Flash green when gaining, red when losing
- Floating "+5" or "-3" indicators

### Coin Transfer Visualization
- Small coin sprites flying between UI elements
- Arc trajectory with slight bounce
- Sound effect (if audio enabled)

### Territory Income Indicator
- Subtle glow around territory when generating income
- Periodic pulse effect
- Small coin particles rising from territory

### Color Coding
- Wallet: Yellow/Gold
- Base Treasury: Green (positive), Red (draining)
- Costs: White/Gray text

## Information Hierarchy

### Most Important
1. Wallet balance (what you can spend)
2. Base treasury (your health - 0 = eliminated)
3. Cost of current action

### Secondary
4. Territory count
5. Income rate
6. Faucet availability

## Advanced Ideas

1. **Interactive Economy Sandbox**
   - Let user experiment with placing/earning
   - Show real-time balance changes

2. **Comparison View**
   - Split: "Attacking (drain enemy)" vs "Being attacked (lose coins)"

3. **Strategy Tips**
   - "Expand territory for more income"
   - "Keep base treasury high for defense"
   - "Attack enemy base to steal their coins"

4. **Elimination Warning**
   - Show what happens at 0 base coins
   - "Base destroyed! Game over."

## Success Criteria
- User understands wallet vs base treasury difference
- User knows placing costs coins (wallet → base)
- User understands territory generates income
- User knows attacks drain base treasury
- User is aware of the faucet for getting coins
