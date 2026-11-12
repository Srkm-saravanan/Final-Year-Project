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
import { governanceApi, userApi } from '../services/cortexApi';
import type {
  AuditLogItem,
  CanonicalRole,
  RawMockDataset,
  SystemSettingsState,
  UserAccount,
} from '../types/cortex';
import { computeAuditChainChecksums } from '../utils/crypto';
import { useAuth } from './AuthContext';

const DEFAULT_SYSTEM_SETTINGS: SystemSettingsState = {
  automatedModelFailover: true,
  auditTrailArchival: true,
};

export interface AuditVerificationResult {
  valid: boolean;
  count: number;
  chainChecksum: string;
  verifiedAt: string;
}

export interface AuditLoggerContextType {
  addAuditLog: (
    action: string,
    target: string,
    status?: 'Success' | 'Warning' | 'Pending'
  ) => void;
  refreshAuditLogs: () => Promise<void>;
}

export interface GovernanceContextType {
  auditLogs: AuditLogItem[];
  auditRecordChecksums: Record<string, string>;
  auditChainChecksum: string;
  lastAuditVerification: AuditVerificationResult | null;
  verifyAuditTrail: () => Promise<AuditVerificationResult>;
  addAuditLog: (
    action: string,
    target: string,
    status?: 'Success' | 'Warning' | 'Pending'
  ) => void;
  refreshAuditLogs: () => Promise<void>;
  users: UserAccount[];
  addUser: (
    user: { name: string; email: string; role: CanonicalRole; password?: string }
  ) => Promise<UserAccount>;
  updateUserRole: (id: string, role: CanonicalRole) => Promise<UserAccount>;
  systemSettings: SystemSettingsState;
  updateSystemSetting: <K extends keyof SystemSettingsState>(
    key: K,
    value: SystemSettingsState[K]
  ) => Promise<void>;
  isLoadingGovernance: boolean;
  governanceError: string | null;
  getSystemSettingsSnapshot: () => SystemSettingsState;
  applyGovernanceMockData: (json: RawMockDataset | null) => void;
}

const AuditLoggerContext = createContext<AuditLoggerContextType | null>(null);
const GovernanceContext = createContext<GovernanceContextType | null>(null);

