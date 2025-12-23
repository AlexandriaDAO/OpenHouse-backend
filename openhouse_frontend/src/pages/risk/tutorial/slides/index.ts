// Slide definitions for Risk tutorial

import { SlideDefinition } from '../types';

export const TUTORIAL_SLIDES: SlideDefinition[] = [
  {
    id: 'place-cells',
    title: 'Place Cells in Your Base',
    description: 'Click inside the glowing base to place a Glider. Watch it claim territory as it moves!',
    implemented: true,
  },
  {
    id: 'attack-territory',
    title: 'Attack Enemy Territory',
    description: 'Send your glider toward the enemy base. Each time your cells touch enemy territory, they lose coins from their base!',
    implemented: true,
  },
  {
    id: 'territory-cutoff',
    title: 'Protect Your Territory',
    description: 'Territory that gets cut off from your base is lost! Keep your cells connected to maintain control.',
    implemented: false,
  },
  {
    id: 'attack-strategy',
    title: 'Winning Strategy: Wall Siege',
    description: 'Place a stationary block (2x2) next to enemy walls. It will continuously drain their coins without dying!',
    implemented: false,
  },
  {
    id: 'wipers',
    title: 'Beware the Wipers',
    description: 'Every 5 minutes, a quadrant gets wiped clean. Watch the timer and avoid getting caught!',
    implemented: false,
  },
  {
    id: 'coins-economy',
    title: 'The Coin Economy',
    description: 'Earn coins from your territory. Spend coins to place cells. Drain enemy coins by touching their territory!',
    implemented: false,
  },
];

// Get slide by ID
export const getSlideById = (id: string): SlideDefinition | undefined =>
  TUTORIAL_SLIDES.find(s => s.id === id);

// Get slide by index
export const getSlideByIndex = (index: number): SlideDefinition | undefined =>
  TUTORIAL_SLIDES[index];
