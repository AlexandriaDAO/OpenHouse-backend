import { useState, useCallback } from 'react';
import { Principal } from '@dfinity/principal';
import { GameType, DECIMALS_PER_CKUSDT, TRANSFER_FEE } from '../../types/balance';
import { useGameActor } from '../actors/useGameActor';
import useLedgerActor from '../actors/useLedgerActor';
import { useAuth } from '../../providers/AuthProvider';
import { getGameConfig } from '../../config/gameRegistry';

export function useDepositFlow(gameId: GameType, onSuccess?: () => void) {
  const config = getGameConfig(gameId);
  const { actor: gameActor, isReady } = useGameActor(gameId);
  const { actor: ledgerActor } = useLedgerActor();
  const { principal } = useAuth();

  const [depositAmount, setDepositAmount] = useState('10');
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const handleMaxClick = useCallback((walletBalance: bigint) => {
    const twoFees = BigInt(2 * TRANSFER_FEE);
    const maxAmount = walletBalance > twoFees ? walletBalance - twoFees : BigInt(0);
    const maxUSDT = Number(maxAmount) / DECIMALS_PER_CKUSDT;
    setDepositAmount(maxUSDT.toFixed(2));
  }, []);

  const handleDeposit = useCallback(async () => {
    if (!gameActor || !isReady || !ledgerActor || !principal || !config) return;

    setIsDepositing(true);
    clearMessages();

    try {
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * DECIMALS_PER_CKUSDT));
      const minDeposit = BigInt(config.liquidity.minDeposit * DECIMALS_PER_CKUSDT);

      if (amount < minDeposit) {
        setError(`Minimum LP deposit is ${config.liquidity.minDeposit} USDT`);
        setIsDepositing(false);
        return;
      }

      // Step 1: ICRC-2 Approval
      const backendPrincipal = Principal.fromText(config.canisterId);
      const approvalAmount = amount + BigInt(TRANSFER_FEE);

      const approveArgs = {
        spender: { owner: backendPrincipal, subaccount: [] as [] },
        amount: approvalAmount,
        fee: [] as [],
        memo: [] as [],
        from_subaccount: [] as [],
        created_at_time: [] as [],
        expected_allowance: [] as [],
        expires_at: [] as [],
      };

      const approveResult = await ledgerActor.icrc2_approve(approveArgs);
      if ('Err' in approveResult) {
        throw new Error(`Approval failed: ${JSON.stringify(approveResult.Err)}`);
      }

      // Step 2: Deposit liquidity
      const result = await gameActor.deposit_liquidity(amount, []);

      if ('Ok' in result) {
        const shares = result.Ok;
        setSuccess(`Deposited ${depositAmount} USDT! Received ${shares.toString()} shares`);
        setDepositAmount('10');
        onSuccess?.();
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
    }
  }, [gameActor, isReady, ledgerActor, principal, config, depositAmount, clearMessages, onSuccess]);

  return {
    depositAmount,
    setDepositAmount,
    isDepositing,
    error,
    success,
    handleDeposit,
    handleMaxClick,
    clearMessages,
  };
}
