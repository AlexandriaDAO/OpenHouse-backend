import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthButton } from './AuthButton';
import { WhyOpenHouseModal } from './WhyOpenHouseModal';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  // Dice routes need full-screen layout without footer or back button
  const isDiceRoute = location.pathname.startsWith('/dice');
  const [showModal, setShowModal] = useState(false);

  return (
    <div className={`${isDiceRoute ? 'h-screen' : 'min-h-screen'} flex flex-col bg-pure-black overflow-hidden`}>
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
                className="text-gray-500 hover:text-gray-300 text-xs transition-colors hidden sm:flex flex-col items-start leading-relaxed"
              >
                <span>Player-owned.</span>
                <span>Provably fair.</span>
                <span className="text-dfinity-turquoise">Learn more</span>
              </button>
            </div>
            <AuthButton />
          </div>
        </div>
      </header>

      {/* Why OpenHouse Modal */}
      <WhyOpenHouseModal isOpen={showModal} onClose={() => setShowModal(false)} />

      {/* Main Content */}
      <main className={`flex-1 ${isDiceRoute ? 'overflow-hidden' : ''} container mx-auto px-4 ${isDiceRoute ? 'py-2' : 'py-8'}`}>
        {!isHome && !isDiceRoute && (
          <div className="mb-6">
            <Link to="/" className="inline-flex items-center gap-2 text-pure-white/60 hover:text-dfinity-turquoise transition-colors font-mono">
              <span>←</span>
              <span>Back to Games</span>
            </Link>
          </div>
        )}
        {children}
      </main>

    </div>
  );
};
