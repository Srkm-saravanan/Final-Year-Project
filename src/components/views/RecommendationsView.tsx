import React, { useEffect, useState } from 'react';
import {
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  X,
  Inbox
} from 'lucide-react';
import { useAppUI, useAuth, useRecommendations } from '../../context/CortexContext';
import { RecommendationItem } from '../../types/cortex';
import { computeSha256Hex } from '../../utils/crypto';

export const RecommendationsView: React.FC = () => {
  const { setIsReportModalOpen } = useAppUI();
  const { hasPermission } = useAuth();
  const {
    recommendations,
    selectedRecommendation,
    setSelectedRecommendation,
    updateRecommendationStatus,
    isUpdatingRecommendationId,
    recommendationError
  } = useRecommendations();
  const canUpdateStatus = hasPermission('recommendations:update_status');

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [fullAnalysisModalOpen, setFullAnalysisModalOpen] = useState<boolean>(false);
  const [recDigest, setRecDigest] = useState<string>('');

  const categories = [
    { label: 'All', count: recommendations.length },
    { label: 'Strategic', count: recommendations.filter((r) => r.category === 'Strategic').length },
    { label: 'Operational', count: recommendations.filter((r) => r.category === 'Operational').length },
    { label: 'Financial', count: recommendations.filter((r) => r.category === 'Financial').length },
    { label: 'Marketing', count: recommendations.filter((r) => r.category === 'Marketing').length }
  ];

  const filtered = recommendations.filter((r) => {
    if (activeCategory === 'All') return true;
    return r.category === activeCategory;
  });

  const activeRec: RecommendationItem | undefined =
    selectedRecommendation || filtered[0] || recommendations[0] || undefined;

  useEffect(() => {
    let cancelled = false;
    if (!activeRec) {
      setRecDigest('');
      return;
    }
    computeSha256Hex(activeRec).then((hex) => {
      if (!cancelled) {
        setRecDigest(hex);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeRec]);

  const getPriorityBadge = (p: RecommendationItem['priority']) => {
    if (p === 'High') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          HIGH
        </span>
      );
    }
    if (p === 'Medium') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          MED
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        LOW
      </span>
    );
  };

  const getStatusBadge = (status: RecommendationItem['status']) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'In Progress':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1 w-fit">
            <Clock className="w-3 h-3" />
            In Progress
          </span>
        );
      case 'Completed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30 w-fit">
            Completed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30 w-fit">
            New
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto p-6 md:p-8 xl:p-10 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#162138]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Strategic Decision Recommendations
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Prioritized interventions synthesized by multi-agent consensus with verifiable causal evidence
          </p>
        </div>

        <button
          onClick={() => setIsReportModalOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/30 transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>Generate Board Briefing</span>
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.label;
          return (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(cat.label)}
              className={`px-4 py-2 rounded-xl text-xs xl:text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md font-bold'
                  : 'bg-[#111c33] text-slate-300 hover:text-white border border-[#1b2740]'
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          );
        })}
      </div>

      {/* Main Grid: Table (Left 7 cols) + Details (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recommendation Table (7 cols) */}
        <div className="lg:col-span-7 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="overflow-x-auto rounded-xl border border-[#162138]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#111c33] border-b border-[#162138] text-slate-400 font-mono text-xs uppercase tracking-wider">
                  <th className="py-3 px-3.5">Priority</th>
                  <th className="py-3 px-3.5">Recommendation</th>
                  <th className="py-3 px-3.5">Projected Upside</th>
                  <th className="py-3 px-3.5">Confidence</th>
                  <th className="py-3 px-3.5">Domain</th>
                  <th className="py-3 px-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#162138]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      No recommendations found. Dummy items cleared with mock-data.json.
                    </td>
                  </tr>
                ) : (
                  filtered.map((rec) => {
                    const isSelected = activeRec?.id === rec.id;
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => setSelectedRecommendation(rec)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-900/30 border-l-4 border-blue-500' : 'hover:bg-[#111c33]/50'
                        }`}
                      >
                        <td className="py-3.5 px-3.5">{getPriorityBadge(rec.priority)}</td>
                        <td className="py-3.5 px-3.5 font-semibold text-white max-w-[220px] truncate">
                          {rec.title}
                        </td>
                        <td className="py-3.5 px-3.5 text-blue-300 font-semibold font-mono text-xs xl:text-sm">
                          {rec.expectedImpact}
                        </td>
                        <td className="py-3.5 px-3.5 text-slate-300 tabular-nums font-mono">{rec.confidence}%</td>
                        <td className="py-3.5 px-3.5 text-slate-400 text-xs xl:text-sm">{rec.category}</td>
                        <td className="py-3.5 px-3.5 text-right">{getStatusBadge(rec.status)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-3.5 text-xs text-slate-400 flex items-center justify-between font-mono">
            <span>Select any row to view verified evidence and rationale</span>
            <span>Ranked by multi-agent impact scoring</span>
          </div>
        </div>

        {/* Recommendation Details Panel (5 cols) */}
        <div className="lg:col-span-5 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          {!activeRec ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-500 space-y-2">
              <Inbox className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">No Recommendation Selected</p>
              <p className="max-w-xs">
                All recommendations were removed when mock-data.json was deleted.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#162138]">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Recommendation Dossier
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">REF: {activeRec.id}</span>
                </div>

                {/* Title & Priority Badge */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="text-base font-bold text-white tracking-tight">{activeRec.title}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {getPriorityBadge(activeRec.priority)}
                    <span className="text-xs text-slate-400 font-mono">· {activeRec.category} Strategy Domain</span>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-3 gap-2.5 py-1 font-mono">
                  <div className="p-3 rounded-lg bg-[#111c33] border border-[#1d2b47]">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium font-sans">Impact</span>
                    <span className="text-xs font-bold text-blue-400 tabular-nums mt-0.5 block">
                      {activeRec.expectedImpact}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#111c33] border border-[#1d2b47]">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium font-sans">Certainty</span>
                    <span className="text-xs font-bold text-emerald-400 tabular-nums mt-0.5 block">
                      {activeRec.confidence}%
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#111c33] border border-[#1d2b47]">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium font-sans">Horizon</span>
                    <span className="text-xs font-semibold text-slate-200 mt-0.5 block">{activeRec.timeHorizon}</span>
                  </div>
                </div>

                {/* Key Evidence */}
                <div>
                  <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono text-[11px]">
                    Ground Truth Evidence
                  </h5>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {Array.isArray(activeRec.evidence) &&
                      activeRec.evidence.map((ev, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                          <span>{ev}</span>
                        </li>
                      ))}
                  </ul>
                </div>

                {/* Rationale Excerpt */}
                <div className="p-3 rounded-lg bg-[#111c33] border border-[#1d2b47]">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-medium font-mono">
                    Executive Rationale
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">{activeRec.rationale}</p>
                </div>
              </div>

              {/* Action Buttons */}
              {recommendationError && (
                <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {recommendationError}
                </div>
              )}
              <div className="pt-4 border-t border-[#162138] flex items-center gap-3">
                <button
                  onClick={() => setFullAnalysisModalOpen(true)}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#111c33] hover:bg-[#162340] border border-[#1d2b47] text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
                >
                  Intelligence Audit
                </button>

                {canUpdateStatus ? (
                  <>
                    <button
                      disabled={isUpdatingRecommendationId === activeRec.id}
                      onClick={() => {
                        void updateRecommendationStatus(
                          activeRec.id,
                          activeRec.status === 'Rejected' ? 'In Progress' : 'Rejected'
                        ).catch(() => {});
                      }}
                      className={`py-2 px-4 rounded-lg text-xs font-semibold transition-all cursor-pointer border disabled:opacity-60 ${
                        activeRec.status === 'Rejected'
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                          : 'bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {activeRec.status === 'Rejected' ? 'Reopen Decision' : 'Reject Decision'}
                    </button>

                    <button
                      disabled={isUpdatingRecommendationId === activeRec.id}
                      onClick={() => {
                        void updateRecommendationStatus(
                          activeRec.id,
                          activeRec.status === 'Approved' ? 'In Progress' : 'Approved'
                        ).catch(() => {});
                      }}
                      className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                    >
                      {activeRec.status === 'Approved' ? 'Mark In Progress' : 'Approve Decision'}
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] font-mono text-slate-400 px-3 py-1.5 rounded-lg bg-[#111c33] border border-[#1d2b47]">
                    Approval restricted to Executive/Admin
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Intelligence Audit Detail Modal */}
      {fullAnalysisModalOpen && activeRec && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#162138]">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Full Intelligence Audit Dossier</h3>
              </div>
              <button
                onClick={() => setFullAnalysisModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 max-h-96 overflow-y-auto pr-1">
              <div>
                <span className="font-semibold text-white block mb-0.5">Proposed Strategic Action:</span>
                <p className="text-slate-300">{activeRec.title}</p>
              </div>

              <div>
                <span className="font-semibold text-white block mb-0.5">Multi-Agent Dialectic Synthesis:</span>
                <p className="leading-relaxed text-slate-300">{activeRec.rationale}</p>
              </div>

              <div>
                <span className="font-semibold text-amber-400 block mb-0.5">Identified Downside Risks:</span>
                <p className="text-amber-200/90 leading-relaxed">{activeRec.risks}</p>
              </div>

              <div className="p-3 bg-[#111c33] rounded-xl border border-[#1d2b47] font-mono text-[11px] text-slate-400 break-all">
                Web Crypto SHA-256 Digest:{' '}
                <span className="text-teal-300">
                  {recDigest ? `SHA256:${recDigest}` : 'Computing SHA-256...'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#162138] flex justify-end">
              <button
                onClick={() => setFullAnalysisModalOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
