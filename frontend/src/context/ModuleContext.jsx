import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "nayab:active-module";

export const MODULE_KEYS = [
  "dashboard",
  "inventory",
  "production",
  "sales",
  "purchases",
  "financials",
  "emi",
  "reports",
  "settings",
];

export const normalizeModuleKey = (value) => {
  if (!value) {
    return null;
  }
  const key = String(value);
  return MODULE_KEYS.includes(key) ? key : null;
};

export const resolveModuleFromPath = (pathname) => {
  const segment = String(pathname || "")
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter(Boolean)[0];
  return normalizeModuleKey(segment);
};

const ModuleContext = createContext({
  activeModule: null,
  setActiveModule: () => {},
  clearActiveModule: () => {},
});

export function ModuleProvider({ children }) {
  const [activeModule, setActiveModuleState] = useState(() => {
    try {
      return normalizeModuleKey(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (activeModule) {
      window.localStorage.setItem(STORAGE_KEY, activeModule);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeModule]);

  const value = useMemo(
    () => ({
      activeModule,
      setActiveModule: (value) => setActiveModuleState(normalizeModuleKey(value)),
      clearActiveModule: () => setActiveModuleState(null),
    }),
    [activeModule],
  );

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>;
}

export const useModule = () => useContext(ModuleContext);
