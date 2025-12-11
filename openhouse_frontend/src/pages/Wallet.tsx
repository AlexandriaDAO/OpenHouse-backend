import React, { useState } from 'react';
import { Principal } from '@dfinity/principal';
import { useAuth } from '../providers/AuthProvider';
import { useBalance } from '../providers/BalanceProvider';
import useLedgerActor from '../hooks/actors/useLedgerActor';
import { LoadingModal, SuccessModal, ErrorModal } from '../components/modals';
import { TransferArgs, TransferResult, decimalsToUSDT } from '../types/ledger';
import { parseAmountToE6s } from '../utils/currency';
import { GameBalancesOverview } from '../components/wallet/GameBalancesOverview';

const CKUSDT_FEE = 10_000n; // 0.01 USDT fee (verified on mainnet)

type Tab = 'send' | 'receive';
type DepositMethod = 'cex' | 'bridge';

export const Wallet: React.FC = () => {
  // Hooks
  const { identity, isAuthenticated, principal } = useAuth();
  const { balance, refreshBalance } = useBalance();
  const { actor: ledgerActor } = useLedgerActor();

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('receive');
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('bridge');

  // Form state
  const [destinationPrincipal, setDestinationPrincipal] = useState('');
  const [amount, setAmount] = useState('');
  const [principalError, setPrincipalError] = useState('');
  const [copied, setCopied] = useState(false);

  // Modal state
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Copy principal to clipboard
  const copyPrincipal = async () => {
    if (principal) {
      await navigator.clipboard.writeText(principal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Principal validation
  const validatePrincipal = (principalText: string): boolean => {
    if (!principalText) {
      setPrincipalError("Principal ID is required");
      return false;
    }

    try {
      const p = Principal.fromText(principalText);
      if (p.toText() === principal) {
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
    const value = e.target.value;
    // Allow only digits and one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
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
        } else if ('TooOld' in error) {
          errorMsg = "Transaction expired. Please try again.";
        } else if ('CreatedInFuture' in error) {
          errorMsg = "Clock skew detected. Please check your system time.";
        } else if ('Duplicate' in error) {
          errorMsg = "Duplicate transaction detected. This may have already been processed.";
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

  const amountE6s = parseAmountToE6s(amount);
  const isAmountValid = amountE6s > 0n && (balance ? amountE6s <= balance : false);
  const isFormValid = destinationPrincipal && amount && !principalError && isAmountValid;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-pure-white mb-6">Wallet</h1>

      {!isAuthenticated ? (
        <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">Please connect your wallet to manage your ckUSDT</p>
        </div>
      ) : (
        <>
          {/* Balance Display */}
          <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Available Balance</p>
                <p className="text-3xl font-bold text-pure-white font-mono">
                  {availableBalanceUSDT.toFixed(2)} <span className="text-lg text-gray-400">USDT</span>
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-pure-white text-xl font-bold">
                $
              </div>
            </div>
          </div>

          {/* Game Balances Overview */}
          <div className="mb-6">
            <GameBalancesOverview />
          </div>

          {/* Tabs */}
          <div className="flex mb-6 bg-gray-900 rounded-lg p-1 border border-pure-white/20">
            <button
              onClick={() => setActiveTab('receive')}
              className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors ${
                activeTab === 'receive'
                  ? 'bg-dfinity-turquoise text-pure-black'
                  : 'text-gray-400 hover:text-pure-white'
              }`}
            >
              Receive
            </button>
            <button
              onClick={() => setActiveTab('send')}
              className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors ${
                activeTab === 'send'
                  ? 'bg-dfinity-turquoise text-pure-black'
                  : 'text-gray-400 hover:text-pure-white'
              }`}
            >
              Send
            </button>
          </div>

          {/* Receive Tab */}
          {activeTab === 'receive' && (
            <div className="bg-gray-900 border border-pure-white/20 rounded-lg p-6">
              <h2 className="text-xl font-bold text-pure-white mb-4">Receive ckUSDT</h2>

              {/* Principal Display */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Your Principal ID
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-800 border border-pure-white/10 rounded px-4 py-3 font-mono text-sm text-pure-white break-all">
                    {principal}
                  </div>
                  <button
                    onClick={copyPrincipal}
                    className="px-4 py-3 bg-dfinity-turquoise hover:bg-dfinity-turquoise/80 text-pure-black font-bold rounded transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-yellow-500 mt-2">Only send ckUSDT to this address</p>
              </div>

              {/* How to Get ckUSDT Expander */}
              <details className="bg-gray-800 border border-pure-white/10 rounded-lg overflow-hidden">
                <summary className="cursor-pointer px-4 py-3 font-medium text-pure-white hover:bg-gray-750 transition-colors flex items-center justify-between">
                  <span>How to get ckUSDT</span>
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>

                <div className="p-4 space-y-4 border-t border-pure-white/10">
                  {/* Deposit Method Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Choose deposit method:
                    </label>
                    <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
                      <button
                        onClick={() => setDepositMethod('bridge')}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          depositMethod === 'bridge'
                            ? 'bg-dfinity-turquoise text-pure-black'
                            : 'text-gray-400 hover:text-pure-white'
                        }`}
                      >
                        Bridge from ETH
                      </button>
                      <button
                        onClick={() => setDepositMethod('cex')}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          depositMethod === 'cex'
                            ? 'bg-dfinity-turquoise text-pure-black'
                            : 'text-gray-400 hover:text-pure-white'
                        }`}
                      >
                        From Exchange
                      </button>
                    </div>
                  </div>

                  {/* Bridge Method Instructions */}
                  {depositMethod === 'bridge' && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400">
                        Convert your ERC-20 USDT to ckUSDT using one of these trusted bridges:
                      </p>

                      <div className="space-y-2">
                        {/* NNS Wallet Option */}
                        <a
                          href="https://nns.ic0.app/wallet/?u=cngnf-vqaaa-aaaar-qag4q-cai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-900 border border-pure-white/10 rounded-lg hover:border-dfinity-turquoise/50 transition-colors group"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-pure-white font-bold">NNS</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-pure-white font-bold text-sm group-hover:text-dfinity-turquoise transition-colors">NNS Wallet</span>
                              <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Official</span>
                            </div>
                            <p className="text-xs text-gray-400">DFINITY's official wallet</p>
                          </div>
                          <svg className="w-4 h-4 text-gray-400 group-hover:text-dfinity-turquoise transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>

                        {/* ICPSwap Option */}
                        <a
                          href="https://app.icpswap.com/ck-bridge"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-900 border border-pure-white/10 rounded-lg hover:border-dfinity-turquoise/50 transition-colors group"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-pure-white font-bold text-sm">ICP</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-pure-white font-bold text-sm group-hover:text-dfinity-turquoise transition-colors">ICPSwap Bridge</span>
                              <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">DEX</span>
                            </div>
                            <p className="text-xs text-gray-400">Popular ICP DEX</p>
                          </div>
                          <svg className="w-4 h-4 text-gray-400 group-hover:text-dfinity-turquoise transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>

                        {/* Oisy Wallet Option */}
                        <a
                          href="https://oisy.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-900 border border-pure-white/10 rounded-lg hover:border-dfinity-turquoise/50 transition-colors group"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-pure-white font-bold">O</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-pure-white font-bold text-sm group-hover:text-dfinity-turquoise transition-colors">Oisy Wallet</span>
                              <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Multi-chain</span>
                            </div>
                            <p className="text-xs text-gray-400">ETH to ICP bridging</p>
                          </div>
                          <svg className="w-4 h-4 text-gray-400 group-hover:text-dfinity-turquoise transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>

                      <div className="bg-gray-900 border border-pure-white/10 rounded-lg p-3 mt-3">
                        <h4 className="font-medium text-pure-white text-sm mb-2">How it works:</h4>
                        <div className="space-y-1.5 text-xs text-gray-400">
                          <div className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-dfinity-turquoise/20 text-dfinity-turquoise flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                            <span>Connect your ETH wallet to the bridge</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-dfinity-turquoise/20 text-dfinity-turquoise flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                            <span>Deposit ERC-20 USDT to receive ckUSDT</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-dfinity-turquoise/20 text-dfinity-turquoise flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                            <span>Send ckUSDT to your Principal ID above</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CEX Method Instructions */}
                  {depositMethod === 'cex' && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-dfinity-turquoise text-pure-black flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                          <p className="text-gray-300 text-sm">
                            Get ckUSDT from an exchange or swap on an ICP DEX
                          </p>
                        </div>

                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-dfinity-turquoise text-pure-black flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                          <p className="text-gray-300 text-sm">
                            Copy your Principal ID above as destination
                          </p>
                        </div>

                        <div className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-dfinity-turquoise text-pure-black flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                          <p className="text-gray-300 text-sm">
                            Balance updates automatically after confirmation
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Do Not Send Warning */}
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mt-3">
                    <h4 className="font-bold text-red-400 text-sm mb-1">Do NOT send directly:</h4>
                    <ul className="text-xs text-red-400/80 space-y-0.5 list-disc list-inside">
                      <li>USDT on Ethereum (ERC-20) - use a bridge instead</li>
                      <li>USDT on Tron (TRC-20) or BSC (BEP-20)</li>
                      <li>Any non-ICP based USDT</li>
                    </ul>
                    <p className="text-xs text-red-400/80 mt-1.5">
                      Sending wrong tokens = <strong>permanent loss</strong>.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Send Tab */}
          {activeTab === 'send' && (
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
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        value={amount}
                        onChange={handleAmountChange}
                        placeholder="0.00"
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
        </>
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
