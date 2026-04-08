import { createBrowserRouter, createHashRouter } from "react-router-dom";

import AppLayout from "../layout/AppLayout";
import DashboardPage from "../pages/DashboardPage";
import EmiPage from "../pages/EmiPage";
import FinancialsPage from "../pages/AccountsPage";
import InventoryPage from "../pages/InventoryPage";
import LauncherPage from "../pages/LauncherPage";
import LoginPage from "../pages/LoginPage";
import PreferencesPage from "../pages/PreferencesPage";
import PurchasesPage from "../pages/PurchasesPage";
import ReportsPage from "../pages/ReportsPage";
import ProductionPage from "../pages/ProductionPage";
import SalesPage from "../pages/SalesPage";
import SignupPage from "../pages/SignupPage";
import RequireAuth from "../components/RequireAuth";
import RequirePermission from "../components/RequirePermission";

const createRouter = window.location.protocol === "file:" ? createHashRouter : createBrowserRouter;

export const router = createRouter(
  [
    { path: "/login", element: <LoginPage /> },
    { path: "/signup", element: <SignupPage /> },
    {
      path: "/",
      element: (
        <RequireAuth>
          <LauncherPage />
        </RequireAuth>
      ),
    },
    {
      path: "/",
      element: (
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      ),
      children: [
        { path: "dashboard", element: <RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission> },
        { path: "inventory", element: <RequirePermission permission="inventory.view"><InventoryPage /></RequirePermission> },
        { path: "production", element: <RequirePermission permission="production.view"><ProductionPage /></RequirePermission> },
        { path: "sales", element: <RequirePermission permission="sales.view"><SalesPage /></RequirePermission> },
        { path: "financials", element: <RequirePermission permission="accounts.view"><FinancialsPage /></RequirePermission> },
        { path: "emi", element: <RequirePermission permission="emi.view"><EmiPage /></RequirePermission> },
        { path: "settings", element: <RequirePermission permission="settings.view"><PreferencesPage /></RequirePermission> },
        { path: "purchases", element: <RequirePermission permission="purchases.view"><PurchasesPage /></RequirePermission> },
        { path: "reports", element: <RequirePermission permission="reports.view"><ReportsPage /></RequirePermission> },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
    },
  },
);
