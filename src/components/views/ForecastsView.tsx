import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Inbox, TrendingUp } from 'lucide-react';
import { useAppUI, useDataFabric } from '../../context/CortexContext';
import { createSmoothPath } from '../../utils/chartUtils';
import { deriveForecastSeries } from '../../utils/forecastSeries';

interface ForecastHoverPoint {
  label: string;
  val: number;
  low?: number;
  high?: number;
  isForecast: boolean;
}

export const ForecastsView: React.FC = () => {
  const { currency, formatCurrency } = useAppUI();
  const {
    forecastMetric,
    setForecastMetric,
    forecastHorizon,
    setForecastHorizon,
    forecasts,
    trends,
    salesRecords,
  } = useDataFabric();

  const [hoveredPoint, setHoveredPoint] = useState<ForecastHoverPoint | null>(null);

  useEffect(() => {
    setHoveredPoint(null);
  }, [forecastMetric, forecastHorizon]);

  const series = useMemo(
    () =>
      deriveForecastSeries({
        metric: forecastMetric,
        horizon: forecastHorizon,
        forecasts,
        trends,
        salesRecords,
      }),
    [forecastMetric, forecastHorizon, forecasts, trends, salesRecords]
  );

  const {
    historicalPoints,
    forecastPoints,
    driverWeights,
    unitType,
    hasConfidenceBands,
    forecastUnavailableReason,
  } = series;

  const formatMetricValue = (value: number): string => {
    if (unitType === 'units') {
      return `${Math.round(value).toLocaleString('en-US')} units`;
    }
    return formatCurrency(value);
  };

  const formatYAxisTick = (tick: number): string => {
    if (unitType === 'units') {
      return `${Math.round(tick).toLocaleString('en-US')}`;
    }
    return formatCurrency(tick);
  };

  const allValues = [
    ...historicalPoints.map((p) => p.val),
    ...forecastPoints.map((p) => Math.max(p.val, p.high ?? p.val)),
  ];
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 0;

  const yMax = (() => {
    if (rawMax <= 0) return 100;
    if (unitType === 'units') {
      if (rawMax <= 250) return Math.ceil(rawMax / 50) * 50;
      if (rawMax <= 1000) return Math.ceil(rawMax / 100) * 100;
      return Math.ceil(rawMax / 250) * 250;
    }
    if (rawMax <= 80) return Math.ceil(rawMax / 20) * 20;
    if (rawMax <= 250) return Math.ceil(rawMax / 50) * 50;
    return Math.ceil(rawMax / 100) * 100;
  })();

  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((fraction) => yMax * fraction);
  const latestForecast =
    forecastPoints.length > 0 ? forecastPoints[forecastPoints.length - 1] : undefined;
  const histValues = historicalPoints.map((p) => p.val);
  const histMin = histValues.length > 0 ? Math.min(...histValues) : null;
  const histMax = histValues.length > 0 ? Math.max(...histValues) : null;
  const histAvg =
    histValues.length > 0
      ? histValues.reduce((sum, val) => sum + val, 0) / histValues.length
      : null;

  return (
    <div className="w-full max-w-[1920px] mx-auto p-6 md:p-8 xl:p-10 space-y-8">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-3 border-b border-[#162138]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Predictive Intelligence &amp; Trajectory Modeling
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {series.sourceDescription} · Unit:{' '}
            <span className="text-slate-200 font-mono">
              {unitType === 'units'
                ? 'Units (Physical Volume)'
                : currency === 'INR'
                  ? '₹ Crores'
                  : '$ Millions'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#0e1628] rounded-xl p-1 border border-[#1b2740]">
            {(['Revenue', 'Demand', 'Cost', 'Profit'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForecastMetric(m)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  forecastMetric === m
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex bg-[#0e1628] rounded-xl p-1 border border-[#1b2740]">
            {(['3 Months', '6 Months', '12 Months'] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setForecastHorizon(h)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  forecastHorizon === h
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Forecast Visualizer Card */}
      <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#162138]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Trajectory Projection · {forecastMetric} ({forecastHorizon})
                </h3>
                <span className="text-[11px] font-mono bg-teal-950 text-teal-300 border border-teal-800/40 px-2 py-0.5 rounded-full">
                  {unitType === 'units' ? 'Unit Volume' : currency}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Solid blue curve represents realized history; dashed teal curve represents available
                projections
                {hasConfidenceBands ? ' with 90% confidence interval.' : '.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5 text-xs font-medium">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="w-3 h-1 bg-blue-500 rounded-full" /> Historical ({historicalPoints.length})
            </span>
            {forecastPoints.length > 0 && (
              <span className="flex items-center gap-2 text-slate-300">
                <span className="w-3 h-1 border-t-2 border-dashed border-teal-400" /> Forecast (
                {forecastPoints.length})
              </span>
            )}
            {hasConfidenceBands && (
              <span className="flex items-center gap-2 text-slate-300">
                <span className="w-3 h-2 bg-teal-500/20 border border-teal-500/40 rounded-xs" /> 90% CI
              </span>
            )}
          </div>
        </div>

        {/* Explicit Unavailable-Data Banner when projections don't exist for metric/horizon */}
        {forecastUnavailableReason && (
          <div
            role="status"
            className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Forecast Horizon Notice: </span>
              <span>{forecastUnavailableReason}</span>
            </div>
          </div>
        )}

        {/* SVG Curve Chart */}
        <div className="relative h-72 md:h-80 w-full select-none">
          {historicalPoints.length + forecastPoints.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 border border-dashed border-[#1b2740] rounded-xl">
              <Inbox className="w-10 h-10 text-slate-600" />
              <p className="text-sm text-slate-300 font-medium">
                No Data Available for {forecastMetric}
              </p>
              <p className="text-xs text-slate-500 font-mono">
                {forecastUnavailableReason ?? 'Selected series has no records loaded.'}
              </p>
            </div>
          ) : (
            <svg className="w-full h-full overflow-visible" viewBox="0 0 640 220">
              <defs>
                <linearGradient id="entConfidenceBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {yTicks.map((tick) => {
                const y = 200 - (tick / yMax) * 170;
                return (
                  <g key={tick}>
                    <line x1="65" y1={y} x2="585" y2={y} stroke="#162238" strokeDasharray="3 3" />
                    <text
                      x="58"
                      y={y + 3}
                      fill="#64748b"
                      fontSize="8.5"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {formatYAxisTick(tick)}
                    </text>
                  </g>
                );
              })}

              {(() => {
                const totalPointsCount = historicalPoints.length + forecastPoints.length;
                const getX = (idx: number) =>
                  totalPointsCount === 1 ? 325 : 75 + (idx * 495) / (totalPointsCount - 1);

                const histCoords = historicalPoints.map((p, i) => ({
                  x: getX(i),
                  y: 200 - (p.val / yMax) * 170,
                  isForecast: false,
                  ...p,
                }));

                const forecastCoords = forecastPoints.map((p, i) => {
                  const idx = historicalPoints.length + i;
                  const lowVal = typeof p.low === 'number' ? p.low : p.val;
                  const highVal = typeof p.high === 'number' ? p.high : p.val;
                  return {
                    x: getX(idx),
                    y: 200 - (p.val / yMax) * 170,
                    yLow: 200 - (lowVal / yMax) * 170,
                    yHigh: 200 - (highVal / yMax) * 170,
                    isForecast: true,
                    ...p,
                  };
                });

                const lastHist = histCoords[histCoords.length - 1];
                const allForecastWithBridge = lastHist
                  ? [
                      {
                        x: lastHist.x,
                        y: lastHist.y,
                        yLow: lastHist.y,
                        yHigh: lastHist.y,
                        label: lastHist.label,
                        val: lastHist.val,
                        low: lastHist.val,
                        high: lastHist.val,
                        isForecast: false,
                      },
                      ...forecastCoords,
                    ]
                  : forecastCoords;

                const bandPoints = hasConfidenceBands ? allForecastWithBridge : [];
                const bandTop = bandPoints.map((p) => `${p.x},${p.yHigh}`).join(' ');
                const bandBottom = [...bandPoints]
                  .reverse()
                  .map((p) => `${p.x},${p.yLow}`)
                  .join(' ');
                const bandPath = bandPoints.length >= 2 ? `M ${bandTop} L ${bandBottom} Z` : '';

                const histPath = histCoords.length >= 2 ? createSmoothPath(histCoords) : '';
                const forecastPath =
                  forecastCoords.length > 0 && allForecastWithBridge.length >= 2
                    ? createSmoothPath(allForecastWithBridge)
                    : '';

                return (
                  <>
                    {bandPath && (
                      <path
                        d={bandPath}
                        fill="url(#entConfidenceBand)"
                        stroke="#2dd4bf"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    )}

                    {histPath && <path d={histPath} fill="none" stroke="#3b82f6" strokeWidth="2.5" />}

                    {forecastPath && (
                      <path
                        d={forecastPath}
                        fill="none"
                        stroke="#2dd4bf"
                        strokeWidth="2.5"
                        strokeDasharray="4 4"
                      />
                    )}

                    {histCoords.map((p, i) => (
                      <g
                        key={`hist-${p.label}-${i}`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(p)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredPoint?.label === p.label ? 5.5 : 3.5}
                          fill="#3b82f6"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        <text
                          x={p.x}
                          y="214"
                          fill="#64748b"
                          fontSize="8.5"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {p.label}
                        </text>
                      </g>
                    ))}

                    {forecastCoords.map((p, i) => (
                      <g
                        key={`fc-${p.label}-${i}`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(p)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredPoint?.label === p.label ? 5.5 : 3.5}
                          fill="#2dd4bf"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        <text
                          x={p.x}
                          y="214"
                          fill="#2dd4bf"
                          fontSize="8.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {p.label}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          )}

          {/* Hover Tooltip */}
          {hoveredPoint && (
            <div className="absolute top-2 right-4 bg-[#0c1426] border border-[#213254] rounded-xl p-3 shadow-xl pointer-events-none text-xs">
              <div className="font-mono text-slate-400">
                {hoveredPoint.label} · {hoveredPoint.isForecast ? 'Projected' : 'Realized History'}
              </div>
              <div className="text-white font-bold text-sm mt-0.5">
                {hoveredPoint.isForecast ? 'Expected: ' : 'Actual: '}
                {formatMetricValue(hoveredPoint.val)}
              </div>
              {hoveredPoint.low !== undefined && hoveredPoint.high !== undefined && (
                <div className="text-[11px] text-teal-400 font-mono mt-0.5">
                  90% Bounds: {formatMetricValue(hoveredPoint.low)} –{' '}
                  {formatMetricValue(hoveredPoint.high)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Predictive Drivers Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Series Telemetry Summary */}
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#162138]">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
              Series Telemetry Summary
            </h4>
            <span className="text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800/40 font-mono">
              {forecastMetric}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Historical Samples:</span>
              <span className="text-slate-200 font-mono font-semibold">
                {historicalPoints.length} points
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Projected Horizon Points:</span>
              <span
                className={`font-mono font-semibold ${
                  forecastPoints.length > 0 ? 'text-teal-400' : 'text-amber-400'
                }`}
              >
                {forecastPoints.length > 0 ? `${forecastPoints.length} points` : 'Unavailable'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Historical Range:</span>
              <span className="text-slate-200 font-mono">
                {histMin !== null && histMax !== null
                  ? `${formatMetricValue(histMin)} – ${formatMetricValue(histMax)}`
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Historical Mean:</span>
              <span className="text-slate-200 font-mono font-semibold">
                {histAvg !== null ? formatMetricValue(histAvg) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Key Lift Drivers */}
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#162138]">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
              Primary Forecast Drivers
            </h4>
            <span className="text-[10px] font-mono text-slate-500">Weight</span>
          </div>

          {driverWeights.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 bg-[#0a101d] rounded-xl">
              No quantified feature attribution weights bundled for {forecastMetric}.
            </div>
          ) : (
            <div className="space-y-3">
              {driverWeights.map((driver, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{driver.label}</span>
                    <span className="text-teal-400 font-semibold font-mono">{driver.lift}</span>
                  </div>
                  <div className="w-full bg-[#111c33] rounded-full h-1.5 overflow-hidden">
                    <div className="bg-teal-400 h-full rounded-full" style={{ width: driver.width }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stress Case Bounds */}
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#162138]">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
              Stress Case Bounds
            </h4>
            <span className="text-[10px] font-mono text-slate-500">
              {latestForecast ? latestForecast.label : forecastHorizon}
            </span>
          </div>

          {!latestForecast ? (
            <div className="p-4 text-center text-xs text-slate-500 bg-[#0a101d] rounded-xl">
              Projected bounds unavailable for {forecastMetric} ({forecastHorizon}).
            </div>
          ) : typeof latestForecast.low === 'number' && typeof latestForecast.high === 'number' ? (
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between mb-1 font-mono">
                  <span className="text-slate-400 font-sans">Conservative (Stress)</span>
                  <span className="text-white tabular-nums font-medium">
                    {formatMetricValue(latestForecast.low)}
                  </span>
                </div>
                <div className="w-full bg-[#111c33] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full"
                    style={{
                      width: `${Math.max(
                        Math.round((latestForecast.low / Math.max(latestForecast.high, 1)) * 100),
                        10
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1 font-mono">
                  <span className="text-teal-300 font-medium font-sans">Base Case (Expected)</span>
                  <span className="text-white tabular-nums font-semibold">
                    {formatMetricValue(latestForecast.val)}
                  </span>
                </div>
                <div className="w-full bg-[#111c33] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-400 h-full rounded-full"
                    style={{
                      width: `${Math.max(
                        Math.round((latestForecast.val / Math.max(latestForecast.high, 1)) * 100),
                        10
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1 font-mono">
                  <span className="text-slate-400 font-sans">Optimistic (Upside)</span>
                  <span className="text-white tabular-nums font-medium">
                    {formatMetricValue(latestForecast.high)}
                  </span>
                </div>
                <div className="w-full bg-[#111c33] rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-teal-300 font-medium font-sans">
                  Deterministic Target ({latestForecast.label})
                </span>
                <span className="text-white font-semibold">
                  {formatMetricValue(latestForecast.val)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 bg-[#0a101d] p-3 rounded-lg border border-[#162238]">
                90% stochastic stress envelope is not provided in the dataset for {forecastMetric}{' '}
                ({forecastHorizon}); displaying deterministic point projection only.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
