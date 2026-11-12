import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiClientError } from '../services/apiClient';
import { recommendationApi } from '../services/cortexApi';
import type { RawMockDataset, RecommendationItem } from '../types/cortex';
import { useAuth } from './AuthContext';
import { useAuditLogger } from './GovernanceContext';

export interface RecommendationsContextType {
  recommendations: RecommendationItem[];
  selectedRecommendation: RecommendationItem | null;
  setSelectedRecommendation: (rec: RecommendationItem | null) => void;
  updateRecommendationStatus: (
    id: string,
    status: RecommendationItem['status']
  ) => Promise<void>;
  isLoadingRecommendations: boolean;
  isUpdatingRecommendationId: string | null;
  recommendationError: string | null;
  applyRecommendationsMockData: (json: RawMockDataset | null) => void;
}

const RecommendationsContext = createContext<RecommendationsContextType | null>(null);

export const RecommendationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const { refreshAuditLogs } = useAuditLogger();

  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] =
    useState<RecommendationItem | null>(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState<boolean>(false);
  const [isUpdatingRecommendationId, setIsUpdatingRecommendationId] = useState<string | null>(
    null
  );
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  const selectedRef = useRef<RecommendationItem | null>(selectedRecommendation);
  selectedRef.current = selectedRecommendation;

  useEffect(() => {
    if (!isAuthenticated) {
      setRecommendations([]);
      setSelectedRecommendation(null);
      setRecommendationError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingRecommendations(true);
    setRecommendationError(null);

    recommendationApi
      .list()
      .then(({ recommendations: items }) => {
        if (cancelled) return;
        setRecommendations(items);
        setSelectedRecommendation((prev) => {
          if (prev) {
            const matched = items.find((item) => item.id === prev.id);
            if (matched) return matched;
          }
          return items[0] ?? null;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setRecommendationError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load recommendations from backend.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRecommendations(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  const updateRecommendationStatus = useCallback(
    async (id: string, status: RecommendationItem['status']): Promise<void> => {
      setIsUpdatingRecommendationId(id);
      setRecommendationError(null);
      try {
        const { recommendation: updated } = await recommendationApi.updateStatus(id, status);
        setRecommendations((prev) =>
          prev.map((rec) => (rec.id === id ? updated : rec))
        );
        if (selectedRef.current?.id === id) {
          setSelectedRecommendation(updated);
        }
        await refreshAuditLogs();
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to update recommendation status.';
        setRecommendationError(msg);
        throw err;
      } finally {
        setIsUpdatingRecommendationId(null);
      }
    },
    [refreshAuditLogs]
  );

  const applyRecommendationsMockData = useCallback((json: RawMockDataset | null) => {
    if (!json || !Array.isArray(json.recommendations)) {
      return;
    }
    setRecommendations(json.recommendations);
    setSelectedRecommendation(json.recommendations[0] ?? null);
  }, []);

  const value = useMemo<RecommendationsContextType>(
    () => ({
      recommendations,
      selectedRecommendation,
      setSelectedRecommendation,
      updateRecommendationStatus,
      isLoadingRecommendations,
      isUpdatingRecommendationId,
      recommendationError,
      applyRecommendationsMockData,
    }),
    [
      recommendations,
      selectedRecommendation,
      updateRecommendationStatus,
      isLoadingRecommendations,
      isUpdatingRecommendationId,
      recommendationError,
      applyRecommendationsMockData,
    ]
  );

  return (
    <RecommendationsContext.Provider value={value}>{children}</RecommendationsContext.Provider>
  );
};

export const useRecommendations = (): RecommendationsContextType => {
  const ctx = useContext(RecommendationsContext);
  if (!ctx) {
    throw new Error('useRecommendations must be used within a RecommendationsProvider');
  }
  return ctx;
};
