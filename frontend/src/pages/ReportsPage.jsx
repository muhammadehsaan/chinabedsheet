import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import ModuleTabs from "../components/ModuleTabs";
import { reportsApi } from "../api/modules";
import { formatCurrency, formatDate, formatNumber, todayIso } from "../utils/format";

const reportTabs = [
  { value: "overview", label: "Overview" },
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
  { value: "profit", label: "Profit" },
  { value: "stock", label: "Stock" },
  { value: "gst", label: "GST" },
  { value: "daybook", label: "Daybook" },
];

const dateOffsetIso = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

function EmptyState({ text, colSpan = 1 }) {
  return (
    <tr>
      <td colSpan={colSpan} className="hint-line" style={{ padding: "12px" }}>
        {text}
      </td>
    </tr>
  );
}

function ReportsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [filters, setFilters] = useState({
    startDate: dateOffsetIso(-30),
    endDate: todayIso(),
  });

  const params = useMemo(
    () => ({
      startDate: filters.startDate,
      endDate: filters.endDate,
    }),
    [filters.endDate, filters.startDate],
  );

  const salesReportQuery = useQuery({
    queryKey: ["reports", "sales", params.startDate, params.endDate],
    queryFn: () => reportsApi.sales(params),
  });

  const purchaseReportQuery = useQuery({
    queryKey: ["reports", "purchase", params.startDate, params.endDate],
    queryFn: () => reportsApi.purchases(params),
  });

  const profitReportQuery = useQuery({
    queryKey: ["reports", "profit", params.startDate, params.endDate],
    queryFn: () => reportsApi.profit(params),
  });

  const stockReportQuery = useQuery({
    queryKey: ["reports", "stock"],
    queryFn: reportsApi.stock,
  });

  const gstReportQuery = useQuery({
    queryKey: ["reports", "gst", params.startDate, params.endDate],
    queryFn: () => reportsApi.gst(params),
  });

  const daybookReportQuery = useQuery({
    queryKey: ["reports", "daybook", params.startDate, params.endDate],
    queryFn: () => reportsApi.daybook(params),
  });

  const queries = [
    salesReportQuery,
    purchaseReportQuery,
    profitReportQuery,
    stockReportQuery,
    gstReportQuery,
    daybookReportQuery,
  ];

  const isLoading = queries.some((query) => query.isLoading);
  const hasError = queries.some((query) => query.isError);
  const lowStockRows = (stockReportQuery.data?.records || []).filter(
    (row) => Number(row.currentStock) <= Number(row.lowStockThreshold),
  );
  const daybookTotals = (daybookReportQuery.data?.records || []).reduce(
    (totals, row) => ({
      sales: totals.sales + Number(row.sales || 0),
      purchases: totals.purchases + Number(row.purchases || 0),
      cashIn: totals.cashIn + Number(row.cashIn || 0),
      cashOut: totals.cashOut + Number(row.cashOut || 0),
      expenses: totals.expenses + Number(row.expenses || 0),
      bankDeposit: totals.bankDeposit + Number(row.bankDeposit || 0),
      cheque: totals.cheque + Number(row.cheque || 0),
      netCashMovement: totals.netCashMovement + Number(row.netCashMovement || 0),
    }),
    {
      sales: 0,
      purchases: 0,
      cashIn: 0,
      cashOut: 0,
      expenses: 0,
      bankDeposit: 0,
      cheque: 0,
      netCashMovement: 0,
    },
  );

  return (
    <section className="module-page">
      <header className="module-header">
        <h3>Reports Module</h3>
        <span className="module-subtitle">
          Live sales, purchase, profit, stock, GST and daybook reporting
        </span>
      </header>

      <article className="module-card">
        <div className="line-head">
          <h4>Report Filters</h4>
        </div>
        <div className="two-col filter-row">
          <label>
            Start Date
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, startDate: event.target.value }))
              }
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, endDate: event.target.value }))
              }
            />
          </label>
        </div>
      </article>

      <ModuleTabs tabs={reportTabs} value={activeTab} onChange={setActiveTab} />

      {isLoading ? <div className="module-card">Loading reports...</div> : null}

      {hasError ? (
        <div className="module-card">One or more reports failed to load. Check API data and refresh.</div>
      ) : null}

      {!isLoading && !hasError && (
        <>
          {activeTab === "overview" && (
            <>
              <div className="summary-grid three-wide">
                <article className="module-card">
                  <h4>Sales Summary</h4>
                  <div className="kpi-grid">
                    <div>
                      <span>Invoices</span>
                      <strong>{formatNumber(salesReportQuery.data?.summary?.invoices)}</strong>
                    </div>
                    <div>
                      <span>Subtotal</span>
                      <strong>{formatCurrency(salesReportQuery.data?.summary?.subtotal)}</strong>
                    </div>
                    <div>
                      <span>Tax</span>
                      <strong>{formatCurrency(salesReportQuery.data?.summary?.taxAmount)}</strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>{formatCurrency(salesReportQuery.data?.summary?.totalAmount)}</strong>
                    </div>
                  </div>
                </article>

                <article className="module-card">
                  <h4>Purchase Summary</h4>
                  <div className="kpi-grid">
                    <div>
                      <span>Invoices</span>
                      <strong>{formatNumber(purchaseReportQuery.data?.summary?.invoices)}</strong>
                    </div>
                    <div>
                      <span>Subtotal</span>
                      <strong>{formatCurrency(purchaseReportQuery.data?.summary?.subtotal)}</strong>
                    </div>
                    <div>
                      <span>Tax</span>
                      <strong>{formatCurrency(purchaseReportQuery.data?.summary?.taxAmount)}</strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>{formatCurrency(purchaseReportQuery.data?.summary?.totalAmount)}</strong>
                    </div>
                  </div>
                </article>

                <article className="module-card">
                  <h4>Profit Summary</h4>
                  <div className="kpi-grid">
                    <div>
                      <span>Revenue</span>
                      <strong>{formatCurrency(profitReportQuery.data?.summary?.revenue)}</strong>
                    </div>
                    <div>
                      <span>Cost</span>
                      <strong>{formatCurrency(profitReportQuery.data?.summary?.cost)}</strong>
                    </div>
                    <div>
                      <span>Gross Profit</span>
                      <strong>{formatCurrency(profitReportQuery.data?.summary?.grossProfit)}</strong>
                    </div>
                    <div>
                      <span>Margin %</span>
                      <strong>
                        {formatNumber(profitReportQuery.data?.summary?.grossMarginPercent)}%
                      </strong>
                    </div>
                  </div>
                </article>
              </div>

              <div className="summary-grid three-wide">
                <article className="module-card">
                  <h4>Stock Summary</h4>
                  <div className="kpi-grid">
                    <div>
                      <span>Products</span>
                      <strong>{formatNumber(stockReportQuery.data?.summary?.items)}</strong>
                    </div>
                    <div>
                      <span>Low Stock</span>
                      <strong>{formatNumber(stockReportQuery.data?.summary?.lowStockItems)}</strong>
                    </div>
                    <div>
                      <span>Stock Value</span>
                      <strong>{formatCurrency(stockReportQuery.data?.summary?.totalStockValue)}</strong>
                    </div>
                  </div>
                </article>

                <article className="module-card">
                  <h4>GST Summary</h4>
                  <div className="kpi-grid">
                    <div>
                      <span>Collected</span>
                      <strong>{formatCurrency(gstReportQuery.data?.gstCollectedOnSales)}</strong>
                    </div>
                    <div>
                      <span>Paid</span>
                      <strong>{formatCurrency(gstReportQuery.data?.gstPaidOnPurchases)}</strong>
                    </div>
                    <div>
                      <span>Net Payable</span>
                      <strong>{formatCurrency(gstReportQuery.data?.netGstPayable)}</strong>
                    </div>
                  </div>
                </article>

                <article className="module-card">
                  <h4>Cashflow Summary</h4>
                  <div className="kpi-grid">
                    <div>
                      <span>Cash In</span>
                      <strong>{formatCurrency(daybookTotals.cashIn)}</strong>
                    </div>
                    <div>
                      <span>Cash Out</span>
                      <strong>{formatCurrency(daybookTotals.cashOut)}</strong>
                    </div>
                    <div>
                      <span>Net Cash</span>
                      <strong>{formatCurrency(daybookTotals.netCashMovement)}</strong>
                    </div>
                  </div>
                </article>
              </div>
            </>
          )}

          {activeTab === "sales" && (
            <>
              <article className="module-card">
                <h4>Sales Invoices</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Payment</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(salesReportQuery.data?.records || []).length === 0 ? (
                        <EmptyState text="No sales found for the selected dates." colSpan={5} />
                      ) : (
                        (salesReportQuery.data?.records || []).map((row) => (
                          <tr key={row.id}>
                            <td>{row.invoiceNo || "-"}</td>
                            <td>{formatDate(row.saleDate)}</td>
                            <td>{row.customerName}</td>
                            <td>{row.paymentMethod}</td>
                            <td>{formatCurrency(row.totalAmount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="module-card">
                <h4>Top Sales Products</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(salesReportQuery.data?.topItems || []).length === 0 ? (
                        <EmptyState text="No sold products found for this range." colSpan={3} />
                      ) : (
                        (salesReportQuery.data?.topItems || []).map((item, index) => (
                          <tr key={item.itemId || `${item.itemName}-${index}`}>
                            <td>{item.itemName}</td>
                            <td>{formatNumber(item.quantity)}</td>
                            <td>{formatCurrency(item.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          )}

          {activeTab === "purchase" && (
            <article className="module-card">
              <h4>Purchase Records</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Supplier</th>
                      <th>Payment</th>
                      <th>Subtotal</th>
                      <th>Tax</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(purchaseReportQuery.data?.records || []).length === 0 ? (
                      <EmptyState text="No purchase records found." colSpan={7} />
                    ) : (
                      (purchaseReportQuery.data?.records || []).map((row) => (
                        <tr key={row.id}>
                          <td>{row.invoiceNo || "-"}</td>
                          <td>{formatDate(row.purchaseDate)}</td>
                          <td>{row.supplierName}</td>
                          <td>{row.paymentMethod}</td>
                          <td>{formatCurrency(row.subtotal)}</td>
                          <td>{formatCurrency(row.taxAmount)}</td>
                          <td>{formatCurrency(row.totalAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {activeTab === "profit" && (
            <article className="module-card">
              <h4>Profit by Product</h4>
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span>Revenue</span>
                  <strong>{formatCurrency(profitReportQuery.data?.summary?.revenue)}</strong>
                </div>
                <div>
                  <span>Cost</span>
                  <strong>{formatCurrency(profitReportQuery.data?.summary?.cost)}</strong>
                </div>
                <div>
                  <span>Gross Profit</span>
                  <strong>{formatCurrency(profitReportQuery.data?.summary?.grossProfit)}</strong>
                </div>
                <div>
                  <span>Margin %</span>
                  <strong>
                    {formatNumber(profitReportQuery.data?.summary?.grossMarginPercent)}%
                  </strong>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty Sold</th>
                      <th>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(profitReportQuery.data?.byItem || []).length === 0 ? (
                      <EmptyState text="No profit data yet." colSpan={3} />
                    ) : (
                      (profitReportQuery.data?.byItem || []).map((item, index) => (
                        <tr key={item.itemId || `${item.itemName}-${index}`}>
                          <td>{item.itemName}</td>
                          <td>{formatNumber(item.quantity)}</td>
                          <td>{formatCurrency(item.profit)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {activeTab === "stock" && (
            <>
              <article className="module-card">
                <h4>Low Stock Alerts</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Current Stock</th>
                        <th>Threshold</th>
                        <th>Stock Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockRows.length === 0 ? (
                        <EmptyState text="No low stock items found." colSpan={4} />
                      ) : (
                        lowStockRows.map((row) => (
                          <tr key={row.itemId}>
                            <td>{row.itemName}</td>
                            <td>{formatNumber(row.currentStock)}</td>
                            <td>{formatNumber(row.lowStockThreshold)}</td>
                            <td>{formatCurrency(row.stockValue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="module-card">
                <h4>Full Stock Report</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Stock</th>
                        <th>Low Threshold</th>
                        <th>Stock Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stockReportQuery.data?.records || []).length === 0 ? (
                        <EmptyState text="No stock records found." colSpan={5} />
                      ) : (
                        (stockReportQuery.data?.records || []).map((row) => (
                          <tr key={row.itemId}>
                            <td>{row.itemName}</td>
                            <td>{row.category}</td>
                            <td>{formatNumber(row.currentStock)}</td>
                            <td>{formatNumber(row.lowStockThreshold)}</td>
                            <td>{formatCurrency(row.stockValue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          )}

          {activeTab === "gst" && (
            <article className="module-card">
              <h4>GST Details</h4>
              <div className="kpi-grid">
                <div>
                  <span>GST Collected (Sales)</span>
                  <strong>{formatCurrency(gstReportQuery.data?.gstCollectedOnSales)}</strong>
                </div>
                <div>
                  <span>GST Paid (Purchases)</span>
                  <strong>{formatCurrency(gstReportQuery.data?.gstPaidOnPurchases)}</strong>
                </div>
                <div>
                  <span>Net GST Payable</span>
                  <strong>{formatCurrency(gstReportQuery.data?.netGstPayable)}</strong>
                </div>
                <div>
                  <span>Sales Taxable Value</span>
                  <strong>{formatCurrency(gstReportQuery.data?.salesTaxableValue)}</strong>
                </div>
              </div>
            </article>
          )}

          {activeTab === "daybook" && (
            <>
              <article className="module-card">
                <h4>
                  Daybook Summary ({daybookReportQuery.data?.from} to {daybookReportQuery.data?.to})
                </h4>
                <div className="kpi-grid">
                  <div>
                    <span>Sales</span>
                    <strong>{formatCurrency(daybookTotals.sales)}</strong>
                  </div>
                  <div>
                    <span>Purchases</span>
                    <strong>{formatCurrency(daybookTotals.purchases)}</strong>
                  </div>
                  <div>
                    <span>Bank Movement</span>
                    <strong>{formatCurrency(daybookTotals.bankDeposit)}</strong>
                  </div>
                  <div>
                    <span>Cheque</span>
                    <strong>{formatCurrency(daybookTotals.cheque)}</strong>
                  </div>
                  <div>
                    <span>Expenses</span>
                    <strong>{formatCurrency(daybookTotals.expenses)}</strong>
                  </div>
                  <div>
                    <span>Net Cash</span>
                    <strong>{formatCurrency(daybookTotals.netCashMovement)}</strong>
                  </div>
                </div>
              </article>

              <article className="module-card">
                <h4>Daybook Records</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Sales</th>
                        <th>Purchases</th>
                        <th>Cash In</th>
                        <th>Cash Out</th>
                        <th>Expenses</th>
                        <th>Bank Deposit</th>
                        <th>Cheque</th>
                        <th>Net Cash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(daybookReportQuery.data?.records || []).length === 0 ? (
                        <EmptyState text="No daybook records found." colSpan={9} />
                      ) : (
                        (daybookReportQuery.data?.records || []).map((row) => (
                          <tr key={row.date}>
                            <td>{formatDate(row.date)}</td>
                            <td>{formatCurrency(row.sales)}</td>
                            <td>{formatCurrency(row.purchases)}</td>
                            <td>{formatCurrency(row.cashIn)}</td>
                            <td>{formatCurrency(row.cashOut)}</td>
                            <td>{formatCurrency(row.expenses)}</td>
                            <td>{formatCurrency(row.bankDeposit)}</td>
                            <td>{formatCurrency(row.cheque)}</td>
                            <td>{formatCurrency(row.netCashMovement)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default ReportsPage;
