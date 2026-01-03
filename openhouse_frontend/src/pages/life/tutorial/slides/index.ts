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
    description: 'Send your glider toward the enemy base. Each blocked birth steals 10 coins from their base to your wallet!',
    implemented: true,
  },
  {
    id: 'territory-cutoff',
    title: 'Protect Your Territory',
    description: 'Territory that gets cut off from your base is lost! Keep your cells connected to maintain control.',
    implemented: true,
  },
  {
    id: 'attack-strategy',
    title: 'Winning Strategy: Wall Siege',
    description: 'Place a stationary block (2x2) next to enemy walls. Each blocked birth drains 10 coins - a 10x return on your 1 coin placement!',
    implemented: true,
  },
  {
    id: 'wipers',
    title: 'Beware the Wipers',
    description: 'Every 2 minutes, a quadrant gets wiped clean. Watch the timer and avoid getting caught!',
    implemented: true,
  },
  {
    id: 'coins-economy',
    title: 'The Coin Economy',
    description: 'Place cells for 1 coin each. Siege enemy walls to steal 10 coins per hit. Use the faucet to get more!',
    implemented: true,
  },
];

// Get slide by ID
export const getSlideById = (id: string): SlideDefinition | undefined =>
  TUTORIAL_SLIDES.find(s => s.id === id);

// Get slide by index
export const getSlideByIndex = (index: number): SlideDefinition | undefined =>
  TUTORIAL_SLIDES[index];
