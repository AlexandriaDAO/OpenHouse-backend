import React from 'react';

interface GameButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  loadingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  fullWidth?: boolean;
  icon?: string;
}

export const GameButton: React.FC<GameButtonProps> = ({
  onClick,
  disabled = false,
  loading = false,
  label,
  loadingLabel,
  variant = 'primary',
  fullWidth = true,
  icon,
}) => {
  const getButtonStyles = () => {
    const base = `font-bold py-4 rounded-lg text-xl transition ${fullWidth ? 'w-full' : ''}`;

    switch (variant) {
      case 'primary':
        return `${base} bg-casino-highlight hover:bg-casino-highlight/80 disabled:bg-gray-700 text-white`;
      case 'secondary':
        return `${base} bg-casino-secondary hover:bg-casino-accent disabled:bg-gray-700 text-white`;
      case 'danger':
        return `${base} bg-red-600 hover:bg-red-500 disabled:bg-gray-700 text-white`;
      default:
        return base;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={getButtonStyles()}
    >
      {loading ? (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {loadingLabel || `${label}...`}
        </>
      ) : (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {label}
        </>
      )}
    </button>
  );
};