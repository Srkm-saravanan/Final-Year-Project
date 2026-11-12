import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiClientError, registerSessionExpiredHandler } from '../services/apiClient';
import { authApi } from '../services/cortexApi';
import type { AuthUser, CanonicalRole } from '../types/cortex';

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isSubmittingAuth: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (...roles: CanonicalRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setUser(null);
      setAuthError('Your session has expired. Please sign in again.');
    });
    return () => registerSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(({ user: me }) => {
        if (!cancelled) {
          setUser(me);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAuth(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    setIsSubmittingAuth(true);
    setAuthError(null);
    try {
      const { user: loggedInUser } = await authApi.login(email, password);
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to sign in. Please verify your credentials.';
      setAuthError(msg);
      throw err;
    } finally {
      setIsSubmittingAuth(false);
    }
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<AuthUser> => {
      setIsSubmittingAuth(true);
      setAuthError(null);
      try {
        const { user: registeredUser } = await authApi.register(name, email, password);
        setUser(registeredUser);
        return registeredUser;
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to create account. Please review your details.';
        setAuthError(msg);
        throw err;
      } finally {
        setIsSubmittingAuth(false);
      }
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // Clear local session state even if network call fails
    } finally {
      setUser(null);
      setAuthError(null);
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      return user.permissions.includes(permission);
    },
    [user]
  );

  const hasRole = useCallback(
    (...roles: CanonicalRole[]): boolean => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      isSubmittingAuth,
      authError,
      clearAuthError,
      login,
      register,
      logout,
      hasPermission,
      hasRole,
    }),
    [
      user,
      isLoadingAuth,
      isSubmittingAuth,
      authError,
      clearAuthError,
      login,
      register,
      logout,
      hasPermission,
      hasRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

