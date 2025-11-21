import { Identity } from '@dfinity/agent';

export interface AuthState {
  identity: Identity | null;
  isAuthenticated: boolean;
  principal: string | null;
}

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
}
