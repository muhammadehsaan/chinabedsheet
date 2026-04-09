import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authApi } from "../api/modules";
import { getFirstAccessiblePath, modulePermissionMap } from "../utils/rbac";

const AuthContext = createContext(null);

const TOKEN_KEY = "china-erp-token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState({ usersCount: 0, allowPublicSignup: false });
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState(null);
  const [setupFallbackMode, setSetupFallbackMode] = useState(false);

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

  const loadSetup = async () => {
    setSetupLoading(true);
    setSetupError(null);
    setSetupFallbackMode(false);
    try {
      const data = await authApi.setup();
      setSetup({
        usersCount: Number(data?.usersCount || 0),
        allowPublicSignup: Boolean(data?.allowPublicSignup),
      });
      return data;
    } catch (error) {
      if (Number(error?.response?.status || 0) === 404) {
        setSetup({ usersCount: 0, allowPublicSignup: true });
        setSetupFallbackMode(true);
        return {
          usersCount: 0,
          allowPublicSignup: true,
        };
      }
      setSetupError(error);
      return null;
    } finally {
      setSetupLoading(false);
    }
  };

  useEffect(() => {
    loadSetup();
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
    setSetup({ usersCount: 1, allowPublicSignup: false });
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

  const permissions = user?.permissions || {};
  const hasPermission = (permissionKey) => {
    if (!permissionKey) {
      return true;
    }
    return Boolean(permissions?.[permissionKey]);
  };
  const hasAnyPermission = (permissionKeys = []) => {
    if (!Array.isArray(permissionKeys) || permissionKeys.length === 0) {
      return true;
    }
    return permissionKeys.some((key) => hasPermission(key));
  };
  const canAccessModule = (moduleKey) => {
    const permissionKey = modulePermissionMap[moduleKey];
    return hasPermission(permissionKey);
  };
  const defaultPath = getFirstAccessiblePath(permissions);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      logout,
      refreshUser: loadUser,
      refreshSetup: loadSetup,
      setup,
      setupLoading,
      setupError,
      setupFallbackMode,
      permissions,
      hasPermission,
      hasAnyPermission,
      canAccessModule,
      defaultPath,
    }),
    [user, loading, setup, setupLoading, setupError, setupFallbackMode, permissions, defaultPath],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
