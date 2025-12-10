import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthButton } from './AuthButton';
import { WhyOpenHouseModal } from './WhyOpenHouseModal';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  // Game routes need full-screen layout
  const isGameRoute = location.pathname.startsWith('/dice') ||
                      location.pathname.startsWith('/plinko') ||
                      location.pathname.startsWith('/crash') ||
                      location.pathname.startsWith('/roulette');
  const [showModal, setShowModal] = useState(false);

  return (
    <div className={`${isGameRoute ? 'h-screen' : 'min-h-screen'} flex flex-col bg-pure-black overflow-hidden`}>
      {/* Header - minimal and clean */}
      <header className="bg-pure-black border-b border-pure-white/10 flex-shrink-0">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link to="/" className="hover:opacity-80 transition-opacity">
                <img
                  src="/logos/logo_icon.png"
                  alt="OpenHouse"
                  className="w-24 h-24 pixelated"
                  style={{ imageRendering: 'pixelated' }}
                />
              </Link>
              <button
                onClick={() => setShowModal(true)}
                className="text-gray-500 hover:text-gray-300 text-[10px] transition-colors hidden sm:flex flex-col items-start leading-tight whitespace-nowrap"
              >
                <span>Player-owned.</span>
                <span>Provably fair.</span>
                <span className="text-dfinity-turquoise">Learn more</span>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/wallet"
                className="p-2 bg-gray-800 hover:bg-gray-700 text-pure-white rounded border border-pure-white/10 transition-colors"
                title="Wallet"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </Link>
              <AuthButton />
            </div>
          </div>
        </div>
      </header>

      {/* Why OpenHouse Modal */}
      <WhyOpenHouseModal isOpen={showModal} onClose={() => setShowModal(false)} />

      {/* Main Content */}
      <main className={`flex-1 ${isGameRoute ? 'overflow-hidden' : ''} container mx-auto ${isGameRoute ? 'px-0 py-0' : 'px-4 py-8'}`}>
        {children}
      </main>

    </div>
  );
};
