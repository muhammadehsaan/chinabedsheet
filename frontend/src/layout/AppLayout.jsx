import {
  Bell,
  CalendarClock,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Factory,
  Home,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Palette,
  Search,
  Settings,
  ShoppingCart,
  ShoppingBag,
  Sun,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { inventoryApi, purchasesApi, salesApi } from "../api/modules";
import brandLogo from "../assets/company logo.png";
import { useAuth } from "../context/AuthContext";
import { resolveModuleFromPath, useModule } from "../context/ModuleContext";
import { useTheme } from "../context/ThemeContext";
import { formatCurrency, formatDate, formatNumber } from "../utils/format";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true, module: "dashboard" },
  { to: "/inventory", label: "Inventory & Variations", icon: Package, module: "inventory" },
  { to: "/production", label: "Production & Manufacturing", icon: Factory, module: "production" },
  { to: "/sales", label: "Sales & POS", icon: ShoppingCart, module: "sales" },
  { to: "/purchases", label: "Purchases", icon: ShoppingBag, module: "purchases" },
  { to: "/financials", label: "Financials & Accounts", icon: Wallet, module: "financials" },
  { to: "/emi", label: "EMI & Installments", icon: CalendarClock, module: "emi" },
  { to: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
  { to: "/settings", label: "Settings & Security", icon: Settings, module: "settings" },
];

const mainTabs = [
  { to: "/dashboard", label: "Dashboard", end: true, module: "dashboard" },
  { to: "/inventory", label: "Inventory", module: "inventory" },
  { to: "/production", label: "Production", module: "production" },
  { to: "/sales", label: "Sales & POS", module: "sales" },
  { to: "/purchases", label: "Purchases", module: "purchases" },
  { to: "/financials", label: "Financials", module: "financials" },
  { to: "/emi", label: "EMI", module: "emi" },
  { to: "/reports", label: "Reports", module: "reports" },
  { to: "/settings", label: "Settings", module: "settings" },
];

const colorPresets = [
  { value: "ruby", label: "Ruby" },
  { value: "ocean", label: "Ocean" },
  { value: "emerald", label: "Emerald" },
  { value: "slate", label: "Slate" },
];

const brandName = "China Bedsheet Store";
const getPaidAmountFromSale = (sale = {}) => {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }
  const matches = String(sale.paymentMethod || "").match(/\d[\d,]*\.?\d*/g) || [];
  return matches.reduce((sum, value) => sum + (Number(String(value).replace(/,/g, "")) || 0), 0);
};
const extractPromiseDateFromSale = (sale = {}) => {
  if (sale?.promiseDate) {
    const directDate = new Date(sale.promiseDate);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate;
    }
  }
  const noteMatch = String(sale?.notes || "").match(/\[PROMISE_DATE:([^\]]+)\]/i);
  if (!noteMatch) {
    return null;
  }
  const parsedDate = new Date(noteMatch[1]);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const utilityLinks = [
  { label: "Logout", icon: LogOut, to: null },
];

