import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartDataPoint } from './useStatsData';

// DFINITY brand colors
const COLORS = {
  primary: '#29ABE2',    // dfinity-turquoise
  positive: '#00E19B',   // dfinity-green
  negative: '#ED0047',   // dfinity-red
  text: '#9CA3AF',       // gray-400
};

interface ChartProps {
  data: ChartDataPoint[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label, valuePrefix = '', valueSuffix = '' }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  const value = payload[0].value;
  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
  
  // Determine color based on value for profit chart
  const isProfit = payload[0].name === "Profit/Loss";
  const valueColor = isProfit 
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
    <div className="flex items-center justify-between mb-4">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Share Price</div>
      <div className="text-[10px] text-dfinity-turquoise bg-dfinity-turquoise/10 px-2 py-0.5 rounded-full">
        Current: {data[data.length - 1]?.sharePrice.toFixed(4)} USDT
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
          width={35}
          tickFormatter={(val) => val.toFixed(2)}
        />
        <Tooltip content={<CustomTooltip valueSuffix=" USDT" />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
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

export const ProfitLossChart: React.FC<ChartProps> = ({ data, height = 160 }) => (
  <div className="bg-black/20 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all duration-300">
    <div className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Daily Profit/Loss</div>
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
        <Bar dataKey="profit" name="Profit/Loss" radius={[2, 2, 2, 2]} animationDuration={1000}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? COLORS.positive : COLORS.negative} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);
