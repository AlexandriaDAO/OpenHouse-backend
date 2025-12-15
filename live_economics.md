# Life Game Economics

## Overview

A perpetually running Game of Life where players pay to place cells and compete for territory growth rewards. The economic model ensures money in equals money out with a house edge on placements.

## Core Economic Rules

### Input: Cell Placement
- **Cost**: 1 cent per cell placed
- **Destination**: Goes to the pot (minus house rake)
- **No refunds**: Placed cells cannot be reclaimed

### Output: Territory Growth Rewards
- **Frequency**: Once per minute (60 seconds)
- **Metric**: Territory delta (change in squares owned by each player)
- **Winner**: Player with highest positive delta wins
- **Payout**: 1% of pot goes to winner

### Edge Cases

| Scenario | Resolution |
|----------|------------|
| Tie (multiple players same delta) | Split winnings equally among tied players |
| All negative growth | Least negative player wins |
| All zero growth | No payout, pot accumulates |
| Pot ≤ 10 cents | No payout until pot exceeds threshold |

## Money Flow

```
┌─────────────────┐
│  Player Places  │
│   Cell (1¢)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│      POT        │◄──── Accumulates from placements
│  (grows over    │
│    time)        │
└────────┬────────┘
         │ Every 60 seconds
         │ (if pot > 10¢)
         ▼
┌─────────────────┐
│  1% of Pot to   │
│  Growth Winner  │
└─────────────────┘
```

## Accounting Invariant

```
pot_balance = Σ(placement_fees) - Σ(payouts) - Σ(house_rake)
```

The pot can never go negative. Worst case: pot drains to ≤10¢ and payouts pause until new placements occur.

## Why This Model Works

1. **Only pay when placing** - No background fees or upkeep
2. **Pot is self-regulating** - Low pot = low rewards = less competition = pot rebuilds
3. **Growth, not dominance, wins** - Stable empires earn nothing; must actively expand
4. **No runaway winner** - Expanding costs money (placements), and growth is hard to sustain in chaotic GoL
5. **Always solvent** - Payouts are % of pot, can't exceed pot

## Territory Tracking

- Each cell has an owner (player who placed it, or inherited from parent cells)
- Track `cells_per_player` at each minute boundary
- Delta = `cells_now[player] - cells_60sec_ago[player]`

### Cell Ownership Inheritance
When a new cell is born (exactly 3 neighbors):
- New cell's owner = majority owner among the 3 parent cells
- Ties: Random selection or oldest placement wins

## Decisions

- **House rake**: % of each placement (simplest for auditability)
- **Withdrawals**: Winnings go to player's chip balance, withdrawable anytime
- **Fine-tuning**: House edge %, spam prevention, etc. to be determined during implementation