export const GovernanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, hasPermission } = useAuth();

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditRecordChecksums, setAuditRecordChecksums] = useState<Record<string, string>>({});
  const [auditChainChecksum, setAuditChainChecksum] = useState<string>('');
  const [lastAuditVerification, setLastAuditVerification] =
    useState<AuditVerificationResult | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [systemSettings, setSystemSettings] =
    useState<SystemSettingsState>(DEFAULT_SYSTEM_SETTINGS);
  const [isLoadingGovernance, setIsLoadingGovernance] = useState<boolean>(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);

  const systemSettingsRef = useRef<SystemSettingsState>(systemSettings);
  systemSettingsRef.current = systemSettings;

  const auditLogsRef = useRef<AuditLogItem[]>(auditLogs);
  auditLogsRef.current = auditLogs;

  const canReadAudit = hasPermission('audit:read');
  const canReadUsers = hasPermission('users:read');

  const refreshAuditLogs = useCallback(async () => {
    if (!isAuthenticated || !canReadAudit) return;
    try {
      const { auditLogs: fetchedLogs } = await governanceApi.getAuditLogs();
      setAuditLogs(fetchedLogs);
    } catch {
      // Preserve current auditLogs if background refresh fails
    }
  }, [canReadAudit, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setAuditLogs([]);
      setUsers([]);
      setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
      setLastAuditVerification(null);
      setGovernanceError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingGovernance(true);
    setGovernanceError(null);

    Promise.all([
      governanceApi.getSettings().catch((err) => {
        if (err instanceof ApiClientError && err.status === 403) return null;
        throw err;
      }),
      canReadAudit
        ? governanceApi.getAuditLogs().catch((err) => {
            if (err instanceof ApiClientError && err.status === 403) return null;
            throw err;
          })
        : Promise.resolve(null),
      canReadUsers
        ? userApi.list().catch((err) => {
            if (err instanceof ApiClientError && err.status === 403) return null;
            throw err;
          })
        : Promise.resolve(null),
    ])
      .then(([settingsRes, auditRes, usersRes]) => {
        if (cancelled) return;
        if (settingsRes?.settings) {
          setSystemSettings(settingsRes.settings);
          systemSettingsRef.current = settingsRes.settings;
        }
        if (auditRes?.auditLogs) {
          setAuditLogs(auditRes.auditLogs);
        } else if (!canReadAudit) {
          setAuditLogs([]);
        }
        if (usersRes?.users) {
          setUsers(usersRes.users);
        } else if (!canReadUsers) {
          setUsers([]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setGovernanceError(
            err instanceof ApiClientError
              ? err.message
              : 'Failed to load governance telemetry from server.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingGovernance(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canReadAudit, canReadUsers, isAuthenticated, user?.id]);

  // Recompute real Web Crypto SHA-256 receipts whenever auditLogs change
  useEffect(() => {
    let cancelled = false;
    computeAuditChainChecksums(auditLogs).then(({ recordChecksums, chainChecksum }) => {
      if (!cancelled) {
        setAuditRecordChecksums(recordChecksums);
        setAuditChainChecksum(chainChecksum);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [auditLogs]);

  const addAuditLog = useCallback(
    (action: string, target: string, status: 'Success' | 'Warning' | 'Pending' = 'Success') => {
      if (!systemSettingsRef.current.auditTrailArchival) {
        return;
      }
      const now = new Date();
      const timeStr = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
      const actorName = user?.name ?? 'Authenticated User';
      const newLog: AuditLogItem = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: timeStr,
        user: actorName,
        action,
        target,
        status,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
    },
    [user?.name]
  );

  const updateSystemSetting = useCallback(
    async <K extends keyof SystemSettingsState>(key: K, value: SystemSettingsState[K]) => {
      setGovernanceError(null);
      try {
        const { settings } = await governanceApi.updateSettings({ [key]: value });
        systemSettingsRef.current = settings;
        setSystemSettings(settings);
        await refreshAuditLogs();
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to update system settings.';
        setGovernanceError(msg);
        throw err;
      }
    },
    [refreshAuditLogs]
  );

  const verifyAuditTrail = useCallback(async (): Promise<AuditVerificationResult> => {
    const currentLogs = auditLogsRef.current;
    const { recordChecksums, chainChecksum } = await computeAuditChainChecksums(currentLogs);
    const structurallyValid =
      currentLogs.length === 0 ||
      currentLogs.every(
        (entry) =>
          Boolean(entry.id && entry.timestamp && entry.action && recordChecksums[entry.id]) &&
          /^[a-f0-9]{64}$/.test(recordChecksums[entry.id] ?? '')
      );
    const result: AuditVerificationResult = {
      valid: structurallyValid && /^[a-f0-9]{64}$/.test(chainChecksum),
      count: currentLogs.length,
      chainChecksum,
      verifiedAt: new Date().toLocaleTimeString(),
    };
    setAuditRecordChecksums(recordChecksums);
    setAuditChainChecksum(chainChecksum);
    setLastAuditVerification(result);
    return result;
  }, []);

  const addUser = useCallback(
    async (newUserPayload: {
      name: string;
      email: string;
      role: CanonicalRole;
      password?: string;
    }): Promise<UserAccount> => {
      setGovernanceError(null);
      try {
        const { user: created } = await userApi.create(newUserPayload);
        setUsers((prev) => [...prev, created]);
        await refreshAuditLogs();
        return created;
      } catch (err) {
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to create user account.';
        setGovernanceError(msg);
        throw err;
      }
    },
    [refreshAuditLogs]
  );

  const updateUserRole = useCallback(
    async (id: string, role: CanonicalRole): Promise<UserAccount> => {
      setGovernanceError(null);
      try {
        const { user: updated } = await userApi.updateRole(id, role);
        setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
        await refreshAuditLogs();
        return updated;
      } catch (err) {
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to update user role.';
        setGovernanceError(msg);
        throw err;
      }
    },
    [refreshAuditLogs]
  );

  const getSystemSettingsSnapshot = useCallback(() => systemSettingsRef.current, []);

  const applyGovernanceMockData = useCallback((json: RawMockDataset | null) => {
    if (!json) {
      setAuditLogs([]);
      setUsers([]);
      setLastAuditVerification(null);
    }
  }, []);

  const loggerValue = useMemo<AuditLoggerContextType>(
    () => ({ addAuditLog, refreshAuditLogs }),
    [addAuditLog, refreshAuditLogs]
  );

  const governanceValue = useMemo<GovernanceContextType>(
    () => ({
      auditLogs,
      auditRecordChecksums,
      auditChainChecksum,
      lastAuditVerification,
      verifyAuditTrail,
      addAuditLog,
      refreshAuditLogs,
      users,
      addUser,
      updateUserRole,
      systemSettings,
      updateSystemSetting,
      isLoadingGovernance,
      governanceError,
      getSystemSettingsSnapshot,
      applyGovernanceMockData,
    }),
    [
      auditLogs,
      auditRecordChecksums,
      auditChainChecksum,
      lastAuditVerification,
      verifyAuditTrail,
      addAuditLog,
      refreshAuditLogs,
      users,
      addUser,
      updateUserRole,
      systemSettings,
      updateSystemSetting,
      isLoadingGovernance,
      governanceError,
      getSystemSettingsSnapshot,
      applyGovernanceMockData,
    ]
  );

  return (
    <AuditLoggerContext.Provider value={loggerValue}>
      <GovernanceContext.Provider value={governanceValue}>{children}</GovernanceContext.Provider>
    </AuditLoggerContext.Provider>
  );
};

export const useAuditLogger = (): AuditLoggerContextType => {
  const ctx = useContext(AuditLoggerContext);
  if (!ctx) {
    throw new Error('useAuditLogger must be used within a GovernanceProvider');
  }
  return ctx;
};

export const useGovernance = (): GovernanceContextType => {
  const ctx = useContext(GovernanceContext);
  if (!ctx) {
    throw new Error('useGovernance must be used within a GovernanceProvider');
  }
  return ctx;
};
