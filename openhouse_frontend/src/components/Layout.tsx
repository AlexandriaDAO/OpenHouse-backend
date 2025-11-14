import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthButton } from './AuthButton';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-pure-black">
      {/* Header with terminal aesthetic */}
      <header className="bg-pure-black border-b border-pure-white/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-3xl">🎰</span>
              <div>
                <h1 className="text-2xl font-pixel">OpenHouse Games</h1>
                <p className="text-xs text-dfinity-turquoise font-mono">
                  Provably Fair Gaming
                </p>
              </div>
            </Link>
            <AuthButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        {!isHome && (
          <div className="mb-6">
            <Link to="/" className="inline-flex items-center gap-2 text-pure-white/60 hover:text-dfinity-turquoise transition-colors font-mono">
              <span>←</span>
              <span>Back to Games</span>
            </Link>
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-pure-black border-t border-pure-white/20 py-6">
        <div className="container mx-auto px-4 text-center text-pure-white/60 text-sm font-mono">
          <p>
            OpenHouse Games -{' '}
            <a
              href="https://github.com/AlexandriaDAO/OpenHouse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dfinity-turquoise hover:underline"
            >
              Open Source
            </a>
            {' • '}
            An{' '}
            <a
              href="https://lbry.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dfinity-turquoise hover:underline"
            >
              Alexandria
            </a>
            {' '}Project
          </p>
          <p className="mt-2">Powered by Internet Computer Random Beacon</p>
        </div>
      </footer>
    </div>
  );
};
