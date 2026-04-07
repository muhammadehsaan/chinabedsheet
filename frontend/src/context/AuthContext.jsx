import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authApi } from "../api/modules";

const AuthContext = createContext(null);

const TOKEN_KEY = "china-erp-token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await authApi.me();
      setUser(data);
    } catch (error) {
      window.localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const login = async (payload) => {
    const data = await authApi.login(payload);
    window.localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data;
  };

  const signup = async (payload, options = { autoLogin: false }) => {
    const data = await authApi.signup(payload);
    if (options.autoLogin) {
      window.localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
    }
    return data;
  };

  const logout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
