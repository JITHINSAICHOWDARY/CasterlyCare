import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../api/services/auth';
import { TOKEN_KEY, USER_KEY } from '../api/client';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const storedUser = readStoredUser();
    if (!token || !storedUser?.role) {
      clearSession();
    }
    setInitializing(false);
  }, [clearSession]);

  const establishSession = useCallback((data) => {
    const nextUser = data?.user;
    if (!data?.token || !nextUser?.role) {
      throw new Error('The server returned an invalid authentication response.');
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  }, []);

  const login = useCallback(async (email, password) => {
    setBusy(true);
    try {
      const res = await authService.login(email.trim(), password);
      return establishSession(res.data);
    } finally {
      setBusy(false);
    }
  }, [establishSession]);

  const signup = useCallback(async (payload) => {
    setBusy(true);
    try {
      const normalized = {
        ...payload,
        name: payload.name?.trim(),
        email: payload.email?.trim().toLowerCase(),
        phone: payload.phone?.trim(),
        address: payload.address?.trim(),
        doctorUniqueId: payload.doctorUniqueId?.trim().toUpperCase(),
        surgeryName: payload.surgeryName?.trim(),
        recoveryTotalDays: Number(payload.recoveryTotalDays),
      };
      const res = await authService.signup(normalized);
      return establishSession(res.data);
    } finally {
      setBusy(false);
    }
  }, [establishSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const updateUserLocal = useCallback((partial) => {
    setUser((previous) => {
      if (!previous) return previous;
      const next = { ...previous, ...partial };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user && localStorage.getItem(TOKEN_KEY)),
    initializing,
    loading: initializing || busy,
    busy,
    login,
    signup,
    logout,
    updateUserLocal,
  }), [user, initializing, busy, login, signup, logout, updateUserLocal]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
