import type {
  DataSourceItem,
  FiscalPeriod,
  InsightItem,
  MetricCardData,
  OpportunityItem,
  RecommendationItem,
  RecentRecommendationItem,
  RiskItem,
  SalesRecord,
  TrendPoint,
  TrendsData,
} from '../types/cortex';

export interface OverviewChartPoint {
  label: string;
  primary: number;
  secondary?: number;
}

export interface ScopedOverviewData {
  scopeSummary: string;
  dataBasisNote: string;
  kpis: MetricCardData[];
  chartTitle: string;
  chartSubtitle: string;
  primarySeriesLabel: string;
  secondarySeriesLabel: string | null;
  primaryColor: string;
  secondaryColor: string;
  chartPoints: OverviewChartPoint[];
  insights: InsightItem[];
  topOpportunities: OpportunityItem[];
  keyRisks: RiskItem[];
  recentRecommendations: (RecentRecommendationItem & { liveStatus?: RecommendationItem['status'] })[];
}

function getMonthlySliceForPeriod(monthly: TrendPoint[], fiscalPeriod: FiscalPeriod): TrendPoint[] {
  if (monthly.length === 0) return [];
  switch (fiscalPeriod) {
    case 'Q1 FY2026':
      return monthly.slice(0, 3); // Jan - Mar
    case 'Q2 FY2026':
      return monthly.slice(3, 6); // Apr - Jun
    case 'Q3 FY2026':
      return monthly.slice(6, 9); // Jul - Sep
    case 'FY 2025-26 YTD':
      return monthly.slice(0, 9); // Realized Jan - Sep YTD
  }
}

function getQuarterlySliceForPeriod(
  quarterly: TrendPoint[],
  fiscalPeriod: FiscalPeriod
): TrendPoint[] {
  if (quarterly.length === 0) return [];
  switch (fiscalPeriod) {
    case 'Q1 FY2026':
      return quarterly.slice(0, 1);
    case 'Q2 FY2026':
      return quarterly.slice(0, 2);
    case 'Q3 FY2026':
    case 'FY 2025-26 YTD':
      return quarterly.slice(0, 3);
  }
}

