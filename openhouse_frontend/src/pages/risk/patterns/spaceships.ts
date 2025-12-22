// Spaceships - Moving patterns that traverse the grid
// These are your attack units for invading enemy territory
import type { PatternInfo } from './types';

export const SPACESHIPS: PatternInfo[] = [
  {
    name: 'Glider',
    category: 'spaceship',
    description: 'Classic diagonal scout, c/4',
    cells: 5,
    speed: 'c/4',
    period: 4,
    essential: true,
    rle: `x = 3, y = 3, rule = B3/S23
bob$2bo$3o!`,
  },
  {
    name: 'LWSS',
    category: 'spaceship',
    description: 'Lightweight spaceship, c/2',
    cells: 9,
    speed: 'c/2',
    period: 4,
    rle: `x = 5, y = 4, rule = B3/S23
bo2bo$o4b$o3bo$4o!`,
  },
  {
    name: 'MWSS',
    category: 'spaceship',
    description: 'Middleweight spaceship, c/2',
    cells: 11,
    speed: 'c/2',
    period: 4,
    rle: `x = 6, y = 5, rule = B3/S23
3bo2b$bo3bo$o5b$o4bo$5o!`,
  },
  {
    name: 'HWSS',
    category: 'spaceship',
    description: 'Heavyweight spaceship, c/2',
    cells: 13,
    speed: 'c/2',
    period: 4,
    rle: `x = 7, y = 5, rule = B3/S23
3b2o2b$bo4bo$o6b$o5bo$6o!`,
  },
  {
    name: 'Copperhead',
    category: 'spaceship',
    description: 'Modern c/10 orthogonal ship',
    cells: 28,
    speed: 'c/10',
    period: 10,
    rle: `x = 8, y = 12, rule = B3/S23
b2o2b2o$3b2o$3b2o$obo2bobo$o6bo2$o6bo$b2o2b2o$2b4o2$3b2o$3b2o!`,
  },
  {
    name: 'Weekender',
    category: 'spaceship',
    description: 'Fast 2c/7 orthogonal ship',
    cells: 36,
    speed: '2c/7',
    period: 7,
    rle: `x = 16, y = 11, rule = B3/S23
bo12bob$bo12bob$obo10bobo$bo12bob$bo12bob$2bo3b4o3bo2b$6b4o6b$2b4o4b4o2b2$4bo6bo4b$5b2o2b2o!`,
  },
  {
    name: 'Spider',
    category: 'spaceship',
    description: 'Smallest c/5 orthogonal ship',
    cells: 47,
    speed: 'c/5',
    period: 5,
    rle: `x = 27, y = 8, rule = B3/S23
9bo7bo9b$3b2obobob2o3b2obobob2o3b$3obob3o9b3obob3o$o3bobo5bobo5bobo3bo$4b2o6bobo6b2o4b$b2o9bobo9b2ob$b2ob2o15b2ob2ob$5bo15bo!`,
  },
];
