// Big Bombs - Long-running methuselahs that create MASSIVE chaos
// These patterns run for 10,000+ generations before stabilizing
import type { PatternInfo } from './types';

export const BIG_BOMBS: PatternInfo[] = [
  {
    name: 'Lidka',
    category: 'bigBomb',
    description: '13 cells creates chaos for 29,055 gen',
    cells: 13,
    lifespan: 29055,
    rle: `#N Lidka
#O Andrzej Okrasinski and David Bell
#C A methuselah with lifespan 29055.
x = 9, y = 15, rule = B3/S23
bo7b$obo6b$bo7b8$8bo$6bobo$5b2obo2$4b3o!`,
  },
  {
    name: 'Rabbits',
    category: 'bigBomb',
    description: '9 cells spawns chaos for 17,331 gen',
    cells: 9,
    lifespan: 17331,
    rle: `#N Rabbits
#O Andrew Trevorrow
#C A methuselah with lifespan 17331.
x = 7, y = 3, rule = B3/S23
o3b3o$3o2bob$bo!`,
  },
  {
    name: 'Bunnies',
    category: 'bigBomb',
    description: '8 cells, parent of Rabbits, 17,332 gen',
    cells: 8,
    lifespan: 17332,
    rle: `#N Bunnies
#O Robert Wainwright and Andrew Trevorrow
#C A methuselah and parent of rabbits with lifespan 17332.
x = 8, y = 4, rule = B3/S23
o5bob$2bo3bob$2bo2bobo$bobo!`,
  },
  {
    name: 'Iwona',
    category: 'bigBomb',
    description: '12 cells, 28,786 generations of destruction',
    cells: 12,
    lifespan: 28786,
    rle: `#N Iwona
#O Andrew Okrasinski
#C A methuselah with lifespan 28786. Found on August 20, 2004.
x = 20, y = 21, rule = B3/S23
14b3o3b6$2bo17b$3b2o15b$3bo14bob$18bob$18bob$19bo$18b2o$7b2o11b$8bo11b5$2o18b$bo!`,
  },
  {
    name: 'Justyna',
    category: 'bigBomb',
    description: '13 cells runs wild for 26,458 gen',
    cells: 13,
    lifespan: 26458,
    rle: `#N Justyna
#O Andrzej Okrasinski
#C A methuselah with lifespan 26458 that was found in May 2004.
x = 22, y = 17, rule = B3/S23
17bo4b$16bo2bo2b$17b3o2b$17bo2bob2$2o16bo3b$bo16bo3b$18bo3b8$19b3o$11b3o!`,
  },
  {
    name: 'Blom',
    category: 'bigBomb',
    description: '11 cells burns for 23,314 gen',
    cells: 11,
    lifespan: 23314,
    rle: `#N Blom
#O Dean Hickerson
#C A methuselah with lifespan 23314 found in July 2002.
x = 12, y = 5, rule = B3/S23
o10bo$b4o6bo$2b2o7bo$10bob$8bobo!`,
  },
  {
    name: '7468M',
    category: 'bigBomb',
    description: '8 cells, 7,468 gen of pure entropy',
    cells: 8,
    lifespan: 7468,
    rle: `#N 7468M
#O Tomas Rokicki
#C A methuselah with lifespan 7468 found on February 20, 2005.
x = 6, y = 4, rule = B3/S23
4bob$4b2o$2ob2ob$o!`,
  },
  {
    name: 'Multum in Parvo',
    category: 'bigBomb',
    description: '"Much in little" - 6 cells, 3,933 gen',
    cells: 6,
    lifespan: 3933,
    rle: `#N Multum in parvo
#O Charles Corderman
#C A methuselah with lifespan 3933.
x = 6, y = 4, rule = B3/S23
3b3o$2bo2bo$bo4b$o!`,
  },
];