function computeDeltaPct(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function formatSignedPct(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  'Commercial Operations': [
    'tier 2',
    'revenue',
    'demand',
    'pricing',
    'product',
    'customer',
    'marketing',
    'regional',
    'growth',
  ],
  'Supply Chain & Logistics': [
    'supply',
    'logistics',
    'raw material',
    'inventory',
    'warehouse',
    'fulfillment',
    'operational',
    'friction',
    'delivery',
  ],
  'Finance & Treasury': [
    'profit',
    'margin',
    'cost',
    'revenue',
    'financial',
    'cogs',
    'working capital',
    'pricing',
  ],
};

function matchesDepartment(text: string, department: string): boolean {
  if (department === 'All Enterprise') return true;
  const keywords = DEPARTMENT_KEYWORDS[department];
  if (!keywords) return true;
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function deriveScopedOverviewData(params: {
  selectedDepartment: string;
  fiscalPeriod: FiscalPeriod;
  trendGranularity: 'Monthly' | 'Quarterly';
  metrics: MetricCardData[];
  trends: TrendsData;
  salesRecords: SalesRecord[];
  dataSources: DataSourceItem[];
  insights: InsightItem[];
  topOpportunities: OpportunityItem[];
  keyRisks: RiskItem[];
  recentRecommendations: RecentRecommendationItem[];
  recommendations: RecommendationItem[];
}): ScopedOverviewData {
  const {
    selectedDepartment,
    fiscalPeriod,
    trendGranularity,
    metrics,
    trends,
    salesRecords,
    dataSources,
    insights,
    topOpportunities,
    keyRisks,
    recentRecommendations,
    recommendations,
  } = params;

  const monthlySlice = getMonthlySliceForPeriod(trends.monthly ?? [], fiscalPeriod);
  const quarterlySlice = getQuarterlySliceForPeriod(trends.quarterly ?? [], fiscalPeriod);
  const activeTrendPoints = trendGranularity === 'Monthly' ? monthlySlice : quarterlySlice;

  const statusById = new Map<string, RecommendationItem['status']>();
  recommendations.forEach((rec) => statusById.set(rec.id, rec.status));

  const enrichedRecentRecs = recentRecommendations
    .filter(
      (rec) =>
        selectedDepartment === 'All Enterprise' ||
        matchesDepartment(`${rec.title} ${rec.impact}`, selectedDepartment)
    )
    .map((rec) => ({
      ...rec,
      liveStatus: statusById.get(rec.id),
    }));

  const scopedInsights = insights.filter((item) =>
    matchesDepartment(`${item.title} ${item.description} ${item.tag ?? ''}`, selectedDepartment)
  );
  const scopedOpportunities = topOpportunities.filter((item) =>
    matchesDepartment(`${item.title} ${item.benefit}`, selectedDepartment)
  );
  const scopedRisks = keyRisks.filter((item) =>
    matchesDepartment(`${item.title} ${item.action}`, selectedDepartment)
  );

  // Sum metrics over selected fiscal period slice
  const periodRev = monthlySlice.reduce((sum, pt) => sum + pt.rev, 0);
  const periodProfit = monthlySlice.reduce((sum, pt) => sum + pt.profit, 0);
  const periodOutflow = Math.max(periodRev - periodProfit, 0);
  const periodMarginPct = periodRev > 0 ? (periodProfit / periodRev) * 100 : 0;

  const prevQuarterTotals =
    fiscalPeriod === 'Q2 FY2026'
      ? trends.quarterly[0]
      : fiscalPeriod === 'Q3 FY2026'
        ? trends.quarterly[1]
        : undefined;

  const revGrowthVsPrev =
    prevQuarterTotals && prevQuarterTotals.rev > 0
      ? computeDeltaPct(periodRev, prevQuarterTotals.rev)
      : monthlySlice.length >= 2
        ? computeDeltaPct(monthlySlice[monthlySlice.length - 1].rev, monthlySlice[0].rev)
        : 0;

  const marginStart =
    monthlySlice.length > 0 && monthlySlice[0].rev > 0
      ? (monthlySlice[0].profit / monthlySlice[0].rev) * 100
      : 0;
  const marginEnd =
    monthlySlice.length > 0 && monthlySlice[monthlySlice.length - 1].rev > 0
      ? (monthlySlice[monthlySlice.length - 1].profit /
          monthlySlice[monthlySlice.length - 1].rev) *
        100
      : 0;
  const marginDelta = marginEnd - marginStart;

  // Build department & fiscal period KPIs & chart series strictly from loaded data
  if (metrics.length === 0 && monthlySlice.length === 0 && salesRecords.length === 0) {
    return {
      scopeSummary: `${selectedDepartment} · ${fiscalPeriod}`,
      dataBasisNote: 'No organizational dataset loaded.',
      kpis: [],
      chartTitle: 'Revenue & Profit Performance Trend',
      chartSubtitle: 'No dataset available',
      primarySeriesLabel: 'Revenue',
      secondarySeriesLabel: 'Net Profit',
      primaryColor: '#3b82f6',
      secondaryColor: '#2dd4bf',
      chartPoints: [],
      insights: [],
      topOpportunities: [],
      keyRisks: [],
      recentRecommendations: [],
    };
  }

  if (selectedDepartment === 'Commercial Operations') {
    const dailyTotals = new Map<string, { revenueInr: number; units: number }>();
    const regionTotals = new Map<string, number>();

    salesRecords.forEach((rec) => {
      const existing = dailyTotals.get(rec.date) ?? { revenueInr: 0, units: 0 };
      existing.revenueInr += rec.revenue;
      existing.units += rec.quantity;
      dailyTotals.set(rec.date, existing);
      regionTotals.set(rec.region, (regionTotals.get(rec.region) ?? 0) + rec.revenue);
    });

    const sortedDates = Array.from(dailyTotals.keys()).sort();
    const totalSalesInr = salesRecords.reduce((s, r) => s + r.revenue, 0);
    const totalUnits = salesRecords.reduce((s, r) => s + r.quantity, 0);
    const avgOrderCr = salesRecords.length > 0 ? totalSalesInr / salesRecords.length / 1e7 : 0;

    let topRegion = 'N/A';
    let topRegionRev = 0;
    regionTotals.forEach((rev, region) => {
      if (rev > topRegionRev) {
        topRegionRev = rev;
        topRegion = region;
      }
    });
    const topRegionSharePct = totalSalesInr > 0 ? (topRegionRev / totalSalesInr) * 100 : 0;

    const kpis: MetricCardData[] =
      salesRecords.length > 0
        ? [
            {
              id: 'comm-sales-rev',
              label: 'Logged Transaction Revenue',
              value: `${(totalSalesInr / 1e7).toFixed(2)} Cr`,
              change: `${salesRecords.length} orders logged`,
              isPositive: true,
              history: sortedDates.map((d) => (dailyTotals.get(d)?.revenueInr ?? 0) / 1e7),
              numericValue: totalSalesInr / 1e7,
              unit: 'currency',
            },
            {
              id: 'comm-units',
              label: 'Total Units Shipped',
              value: totalUnits.toLocaleString('en-US'),
              change: `${sortedDates.length} active days`,
              isPositive: true,
              history: sortedDates.map((d) => dailyTotals.get(d)?.units ?? 0),
              numericValue: totalUnits,
              unit: 'units',
            },
            {
              id: 'comm-aov',
              label: 'Avg Transaction Value',
              value: `${avgOrderCr.toFixed(2)} Cr`,
              change: 'From Sales Database',
              isPositive: true,
              history: salesRecords.slice(-6).map((r) => r.revenue / 1e7),
              numericValue: avgOrderCr,
              unit: 'currency',
            },
            {
              id: 'comm-region-share',
              label: `Lead Region (${topRegion})`,
              value: `${topRegionSharePct.toFixed(1)}%`,
              change: `${regionTotals.size} regions active`,
              isPositive: topRegionSharePct > 0,
              history: Array.from(regionTotals.values()).map((v) =>
                totalSalesInr > 0 ? (v / totalSalesInr) * 100 : 0
              ),
              numericValue: topRegionSharePct,
              unit: 'percent',
            },
          ]
        : [];

    const chartPoints: OverviewChartPoint[] = sortedDates.map((dateStr) => {
      const day = dailyTotals.get(dateStr)!;
      return {
        label: dateStr.slice(5), // MM-DD
        primary: parseFloat((day.revenueInr / 1e7).toFixed(3)),
      };
    });

    return {
      scopeSummary: `Commercial Operations · ${salesRecords.length} Sales Records`,
      dataBasisNote:
        'Aggregated directly from Sales Database records (note: bundled transaction log covers Oct 1-6, 2026).',
      kpis,
      chartTitle: 'Commercial Sales Telemetry Trend',
      chartSubtitle: 'Daily recorded transaction revenue (INR Cr equivalent) across Sales Database batches',
      primarySeriesLabel: 'Daily Transaction Sales',
      secondarySeriesLabel: null,
      primaryColor: '#3b82f6',
      secondaryColor: '#2dd4bf',
      chartPoints,
      insights: scopedInsights,
      topOpportunities: scopedOpportunities,
      keyRisks: scopedRisks,
      recentRecommendations: enrichedRecentRecs,
    };
  }

  if (selectedDepartment === 'Supply Chain & Logistics') {
    const supplySources = dataSources.filter(
      (ds) => ds.category === 'Supply Chain' || ds.category === 'Operations'
    );
    const opsRecs = recommendations.filter((rec) => rec.category === 'Operational');
    const outflowRatio = periodRev > 0 ? (periodOutflow / periodRev) * 100 : 0;
    const outflowChangeVsPrev =
      prevQuarterTotals && prevQuarterTotals.rev - prevQuarterTotals.profit > 0
        ? computeDeltaPct(periodOutflow, prevQuarterTotals.rev - prevQuarterTotals.profit)
        : monthlySlice.length >= 2
          ? computeDeltaPct(
              monthlySlice[monthlySlice.length - 1].rev -
                monthlySlice[monthlySlice.length - 1].profit,
              monthlySlice[0].rev - monthlySlice[0].profit
            )
          : 0;

    const kpis: MetricCardData[] =
      monthlySlice.length > 0
        ? [
            {
              id: 'sc-outflow',
              label: `${fiscalPeriod} Operating Outflow`,
              value: `${periodOutflow.toFixed(1)} Cr`,
              change: `${formatSignedPct(outflowChangeVsPrev)} ${prevQuarterTotals ? 'QoQ' : 'intra-period'}`,
              isPositive: outflowChangeVsPrev <= 0,
              history: monthlySlice.map((m) => parseFloat((m.rev - m.profit).toFixed(1))),
              numericValue: periodOutflow,
              unit: 'currency',
            },
            {
              id: 'sc-cost-ratio',
              label: 'Cost-to-Revenue Ratio',
              value: `${outflowRatio.toFixed(1)}%`,
              change: `${monthlySlice.length} mo realized`,
              isPositive: outflowRatio < 82,
              history: monthlySlice.map((m) =>
                m.rev > 0 ? parseFloat((((m.rev - m.profit) / m.rev) * 100).toFixed(1)) : 0
              ),
              numericValue: outflowRatio,
              unit: 'percent',
            },
            {
              id: 'sc-sources',
              label: 'Ops & Supply Data Feeds',
              value: `${supplySources.length}`,
              change: supplySources.every((s) => s.status.startsWith('Connected'))
                ? 'All feeds connected'
                : 'Mixed sync state',
              isPositive: supplySources.length > 0,
              history: supplySources.map((s) =>
                parseInt(s.recordsCount.replace(/,/g, ''), 10) || 1
              ),
              numericValue: supplySources.length,
              unit: 'count',
            },
            {
              id: 'sc-actions',
              label: 'Operational Initiatives',
              value: `${opsRecs.length}`,
              change: `${opsRecs.filter((r) => r.status === 'Approved').length} approved`,
              isPositive: opsRecs.length > 0,
              history: opsRecs.map((r) => r.confidence),
              numericValue: opsRecs.length,
              unit: 'count',
            },
          ]
        : [];

    const chartPoints: OverviewChartPoint[] = activeTrendPoints.map((pt) => ({
      label: pt.label,
      primary: parseFloat((pt.rev - pt.profit).toFixed(1)),
      secondary: pt.profit,
    }));

    return {
      scopeSummary: `Supply Chain & Logistics · ${fiscalPeriod}`,
      dataBasisNote:
        'Derived from implied enterprise operating outflow (Revenue minus Profit) in trends dataset and Operations/Supply Chain feed registry.',
      kpis,
      chartTitle: 'Implied Cost Outflow vs Retained Profit',
      chartSubtitle: `${fiscalPeriod} cost structure curve (${trendGranularity.toLowerCase()} aggregation)`,
      primarySeriesLabel: 'Operating Outflow',
      secondarySeriesLabel: 'Retained Profit',
      primaryColor: '#f59e0b',
      secondaryColor: '#2dd4bf',
      chartPoints,
      insights: scopedInsights,
      topOpportunities: scopedOpportunities,
      keyRisks: scopedRisks,
      recentRecommendations: enrichedRecentRecs,
    };
  }

  if (selectedDepartment === 'Finance & Treasury') {
    const finRecs = recommendations.filter((rec) => rec.category === 'Financial');
    const latestRev = monthlySlice.length > 0 ? monthlySlice[monthlySlice.length - 1].rev : 0;

    const kpis: MetricCardData[] =
      monthlySlice.length > 0
        ? [
            {
              id: 'fin-rev',
              label: `${fiscalPeriod} Gross Revenue`,
              value: `${periodRev.toFixed(1)} Cr`,
              change: `${formatSignedPct(revGrowthVsPrev)} ${prevQuarterTotals ? 'vs prior qtr' : 'intra-period'}`,
              isPositive: revGrowthVsPrev >= 0,
              history: monthlySlice.map((m) => m.rev),
              numericValue: periodRev,
              unit: 'currency',
            },
            {
              id: 'fin-profit',
              label: `${fiscalPeriod} Net Profit`,
              value: `${periodProfit.toFixed(1)} Cr`,
              change: `${periodMarginPct.toFixed(1)}% period margin`,
              isPositive: periodProfit > 0,
              history: monthlySlice.map((m) => m.profit),
              numericValue: periodProfit,
              unit: 'currency',
            },
            {
              id: 'fin-margin',
              label: 'Treasury Margin Rate',
              value: `${periodMarginPct.toFixed(1)}%`,
              change: `${formatSignedPct(marginDelta)} period shift`,
              isPositive: marginDelta >= 0,
              history: monthlySlice.map((m) =>
                m.rev > 0 ? parseFloat(((m.profit / m.rev) * 100).toFixed(1)) : 0
              ),
              numericValue: periodMarginPct,
              unit: 'percent',
            },
            {
              id: 'fin-runrate',
              label: `Exit Run-Rate (${monthlySlice[monthlySlice.length - 1]?.label ?? 'Latest'})`,
              value: `${latestRev.toFixed(1)} Cr`,
              change: `${finRecs.length} financial actions tracked`,
              isPositive: latestRev > 0,
              history: monthlySlice.map((m) => m.rev),
              numericValue: latestRev,
              unit: 'currency',
            },
          ]
        : [];

    const chartPoints: OverviewChartPoint[] = activeTrendPoints.map((pt) => ({
      label: pt.label,
      primary: pt.rev,
      secondary: pt.profit,
    }));

    return {
      scopeSummary: `Finance & Treasury · ${fiscalPeriod}`,
      dataBasisNote:
        'Computed directly from monthly and quarterly revenue/profit series in enterprise trends dataset.',
      kpis,
      chartTitle: 'Treasury Revenue & Net Profit Realization',
      chartSubtitle: `${fiscalPeriod} financial trajectory (${trendGranularity.toLowerCase()} scale)`,
      primarySeriesLabel: 'Revenue',
      secondarySeriesLabel: 'Net Profit',
      primaryColor: '#3b82f6',
      secondaryColor: '#2dd4bf',
      chartPoints,
      insights: scopedInsights,
      topOpportunities: scopedOpportunities,
      keyRisks: scopedRisks,
      recentRecommendations: enrichedRecentRecs,
    };
  }

  // Default: All Enterprise
  let enterpriseKpis = metrics;
  if (fiscalPeriod !== 'Q3 FY2026' && monthlySlice.length > 0) {
    const profitChangeVsPrev =
      prevQuarterTotals && prevQuarterTotals.profit > 0
        ? computeDeltaPct(periodProfit, prevQuarterTotals.profit)
        : monthlySlice.length >= 2
          ? computeDeltaPct(monthlySlice[monthlySlice.length - 1].profit, monthlySlice[0].profit)
          : 0;

    enterpriseKpis = [
      {
        id: 'period-revenue',
        label: `${fiscalPeriod} Revenue`,
        value: `${periodRev.toFixed(1)} Cr`,
        change: `${formatSignedPct(revGrowthVsPrev)} ${prevQuarterTotals ? 'vs prior qtr' : 'intra-period'}`,
        isPositive: revGrowthVsPrev >= 0,
        history: monthlySlice.map((m) => m.rev),
        numericValue: periodRev,
        unit: 'currency',
      },
      {
        id: 'period-margin',
        label: `${fiscalPeriod} Profit Margin`,
        value: `${periodMarginPct.toFixed(1)}%`,
        change: `${formatSignedPct(marginDelta)} period shift`,
        isPositive: marginDelta >= 0,
        history: monthlySlice.map((m) =>
          m.rev > 0 ? parseFloat(((m.profit / m.rev) * 100).toFixed(1)) : 0
        ),
        numericValue: periodMarginPct,
        unit: 'percent',
      },
      {
        id: 'period-profit',
        label: `${fiscalPeriod} Net Profit`,
        value: `${periodProfit.toFixed(1)} Cr`,
        change: `${formatSignedPct(profitChangeVsPrev)} ${prevQuarterTotals ? 'vs prior qtr' : 'intra-period'}`,
        isPositive: profitChangeVsPrev >= 0,
        history: monthlySlice.map((m) => m.profit),
        numericValue: periodProfit,
        unit: 'currency',
      },
      {
        id: 'period-outflow',
        label: `${fiscalPeriod} Implied Outflow`,
        value: `${periodOutflow.toFixed(1)} Cr`,
        change: `${monthlySlice.length} months realized`,
        isPositive: true,
        history: monthlySlice.map((m) => parseFloat((m.rev - m.profit).toFixed(1))),
        numericValue: periodOutflow,
        unit: 'currency',
      },
    ];
  }

  return {
    scopeSummary: `All Enterprise · ${fiscalPeriod}`,
    dataBasisNote:
      fiscalPeriod === 'Q3 FY2026'
        ? 'Showing Q3 FY2026 executive baseline KPIs alongside Jul-Sep financial trend slice.'
        : `Derived directly from ${monthlySlice.length}-month realized trends slice (${monthlySlice[0]?.label ?? ''}–${monthlySlice[monthlySlice.length - 1]?.label ?? ''}).`,
    kpis: enterpriseKpis,
    chartTitle: 'Revenue & Profit Performance Trend',
    chartSubtitle: `${fiscalPeriod} · ${trendGranularity} trajectory`,
    primarySeriesLabel: 'Revenue',
    secondarySeriesLabel: 'Net Profit',
    primaryColor: '#3b82f6',
    secondaryColor: '#2dd4bf',
    chartPoints: activeTrendPoints.map((pt) => ({
      label: pt.label,
      primary: pt.rev,
      secondary: pt.profit,
    })),
    insights: scopedInsights,
    topOpportunities: scopedOpportunities,
    keyRisks: scopedRisks,
    recentRecommendations: enrichedRecentRecs,
  };
}

