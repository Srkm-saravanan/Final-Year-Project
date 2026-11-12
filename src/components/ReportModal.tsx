import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  Presentation,
  CheckCircle2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Mic,
  AlertCircle
} from 'lucide-react';
import {
  useAppUI,
  useAuth,
  useDataFabric,
  useGovernance,
  useRecommendations,
  useSimulation
} from '../context/CortexContext';
import { SlideItem } from '../types/cortex';
import { computeDossierChecksum } from '../utils/crypto';
import { deriveScopedOverviewData } from '../utils/overviewFilters';

const presentationMarkdownGlob = import.meta.glob<string>('/UG_PROJECT_FIRST_REVIEW_PRESENTATION.md', {
  query: '?raw',
  import: 'default',
  eager: true
});
const presentationMarkdownContent =
  presentationMarkdownGlob['/UG_PROJECT_FIRST_REVIEW_PRESENTATION.md'] ?? '';

export const ReportModal: React.FC = () => {
  const {
    isReportModalOpen,
    setIsReportModalOpen,
    fiscalPeriod,
    selectedDepartment,
    currency,
    formatCurrency
  } = useAppUI();
  const {
    metrics: rawMetrics,
    insights,
    topOpportunities,
    keyRisks,
    recentRecommendations,
    salesRecords,
    dataSources,
    trends,
    slides
  } = useDataFabric();
  const { recommendations } = useRecommendations();
  const { scenarioKPIs, baselineKPIs, scenarioParams } = useSimulation();
  const { auditLogs, auditChainChecksum, systemSettings } = useGovernance();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'executive' | 'slides'>('slides');
  const [currentSlideId, setCurrentSlideId] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [dossierChecksum, setDossierChecksum] = useState<string>('');

  const scopedOverview = useMemo(
    () =>
      deriveScopedOverviewData({
        selectedDepartment,
        fiscalPeriod,
        trendGranularity: 'Monthly',
        metrics: rawMetrics,
        trends,
        salesRecords,
        dataSources,
        insights,
        topOpportunities,
        keyRisks,
        recentRecommendations,
        recommendations
      }),
    [
      selectedDepartment,
      fiscalPeriod,
      rawMetrics,
      trends,
      salesRecords,
      dataSources,
      insights,
      topOpportunities,
      keyRisks,
      recentRecommendations,
      recommendations
    ]
  );

  const metrics = scopedOverview.kpis;
  const totalSalesInr = useMemo(
    () => salesRecords.reduce((sum, rec) => sum + rec.revenue, 0),
    [salesRecords]
  );
  const totalSalesUnits = useMemo(
    () => salesRecords.reduce((sum, rec) => sum + rec.quantity, 0),
    [salesRecords]
  );
  const connectedSourcesCount = useMemo(
    () => dataSources.filter((ds) => ds.status.startsWith('Connected')).length,
    [dataSources]
  );

  const approvalSummary = useMemo(() => {
    const approved = recommendations.filter((r) => r.status === 'Approved').length;
    const rejected = recommendations.filter((r) => r.status === 'Rejected').length;
    const inProgress = recommendations.filter((r) => r.status === 'In Progress').length;
    const pending = recommendations.length - approved - rejected - inProgress;
    return { approved, rejected, inProgress, pending };
  }, [recommendations]);

  const dossierPayload = useMemo(
    () => ({
      fiscalPeriod,
      selectedDepartment,
      currency,
      metrics: metrics.map((m) => ({
        id: m.id,
        label: m.label,
        numericValue: m.numericValue,
        value: m.value
      })),
      dataSourcesCount: dataSources.length,
      salesRecordCount: salesRecords.length,
      totalSalesInr,
      scenarioParams,
      scenarioKPIs,
      recommendations: recommendations.map((r) => ({
        id: r.id,
        status: r.status,
        confidence: r.confidence
      })),
      systemSettings,
      auditLogsCount: auditLogs.length,
      auditChainChecksum
    }),
    [
      fiscalPeriod,
      selectedDepartment,
      currency,
      metrics,
      dataSources.length,
      salesRecords.length,
      totalSalesInr,
      scenarioParams,
      scenarioKPIs,
      recommendations,
      systemSettings,
      auditLogs.length,
      auditChainChecksum
    ]
  );

  useEffect(() => {
    if (!isReportModalOpen) return;
    let cancelled = false;
    computeDossierChecksum(dossierPayload).then((hex) => {
      if (!cancelled) {
        setDossierChecksum(hex);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isReportModalOpen, dossierPayload]);

  if (!isReportModalOpen) return null;

  const currentSlide: SlideItem | undefined =
    slides.find((s) => s.id === currentSlideId) || slides[0];

  const handlePrint = () => {
    window.print();
  };

  const handleCopySlide = (slide: SlideItem) => {
    const textToCopy = `SLIDE ${slide.id}: ${slide.title}\n${slide.subtitle}\n\nSLIDE BULLETS:\n${slide.content.map((c) => `• ${c}`).join('\n')}\n\nSPEAKER NOTES (HOW TO EXPLAIN):\n${slide.speakerScript}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(slide.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadMarkdown = () => {
    const element = document.createElement('a');
    let objectUrl: string | null = null;
    if (presentationMarkdownContent) {
      const blob = new Blob([presentationMarkdownContent], { type: 'text/markdown;charset=utf-8' });
      objectUrl = URL.createObjectURL(blob);
      element.setAttribute('href', objectUrl);
    } else {
      element.setAttribute('href', `${import.meta.env.BASE_URL}UG_PROJECT_FIRST_REVIEW_PRESENTATION.md`);
    }
    element.setAttribute('download', 'UG_PROJECT_FIRST_REVIEW_PRESENTATION.md');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#0c1322] border border-[#1e2e4a] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Top Header Bar */}
        <div className="p-4 bg-[#090f1d] border-b border-[#1a263e] flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 p-1 bg-[#111a2e] rounded-xl border border-[#1d2b48]">
              <button
                onClick={() => setActiveTab('slides')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'slides'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-[#15223a]'
                }`}
              >
                <Presentation className="w-4 h-4" />
                <span>UG Project PPT ({slides.length} Slides)</span>
                <span className="text-[10px] bg-blue-950 text-blue-200 px-1.5 py-0.5 rounded border border-blue-700/50">
                  Review 1
                </span>
              </button>

              <button
                onClick={() => setActiveTab('executive')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'executive'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-[#15223a]'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Executive Dossier</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#142036] hover:bg-[#1a2a46] border border-[#213354] text-slate-200 hover:text-white text-xs font-medium cursor-pointer transition-colors"
              title="Download full UG_PROJECT_FIRST_REVIEW_PRESENTATION.md file"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Download .MD</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={() => setIsReportModalOpen(false)}
              className="p-1.5 rounded-lg bg-[#142036] hover:bg-[#1a2a46] text-slate-400 hover:text-white cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: 16-Slide PPT Reviewer */}
        {activeTab === 'slides' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#0a101f]">
            {slides.length === 0 ? (
              <div className="flex-1 p-12 text-center flex flex-col items-center justify-center space-y-4">
                <AlertCircle className="w-12 h-12 text-amber-400/80" />
                <h3 className="text-lg font-bold text-white">No Slide Data Available</h3>
                <p className="text-sm text-slate-400 max-w-md">
                  Dummy slide data has been completely removed because <code className="text-amber-300 font-mono">mock-data.json</code> was deleted from the project directory.
                </p>
                <div className="p-3 bg-[#11192e] rounded-xl border border-[#1f2d48] text-xs text-slate-400 font-mono">
                  Restore mock-data.json in root to re-populate slides.
                </div>
              </div>
            ) : (
              <>
                {/* Left Sidebar: Slides List */}
                <div className="w-full md:w-72 border-r border-[#17243c] bg-[#080d19] overflow-y-auto max-h-[35vh] md:max-h-[82vh] p-3 space-y-1.5 shrink-0 print:hidden">
                  <div className="px-2 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center justify-between">
                    <span>16 Slides (First Review)</span>
                    <span className="text-blue-400">Phase 1</span>
                  </div>
                  {slides.map((slide) => {
                    const isActive = slide.id === currentSlideId;
                    return (
                      <button
                        key={slide.id}
                        onClick={() => setCurrentSlideId(slide.id)}
                        className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-2.5 cursor-pointer ${
                          isActive
                            ? 'bg-blue-600/20 text-blue-200 border border-blue-500/40 shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#10192e] border border-transparent'
                        }`}
                      >
                        <span
                          className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#121c32] text-slate-400 border border-[#1b2b48]'
                          }`}
                        >
                          {String(slide.id).padStart(2, '0')}
                        </span>
                        <div className="truncate">
                          <div className="font-semibold truncate">{slide.title}</div>
                          <div className="text-[10px] text-slate-500 truncate">{slide.category}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Right Main Content: Active Slide Display */}
                {currentSlide && (
                  <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-h-[75vh] md:max-h-[82vh] bg-[#0c1322]">
                    {/* Slide Navigation Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1b2a44]">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-base font-extrabold text-blue-400 bg-blue-950/80 px-3 py-1 rounded-xl border border-blue-800/50">
                          SLIDE {String(currentSlide.id).padStart(2, '0')} / {slides.length}
                        </span>
                        <div>
                          <h2 className="text-xl font-bold text-white tracking-tight">{currentSlide.title}</h2>
                          <p className="text-xs text-slate-400">{currentSlide.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopySlide(currentSlide)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#142036] hover:bg-[#1a2a46] border border-[#223554] text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
                          title="Copy full slide content and notes to clipboard"
                        >
                          {copiedId === currentSlide.id ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy Slide</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCurrentSlideId((prev) => Math.max(1, prev - 1))}
                            disabled={currentSlideId === 1}
                            className="p-1.5 rounded-lg bg-[#142036] hover:bg-[#1a2a46] disabled:opacity-40 text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                            title="Previous Slide"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-mono text-slate-400 px-1">
                            {currentSlideId}/{slides.length}
                          </span>
                          <button
                            onClick={() => setCurrentSlideId((prev) => Math.min(slides.length, prev + 1))}
                            disabled={currentSlideId === slides.length}
                            className="p-1.5 rounded-lg bg-[#142036] hover:bg-[#1a2a46] disabled:opacity-40 text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                            title="Next Slide"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Section A: Slide Bullets / On-Screen Verbatim Content */}
                    <div className="p-5 rounded-2xl bg-[#0f172a] border border-[#1d2a44] space-y-3 shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider font-mono flex items-center gap-2">
                          <Presentation className="w-4 h-4" />
                          On-Screen Slide Bullets (Put this verbatim on slide)
                        </span>
                        <span className="text-[11px] text-slate-400 italic">
                          Layout Tip: {currentSlide.layoutTip}
                        </span>
                      </div>

                      <ul className="space-y-2 pt-1">
                        {currentSlide.content.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-200 leading-relaxed">
                            <span className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Optional Table Presentation for Literature / Comparison */}
                      {currentSlide.tableData && (
                        <div className="mt-4 overflow-x-auto rounded-xl border border-[#1e2f4e]">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-[#15233e] text-blue-300 uppercase font-mono">
                              <tr>
                                {currentSlide.tableData.headers.map((h, i) => (
                                  <th key={i} className="p-2.5 font-bold border-b border-[#213556]">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#18263f]">
                              {currentSlide.tableData.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-[#121c32]">
                                  {row.map((cell, j) => (
                                    <td key={j} className="p-2.5 text-slate-300">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Optional ASCII Diagram for Architecture */}
                      {currentSlide.asciiDiagram && (
                        <div className="mt-4 p-4 rounded-xl bg-[#060a12] border border-[#1b2b46] font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre leading-snug">
                          {currentSlide.asciiDiagram}
                        </div>
                      )}
                    </div>

                    {/* Section B: Speaker Script / Oral Explanation */}
                    <div className="p-5 rounded-2xl bg-[#0b1426] border border-[#1b2c4c] space-y-3 shadow-md">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                        <Mic className="w-4 h-4 text-emerald-400" />
                        Speaker Script / What to Explain to Review Committee
                      </div>
                      <div className="p-4 rounded-xl bg-[#070d1a] border border-[#16243f] text-sm text-slate-300 leading-relaxed italic">
                        "{currentSlide.speakerScript}"
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Existing Executive Dossier */}
        {activeTab === 'executive' && (
          <div className="p-8 md:p-10 space-y-8 bg-[#0c1322] text-slate-200 overflow-y-auto max-h-[80vh]">
            {/* Header Block */}
            <div className="border-b border-[#1b2a44] pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl font-bold tracking-tight text-white">CORTEX</span>
                  <span className="text-[11px] font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/40">
                    CONFIDENTIAL EXECUTIVE BRIEF
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Quarterly Decision Intelligence Briefing
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Prepared by CORTEX Multi-Agent Autonomous Decision Engine for Executive Leadership
                </p>
              </div>
              <div className="text-left md:text-right text-xs space-y-1 text-slate-400 font-mono">
                <div>Period: <span className="text-white font-semibold">{fiscalPeriod}</span></div>
                <div>Classification: <span className="text-amber-400 font-medium">RESTRICTED - C-SUITE</span></div>
              </div>
            </div>

            {/* Section 1: Executive Summary */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider font-mono">
                01. Executive Health Scorecard
              </h2>
              {metrics.length === 0 ? (
                <div className="p-6 rounded-lg bg-[#10192e] border border-[#1b2842] text-center text-xs text-slate-400">
                  No scorecard metrics available. mock-data.json has been removed.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {metrics.map((m) => {
                    const displayVal = m.unit === 'currency' ? formatCurrency(m.numericValue) : m.value;
                    return (
                      <div
                        key={m.id}
                        className="p-4 rounded-lg bg-[#10192e] border border-[#1b2842]"
                      >
                        <div className="text-[11px] text-slate-400 font-medium">{m.label}</div>
                        <div className="text-xl font-bold text-white mt-1 tabular-nums">
                          {displayVal}
                        </div>
                        <div className="text-[11px] font-semibold text-emerald-400 mt-1">
                          {m.change}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 2: Dynamic Operational & Simulation Synthesis */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider font-mono">
                02. Multi-Source &amp; Scenario Modeling Synthesis
              </h2>
              <div className="p-4 rounded-lg bg-[#10192e] border border-[#1b2842] space-y-3 text-xs leading-relaxed text-slate-300">
                <p>
                  Active dossier scope: <strong className="text-white">{selectedDepartment}</strong> ·{' '}
                  <strong className="text-white">{fiscalPeriod}</strong> ({currency}). Across{' '}
                  <strong className="text-blue-300">{connectedSourcesCount} connected enterprise sources</strong>{' '}
                  and <strong className="text-blue-300">{salesRecords.length} logged sales batches</strong>{' '}
                  ({formatCurrency(totalSalesInr / 1e7)} / {totalSalesUnits.toLocaleString('en-US')} units),{' '}
                  {scopedOverview.dataBasisNote}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded bg-[#0b1220] border border-[#17243c]">
                    <span className="text-[11px] font-semibold text-emerald-400">
                      Active Simulation Configuration:
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Price {scenarioParams.priceChange > 0 ? '+' : ''}
                      {scenarioParams.priceChange}%, Marketing ₹{scenarioParams.marketingBudget}Cr,
                      Production {scenarioParams.productionVolume > 0 ? '+' : ''}
                      {scenarioParams.productionVolume}% ({scenarioParams.staffingLevel} staff)
                      yields{' '}
                      <strong className="text-slate-200 font-mono">
                        {formatCurrency(scenarioKPIs.revenue)}
                      </strong>{' '}
                      revenue and{' '}
                      <strong
                        className={`font-mono ${
                          scenarioKPIs.profit < 0 ? 'text-rose-400' : 'text-teal-300'
                        }`}
                      >
                        {formatCurrency(scenarioKPIs.profit)}
                      </strong>{' '}
                      net profit ({scenarioKPIs.profitMargin}% margin vs {baselineKPIs.profitMargin}%
                      baseline).
                    </p>
                  </div>
                  <div className="p-3 rounded bg-[#0b1220] border border-[#17243c]">
                    <span className="text-[11px] font-semibold text-sky-400">
                      Governance &amp; Telemetry Posture:
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {scopedOverview.insights.length} insight(s) and {scopedOverview.keyRisks.length}{' '}
                      risk(s) active in view. Model failover routing is{' '}
                      <strong className="text-slate-200">
                        {systemSettings.automatedModelFailover ? 'Armed' : 'Standby'}
                      </strong>
                      ; audit archival is{' '}
                      <strong className="text-slate-200">
                        {systemSettings.auditTrailArchival ? 'Recording' : 'Paused'}
                      </strong>{' '}
                      across {auditLogs.length} session audit records.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Recommended Interventions */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-blue-400 uppercase tracking-wider font-mono">
                  03. Strategic Decisions Register ({recommendations.length})
                </h2>
                <span className="text-[11px] font-mono text-slate-400">
                  {approvalSummary.approved} Approved · {approvalSummary.rejected} Rejected ·{' '}
                  {approvalSummary.inProgress} In Progress · {approvalSummary.pending} Pending
                </span>
              </div>
              <div className="space-y-2">
                {recommendations.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#10192e] border border-[#1b2842] text-xs text-slate-400 text-center">
                    No strategic recommendations loaded.
                  </div>
                ) : (
                  recommendations.map((r, i) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-lg bg-[#10192e] border border-[#1b2842] flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-white">
                            {i + 1}. {r.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                              r.status === 'Approved'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : r.status === 'Rejected'
                                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : r.status === 'In Progress'
                                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                    : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{r.rationale}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-emerald-400 font-bold font-mono">
                          {r.expectedImpact}
                        </span>
                        <div className="text-[10px] text-slate-400">Confidence: {r.confidence}%</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Footer Sign-off */}
            <div className="border-t border-[#1b2a44] pt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
              <div>
                <div className="font-semibold text-slate-300 mb-1">
                  Cryptographic Dossier Verification (Web Crypto SHA-256)
                </div>
                <div
                  data-testid="dossier-sha256"
                  className="font-mono text-[10px] text-teal-300 break-all bg-[#0a101d] p-2 rounded border border-[#162138]"
                >
                  {dossierChecksum ? `SHA256: ${dossierChecksum}` : 'Computing SHA-256 digest...'}
                </div>
                <div className="font-mono text-[10px] text-slate-500 mt-1.5 break-all">
                  Audit Chain Head ({auditLogs.length} receipts):{' '}
                  {auditChainChecksum ? `SHA256:${auditChainChecksum.slice(0, 24)}...` : 'pending'}
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <div className="border-b border-dashed border-slate-700 pb-2 mb-2 flex justify-between items-end">
                  <span className="text-[11px]">Scope &amp; State Basis:</span>
                  <span className="font-mono text-slate-300 font-semibold">
                    {selectedDepartment} · {fiscalPeriod}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 text-right">
                  CORTEX PostgreSQL Decision Dossier · Prepared for {user?.name ?? 'Authorized User'} ({user?.role ?? 'Viewer'})
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
