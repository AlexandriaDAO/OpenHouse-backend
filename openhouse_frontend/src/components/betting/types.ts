import { ChipDenomination } from './chipConfig';

// Rail style options
export type RailStyle = 'classic' | 'felt' | 'royal' | 'neon' | 'gold';

export interface RailStyleOption {
  id: RailStyle;
  name: string;
  icon: string;
}

export const RAIL_STYLES: RailStyleOption[] = [
  { id: 'classic', name: 'Classic', icon: '⬛' },
  { id: 'felt', name: 'Green Felt', icon: '🟩' },
  { id: 'royal', name: 'Royal Purple', icon: '🟪' },
  { id: 'neon', name: 'Neon Blue', icon: '🟦' },
  { id: 'gold', name: 'Vegas Gold', icon: '🟨' },
];

// Props passed from parent game component
export interface BettingRailProps {
  betAmount: number;
  onBetChange: (amount: number) => void;
  maxBet: number;
  gameBalance: bigint;
  walletBalance: bigint | null;
  houseBalance: bigint;
  ledgerActor: any;
  gameActor: any;
  onBalanceRefresh: () => void;
  disabled?: boolean;
  multiplier: number;
  canisterId: string;
  gameRoute?: string;
  // Balance loading state - prevents false deposit prompts during initialization
  isBalanceLoading?: boolean;
  isBalanceInitialized?: boolean;
}

// Betting state returned from useBettingState hook
export interface BettingState {
  // Current bet
  betAmount: number;
  gameBalanceUSDT: number;

  // Chip operations
  canAddChip: (chipValue: number) => boolean;
  addChip: (chip: ChipDenomination) => void;
  removeChip: (chipValue: number) => void;
  clearBet: () => void;
  setMaxBet: () => void;

  // Limits
  maxBet: number;
  disabled: boolean;

  // Styling
  railStyle: RailStyle;
  setRailStyle: (style: RailStyle) => void;
  showStylePicker: boolean;
  setShowStylePicker: (show: boolean) => void;

  // Balances (formatted for display)
  gameBalance: bigint;
  walletBalance: bigint | null;
  houseBalance: bigint;
  onBalanceRefresh: () => void;

  // Animation
  showDepositAnimation: boolean;
}

// Deposit flow state returned from useDepositFlow hook
export type DepositStep = 'idle' | 'approving' | 'depositing';

export interface DepositFlowState {
  // Modal
  showModal: boolean;
  openModal: () => void;
  closeModal: () => void;

  // Deposit
  depositAmount: string;
  setDepositAmount: (amount: string) => void;
  handleDeposit: () => Promise<void>;
  depositStep: DepositStep;
  isDepositing: boolean;

  // Withdraw
  handleWithdrawAll: () => Promise<void>;
  isWithdrawing: boolean;

  // Feedback
  error: string | null;
  success: string | null;
  clearMessages: () => void;

  // Context
  walletBalance: bigint | null;
  gameBalance: bigint;
}

// Props for presentational components
export interface ChipSelectorProps {
  onAddChip: (chip: ChipDenomination) => void;
  canAddChip: (value: number) => boolean;
  disabled: boolean;
  size?: 'sm' | 'md';
}

export interface ChipStackProps {
  amount: number;
  onRemoveChip?: (chipValue: number) => void;
  disabled?: boolean;
  maxChipsPerPile?: number;
}

export interface BetDisplayProps {
  betAmount: number;
  maxBet: number;
  gameBalanceUSDT: number;
  onSetMax: () => void;
  onClear: () => void;
  disabled: boolean;
  size?: 'sm' | 'md';
}

export interface BalanceDisplayProps {
  gameBalance: bigint;
  houseBalance: bigint;
  walletBalance?: bigint | null;
  showWallet?: boolean;
  variant?: 'desktop' | 'mobile';
}