const pageTitleMap = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/inventory": "Inventory & Variations",
  "/production": "Production & Manufacturing",
  "/sales": "Sales & POS",
  "/financials": "Financials & Accounts",
  "/emi": "EMI & Installments",
  "/settings": "Settings & Security",
  "/purchases": "Purchases",
  "/reports": "Reports",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const buildPrintableInvoiceHtml = ({ type, record }) => {
  const isSale = type === "SALE";
  const dateValue = isSale ? record.saleDate : record.purchaseDate;
  const partyLabel = isSale ? "Client" : "Supplier";
  const partyName = isSale ? record.customer?.name || "Casual Client" : record.supplier?.name || "-";
  const title = isSale ? "Sale Invoice" : "Purchase Invoice";
  const unitHeading = isSale ? "Unit Price" : "Unit Cost";

  const lineRows = (record.lines || [])
    .map((line, index) => {
      const itemName = escapeHtml(line.item?.name || `Product ${index + 1}`);
      const quantity = escapeHtml(formatNumber(line.quantity || 0));
      const unitValue = escapeHtml(formatCurrency(isSale ? line.unitPrice : line.unitCost));
      const lineTotal = escapeHtml(formatCurrency(line.lineTotal));
      return `<tr>
        <td>${itemName}</td>
        <td>${quantity}</td>
        <td>${unitValue}</td>
        <td>${lineTotal}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)} ${escapeHtml(record.invoiceNo || "")}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #10203a; margin: 24px; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      .meta { margin-bottom: 16px; display: grid; gap: 5px; }
      .meta strong { min-width: 90px; display: inline-block; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #d1d9e5; padding: 8px 10px; text-align: left; font-size: 13px; }
      th { background: #f4f7fb; }
      .totals { margin-top: 16px; display: grid; gap: 4px; justify-content: end; }
      .totals strong { font-size: 16px; }
      .brand { display: flex; justify-content: center; margin-bottom: 14px; }
      .brand-title { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
    </style>
  </head>
  <body>
    <div class="brand">
      <div class="brand-title">${escapeHtml(brandName)}</div>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div><strong>Invoice:</strong> ${escapeHtml(record.invoiceNo || "-")}</div>
      <div><strong>Date:</strong> ${escapeHtml(formatDate(dateValue))}</div>
      <div><strong>${partyLabel}:</strong> ${escapeHtml(partyName)}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Qty</th>
          <th>${unitHeading}</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${
          lineRows ||
          '<tr><td colspan="4" style="text-align:center; color:#5f6f86;">No line details available</td></tr>'
        }
      </tbody>
    </table>
    <div class="totals">
      <div>Subtotal: ${escapeHtml(formatCurrency(record.subtotal))}</div>
      <div>Tax: ${escapeHtml(formatCurrency(record.taxAmount))}</div>
      <strong>Net Total: ${escapeHtml(formatCurrency(record.totalAmount))}</strong>
    </div>
  </body>
</html>`;
};

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { activeModule, setActiveModule, clearActiveModule } = useModule();
  const { mode, color, toggleMode, setColor } = useTheme();
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const notificationRef = useRef(null);
  const [searchText, setSearchText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem("nayab:dismissed-notifications") || "[]");
      return Array.isArray(stored) ? stored.filter((row) => typeof row === "string") : [];
    } catch (error) {
      return [];
    }
  });
  const pageTitle = pageTitleMap[location.pathname] || "Dashboard";
  const currentModule = resolveModuleFromPath(location.pathname);
  const lockedModule = activeModule || currentModule;
  const isModuleAllowed = (moduleKey) => {
    if (!lockedModule) {
      return true;
    }
    return moduleKey ? lockedModule === moduleKey : false;
  };
  const visibleNavItems = lockedModule
    ? navItems.filter((item) => item.module === lockedModule)
    : navItems;
  const visibleMainTabs = lockedModule
    ? mainTabs.filter((tab) => tab.module === lockedModule)
    : mainTabs;

  useEffect(() => {
    if (!activeModule && currentModule) {
      setActiveModule(currentModule);
    }
  }, [activeModule, currentModule, setActiveModule]);

  useEffect(() => {
    if (activeModule && currentModule && activeModule !== currentModule) {
      navigate("/", { replace: true });
    }
  }, [activeModule, currentModule, navigate]);

  const salesNotificationsQuery = useQuery({
    queryKey: ["sales", "list", "notifications"],
    queryFn: salesApi.listSales,
  });

  const purchaseNotificationsQuery = useQuery({
    queryKey: ["purchases", "list", "notifications"],
    queryFn: purchasesApi.listPurchases,
  });

  const lowStockNotificationsQuery = useQuery({
    queryKey: ["inventory", "low-stock", "notifications"],
    queryFn: inventoryApi.lowStockAlerts,
  });

  const itemsSearchQuery = useQuery({
    queryKey: ["inventory", "items", "layout-search"],
    queryFn: inventoryApi.listItems,
  });

  const invoiceNotifications = useMemo(() => {
    const salesRows = (salesNotificationsQuery.data || []).slice(0, 6).map((sale) => ({
      id: `sale-${sale.id}`,
      module: "sales",
      type: "SALE",
      title: `Sale Invoice ${sale.invoiceNo}`,
      description: `${sale.customer?.name || "Casual Client"} | ${formatCurrency(sale.totalAmount)}`,
      eventDate: sale.saleDate,
      record: sale,
    }));

    const purchaseRows = (purchaseNotificationsQuery.data || []).slice(0, 6).map((purchase) => ({
      id: `purchase-${purchase.id}`,
      module: "purchases",
      type: "PURCHASE",
      title: `Purchase Invoice ${purchase.invoiceNo}`,
      description: `${purchase.supplier?.name || "-"} | ${formatCurrency(purchase.totalAmount)}`,
      eventDate: purchase.purchaseDate,
      record: purchase,
    }));

    return [...salesRows, ...purchaseRows].sort((a, b) => {
      const aDate = new Date(a.eventDate || 0).getTime();
      const bDate = new Date(b.eventDate || 0).getTime();
      return bDate - aDate;
    });
  }, [salesNotificationsQuery.data, purchaseNotificationsQuery.data]);

  const lowStockNotifications = useMemo(
    () =>
      (lowStockNotificationsQuery.data || []).slice(0, 8).map((row) => ({
        id: `low-stock-${row.id}`,
        module: "inventory",
        to: "/inventory",
        secondaryTo: !lockedModule || lockedModule === "reports" ? "/reports" : null,
        secondaryLabel: "Details",
        severity: row.currentStock <= 0 ? "critical" : "warning",
        statusLabel: row.currentStock <= 0 ? "Out of Stock" : "Low Stock",
        title: row.name,
        description: `Stock ${formatNumber(row.currentStock)} | Threshold ${formatNumber(row.lowStockThreshold)}`,
        eventDate: row.updatedAt || row.createdAt,
      })),
    [lockedModule, lowStockNotificationsQuery.data],
  );

  const promiseDateNotifications = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return (salesNotificationsQuery.data || [])
      .map((sale) => {
        const promiseDate = extractPromiseDateFromSale(sale);
        if (!promiseDate) {
          return null;
        }
        const dueAmount = Math.max(0, Number(sale.totalAmount || 0) - getPaidAmountFromSale(sale));
        if (dueAmount <= 0 || !Number(sale.customerId || sale.customer?.id || 0)) {
          return null;
        }
        const promiseDay = new Date(promiseDate.getFullYear(), promiseDate.getMonth(), promiseDate.getDate());
        const dayDelta = Math.floor((todayStart.getTime() - promiseDay.getTime()) / 86400000);
        if (dayDelta < 0) {
          return null;
        }
        const isOverdue = dayDelta > 0;
          return {
          id: `sale-promise-${sale.id}-${promiseDate.toISOString().slice(0, 10)}`,
          module: "sales",
          to: "/sales",
          severity: isOverdue ? "critical" : "warning",
          statusLabel: isOverdue ? "Overdue" : "Promise Date",
          title: `Credit Sale ${sale.invoiceNo || `SA-${sale.id}`}`,
          description: `${sale.customer?.name || "Counter Sale"} | Due ${formatCurrency(dueAmount)}`,
          eventDate: promiseDate,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.eventDate || 0).getTime() - new Date(b.eventDate || 0).getTime());
  }, [salesNotificationsQuery.data]);

  const systemAlertNotifications = useMemo(
    () => [...promiseDateNotifications, ...lowStockNotifications],
    [lowStockNotifications, promiseDateNotifications],
  );

  const normalizedSearchText = searchText.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedSearchText) {
      return [];
    }

    const rankMatch = (text) => {
      const value = String(text || "").trim().toLowerCase();
      if (!value) {
        return null;
      }
      if (value === normalizedSearchText) {
        return 0;
      }
      if (value.startsWith(normalizedSearchText)) {
        return 1;
      }
      const containsIndex = value.indexOf(normalizedSearchText);
      if (containsIndex >= 0) {
        return 2 + Math.min(containsIndex, 6) / 10;
      }
      return null;
    };

    const pushCandidate = (rows, payload, fields) => {
      const ranks = fields.map(rankMatch).filter((rank) => rank !== null);
      if (ranks.length === 0) {
        return;
      }
      rows.push({
        ...payload,
        rank: Math.min(...ranks),
      });
    };

    const rows = [];

    (salesNotificationsQuery.data || []).forEach((sale) => {
      pushCandidate(
        rows,
        {
          id: `search-sale-${sale.id}`,
          type: "Sale",
          title: `Sale Invoice ${sale.invoiceNo}`,
          subtitle: `${sale.customer?.name || "Casual Client"} | ${formatCurrency(sale.totalAmount)}`,
          to: "/sales",
          orderDate: sale.saleDate,
          searchTarget: {
            module: "sales",
            kind: "sale",
            entityId: sale.id,
            focusTab: "invoices",
            label: sale.invoiceNo,
          },
        },
        [
          sale.invoiceNo,
          sale.customer?.name,
          ...(sale.lines || []).map((line) => line.item?.name),
        ],
      );
    });

    (purchaseNotificationsQuery.data || []).forEach((purchase) => {
      pushCandidate(
        rows,
        {
          id: `search-purchase-${purchase.id}`,
          type: "Purchase",
          title: `Purchase Invoice ${purchase.invoiceNo}`,
          subtitle: `${purchase.supplier?.name || "-"} | ${formatCurrency(purchase.totalAmount)}`,
          to: "/purchases",
          orderDate: purchase.purchaseDate,
          searchTarget: {
            module: "purchases",
            kind: "purchase",
            entityId: purchase.id,
            focusTab: "history",
            label: purchase.invoiceNo,
          },
        },
        [
          purchase.invoiceNo,
          purchase.supplier?.name,
          ...(purchase.lines || []).map((line) => line.item?.name),
        ],
      );
    });

    (itemsSearchQuery.data || []).forEach((item) => {
      pushCandidate(
        rows,
        {
          id: `search-item-${item.id}`,
          type: "Product",
          title: item.name,
          subtitle: `Stock ${formatNumber(item.currentStock)} | Sale ${formatCurrency(item.salePrice)}`,
          to: "/inventory",
          orderDate: item.updatedAt || item.createdAt,
          searchTarget: {
            module: "inventory",
            kind: "item",
            entityId: item.id,
            focusTab: "stock",
            label: item.name,
          },
        },
        [item.name, item.sku, item.barcode, item.category?.name],
      );
    });

    const allowedRows = rows.filter((row) => {
      const targetModule = row.searchTarget?.module || resolveModuleFromPath(row.to);
      return isModuleAllowed(targetModule);
    });

    return allowedRows
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        const aDate = new Date(a.orderDate || 0).getTime();
        const bDate = new Date(b.orderDate || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 10);
  }, [
    normalizedSearchText,
    salesNotificationsQuery.data,
    purchaseNotificationsQuery.data,
    itemsSearchQuery.data,
    lockedModule,
  ]);

  const searchLoading =
    salesNotificationsQuery.isLoading ||
    purchaseNotificationsQuery.isLoading ||
    itemsSearchQuery.isLoading;

  const notificationLoading =
    salesNotificationsQuery.isLoading ||
    purchaseNotificationsQuery.isLoading ||
    lowStockNotificationsQuery.isLoading;
  const notificationError =
    salesNotificationsQuery.isError ||
    purchaseNotificationsQuery.isError ||
    lowStockNotificationsQuery.isError;

  const dismissedIdSet = useMemo(
    () => new Set(dismissedNotificationIds),
    [dismissedNotificationIds],
  );

  const visibleInvoiceNotifications = useMemo(() => {
    const allowedRows = lockedModule
      ? invoiceNotifications.filter((row) => row.module === lockedModule)
      : invoiceNotifications;
    return allowedRows.filter((row) => !dismissedIdSet.has(row.id));
  }, [invoiceNotifications, dismissedIdSet, lockedModule]);

  const visibleSystemAlertNotifications = useMemo(() => {
    const allowedRows = lockedModule
      ? systemAlertNotifications.filter((row) => row.module === lockedModule)
      : systemAlertNotifications;
    return allowedRows.filter((row) => !dismissedIdSet.has(row.id));
  }, [systemAlertNotifications, dismissedIdSet, lockedModule]);

  const unreadCount = visibleInvoiceNotifications.length + visibleSystemAlertNotifications.length;

  const dismissNotifications = (ids) => {
    if (!ids || ids.length === 0) {
      return;
    }

    setDismissedNotificationIds((prev) => {
      const merged = new Set(prev);
      ids.forEach((id) => {
        if (id) {
          merged.add(id);
        }
      });
      const next = Array.from(merged).slice(-400);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("nayab:dismissed-notifications", JSON.stringify(next));
      }
      return next;
    });
  };

  const closeNotificationPanel = () => {
    const idsToDismiss = [
      ...visibleInvoiceNotifications.map((row) => row.id),
      ...visibleSystemAlertNotifications.map((row) => row.id),
    ];
    dismissNotifications(idsToDismiss);
    setNotificationOpen(false);
  };

  useEffect(() => {
    const existingIds = new Set(
      [...invoiceNotifications, ...systemAlertNotifications].map((row) => row.id),
    );
    setDismissedNotificationIds((prev) => {
      const filtered = prev.filter((id) => existingIds.has(id));
      if (filtered.length === prev.length) {
        return prev;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("nayab:dismissed-notifications", JSON.stringify(filtered));
      }
      return filtered;
    });
  }, [invoiceNotifications, systemAlertNotifications]);

  const openInvoicePrint = (type, record) => {
    const printWindow = window.open("", "_blank", "width=920,height=700");
    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintableInvoiceHtml({ type, record }));
    printWindow.document.close();

    let hasPrinted = false;
    const triggerPrint = () => {
      if (hasPrinted) {
        return;
      }
      hasPrinted = true;
      printWindow.focus();
      printWindow.print();
    };

    const logo = printWindow.document.querySelector(".brand img");
    if (logo && !logo.complete) {
      logo.addEventListener("load", () => setTimeout(triggerPrint, 40), { once: true });
      logo.addEventListener("error", () => setTimeout(triggerPrint, 40), { once: true });
      setTimeout(triggerPrint, 1200);
      return;
    }

    setTimeout(triggerPrint, 140);
  };

  const handleNotificationToggle = () => {
    setThemePanelOpen(false);
    if (notificationOpen) {
      closeNotificationPanel();
      return;
    }
    setNotificationOpen(true);
  };

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!notificationRef.current) {
        return;
      }
      if (!notificationRef.current.contains(event.target)) {
        closeNotificationPanel();
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [visibleInvoiceNotifications, visibleSystemAlertNotifications]);

  useEffect(() => {
    if (notificationOpen) {
      closeNotificationPanel();
    }
  }, [location.pathname]);

  const openInvoicePrintAndDismiss = (row) => {
    dismissNotifications([row.id]);
    openInvoicePrint(row.type, row.record);
  };

  const navigateFromNotificationAndDismiss = (rowId, path, moduleKey) => {
    const targetModule = moduleKey || resolveModuleFromPath(path);
    if (!isModuleAllowed(targetModule)) {
      navigate("/", { replace: true });
      return;
    }
    dismissNotifications([rowId]);
    setNotificationOpen(false);
    navigate(path);
  };

  const handleSearchSelect = (result) => {
    setSearchText("");
    setSearchOpen(false);
    setThemePanelOpen(false);
    setNotificationOpen(false);
    const targetModule = result.searchTarget?.module || resolveModuleFromPath(result.to);
    if (!isModuleAllowed(targetModule)) {
      navigate("/", { replace: true });
      return;
    }
    navigate(result.to, {
      state: result.searchTarget
        ? {
            searchTarget: {
              ...result.searchTarget,
              requestId: `${Date.now()}-${result.id}`,
            },
          }
        : undefined,
    });
  };

  useEffect(() => {
    const closeSearchOnOutsideClick = (event) => {
      if (!searchRef.current) {
        return;
      }
      if (!searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", closeSearchOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeSearchOnOutsideClick);
  }, []);

  return (
    <div className={`dashboard-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="dashboard-sidebar">
        <div className="sidebar-toggle-row">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((prev) => !prev)}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="sidebar-logo">
          <div className="sidebar-logo-text">
            <img className="sidebar-logo-image" src={brandLogo} alt={brandName} />
          </div>
        </div>

        <div className="sidebar-utility sidebar-utility--top">
          <NavLink
            to="/"
            className="utility-link"
            onClick={() => {
              clearActiveModule();
            }}
          >
            <Home size={16} />
            <span>Home / Launcher</span>
          </NavLink>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link")}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-utility">
          {utilityLinks.map((item) => {
            const Icon = item.icon;
            if (item.to) {
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "utility-link utility-link--active" : "utility-link"
                  }
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              );
            }

            return (
              <button
                type="button"
                key={item.label}
                className="utility-link"
                onClick={() => {
                  if (item.label === "Logout") {
                    clearActiveModule();
                    logout();
                    navigate("/login");
                  }
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="topbar-title">{pageTitle}</div>

          <div className="topbar-search" ref={searchRef}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search invoices, products..."
              value={searchText}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setSearchText(event.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchOpen(false);
                  return;
                }
                if (event.key === "Enter" && searchResults.length > 0) {
                  event.preventDefault();
                  handleSearchSelect(searchResults[0]);
                }
              }}
            />
            {searchOpen && (
              <div className="topbar-search-panel">
                {!normalizedSearchText && (
                  <div className="topbar-search-empty">Type to search invoices and products.</div>
                )}
                {normalizedSearchText && searchLoading && (
                  <div className="topbar-search-empty">Searching...</div>
                )}
                {normalizedSearchText && !searchLoading && searchResults.length === 0 && (
                  <div className="topbar-search-empty">No matching records found.</div>
                )}
                {normalizedSearchText && searchResults.length > 0 && (
                  <ul className="topbar-search-list">
                    {searchResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          className="topbar-search-item"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSearchSelect(result)}
                        >
                          <span className="topbar-search-type">{result.type}</span>
                          <strong>{result.title}</strong>
                          <small>{result.subtitle}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="topbar-actions">
            <div className="notification-wrap" ref={notificationRef}>
              <button
                type="button"
                className="topbar-icon-btn"
                aria-label="Notifications"
                onClick={handleNotificationToggle}
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="notification-badge">
                    {unreadCount > 99 ? "99+" : formatNumber(unreadCount)}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div className="notification-popover">
                  <div className="notification-head">
                    <strong>Notifications</strong>
                    <span>{formatNumber(unreadCount)} active</span>
                  </div>

                  {notificationLoading && (
                    <div className="notification-state">Loading notifications...</div>
                  )}

                  {notificationError && (
                    <div className="notification-state notification-state--error">
                      Failed to load notifications. Please refresh.
                    </div>
                  )}

                  {!notificationLoading && !notificationError && (
                    <>
                      <div className="notification-section">
                        <h5>Invoice Activity</h5>
                        {visibleInvoiceNotifications.length === 0 ? (
                          <div className="notification-empty">No recent invoice activity.</div>
                        ) : (
                          <ul className="notification-list">
                            {visibleInvoiceNotifications.map((row) => (
                              <li key={row.id} className="notification-item notification-item--info">
                                <div className="notification-main">
                                  <p className="notification-title">{row.title}</p>
                                  <p className="notification-text">{row.description}</p>
                                  <span className="notification-date">{formatDate(row.eventDate)}</span>
                                </div>
                                <div className="notification-item-actions">
                                  <button
                                    type="button"
                                    className="notification-action-btn"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      navigateFromNotificationAndDismiss(
                                        row.id,
                                        row.type === "SALE" ? "/sales" : "/purchases",
                                      );
                                    }}
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    className="notification-action-btn notification-action-btn--accent"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openInvoicePrintAndDismiss(row);
                                    }}
                                  >
                                    Print
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

	                      <div className="notification-section">
	                        <h5>System Alerts</h5>
	                        {visibleSystemAlertNotifications.length === 0 ? (
	                          <div className="notification-empty">No system alerts.</div>
	                        ) : (
	                          <ul className="notification-list">
	                            {visibleSystemAlertNotifications.map((row) => (
                              <li key={row.id} className={`notification-item notification-item--${row.severity}`}>
                                <div className="notification-main">
                                  <p className="notification-title">
                                    {row.title}
                                    <span className={`notification-pill notification-pill--${row.severity}`}>
                                      {row.statusLabel}
                                    </span>
                                  </p>
                                  <p className="notification-text">{row.description}</p>
                                  <span className="notification-date">{formatDate(row.eventDate)}</span>
                                </div>
	                                <div className="notification-item-actions">
	                                  <button
	                                    type="button"
	                                    className="notification-action-btn"
	                                    onClick={(event) => {
	                                      event.stopPropagation();
	                                      navigateFromNotificationAndDismiss(
	                                        row.id,
	                                        row.to || "/inventory",
	                                        row.module,
	                                      );
	                                    }}
	                                  >
	                                    {row.module === "sales" ? "Open Sale" : "View"}
	                                  </button>
	                                  {row.secondaryTo ? (
	                                    <button
	                                      type="button"
	                                      className="notification-action-btn notification-action-btn--alert"
	                                      onClick={(event) => {
	                                        event.stopPropagation();
	                                        navigateFromNotificationAndDismiss(
	                                          row.id,
	                                          row.secondaryTo,
	                                          resolveModuleFromPath(row.secondaryTo),
	                                        );
	                                      }}
	                                    >
	                                      {row.secondaryLabel || "Details"}
	                                    </button>
	                                  ) : null}
	                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <button type="button" className="topbar-icon-btn" aria-label="Mode" onClick={toggleMode}>
              {mode === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              type="button"
              className="topbar-icon-btn topbar-icon-btn--accent"
              aria-label="Theme Colors"
              onClick={() => {
                if (notificationOpen) {
                  closeNotificationPanel();
                }
                setThemePanelOpen((prev) => !prev);
              }}
            >
              <Palette size={16} />
            </button>
            {themePanelOpen && (
              <div className="theme-popover">
                <p>Color Theme</p>
                <div className="theme-palette">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={color === preset.value ? "theme-chip active" : "theme-chip"}
                      data-color={preset.value}
                      onClick={() => {
                        setColor(preset.value);
                        setThemePanelOpen(false);
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p>Mode</p>
                <div className="theme-mode-row">
                  <button
                    type="button"
                    className={mode === "light" ? "theme-mode-btn active" : "theme-mode-btn"}
                    onClick={() => {
                      if (mode !== "light") {
                        toggleMode();
                      }
                    }}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={mode === "dark" ? "theme-mode-btn active" : "theme-mode-btn"}
                    onClick={() => {
                      if (mode !== "dark") {
                        toggleMode();
                      }
                    }}
                  >
                    Dark
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {visibleMainTabs.length > 0 && (
          <nav className="main-module-tabs">
            {visibleMainTabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  isActive ? "main-module-tab main-module-tab--active" : "main-module-tab"
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        )}

        <section className="dashboard-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

export default AppLayout;
