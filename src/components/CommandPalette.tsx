import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  LayoutDashboard,
  Database,
  Bot,
  Network,
  LineChart,
  Sliders,
  CheckSquare,
  Settings,
  ArrowRight,
  Sparkles,
  X
} from 'lucide-react';
import {
  useAppUI,
  useAuth,
  useDataFabric,
  useIntelligence,
  useRecommendations,
  useSimulation,
} from '../context/CortexContext';

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Navigation' | 'Actions' | 'Data Sources' | 'Scenarios';
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setCurrentPage,
    setIsReportModalOpen,
  } = useAppUI();
  const { user } = useAuth();
  const { runSimulation } = useSimulation();
  const { createNewChat, graphNodes } = useIntelligence();
  const { dataSources } = useDataFabric();
  const { recommendations } = useRecommendations();
  const isAdmin = user?.role === 'Admin';

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const commands: CommandItem[] = [
    {
      id: 'nav-overview',
      title: 'Executive Overview',
      subtitle: 'View executive health scorecards, revenue trends, and AI insights',
      category: 'Navigation',
      icon: LayoutDashboard,
      action: () => {
        setCurrentPage('overview');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav-data',
      title: 'Data Explorer',
      subtitle: `Explore ${dataSources.length} enterprise data sources, quality metrics, and schemas`,
      category: 'Navigation',
      icon: Database,
      action: () => {
        setCurrentPage('data-explorer');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav-ai',
      title: 'AI Intelligence Workspace',
      subtitle: 'Multi-agent business inquiry with Finance, Ops, and Strategy agents',
      category: 'Navigation',
      icon: Bot,
      action: () => {
        setCurrentPage('ai-workspace');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav-graph',
      title: 'Knowledge Graph (GraphRAG)',
      subtitle: `Explore ${graphNodes.length} interconnected business entities and supply chains`,
      category: 'Navigation',
      icon: Network,
      action: () => {
        setCurrentPage('knowledge-graph');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav-forecasts',
      title: 'Forecasts & Predictions',
      subtitle: 'Predictive revenue and margin projections with confidence intervals',
      category: 'Navigation',
      icon: LineChart,
      action: () => {
        setCurrentPage('forecasts');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav-simulator',
      title: 'Scenario Simulator',
      subtitle: 'What-if sensitivity analysis on pricing, marketing, and production',
      category: 'Navigation',
      icon: Sliders,
      action: () => {
        setCurrentPage('scenario-simulator');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav-recommendations',
      title: 'Recommendations & Reports',
      subtitle: `${recommendations.length} prioritized AI actions with financial impact and confidence`,
      category: 'Navigation',
      icon: CheckSquare,
      action: () => {
        setCurrentPage('recommendations');
        setIsCommandPaletteOpen(false);
      }
    },
    ...(isAdmin
      ? [
          {
            id: 'nav-settings',
            title: 'Administration & Governance',
            subtitle: 'Manage agent models, data connections, and cryptographic audit logs',
            category: 'Navigation' as const,
            icon: Settings,
            action: () => {
              setCurrentPage('settings');
              setIsCommandPaletteOpen(false);
            }
          }
        ]
      : []),
    {
      id: 'act-sim',
      title: 'Run Real-time Simulation Engine',
      subtitle: 'Recalculate enterprise KPIs against latest market elasticity assumptions',
      category: 'Actions',
      icon: Sliders,
      action: () => {
        setCurrentPage('scenario-simulator');
        runSimulation();
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'act-chat',
      title: 'Start New Business Investigation',
      subtitle: 'Initialize fresh multi-agent session with Finance and Operations agents',
      category: 'Actions',
      icon: Bot,
      action: () => {
        createNewChat();
        setCurrentPage('ai-workspace');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'act-report',
      title: 'Generate Executive Decision Brief',
      subtitle: 'Export institutional PDF brief with KPI scorecards and audit hash',
      category: 'Actions',
      icon: Sparkles,
      action: () => {
        setIsReportModalOpen(true);
        setIsCommandPaletteOpen(false);
      }
    }
  ];

  const filteredCommands = commands.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.subtitle.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  );

  const activeIndex =
    filteredCommands.length > 0 ? Math.min(selectedIndex, filteredCommands.length - 1) : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filteredCommands.length || 1)) % (filteredCommands.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[activeIndex]) {
        filteredCommands[activeIndex].action();
      }
    } else if (e.key === 'Escape') {
      setIsCommandPaletteOpen(false);
    }
  };

  return (
    <div
      onClick={() => setIsCommandPaletteOpen(false)}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-2xl bg-[#0d1424] border border-[#203254] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative border-b border-[#1a253c] p-4 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, module, action, or question..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-slate-400 hover:text-slate-200 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-[#162136] border border-[#253654] rounded">
            ESC to close
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-[#152035]/50">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No matching commands or entities found for &quot;{search}&quot;.
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === activeIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#162440] text-white' : 'hover:bg-[#111a2e] text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-[#152038] text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-[#0f172a] px-1.5 py-0.2 rounded border border-[#1e2c45]">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <ArrowRight
                    className={`w-4 h-4 transition-transform shrink-0 ${
                      isSelected ? 'text-blue-400 translate-x-1' : 'text-slate-600'
                    }`}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="p-2.5 px-4 bg-[#090f1d] border-t border-[#1a253c] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#142036] rounded border border-[#203254] font-mono text-[10px]">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-[#142036] rounded border border-[#203254] font-mono text-[10px]">
                ↓
              </kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#142036] rounded border border-[#203254] font-mono text-[10px]">
                ↵
              </kbd>
              <span>to select</span>
            </span>
          </div>
          <span className="text-slate-500">CORTEX Command Engine</span>
        </div>
      </div>
    </div>
  );
};
