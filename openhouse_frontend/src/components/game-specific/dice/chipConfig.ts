export interface ChipDenomination {
  value: number;
  label: string;
  color: string;
  topImg: string;
  sideImg: string;
  consolidateAt: number;  // How many of this chip triggers consolidation to next tier
}

export const CHIP_DENOMINATIONS: ChipDenomination[] = [
  {
    value: 0.01,
    label: '0.01',
    color: 'white',
    topImg: '/chips/white_top.png',
    sideImg: '/chips/white_side.png',
    consolidateAt: 10  // 10 white = 1 red
  },
  {
    value: 0.10,
    label: '0.10',
    color: 'red',
    topImg: '/chips/red_top.png',
    sideImg: '/chips/red_side.png',
    consolidateAt: 10  // 10 red = 1 blue
  },
  {
    value: 1.00,
    label: '1',
    color: 'blue',
    topImg: '/chips/blue_top.png',
    sideImg: '/chips/blue_side.png',
    consolidateAt: 5   // 5 blue = 1 green
  },
  {
    value: 5.00,
    label: '5',
    color: 'green',
    topImg: '/chips/green_top.png',
    sideImg: '/chips/green_side.png',
    consolidateAt: 2   // 2 green = 1 black
  },
  {
    value: 10.00,
    label: '10',
    color: 'black',
    topImg: '/chips/black_top.png',
    sideImg: '/chips/black_side.png',
    consolidateAt: Infinity  // Never consolidates (highest)
  },
];

// Get chip by color
export function getChipByColor(color: string): ChipDenomination | undefined {
  return CHIP_DENOMINATIONS.find(c => c.color === color);
}

// Get chip by value
export function getChipByValue(value: number): ChipDenomination | undefined {
  return CHIP_DENOMINATIONS.find(c => Math.abs(c.value - value) < 0.001);
}

// Get next higher denomination
export function getNextHigherChip(chip: ChipDenomination): ChipDenomination | undefined {
  const idx = CHIP_DENOMINATIONS.findIndex(c => c.color === chip.color);
  return idx < CHIP_DENOMINATIONS.length - 1 ? CHIP_DENOMINATIONS[idx + 1] : undefined;
}

/**
 * Decompose a total amount into optimal chip counts.
 * Uses greedy algorithm: largest chips first.
 * Returns array of {chip, count} sorted largest to smallest.
 */
export function decomposeIntoChips(amount: number): { chip: ChipDenomination; count: number }[] {
  const result: { chip: ChipDenomination; count: number }[] = [];
  let remaining = Math.round(amount * 100) / 100; // Fix floating point

  // Process from highest to lowest denomination
  for (let i = CHIP_DENOMINATIONS.length - 1; i >= 0; i--) {
    const chip = CHIP_DENOMINATIONS[i];
    const count = Math.floor(remaining / chip.value);
    if (count > 0) {
      result.push({ chip, count });
      remaining = Math.round((remaining - count * chip.value) * 100) / 100;
    }
  }

  return result;
}

/**
 * Convert chip counts to a flat array of chip values for stacking display.
 * Limits total chips shown to maxChips.
 */
export function chipCountsToArray(
  chipCounts: { chip: ChipDenomination; count: number }[],
  maxChips: number = 15
): ChipDenomination[] {
  const chips: ChipDenomination[] = [];

  for (const { chip, count } of chipCounts) {
    for (let i = 0; i < count && chips.length < maxChips; i++) {
      chips.push(chip);
    }
  }

  return chips;
}
