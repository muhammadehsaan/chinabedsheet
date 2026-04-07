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
        { path: "dashboard", element: <DashboardPage /> },
        { path: "inventory", element: <InventoryPage /> },
        { path: "production", element: <ProductionPage /> },
        { path: "sales", element: <SalesPage /> },
        { path: "financials", element: <FinancialsPage /> },
        { path: "emi", element: <EmiPage /> },
        { path: "settings", element: <PreferencesPage /> },
        { path: "purchases", element: <PurchasesPage /> },
        { path: "reports", element: <ReportsPage /> },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
    },
  },
);
