/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { rawMockData } from './mockDataLoader';
import {
  MetricCardData,
  InsightItem,
  OpportunityItem,
  RiskItem,
  RecentRecommendationItem,
  DataSourceItem,
  SalesRecord,
  AgentInfo,
  ChatSession,
  GraphNode,
  GraphEdge,
  RecommendationItem,
  AuditLogItem,
  UserAccount,
  TrendsData,
  ForecastsData
} from '../types/cortex';

// If mock-data.json is deleted from the project directory,
// all initial datasets strictly evaluate to empty [] (dummy data removed entirely).
export const INITIAL_METRICS: MetricCardData[] = Array.isArray(rawMockData?.metrics)
  ? rawMockData.metrics
  : [];

export const INITIAL_INSIGHTS: InsightItem[] = Array.isArray(rawMockData?.insights)
  ? rawMockData.insights
  : [];

export const TOP_OPPORTUNITIES: OpportunityItem[] = Array.isArray(rawMockData?.topOpportunities)
  ? rawMockData.topOpportunities
  : [];

export const KEY_RISKS: RiskItem[] = Array.isArray(rawMockData?.keyRisks)
  ? rawMockData.keyRisks
  : [];

export const RECENT_RECOMMENDATIONS: RecentRecommendationItem[] = Array.isArray(rawMockData?.recentRecommendations)
  ? rawMockData.recentRecommendations
  : [];

export const DATA_SOURCES: DataSourceItem[] = Array.isArray(rawMockData?.dataSources)
  ? rawMockData.dataSources
  : [];

export const SAMPLE_SALES_RECORDS: SalesRecord[] = Array.isArray(rawMockData?.salesRecords)
  ? rawMockData.salesRecords
  : [];

export const INITIAL_AGENTS: AgentInfo[] = Array.isArray(rawMockData?.agents)
  ? rawMockData.agents
  : [];

export const INITIAL_CHAT_SESSIONS: ChatSession[] = Array.isArray(rawMockData?.chatSessions)
  ? rawMockData.chatSessions
  : [];

export const KNOWLEDGE_GRAPH_NODES: GraphNode[] = Array.isArray(rawMockData?.knowledgeGraph?.nodes)
  ? rawMockData.knowledgeGraph.nodes
  : [];

export const KNOWLEDGE_GRAPH_EDGES: GraphEdge[] = Array.isArray(rawMockData?.knowledgeGraph?.edges)
  ? rawMockData.knowledgeGraph.edges
  : [];

export const RECOMMENDATIONS_DATA: RecommendationItem[] = Array.isArray(rawMockData?.recommendations)
  ? rawMockData.recommendations
  : [];

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = Array.isArray(rawMockData?.auditLogs)
  ? rawMockData.auditLogs
  : [];

export const INITIAL_USERS: UserAccount[] = Array.isArray(rawMockData?.users)
  ? rawMockData.users
  : [];

export const TRENDS_DATA: TrendsData = rawMockData?.trends ?? {
  monthly: [],
  quarterly: []
};

export const FORECASTS_DATA: ForecastsData = rawMockData?.forecasts ?? {
  historicalPoints: [],
  forecastPoints: [],
  driverWeights: []
};
