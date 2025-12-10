import { GameType } from '../types/balance';

export interface GameTheme {
  primary: string;      // Tailwind color class: 'dfinity-turquoise', 'orange-500', 'purple-500'
  accent: string;       // Secondary color
  gradient: string;     // Gradient for backgrounds
}

export interface GameConfig {
  // Identification
  id: GameType;
  name: string;
  icon: string;

  // Backend
  canisterId: string;

  // Routes
  routes: {
    base: string;
  };

  // Liquidity config
  liquidity: {
    enabled: boolean;
    minDeposit: number;
    hasStatistics: boolean;
    withdrawalFeePercent: number;
  };

  // Visual theming
  theme: GameTheme;
}

export const GAME_REGISTRY: Record<string, GameConfig> = {
  dice: {
    id: 'dice',
    name: 'Dice',
    icon: '🎲',
    canisterId: 'whchi-hyaaa-aaaao-a4ruq-cai',
    routes: { base: '/dice' },
    liquidity: { enabled: true, minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'dfinity-turquoise',
      accent: 'purple-400',
      gradient: 'from-dfinity-turquoise/5 to-transparent',
    },
  },
  plinko: {
    id: 'plinko',
    name: 'Plinko',
    icon: '🔴',
    canisterId: 'weupr-2qaaa-aaaap-abl3q-cai',
    routes: { base: '/plinko' },
    liquidity: { enabled: true, minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'orange-500',
      accent: 'yellow-400',
      gradient: 'from-orange-500/5 to-transparent',
    },
  },
  roulette: {
    id: 'roulette',
    name: 'Roulette',
    icon: '🃏',
    canisterId: 'wvrcw-3aaaa-aaaah-arm4a-cai',
    routes: { base: '/roulette' },
    liquidity: { enabled: false, minDeposit: 10, hasStatistics: false, withdrawalFeePercent: 1 },
    theme: {
      primary: 'green-500',
      accent: 'emerald-400',
      gradient: 'from-green-500/5 to-transparent',
    },
  },
};

// Helper functions
export const getGameConfig = (gameId: GameType): GameConfig | undefined => GAME_REGISTRY[gameId];
export const getLiquidityGames = (): GameConfig[] => Object.values(GAME_REGISTRY).filter(g => g.liquidity.enabled);

/*
  TAILWIND SAFELIST
  Used for dynamic color construction: text-${theme.primary}, bg-${theme.primary}, etc.
  
  Primary Colors:
  text-dfinity-turquoise bg-dfinity-turquoise border-dfinity-turquoise from-dfinity-turquoise/5
  text-orange-500 bg-orange-500 border-orange-500 from-orange-500/5
  text-green-500 bg-green-500 border-green-500 from-green-500/5
  
  Accent Colors:
  text-purple-400
  text-yellow-400
  text-emerald-400
  
  Hover/Opacities:
  hover:text-dfinity-turquoise/80 hover:bg-dfinity-turquoise/90
  hover:text-orange-500/80 hover:bg-orange-500/90
  hover:text-green-500/80 hover:bg-green-500/90
  
  Borders:
  border-dfinity-turquoise/20 border-dfinity-turquoise/30
  border-orange-500/20 border-orange-500/30
  border-green-500/20 border-green-500/30
  
  Backgrounds:
  bg-dfinity-turquoise/10 bg-dfinity-turquoise/20
  bg-orange-500/10 bg-orange-500/20
  bg-green-500/10 bg-green-500/20
*/
