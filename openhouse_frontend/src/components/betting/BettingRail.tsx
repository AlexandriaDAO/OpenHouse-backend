import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBettingState } from './hooks/useBettingState';
import { useDepositFlow } from './hooks/useDepositFlow';
import { ChipStack } from './ChipStack';
import { ChipSelector } from './ChipSelector';
import { DepositModal } from './DepositModal';
import { RAIL_STYLES } from './types';
import { formatUSDT } from '../../types/balance';
import './betting.css';

export type { BettingRailProps, RailStyle } from './types';
export { RAIL_STYLES } from './types';

export function BettingRail(props: any) {
  const navigate = useNavigate();

  const betting = useBettingState(props);
  const deposit = useDepositFlow(props);

  // Cash out confirmation modal
  const [showCashOutModal, setShowCashOutModal] = useState(false);

  const {
    betAmount,
    gameBalanceUSDT,
    maxBet,
    disabled,
    canAddChip,
    addChip,
    removeChip,
    clearBet,
    setMaxBet,
    railStyle,
    setRailStyle,
    showStylePicker,
    setShowStylePicker,
    gameBalance,
    houseBalance,
    onBalanceRefresh,
    showDepositAnimation,
  } = betting;


  const atMax = betAmount >= maxBet || betAmount >= gameBalanceUSDT;

  // Handle cash out with confirmation
  const handleCashOutClick = () => {
    if (gameBalance > 0n) {
      setShowCashOutModal(true);
    }
  };

  const confirmCashOut = async () => {
    setShowCashOutModal(false);
    await deposit.handleWithdrawAll();
  };

  // ==========================================================================
  // Compact Sub-components
  // ==========================================================================

  const CompactBalances = () => (
    <div className="compact-balances">
      <button onClick={onBalanceRefresh} className="refresh-btn-top" title="Refresh Balances">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 12c0-4.4 3.6-8 8-8 3.1 0 5.8 1.8 7.1 4.4M20 12c0 4.4-3.6 8-8 8-3.1 0-5.8-1.8-7.1-4.4"/>
          <path d="M20 4v4h-4M4 20v-4h4"/>
        </svg>
      </button>
      <div className="balance-row">
        <span className="balance-label">CHIPS</span>
        <span className="balance-value text-highlight">{formatUSDT(gameBalance)}</span>
      </div>
      <div className="balance-row">
        <span className="balance-label">HOUSE</span>
        <span className="balance-value">{formatUSDT(houseBalance)}</span>
      </div>
    </div>
  );

  const ActionPill = () => (
    <div className="action-pill">
      <button
        onClick={handleCashOutClick}
        disabled={deposit.isWithdrawing || gameBalance === 0n}
        className="action-pill-btn action-pill-btn--withdraw"
        title="Cash Out"
      >
        -
      </button>
      <button
        onClick={() => navigate('/liquidity')}
        className="action-pill-btn action-pill-btn--house"
        title="Be The House"
      >
        ⌂
      </button>
      <button
        onClick={deposit.openModal}
        className={`action-pill-btn action-pill-btn--deposit ${showDepositAnimation ? 'deposit-pulse' : ''}`}
        title="Buy Chips"
      >
        +
      </button>
    </div>
  );

  const BetDisplay = () => (
    <div className="bet-display-pill">
      <button
        onClick={clearBet}
        disabled={disabled || betAmount === 0}
        className="clear-text-btn"
      >
        CLR
      </button>
      <span className="bet-amount-text">${betAmount.toFixed(2)}</span>
      <button
        onClick={setMaxBet}
        disabled={disabled || atMax}
        className="max-text-btn"
      >
        MAX
      </button>
    </div>
  );

  // Cash Out Confirmation Modal
  const CashOutModal = () => (
    <div className="modal-overlay" onClick={() => setShowCashOutModal(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>Cash Out</h3>
        <p>Withdraw all {formatUSDT(gameBalance)} chips to your wallet?</p>
        <div className="modal-buttons">
          <button onClick={() => setShowCashOutModal(false)} className="modal-btn modal-btn--cancel">
            Cancel
          </button>
          <button onClick={confirmCashOut} className="modal-btn modal-btn--confirm">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* DESKTOP LAYOUT */}
      <div className="hidden md:block fixed bottom-0 left-0 right-0 z-40">
        <div className="betting-rail-desktop rail-theme--neon">
          <div className="rail-desktop-content">

            {/* LEFT: Balances */}
            <div className="rail-left">
              <CompactBalances />
            </div>

            {/* CENTER: Chip Stack + Selectors */}
            <div className="rail-center">
              <div className="rail-center-content">
                <div className="desktop-stack-wrapper">
                  <ChipStack
                    amount={betAmount}
                    onRemoveChip={removeChip}
                    disabled={disabled}
                    maxChipsPerPile={8}
                  />
                </div>
                <div className="chip-selector-row">
                  <ChipSelector
                    onAddChip={addChip}
                    canAddChip={canAddChip}
                    disabled={disabled}
                    size="md"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT: Bet Display + Action Pill */}
            <div className="rail-right">
              <div className="rail-right-stack">
                <BetDisplay />
                <ActionPill />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* MOBILE LAYOUT */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        {/* Mobile rail with curved top border */}
        <div className={`betting-rail-mobile rail-theme--${railStyle}`}>

          <div className="mobile-rail-grid">
            {/* 3-column layout: balances | pot | chips */}
            <div className="mobile-three-col">
              {/* LEFT: Balances with bet controls in first row */}
              <div className="mobile-col-balances">
                <div className="mobile-bet-row">
                  <button onClick={onBalanceRefresh} className="mobile-sync-icon" title="Refresh">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M4 12c0-4.4 3.6-8 8-8 3.1 0 5.8 1.8 7.1 4.4M20 12c0 4.4-3.6 8-8 8-3.1 0-5.8-1.8-7.1-4.4"/>
                      <path d="M20 4v4h-4M4 20v-4h4"/>
                    </svg>
                  </button>
                  <button
                    onClick={clearBet}
                    disabled={disabled || betAmount === 0}
                    className="mobile-bet-ctrl mobile-bet-ctrl--clr"
                  >
                    CLR
                  </button>
                  <span className="mobile-bet-value">${betAmount.toFixed(2)}</span>
                  <button
                    onClick={setMaxBet}
                    disabled={disabled || atMax}
                    className="mobile-bet-ctrl mobile-bet-ctrl--max"
                  >
                    MAX
                  </button>
                </div>
                <button
                  onClick={deposit.openModal}
                  className={`balance-row-btn balance-row-btn--chips ${showDepositAnimation ? 'deposit-pulse' : ''}`}
                  title="Deposit / Withdraw"
                >
                  <span className="balance-icon balance-icon--plusminus">+/-</span>
                  <span className="balance-label">CHIPS</span>
                  <span className="balance-value text-highlight">{formatUSDT(gameBalance)}</span>
                </button>
                <button
                  onClick={() => navigate('/liquidity')}
                  className="balance-row-btn balance-row-btn--house"
                  title="Be The House"
                >
                  <span className="balance-icon balance-icon--house">⌂</span>
                  <span className="balance-label">HOUSE</span>
                  <span className="balance-value">{formatUSDT(houseBalance)}</span>
                </button>
              </div>

              {/* CENTER: Chip pile */}
              <div className="mobile-col-pot">
                <ChipStack
                  amount={betAmount}
                  onRemoveChip={removeChip}
                  disabled={disabled}
                  layout="circular"
                  circleSize={100}
                  showBetControls={false}
                />
              </div>

              {/* RIGHT: Chip selector vertical */}
              <div className="mobile-col-chips">
                <ChipSelector
                  onAddChip={addChip}
                  canAddChip={canAddChip}
                  disabled={disabled}
                  size="sm"
                  variant="compact"
                  layout="vertical"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {deposit.showModal && <DepositModal deposit={deposit} />}
      {showCashOutModal && <CashOutModal />}
    </>
  );
}
