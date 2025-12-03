import React from 'react';
import './LeverDropButton.css';

interface LeverDropButtonProps {
  onClick: () => void;
  disabled: boolean;
  isActive: boolean;
  ballCount: number;
}

export const LeverDropButton: React.FC<LeverDropButtonProps> = ({
  onClick,
  disabled,
  isActive,
  ballCount
}) => {
  const handleClick = () => {
    if (disabled || isActive) return;
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isActive}
      className="drop-button"
      aria-label={`Drop ${ballCount} ball${ballCount > 1 ? 's' : ''}`}
    >
      <span className="drop-button-text">
        {isActive ? 'DROPPING...' : 'DROP'}
      </span>
      {ballCount > 1 && !isActive && (
        <span className="drop-button-count">×{ballCount}</span>
      )}
    </button>
  );
};
