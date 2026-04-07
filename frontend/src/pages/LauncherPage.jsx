import {
  BarChart3,
  CalendarClock,
  Factory,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useModule } from "../context/ModuleContext";
import brandLogo from "../assets/company logo.png";

const modules = [
  {
    key: "dashboard",
    to: "/dashboard",
    label: "Dashboard",
    meta: "Overview & summary",
    icon: LayoutDashboard,
    color: "launcher-card--slate",
  },
  {
    key: "inventory",
    to: "/inventory",
    label: "Inventory & Variations",
    meta: "Items, stock, pricing",
    icon: Package,
    color: "launcher-card--indigo",
  },
  {
    key: "production",
    to: "/production",
    label: "Production",
    meta: "Batches, workflow",
    icon: Factory,
    color: "launcher-card--green",
  },
  {
    key: "sales",
    to: "/sales",
    label: "Sales & POS",
    meta: "Invoices, billing",
    icon: ShoppingCart,
    color: "launcher-card--blue",
  },
  {
    key: "purchases",
    to: "/purchases",
    label: "Purchases",
    meta: "Bills, suppliers",
    icon: ShoppingBag,
    color: "launcher-card--amber",
  },
  {
    key: "financials",
    to: "/financials",
    label: "Financials & Accounts",
    meta: "Ledger, transactions",
    icon: Wallet,
    color: "launcher-card--purple",
  },
  {
    key: "emi",
    to: "/emi",
    label: "EMI & Installments",
    meta: "Schedules, dues",
    icon: CalendarClock,
    color: "launcher-card--pink",
  },
  {
    key: "reports",
    to: "/reports",
    label: "Reports",
    meta: "Performance, analytics",
    icon: BarChart3,
    color: "launcher-card--orange",
  },
  {
    key: "settings",
    to: "/settings",
    label: "Settings & Security",
    meta: "Users, roles, config",
    icon: Settings,
    color: "launcher-card--red",
  },
];

function LauncherPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { setActiveModule, clearActiveModule } = useModule();

  useEffect(() => {
    clearActiveModule();
  }, [clearActiveModule]);

  const handleLogout = () => {
    clearActiveModule();
    logout();
    navigate("/login");
  };

  return (
    <div className="launcher-shell">
      <div className="launcher-topbar">
        <div className="launcher-brand">
          <img src={brandLogo} alt="China Bedsheet Store" className="launcher-brand-logo" />
          <span className="launcher-brand-name">China Bedsheet Store</span>
        </div>
        <div className="launcher-user-area">
          {user && (
            <span className="launcher-username">Welcome, {user.name || user.email}</span>
          )}
          <button type="button" className="launcher-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>

      <div className="launcher-body">
        <div className="launcher-heading">
          <h1>Select a Module</h1>
          <p>Choose a section to get started</p>
        </div>

        <div className="launcher-grid">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.to}
                type="button"
                className={`launcher-card ${mod.color}`}
                onClick={() => {
                  setActiveModule(mod.key);
                  navigate(mod.to);
                }}
              >
                <span className="launcher-card-icon">
                  <Icon size={28} />
                </span>
                <div className="launcher-card-text">
                  <div className="launcher-card-label">{mod.label}</div>
                  <div className="launcher-card-meta">{mod.meta}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default LauncherPage;
