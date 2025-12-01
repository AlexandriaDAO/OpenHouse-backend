import React from 'react';
import { createPortal } from 'react-dom';

interface WhyOpenHouseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhyOpenHouseModal({ isOpen, onClose }: WhyOpenHouseModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Why OpenHouse?</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* You Own The House */}
          <div className="space-y-2">
            <h3 className="text-dfinity-turquoise font-bold flex items-center gap-2">
              <span>YOU OWN THE HOUSE</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              No developer cut. 100% of house profits go to liquidity providers. You can provide liquidity to any game and earn when players lose &mdash; just like a real casino, except you're the owner.
            </p>
          </div>

          {/* Open Source & Verifiable */}
          <div className="space-y-2">
            <h3 className="text-dfinity-turquoise font-bold flex items-center gap-2">
              <span>OPEN SOURCE & VERIFIABLE</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Every line of code is public. Our 1% house edge is transparent and auditable &mdash; no hidden mechanics, no surprises.
            </p>
          </div>

          {/* Provably Fair */}
          <div className="space-y-2">
            <h3 className="text-dfinity-turquoise font-bold flex items-center gap-2">
              <span>PROVABLY FAIR</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              We use the Internet Computer's VRF (Verifiable Random Function) &mdash; cryptographic randomness that can't be manipulated or predicted.
            </p>
          </div>

          {/* Each Game = Its Own Casino */}
          <div className="space-y-2">
            <h3 className="text-dfinity-turquoise font-bold flex items-center gap-2">
              <span>EACH GAME = ITS OWN CASINO</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Every game runs in its own smart contract with separate treasuries. This lets liquidity providers choose where to put their capital based on which games they like &mdash; spreading risk instead of pooling it all together.
            </p>
          </div>

          {/* Be Both House and Player */}
          <div className="space-y-2">
            <h3 className="text-dfinity-turquoise font-bold flex items-center gap-2">
              <span>BE BOTH HOUSE AND PLAYER</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Provide liquidity to earn from the house edge, or just play for fun. Be the house, be the player, or be both.
            </p>
          </div>

          {/* Our Business Model */}
          <div className="space-y-2">
            <h3 className="text-dfinity-turquoise font-bold flex items-center gap-2">
              <span>OUR BUSINESS MODEL</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Simple and transparent: 1% of LP withdrawals go to $ALEX token stakers (our parent project). That's it. Players pay no fees &mdash; just the 1% statistical house edge during play, which goes entirely to liquidity providers.
            </p>
          </div>

          {/* About Section */}
          <div className="pt-4 border-t border-gray-700 space-y-4">
            <div className="text-center text-gray-400 text-xs space-y-2">
              <p>
                100% hosted on the{' '}
                <a
                  href="https://internetcomputer.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dfinity-turquoise hover:underline"
                >
                  Internet Computer
                </a>
              </p>
              <p>
                An{' '}
                <a
                  href="https://lbry.fun/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dfinity-turquoise hover:underline"
                >
                  Alexandria
                </a>
                {' '}project &mdash; a fair-launched studio building a city of interconnected ICP services.
              </p>
            </div>
            <a
              href="https://github.com/AlexandriaDAO/core/tree/master/openhouse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dfinity-turquoise hover:underline text-sm flex items-center gap-2 justify-center"
            >
              View Source Code
              <span className="text-xs">&rarr;</span>
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
