import type {
  ForecastDriverWeight,
  ForecastsData,
  SalesRecord,
  TrendsData,
} from '../types/cortex';
import type {
  ForecastHorizonType,
  ForecastMetricType,
} from '../context/DataFabricContext';

export interface SeriesHistoricalPoint {
  label: string;
  val: number;
}

export interface SeriesForecastPoint {
  label: string;
  val: number;
  low?: number;
  high?: number;
}

export interface ResolvedForecastSeries {
  metric: ForecastMetricType;
  horizon: ForecastHorizonType;
  unitType: 'currency' | 'units';
  sourceDescription: string;
  historicalPoints: SeriesHistoricalPoint[];
  forecastPoints: SeriesForecastPoint[];
  hasConfidenceBands: boolean;
  driverWeights: ForecastDriverWeight[];
  forecastUnavailableReason: string | null;
}

export function deriveForecastSeries(params: {
  metric: ForecastMetricType;
  horizon: ForecastHorizonType;
  forecasts: ForecastsData;
  trends: TrendsData;
  salesRecords: SalesRecord[];
}): ResolvedForecastSeries {
  const { metric, horizon, forecasts, trends, salesRecords } = params;

  if (metric === 'Revenue') {
    const historicalPoints = forecasts.historicalPoints ?? [];
    const allForecast = forecasts.forecastPoints ?? [];
    const sliceCount = horizon === '3 Months' ? 1 : horizon === '6 Months' ? 2 : 4;
    const forecastPoints = allForecast.slice(0, sliceCount);

    const unavailableReason =
      historicalPoints.length === 0 && forecastPoints.length === 0
        ? 'No Revenue history or forecast data is loaded.'
        : forecastPoints.length === 0
          ? `Revenue projections for ${horizon} are unavailable in the loaded dataset.`
          : null;

    return {
      metric,
      horizon,
      unitType: 'currency',
      sourceDescription: 'Enterprise Revenue Forecast Model & Historical Checkpoints',
      historicalPoints,
      forecastPoints,
      hasConfidenceBands: forecastPoints.length > 0,
      driverWeights: forecasts.driverWeights ?? [],
      forecastUnavailableReason: unavailableReason,
    };
  }

  if (metric === 'Demand') {
    const dailyMap = new Map<string, number>();
    salesRecords.forEach((rec) => {
      dailyMap.set(rec.date, (dailyMap.get(rec.date) ?? 0) + rec.quantity);
    });

    const historicalPoints: SeriesHistoricalPoint[] = Array.from(dailyMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, qty]) => ({
        label: date.slice(5), // MM-DD
        val: qty,
      }));

    return {
      metric,
      horizon,
      unitType: 'units',
      sourceDescription: 'Aggregated Daily Sales Quantity (Physical Units)',
      historicalPoints,
      forecastPoints: [],
      hasConfidenceBands: false,
      driverWeights: [],
      forecastUnavailableReason:
        historicalPoints.length === 0
          ? 'No unit demand history or forecast series is loaded in the current dataset.'
          : `Forward Demand unit projections for ${horizon} are unavailable in the current dataset. Displaying historical unit sales only.`,
    };
  }

  const quarterly = trends.quarterly ?? [];
  const realizedQuarters = quarterly.filter((q) => !/proj/i.test(q.label));
  const projectedQuarter = quarterly.find((q) => /proj/i.test(q.label));

  if (metric === 'Profit') {
    const historicalPoints: SeriesHistoricalPoint[] = realizedQuarters.map((q) => ({
      label: q.label,
      val: parseFloat(q.profit.toFixed(1)),
    }));

    const canShowShortHorizon = horizon === '3 Months' && Boolean(projectedQuarter);
    const forecastPoints: SeriesForecastPoint[] =
      canShowShortHorizon && projectedQuarter
        ? [{ label: projectedQuarter.label, val: parseFloat(projectedQuarter.profit.toFixed(1)) }]
        : [];

    let unavailableReason: string | null = null;
    if (historicalPoints.length === 0 && forecastPoints.length === 0) {
      unavailableReason = 'No Profit trend or projection data is loaded.';
    } else if (horizon !== '3 Months') {
      unavailableReason = `Multi-quarter Profit forecasts for ${horizon} are unavailable (loaded trends only include a 3-month Q4 projection). Showing realized Q1–Q3 history.`;
    }

    return {
      metric,
      horizon,
      unitType: 'currency',
      sourceDescription: 'Quarterly Net Profit Realization & Short-Horizon Q4 Trend Projection',
      historicalPoints,
      forecastPoints,
      hasConfidenceBands: false,
      driverWeights: [],
      forecastUnavailableReason: unavailableReason,
    };
  }

  // Metric === 'Cost': derived strictly from implied enterprise outflow (rev - profit)
  const historicalPoints: SeriesHistoricalPoint[] = realizedQuarters.map((q) => ({
    label: q.label,
    val: parseFloat(Math.max(q.rev - q.profit, 0).toFixed(1)),
  }));

  const canShowShortCostHorizon = horizon === '3 Months' && Boolean(projectedQuarter);
  const forecastPoints: SeriesForecastPoint[] =
    canShowShortCostHorizon && projectedQuarter
      ? [
          {
            label: projectedQuarter.label,
            val: parseFloat(Math.max(projectedQuarter.rev - projectedQuarter.profit, 0).toFixed(1)),
          },
        ]
      : [];

  let unavailableReason: string | null = null;
  if (historicalPoints.length === 0 && forecastPoints.length === 0) {
    unavailableReason = 'No Cost trend or projection data is loaded.';
  } else if (horizon !== '3 Months') {
    unavailableReason = `Extended Cost forecasts for ${horizon} are unavailable (loaded trends only support a 3-month Q4 projection). Showing realized implied cost (Revenue minus Profit) for Q1–Q3.`;
  }

  return {
    metric,
    horizon,
    unitType: 'currency',
    sourceDescription: 'Quarterly Implied Operating Outflow (Revenue minus Net Profit)',
    historicalPoints,
    forecastPoints,
    hasConfidenceBands: false,
    driverWeights: [],
    forecastUnavailableReason: unavailableReason,
  };
}

