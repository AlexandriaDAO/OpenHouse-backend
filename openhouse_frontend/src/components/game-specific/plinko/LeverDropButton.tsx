import React, { useState } from 'react';
import './LeverDropButton.css';

interface LeverDropButtonProps {
  onClick: () => void;
  disabled: boolean;
  isActive: boolean; // True when balls dropping
  ballCount: number;
}

export const LeverDropButton: React.FC<LeverDropButtonProps> = ({
  onClick,
  disabled,
  isActive,
  ballCount
}) => {
  const [isPulled, setIsPulled] = useState(false);

  const handleClick = () => {
    if (disabled || isActive) return;

    // Trigger pull animation
    setIsPulled(true);
    onClick();

    // Reset lever after 300ms
    setTimeout(() => setIsPulled(false), 300);
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`lever-button-container ${disabled ? 'disabled' : ''} ${isActive ? 'active' : ''}`}
      aria-label={`Drop ${ballCount} ball${ballCount > 1 ? 's' : ''}`}
    >
      {/* SVG Lever Graphic */}
      <svg
        className={`lever-svg ${isPulled ? 'pulled' : ''}`}
        width="120"
        height="200"
        viewBox="0 0 120 200"
      >
        {/* Fixed base with lime green border */}
        <circle
          cx="60"
          cy="180"
          r="25"
          fill="#1F2937"
          stroke="#39FF14"
          strokeWidth="2"
        />

        {/* Animated handle group */}
        <g className="lever-handle">
          {/* Gray rod */}
          <rect
            x="55"
            y="40"
            width="10"
            height="140"
            fill="#374151"
            stroke="#39FF14"
            strokeWidth="2"
            rx="5"
          />

          {/* Red ball top */}
          <circle
            cx="60"
            cy="35"
            r="20"
            fill="#EF4444"
            stroke="#39FF14"
            strokeWidth="2"
          />

          {/* Highlight for depth */}
          <circle
            cx="55"
            cy="30"
            r="8"
            fill="#FECACA"
            opacity="0.6"
          />
        </g>
      </svg>

      {/* Label below lever */}
      <div className="lever-label">
        {isActive
          ? `DROPPING ${ballCount}...`
          : ballCount === 1
            ? 'PULL TO DROP'
            : `PULL (${ballCount} BALLS)`
        }
      </div>

      {/* Glow effect when ready */}
      {!disabled && !isActive && (
        <div className="lever-glow" />
      )}
    </button>
  );
};
