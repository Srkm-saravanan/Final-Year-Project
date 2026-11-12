import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiClientError } from '../services/apiClient';
import { dashboardApi, datasetApi } from '../services/cortexApi';
import type {
  CustomTabularDataset,
  DataSourceItem,
  ForecastsData,
  InsightItem,
  MetricCardData,
  OpportunityItem,
  RecentRecommendationItem,
  RiskItem,
  SalesRecord,
  SlideItem,
  TabularRow,
  TrendsData,
} from '../types/cortex';
import { useAuth } from './AuthContext';
import { useAuditLogger } from './GovernanceContext';
import { useIntelligence } from './IntelligenceContext';

export type ForecastMetricType = 'Revenue' | 'Demand' | 'Cost' | 'Profit';
export type ForecastHorizonType = '3 Months' | '6 Months' | '12 Months';

export interface UploadedDatasetRegistration {
  name: string;
  category: DataSourceItem['category'];
  fileName: string;
  columns: string[];
  rows: TabularRow[];
}

export interface DataFabricContextType {
  metrics: MetricCardData[];
  insights: InsightItem[];
  topOpportunities: OpportunityItem[];
  keyRisks: RiskItem[];
  recentRecommendations: RecentRecommendationItem[];
  dataSources: DataSourceItem[];
  addDataSource: (newDs: Partial<DataSourceItem>) => Promise<DataSourceItem>;
  salesRecords: SalesRecord[];
  addSalesRecord: (record: Omit<SalesRecord, 'id'>) => Promise<void>;
  customDatasets: Record<string, CustomTabularDataset>;
  registerUploadedDataset: (payload: UploadedDatasetRegistration) => Promise<string>;
  forecastMetric: ForecastMetricType;
  setForecastMetric: (metric: ForecastMetricType) => void;
  forecastHorizon: ForecastHorizonType;
  setForecastHorizon: (horizon: ForecastHorizonType) => void;
  trends: TrendsData;
  forecasts: ForecastsData;
  slides: SlideItem[];
  hasMockData: boolean;
  isLoadingData: boolean;
  dataError: string | null;
  reloadMockData: () => Promise<void>;
  clearAllMockData: () => void;
}

const DataFabricContext = createContext<DataFabricContextType | null>(null);

const EMPTY_TRENDS: TrendsData = { monthly: [], quarterly: [] };
const EMPTY_FORECASTS: ForecastsData = {
  historicalPoints: [],
  forecastPoints: [],
  driverWeights: [],
};

