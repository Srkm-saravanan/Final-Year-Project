export interface ScenarioParamsDto {
  priceChange: number;
  marketingBudget: number;
  productionVolume: number;
  staffingLevel: 'No Change' | '+5%' | '+10%' | '-5%';
}

export interface ScenarioKPIsDto {
  revenue: number;
  profit: number;
  profitMargin: number;
  marketShare: number;
  roi: number;
}

export const DEFAULT_BASELINE_KPIS: ScenarioKPIsDto = {
  revenue: 124.3,
  profit: 22.8,
  profitMargin: 18.4,
  marketShare: 12.5,
  roi: 16.2,
};

const BASE_VARIABLE_COST = 80.8;
const BASE_FIXED_COST = 20.7;

function getStaffCostMultiplier(staffingLevel: ScenarioParamsDto['staffingLevel']): number {
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

export function calculateScenarioKpis(
  params: ScenarioParamsDto,
  baselineKPIs: ScenarioKPIsDto = DEFAULT_BASELINE_KPIS
): ScenarioKPIsDto {
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
  kpis: ScenarioKPIsDto,
  baselineKPIs: ScenarioKPIsDto = DEFAULT_BASELINE_KPIS
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

