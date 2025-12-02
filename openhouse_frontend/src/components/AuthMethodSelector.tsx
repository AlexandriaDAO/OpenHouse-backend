import React, { useState } from 'react';
import {
  IDENTITY_PROVIDERS,
  type IdentityProviderConfig
} from '../lib/ic-use-identity/config/identityProviders';

interface AuthMethodSelectorProps {
  onSelect: (provider: IdentityProviderConfig) => void;
  onCancel?: () => void;
}

// Google logo
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

// Apple logo
const AppleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

// Microsoft logo
const MicrosoftLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#F25022" d="M1 1h10v10H1z"/>
    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
    <path fill="#FFB900" d="M13 13h10v10H13z"/>
  </svg>
);

export const AuthMethodSelector: React.FC<AuthMethodSelectorProps> = ({
  onSelect,
  onCancel
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const classicProvider = IDENTITY_PROVIDERS.find(p => p.id === 'classic')!;
  const v2Provider = IDENTITY_PROVIDERS.find(p => p.id === 'v2')!;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-pure-white">Sign In</h2>
        </div>

        <div className="flex flex-col gap-3">
          {/* Internet Identity 2.0 with social logins - Primary option */}
          <button
            className="w-full h-12 px-4 rounded-lg font-medium transition-colors bg-white/5 hover:bg-white/10 text-pure-white border border-white/20 hover:border-white/40 flex items-center justify-center gap-3"
            onClick={() => onSelect(v2Provider)}
          >
            <img src="/images/ic.svg" alt="Internet Identity" className="w-5 h-5" />
            <span className="text-sm font-medium">Internet Identity</span>
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-white/20">
              <GoogleLogo />
              <AppleLogo />
              <MicrosoftLogo />
            </div>
          </button>

          {/* Internet Identity Legacy */}
          <button
            className="w-full h-12 px-4 rounded-lg font-medium transition-colors bg-white/5 hover:bg-white/10 text-pure-white border border-white/20 hover:border-white/40 flex items-center justify-center gap-3"
            onClick={() => onSelect(classicProvider)}
          >
            <img src="/images/ic.svg" alt="Internet Identity" className="w-5 h-5" />
            <span className="text-sm font-medium">Internet Identity (Legacy)</span>
          </button>
        </div>

        {/* What is this? expandable section */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <span>What is this?</span>
            <svg
              className={`w-4 h-4 transition-transform ${showInfo ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showInfo && (
            <div className="mt-4 p-4 rounded-lg bg-white/5 text-sm text-gray-300 space-y-3">
              <p>
                <strong className="text-white">100% On-Chain.</strong> This entire site is hosted on the Internet Computer blockchain. No traditional servers.
              </p>
              <p>
                <strong className="text-white">Smart Contract Powered.</strong> All game logic runs in tamper-proof smart contracts with verifiable randomness.
              </p>
              <p>
                <strong className="text-white">Blockchain Identity.</strong> No passwords or emails. Your identity is cryptographically secured and owned by you.
              </p>
              <p>
                <strong className="text-white">Transparent Odds.</strong> All code is open source. The house edge is exactly what we say it is.
              </p>
            </div>
          )}
        </div>

        {onCancel && (
          <button
            className="absolute top-4 right-4 text-gray-500 hover:text-pure-white transition-colors"
            onClick={onCancel}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
