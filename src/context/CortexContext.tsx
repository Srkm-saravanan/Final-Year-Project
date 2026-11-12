import React, { useMemo } from 'react';
import { AppUIProvider, type AppUIContextType, useAppUI } from './AppUIContext';
import { AuthProvider, type AuthContextType, useAuth } from './AuthContext';
import {
  DataFabricProvider,
  type DataFabricContextType,
  useDataFabric,
} from './DataFabricContext';
import {
  GovernanceProvider,
  type GovernanceContextType,
  useAuditLogger,
  useGovernance,
} from './GovernanceContext';
import {
  IntelligenceProvider,
  type IntelligenceContextType,
  useIntelligence,
} from './IntelligenceContext';
import {
  RecommendationsProvider,
  type RecommendationsContextType,
  useRecommendations,
} from './RecommendationsContext';
import {
  SimulationProvider,
  type SimulationContextType,
  useSimulation,
} from './SimulationContext';

export {
  AuthProvider,
  useAuth,
  AppUIProvider,
  useAppUI,
  GovernanceProvider,
  useGovernance,
  useAuditLogger,
  IntelligenceProvider,
  useIntelligence,
  SimulationProvider,
  useSimulation,
  RecommendationsProvider,
  useRecommendations,
  DataFabricProvider,
  useDataFabric,
};

export type CortexContextType = AuthContextType &
  AppUIContextType &
  Omit<GovernanceContextType, 'applyGovernanceMockData' | 'getSystemSettingsSnapshot'> &
  Omit<IntelligenceContextType, 'applyIntelligenceMockData'> &
  SimulationContextType &
  Omit<RecommendationsContextType, 'applyRecommendationsMockData'> &
  DataFabricContextType;

export const CortexProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <AppUIProvider>
        <GovernanceProvider>
          <IntelligenceProvider>
            <SimulationProvider>
              <RecommendationsProvider>
                <DataFabricProvider>{children}</DataFabricProvider>
              </RecommendationsProvider>
            </SimulationProvider>
          </IntelligenceProvider>
        </GovernanceProvider>
      </AppUIProvider>
    </AuthProvider>
  );
};

/**
 * Compatibility facade combining all domain contexts.
 * Prefer domain-specific hooks (`useAuth`, `useAppUI`, `useDataFabric`, `useSimulation`, etc.)
 * to avoid unnecessary component re-renders across unrelated domains.
 */
export const useCortex = (): CortexContextType => {
  const auth = useAuth();
  const ui = useAppUI();
  const gov = useGovernance();
  const intel = useIntelligence();
  const sim = useSimulation();
  const rec = useRecommendations();
  const data = useDataFabric();

  return useMemo<CortexContextType>(
    () => ({
      ...auth,
      ...ui,
      auditLogs: gov.auditLogs,
      auditRecordChecksums: gov.auditRecordChecksums,
      auditChainChecksum: gov.auditChainChecksum,
      lastAuditVerification: gov.lastAuditVerification,
      verifyAuditTrail: gov.verifyAuditTrail,
      addAuditLog: gov.addAuditLog,
      refreshAuditLogs: gov.refreshAuditLogs,
      users: gov.users,
      addUser: gov.addUser,
      updateUserRole: gov.updateUserRole,
      systemSettings: gov.systemSettings,
      updateSystemSetting: gov.updateSystemSetting,
      isLoadingGovernance: gov.isLoadingGovernance,
      governanceError: gov.governanceError,
      agents: intel.agents,
      updateAgent: intel.updateAgent,
      chatSessions: intel.chatSessions,
      activeChatId: intel.activeChatId,
      setActiveChatId: intel.setActiveChatId,
      createNewChat: intel.createNewChat,
      sendMessage: intel.sendMessage,
      isAgentsAnalyzing: intel.isAgentsAnalyzing,
      graphNodes: intel.graphNodes,
      graphEdges: intel.graphEdges,
      selectedGraphNode: intel.selectedGraphNode,
      setSelectedGraphNode: intel.setSelectedGraphNode,
      ...sim,
      recommendations: rec.recommendations,
      selectedRecommendation: rec.selectedRecommendation,
      setSelectedRecommendation: rec.setSelectedRecommendation,
      updateRecommendationStatus: rec.updateRecommendationStatus,
      isLoadingRecommendations: rec.isLoadingRecommendations,
      isUpdatingRecommendationId: rec.isUpdatingRecommendationId,
      recommendationError: rec.recommendationError,
      ...data,
    }),
    [auth, ui, gov, intel, sim, rec, data]
  );
};
