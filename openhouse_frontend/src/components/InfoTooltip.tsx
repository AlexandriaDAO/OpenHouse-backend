import React, { useState } from 'react';

interface InfoTooltipProps {
  content: string;
  variant?: 'icon' | 'badge';
}

export function InfoTooltip({ content, variant = 'icon' }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className={variant === 'badge'
          ? "text-[10px] text-gray-400 bg-gray-700/30 hover:bg-gray-700/50 px-2 py-0.5 rounded-full transition cursor-help"
          : "text-gray-400 hover:text-gray-300 cursor-help text-base"
        }
        type="button"
      >
        {variant === 'badge' ? '❓ What is this?' : 'ⓘ'}
      </button>

      {isVisible && (
        <div className="absolute z-50 left-0 top-8 w-72 p-4 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl text-xs text-gray-300 whitespace-pre-line">
          {content}
          <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 border-l border-t border-gray-700 transform rotate-45" />
        </div>
      )}
    </div>
  );
}
