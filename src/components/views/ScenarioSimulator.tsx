import React, { useMemo, useState } from 'react';
import {
  Sliders,
  Play,
  BookmarkPlus,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trash2,
  FolderOpen
} from 'lucide-react';
import { useAppUI, useAuth, useSimulation } from '../../context/CortexContext';
import { createSmoothPath } from '../../utils/chartUtils';
import {
  analyzeScenarioRisks,
  computeSimulationBreakdown
} from '../../utils/simulationEngine';

export const ScenarioSimulator: React.FC = () => {
  const { formatCurrency } = useAppUI();
  const { hasPermission } = useAuth();
  const {
    scenarioParams,
    setScenarioParams,
    scenarioKPIs,
    baselineKPIs,
    isSimulating,
    isLoadingScenarios,
    scenarioError,
    runSimulation,
    savedScenarios,
    activeScenarioId,
    saveCurrentScenario,
    loadScenario,
    deleteScenario
  } = useSimulation();

  const canWriteScenarios = hasPermission('scenarios:write');
  const canDeleteScenarios = hasPermission('scenarios:delete');
  const [isSavingScenario, setIsSavingScenario] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'Comparison View' | 'Detailed Results' | 'Risk Analysis'>('Comparison View');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scenarioNameInput, setScenarioNameInput] = useState('');
  const [showSavedToast, setShowSavedToast] = useState(false);

  const breakdown = useMemo(
    () => computeSimulationBreakdown(scenarioParams, baselineKPIs),
    [scenarioParams, baselineKPIs]
  );

  const riskAnalysis = useMemo(
    () => analyzeScenarioRisks(scenarioParams, scenarioKPIs, baselineKPIs),
    [scenarioParams, scenarioKPIs, baselineKPIs]
  );

  const months = ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'];
  const baselineProfitCurve = [18.2, 19.5, 20.8, 21.4, 22.1, 22.8];

  const proposedProfitCurve = baselineProfitCurve.map((base, i) => {
    const ratio = baselineKPIs.profit !== 0 ? scenarioKPIs.profit / baselineKPIs.profit : 1;
    const progress = (i + 1) / baselineProfitCurve.length;
    return parseFloat((base * (1 + (ratio - 1) * progress)).toFixed(1));
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingScenario(true);
    setActionError(null);
    try {
      await saveCurrentScenario(scenarioNameInput);
      setScenarioNameInput('');
      setSaveModalOpen(false);
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save scenario.');
    } finally {
      setIsSavingScenario(false);
    }
  };

  const handleDeleteScenario = async (id: string) => {
    setActionError(null);
    try {
      await deleteScenario(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete scenario.');
    }
  };

  const resetToBaseline = () => {
    const baselineParams = {
      priceChange: 0,
      marketingBudget: 10,
      productionVolume: 0,
      staffingLevel: 'No Change' as const
    };
    setScenarioParams(baselineParams);
    runSimulation(baselineParams);
  };

  const profitGrowthPercent =
    baselineKPIs.profit !== 0
      ? ((scenarioKPIs.profit - baselineKPIs.profit) / baselineKPIs.profit) * 100
      : 0;
  const allCurveValues = [...baselineProfitCurve, ...proposedProfitCurve];
  const minYVal = Math.min(0, Math.floor(Math.min(...allCurveValues) / 10) * 10);
  const maxYVal = Math.max(30, Math.ceil(Math.max(...allCurveValues) / 10) * 10);
  const yRange = Math.max(maxYVal - minYVal, 10);
  const toSvgY = (val: number) => 140 - ((val - minYVal) / yRange) * 120;
  const profitYTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
    Math.round(minYVal + yRange * fraction)
  );
  const proposedLineColor = scenarioKPIs.profit < 0 ? '#f43f5e' : '#2dd4bf';

  return (
    <div className="w-full max-w-[1920px] mx-auto p-6 md:p-8 xl:p-10 space-y-8">
      {/* Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-3 border-b border-[#162138]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Scenario Simulator & Monte Carlo Sensitivity Lab
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Test strategic price and capacity hypotheses with instant non-linear profit surface recalculations
          </p>
        </div>

        <button
          onClick={resetToBaseline}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111c33] hover:bg-[#162340] border border-[#1d2b47] text-xs xl:text-sm font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-slate-400" />
          <span>Reset to Baseline</span>
        </button>
      </div>

      {/* Main Grid: Parameters (Left 4 cols) + Comparison / Results (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Scenario Parameters Controls Panel (4 cols) */}
        <div className="lg:col-span-4 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm space-y-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 mb-5 border-b border-[#162138]">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4.5 h-4.5 text-blue-400" />
                <span>Decision Variables</span>
              </h3>
              <span className="text-xs font-mono text-slate-500">Live Feedback</span>
            </div>

            <div className="space-y-5">
              {/* Parameter 1: Product Price Change */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300 font-semibold">Product Price Adjustment</span>
                  <span className="font-bold text-blue-400 bg-[#121c33] px-3 py-1 rounded-lg border border-[#1d2b47] font-mono text-sm">
                    {scenarioParams.priceChange > 0 ? `+${scenarioParams.priceChange}%` : `${scenarioParams.priceChange}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="30"
                  step="1"
                  value={scenarioParams.priceChange}
                  onChange={(e) =>
                    setScenarioParams((prev) => ({
                      ...prev,
                      priceChange: parseInt(e.target.value)
                    }))
                  }
                  className="w-full h-2 bg-[#121c33] rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>-20% (Discount)</span>
                  <span>0%</span>
                  <span>+30% (Premium)</span>
                </div>
              </div>

              {/* Parameter 2: Marketing Budget */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300 font-semibold">Growth & Marketing Allocation</span>
                  <span className="font-bold text-blue-400 bg-[#121c33] px-3 py-1 rounded-lg border border-[#1d2b47] font-mono text-sm">
                    {formatCurrency(scenarioParams.marketingBudget)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={scenarioParams.marketingBudget}
                  onChange={(e) =>
                    setScenarioParams((prev) => ({
                      ...prev,
                      marketingBudget: parseInt(e.target.value)
                    }))
                  }
                  className="w-full h-2 bg-[#121c33] rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>{formatCurrency(0)}</span>
                  <span>{formatCurrency(20)}</span>
                  <span>{formatCurrency(40)}</span>
                </div>
              </div>

              {/* Parameter 3: Production Volume */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300 font-semibold">Production Volume Target</span>
                  <span className="font-bold text-blue-400 bg-[#121c33] px-3 py-1 rounded-lg border border-[#1d2b47] font-mono text-sm">
                    {scenarioParams.productionVolume > 0 ? `+${scenarioParams.productionVolume}%` : `${scenarioParams.productionVolume}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="50"
                  step="5"
                  value={scenarioParams.productionVolume}
                  onChange={(e) =>
                    setScenarioParams((prev) => ({
                      ...prev,
                      productionVolume: parseInt(e.target.value)
                    }))
                  }
                  className="w-full h-1.5 bg-[#121c33] rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>-30%</span>
                  <span>0%</span>
                  <span>+50%</span>
                </div>
              </div>

              {/* Parameter 4: Staffing Level */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Headcount / Staffing Delta</span>
                  <span className="font-semibold text-white font-mono">{scenarioParams.staffingLevel}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 font-mono">
                  {(['-5%', 'No Change', '+5%', '+10%'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() =>
                        setScenarioParams((prev) => ({ ...prev, staffingLevel: lvl }))
                      }
                      className={`py-1.5 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                        scenarioParams.staffingLevel === lvl
                          ? 'bg-blue-600 text-white shadow-xs font-semibold'
                          : 'bg-[#121c33] text-slate-400 hover:text-white border border-[#1e293b]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-4 border-t border-[#162138]">
            <button
              onClick={() => runSimulation()}
              disabled={isSimulating}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Computing Monte Carlo iterations...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Simulation Engine</span>
                </>
              )}
            </button>

            {canWriteScenarios ? (
              <button
                onClick={() => setSaveModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[#111c33] hover:bg-[#152340] border border-[#1d2b47] text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save Scenario to Portfolio</span>
              </button>
            ) : (
              <div className="p-2 rounded-lg bg-[#0b1220] border border-[#1a253c] text-[11px] text-slate-400 text-center">
                Read-only role: scenario persistence disabled
              </div>
            )}
          </div>

          {(actionError || scenarioError) && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
              {actionError || scenarioError}
            </div>
          )}

          {/* Saved Scenarios Portfolio */}
          <div className="pt-4 border-t border-[#162138] space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                Saved Scenarios ({savedScenarios.length})
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">
                {isLoadingScenarios ? 'Syncing...' : 'PostgreSQL Portfolio'}
              </span>
            </div>

            {savedScenarios.length === 0 ? (
              <div className="p-3 rounded-lg bg-[#0b1220] border border-dashed border-[#1b2740] text-[11px] text-slate-500 text-center">
                No saved scenarios yet. Adjust parameters and save a configuration above.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {savedScenarios.map((sc) => {
                  const isActive = activeScenarioId === sc.id;
                  return (
                    <div
                      key={sc.id}
                      className={`p-3 rounded-lg border transition-all text-xs ${
                        isActive
                          ? 'bg-[#12203b] border-blue-500/50'
                          : 'bg-[#0b1220] border-[#162238] hover:border-[#243456]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate" title={sc.name}>
                            {sc.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {sc.timestamp} · {sc.outlook}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => loadScenario(sc.id)}
                            className="px-2 py-1 rounded bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/30 text-[10px] font-semibold text-blue-300 cursor-pointer"
                          >
                            Load
                          </button>
                          {canDeleteScenarios && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteScenario(sc.id)}
                              aria-label={`Delete ${sc.name}`}
                              className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-[#162238] text-[10px] font-mono text-slate-400">
                        <span>
                          P: {sc.params.priceChange > 0 ? '+' : ''}
                          {sc.params.priceChange}% · M: {sc.params.marketingBudget}Cr · V:{' '}
                          {sc.params.productionVolume > 0 ? '+' : ''}
                          {sc.params.productionVolume}%
                        </span>
                        <span className={sc.kpis.profit < 0 ? 'text-rose-400' : 'text-teal-400'}>
                          Profit: {formatCurrency(sc.kpis.profit)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center / Right Section: Tabs + Projected Profit Chart + KPIs Table (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-5 shadow-sm">
            {/* View Subtabs */}
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#162138]">
              <div className="flex items-center gap-2">
                {(['Comparison View', 'Detailed Results', 'Risk Analysis'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      activeTab === tab
                        ? 'bg-blue-600 text-white shadow-xs font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison View Tab */}
            {activeTab === 'Comparison View' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                {/* Projected Profit Line Chart (7 cols) */}
                <div className="md:col-span-7">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-semibold text-white">
                      Projected Profit Run-Rate
                    </h4>
                  </div>
                  <div className="flex items-center gap-4 text-xs mb-3">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Current Baseline
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          scenarioKPIs.profit < 0 ? 'bg-rose-500' : 'bg-teal-400'
                        }`}
                      />{' '}
                      Simulated Outcome
                    </span>
                  </div>

                  <div className="relative h-48 w-full select-none">
                    <svg className="w-full h-full" viewBox="0 0 340 160">
                      {profitYTicks.map((tick) => {
                        const y = toSvgY(tick);
                        return (
                          <g key={tick}>
                            <line
                              x1="36"
                              y1={y}
                              x2="330"
                              y2={y}
                              stroke={tick === 0 && minYVal < 0 ? '#475569' : '#162238'}
                              strokeDasharray={tick === 0 && minYVal < 0 ? '4 2' : '2 2'}
                            />
                            <text x="30" y={y + 3} fill="#64748b" fontSize="8" textAnchor="end" fontFamily="monospace">
                              {formatCurrency(tick)}
                            </text>
                          </g>
                        );
                      })}

                      {(() => {
                        const step = 280 / (months.length - 1);
                        const baseCoords = baselineProfitCurve.map((val, i) => ({
                          x: 44 + i * step,
                          y: toSvgY(val)
                        }));
                        const propCoords = proposedProfitCurve.map((val, i) => ({
                          x: 44 + i * step,
                          y: toSvgY(val)
                        }));

                        const basePath = createSmoothPath(baseCoords);
                        const propPath = createSmoothPath(propCoords);

                        return (
                          <>
                            <path d={basePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                            <path d={propPath} fill="none" stroke={proposedLineColor} strokeWidth="2.5" strokeLinecap="round" />

                            {baseCoords.map((p, i) => (
                              <circle key={`b-${i}`} cx={p.x} cy={p.y} r="3" fill="#3b82f6" stroke="#0e1628" strokeWidth="1.5" />
                            ))}
                            {propCoords.map((p, i) => (
                              <g key={`p-${i}`}>
                                <circle cx={p.x} cy={p.y} r="3" fill={proposedLineColor} stroke="#0e1628" strokeWidth="1.5" />
                                <text x={p.x} y="152" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">
                                  {months[i]}
                                </text>
                              </g>
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>

                {/* Scenario KPIs Table (5 cols) */}
                <div className="md:col-span-5 bg-[#111c33] border border-[#1d2b47] rounded-xl p-4 font-mono">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1b2740]">
                    <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                      Impact Delta Scorecard
                    </h4>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-3 text-slate-400 font-medium pb-1 border-b border-[#1b2740]/60 text-[11px]">
                      <span className="font-sans">Metric</span>
                      <span className="text-right">Current</span>
                      <span className="text-right">Simulated</span>
                    </div>

                    {[
                      { name: 'Revenue', cur: formatCurrency(baselineKPIs.revenue), prop: formatCurrency(scenarioKPIs.revenue), isHigher: scenarioKPIs.revenue >= baselineKPIs.revenue },
                      { name: 'Net Profit', cur: formatCurrency(baselineKPIs.profit), prop: formatCurrency(scenarioKPIs.profit), isHigher: scenarioKPIs.profit >= baselineKPIs.profit },
                      { name: 'Profit Margin', cur: `${baselineKPIs.profitMargin}%`, prop: `${scenarioKPIs.profitMargin}%`, isHigher: scenarioKPIs.profitMargin >= baselineKPIs.profitMargin },
                      { name: 'Market Share', cur: `${baselineKPIs.marketShare}%`, prop: `${scenarioKPIs.marketShare}%`, isHigher: scenarioKPIs.marketShare >= baselineKPIs.marketShare },
                      { name: 'Capital ROI', cur: `${baselineKPIs.roi}%`, prop: `${scenarioKPIs.roi}%`, isHigher: scenarioKPIs.roi >= baselineKPIs.roi }
                    ].map((row, idx) => (
                      <div key={idx} className="grid grid-cols-3 py-1 items-center">
                        <span className="text-slate-300 font-sans">{row.name}</span>
                        <span className="text-right text-slate-400 tabular-nums">{row.cur}</span>
                        <span
                          className={`text-right font-medium tabular-nums ${
                            row.isHigher ? 'text-teal-400' : 'text-rose-400'
                          }`}
                        >
                          {row.prop}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Detailed Results Tab */}
            {activeTab === 'Detailed Results' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-300">
                  Live parametric model breakdown computed from current sliders ({scenarioParams.priceChange > 0 ? '+' : ''}
                  {scenarioParams.priceChange}% price, ₹{scenarioParams.marketingBudget}Cr marketing,{' '}
                  {scenarioParams.productionVolume > 0 ? '+' : ''}
                  {scenarioParams.productionVolume}% volume, staffing {scenarioParams.staffingLevel}):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47]">
                    <span className="text-slate-400 block mb-1">Price Elasticity &amp; Demand</span>
                    <span className="text-sm font-semibold text-white font-mono">
                      {breakdown.demandResponsePct > 0 ? '+' : ''}
                      {breakdown.demandResponsePct}% Elasticity Shift
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Net Revenue Delta:{' '}
                      <span className={breakdown.revenueDeltaCr >= 0 ? 'text-teal-400 font-mono' : 'text-rose-400 font-mono'}>
                        {breakdown.revenueDeltaCr >= 0 ? '+' : ''}
                        {formatCurrency(breakdown.revenueDeltaCr)}
                      </span>{' '}
                      ({breakdown.effectiveVolumeRatio}x effective vol)
                    </p>
                  </div>
                  <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47]">
                    <span className="text-slate-400 block mb-1">Marketing Demand Lift &amp; ROAS</span>
                    <span className="text-sm font-semibold text-emerald-400 font-mono">
                      {breakdown.marketingLiftPct > 0 ? '+' : ''}
                      {breakdown.marketingLiftPct}% Lift ({breakdown.marketingRoas}x Rev/Mktg)
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Budget Allocation: {formatCurrency(breakdown.marketingSpend)}
                    </p>
                  </div>
                  <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47]">
                    <span className="text-slate-400 block mb-1">Factory Throughput &amp; Cap</span>
                    <span
                      className={`text-sm font-semibold font-mono ${
                        breakdown.isCapacityConstrained ? 'text-amber-400' : 'text-white'
                      }`}
                    >
                      {breakdown.capacityUtilizationPct}% Capacity Utilized
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {breakdown.isCapacityConstrained
                        ? `Constrained: +${breakdown.excessDemandGapPct}% demand capped by supply`
                        : 'Supply capacity absorbs modeled demand without spill'}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-[#111c33] rounded-lg border border-[#1d2b47] grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans block">Variable Prod Cost</span>
                    <span className="text-slate-200 font-semibold">
                      {formatCurrency(breakdown.productionVariableCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans block">
                      Fixed &amp; Staffing ({scenarioParams.staffingLevel})
                    </span>
                    <span className="text-slate-200 font-semibold">
                      {formatCurrency(breakdown.fixedStaffCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans block">Total Modeled Cost</span>
                    <span className="text-amber-300 font-semibold">
                      {formatCurrency(breakdown.totalCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans block">Net Profit Delta</span>
                    <span
                      className={`font-semibold ${
                        breakdown.profitDeltaCr >= 0 ? 'text-teal-400' : 'text-rose-400'
                      }`}
                    >
                      {breakdown.profitDeltaCr >= 0 ? '+' : ''}
                      {formatCurrency(breakdown.profitDeltaCr)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Risk Analysis Tab */}
            {activeTab === 'Risk Analysis' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#111c33] border border-[#1d2b47]">
                  <div>
                    <span className="text-slate-400 block">Composite Scenario Risk Index</span>
                    <span className="text-sm font-bold text-white font-mono">
                      {riskAnalysis.overallRiskScore} / 100 · {riskAnalysis.riskLevel} Exposure
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold border ${
                      riskAnalysis.riskLevel === 'Critical'
                        ? 'text-rose-300 bg-rose-500/15 border-rose-500/30'
                        : riskAnalysis.riskLevel === 'Elevated'
                          ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                          : riskAnalysis.riskLevel === 'Moderate'
                            ? 'text-blue-300 bg-blue-500/15 border-blue-500/30'
                            : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
                    }`}
                  >
                    {riskAnalysis.riskLevel}
                  </span>
                </div>

                <div className="space-y-2">
                  {riskAnalysis.riskDrivers.map((driver, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg bg-[#111c33] border flex items-start gap-2.5 ${
                        driver.severity === 'High'
                          ? 'border-rose-500/35'
                          : driver.severity === 'Medium'
                            ? 'border-amber-500/30'
                            : 'border-emerald-500/25'
                      }`}
                    >
                      <AlertTriangle
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          driver.severity === 'High'
                            ? 'text-rose-400'
                            : driver.severity === 'Medium'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{driver.title}</span>
                          <span className="font-mono text-[10px] text-slate-300">{driver.metric}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5">{driver.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border border-[#1d2b47] rounded-lg overflow-hidden bg-[#111c33]">
                  <div className="px-3 py-2 bg-[#0b1220] border-b border-[#1d2b47] font-semibold text-slate-300 text-[11px]">
                    Deterministic Sensitivity Stress Tests (Calculated from Current Sliders)
                  </div>
                  <div className="divide-y divide-[#162238]">
                    {riskAnalysis.stressTests.map((st) => (
                      <div key={st.name} className="px-3 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{st.name}</div>
                          <div className="text-[10px] text-slate-400">{st.description}</div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <div className={st.projectedKPIs.profit < 0 ? 'text-rose-400 font-semibold' : 'text-white font-semibold'}>
                            Profit: {formatCurrency(st.projectedKPIs.profit)}
                          </div>
                          <div className={`text-[10px] ${st.profitDeltaFromCurrent < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {st.profitDeltaFromCurrent >= 0 ? '+' : ''}
                            {formatCurrency(st.profitDeltaFromCurrent)} vs current
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Row: AI Scenario Analysis (left) + Key Risks (right) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-7 bg-[#0e1628] border border-[#1b2740] rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Synthesis & Outlook
                </h4>
                <span
                  className={`ml-auto text-[10px] px-2 py-0.5 rounded font-semibold border font-mono ${
                    scenarioKPIs.profit < 0
                      ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                      : scenarioKPIs.profit > baselineKPIs.profit
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  }`}
                >
                  {scenarioKPIs.profit < 0
                    ? 'Net Loss Warning'
                    : scenarioKPIs.profit > baselineKPIs.profit
                      ? 'Positive Outlook'
                      : 'Neutral / Caution'}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                The simulated parameter combination projects a{' '}
                <span
                  className={`font-semibold font-mono ${
                    scenarioKPIs.profit < 0 ? 'text-rose-400' : 'text-teal-400'
                  }`}
                >
                  {profitGrowthPercent >= 0 ? `+${profitGrowthPercent.toFixed(1)}%` : `${profitGrowthPercent.toFixed(1)}%`}
                </span>{' '}
                {scenarioKPIs.profit < 0
                  ? `contraction in annual net EBITDA, resulting in a projected net loss of ${formatCurrency(scenarioKPIs.profit)}. Rebalance pricing or reduce fixed/marketing overhead before execution.`
                  : scenarioKPIs.profit >= baselineKPIs.profit
                    ? 'surge in annual net EBITDA with moderate risk. Expanding marketing budget cushions the minor volume contraction from premium pricing.'
                    : 'shift in annual net EBITDA relative to baseline. Review price-volume elasticity and marketing ROI before deployment.'}
              </p>
            </div>

            <div className="md:col-span-5 bg-[#0e1628] border border-[#1b2740] rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Residual Risks
                  </h4>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-semibold border font-mono ${
                    riskAnalysis.riskLevel === 'Critical'
                      ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                      : riskAnalysis.riskLevel === 'Elevated' || riskAnalysis.riskLevel === 'Moderate'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  }`}
                >
                  {riskAnalysis.riskLevel} ({riskAnalysis.overallRiskScore}%)
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {riskAnalysis.riskDrivers.slice(0, 3).map((driver, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span
                      className={
                        driver.severity === 'High'
                          ? 'text-rose-400'
                          : driver.severity === 'Medium'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }
                    >
                      •
                    </span>
                    <span>
                      <strong className="text-slate-100">{driver.title}:</strong> {driver.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Save Scenario Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-2">Save Scenario to Portfolio</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter a name for this scenario configuration to bookmark it for executive comparison.
            </p>
            <form onSubmit={handleSave} className="space-y-4">
              <input
                type="text"
                required
                placeholder="e.g. Q4 Aggressive Growth Case"
                value={scenarioNameInput}
                onChange={(e) => setScenarioNameInput(e.target.value)}
                className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingScenario}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold shadow-xs"
                >
                  {isSavingScenario ? 'Saving...' : 'Save to Portfolio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSavedToast && (
        <div className="fixed bottom-6 right-6 bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-xs px-4 py-3 rounded-lg shadow-xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Scenario successfully saved to executive portfolio!</span>
        </div>
      )}
    </div>
  );
};
