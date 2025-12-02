import React, { useState } from 'react';
import { Principal } from '@dfinity/principal';
import { useAuth } from '../providers/AuthProvider';
import { useBalance } from '../providers/BalanceProvider';
import useLedgerActor from '../hooks/actors/useLedgerActor';
import { LoadingModal, SuccessModal, ErrorModal } from '../components/modals';
import { TransferArgs, TransferResult, decimalsToUSDT } from '../types/ledger';
import { parseAmountToE6s } from '../utils/currency';

const CKUSDT_FEE = 10_000n; // 0.01 USDT fee (verified on mainnet)

export const Send: React.FC = () => {
  // Hooks
  const { identity, isAuthenticated, principal } = useAuth();
  const { balance, refreshBalance } = useBalance();
  const { actor: ledgerActor } = useLedgerActor();

  // Form state
  const [destinationPrincipal, setDestinationPrincipal] = useState('');
  const [amount, setAmount] = useState('');
  const [principalError, setPrincipalError] = useState('');

  // Modal state
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Principal validation
  const validatePrincipal = (principalText: string): boolean => {
    if (!principalText) {
      setPrincipalError("Principal ID is required");
      return false;
    }

    try {
      const p = Principal.fromText(principalText);
      if (p.toText() === principal?.toText()) {
        setPrincipalError("Cannot send to yourself");
        return false;
      }
      setPrincipalError("");
      return true;
    } catch (error) {
      setPrincipalError("Invalid Principal ID format");
      return false;
    }
  };

  // Handle principal input change
  const handlePrincipalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDestinationPrincipal(value);
    if (value) validatePrincipal(value);
  };

  // Handle amount input change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  // Max button - sets amount to balance minus fee
  const handleMaxClick = () => {
    if (!balance) return;

    const maxAmount = balance - CKUSDT_FEE;
    if (maxAmount <= 0n) {
      setAmount('0');
      return;
    }

    // Convert to USDT (6 decimals)
    const maxUSDT = decimalsToUSDT(maxAmount);
    setAmount(maxUSDT.toString());
  };

  // Transfer submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!isAuthenticated || !ledgerActor || !identity) {
      setErrorMessage("Please connect your wallet first");
      setShowError(true);
      return;
    }

    if (!validatePrincipal(destinationPrincipal)) {
      return;
    }

    // Safe parsing using string manipulation
    const amountE6s = parseAmountToE6s(amount);
    
    if (amountE6s <= CKUSDT_FEE) {
      setErrorMessage(`Amount must be greater than the network fee (${decimalsToUSDT(CKUSDT_FEE)} USDT)`);
      setShowError(true);
      return;
    }

    if (!balance || amountE6s > balance) {
      setErrorMessage("Insufficient balance");
      setShowError(true);
      return;
    }

    // Show loading modal
    setIsLoading(true);

    try {
      // Prepare transfer args
      const transferArgs: TransferArgs = {
        to: {
          owner: Principal.fromText(destinationPrincipal),
          subaccount: [], // No subaccount
        },
        amount: amountE6s,
        fee: [], // Use default fee
        memo: [], // No memo
        from_subaccount: [], // Default subaccount
        created_at_time: [], // Let ledger set timestamp
      };

      // Execute transfer
      const result: TransferResult = await ledgerActor.icrc1_transfer(transferArgs);

      // Handle result
      if ('Ok' in result) {
        // Success - result.Ok contains block index
        setIsLoading(false);
        setShowSuccess(true);

        // Refresh balance
        await refreshBalance();

        // Reset form
        setDestinationPrincipal('');
        setAmount('');
      } else {
        // Error - parse error type
        const error = result.Err;
        let errorMsg = "Transfer failed";

        if ('InsufficientFunds' in error) {
          errorMsg = `Insufficient funds. Balance: ${decimalsToUSDT(error.InsufficientFunds.balance)} USDT`;
        } else if ('BadFee' in error) {
          errorMsg = `Incorrect fee. Expected: ${decimalsToUSDT(error.BadFee.expected_fee)} USDT`;
        } else if ('GenericError' in error) {
          errorMsg = error.GenericError.message;
        } else if ('TemporarilyUnavailable' in error) {
          errorMsg = "Service temporarily unavailable. Please try again.";
        }

        setIsLoading(false);
        setErrorMessage(errorMsg);
        setShowError(true);
      }
    } catch (error) {
      console.error('Transfer error:', error);
      setIsLoading(false);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setShowError(true);
    }
  };

  // Calculate available balance display
  const availableBalanceUSDT = balance ? decimalsToUSDT(balance) : 0;
  const isFormValid = destinationPrincipal && amount && !principalError && parseFloat(amount) > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-pure-white mb-6">Send ckUSDT</h1>

      {!isAuthenticated ? (
        <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">Please connect your wallet to send ckUSDT</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form - Left Side */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-gray-900 border border-pure-white/20 rounded-lg p-6">
              {/* Step 1: Token Display */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-dfinity-turquoise text-pure-black text-xs font-bold mr-2">1</span>
                  Token
                </label>
                <div className="bg-gray-800 border border-pure-white/10 rounded p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-pure-white font-bold">
                      $
                    </div>
                    <div>
                      <div className="text-pure-white font-bold">ckUSDT</div>
                      <div className="text-xs text-gray-400">Fee: ~{decimalsToUSDT(CKUSDT_FEE)} USDT</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Destination Principal */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-dfinity-turquoise text-pure-black text-xs font-bold mr-2">2</span>
                  Recipient Principal ID
                </label>
                <input
                  type="text"
                  value={destinationPrincipal}
                  onChange={handlePrincipalChange}
                  placeholder="Enter recipient's Principal ID"
                  className={`w-full bg-gray-800 border ${principalError ? 'border-red-500' : 'border-pure-white/10'} rounded px-4 py-3 text-pure-white placeholder-gray-500 focus:outline-none focus:border-dfinity-turquoise`}
                />
                {principalError && (
                  <p className="text-red-500 text-sm mt-2">{principalError}</p>
                )}
              </div>

              {/* Step 3: Amount */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-dfinity-turquoise text-pure-black text-xs font-bold mr-2">3</span>
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    step="0.000001"
                    min="0"
                    className="w-full bg-gray-800 border border-pure-white/10 rounded px-4 py-3 pr-20 text-pure-white placeholder-gray-500 focus:outline-none focus:border-dfinity-turquoise"
                  />
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-dfinity-turquoise/20 hover:bg-dfinity-turquoise/30 text-dfinity-turquoise text-sm font-bold rounded transition-colors"
                  >
                    MAX
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-pure-white text-xs font-bold">
                    $
                  </div>
                  <span>Available: {availableBalanceUSDT.toFixed(6)} USDT</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid}
                className="w-full py-4 bg-dfinity-turquoise hover:bg-dfinity-turquoise/80 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-pure-black font-bold rounded transition-colors"
              >
                Send ckUSDT
              </button>
            </form>
          </div>

          {/* Transaction Summary - Right Side */}
          <div className="lg:col-span-1">
            <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-6 sticky top-4">
              <h3 className="text-lg font-bold text-pure-white mb-4">Transaction Summary</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Send Amount</span>
                  <span className="text-pure-white font-mono">
                    {amount || '0.00'} USDT
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Network Fee</span>
                  <span className="text-pure-white font-mono">
                    ~{decimalsToUSDT(CKUSDT_FEE)} USDT
                  </span>
                </div>

                <div className="border-t border-pure-white/10 pt-3 flex justify-between">
                  <span className="text-gray-400">Send To</span>
                  <span className="text-pure-white font-mono text-xs truncate ml-2 max-w-[150px]" title={destinationPrincipal}>
                    {destinationPrincipal || '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <LoadingModal
        isOpen={isLoading}
        title="Transfer in Progress"
        message="Your transaction is being processed on the Internet Computer..."
      />

      <SuccessModal
        isOpen={showSuccess}
        title="Transfer Successful!"
        message="Your ckUSDT has been sent successfully."
        onClose={() => setShowSuccess(false)}
      />

      <ErrorModal
        isOpen={showError}
        title="Transfer Failed"
        message={errorMessage}
        onClose={() => setShowError(false)}
      />
    </div>
  );
};
