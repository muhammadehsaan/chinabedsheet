import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "nayab-pos-preferences-v1";

const defaultPreferences = {
  defaultPrint: "LASER",
  printTypePage: "A4",
  language: "English",
  defaultSalePaymentMode: "Cash",
  defaultPurchasePaymentMode: "Cash",
  openDates: true,
  maintainStock: true,
  stockOnlyOnSale: false,
  mustReceiveAmount: false,
  askPrintOnSaleSave: true,
};

const allowedPaymentModes = ["Cash", "Credit"];
const resolvePaymentMode = (value) => (allowedPaymentModes.includes(value) ? value : "Cash");

const normalizePreferences = (value) => ({
  ...defaultPreferences,
  ...(value || {}),
  defaultSalePaymentMode: resolvePaymentMode(value?.defaultSalePaymentMode),
  defaultPurchasePaymentMode: resolvePaymentMode(value?.defaultPurchasePaymentMode),
});

const PreferencesContext = createContext({
  preferences: defaultPreferences,
  updatePreferences: () => {},
  resetPreferences: () => {},
});

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaultPreferences;
      }

      const parsed = JSON.parse(raw);
      return normalizePreferences(parsed);
    } catch {
      return defaultPreferences;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    document.body.setAttribute("data-print-mode", preferences.defaultPrint);
    document.body.setAttribute("data-print-page", preferences.printTypePage);
    document.body.setAttribute("data-language", preferences.language);
  }, [preferences]);

  const value = useMemo(
    () => ({
      preferences,
      updatePreferences: (patch) =>
        setPreferences((prev) =>
          normalizePreferences({
            ...prev,
            ...patch,
          }),
        ),
      resetPreferences: () => setPreferences(defaultPreferences),
    }),
    [preferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export const usePreferences = () => useContext(PreferencesContext);
