// Pattern Library for MMO Game of Life
// Organized by category for easy browsing and strategic gameplay
//
// ============================================================================
// 📋 FULL CURATED PATTERN LIST (60 patterns from 4,943 available)
// ============================================================================
// Collection Statistics:
// - Total Available: 4,943 .rle patterns in public/life-patterns/
// - Guns: 278 patterns
// - Corderships: 40 patterns
// - Reflectors: 27 patterns
// - Classic Spaceships: 162+ patterns
//
// TIER 1: ESSENTIAL BASICS (15 patterns) - Currently Implemented: 10/15
// -----------------------------------------------------------------------
// Still Lifes (5):
//   ✓ block.rle, beehive.rle, boat.rle, tub.rle, loaf.rle
//
// Simple Oscillators (5):
//   ✓ blinker.rle, toad.rle, beacon.rle, pulsar.rle, pentadecathlon.rle
//
// Basic Spaceships (5):
//   ✓ glider.rle, lwss.rle, mwss.rle, hwss.rle
//   ⚪ copperhead.rle - Modern c/10 orthogonal
//
// TIER 2: INTERMEDIATE ARSENAL (20 patterns) - Not Yet Implemented
// -----------------------------------------------------------------------
// Advanced Oscillators (5):
//   ⚪ clock.rle, octagon2.rle, mold.rle, mazing.rle, fumarole.rle
//
// Exotic Spaceships (5):
//   ⚪ weekender.rle (2c/7), spider.rle (c/5), dart.rle (c/3)
//   ⚪ loafer.rle (c/7), turtle.rle (c/3)
//
// Diagonal Spaceships (3):
//   ⚪ crab.rle, sidecar.rle, fireship.rle
//
// Basic Guns (2):
//   ⚪ gosperglidergun.rle (period 30), simkinglidergun.rle (period 120)
//
// Utility Patterns (5):
//   ⚪ eater1.rle, ship.rle, pond.rle, snake.rle, queenbee.rle
//
// TIER 3: ADVANCED/CHAOS (15 patterns) - Currently Implemented: 6/15
// -----------------------------------------------------------------------
// Methuselahs (6):
//   ✓ acorn.rle (5,206 gen), rpentomino.rle (1,103 gen)
//   ✓ diehard.rle (130 gen), switchengine.rle (3,911 gen)
//   ⚪ thunderbird.rle (243 gen), rabbits.rle (17,331 gen!)
//
// Puffers (3):
//   ✓ puffer1.rle (period 128), pufferfish.rle (c/2)
//   ⚪ blinkerpuffer1.rle
//
// Rakes (2):
//   ✓ backrake1.rle, backrake2.rle
//
// Corderships (2):
//   ⚪ 2enginecordership.rle, 3enginecordership.rle
//
// Specialized Guns (2):
//   ⚪ period14glidergun.rle, period20glidergun.rle
//
// TIER 4: EXPERT/LEGENDARY (10 patterns) - Not Yet Implemented
// -----------------------------------------------------------------------
//   ⚪ 6enginecordership.rle, blockpusher.rle, piheptomino.rle
//   ⚪ tumbler.rle (period 14), fireshipgun.rle
//   ⚪ period90glidergun.rle, period156glidergun.rle
//   ⚪ newgun.rle, vacuumgun.rle, bigun.rle
//
// STRATEGIC ROLES:
// -----------------------------------------------------------------------
// Still Lifes     → Defensive bases (block, beehive, boat)
// Oscillators     → Territory markers (pulsar, pentadecathlon)
// Spaceships      → Attack units (glider, LWSS, copperhead)
// Guns            → Factories (Gosper gun, period 14 gun)
// Methuselahs     → Chaos grenades (acorn runs 5,206 generations!)
// Puffers         → Territory expansion (puffer1, blinkerpuffer1)
// Utility         → Tactical tools (eater1, blockpusher)
//
// IMPLEMENTATION STATUS: 33/60 patterns (55%) ✓
// ============================================================================

// Re-export types
export type { PatternInfo, PatternCategory } from './types';
export { CATEGORY_INFO } from './types';

// Import all pattern categories
import { STILL_LIFES } from './stillLifes';
import { OSCILLATORS } from './oscillators';
import { SPACESHIPS } from './spaceships';
import { GUNS } from './guns';
import { METHUSELAHS } from './methuselahs';
import { BIG_BOMBS } from './bigBombs';
import { PUFFERS } from './puffers';
import { SPECIAL } from './special';

// Export individual categories for targeted access
export { STILL_LIFES } from './stillLifes';
export { OSCILLATORS } from './oscillators';
export { SPACESHIPS } from './spaceships';
export { GUNS } from './guns';
export { METHUSELAHS } from './methuselahs';
export { BIG_BOMBS } from './bigBombs';
export { PUFFERS } from './puffers';
export { SPECIAL } from './special';

// Combined pattern library - all 41 patterns
export const PATTERNS = [
  ...STILL_LIFES,      // 5 patterns
  ...OSCILLATORS,      // 8 patterns
  ...SPACESHIPS,       // 7 patterns
  ...GUNS,             // 2 patterns
  ...METHUSELAHS,      // 4 patterns
  ...BIG_BOMBS,        // 8 patterns - massive chaos generators
  ...PUFFERS,          // 3 patterns
  ...SPECIAL,          // 4 patterns
];

// Utility: Get patterns by category
export function getPatternsByCategory(category: string) {
  return PATTERNS.filter(p => p.category === category);
}

// Utility: Get pattern by name
export function getPatternByName(name: string) {
  return PATTERNS.find(p => p.name.toLowerCase() === name.toLowerCase());
}

// Summary for debugging
export const PATTERN_SUMMARY = {
  total: PATTERNS.length,
  byCategory: {
    stillLife: STILL_LIFES.length,
    oscillator: OSCILLATORS.length,
    spaceship: SPACESHIPS.length,
    gun: GUNS.length,
    methuselah: METHUSELAHS.length,
    bigBomb: BIG_BOMBS.length,
    puffer: PUFFERS.length,
    special: SPECIAL.length,
  },
};
