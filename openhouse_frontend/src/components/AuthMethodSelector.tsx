import React, { useState } from 'react';
import {
  IDENTITY_PROVIDERS,
  getPreferredProvider,
  type IdentityProviderConfig
} from '../lib/ic-use-identity/config/identityProviders';

interface AuthMethodSelectorProps {
  onSelect: (provider: IdentityProviderConfig) => void;
  onCancel?: () => void;
}

export const AuthMethodSelector: React.FC<AuthMethodSelectorProps> = ({
  onSelect,
  onCancel
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(
    getPreferredProvider()?.id ?? null
  );

  const handleSelect = (provider: IdentityProviderConfig) => {
    onSelect(provider);
  };

  const renderIcon = (provider: IdentityProviderConfig) => {
    if (provider.id === 'classic') {
      return (
        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      );
    }
    return (
      <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-pure-white mb-2">Choose Authentication Method</h2>
          <p className="text-gray-400">Select how you want to log in to OpenHouse</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {IDENTITY_PROVIDERS.map(provider => (
            <div
              key={provider.id}
              className={`relative group cursor-pointer border rounded-xl p-5 transition-all duration-200 hover:border-dfinity-turquoise/50 hover:bg-white/5 ${
                selectedId === provider.id 
                  ? 'border-dfinity-turquoise bg-white/10 ring-1 ring-dfinity-turquoise/50' 
                  : 'border-pure-white/20 bg-transparent'
              }`}
              onClick={() => setSelectedId(provider.id)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-lg bg-white/10 group-hover:bg-dfinity-turquoise/20 transition-colors">
                  {renderIcon(provider)}
                </div>
                {provider.isBeta && (
                  <span className="bg-yellow-500/10 text-yellow-500 text-xs font-medium px-2.5 py-0.5 rounded border border-yellow-500/20">
                    Beta
                  </span>
                )}
              </div>

              <h3 className="text-lg font-semibold text-pure-white mb-1 flex items-center gap-2">
                {provider.name}
              </h3>
              
              <p className="text-sm text-gray-400 mb-4 min-h-[2.5rem]">
                {provider.description}
              </p>

              <ul className="space-y-2 mb-6">
                {provider.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                    <svg className="w-4 h-4 text-dfinity-turquoise shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all duration-200 ${
                  selectedId === provider.id
                    ? 'bg-dfinity-turquoise hover:bg-dfinity-turquoise/80 text-pure-black shadow-lg shadow-dfinity-turquoise/20'
                    : 'bg-white/10 hover:bg-white/20 text-pure-white'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(provider);
                }}
              >
                Login with {selectedId === provider.id ? 'Selected' : provider.name.split(' ')[0]}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center border-t border-pure-white/10 pt-4 mt-4">
          <p className="text-xs text-gray-500">
            Both methods provide secure, decentralized authentication.
            Your choice will be remembered for next time.
          </p>
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
