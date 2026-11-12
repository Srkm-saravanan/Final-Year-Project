import React from 'react';
import {
  LayoutDashboard,
  Database,
  Bot,
  Network,
  LineChart,
  Sliders,
  CheckSquare,
  Settings,
  Layers,
  Presentation
} from 'lucide-react';
import { useAppUI, useAuth, useIntelligence, useRecommendations } from '../context/CortexContext';
import { CortexPage } from '../types/cortex';

interface NavItem {
  id: CortexPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countBadge?: string;
}

export const Sidebar: React.FC = () => {
  const { currentPage, setCurrentPage, setIsReportModalOpen } = useAppUI();
  const { user } = useAuth();
  const { agents } = useIntelligence();
  const { recommendations } = useRecommendations();
  const isAdmin = user?.role === 'Admin';

  const mainNavItems: NavItem[] = [
    { id: 'overview', label: 'Executive Overview', icon: LayoutDashboard },
    { id: 'data-explorer', label: 'Data Explorer', icon: Database },
    {
      id: 'ai-workspace',
      label: 'AI Workspace',
      icon: Bot,
      countBadge: agents.length > 0 ? String(agents.length) : undefined
    },
    { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Network },
    { id: 'forecasts', label: 'Forecasts & Trends', icon: LineChart },
    { id: 'scenario-simulator', label: 'Scenario Simulator', icon: Sliders },
    {
      id: 'recommendations',
      label: 'Recommendations',
      icon: CheckSquare,
      countBadge: recommendations.length > 0 ? String(recommendations.length) : undefined
    }
  ];

  const systemNavItems: NavItem[] = [
    { id: 'settings', label: 'Settings & Admin', icon: Settings }
  ];

  return (
    <aside className="w-64 lg:w-72 xl:w-76 bg-[#0a101d] border-r border-[#1a253c] flex flex-col shrink-0 select-none h-screen sticky top-0 z-40 transition-all">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#182338] flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-900/30 ring-1 ring-blue-400/30 shrink-0">
          <Layers className="w-6.5 h-6.5 text-white stroke-[2.2]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold tracking-tight text-white font-mono">CORTEX</span>
            <span className="text-xs font-bold text-blue-400 bg-blue-950/80 px-2.5 py-0.5 rounded-md border border-blue-800/40">
              Enterprise
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-400 tracking-normal mt-0.5">
            Decision Intelligence
          </p>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-7">
        <div>
          <div className="px-3 pb-3 text-xs font-bold tracking-wider text-slate-400 uppercase">
            Platform Modules
          </div>
          <nav className="space-y-2">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all group cursor-pointer ${
                    isActive
                      ? 'bg-[#142038] text-white font-bold border border-[#203254] shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-[#0f172a]'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-colors ${
                      isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.countBadge && (
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-md font-mono font-bold ${
                        isActive
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'bg-[#162136] text-slate-400 group-hover:text-slate-300'
                      }`}
                    >
                      {item.countBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Group */}
        {isAdmin && (
          <div>
            <div className="px-3 pb-3 text-xs font-bold tracking-wider text-slate-400 uppercase">
              Governance & Settings
            </div>
            <nav className="space-y-2">
              {systemNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentPage(item.id)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all group cursor-pointer ${
                      isActive
                        ? 'bg-[#142038] text-white font-bold border border-[#203254]'
                        : 'text-slate-300 hover:text-white hover:bg-[#0f172a]'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 ${
                        isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* UG Project PPT Review Quick Link */}
      <div className="px-4 py-2 border-t border-[#182338]">
        <button
          onClick={() => setIsReportModalOpen(true)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-200 hover:text-white transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <Presentation className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
            <span>UG Project PPT (16 Slides)</span>
          </div>
          <span className="text-[10px] bg-blue-900/60 text-blue-300 font-mono px-1.5 py-0.5 rounded border border-blue-700/40">
            Review 1
          </span>
        </button>
      </div>

      {/* Footer System Status Card */}
      <div className="p-4 border-t border-[#182338] bg-[#080d18]">
        <div className="p-3.5 rounded-xl bg-[#0e1628] border border-[#1b2740]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-slate-200">Live Enterprise Sync</span>
            </div>
          </div>
          <p className="text-xs text-slate-400">Connected to ERP & CRM Fabric</p>
        </div>
      </div>
    </aside>
  );
};
