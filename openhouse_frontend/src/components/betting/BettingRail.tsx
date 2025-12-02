import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const isLiquidityRoute = location.pathname.includes('/liquidity');

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

  const ActionRow = () => (
    <div className="action-row">
      <button
        onClick={deposit.openModal}
        className={`icon-btn icon-btn--deposit ${showDepositAnimation ? 'deposit-pulse' : ''}`}
        title="Buy Chips"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>

      <button
        onClick={handleCashOutClick}
        disabled={deposit.isWithdrawing || gameBalance === 0n}
        className="icon-btn icon-btn--withdraw"
        title="Cash Out"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12h14"/>
        </svg>
      </button>

      <button
        onClick={() => navigate(isLiquidityRoute ? '/dice' : '/dice/liquidity')}
        className="icon-btn icon-btn--house"
        title={isLiquidityRoute ? 'Play Game' : 'Be The House'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12l9-9 9 9"/>
          <path d="M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10"/>
        </svg>
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

            {/* RIGHT: Bet Display + Action Buttons */}
            <div className="rail-right">
              <div className="rail-right-stack">
                <BetDisplay />
                <ActionRow />
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
            {/* Three column layout: left controls | center pile | right controls */}
            <div className="mobile-three-columns">
              {/* LEFT COLUMN: Action buttons on top, balances below */}
              <div className="mobile-col-left">
                <div className="mobile-action-buttons">
                  <button
                    onClick={deposit.openModal}
                    className={`mobile-icon-btn mobile-icon-btn--deposit ${showDepositAnimation ? 'deposit-pulse' : ''}`}
                    title="Buy Chips"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                  <button
                    onClick={handleCashOutClick}
                    disabled={deposit.isWithdrawing || gameBalance === 0n}
                    className="mobile-icon-btn mobile-icon-btn--withdraw"
                    title="Cash Out"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 12h14"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => navigate(isLiquidityRoute ? '/dice' : '/dice/liquidity')}
                    className="mobile-icon-btn mobile-icon-btn--house"
                    title={isLiquidityRoute ? 'Play Game' : 'Be The House'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12l9-9 9 9"/>
                      <path d="M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10"/>
                    </svg>
                  </button>
                </div>
                <div className="mobile-balances-row">
                  <div className="mobile-balances-text">
                    <div className="balance-row">
                      <span className="balance-label">CHIPS</span>
                      <span className="balance-value text-highlight">{formatUSDT(gameBalance)}</span>
                    </div>
                    <div className="balance-row">
                      <span className="balance-label">HOUSE</span>
                      <span className="balance-value">{formatUSDT(houseBalance)}</span>
                    </div>
                  </div>
                  <button onClick={onBalanceRefresh} className="mobile-refresh-btn" title="Refresh Balances">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M4 12c0-4.4 3.6-8 8-8 3.1 0 5.8 1.8 7.1 4.4M20 12c0 4.4-3.6 8-8 8-3.1 0-5.8-1.8-7.1-4.4"/>
                      <path d="M20 4v4h-4M4 20v-4h4"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* CENTER COLUMN: Circular chip pile */}
              <div className="mobile-col-center">
                <ChipStack
                  amount={betAmount}
                  onRemoveChip={removeChip}
                  disabled={disabled}
                  layout="circular"
                  circleSize={125}
                />
              </div>

              {/* RIGHT COLUMN: Bet display on top, chip selector below */}
              <div className="mobile-col-right">
                <div className="mobile-bet-display">
                  <button
                    onClick={clearBet}
                    disabled={disabled || betAmount === 0}
                    className="mobile-clr-btn"
                  >
                    CLR
                  </button>
                  <span className="amount">${betAmount.toFixed(2)}</span>
                  <button
                    onClick={setMaxBet}
                    disabled={disabled || atMax}
                    className="mobile-max-btn"
                  >
                    MAX
                  </button>
                </div>
                <div className="mobile-chips-scroll">
                  <ChipSelector
                    onAddChip={addChip}
                    canAddChip={canAddChip}
                    disabled={disabled}
                    size="xs"
                  />
                </div>
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
