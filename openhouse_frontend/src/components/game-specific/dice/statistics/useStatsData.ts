import { useState, useEffect, useCallback, useMemo } from 'react';
import useDiceActor from '../../../../hooks/actors/useDiceActor';
import type { DailySnapshot, ApyInfo } from '../../../../declarations/dice_backend/dice_backend.did';
import { processChartData, calculateAccurateApy } from '../../../../utils/liquidityStats';

export type Period = 7 | 30 | 90;

export interface ChartDataPoint {
  date: Date;
  dateLabel: string;
  poolReserve: number;
  volume: number;
  netFlow: number; // Renamed from profit
  houseProfit: number;
  houseProfitPercent: number;
  sharePrice: number;
  sharePriceChange: number;
  sharePriceChangePercent: number;
}

export const useStatsData = (isExpanded: boolean) => {
  const [period, setPeriod] = useState<Period>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [apy7, setApy7] = useState<ApyInfo | null>(null);
  const [apy30, setApy30] = useState<ApyInfo | null>(null);

  const { actor } = useDiceActor();

  const fetchData = useCallback(async () => {
    if (!actor) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const [stats, apy7Result, apy30Result] = await Promise.all([
        actor.get_daily_stats(period),
        actor.get_pool_apy([7]),
        actor.get_pool_apy([30]),
      ]);
      setSnapshots(stats);
      setApy7(apy7Result);
      setApy30(apy30Result);
    } catch (err) {
      console.error("Error fetching stats:", err);
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  }, [actor, period]);

  useEffect(() => {
    if (isExpanded) {
      fetchData();
    }
  }, [isExpanded, fetchData]);

  // Transform snapshots to chart data points using shared utility
  const chartData = useMemo(() => {
    // Cast snapshots to any because the type from declarations might slightly differ 
    // from the manually defined type in utils but the structure is compatible
    return processChartData(snapshots as any);
  }, [snapshots]);

  // NEW: Calculate accurate APY from share price returns using shared utility
  const accurateApy = useMemo(() => {
    return { 
      apy7: calculateAccurateApy(chartData, 7), 
      apy30: calculateAccurateApy(chartData, 30) 
    };
  }, [chartData]);

  return {
    period,
    setPeriod,
    isLoading,
    error,
    chartData,
    apy7,
    apy30,
    accurateApy,
    hasData: chartData.length >= 1,
    refetch: fetchData
  };
};
