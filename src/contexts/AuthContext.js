import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE } from '../config/api';
import {
  TOKEN_KEY,
  REFRESH_KEY,
  USER_KEY,
  SESSION_EXPIRED_EVENT,
  getAccessToken,
  getRefreshToken,
  saveSession,
  saveTokens,
  clearSession,
} from '../utils/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const clearAuth = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem(USER_KEY);
    const storedToken = getAccessToken();

    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        clearAuth();
      }
    } else if (storedUser && !storedToken) {
      clearAuth();
    }
    setLoading(false);
  }, [clearAuth]);

  useEffect(() => {
    const onSessionExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    const onStorage = (e) => {
      if (e.key === TOKEN_KEY || e.key === USER_KEY || e.key === REFRESH_KEY) {
        if (!getAccessToken() || !localStorage.getItem(USER_KEY)) {
          setUser(null);
        }
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const saveAuth = useCallback((userData, accessToken, refreshToken) => {
    saveSession(userData, accessToken, refreshToken);
    setUser(userData);
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Login failed');
      }

      saveAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
      return data.data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [saveAuth]);

  const register = useCallback(async (email, password, name, inviteToken) => {
    setError(null);
    try {
      const body = { email, password, name };
      if (inviteToken) body.inviteToken = inviteToken;
      const response = await fetch(
        `${API_BASE}/auth/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Registration failed');
      }

      saveAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
      return data.data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [saveAuth]);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();

    if (refreshToken) {
      try {
        await fetch(
          `${API_BASE}/auth/logout`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          }
        );
      } catch {
        // Ignore logout errors
      }
    }

    clearAuth();
  }, [clearAuth]);

  const refreshTokens = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearAuth();
      return false;
    }

    try {
      const response = await fetch(
        `${API_BASE}/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        clearAuth();
        return false;
      }

      saveTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }, [clearAuth]);

  // Refresh access token in the background before it expires (8h TTL)
  useEffect(() => {
    if (!user || !getAccessToken()) return undefined;

    const intervalMs = 7 * 60 * 60 * 1000;
    const id = setInterval(() => {
      refreshTokens();
    }, intervalMs);

    return () => clearInterval(id);
  }, [user, refreshTokens]);

  const getAccessTokenFn = useCallback(() => getAccessToken(), []);

  const pinLogin = useCallback(async (employeeId, pin) => {
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/auth/pin-login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId, pin }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Login failed');
      }

      saveAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
      return data.data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [saveAuth]);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    isAuthenticated: !!user && !!getAccessToken(),
    login,
    pinLogin,
    register,
    logout,
    refreshTokens,
    getAccessToken: getAccessTokenFn,
    clearError: () => setError(null),
  }), [user, loading, error, login, pinLogin, register, logout, refreshTokens, getAccessTokenFn]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