export const DataFabricProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const { applyIntelligenceMockData } = useIntelligence();
  const { refreshAuditLogs } = useAuditLogger();

  const [metrics, setMetrics] = useState<MetricCardData[]>([]);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [topOpportunities, setTopOpportunities] = useState<OpportunityItem[]>([]);
  const [keyRisks, setKeyRisks] = useState<RiskItem[]>([]);
  const [recentRecommendations, setRecentRecommendations] =
    useState<RecentRecommendationItem[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceItem[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [customDatasets, setCustomDatasets] = useState<Record<string, CustomTabularDataset>>({});

  const [forecastMetric, setForecastMetric] = useState<ForecastMetricType>('Revenue');
  const [forecastHorizon, setForecastHorizon] = useState<ForecastHorizonType>('12 Months');

  const [trends, setTrends] = useState<TrendsData>(EMPTY_TRENDS);
  const [forecasts, setForecasts] = useState<ForecastsData>(EMPTY_FORECASTS);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const clearAllMockData = useCallback(() => {
    setMetrics([]);
    setInsights([]);
    setTopOpportunities([]);
    setKeyRisks([]);
    setRecentRecommendations([]);
    setDataSources([]);
    setSalesRecords([]);
    setCustomDatasets({});
    setTrends(EMPTY_TRENDS);
    setForecasts(EMPTY_FORECASTS);
    setSlides([]);
    applyIntelligenceMockData(null);
  }, [applyIntelligenceMockData]);

  const loadFromBackend = useCallback(async () => {
    if (!isAuthenticated) {
      clearAllMockData();
      setDataError(null);
      return;
    }

    setIsLoadingData(true);
    setDataError(null);
    try {
      const [overview, trendsData, datasetsData] = await Promise.all([
        dashboardApi.getOverview(),
        dashboardApi.getTrends(),
        datasetApi.list(),
      ]);

      setMetrics(overview.metrics);
      setInsights(overview.insights);
      setTopOpportunities(overview.topOpportunities);
      setKeyRisks(overview.keyRisks);
      setRecentRecommendations(overview.recentRecommendations);
      setForecasts(overview.forecasts);
      setSlides(overview.slides);
      setTrends(trendsData);

      setDataSources(datasetsData.dataSources);
      setSalesRecords(datasetsData.salesRecords);
      setCustomDatasets(datasetsData.customDatasets);

      applyIntelligenceMockData({
        agents: overview.agents,
        chatSessions: overview.chatSessions,
        knowledgeGraph: overview.knowledgeGraph,
      });
    } catch (err) {
      setDataError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load enterprise telemetry from PostgreSQL backend.'
      );
    } finally {
      setIsLoadingData(false);
    }
  }, [applyIntelligenceMockData, clearAllMockData, isAuthenticated]);

  useEffect(() => {
    void loadFromBackend();
  }, [loadFromBackend, user?.id]);

  const reloadMockData = useCallback(async () => {
    await loadFromBackend();
  }, [loadFromBackend]);

  const addDataSource = useCallback(
    async (newDs: Partial<DataSourceItem>): Promise<DataSourceItem> => {
      const { dataSource: created } = await datasetApi.create({
        name: newDs.name || 'New Dataset',
        type: newDs.type || 'Custom',
        category: newDs.category || 'Operations',
        recordsCount: newDs.recordsCount || '0',
      });
      setDataSources((prev) => [...prev, created]);
      await refreshAuditLogs();
      return created;
    },
    [refreshAuditLogs]
  );

  const addSalesRecord = useCallback(
    async (record: Omit<SalesRecord, 'id'>): Promise<void> => {
      const { records } = await datasetApi.appendSalesRecord('ds-sales', record);
      setSalesRecords((prev) => [...records, ...prev]);
      await refreshAuditLogs();
    },
    [refreshAuditLogs]
  );

  const registerUploadedDataset = useCallback(
    async (payload: UploadedDatasetRegistration): Promise<string> => {
      const { dataSource: created, customDataset } = await datasetApi.create({
        name: payload.name,
        type: 'Custom',
        category: payload.category,
        fileName: payload.fileName,
        columns: payload.columns,
        rows: payload.rows,
      });

      setDataSources((prev) => [...prev, created]);
      if (customDataset) {
        setCustomDatasets((prev) => ({ ...prev, [created.id]: customDataset }));
      }
      await refreshAuditLogs();
      return created.id;
    },
    [refreshAuditLogs]
  );

  const hasMockData = metrics.length > 0 || dataSources.length > 0 || isLoadingData;

  const value = useMemo<DataFabricContextType>(
    () => ({
      metrics,
      insights,
      topOpportunities,
      keyRisks,
      recentRecommendations,
      dataSources,
      addDataSource,
      salesRecords,
      addSalesRecord,
      customDatasets,
      registerUploadedDataset,
      forecastMetric,
      setForecastMetric,
      forecastHorizon,
      setForecastHorizon,
      trends,
      forecasts,
      slides,
      hasMockData,
      isLoadingData,
      dataError,
      reloadMockData,
      clearAllMockData,
    }),
    [
      metrics,
      insights,
      topOpportunities,
      keyRisks,
      recentRecommendations,
      dataSources,
      addDataSource,
      salesRecords,
      addSalesRecord,
      customDatasets,
      registerUploadedDataset,
      forecastMetric,
      forecastHorizon,
      trends,
      forecasts,
      slides,
      hasMockData,
      isLoadingData,
      dataError,
      reloadMockData,
      clearAllMockData,
    ]
  );

  return <DataFabricContext.Provider value={value}>{children}</DataFabricContext.Provider>;
};

export const useDataFabric = (): DataFabricContextType => {
  const ctx = useContext(DataFabricContext);
  if (!ctx) {
    throw new Error('useDataFabric must be used within a DataFabricProvider');
  }
  return ctx;
};
