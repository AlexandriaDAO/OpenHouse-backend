// Pattern categories for MMO Game of Life
export type PatternCategory =
  | 'stillLife'    // Stable structures - defensive building blocks
  | 'oscillator'   // Pulsing patterns - visual interest
  | 'spaceship'    // Moving patterns - attack units
  | 'gun'          // Factories that produce spaceships
  | 'methuselah'   // Chaos generators - small patterns with long evolutions
  | 'puffer'       // Trail makers - leave debris as they move
  | 'special';     // Unique interactions - reflectors, eaters, etc.

export interface PatternInfo {
  name: string;
  rle: string;
  category: PatternCategory;
  description: string;
  // Optional metadata
  cells?: number;      // Number of live cells
  period?: number;     // For oscillators/guns
  speed?: string;      // For spaceships (e.g., "c/4", "c/2")
  lifespan?: number;   // For methuselahs
  essential?: boolean; // Show in basic mode (non-advanced)
}

// Category display info for UI
// Order determines display order in sidebar: Spaceships, Puffers, Guns, Bombs, Defense, Oscillators, Special
export const CATEGORY_INFO: Record<PatternCategory, { label: string; color: string; icon: string; description: string }> = {
  spaceship: {
    label: 'Spaceships',
    color: 'text-blue-400 border-blue-500/50 bg-blue-500/10',
    icon: '>',
    description: 'Mobile attack units',
  },
  puffer: {
    label: 'Puffers',
    color: 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10',
    icon: '~',
    description: 'Trail-leaving ships',
  },
  gun: {
    label: 'Guns',
    color: 'text-red-400 border-red-500/50 bg-red-500/10',
    icon: '*',
    description: 'Spaceship factories',
  },
  methuselah: {
    label: 'Bombs',
    color: 'text-orange-400 border-orange-500/50 bg-orange-500/10',
    icon: '!',
    description: 'Chaos grenades',
  },
  stillLife: {
    label: 'Defense',
    color: 'text-green-400 border-green-500/50 bg-green-500/10',
    icon: '#',
    description: 'Stable defensive structures',
  },
  oscillator: {
    label: 'Oscillators',
    color: 'text-purple-400 border-purple-500/50 bg-purple-500/10',
    icon: 'o',
    description: 'Pulsing territory markers',
  },
  special: {
    label: 'Special',
    color: 'text-cyan-400 border-cyan-500/50 bg-cyan-500/10',
    icon: '@',
    description: 'Unique interactions',
  },
};
