import React, { useState } from 'react';
import {
  Search,
  Bell,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Command,
  Calendar,
  Presentation,
  LogOut
} from 'lucide-react';
import { useAppUI, useAuth, useDataFabric } from '../context/CortexContext';
import { CortexPage, FiscalPeriod, DisplayScale } from '../types/cortex';

const PAGE_TITLES: Record<CortexPage, { title: string; subtitle?: string }> = {
  overview: {
    title: '1. Executive Overview',
    subtitle: 'High-level metrics and AI-driven organizational health summary'
  },
  'data-explorer': {
    title: '2. Data Explorer',
    subtitle: 'Explore, analyze and manage organizational data sources'
  },
  'ai-workspace': {
    title: '3. AI Intelligence Workspace',
    subtitle: 'Ask questions, get insights, and collaborate with multiple AI agents'
  },
  'knowledge-graph': {
    title: '4. Knowledge Graph',
    subtitle: 'Explore relationships between business entities, powered by GraphRAG'
  },
  forecasts: {
    title: '5. Forecasts & Predictions',
    subtitle: 'AI-powered predictions based on historical data and market trends'
  },
  'scenario-simulator': {
    title: '6. Scenario Simulator',
    subtitle: 'Test different business decisions and see potential outcomes'
  },
  recommendations: {
    title: '7. Recommendations & Reports',
    subtitle: 'AI-generated actionable recommendations with detailed analysis'
  },
  settings: {
    title: '8. Administration & Settings',
    subtitle: 'Manage users, data sources, AI agents, and system configurations'
  }
};

