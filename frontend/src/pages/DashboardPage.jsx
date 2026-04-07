import {
  BarChart3,
  CalendarClock,
  CreditCard,
  Factory,
  Package,
  RotateCcw,
  RotateCw,
  ScanLine,
  Settings,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useNavigate } from "react-router-dom";

import { accountsApi, inventoryApi, purchasesApi, salesApi } from "../api/modules";
import { useModule } from "../context/ModuleContext";
import { formatCurrency, formatDate, formatNumber, todayIso } from "../utils/format";

const breakdownColors = ["#6a7bdc", "#76c57a", "#f5b94c", "#a78bfa", "#f97316"];

const getPaidAmountFromSale = (sale = {}) => {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }
  const matches = String(sale.paymentMethod || "").match(/\d[\d,]*\.?\d*/g) || [];
  return matches.reduce((sum, value) => sum + (Number(String(value).replace(/,/g, "")) || 0), 0);
};

const toDateKey = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const shortDayLabel = (value) =>
  value.toLocaleDateString("en-US", {
    weekday: "short",
  });

const buildPieGradient = (rows) => {
  const total = rows.reduce((sum, row) => sum + row.share, 0) || 1;
  let cursor = 0;
  return `conic-gradient(${rows
    .map((row) => {
      const start = (cursor / total) * 100;
      cursor += row.share;
      const end = (cursor / total) * 100;
      return `${row.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ")})`;
};

const buildDonutGradient = (rows) => {
  const total = rows.reduce((sum, row) => sum + row.amount, 0) || 1;
  let cursor = 0;
  return `conic-gradient(${rows
    .map((row, index) => {
      const start = (cursor / total) * 100;
      cursor += row.amount;
      const end = (cursor / total) * 100;
      return `${breakdownColors[index % breakdownColors.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ")})`;
};

function DashboardPage() {
  const navigate = useNavigate();
  const { activeModule } = useModule();

  const salesQuery = useQuery({
    queryKey: ["sales", "list", "dashboard"],
    queryFn: salesApi.listSales,
  });
  const purchasesQuery = useQuery({
    queryKey: ["purchases", "list", "dashboard"],
    queryFn: purchasesApi.listPurchases,
  });
  const lowStockQuery = useQuery({
    queryKey: ["inventory", "alerts", "low-stock", "dashboard"],
    queryFn: inventoryApi.lowStockAlerts,
  });
  const itemsQuery = useQuery({
    queryKey: ["inventory", "items", "dashboard"],
    queryFn: inventoryApi.listItems,
  });
  const banksQuery = useQuery({
    queryKey: ["accounts", "banks", "dashboard"],
    queryFn: accountsApi.listBanks,
  });

  const salesRows = salesQuery.data || [];
  const purchaseRows = purchasesQuery.data || [];
  const stockAlerts = lowStockQuery.data || [];
  const inventoryItems = itemsQuery.data || [];
  const bankRows = banksQuery.data || [];
  const todayKey = todayIso();

  const totalSalesAmount = useMemo(
    () => salesRows.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0),
    [salesRows],
  );
  const totalPurchaseAmount = useMemo(
    () => purchaseRows.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0),
    [purchaseRows],
  );
  const todaySalesAmount = useMemo(
    () =>
      salesRows.reduce(
        (sum, sale) => sum + (toDateKey(sale.saleDate) === todayKey ? Number(sale.totalAmount || 0) : 0),
        0,
      ),
    [salesRows, todayKey],
  );
  const todayReceivedAmount = useMemo(
    () =>
      salesRows.reduce(
        (sum, sale) => sum + (toDateKey(sale.saleDate) === todayKey ? getPaidAmountFromSale(sale) : 0),
        0,
      ),
    [salesRows, todayKey],
  );
  const todayPurchasesAmount = useMemo(
    () =>
      purchaseRows.reduce(
        (sum, purchase) =>
          sum + (toDateKey(purchase.purchaseDate) === todayKey ? Number(purchase.totalAmount || 0) : 0),
        0,
      ),
    [purchaseRows, todayKey],
  );
  const bankBalanceTotal = useMemo(
    () => bankRows.reduce((sum, bank) => sum + Number(bank.currentBalance || 0), 0),
    [bankRows],
  );

  const creditSalesRows = useMemo(
    () =>
      salesRows.filter((sale) => {
        const dueAmount = Math.max(0, Number(sale.totalAmount || 0) - getPaidAmountFromSale(sale));
        return Number(sale.customerId || sale.customer?.id || 0) > 0 && dueAmount > 0;
      }),
    [salesRows],
  );
  const totalCreditDue = useMemo(
    () =>
      creditSalesRows.reduce(
        (sum, sale) => sum + Math.max(0, Number(sale.totalAmount || 0) - getPaidAmountFromSale(sale)),
        0,
      ),
    [creditSalesRows],
  );

  const followupRows = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let dueToday = 0;
    let overdue = 0;
    let noPromiseDate = 0;

    creditSalesRows.forEach((sale) => {
      const promiseValue = String(sale.promiseDate || sale.notes || "");
      const tokenMatch = promiseValue.match(/\[PROMISE_DATE:([^\]]+)\]/i);
      const promiseDate = sale.promiseDate
        ? new Date(sale.promiseDate)
        : tokenMatch
          ? new Date(tokenMatch[1])
          : null;

      if (!promiseDate || Number.isNaN(promiseDate.getTime())) {
        noPromiseDate += 1;
        return;
      }

      const promiseDay = new Date(promiseDate.getFullYear(), promiseDate.getMonth(), promiseDate.getDate());
      const delta = Math.floor((todayStart.getTime() - promiseDay.getTime()) / 86400000);
      if (delta > 0) {
        overdue += 1;
      } else if (delta === 0) {
        dueToday += 1;
      }
    });

    return [
      { name: "Due Today", amount: dueToday },
      { name: "Overdue", amount: overdue },
      { name: "No Promise", amount: noPromiseDate },
    ];
  }, [creditSalesRows]);

  const weeklySeries = useMemo(() => {
    const rows = [];
    for (let index = 6; index >= 0; index -= 1) {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      currentDate.setDate(currentDate.getDate() - index);
      const dateKey = currentDate.toISOString().slice(0, 10);
      rows.push({
        label: shortDayLabel(currentDate),
        sales: salesRows.reduce(
          (sum, sale) => sum + (toDateKey(sale.saleDate) === dateKey ? Number(sale.totalAmount || 0) : 0),
          0,
        ),
        purchases: purchaseRows.reduce(
          (sum, purchase) =>
            sum + (toDateKey(purchase.purchaseDate) === dateKey ? Number(purchase.totalAmount || 0) : 0),
          0,
        ),
      });
    }
    return rows;
  }, [purchaseRows, salesRows]);

  const maxValue = Math.max(
    ...weeklySeries.flatMap((row) => [row.sales, row.purchases]),
    1,
  );

  const topProducts = useMemo(() => {
    const grouped = new Map();
    salesRows.forEach((sale) => {
      (sale.lines || []).forEach((line) => {
        if (!line.itemId && String(line.itemName || "").toLowerCase().includes("extra charges")) {
          return;
        }
        const key = String(line.itemName || "Product").trim() || "Product";
        const nextAmount = Number(line.lineTotal || 0);
        grouped.set(key, (grouped.get(key) || 0) + nextAmount);
      });
    });
    const total = Array.from(grouped.values()).reduce((sum, value) => sum + value, 0) || 1;
    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, amount], index) => ({
        label,
        share: Math.max(1, Math.round((amount / total) * 100)),
        color: breakdownColors[index % breakdownColors.length],
      }));
  }, [salesRows]);
  const pieGradient = buildPieGradient(
    topProducts.length > 0 ? topProducts : [{ label: "No Sales", share: 100, color: "#cbd5e1" }],
  );

  const followupTotal = followupRows.reduce((sum, row) => sum + row.amount, 0);
  const followupGradient = buildDonutGradient(
    followupRows.some((row) => row.amount > 0) ? followupRows : [{ name: "No Due", amount: 1 }],
  );

  const recentSales = useMemo(
    () =>
      [...salesRows]
        .sort((a, b) => new Date(b.saleDate || 0).getTime() - new Date(a.saleDate || 0).getTime())
        .slice(0, 5),
    [salesRows],
  );

  const kpiCards = [
    { label: "Sales", value: formatCurrency(totalSalesAmount), tone: "indigo", icon: ShoppingCart },
    { label: "Purchases", value: formatCurrency(totalPurchaseAmount), tone: "green", icon: ShoppingBag },
    { label: "Credit Receivable", value: formatCurrency(totalCreditDue), tone: "blue", icon: RotateCcw },
    { label: "Low Stock Items", value: formatNumber(stockAlerts.length), tone: "amber", icon: RotateCw },
    { label: "Today Total Sales", value: formatCurrency(todaySalesAmount), tone: "purple", icon: TrendingUp },
    { label: "Today Total Received", value: formatCurrency(todayReceivedAmount), tone: "pink", icon: CreditCard },
    { label: "Today Total Purchases", value: formatCurrency(todayPurchasesAmount), tone: "cyan", icon: Package },
    { label: "Bank Balance", value: formatCurrency(bankBalanceTotal), tone: "red", icon: Wallet },
  ];

  const moduleOverview = [
    {
      module: "inventory",
      to: "/inventory",
      label: "Inventory & Variations",
      meta: "Items, stock, pricing",
      stat: `${formatNumber(inventoryItems.length)} Items`,
      icon: Package,
      tone: "indigo",
    },
    {
      module: "sales",
      to: "/sales",
      label: "Sales & POS",
      meta: "Invoices, counter, customer sales",
      stat: `${formatNumber(salesRows.length)} Invoices`,
      icon: ShoppingCart,
      tone: "green",
    },
    {
      module: "purchases",
      to: "/purchases",
      label: "Purchases",
      meta: "Suppliers, bills",
      stat: `${formatNumber(purchaseRows.length)} Purchases`,
      icon: ShoppingBag,
      tone: "pink",
    },
    {
      module: "emi",
      to: "/emi",
      label: "EMI & Installments",
      meta: "Credit follow-up",
      stat: `${formatNumber(creditSalesRows.length)} Open Credits`,
      icon: CalendarClock,
      tone: "pink",
    },
    {
      module: "financials",
      to: "/financials",
      label: "Financials & Accounts",
      meta: "Banks, balances",
      stat: `${formatNumber(bankRows.length)} Banks`,
      icon: Wallet,
      tone: "indigo",
    },
    {
      module: "settings",
      to: "/settings",
      label: "Settings & Security",
      meta: "Users, themes, access",
      stat: "System Controls",
      icon: Settings,
      tone: "red",
    },
  ];

  const lockedModule = activeModule || "dashboard";
  const visibleModuleOverview =
    lockedModule === "dashboard"
      ? moduleOverview
      : moduleOverview.filter((module) => module.module === lockedModule);
  const showModuleOverview = visibleModuleOverview.length > 0;
  const showInventoryShortcut = lockedModule === "inventory";

  return (
    <section className="dashboard-page dashboard-page--summary">
      <div className="dashboard-kpi-grid">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={`kpi-card kpi-card--${card.tone}`}>
              <div className="kpi-left">
                <span className="kpi-icon">
                  <Icon size={16} />
                </span>
                <div>
                  <div className="kpi-value">{card.value}</div>
                  <div className="kpi-label">{card.label}</div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {showModuleOverview && (
        <article className="panel-card module-overview-card">
          <header className="panel-header">
            <h3>Modules Overview</h3>
          </header>
          <div className="module-overview-grid">
            {visibleModuleOverview.map((module) => {
              const Icon = module.icon;
              return (
                <NavLink
                  key={module.to}
                  to={module.to}
                  className={`module-overview-item module-overview-item--${module.tone}`}
                >
                  <span className="module-overview-icon">
                    <Icon size={16} />
                  </span>
                  <div>
                    <div className="module-overview-title">{module.label}</div>
                    <div className="module-overview-meta">{module.meta}</div>
                    <div className="module-overview-statline">{module.stat}</div>
                  </div>
                </NavLink>
              );
            })}
          </div>
        </article>
      )}

      <div className="dashboard-summary-charts">
        <article className="panel-card">
          <header className="panel-header">
            <h3>This Week Sales & Purchases</h3>
            <div className="chart-legend">
              <span className="legend-dot legend-dot--sales" />
              Sales
              <span className="legend-dot legend-dot--profit" />
              Purchases
            </div>
          </header>
          <div className="sales-chart week-chart">
            {weeklySeries.map((row) => (
              <div key={row.label} className="sales-chart-col">
                <div className="sales-bars">
                  <span
                    className="sales-bar sales-bar--sales"
                    style={{ height: `${Math.max(8, (row.sales / maxValue) * 100)}%` }}
                  />
                  <span
                    className="sales-bar sales-bar--profit"
                    style={{ height: `${Math.max(8, (row.purchases / maxValue) * 100)}%` }}
                  />
                </div>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
          {showInventoryShortcut && (
            <div className="dashboard-tools">
              <button
                type="button"
                className="tool-chip tool-chip--accent"
                onClick={() => navigate("/inventory")}
              >
                <ScanLine size={14} />
                Scanner
              </button>
            </div>
          )}
        </article>

        <article className="panel-card">
          <header className="panel-header">
            <h3>Top Selling Products</h3>
          </header>
          <div className="pie-layout">
            <div className="pie-chart" style={{ backgroundImage: pieGradient }} />
            <ul className="pie-legend">
              {topProducts.length === 0 ? (
                <li>
                  <span className="legend-dot" style={{ backgroundColor: "#cbd5e1" }} />
                  <span>No sales yet</span>
                </li>
              ) : (
                topProducts.map((item) => (
                  <li key={item.label}>
                    <span className="legend-dot" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </article>
      </div>

      <div className="dashboard-mid-grid">
        <article className="panel-card">
          <header className="panel-header">
            <h3>Stock Alerts</h3>
            <button type="button" className="panel-select" onClick={() => navigate("/inventory")}>
              View All
            </button>
          </header>
          <ul className="stock-alert-list">
            {stockAlerts.slice(0, 5).length === 0 ? (
              <li className="stock-alert-item">
                <div className="stock-alert-name">
                  <span className="stock-alert-dot" />
                  No stock alerts
                </div>
                <strong>0</strong>
              </li>
            ) : (
              stockAlerts.slice(0, 5).map((item) => (
                <li key={item.name} className="stock-alert-item">
                  <div className="stock-alert-name">
                    <span className="stock-alert-dot" />
                    {item.name}
                  </div>
                  <strong>{formatNumber(item.currentStock ?? item.qty ?? 0)}</strong>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="panel-card">
          <header className="panel-header">
            <h3>Credit Follow-up</h3>
          </header>
          <div className="production-layout">
            <div className="donut-wrap">
              <div className="donut-chart donut-chart--compact" style={{ backgroundImage: followupGradient }}>
                <div className="donut-center">
                  <strong className="donut-value donut-value--small">{formatNumber(followupTotal)}</strong>
                  <span>Open</span>
                </div>
              </div>
            </div>
            <ul className="production-list">
              {followupRows.map((row, index) => (
                <li key={row.name} className="production-item">
                  <span
                    className="production-dot"
                    style={{ backgroundColor: breakdownColors[index % breakdownColors.length] }}
                  />
                  <span>{row.name}</span>
                  <strong>{formatNumber(row.amount)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="panel-card">
          <header className="panel-header">
            <h3>Recent Sales</h3>
            <div className="panel-actions">
              <button type="button" className="small-btn small-btn--ghost" onClick={() => navigate("/sales")}>
                Open Sales
              </button>
              <button type="button" className="small-btn" onClick={() => navigate("/reports")}>
                Reports
              </button>
            </div>
          </header>
          <ul className="recent-sales-list">
            {recentSales.length === 0 ? (
              <li className="recent-sale-row">
                <div>
                  <div className="recent-sale-id">No invoices yet</div>
                  <div className="recent-sale-meta">Start a sale to see activity here</div>
                </div>
                <div className="recent-sale-amount">-</div>
              </li>
            ) : (
              recentSales.map((sale) => (
                <li key={sale.id} className="recent-sale-row">
                  <div>
                    <div className="recent-sale-id">{sale.invoiceNo || `SA-${sale.id}`}</div>
                    <div className="recent-sale-meta">
                      {sale.customer?.name || "Counter Sale"} | {formatDate(sale.saleDate)}
                    </div>
                  </div>
                  <div className="recent-sale-amount">{formatCurrency(sale.totalAmount || 0)}</div>
                </li>
              ))
            )}
          </ul>
        </article>
      </div>
    </section>
  );
}

export default DashboardPage;
