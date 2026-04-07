import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "nayab-pos-theme-v1";

const defaultState = {
  mode: "light",
  color: "ruby",
};

const ThemeContext = createContext({
  ...defaultState,
  setMode: () => {},
  toggleMode: () => {},
  setColor: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaultState;
      }

      const parsed = JSON.parse(raw);
      if (!parsed?.mode || !parsed?.color) {
        return defaultState;
      }

      return {
        mode: parsed.mode,
        color: parsed.color,
      };
    } catch {
      return defaultState;
    }
  });

  useEffect(() => {
    document.body.setAttribute("data-mode", theme.mode);
    document.body.setAttribute("data-theme", theme.color);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  }, [theme]);

  const value = useMemo(
    () => ({
      mode: theme.mode,
      color: theme.color,
      setMode: (mode) => setTheme((prev) => ({ ...prev, mode })),
      toggleMode: () =>
        setTheme((prev) => ({ ...prev, mode: prev.mode === "light" ? "dark" : "light" })),
      setColor: (color) => setTheme((prev) => ({ ...prev, color })),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
