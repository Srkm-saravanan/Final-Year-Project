import type { ScenarioKPIs, ScenarioParams, SavedScenario } from '../types/cortex';

export const DEFAULT_BASELINE_KPIS: ScenarioKPIs = {
  revenue: 124.3,
  profit: 22.8,
  profitMargin: 18.4,
  marketShare: 12.5,
  roi: 16.2,
};

export const DEFAULT_SCENARIO_PARAMS: ScenarioParams = {
  priceChange: 5,
  marketingBudget: 15,
  productionVolume: 10,
  staffingLevel: 'No Change',
};

const BASE_VARIABLE_COST = 80.8;
const BASE_FIXED_COST = 20.7;

export function getStaffCostMultiplier(staffingLevel: ScenarioParams['staffingLevel']): number {
  switch (staffingLevel) {
    case '+10%':
      return 1.08;
    case '+5%':
      return 1.04;
    case '-5%':
      return 0.96;
    default:
      return 1.0;
  }
}

export function calculateSimulation(
  params: ScenarioParams,
  baselineKPIs: ScenarioKPIs = DEFAULT_BASELINE_KPIS
): ScenarioKPIs {
  const priceFactor = 1 + params.priceChange / 100;
  const demandResponse = 1 - (params.priceChange * 0.4) / 100;
  const marketingLift = 1 + (params.marketingBudget - 10) * 0.015;
  const productionFactor = Math.max(1 + params.productionVolume / 100, 0.1);

  const effectiveVolumeRatio = Math.max(Math.min(demandResponse * marketingLift, productionFactor), 0);
  const calculatedRevenue = Math.max(baselineKPIs.revenue * priceFactor * effectiveVolumeRatio, 0);

  const staffCostMultiplier = getStaffCostMultiplier(params.staffingLevel);
  const marketingCost = params.marketingBudget;
  const productionVariableCost = BASE_VARIABLE_COST * (productionFactor * 0.95);
  const totalCost = productionVariableCost + BASE_FIXED_COST * staffCostMultiplier + marketingCost;

  const calculatedProfit = calculatedRevenue - totalCost;
  const calculatedMargin = calculatedRevenue > 0 ? (calculatedProfit / calculatedRevenue) * 100 : 0;
  const calculatedMarketShare = Math.min(
    Math.max(baselineKPIs.marketShare * effectiveVolumeRatio * 1.05, 0),
    24.0
  );
  const calculatedROI = totalCost > 0 ? (calculatedProfit / totalCost) * 100 : 0;

  return {
    revenue: parseFloat(calculatedRevenue.toFixed(1)),
    profit: parseFloat(calculatedProfit.toFixed(1)),
    profitMargin: parseFloat(calculatedMargin.toFixed(1)),
    marketShare: parseFloat(calculatedMarketShare.toFixed(1)),
    roi: parseFloat(calculatedROI.toFixed(1)),
  };
}

export function formatScenarioOutlook(
  kpis: ScenarioKPIs,
  baselineKPIs: ScenarioKPIs = DEFAULT_BASELINE_KPIS
): string {
  if (kpis.profit < 0) {
    return `Net Loss Risk (${kpis.profit.toFixed(1)} Cr)`;
  }
  const profitChangePct =
    baselineKPIs.profit !== 0
      ? ((kpis.profit - baselineKPIs.profit) / Math.abs(baselineKPIs.profit)) * 100
      : 0;
  if (kpis.profit > baselineKPIs.profit) {
    return `Positive Outlook (+${profitChangePct.toFixed(1)}% Profit)`;
  }
  return `Caution (${profitChangePct.toFixed(1)}% vs Baseline)`;
}

export function buildDefaultSavedScenarios(
  baselineKPIs: ScenarioKPIs = DEFAULT_BASELINE_KPIS
): SavedScenario[] {
  const defaultParams: ScenarioParams = { ...DEFAULT_SCENARIO_PARAMS };
  const computedKPIs = calculateSimulation(defaultParams, baselineKPIs);
  return [
    {
      id: 'sc-1',
      name: 'Q4 Expansion Plan (+5% Price, 15Cr Mktg)',
      timestamp: 'Oct 8, 2026',
      params: defaultParams,
      kpis: computedKPIs,
      outlook: formatScenarioOutlook(computedKPIs, baselineKPIs),
    },
  ];
}

