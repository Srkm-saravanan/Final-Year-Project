import type {
  AgentInfo,
  AuditLogItem,
  AuthUser,
  CanonicalRole,
  ChatSession,
  CustomTabularDataset,
  DataSourceItem,
  ForecastsData,
  GraphEdge,
  GraphNode,
  InsightItem,
  MetricCardData,
  OpportunityItem,
  RecentRecommendationItem,
  RecommendationItem,
  RiskItem,
  SalesRecord,
  SavedScenario,
  ScenarioParams,
  SlideItem,
  SystemSettingsState,
  TabularRow,
  TrendsData,
  UserAccount,
} from '../types/cortex';
import { apiRequest } from './apiClient';

export interface OverviewResponse {
  metrics: MetricCardData[];
  insights: InsightItem[];
  topOpportunities: OpportunityItem[];
  keyRisks: RiskItem[];
  recentRecommendations: RecentRecommendationItem[];
  forecasts: ForecastsData;
  slides: SlideItem[];
  agents: AgentInfo[];
  chatSessions: ChatSession[];
  knowledgeGraph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}

export interface DatasetsListResponse {
  dataSources: DataSourceItem[];
  salesRecords: SalesRecord[];
  customDatasets: Record<string, CustomTabularDataset>;
}

export interface CreateDatasetPayload {
  name: string;
  type: DataSourceItem['type'];
  category: DataSourceItem['category'];
  recordsCount?: string;
  fileName?: string;
  columns?: string[];
  rows?: TabularRow[];
}

export interface CreateDatasetResponse {
  dataSource: DataSourceItem;
  customDataset?: CustomTabularDataset;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    apiRequest<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () =>
    apiRequest<{ loggedOut: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),
  refresh: () =>
    apiRequest<{ user: AuthUser }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  me: () => apiRequest<{ user: AuthUser }>('/api/auth/me'),
};

export const dashboardApi = {
  getOverview: () => apiRequest<OverviewResponse>('/api/dashboard/overview'),
  getTrends: () => apiRequest<TrendsData>('/api/dashboard/trends'),
};

export const datasetApi = {
  list: () => apiRequest<DatasetsListResponse>('/api/datasets'),
  getById: (id: string) =>
    apiRequest<{
      dataSource: DataSourceItem & { fileName?: string | null; columns?: string[] };
      salesRecords: SalesRecord[];
      rows: TabularRow[];
    }>(`/api/datasets/${encodeURIComponent(id)}`),
  create: (payload: CreateDatasetPayload) =>
    apiRequest<CreateDatasetResponse>('/api/datasets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  appendSalesRecord: (sourceId: string, record: Omit<SalesRecord, 'id'>) =>
    apiRequest<{ appended: number; records: SalesRecord[] }>(
      `/api/datasets/${encodeURIComponent(sourceId)}/records`,
      {
        method: 'POST',
        body: JSON.stringify(record),
      }
    ),
};

export const scenarioApi = {
  list: () => apiRequest<{ scenarios: SavedScenario[] }>('/api/scenarios'),
  getById: (id: string) =>
    apiRequest<{ scenario: SavedScenario }>(`/api/scenarios/${encodeURIComponent(id)}`),
  create: (name: string, params: ScenarioParams) =>
    apiRequest<{ scenario: SavedScenario }>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify({ name, params }),
    }),
  update: (id: string, payload: { name?: string; params?: ScenarioParams }) =>
    apiRequest<{ scenario: SavedScenario }>(`/api/scenarios/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    apiRequest<{ deletedId: string }>(`/api/scenarios/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

export const recommendationApi = {
  list: () => apiRequest<{ recommendations: RecommendationItem[] }>('/api/recommendations'),
  updateStatus: (id: string, status: RecommendationItem['status']) =>
    apiRequest<{ recommendation: RecommendationItem }>(
      `/api/recommendations/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),
};

export const governanceApi = {
  getAuditLogs: () => apiRequest<{ auditLogs: AuditLogItem[] }>('/api/audit-logs'),
  getSettings: () => apiRequest<{ settings: SystemSettingsState }>('/api/settings'),
  updateSettings: (payload: Partial<SystemSettingsState>) =>
    apiRequest<{ settings: SystemSettingsState }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateAgent: (
    id: string,
    payload: Partial<Pick<AgentInfo, 'name' | 'model' | 'temperature' | 'systemPrompt' | 'status'>>
  ) =>
    apiRequest<{ agent: AgentInfo }>(`/api/agents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export const userApi = {
  list: () => apiRequest<{ users: UserAccount[] }>('/api/users'),
  create: (payload: {
    name: string;
    email: string;
    role: CanonicalRole;
    password?: string;
  }) =>
    apiRequest<{ user: UserAccount }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRole: (id: string, role: CanonicalRole) =>
    apiRequest<{ user: UserAccount }>(`/api/users/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};

