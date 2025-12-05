import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartDataPoint } from '../../types/liquidity';
import { InfoTooltip } from '../InfoTooltip';

// DFINITY brand colors
const COLORS = {
  primary: '#39FF14',    // Lime green hacker terminal theme
  positive: '#00E19B',   // dfinity-green
  negative: '#ED0047',   // dfinity-red
  text: '#9CA3AF',       // gray-400
};

interface ChartProps {
  data: ChartDataPoint[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label, valuePrefix = '', valueSuffix = '', decimals = 2, multiplier = 1 }: any) => {
  if (!active || !payload || !payload.length) return null;

  const value = payload[0].value * multiplier;
  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);

  // Determine color based on value for profit-related charts
  const isProfitChart = ["House P&L", "Net Flow"].includes(payload[0].name);
  const valueColor = isProfitChart
    ? (value >= 0 ? 'text-dfinity-green' : 'text-dfinity-red')
    : 'text-dfinity-turquoise';

  return (
    <div className="bg-gray-900 border border-gray-700 p-3 rounded shadow-xl text-xs font-mono z-50 min-w-[150px]">
      <p className="text-gray-400 mb-2 border-b border-gray-800 pb-1">{label}</p>
      <p className="text-white font-bold flex justify-between items-center gap-4">
        <span>{payload[0].name}:</span>
        <span className={valueColor}>{valuePrefix}{formattedValue}{valueSuffix}</span>
      </p>
    </div>
  );
};

export const SharePriceChart: React.FC<ChartProps> = ({ data, height = 220 }) => (
  <div className="bg-black/20 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all duration-300">
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        Share Price
      </div>
      <div className="flex items-center gap-2">
        <InfoTooltip
          variant="badge"
          content="Share Price = Pool Reserve ÷ Total Shares

Displayed in micro-USDT (μUSDT) where 1 μUSDT = 0.000001 USDT

When you deposit liquidity, you receive shares representing your ownership percentage of the pool.

↗ Share price RISES when players lose bets (pool grows)
↘ Share price FALLS when players win bets (pool shrinks)

With the 1% house edge, share price trends upward over time as the house profits from thousands of bets.

Your total value = your shares × current share price"
        />
        <div className="text-[10px] text-dfinity-turquoise bg-dfinity-turquoise/10 px-2 py-0.5 rounded-full">
          Current: {(data[data.length - 1]?.sharePrice * 1_000_000).toFixed(2)} μUSDT
        </div>
      </div>
    </div>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <XAxis 
          dataKey="dateLabel" 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          dy={10}
          minTickGap={30}
        />
        <YAxis
          tick={{ fill: COLORS.text, fontSize: 10 }}
          domain={['auto', 'auto']}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(val) => `${(val * 1_000_000).toFixed(2)}`}
          label={{ value: 'μUSDT', position: 'top', fill: COLORS.text, fontSize: 10, offset: 10 }}
        />
        <Tooltip content={<CustomTooltip valueSuffix=" μUSDT" decimals={2} multiplier={1_000_000} />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
        <Line
          type="monotone"
          dataKey="sharePrice"
          name="Price"
          stroke={COLORS.primary}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: COLORS.primary, strokeWidth: 0 }}
          animationDuration={1000}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export const PoolReserveChart: React.FC<ChartProps> = ({ data, height = 160 }) => (
  <div className="bg-black/20 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all duration-300">
    <div className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Pool Reserve</div>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <XAxis 
          dataKey="dateLabel" 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          dy={10}
          minTickGap={30}
        />
        <YAxis 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          width={35}
          tickFormatter={(val) => (val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0))}
        />
        <Tooltip content={<CustomTooltip valueSuffix=" USDT" />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
        <Line 
          type="monotone" 
          dataKey="poolReserve" 
          name="Reserve"
          stroke={COLORS.primary} 
          strokeWidth={2} 
          dot={false} 
          activeDot={{ r: 4, fill: COLORS.primary, strokeWidth: 0 }}
          animationDuration={1000}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export const VolumeChart: React.FC<ChartProps> = ({ data, height = 160 }) => (
  <div className="bg-black/20 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all duration-300">
    <div className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Daily Volume</div>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <XAxis 
          dataKey="dateLabel" 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          dy={10}
          minTickGap={30}
        />
        <YAxis 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          width={35}
          tickFormatter={(val) => (val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0))}
        />
        <Tooltip content={<CustomTooltip valueSuffix=" USDT" />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
        <Bar 
          dataKey="volume" 
          name="Volume"
          fill={COLORS.primary} 
          radius={[2, 2, 0, 0]}
          animationDuration={1000}
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export const NetFlowChart: React.FC<ChartProps> = ({ data, height = 160 }) => (
  <div className="bg-black/20 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all duration-300">
    <div className="flex items-center gap-2 mb-4">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        Daily Net Flow
      </div>
      <InfoTooltip
        variant="badge"
        content="Net Flow = Pool Reserve Change

This shows how much the pool's total reserves changed each day.

INCLUDES:
+ LP deposits (new liquidity added)
+ House wins (players lost bets)
- LP withdrawals (liquidity removed)
- House losses (players won bets)

NOTE: This is NOT the same as house profit!
For actual house performance, see the Share Price chart."
      />
    </div>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <XAxis 
          dataKey="dateLabel" 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          dy={10}
          minTickGap={30}
        />
        <YAxis 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          width={35}
          tickFormatter={(val) => (val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0))}
        />
        <Tooltip content={<CustomTooltip valueSuffix=" USDT" />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
        <Bar dataKey="netFlow" name="Net Flow" radius={[2, 2, 2, 2]} animationDuration={1000}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.netFlow >= 0 ? COLORS.positive : COLORS.negative} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export const HouseProfitChart: React.FC<ChartProps> = ({ data, height = 160 }) => (
  <div className="bg-black/20 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all duration-300">
    <div className="flex items-center gap-2 mb-4">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        House Profit/Loss
      </div>
      <InfoTooltip
        variant="badge"
        content="True House Performance

Calculated from share price changes.

Share price ONLY changes from game outcomes:
- Players lose bet = share price UP = house profit
- Players win bet = share price DOWN = house loss

LP deposits and withdrawals do NOT affect share price, so this shows pure gambling performance."
      />
    </div>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <XAxis 
          dataKey="dateLabel" 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          dy={10}
          minTickGap={30}
        />
        <YAxis 
          tick={{ fill: COLORS.text, fontSize: 10 }} 
          axisLine={false}
          tickLine={false}
          width={35}
          tickFormatter={(val) => (val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0))}
        />
        <Tooltip content={<CustomTooltip valueSuffix=" USDT" />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
        <Bar dataKey="houseProfit" name="House P&L" radius={[2, 2, 2, 2]} animationDuration={1000}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.houseProfit >= 0 ? COLORS.positive : COLORS.negative} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);
