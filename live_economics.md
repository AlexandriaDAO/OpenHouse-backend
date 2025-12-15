# Life Game Economics

## Overview

A perpetually running Game of Life where players spend points to place cells. Points are stored IN the territory cells themselves. When another player captures your territory, they capture your points. 100% efficient system - no house rake.

## Core Concepts

### Points (Not Real Money Yet)
- Each player starts with **1,000 points**
- Points will become cents later when real money is added
- For now, it's a free game to test mechanics

### Territory = Wallet
- Points don't sit in a player's "balance" - they live in territory cells
- Each cell can hold 0 or more points
- Your wealth = sum of points in cells you own

## Placement Rules

### Cost
- **1 point per cell placed**
- Place 5 cells → costs 5 points

### Point Distribution
- Points spent get **randomly distributed across your existing territory**
- If you have no territory yet, points go into the cells you just placed
- Points can stack (a cell could hold 2+ points if doubled up)

### Placement Restrictions
- **Cannot place on alive cells** (yours or enemy's)
- If any cell in your pattern overlaps a living cell, **entire placement fails**
- Can place anywhere else (empty cells, including "dead" territory)

## Earning Points

### Territory Capture
- When your cells take over enemy territory containing points, **you capture those points**
- Captured points go directly to **your balance** (spendable on new placements)

### Anti-Whale Mechanic
- **You cannot harvest your own points**
- If you own the entire board, you have no one to capture from = no income
- Forces competition, prevents runaway dominance

## Money Flow

```
┌──────────────────────┐
│  Player Places Cells │
│  (5 cells = 5 pts)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Points distributed  │
│  across player's     │
│  existing territory  │
│  (stored in cells)   │
└──────────┬───────────┘
           │
           │ Enemy captures territory
           ▼
┌──────────────────────┐
│  Points transfer to  │
│  capturing player    │
└──────────────────────┘
```

## Accounting Invariant

```
total_points_in_system = Σ(player_starting_points) = constant

Where points exist:
- In territory cells (as bounties)
- In player balances (unspent points)

No points created or destroyed. 100% efficient.
```

## Visual Feedback (Frontend)

- Cells with points show **gold borders**
- Border thickness varies based on point value (thicker = more points)
- Players can visually identify high-value targets

## Cell Ownership Inheritance

When a new cell is born (exactly 3 neighbors):
- New cell's owner = majority owner among the 3 parent cells
- **New cells have 0 points** (only placed cells get points)
- Ties: Random selection or oldest placement wins

## Why This Model Works

1. **Only pay when placing** - No background fees or upkeep
2. **Anti-whale** - Can't harvest own points, dominance doesn't equal income
3. **Zero-sum** - Total points constant, your gain = someone's loss
4. **Territorial incentive** - Points live in territory, must expand to capture
5. **Visual clarity** - Gold borders show where the money is

## Implementation Notes

### Data Structure
```rust
// Per cell: owner (u8) + points (u16 or u32)
// 1000x1000 grid = 1M cells
// ~3-5 bytes per cell = 3-5 MB total
```

### Files to Modify
- `life1_backend/src/lib.rs` - Add points tracking per cell, placement cost, capture logic
