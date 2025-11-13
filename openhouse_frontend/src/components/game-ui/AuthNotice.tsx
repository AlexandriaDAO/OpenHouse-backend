import React from 'react';

interface AuthNoticeProps {
  isAuthenticated: boolean;
  message?: string;
}

export const AuthNotice: React.FC<AuthNoticeProps> = ({
  isAuthenticated,
  message = "You're currently in anonymous mode. Click 'Login to Play' in the header to authenticate with Internet Identity and start placing bets.",
}) => {
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="card max-w-2xl mx-auto bg-casino-accent">
      <div className="flex items-start gap-3">
        <span className="text-2xl">ℹ️</span>
        <div>
          <h3 className="font-bold mb-1">Login Required to Play</h3>
          <p className="text-sm text-gray-300">{message}</p>
        </div>
      </div>
    </div>
  );
};