import { GameType } from '../types/balance';

export interface GameTheme {
  primary: string;      // Tailwind color class: 'dfinity-turquoise', 'orange-500', 'purple-500'
  accent: string;       // Secondary color
  gradient: string;     // Gradient for backgrounds
}

// Game status determines route access and display behavior
export type GameStatus = 'live' | 'coming_soon' | 'maintenance' | 'admin_only';

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

  // Page visibility flags - controls which pages show this game
  pages: {
    home: boolean;        // Show on homepage game selection
    admin: boolean;       // Show in admin dashboard
    liquidity: boolean;   // Show in liquidity pools
  };

  // Auth & Status
  status: GameStatus;     // Game availability status
  requiresAuth: boolean;  // Route requires authentication

  // Display metadata
  description: string;    // Short description for homepage
  sortOrder: number;      // Control display order (lower = first)
  minBet: number;         // Minimum bet in USDT
  maxWin: number;         // Maximum win in USDT
  houseEdge: number;      // House edge percentage

  // Liquidity config
  liquidity: {
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
    pages: { home: true, admin: true, liquidity: true },
    status: 'live',
    requiresAuth: false,
    description: 'Roll 0-100, predict over/under!',
    sortOrder: 1,
    minBet: 0.01,
    maxWin: 10,
    houseEdge: 0.99,
    liquidity: { minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'dfinity-turquoise',
      accent: 'purple-400',
      gradient: 'from-dfinity-turquoise/5 to-transparent',
    },
  },
  plinko: {
    id: 'plinko',
    name: 'Plinko',
    icon: '🎯',
    canisterId: 'weupr-2qaaa-aaaap-abl3q-cai',
    routes: { base: '/plinko' },
    pages: { home: true, admin: true, liquidity: true },
    status: 'live',
    requiresAuth: false,
    description: 'Drop the ball and watch it bounce to a multiplier',
    sortOrder: 2,
    minBet: 0.01,
    maxWin: 1000,
    houseEdge: 1,
    liquidity: { minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'orange-500',
      accent: 'yellow-400',
      gradient: 'from-orange-500/5 to-transparent',
    },
  },
  crash: {
    id: 'crash',
    name: 'Crash',
    icon: '🚀',
    canisterId: 'fws6k-tyaaa-aaaap-qqc7q-cai',
    routes: { base: '/crash' },
    pages: { home: true, admin: true, liquidity: true },
    status: 'admin_only',
    requiresAuth: true,
    description: 'Watch the multiplier rise and cash out before it crashes',
    sortOrder: 3,
    minBet: 1,
    maxWin: 1000,
    houseEdge: 1,
    liquidity: { minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'purple-500',
      accent: 'pink-400',
      gradient: 'from-purple-500/5 to-transparent',
    },
  },
  roulette: {
    id: 'roulette',
    name: 'Roulette',
    icon: '🎰',
    canisterId: 'wvrcw-3aaaa-aaaah-arm4a-cai',
    routes: { base: '/roulette' },
    pages: { home: true, admin: true, liquidity: true },
    status: 'admin_only',
    requiresAuth: true,
    description: 'European roulette with transparent odds',
    sortOrder: 4,
    minBet: 0.01,
    maxWin: 100,
    houseEdge: 2.7,
    liquidity: { minDeposit: 10, hasStatistics: true, withdrawalFeePercent: 1 },
    theme: {
      primary: 'red-600',
      accent: 'yellow-500',
      gradient: 'from-red-600/5 to-transparent',
    },
  },
};

// Helper functions
export const getGameConfig = (gameId: GameType): GameConfig | undefined => GAME_REGISTRY[gameId];

// Get games for specific pages (sorted by sortOrder)
export const getHomeGames = (): GameConfig[] =>
  Object.values(GAME_REGISTRY)
    .filter(g => g.pages.home)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const getAdminGames = (): GameConfig[] =>
  Object.values(GAME_REGISTRY)
    .filter(g => g.pages.admin)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const getLiquidityGames = (): GameConfig[] =>
  Object.values(GAME_REGISTRY)
    .filter(g => g.pages.liquidity)
    .sort((a, b) => a.sortOrder - b.sortOrder);

// Filter by status
export const getGamesByStatus = (status: GameStatus): GameConfig[] =>
  Object.values(GAME_REGISTRY)
    .filter(g => g.status === status)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const getLiveGames = (): GameConfig[] => getGamesByStatus('live');

// Get all game IDs for type-safe iteration
export const getAllGameIds = (): GameType[] =>
  Object.values(GAME_REGISTRY).map(g => g.id);

// Convert GameConfig to GameInfo format (for GameCard component)
export interface GameInfo {
  id: string;
  name: string;
  description: string;
  minBet: number;
  maxWin: number;
  houseEdge: number;
  path: string;
  icon: string;
  badge?: string;
  comingSoon?: boolean;
}

export const toGameInfo = (config: GameConfig): GameInfo => ({
  id: config.id,
  name: config.name,
  description: config.description,
  minBet: config.minBet,
  maxWin: config.maxWin,
  houseEdge: config.houseEdge,
  path: config.routes.base,
  icon: config.icon,
  comingSoon: config.status === 'coming_soon' || config.status === 'admin_only',
});

// Get home games as GameInfo array (ready for GameCard)
export const getHomeGamesInfo = (): GameInfo[] =>
  getHomeGames().map(toGameInfo);

/*
  TAILWIND SAFELIST
  Used for dynamic color construction: text-${theme.primary}, bg-${theme.primary}, etc.

  Primary Colors:
  text-dfinity-turquoise bg-dfinity-turquoise border-dfinity-turquoise from-dfinity-turquoise/5
  text-orange-500 bg-orange-500 border-orange-500 from-orange-500/5
  text-green-500 bg-green-500 border-green-500 from-green-500/5
  text-purple-500 bg-purple-500 border-purple-500 from-purple-500/5

  Accent Colors:
  text-purple-400
  text-yellow-400
  text-emerald-400
  text-pink-400

  Hover/Opacities:
  hover:text-dfinity-turquoise/80 hover:bg-dfinity-turquoise/90
  hover:text-orange-500/80 hover:bg-orange-500/90
  hover:text-green-500/80 hover:bg-green-500/90
  hover:text-purple-500/80 hover:bg-purple-500/90

  Borders:
  border-dfinity-turquoise/20 border-dfinity-turquoise/30
  border-orange-500/20 border-orange-500/30
  border-green-500/20 border-green-500/30
  border-purple-500/20 border-purple-500/30

  Backgrounds:
  bg-dfinity-turquoise/10 bg-dfinity-turquoise/20
  bg-orange-500/10 bg-orange-500/20
  bg-green-500/10 bg-green-500/20
  bg-purple-500/10 bg-purple-500/20
*/
