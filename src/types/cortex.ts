/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CortexPage =
  | 'overview'
  | 'data-explorer'
  | 'ai-workspace'
  | 'knowledge-graph'
  | 'forecasts'
  | 'scenario-simulator'
  | 'recommendations'
  | 'settings';

export type CurrencyType = 'INR' | 'USD';
export type FiscalPeriod = 'Q3 FY2026' | 'Q2 FY2026' | 'Q1 FY2026' | 'FY 2025-26 YTD';
export type DisplayScale = 'standard' | 'large' | 'xl';

export interface MetricCardData {
  id: string;
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  history: number[];
  numericValue: number; // Raw numeric value in INR Cr for currency conversion
  unit: string;
}

export interface InsightItem {
  id: string;
  title: string;
  description: string;
  type: 'growth' | 'risk' | 'opportunity';
  tag?: string;
  timestamp?: string;
}

export interface OpportunityItem {
  id: string;
  title: string;
  benefit: string;
  route: CortexPage;
}

export interface RiskItem {
  id: string;
  title: string;
  level: 'High' | 'Medium' | 'Low';
  action: string;
}

export interface RecentRecommendationItem {
  id: string;
  title: string;
  impact: string;
  date: string;
}

export interface DataSourceItem {
  id: string;
  name: string;
  type: 'ERP' | 'Database' | 'CRM' | 'Supply Chain' | 'HR' | 'Market Research' | 'External Data' | 'Custom';
  status: 'Connected • Live' | 'Connected • Daily' | 'Connected • Monthly' | 'Syncing';
  recordsCount: string;
  lastUpdated: string;
  category: 'Finance' | 'Operations' | 'Customers' | 'Supply Chain' | 'HR';
}

export interface SalesRecord {
  id: string;
  date: string;
  region: 'North' | 'South' | 'East' | 'West';
  product: 'A' | 'B' | 'C' | 'D';
  category: 'Electronics' | 'Home' | 'Appliances' | 'Accessories';
  quantity: number;
  revenue: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  description: string;
  iconName: string;
  model: string;
  temperature: number;
  status: 'Idle' | 'Analyzing...' | 'Complete' | 'Evaluating...';
  tools: string[];
  systemPrompt: string;
}

export interface AgentBreakdown {
  agentName: string;
  agentRole: string;
  finding: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  agentBreakdowns?: AgentBreakdown[];
  sources?: string[];
  recommendations?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  date: string;
  messages: ChatMessage[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'Company' | 'Department' | 'Product' | 'Customer' | 'Supplier' | 'Region' | 'Event' | 'Metric';
  category: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  description?: string;
  revenue?: string;
  employees?: string;
  industry?: string;
  locations?: number;
  keyProducts?: string[];
  downstreamImpact?: string[];
  connectedIds: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}

export interface ScenarioParams {
  priceChange: number; // e.g. +5%
  marketingBudget: number; // in Cr, e.g. 15
  productionVolume: number; // e.g. +10%
  staffingLevel: 'No Change' | '+5%' | '+10%' | '-5%';
}

export interface ScenarioKPIs {
  revenue: number; // Cr
  profit: number; // Cr
  profitMargin: number; // %
  marketShare: number; // %
  roi: number; // %
}

export interface SavedScenario {
  id: string;
  name: string;
  timestamp: string;
  params: ScenarioParams;
  kpis: ScenarioKPIs;
  outlook: string;
}

export interface RecommendationItem {
  id: string;
  priority: 'High' | 'Medium' | 'Low';
  title: string;
  expectedImpact: string;
  confidence: number;
  category: 'Strategic' | 'Operational' | 'Financial' | 'Marketing';
  status: 'New' | 'In Progress' | 'Approved' | 'Rejected' | 'Completed' | 'Not Started';
  timeHorizon: string;
  evidence: string[];
  rationale: string;
  risks: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  target: string;
  status: 'Success' | 'Warning' | 'Pending';
}

export type CanonicalRole = 'Admin' | 'Analyst' | 'Executive' | 'Viewer';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: CanonicalRole;
  status: 'Active' | 'Invited' | 'Suspended';
  lastActive: string;
}

export interface AuthUser extends UserAccount {
  permissions: string[];
}

export interface TrendPoint {
  label: string;
  rev: number;
  profit: number;
}

export interface TrendsData {
  monthly: TrendPoint[];
  quarterly: TrendPoint[];
}

export interface HistoricalForecastPoint {
  label: string;
  val: number;
}

export interface ProjectedForecastPoint {
  label: string;
  val: number;
  low: number;
  high: number;
}

export interface ForecastDriverWeight {
  label: string;
  lift: string;
  width: string;
}

export interface ForecastsData {
  historicalPoints: HistoricalForecastPoint[];
  forecastPoints: ProjectedForecastPoint[];
  driverWeights: ForecastDriverWeight[];
}

export interface SlideItem {
  id: number;
  title: string;
  category: 'Foundation' | 'Literature' | 'Architecture' | 'Roadmap';
  subtitle: string;
  layoutTip: string;
  content: string[];
  tableData?: { headers: string[]; rows: string[][] };
  asciiDiagram?: string;
  speakerScript: string;
}

export interface RawMockDataset {
  metrics?: MetricCardData[];
  insights?: InsightItem[];
  topOpportunities?: OpportunityItem[];
  keyRisks?: RiskItem[];
  recentRecommendations?: RecentRecommendationItem[];
  dataSources?: DataSourceItem[];
  salesRecords?: SalesRecord[];
  agents?: AgentInfo[];
  chatSessions?: ChatSession[];
  knowledgeGraph?: {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
  };
  recommendations?: RecommendationItem[];
  auditLogs?: AuditLogItem[];
  users?: UserAccount[];
  trends?: TrendsData;
  forecasts?: ForecastsData;
  slides?: SlideItem[];
}

export interface SystemSettingsState {
  automatedModelFailover: boolean;
  auditTrailArchival: boolean;
}

export type RecommendationStatusMap = Record<string, RecommendationItem['status']>;

export type TabularCell = string | number | boolean | null;

export type TabularRow = Record<string, TabularCell>;

export type InferredColumnType = 'number' | 'date' | 'boolean' | 'string' | 'empty';

export interface ColumnSchemaInfo {
  name: string;
  inferredType: InferredColumnType;
  totalRows: number;
  nonNullCount: number;
  missingCount: number;
  invalidCount: number;
  distinctCount: number;
  sampleValues: string[];
}

export interface HistogramBin {
  rangeLabel: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

export interface NumericColumnStats {
  columnName: string;
  count: number;
  missingCount: number;
  invalidCount: number;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
  q1: number;
  q3: number;
  histogram: HistogramBin[];
}

export interface DatasetQualityReport {
  hasRowData: boolean;
  totalRows: number;
  totalCells: number;
  validCells: number;
  missingCells: number;
  invalidCells: number;
  duplicateRows: number;
  completenessPct: number;
  validityPct: number;
  uniquenessPct: number;
  overallIndexPct: number;
}

export interface CustomTabularDataset {
  sourceId: string;
  fileName: string;
  importedAt: string;
  columns: string[];
  rows: TabularRow[];
}
