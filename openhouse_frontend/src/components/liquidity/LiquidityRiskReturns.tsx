interface Props {
  isExpanded: boolean;
  onToggle: () => void;
  withdrawalFeePercent: number;
}

export function LiquidityRiskReturns({ isExpanded, onToggle, withdrawalFeePercent }: Props) {
  return (
    <div className="border-b border-gray-700/50">
      {/* Header - Always visible, clickable to toggle */}
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls="risk-returns-content"
        className="w-full p-4 flex items-center justify-between bg-gradient-to-r from-purple-900/10 to-transparent hover:from-purple-900/20 transition-all"
      >
        <div className="flex items-center gap-2">
          <span className="text-purple-400 font-bold text-sm">📚 Understanding Liquidity Provision</span>
        </div>
        <span className="text-gray-500 text-lg">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {/* Content - Collapsible */}
      {isExpanded && (
        <div id="risk-returns-content" className="p-6 space-y-5 text-sm animate-in fade-in slide-in-from-top-2 duration-200 bg-black/10">
          {/* YOU ARE THE BANK */}
          <div className="bg-black/30 p-4 rounded-xl border border-gray-800">
            <h4 className="font-bold text-white mb-2 flex items-center gap-2">
              <span>🏦</span> You are the Bank
            </h4>
            <p className="text-gray-400 text-xs leading-relaxed">
              When you deposit, your money is pooled to form the game's bankroll.
              Unlike a regular deposit, <strong>this money is at risk</strong>. You're taking the House's
              position in every bet.
            </p>
          </div>

          {/* WIN/LOSE SCENARIOS */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-900/10 p-3 rounded-lg border border-green-900/30">
              <h4 className="font-bold text-green-400 mb-1 text-xs flex items-center gap-1">
                <span>✅</span> You Win When...
              </h4>
              <p className="text-gray-500 text-[10px]">
                Players lose their bets. The House has a 1% statistical advantage that compounds over time.
              </p>
            </div>
            <div className="bg-red-900/10 p-3 rounded-lg border border-red-900/30">
              <h4 className="font-bold text-red-400 mb-1 text-xs flex items-center gap-1">
                <span>⚠️</span> You Lose When...
              </h4>
              <p className="text-gray-500 text-[10px]">
                Players get lucky and win big payouts. Short-term variance can be significant.
              </p>
            </div>
          </div>

          {/* ALEXANDRIA MODEL */}
          <div className="bg-yellow-900/10 p-4 rounded-xl border border-yellow-900/30">
            <h4 className="font-bold text-yellow-400 mb-1 flex items-center gap-2">
              <span>⚡</span> The Alexandria Model
            </h4>
            <p className="text-gray-400 text-xs leading-relaxed">
              This is an Alexandria project. We charge <strong>no fees on gameplay</strong>.
              Instead, a <strong>{withdrawalFeePercent}% fee is charged only when you withdraw</strong> your liquidity.
              This fee is distributed to $ALEX token stakers. This aligns incentives: we want you
              to keep liquidity in the pool and profit alongside the house.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
