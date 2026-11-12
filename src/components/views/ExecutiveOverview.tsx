import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Sparkles,
  Building2,
  AlertTriangle,
  FileCheck,
  ChevronRight,
  BarChart3,
  Inbox
} from 'lucide-react';
import { useAppUI, useDataFabric, useRecommendations } from '../../context/CortexContext';
import { createSmoothPath } from '../../utils/chartUtils';
import { deriveScopedOverviewData } from '../../utils/overviewFilters';

export const ExecutiveOverview: React.FC = () => {
  const {
    fiscalPeriod,
    currency,
    formatCurrency,
    setCurrentPage,
    selectedDepartment,
    setSelectedDepartment,
  } = useAppUI();
  const {
    metrics: rawMetrics,
    insights: rawInsights,
    topOpportunities: rawOpportunities,
    keyRisks: rawRisks,
    recentRecommendations: rawRecentRecommendations,
    salesRecords,
    dataSources,
    trends,
  } = useDataFabric();
  const { recommendations } = useRecommendations();

  const [trendGranularity, setTrendGranularity] = useState<'Monthly' | 'Quarterly'>('Monthly');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    setHoveredIndex(null);
  }, [selectedDepartment, fiscalPeriod, trendGranularity]);

  const departments = [
    'All Enterprise',
    'Commercial Operations',
    'Supply Chain & Logistics',
    'Finance & Treasury'
  ];

  const scoped = useMemo(
    () =>
      deriveScopedOverviewData({
        selectedDepartment,
        fiscalPeriod,
        trendGranularity,
        metrics: rawMetrics,
        trends,
        salesRecords,
        dataSources,
        insights: rawInsights,
        topOpportunities: rawOpportunities,
        keyRisks: rawRisks,
        recentRecommendations: rawRecentRecommendations,
        recommendations,
      }),
    [
      selectedDepartment,
      fiscalPeriod,
      trendGranularity,
      rawMetrics,
      trends,
      salesRecords,
      dataSources,
      rawInsights,
      rawOpportunities,
      rawRisks,
      rawRecentRecommendations,
      recommendations,
    ]
  );

  const metrics = scoped.kpis;
  const insights = scoped.insights;
  const topOpportunities = scoped.topOpportunities;
  const keyRisks = scoped.keyRisks;
  const recentRecommendations = scoped.recentRecommendations;

  const chartData = scoped.chartPoints;
  const maxDataVal = chartData.reduce(
    (acc, d) => Math.max(acc, d.primary, d.secondary ?? 0),
    0
  );
  const gridMax = (() => {
    if (maxDataVal <= 0) return 100;
    if (maxDataVal <= 1.2) return Math.ceil(maxDataVal * 4) / 4;
    if (maxDataVal <= 5) return Math.ceil(maxDataVal);
    if (maxDataVal <= 25) return Math.ceil(maxDataVal / 5) * 5;
    if (maxDataVal <= 100) return Math.ceil(maxDataVal / 25) * 25;
    if (maxDataVal <= 250) return Math.max(200, Math.ceil(maxDataVal / 50) * 50);
    return Math.ceil(maxDataVal / 125) * 125;
  })();
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => gridMax * fraction);

  return (
    <div className="w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 xl:p-10 space-y-6 sm:space-y-8">
      {/* Executive Scope & Department Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-4 border-b border-[#162138]">
        <div>
          <h2 className="text-xl xl:text-2xl font-bold text-white tracking-tight">
            Enterprise Performance Intelligence
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Scope: <span className="text-blue-400 font-semibold">{selectedDepartment}</span> · Period:{' '}
            <span className="text-slate-100 font-mono font-semibold">{fiscalPeriod}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{scoped.dataBasisNote}</p>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 sm:pb-0">
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDepartment(dept)}
              className={`px-4 py-2 rounded-xl text-xs xl:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
                selectedDepartment === dept
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30 font-bold'
                  : 'bg-[#0e1628] text-slate-300 hover:text-white border border-[#1b2740]'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* 1. TOP 4 EXECUTIVE KPI CARDS */}
      {metrics.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#0e1628] border border-[#1b2740] text-center space-y-2">
          <div className="flex justify-center">
            <Inbox className="w-10 h-10 text-slate-600" />
          </div>
          <h3 className="text-base font-bold text-slate-300">No KPI Metrics Loaded</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            All dummy metrics have been removed because <code className="text-amber-400 font-mono">mock-data.json</code> was deleted.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {metrics.map((card) => {
            const isOperatingCost = card.id === 'operating-cost';
            const displayValue =
              card.unit === 'currency' ? formatCurrency(card.numericValue) : card.value;

            return (
              <div
                key={card.id}
                className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 xl:p-7 shadow-sm hover:border-[#283b5e] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-sm text-slate-400 font-medium mb-3">
                    <span className="font-semibold text-slate-300">{card.label}</span>
                    <span className="text-xs font-mono text-slate-500 bg-[#121c33] px-2 py-0.5 rounded">{fiscalPeriod}</span>
                  </div>

                  <div className="flex items-baseline justify-between mb-5">
                    <span className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight tabular-nums font-mono">
                      {displayValue}
                    </span>
                    <div
                      className={`flex items-center gap-1.5 text-xs xl:text-sm font-bold px-2.5 py-1 rounded-lg font-mono ${
                        isOperatingCost
                          ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                          : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                      }`}
                    >
                      {isOperatingCost ? (
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      )}
                      <span>{card.change}</span>
                    </div>
                  </div>
                </div>

                {/* Sparkline visualization */}
                <div className="flex items-end gap-2 h-14 pt-2 border-t border-[#162138]">
                  {Array.isArray(card.history) && card.history.map((val, idx) => {
                    const min = Math.min(...card.history);
                    const max = Math.max(...card.history);
                    const heightPercent = Math.max(
                      18,
                      Math.round(((val - min) / (max - min || 1)) * 100)
                    );
                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col justify-end h-full group/bar relative"
                        title={`${val}`}
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-xs transition-all duration-200 ${
                            isOperatingCost
                              ? 'bg-rose-500/70 group-hover/bar:bg-rose-400'
                              : 'bg-emerald-500/70 group-hover/bar:bg-emerald-400'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. REVENUE & PROFIT TREND + AI KEY INSIGHTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8">
        {/* Revenue & Profit Trend Chart (7 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 xl:p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base xl:text-lg font-bold text-white tracking-tight">
                  {scoped.chartTitle}
                </h3>
                <p className="text-xs xl:text-sm text-slate-400 mt-0.5">
                  {scoped.chartSubtitle} ({currency === 'INR' ? '₹ Crores' : '$ Millions'})
                </p>
              </div>

              <div className="flex items-center gap-5">
                <div className="flex items-center gap-4 text-xs xl:text-sm font-medium">
                  <span className="flex items-center gap-2 text-slate-200">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: scoped.primaryColor }}
                    />{' '}
                    {scoped.primarySeriesLabel}
                  </span>
                  {scoped.secondarySeriesLabel && (
                    <span className="flex items-center gap-2 text-slate-200">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: scoped.secondaryColor }}
                      />{' '}
                      {scoped.secondarySeriesLabel}
                    </span>
                  )}
                </div>

                {selectedDepartment === 'Commercial Operations' ? (
                  <span className="bg-[#111c33] border border-[#1c2944] rounded-xl px-3.5 py-1.5 text-xs xl:text-sm text-blue-300 font-mono font-semibold">
                    Daily Log
                  </span>
                ) : (
                  <select
                    value={trendGranularity}
                    onChange={(e) => setTrendGranularity(e.target.value === 'Quarterly' ? 'Quarterly' : 'Monthly')}
                    aria-label="Trend Granularity"
                    className="bg-[#111c33] border border-[#1c2944] rounded-xl px-3.5 py-1.5 text-xs xl:text-sm text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer font-mono font-semibold"
                  >
                    <option value="Monthly">Monthly View</option>
                    <option value="Quarterly">Quarterly View</option>
                  </select>
                )}
              </div>
            </div>

            {/* Spline Chart */}
            <div className="relative h-80 xl:h-[380px] w-full select-none">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 border border-dashed border-[#1b2740] rounded-xl">
                  <BarChart3 className="w-10 h-10 text-slate-600" />
                  <p className="text-sm text-slate-300 font-medium">No Historical Trend Series</p>
                  <p className="text-xs text-slate-500 font-mono">
                    No trend records available for the current filter selection.
                  </p>
                </div>
              ) : (
                <svg className="w-full h-full overflow-visible" viewBox="0 0 740 280">
                  <defs>
                    <linearGradient id="entRevGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={scoped.primaryColor} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={scoped.primaryColor} stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="entProfitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={scoped.secondaryColor} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={scoped.secondaryColor} stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Grid lines */}
                  {yTicks.map((tick) => {
                    const y = 240 - (tick / gridMax) * 200;
                    const labelValue =
                      gridMax <= 5
                        ? currency === 'USD'
                          ? `$ ${(tick * 0.12).toFixed(2)}M`
                          : `₹ ${tick.toFixed(2)} Cr`
                        : formatCurrency(tick);
                    return (
                      <g key={tick}>
                        <line
                          x1="70"
                          y1={y}
                          x2="720"
                          y2={y}
                          stroke="#162238"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <text x="60" y={y + 4} fill="#64748b" fontSize="11" textAnchor="end" fontFamily="monospace">
                          {labelValue}
                        </text>
                      </g>
                    );
                  })}

                  {(() => {
                    const pointsCount = chartData.length;
                    const primaryPoints = chartData.map((d, i) => ({
                      x: pointsCount === 1 ? 395 : 80 + i * (630 / (pointsCount - 1)),
                      y: 240 - (d.primary / gridMax) * 200
                    }));

                    const hasSecondary =
                      scoped.secondarySeriesLabel !== null &&
                      chartData.every((d) => typeof d.secondary === 'number');

                    const secondaryPoints = hasSecondary
                      ? chartData.map((d, i) => ({
                          x: pointsCount === 1 ? 395 : 80 + i * (630 / (pointsCount - 1)),
                          y: 240 - ((d.secondary ?? 0) / gridMax) * 200
                        }))
                      : [];

                    const primaryLine = pointsCount >= 2 ? createSmoothPath(primaryPoints) : '';
                    const secondaryLine =
                      hasSecondary && pointsCount >= 2 ? createSmoothPath(secondaryPoints) : '';

                    const primaryArea =
                      pointsCount >= 2
                        ? `${primaryLine} L ${primaryPoints[primaryPoints.length - 1].x} 240 L ${primaryPoints[0].x} 240 Z`
                        : '';
                    const secondaryArea =
                      hasSecondary && pointsCount >= 2
                        ? `${secondaryLine} L ${secondaryPoints[secondaryPoints.length - 1].x} 240 L ${secondaryPoints[0].x} 240 Z`
                        : '';

                    return (
                      <>
                        {pointsCount === 1 ? (
                          <>
                            <rect
                              x={hasSecondary ? 355 : 373}
                              y={primaryPoints[0].y}
                              width="38"
                              height={Math.max(240 - primaryPoints[0].y, 2)}
                              rx="4"
                              fill={scoped.primaryColor}
                              fillOpacity="0.28"
                              stroke={scoped.primaryColor}
                              strokeWidth="1.5"
                            />
                            {hasSecondary && secondaryPoints[0] && (
                              <rect
                                x={403}
                                y={secondaryPoints[0].y}
                                width="38"
                                height={Math.max(240 - secondaryPoints[0].y, 2)}
                                rx="4"
                                fill={scoped.secondaryColor}
                                fillOpacity="0.28"
                                stroke={scoped.secondaryColor}
                                strokeWidth="1.5"
                              />
                            )}
                          </>
                        ) : (
                          <>
                            <path d={primaryArea} fill="url(#entRevGradient)" />
                            {hasSecondary && <path d={secondaryArea} fill="url(#entProfitGradient)" />}
                            <path
                              d={primaryLine}
                              fill="none"
                              stroke={scoped.primaryColor}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                            />
                            {hasSecondary && (
                              <path
                                d={secondaryLine}
                                fill="none"
                                stroke={scoped.secondaryColor}
                                strokeWidth="3.5"
                                strokeLinecap="round"
                              />
                            )}
                          </>
                        )}

                        {/* Interactive Data Points */}
                        {chartData.map((item, idx) => {
                          const rp = primaryPoints[idx];
                          const pp = secondaryPoints[idx];
                          const isHovered = hoveredIndex === idx;
                          const tooltipX = Math.min(Math.max(rp.x - 75, 12), 575);
                          const tooltipY = Math.max(rp.y - (hasSecondary ? 58 : 44), 6);

                          return (
                            <g
                              key={item.label}
                              className="cursor-pointer group/dot"
                              onMouseEnter={() => setHoveredIndex(idx)}
                              onMouseLeave={() => setHoveredIndex(null)}
                            >
                              <circle
                                cx={rp.x}
                                cy={rp.y}
                                r={isHovered ? 6 : 4}
                                fill={scoped.primaryColor}
                                stroke="#ffffff"
                                strokeWidth="2.5"
                                className="transition-all"
                              />
                              {hasSecondary && pp && (
                                <circle
                                  cx={pp.x}
                                  cy={pp.y}
                                  r={isHovered ? 5 : 3.5}
                                  fill={scoped.secondaryColor}
                                  stroke="#080d19"
                                  strokeWidth="2"
                                  className="transition-all"
                                />
                              )}

                              <text
                                x={rp.x}
                                y="262"
                                fill={isHovered ? '#ffffff' : '#64748b'}
                                fontSize="11"
                                fontWeight={isHovered ? 'bold' : 'normal'}
                                textAnchor="middle"
                                fontFamily="monospace"
                              >
                                {item.label}
                              </text>

                              {isHovered && (
                                <g className="pointer-events-none">
                                  <rect
                                    x={tooltipX}
                                    y={tooltipY}
                                    width="156"
                                    height={hasSecondary ? '50' : '38'}
                                    rx="8"
                                    fill="#0b1322"
                                    stroke="#2b3d63"
                                    strokeWidth="1.5"
                                  />
                                  <text
                                    x={tooltipX + 78}
                                    y={tooltipY + 14}
                                    fill="#94a3b8"
                                    fontSize="10"
                                    textAnchor="middle"
                                    fontFamily="monospace"
                                  >
                                    {item.label}
                                  </text>
                                  <text
                                    x={tooltipX + 78}
                                    y={tooltipY + 29}
                                    fill="#ffffff"
                                    fontSize="11"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    fontFamily="monospace"
                                  >
                                    {scoped.primarySeriesLabel}: {formatCurrency(item.primary)}
                                  </text>
                                  {hasSecondary && typeof item.secondary === 'number' && (
                                    <text
                                      x={tooltipX + 78}
                                      y={tooltipY + 43}
                                      fill={scoped.secondaryColor}
                                      fontSize="10.5"
                                      fontWeight="bold"
                                      textAnchor="middle"
                                      fontFamily="monospace"
                                    >
                                      {scoped.secondarySeriesLabel}: {formatCurrency(item.secondary)}
                                    </text>
                                  )}
                                </g>
                              )}
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[#162138] flex flex-wrap items-center justify-between text-xs text-slate-400 gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Variance adjusted against annualized targets</span>
            </div>
            <div className="font-mono text-slate-300">
              Confidence Interval: <span className="text-emerald-400 font-bold">94.8%</span>
            </div>
          </div>
        </div>

        {/* AI Key Insights (5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 xl:p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#162138]">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <h3 className="text-base xl:text-lg font-bold text-white tracking-tight">
                  AI Key Insights
                </h3>
              </div>
              <button
                onClick={() => setCurrentPage('ai-workspace')}
                className="text-xs xl:text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors cursor-pointer"
              >
                Inspect in Workspace
              </button>
            </div>

            {insights.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-[#0b1220] border border-[#162238] space-y-2">
                <p>
                  {rawInsights.length === 0
                    ? 'No active insights loaded in workspace.'
                    : `No active insights matched "${selectedDepartment}".`}
                </p>
                {selectedDepartment !== 'All Enterprise' && rawInsights.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDepartment('All Enterprise')}
                    className="text-blue-400 hover:underline font-medium"
                  >
                    View All Enterprise Insights
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3.5">
                {insights.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setCurrentPage('ai-workspace')}
                    className="p-4 rounded-xl bg-[#111c33] border border-[#1d2b47] hover:border-blue-500/40 cursor-pointer transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                          item.type === 'risk'
                            ? 'bg-amber-400'
                            : item.type === 'opportunity'
                            ? 'bg-teal-400'
                            : 'bg-blue-400'
                        }`}
                      />
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-white">{item.title}</span>
                          <span className="text-xs font-mono text-slate-400 bg-[#0a101d] px-2 py-0.5 rounded">{item.tag || 'AI Synthesis'}</span>
                        </div>
                        <p className="text-xs xl:text-sm text-slate-300 group-hover:text-white leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-[#162138] flex items-center justify-between text-xs text-slate-400">
            <span>Synthesized across 5 domain agents</span>
            <button
              onClick={() => setCurrentPage('ai-workspace')}
              className="text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>Ask Workspace</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM SECTION: TOP OPPORTUNITIES, KEY RISKS, RECENT RECOMMENDATIONS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Top Opportunities */}
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#162138]">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Top Opportunities
            </h3>
            <span className="text-xs font-mono text-slate-500">Valued Upside</span>
          </div>
          {topOpportunities.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 bg-[#0a101d] rounded-xl border border-[#162238]">
              {selectedDepartment === 'All Enterprise'
                ? 'No active opportunities'
                : `No opportunities tagged for ${selectedDepartment}`}
            </div>
          ) : (
            <div className="space-y-3">
              {topOpportunities.map((opp) => (
                <div
                  key={opp.id}
                  onClick={() => setCurrentPage(opp.route)}
                  className="p-4 rounded-xl bg-[#111c33] border border-[#1d2b47] hover:border-blue-500/40 flex items-center justify-between cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Building2 className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100 group-hover:text-white">
                        {opp.title}
                      </h4>
                      <p className="text-xs text-emerald-400 font-mono font-bold mt-0.5">{opp.benefit}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Key Risks */}
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#162138]">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Key Risks
            </h3>
            <span className="text-xs font-mono text-slate-500">Active Exposure</span>
          </div>
          {keyRisks.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 bg-[#0a101d] rounded-xl border border-[#162238]">
              {selectedDepartment === 'All Enterprise'
                ? 'No active risks'
                : `No risks tagged for ${selectedDepartment}`}
            </div>
          ) : (
            <div className="space-y-3">
              {keyRisks.map((risk) => (
                <div
                  key={risk.id}
                  onClick={() => setCurrentPage('forecasts')}
                  className="p-4 rounded-xl bg-[#111c33] border border-[#1d2b47] hover:border-amber-500/40 flex items-center justify-between cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                      <AlertTriangle className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100 group-hover:text-white">
                        {risk.title}
                      </h4>
                      <p className="text-xs text-amber-400 font-medium mt-0.5">{risk.action}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Recommendations */}
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#162138]">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Recent Recommendations
            </h3>
            <span className="text-xs font-mono text-slate-500">Autonomous Pipeline</span>
          </div>
          {recentRecommendations.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 bg-[#0a101d] rounded-xl border border-[#162238]">
              {selectedDepartment === 'All Enterprise'
                ? 'No active recommendations'
                : `No recommendations tagged for ${selectedDepartment}`}
            </div>
          ) : (
            <div className="space-y-3">
              {recentRecommendations.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => setCurrentPage('recommendations')}
                  className="p-4 rounded-xl bg-[#111c33] border border-[#1d2b47] hover:border-blue-500/40 flex items-center justify-between cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                      <FileCheck className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-100 group-hover:text-white truncate">
                        {rec.title}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 font-mono">
                        <span className="text-blue-400 font-bold">{rec.impact}</span>
                        <span>·</span>
                        <span>{rec.date}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
