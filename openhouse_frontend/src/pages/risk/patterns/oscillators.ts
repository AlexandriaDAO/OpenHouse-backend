// Oscillators - Pulsing patterns that cycle through states
// Create visual interest and "alive" territory markers
import type { PatternInfo } from './types';

export const OSCILLATORS: PatternInfo[] = [
  {
    name: 'Blinker',
    category: 'oscillator',
    description: 'Simplest oscillator, period 2',
    cells: 3,
    period: 2,
    rle: `x = 3, y = 1, rule = B3/S23
3o!`,
  },
  {
    name: 'Toad',
    category: 'oscillator',
    description: 'Second most common, period 2',
    cells: 6,
    period: 2,
    rle: `x = 4, y = 2, rule = B3/S23
b3o$3o!`,
  },
  {
    name: 'Beacon',
    category: 'oscillator',
    description: 'Flashing diagonal, period 2',
    cells: 6,
    period: 2,
    rle: `x = 4, y = 4, rule = B3/S23
2o2b$o3b$3bo$2b2o!`,
  },
  {
    name: 'Clock',
    category: 'oscillator',
    description: 'Rotating pattern, period 2',
    cells: 6,
    period: 2,
    rle: `x = 4, y = 4, rule = B3/S23
2bob$obob$bobo$bo!`,
  },
  {
    name: 'Pulsar',
    category: 'oscillator',
    description: 'Beautiful symmetric, period 3',
    cells: 48,
    period: 3,
    rle: `x = 13, y = 13, rule = B3/S23
2b3o3b3o2b2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b2$2b3o3b3o2b$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!`,
  },
  {
    name: 'Pentadecathlon',
    category: 'oscillator',
    description: 'Dramatic oscillation, period 15',
    cells: 12,
    period: 15,
    rle: `x = 10, y = 3, rule = B3/S23
2bo4bo2b$2ob4ob2o$2bo4bo!`,
  },
  {
    name: 'Tumbler',
    category: 'oscillator',
    description: 'Rocking motion, period 14',
    cells: 18,
    period: 14,
    rle: `x = 9, y = 5, rule = B3/S23
bo5bob$obo3bobo$o2bobo2bo$2bo3bo2b$2b2ob2o!`,
  },
  {
    name: 'Blocker',
    category: 'oscillator',
    description: 'Blocks incoming patterns, period 8',
    cells: 12,
    period: 8,
    rle: `x = 10, y = 5, rule = B3/S23
6bobob$5bo4b$2o2bo4bo$2obo2bob2o$4b2o!`,
  },
];