export interface SimulationBreakdown {
  priceFactor: number;
  demandResponsePct: number;
  marketingLiftPct: number;
  productionFactor: number;
  effectiveVolumeRatio: number;
  isCapacityConstrained: boolean;
  capacityUtilizationPct: number;
  excessDemandGapPct: number;
  productionVariableCost: number;
  fixedStaffCost: number;
  marketingSpend: number;
  totalCost: number;
  revenueDeltaCr: number;
  profitDeltaCr: number;
  marginDeltaPts: number;
  marketingRoas: number;
}

export function computeSimulationBreakdown(
  params: ScenarioParams,
  baselineKPIs: ScenarioKPIs = DEFAULT_BASELINE_KPIS
): SimulationBreakdown {
  const kpis = calculateSimulation(params, baselineKPIs);
  const priceFactor = 1 + params.priceChange / 100;
  const demandResponse = 1 - (params.priceChange * 0.4) / 100;
  const marketingLift = 1 + (params.marketingBudget - 10) * 0.015;
  const productionFactor = Math.max(1 + params.productionVolume / 100, 0.1);
  const unconstrainedDemand = demandResponse * marketingLift;
  const effectiveVolumeRatio = Math.max(Math.min(unconstrainedDemand, productionFactor), 0);

  const staffCostMultiplier = getStaffCostMultiplier(params.staffingLevel);
  const productionVariableCost = parseFloat((BASE_VARIABLE_COST * (productionFactor * 0.95)).toFixed(1));
  const fixedStaffCost = parseFloat((BASE_FIXED_COST * staffCostMultiplier).toFixed(1));
  const marketingSpend = parseFloat(params.marketingBudget.toFixed(1));
  const totalCost = parseFloat((productionVariableCost + fixedStaffCost + marketingSpend).toFixed(1));

  const isCapacityConstrained = unconstrainedDemand > productionFactor;
  const capacityUtilizationPct = parseFloat(
    Math.min(Math.max((effectiveVolumeRatio / productionFactor) * 100, 0), 100).toFixed(1)
  );
  const excessDemandGapPct = parseFloat(
    (Math.max(unconstrainedDemand - productionFactor, 0) * 100).toFixed(1)
  );

  return {
    priceFactor,
    demandResponsePct: parseFloat(((demandResponse - 1) * 100).toFixed(1)),
    marketingLiftPct: parseFloat(((marketingLift - 1) * 100).toFixed(1)),
    productionFactor,
    effectiveVolumeRatio: parseFloat(effectiveVolumeRatio.toFixed(3)),
    isCapacityConstrained,
    capacityUtilizationPct,
    excessDemandGapPct,
    productionVariableCost,
    fixedStaffCost,
    marketingSpend,
    totalCost,
    revenueDeltaCr: parseFloat((kpis.revenue - baselineKPIs.revenue).toFixed(1)),
    profitDeltaCr: parseFloat((kpis.profit - baselineKPIs.profit).toFixed(1)),
    marginDeltaPts: parseFloat((kpis.profitMargin - baselineKPIs.profitMargin).toFixed(1)),
    marketingRoas: marketingSpend > 0 ? parseFloat((kpis.revenue / marketingSpend).toFixed(2)) : 0,
  };
}

export interface StressTestResult {
  name: string;
  description: string;
  projectedKPIs: ScenarioKPIs;
  profitDeltaFromCurrent: number;
}

export interface ScenarioRiskDriver {
  title: string;
  severity: 'High' | 'Medium' | 'Low';
  metric: string;
  detail: string;
}

export interface SimulationRiskAnalysis {
  overallRiskScore: number;
  riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'Critical';
  riskDrivers: ScenarioRiskDriver[];
  stressTests: StressTestResult[];
}

