/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Loader2, ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { CortexProvider, useAppUI, useAuth, useDataFabric } from './context/CortexContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { AuthGate } from './components/AuthGate';
import { ExecutiveOverview } from './components/views/ExecutiveOverview';
import { DataExplorer } from './components/views/DataExplorer';
import { AIWorkspace } from './components/views/AIWorkspace';
import { KnowledgeGraph } from './components/views/KnowledgeGraph';
import { ForecastsView } from './components/views/ForecastsView';
import { ScenarioSimulator } from './components/views/ScenarioSimulator';
import { RecommendationsView } from './components/views/RecommendationsView';
import { AdminSettings } from './components/views/AdminSettings';
import { CommandPalette } from './components/CommandPalette';
import { ReportModal } from './components/ReportModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const MainContent: React.FC = () => {
  const { currentPage, setCurrentPage } = useAppUI();
  const { user } = useAuth();
  const { isLoadingData, dataError, reloadMockData } = useDataFabric();

  const isAdmin = user?.role === 'Admin';

  return (
    <main className="flex-1 overflow-y-auto bg-[#080d19] text-slate-100 min-h-0 min-w-0">
      {dataError && (
        <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{dataError}</span>
          </div>
          <button
            type="button"
            onClick={() => void reloadMockData()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 font-semibold cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {isLoadingData && !dataError && (
        <div className="mx-6 mt-4 p-2.5 rounded-xl bg-[#0e1628] border border-[#1d2b47] text-xs text-slate-300 flex items-center gap-2 font-mono">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
          <span>Synchronizing enterprise datasets from PostgreSQL...</span>
        </div>
      )}

      {currentPage === 'overview' && <ExecutiveOverview />}
      {currentPage === 'data-explorer' && <DataExplorer />}
      {currentPage === 'ai-workspace' && <AIWorkspace />}
      {currentPage === 'knowledge-graph' && <KnowledgeGraph />}
      {currentPage === 'forecasts' && <ForecastsView />}
      {currentPage === 'scenario-simulator' && <ScenarioSimulator />}
      {currentPage === 'recommendations' && <RecommendationsView />}
      {currentPage === 'settings' &&
        (isAdmin ? (
          <AdminSettings />
        ) : (
          <div className="p-10 max-w-xl mx-auto mt-12 bg-[#0e1628] border border-rose-500/30 rounded-2xl text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">403 · Administrative Access Required</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your current role (<span className="text-blue-300 font-mono">{user?.role}</span>) does
              not have permission to access Platform Administration &amp; RBAC Governance.
            </p>
            <button
              type="button"
              onClick={() => setCurrentPage('overview')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
            >
              Return to Executive Overview
            </button>
          </div>
        ))}
    </main>
  );
};

const CortexAppLayout: React.FC = () => {
  const {
    displayScale,
    setCurrentPage,
    setIsCommandPaletteOpen,
    setIsReportModalOpen,
  } = useAppUI();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const scaleClass =
    displayScale === 'xl' ? 'scale-xl' : displayScale === 'large' ? 'scale-large' : 'scale-standard';

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentPage('overview');
      setIsCommandPaletteOpen(false);
      setIsReportModalOpen(false);
    }
  }, [isAuthenticated, setCurrentPage, setIsCommandPaletteOpen, setIsReportModalOpen]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('scale-standard', 'scale-large', 'scale-xl');
    root.classList.add(scaleClass);
    return () => {
      root.classList.remove('scale-standard', 'scale-large', 'scale-xl');
    };
  }, [scaleClass]);

  if (isLoadingAuth) {
    return (
      <div className="h-screen w-screen bg-[#080d19] text-slate-200 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
        <p className="text-xs font-mono text-slate-400">Verifying CORTEX session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthGate />;
  }

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden bg-[#080d19] font-sans antialiased text-slate-100 ${scaleClass}`}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header />
        <MainContent />
      </div>
      <CommandPalette />
      <ReportModal />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <CortexProvider>
        <CortexAppLayout />
      </CortexProvider>
    </ErrorBoundary>
  );
}
