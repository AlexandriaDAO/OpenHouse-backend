// Guns - Patterns that continuously produce spaceships
// These are factory units for sustained attacks or defense
import type { PatternInfo } from './types';

export const GUNS: PatternInfo[] = [
  {
    name: 'Gosper Gun',
    category: 'gun',
    description: 'First gun discovered, fires gliders every 30 gen',
    cells: 36,
    period: 30,
    rle: `x = 36, y = 9, rule = B3/S23
24bo11b$22bobo11b$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o14b$2o8bo3bob2o4bobo11b$10bo5bo7bo11b$11bo3bo20b$12b2o!`,
  },
  {
    name: 'Simkin Gun',
    category: 'gun',
    description: 'Compact gun, fires gliders every 120 gen',
    cells: 29,
    period: 120,
    rle: `x = 33, y = 21, rule = B3/S23
2o5b2o$2o5b2o2$4b2o$4b2o5$22b2ob2o$21bo5bo$21bo6bo2b2o$21b3o3bo3b2o$26bo4$20b2o$20bo$21b3o$23bo!`,
  },
];