export function analyzeScenarioRisks(
  params: ScenarioParams,
  currentKPIs: ScenarioKPIs,
  baselineKPIs: ScenarioKPIs = DEFAULT_BASELINE_KPIS
): SimulationRiskAnalysis {
  const breakdown = computeSimulationBreakdown(params, baselineKPIs);
  const riskDrivers: ScenarioRiskDriver[] = [];
  let riskPoints = 12;

  if (currentKPIs.profit < 0) {
    riskPoints += 42;
    riskDrivers.push({
      title: 'Operating Loss Exposure',
      severity: 'High',
      metric: `${currentKPIs.profit.toFixed(1)} Cr`,
      detail: `Projected total costs (${breakdown.totalCost.toFixed(1)} Cr) exceed projected revenue (${currentKPIs.revenue.toFixed(1)} Cr).`,
    });
  } else if (currentKPIs.profit < baselineKPIs.profit) {
    riskPoints += 22;
    riskDrivers.push({
      title: 'Profit Below Enterprise Baseline',
      severity: 'Medium',
      metric: `${breakdown.profitDeltaCr.toFixed(1)} Cr`,
      detail: `Selected operating mix trails baseline quarterly profit (${baselineKPIs.profit.toFixed(1)} Cr).`,
    });
  }

  if (breakdown.isCapacityConstrained) {
    riskPoints += Math.min(breakdown.excessDemandGapPct * 1.4, 24);
    riskDrivers.push({
      title: 'Production Capacity Bottleneck',
      severity: breakdown.excessDemandGapPct > 8 ? 'High' : 'Medium',
      metric: `+${breakdown.excessDemandGapPct.toFixed(1)}% Unmet Demand`,
      detail: `Stimulated demand exceeds ${params.productionVolume >= 0 ? '+' : ''}${params.productionVolume}% production volume cap at ${breakdown.capacityUtilizationPct.toFixed(1)}% utilization.`,
    });
  } else if (breakdown.capacityUtilizationPct < 80) {
    riskPoints += 14;
    riskDrivers.push({
      title: 'Under-Utilized Production Cost Drag',
      severity: 'Medium',
      metric: `${breakdown.capacityUtilizationPct.toFixed(1)}% Utilization`,
      detail: `Variable production spend (${breakdown.productionVariableCost.toFixed(1)} Cr) scales above active demand absorption.`,
    });
  }

  if (params.priceChange >= 8) {
    riskPoints += 15;
    riskDrivers.push({
      title: 'Price Elasticity Churn Sensitivity',
      severity: params.priceChange >= 15 ? 'High' : 'Medium',
      metric: `${breakdown.demandResponsePct.toFixed(1)}% Demand Effect`,
      detail: `Pricing increase of +${params.priceChange}% induces ${breakdown.demandResponsePct.toFixed(1)}% modeled unit demand contraction.`,
    });
  } else if (params.priceChange <= -8) {
    riskPoints += 16;
    riskDrivers.push({
      title: 'Unit Margin Compression',
      severity: 'Medium',
      metric: `${currentKPIs.profitMargin.toFixed(1)}% Margin`,
      detail: `Discounting (${params.priceChange}%) compresses gross margin by ${Math.abs(breakdown.marginDeltaPts).toFixed(1)} pts relative to baseline.`,
    });
  }

  if (params.staffingLevel === '-5%' && params.productionVolume > 10) {
    riskPoints += 12;
    riskDrivers.push({
      title: 'Workforce-to-Output Mismatch',
      severity: 'Medium',
      metric: '-5% Staff / High Output',
      detail: `Scaling production +${params.productionVolume}% with -5% staffing elevates execution fatigue and SLA variance.`,
    });
  }

  if (riskDrivers.length === 0) {
    riskDrivers.push({
      title: 'Balanced Operating Envelope',
      severity: 'Low',
      metric: `${breakdown.capacityUtilizationPct.toFixed(1)}% Utilized`,
      detail: 'Price elasticity, marketing lift, and production capacity remain aligned within nominal tolerance.',
    });
  }

  const boundedScore = Math.round(Math.min(Math.max(riskPoints, 5), 98));
  const riskLevel: SimulationRiskAnalysis['riskLevel'] =
    boundedScore >= 70
      ? 'Critical'
      : boundedScore >= 45
        ? 'Elevated'
        : boundedScore >= 25
          ? 'Moderate'
          : 'Low';

  const stressConfigs: { name: string; description: string; params: ScenarioParams }[] = [
    {
      name: 'Competitive Price Match (-5% Price)',
      description: 'Assesses margin resilience if market competition forces a 5% price rollback.',
      params: { ...params, priceChange: params.priceChange - 5 },
    },
    {
      name: 'Supply Disruption (-15% Production Cap)',
      description: 'Simulates a 15-point reduction in fulfillable production volume.',
      params: { ...params, productionVolume: params.productionVolume - 15 },
    },
    {
      name: 'Marketing Pullback (-5 Cr Budget)',
      description: 'Evaluates volume floor if discretionary campaign budget is cut by 5 Cr.',
      params: { ...params, marketingBudget: Math.max(0, params.marketingBudget - 5) },
    },
  ];

  const stressTests: StressTestResult[] = stressConfigs.map((cfg) => {
    const projectedKPIs = calculateSimulation(cfg.params, baselineKPIs);
    return {
      name: cfg.name,
      description: cfg.description,
      projectedKPIs,
      profitDeltaFromCurrent: parseFloat((projectedKPIs.profit - currentKPIs.profit).toFixed(1)),
    };
  });

  return {
    overallRiskScore: boundedScore,
    riskLevel,
    riskDrivers,
    stressTests,
  };
}

