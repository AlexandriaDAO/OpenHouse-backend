// Methuselahs - Small patterns with long, chaotic evolutions
// These are "grenades" that create massive disruption from tiny inputs
import type { PatternInfo } from './types';

export const METHUSELAHS: PatternInfo[] = [
  {
    name: 'R-pentomino',
    category: 'methuselah',
    description: '5 cells creates chaos for 1103 gen',
    cells: 5,
    lifespan: 1103,
    rle: `x = 3, y = 3, rule = B3/S23
b2o$2ob$bo!`,
  },
  {
    name: 'Acorn',
    category: 'methuselah',
    description: '7 cells spawns gliders for 5206 gen',
    cells: 7,
    lifespan: 5206,
    rle: `x = 7, y = 3, rule = B3/S23
bo5b$3bo3b$2o2b3o!`,
  },
  {
    name: 'Diehard',
    category: 'methuselah',
    description: '7 cells that completely dies after 130 gen',
    cells: 7,
    lifespan: 130,
    rle: `x = 8, y = 3, rule = B3/S23
6bob$2o6b$bo3b3o!`,
  },
  {
    name: 'Queen Bee',
    category: 'methuselah',
    description: 'Lays beehives then explodes',
    cells: 12,
    lifespan: 191,
    rle: `x = 7, y = 5, rule = b3/s23
3bo3b$2bobo2b$bo3bob$2b3o2b$2o3b2o!`,
  },
];
