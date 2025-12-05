import { DailySnapshot, ChartDataPoint } from '../types/liquidity';

// Constants
export const CURRENCY_DECIMALS = 1_000_000; // USDT has 6 decimals
export const SHARE_PRICE_DECIMALS = 100_000_000; // Share price has 8 decimals
export const DAYS_IN_YEAR = 365;
export const MIN_SHARE_PRICE_THRESHOLD = 50; // Threshold to detect old buggy share prices

/**
 * Safe division that handles division by zero
 */
export const safeDiv = (numerator: number, denominator: number): number => {
  if (denominator === 0) return 0;
  return numerator / denominator;
};

/**
 * Process raw daily snapshots into chart data points
 * Including bug fixes for old data and accurate house profit calculation
 */
export const processChartData = (snapshots: DailySnapshot[]): ChartDataPoint[] => {
  if (!snapshots || !Array.isArray(snapshots) || snapshots.length === 0) return [];

  return snapshots.map((s, index) => {
    try {
      // Defensive timestamp conversion
      const dateMs = Number(s.day_timestamp / 1_000_000n);
      
      // Share Price Logic (with bugfix for old data)
      let sharePriceRaw = Number(s.share_price);
      if (sharePriceRaw > 0 && sharePriceRaw < MIN_SHARE_PRICE_THRESHOLD) {
        sharePriceRaw = sharePriceRaw * 100;
      }
      const currentSharePrice = safeDiv(sharePriceRaw, SHARE_PRICE_DECIMALS);
      
      // Pool Reserve
      const poolReserve = safeDiv(Number(s.pool_reserve_end), CURRENCY_DECIMALS);
      
      // Determine Previous Share Price & Shares
      let prevSharePrice = currentSharePrice;
      let prevPoolReserve = poolReserve;
      
      if (index > 0) {
        const prevS = snapshots[index - 1];
        let prevSharePriceRaw = Number(prevS.share_price);
        if (prevSharePriceRaw > 0 && prevSharePriceRaw < MIN_SHARE_PRICE_THRESHOLD) {
          prevSharePriceRaw = prevSharePriceRaw * 100;
        }
        prevSharePrice = safeDiv(prevSharePriceRaw, SHARE_PRICE_DECIMALS);
        prevPoolReserve = safeDiv(Number(prevS.pool_reserve_end), CURRENCY_DECIMALS);
      }

      // Calculate Share Price Change
      const sharePriceChange = currentSharePrice - prevSharePrice;
      const sharePriceChangePercent = prevSharePrice > 0
        ? (sharePriceChange / prevSharePrice) * 100
        : 0;

      // Calculate House Profit
      // FIX: Use PREVIOUS day's shares to calculate profit.
      // The profit/loss from price change applies to the shares that existed *before* the change.
      // Deposits/Withdrawals during the day affect the *end* reserve, but shouldn't affect the *price* change profit calculation 
      // on the *new* capital until the next day.
      // Shares = Reserve / SharePrice
      const estimatedPrevShares = safeDiv(prevPoolReserve, prevSharePrice);
      
      // Note: For day 0, sharePriceChange is 0, so houseProfit is 0.
      const houseProfit = sharePriceChange * estimatedPrevShares;

      return {
        date: new Date(dateMs),
        dateLabel: new Date(dateMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        poolReserve: poolReserve,
        volume: safeDiv(Number(s.daily_volume), CURRENCY_DECIMALS),
        netFlow: safeDiv(Number(s.daily_pool_profit), CURRENCY_DECIMALS),
        houseProfit,
        houseProfitPercent: sharePriceChangePercent,
        sharePrice: currentSharePrice,
        sharePriceChange,
        sharePriceChangePercent,
      };
    } catch (err) {
      console.error("Error processing snapshot:", err, s);
      // Return a safe fallback or filter this out later if needed
      // For now, returning zeroed data to avoid crashing UI
      return {
        date: new Date(),
        dateLabel: 'Error',
        poolReserve: 0,
        volume: 0,
        netFlow: 0,
        houseProfit: 0,
        houseProfitPercent: 0,
        sharePrice: 0,
        sharePriceChange: 0,
        sharePriceChangePercent: 0,
      };
    }
  });
};

/**
 * Calculate APY based on share price returns
 * Uses a fixed period (days) for the denominator to avoid inflation on short data
 */
export const calculateAccurateApy = (
  chartData: ChartDataPoint[], 
  targetDays: number
): number => {
  // Need at least 2 points to calculate a return
  if (!chartData || chartData.length < 2) return 0;

  // Get the relevant slice of data
  const activeData = chartData.slice(-targetDays);
  
  if (activeData.length < 2) return 0;

  const startPrice = activeData[0].sharePrice;
  const endPrice = activeData[activeData.length - 1].sharePrice;

  if (startPrice <= 0) return 0;

  const returnRate = (endPrice - startPrice) / startPrice;
  
  // FIX: Use targetDays for the time basis if we want a "7 Day APY" estimate
  // unless we have more data than that (unlikely with slice) or much less.
  // The request was to avoid "inflated" APY when data is short.
  // If we have 2 days of data for a 30 day request:
  // Using 'activeData.length' (2) -> Multiplier 365/2 = 182x. High APY.
  // Using 'targetDays' (30) -> Multiplier 365/30 = 12x. Conservative APY.
  // We will use Math.max(activeData.length, targetDays) to be conservative.
  // Note: activeData.length roughly equals the days of data we have.
  
  // Calculate time span in days based on timestamps for better accuracy
  const startTime = activeData[0].date.getTime();
  const endTime = activeData[activeData.length - 1].date.getTime();
  const daysDiff = (endTime - startTime) / (1000 * 60 * 60 * 24);
  
  // Prevent division by zero or extremely small timeframes
  if (daysDiff < 0.5) return 0;

  // Use the larger of actual time passed or the target period.
  // This ensures that if we only have 1 day of data but want 30-day APY, 
  // we don't extrapolate that 1 day to the whole year as if it repeats every day.
  // We treat it as "this is the return we got over this period".
  const effectiveDays = Math.max(daysDiff, targetDays);

  return returnRate * (DAYS_IN_YEAR / effectiveDays) * 100;
};
