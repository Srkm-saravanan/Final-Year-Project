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
import { scenarioApi } from '../services/cortexApi';
import type { SavedScenario, ScenarioKPIs, ScenarioParams } from '../types/cortex';
import {
  calculateSimulation,
  DEFAULT_BASELINE_KPIS,
  DEFAULT_SCENARIO_PARAMS,
} from '../utils/simulationEngine';
import { useAuth } from './AuthContext';
import { useAuditLogger } from './GovernanceContext';

export interface SimulationContextType {
  scenarioParams: ScenarioParams;
  setScenarioParams: React.Dispatch<React.SetStateAction<ScenarioParams>>;
  scenarioKPIs: ScenarioKPIs;
  baselineKPIs: ScenarioKPIs;
  isSimulating: boolean;
  isLoadingScenarios: boolean;
  scenarioError: string | null;
  runSimulation: (overrideParams?: ScenarioParams) => void;
  savedScenarios: SavedScenario[];
  activeScenarioId: string | null;
  saveCurrentScenario: (name: string) => Promise<SavedScenario>;
  updateSavedScenario: (id: string, name?: string) => Promise<SavedScenario>;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => Promise<void>;
}

const SimulationContext = createContext<SimulationContextType | null>(null);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const { addAuditLog, refreshAuditLogs } = useAuditLogger();
  const baselineKPIs = DEFAULT_BASELINE_KPIS;

  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>(DEFAULT_SCENARIO_PARAMS);
  const [scenarioKPIs, setScenarioKPIs] = useState<ScenarioKPIs>(() =>
    calculateSimulation(DEFAULT_SCENARIO_PARAMS, DEFAULT_BASELINE_KPIS)
  );
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState<boolean>(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  const paramsRef = useRef<ScenarioParams>(scenarioParams);
  paramsRef.current = scenarioParams;
  const savedScenariosRef = useRef<SavedScenario[]>(savedScenarios);
  savedScenariosRef.current = savedScenarios;
  const simTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (simTimerRef.current !== null) {
        window.clearTimeout(simTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedScenarios([]);
      setActiveScenarioId(null);
      setScenarioError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingScenarios(true);
    setScenarioError(null);

    scenarioApi
      .list()
      .then(({ scenarios }) => {
        if (!cancelled) {
          setSavedScenarios(scenarios);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setScenarioError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load scenarios from backend.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingScenarios(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  const runSimulation = useCallback(
    (overrideParams?: ScenarioParams) => {
      const targetParams = overrideParams ?? paramsRef.current;
      if (overrideParams) {
        paramsRef.current = overrideParams;
        setActiveScenarioId(null);
      }
      if (simTimerRef.current !== null) {
        window.clearTimeout(simTimerRef.current);
      }
      setIsSimulating(true);
      simTimerRef.current = window.setTimeout(() => {
        simTimerRef.current = null;
        const results = calculateSimulation(targetParams, baselineKPIs);
        setScenarioKPIs(results);
        setIsSimulating(false);
        addAuditLog(
          'Executed Scenario Simulation',
          `Price ${targetParams.priceChange}% | Mktg ₹${targetParams.marketingBudget}Cr`,
          'Success'
        );
      }, 350);
    },
    [addAuditLog, baselineKPIs]
  );

  const saveCurrentScenario = useCallback(
    async (name: string): Promise<SavedScenario> => {
      const currentParams = { ...paramsRef.current };
      const computedKPIs = calculateSimulation(currentParams, baselineKPIs);
      setScenarioKPIs(computedKPIs);
      setScenarioError(null);

      try {
        const { scenario: created } = await scenarioApi.create(name.trim(), currentParams);
        setSavedScenarios((prev) => [created, ...prev]);
        setActiveScenarioId(created.id);
        await refreshAuditLogs();
        return created;
      } catch (err) {
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to save scenario to database.';
        setScenarioError(msg);
        throw err;
      }
    },
    [baselineKPIs, refreshAuditLogs]
  );

  const updateSavedScenario = useCallback(
    async (id: string, name?: string): Promise<SavedScenario> => {
      const currentParams = { ...paramsRef.current };
      setScenarioError(null);
      try {
        const { scenario: updated } = await scenarioApi.update(id, {
          ...(name !== undefined ? { name } : {}),
          params: currentParams,
        });
        setSavedScenarios((prev) => prev.map((sc) => (sc.id === id ? updated : sc)));
        setScenarioKPIs(updated.kpis);
        await refreshAuditLogs();
        return updated;
      } catch (err) {
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to update scenario in database.';
        setScenarioError(msg);
        throw err;
      }
    },
    [refreshAuditLogs]
  );

  const loadScenario = useCallback(
    (id: string) => {
      const target = savedScenariosRef.current.find((sc) => sc.id === id);
      if (!target) return;

      if (simTimerRef.current !== null) {
        window.clearTimeout(simTimerRef.current);
        simTimerRef.current = null;
      }
      setIsSimulating(false);

      const loadedParams: ScenarioParams = { ...target.params };
      paramsRef.current = loadedParams;
      setScenarioParams(loadedParams);
      setScenarioKPIs(calculateSimulation(loadedParams, baselineKPIs));
      setActiveScenarioId(target.id);
      addAuditLog('Loaded Saved Scenario', target.name, 'Success');
    },
    [addAuditLog, baselineKPIs]
  );

  const deleteScenario = useCallback(
    async (id: string): Promise<void> => {
      setScenarioError(null);
      try {
        await scenarioApi.remove(id);
        setSavedScenarios((prev) => prev.filter((sc) => sc.id !== id));
        setActiveScenarioId((prev) => (prev === id ? null : prev));
        await refreshAuditLogs();
      } catch (err) {
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to delete scenario from database.';
        setScenarioError(msg);
        throw err;
      }
    },
    [refreshAuditLogs]
  );

  const value = useMemo<SimulationContextType>(
    () => ({
      scenarioParams,
      setScenarioParams,
      scenarioKPIs,
      baselineKPIs,
      isSimulating,
      isLoadingScenarios,
      scenarioError,
      runSimulation,
      savedScenarios,
      activeScenarioId,
      saveCurrentScenario,
      updateSavedScenario,
      loadScenario,
      deleteScenario,
    }),
    [
      scenarioParams,
      scenarioKPIs,
      baselineKPIs,
      isSimulating,
      isLoadingScenarios,
      scenarioError,
      runSimulation,
      savedScenarios,
      activeScenarioId,
      saveCurrentScenario,
      updateSavedScenario,
      loadScenario,
      deleteScenario,
    ]
  );

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
};

export const useSimulation = (): SimulationContextType => {
  const ctx = useContext(SimulationContext);
  if (!ctx) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return ctx;
};
