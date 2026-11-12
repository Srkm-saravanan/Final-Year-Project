import React, { useState } from 'react';
import {
  Send,
  Bot,
  Sparkles,
  FileText,
  Plus,
  Loader2,
  CheckCircle2,
  BadgePercent,
  Boxes,
  TrendingUp,
  ShieldAlert,
  Briefcase
} from 'lucide-react';
import { useIntelligence } from '../../context/CortexContext';
import { AgentInfo } from '../../types/cortex';

export const AIWorkspace: React.FC = () => {
  const {
    chatSessions,
    activeChatId,
    setActiveChatId,
    createNewChat,
    sendMessage,
    isAgentsAnalyzing,
    agents
  } = useIntelligence();

  const [inputQuery, setInputQuery] = useState('');
  const [selectedSourceDoc, setSelectedSourceDoc] = useState<string | null>(null);

  const activeSession = chatSessions.find((s) => s.id === activeChatId) || chatSessions[0] || undefined;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isAgentsAnalyzing) return;
    sendMessage(inputQuery);
    setInputQuery('');
  };

  const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    BadgePercent,
    Boxes,
    TrendingUp,
    ShieldAlert,
    Briefcase
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 xl:p-10 min-h-[calc(100vh-5rem)] flex flex-col">
      {/* Subtitle */}
      <div className="mb-5 pb-3 border-b border-[#162138]">
        <h2 className="text-xl font-bold text-white tracking-tight">AI Intelligence Workspace</h2>
        <p className="text-sm text-slate-400 mt-1">
          Ask strategic business questions, review verified causal evidence, and collaborate with 5 specialized CORTEX AI agents
        </p>
      </div>

      {/* 3-Column Layout: Left (Chat History), Center (Conversation), Right (Agents & Evidence) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Column: New Chat & Chat History (3 cols) */}
        <div className="lg:col-span-3 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-5 shadow-sm flex flex-col h-full">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-md shadow-blue-900/30 transition-all mb-5 cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>New Investigation</span>
          </button>

          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#162138]">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Investigation History
            </h3>
            <span className="text-xs text-slate-400 font-mono">{chatSessions.length} sessions</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {chatSessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-[#0a101d] rounded-xl">
                No past sessions. Click New Investigation above.
              </div>
            ) : (
              chatSessions.map((session) => {
                const isActive = session.id === activeChatId;
                return (
                  <button
                    key={session.id}
                    onClick={() => setActiveChatId(session.id)}
                    className={`w-full text-left p-3.5 rounded-xl text-xs transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#142038] text-white border border-[#203254] font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#111a2f]'
                    }`}
                  >
                    <div className="truncate font-medium">{session.title}</div>
                    <div className="text-[11px] text-slate-500 mt-1 font-mono">{session.date}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Middle Column: Chat Conversation Stream & Prompt Input (6 cols) */}
        <div className="lg:col-span-6 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm flex flex-col justify-between h-[650px]">
          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-2 mb-4">
            {!activeSession || !activeSession.messages || activeSession.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-xs text-slate-500">
                <Bot className="w-10 h-10 text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-300">Ready for Strategic Inquiry</p>
                <p className="mt-1 max-w-sm">
                  Type your business question below to orchestrate the multi-agent decision consensus.
                </p>
              </div>
            ) : (
              activeSession.messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div key={msg.id} className="space-y-3">
                    {isUser ? (
                      <div className="flex justify-end">
                        <div className="max-w-xl bg-blue-600 text-white p-4 rounded-2xl rounded-tr-xs shadow-md text-sm md:text-base">
                          <p className="leading-relaxed font-medium">{msg.content}</p>
                          <span className="block text-xs text-blue-300/80 text-right mt-2 font-mono">
                            {msg.timestamp}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-900/30">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="flex-1 bg-[#111c33] border border-[#1d2b47] rounded-2xl rounded-tl-xs p-5 text-sm md:text-base text-slate-100 space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-[#182540]">
                            <span className="font-bold text-white flex items-center gap-2">
                              <Bot className="w-4 h-4 text-blue-400" /> CORTEX Multi-Agent Synthesis
                            </span>
                            <span className="text-xs text-slate-400 font-mono">{msg.timestamp}</span>
                          </div>

                          <div className="whitespace-pre-line leading-relaxed text-slate-200 text-sm md:text-base">
                            {msg.content}
                          </div>

                          {/* Domain Agent Findings Expandable / Breakdown */}
                          {msg.agentBreakdowns && msg.agentBreakdowns.length > 0 && (
                            <div className="mt-4 pt-3.5 border-t border-[#182540] space-y-2.5">
                              <span className="text-xs font-bold tracking-wider text-blue-400 uppercase">
                                Collaborating Domain Findings:
                              </span>
                              <div className="grid grid-cols-1 gap-2">
                                {msg.agentBreakdowns.map((ab, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-xl bg-[#0b1220] border border-[#162238] flex items-start justify-between gap-3 text-xs"
                                  >
                                    <div>
                                      <div className="font-semibold text-slate-200">{ab.agentName}</div>
                                      <div className="text-[11px] text-slate-400 font-mono">
                                        {ab.agentRole}
                                      </div>
                                      <p className="text-xs text-slate-300 mt-1">{ab.finding}</p>
                                    </div>
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Sources & Evidences Chips */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[#182540] flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-slate-400 font-mono text-[11px]">Grounding Sources:</span>
                              {msg.sources.map((src, i) => (
                                <button
                                  key={i}
                                  onClick={() => setSelectedSourceDoc(src)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d1627] border border-[#1d2b45] text-blue-300 hover:text-white hover:border-blue-500/40 text-[11px] font-mono cursor-pointer transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>{src}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {isAgentsAnalyzing && (
              <div className="flex gap-3.5 items-center p-4 bg-[#111c33]/60 rounded-2xl border border-blue-500/20 text-xs text-blue-300">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span>CORTEX agents synthesizing cross-departmental evidence & computing consensus...</span>
              </div>
            )}
          </div>

          {/* Prompt Input Form */}
          <form onSubmit={handleSend} className="relative mt-2">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="E.g. What is driving margin variance in Q3, and what actions will recover +2% EBITDA?"
              disabled={isAgentsAnalyzing}
              className="w-full bg-[#111c33] border border-[#1f2e4d] rounded-2xl pl-5 pr-14 py-4 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isAgentsAnalyzing}
              className="absolute right-2.5 top-2.5 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
              aria-label="Send query"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Right Column: Agents Roster & Source Files (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Active Agents Roster */}
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[#162138]">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Autonomous Agents ({agents.length})
              </h3>
              <span className="text-xs font-mono text-emerald-400">Swarm Active</span>
            </div>

            <div className="space-y-3">
              {agents.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-[#0a101d] rounded-xl">
                  No agents loaded.
                </div>
              ) : (
                agents.map((agent) => {
                  const Icon = agentIcons[agent.iconName] || Bot;
                  return (
                    <div
                      key={agent.id}
                      className="p-3 rounded-xl bg-[#111c33] border border-[#1d2b47] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white">{agent.name}</h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {agent.id === 'agent-finance'
                              ? 'Auditing margins & cash flow'
                              : agent.id === 'agent-operations'
                              ? 'Evaluating throughput & logistics'
                              : agent.id === 'agent-market'
                              ? 'Tracking competitor demand'
                              : agent.id === 'agent-risk'
                              ? 'Monitoring volatility index'
                              : 'Synthesizing decision paths'}
                          </p>
                        </div>
                      </div>
                      {isAgentsAnalyzing ? (
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sources & Evidence Panel */}
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[#162138]">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Grounding Evidence & Dossiers
              </h3>
            </div>

            <div className="space-y-2.5">
              {[
                { name: 'Finance_Report_Q3_2026.pdf', size: '2.4 MB' },
                { name: 'Raw_Material_Price_Trends.csv', size: '840 KB' },
                { name: 'Market_Analysis_India_2026.pdf', size: '5.1 MB' }
              ].map((doc, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedSourceDoc(doc.name)}
                  className="p-3 rounded-xl bg-[#111c33] border border-[#1d2b47] hover:border-[#2b3e66] flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-200 truncate">{doc.name}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-500 shrink-0">{doc.size}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Document Inspector Modal */}
      {selectedSourceDoc && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#162138] mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">{selectedSourceDoc}</h3>
              </div>
              <button
                onClick={() => setSelectedSourceDoc(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
            <div className="text-xs text-slate-300 space-y-3 max-h-64 overflow-y-auto">
              <p className="font-semibold text-blue-400">Verified Evidence Excerpt:</p>
              <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47] font-mono text-[11px] leading-relaxed text-slate-300">
                &quot;Quarterly procurement expenditure exhibited a +18.4% drift across silicon substrate and alloy components. Supplier concentration in Tier-1 logistics providers contributed 140 bps of additional freight tariff friction. Recommendation: Long-term hedging and volume dual-sourcing.&quot;
              </div>
              <p className="text-[11px] text-slate-400">
                Source ingested from ERP System • Ingestion Hash: sha256:7b9a4c...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
