import React from 'react';
import { DiceLiquidityPanel, HealthDashboard } from '../../components/game-specific/dice';
import { InfoTooltip } from '../../components/InfoTooltip';

// Tooltip content constants
const LP_INFO_TEXT = `Liquidity Pool Mechanics:
• Deposit ICP to receive LP shares
• Share price = Total Reserve / Total Shares
• Earn as players lose (1% house edge)
• Withdraw anytime (1% fee applies)
• Minimum deposit: 1 ICP
• Minimum withdrawal: 0.001 ICP`;

const HOW_IT_WORKS_DETAILS = `Share Price Calculation:
1. Initial deposit: 1 share = 1 ICP
2. Subsequent: shares = (deposit × total_shares) / pool_reserve
3. Redemption: ICP = (your_shares × pool_reserve) / total_shares

When You Profit:
• Player loses 10 ICP bet → +10 ICP to pool → share price ↑
• 1% house edge ensures long-term profitability

When You Lose:
• Player wins 100 ICP → -100 ICP from pool → share price ↓`;

const FEE_DETAILS = `Withdrawal Fee Breakdown:
• Fee: 1% of withdrawal amount (100 basis points)
• Example: Withdraw 10 ICP → 0.1 ICP fee, receive 9.9 ICP
• Fee goes to: Parent staker canister (e454q-riaaa-aaaap-qqcyq-cai)
• Fallback: If parent busy, fee returns to pool (you benefit!)

House Edge Flow:
• Dice game has 1% house edge
• Player bets 100 ICP, loses → 100 ICP to pool
• Expected long-term: +1 ICP per 100 ICP wagered`;

export function DiceLiquidity() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Page Header with Tooltip */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">House Liquidity Pool</h1>
          <InfoTooltip content={LP_INFO_TEXT} />
        </div>
        <p className="text-gray-400 text-sm">
          Become a house owner and earn from player losses
        </p>
      </div>

      {/* Educational Section */}
      <div className="card p-4 mb-6 bg-blue-900/10 border-blue-500/20">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          📊 How It Works
          <InfoTooltip content={HOW_IT_WORKS_DETAILS} />
        </h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-bold text-green-400 mb-1">✅ You Earn When</h3>
            <ul className="text-gray-300 space-y-1 text-xs">
              <li>• Players lose their bets (1% house edge)</li>
              <li>• Share price increases as pool grows</li>
              <li>• Other LPs withdraw (1% fee stays in pool)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-red-400 mb-1">⚠️ You Lose When</h3>
            <ul className="text-gray-300 space-y-1 text-xs">
              <li>• Players win big payouts</li>
              <li>• Share price decreases as pool shrinks</li>
              <li>• You withdraw (1% fee deducted)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Fee Breakdown Card */}
      <div className="card p-4 mb-6 bg-purple-900/10 border-purple-500/20">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          💸 Fee Structure
          <InfoTooltip content={FEE_DETAILS} />
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded">
            <span className="text-gray-300">Withdrawal Fee</span>
            <span className="font-bold text-yellow-400">1% of amount</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded">
            <span className="text-gray-300">Fee Destination</span>
            <span className="font-mono text-xs text-gray-400">Parent Staker</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded">
            <span className="text-gray-300">House Edge (Games)</span>
            <span className="font-bold text-green-400">1%</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 p-2 bg-gray-800/30 rounded">
          💡 <strong>Bonus:</strong> If the parent staker can't accept fees (busy),
          they return to the pool as a bonus for remaining LPs!
        </p>
      </div>

      {/* Main LP Panel */}
      <DiceLiquidityPanel />

      {/* Health Dashboard */}
      <HealthDashboard />

      {/* Risk Disclaimer */}
      <div className="card p-3 mt-6 bg-yellow-900/10 border-yellow-500/20">
        <p className="text-xs text-yellow-200">
          ⚠️ <strong>Risk Warning:</strong> Liquidity providing carries risk.
          You can lose funds if players have a lucky streak. Only invest what you can afford to lose.
        </p>
      </div>
    </div>
  );
}