export const Header: React.FC = () => {
  const {
    currentPage,
    setCurrentPage,
    currency,
    setCurrency,
    fiscalPeriod,
    setFiscalPeriod,
    setIsCommandPaletteOpen,
    setIsReportModalOpen,
    displayScale,
    setDisplayScale,
  } = useAppUI();
  const { hasMockData } = useDataFabric();
  const { user, logout } = useAuth();

  const userName = user?.name ?? 'Authenticated User';
  const userEmail = user?.email ?? '';
  const userRole = user?.role ?? 'Viewer';
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'CX';

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  const scaleOptions: { value: DisplayScale; label: string }[] = [
    { value: 'standard', label: 'Std' },
    { value: 'large', label: 'Large' },
    { value: 'xl', label: 'XL' }
  ];

  const notifications: {
    id: string;
    title: string;
    desc: string;
    time: string;
    type: 'warning' | 'info' | 'success';
    actionPage: CortexPage;
  }[] = [
    {
      id: 'n1',
      title: 'Raw material price increase detected',
      desc: 'Silicon substrate index increased by +18.4% WoW',
      time: '12 min ago',
      type: 'warning',
      actionPage: 'forecasts'
    },
    {
      id: 'n2',
      title: 'Q4 Revenue Forecast model updated',
      desc: 'Model accuracy R² improved to 0.94 with fresh ERP records',
      time: '1 hour ago',
      type: 'info',
      actionPage: 'forecasts'
    },
    {
      id: 'n3',
      title: 'New recommendation available: Expand Product A to Tier 2',
      desc: 'Projected financial impact: +₹12.5 Cr annual revenue',
      time: '2 hours ago',
      type: 'success',
      actionPage: 'recommendations'
    }
  ];

  const fiscalPeriods: FiscalPeriod[] = [
    'Q3 FY2026',
    'Q2 FY2026',
    'Q1 FY2026',
    'FY 2025-26 YTD'
  ];

  const currentInfo = PAGE_TITLES[currentPage] || {
    title: 'CORTEX Platform',
    subtitle: 'Enterprise Decision Intelligence'
  };

  return (
    <header className="min-h-16 h-auto py-2.5 px-4 sm:px-6 lg:px-8 border-b border-[#1a253c] bg-[#080d19]/95 backdrop-blur-md sticky top-0 z-30 transition-all flex items-center justify-between gap-3 shrink-0">
      {/* Title & Editorial Subtitle */}
      <div className="min-w-0 pr-2 flex-1 max-w-sm sm:max-w-md lg:max-w-none">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-sm sm:text-base lg:text-lg font-bold text-white tracking-tight truncate flex items-center gap-2">
            {currentInfo.title}
          </h1>
          {!hasMockData && (
            <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              Dummy Data Purged (mock-data.json removed)
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 hidden 2xl:block truncate mt-0.5">
          {currentInfo.subtitle}
        </p>
      </div>

      {/* Controls & Tools */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Fiscal Period Selector */}
        <div className="relative hidden sm:block shrink-0">
          <button
            onClick={() => {
              setShowPeriodDropdown(!showPeriodDropdown);
              setShowNotifications(false);
              setShowUserMenu(false);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#0e1628] border border-[#1d2a44] hover:border-[#2b3e66] text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer font-mono shadow-xs"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>{fiscalPeriod}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showPeriodDropdown && (
            <div className="absolute right-0 sm:left-0 mt-2 w-44 bg-[#0d1527] border border-[#1f2e4d] rounded-xl shadow-2xl p-1.5 z-50">
              {fiscalPeriods.map((period) => (
                <button
                  key={period}
                  onClick={() => {
                    setFiscalPeriod(period);
                    setShowPeriodDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded-lg font-mono transition-colors ${
                    fiscalPeriod === period
                      ? 'bg-blue-600/20 text-blue-300 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-[#131d33]'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Currency Switcher: INR (Cr) / USD (M) */}
        <div className="hidden md:flex items-center p-0.5 rounded-xl bg-[#0e1628] border border-[#1d2a44] text-xs font-mono shrink-0">
          <button
            onClick={() => setCurrency('INR')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              currency === 'INR'
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ₹ INR
          </button>
          <button
            onClick={() => setCurrency('USD')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              currency === 'USD'
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            $ USD
          </button>
        </div>

        {/* Search / Command Palette Bar */}
        <div
          onClick={() => setIsCommandPaletteOpen(true)}
          className="relative w-36 sm:w-48 lg:w-56 xl:w-64 group cursor-pointer shrink-0"
        >
          <div className="w-full bg-[#0e1628] border border-[#1d2a44] hover:border-[#2b3e66] rounded-xl pl-8 pr-10 py-1.5 text-xs text-slate-400 flex items-center justify-between transition-all">
            <span className="truncate">Search / Cmd</span>
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#162238] border border-[#213252] text-[10px] text-slate-400 font-mono shrink-0">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </div>
          </div>
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* UG Project PPT Review Button */}
        <button
          onClick={() => setIsReportModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-xs font-semibold text-blue-200 hover:text-white transition-all cursor-pointer shadow-xs shrink-0"
          title="Open UG Project PPT Review (16 Slides Deck)"
        >
          <Presentation className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="hidden sm:inline">PPT Review (16 Slides)</span>
          <span className="sm:hidden">PPT (16)</span>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
              setShowPeriodDropdown(false);
            }}
            className="w-10 h-10 rounded-xl bg-[#0e1628] border border-[#1d2a44] flex items-center justify-center text-slate-300 hover:text-white hover:border-[#2b3e66] transition-all cursor-pointer relative"
            aria-label="Notifications"
          >
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#080d19]" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-88 bg-[#0d1527] border border-[#1f2e4d] rounded-2xl shadow-2xl p-3.5 z-50 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#182540]">
                <span className="text-sm font-semibold text-white">System Notifications</span>
                <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md font-medium border border-blue-500/20 font-mono">
                  3 unread
                </span>
              </div>
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      setCurrentPage(n.actionPage);
                      setShowNotifications(false);
                    }}
                    className="p-3 rounded-xl bg-[#111c33] hover:bg-[#152340] border border-[#1d2b47] hover:border-blue-500/40 cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-3">
                      {n.type === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-xs text-slate-100 font-semibold leading-snug">{n.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{n.desc}</p>
                        <span className="text-[10px] text-slate-500 mt-1 block font-mono">{n.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
              setShowPeriodDropdown(false);
            }}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl bg-[#0e1628] border border-[#1d2a44] hover:border-[#2b3e66] transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold ring-1 ring-blue-400/40">
              {initials}
            </div>
            <div className="text-left hidden md:block">
              <div className="text-xs font-semibold text-slate-100 group-hover:text-white leading-tight">
                {userName}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-[#0d1527] border border-[#1f2e4d] rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-1">
              <div className="px-3 py-2.5 border-b border-[#182540] mb-1.5 bg-[#101b33] rounded-xl">
                <p className="text-xs font-bold text-white">{userName}</p>
                <p className="text-[11px] text-slate-400 truncate font-mono">{userEmail}</p>
                <div className="mt-1.5">
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-medium border border-blue-500/20">
                    Role: {userRole}
                  </span>
                </div>
              </div>
              <div className="px-3 py-2 border-b border-[#182540] mb-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Display Scale
                </div>
                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#080d19] border border-[#1a253c]">
                  {scaleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDisplayScale(option.value)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                        displayScale === option.value
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {userRole === 'Admin' && (
                <button
                  onClick={() => {
                    setCurrentPage('settings');
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-[#14223d] rounded-lg transition-colors cursor-pointer"
                >
                  Settings & Governance
                </button>
              )}
              <button
                onClick={() => {
                  setIsReportModalOpen(true);
                  setShowUserMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-[#14223d] rounded-lg transition-colors cursor-pointer"
              >
                Open Decision Dossier
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(false);
                  void logout();
                }}
                className="w-full text-left px-3 py-2 mt-1 border-t border-[#182540] text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
