// Still Lifes - Stable defensive structures
// These never change and form the building blocks of bases
import type { PatternInfo } from './types';

export const STILL_LIFES: PatternInfo[] = [
  {
    name: 'Block',
    category: 'stillLife',
    description: '2x2, most basic still life',
    cells: 4,
    rle: `x = 2, y = 2, rule = B3/S23
2o$2o!`,
  },
  {
    name: 'Beehive',
    category: 'stillLife',
    description: '6-cell hexagonal still life',
    cells: 6,
    rle: `x = 4, y = 3, rule = B3/S23
b2ob$o2bo$b2o!`,
  },
  {
    name: 'Boat',
    category: 'stillLife',
    description: 'Only 5-cell still life',
    cells: 5,
    rle: `x = 3, y = 3, rule = B3/S23
2ob$obo$bo!`,
  },
  {
    name: 'Tub',
    category: 'stillLife',
    description: '4-cell diamond still life',
    cells: 4,
    rle: `x = 3, y = 3, rule = B3/S23
bob$obo$bo!`,
  },
  {
    name: 'Loaf',
    category: 'stillLife',
    description: '7-cell rounded still life',
    cells: 7,
    rle: `x = 4, y = 4, rule = B3/S23
b2ob$o2bo$bobo$2bo!`,
  },
];
