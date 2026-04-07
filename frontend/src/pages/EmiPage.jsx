import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Edit, Plus, Search } from "lucide-react";

import { salesApi } from "../api/modules";
import { formatCurrency, formatDateTime, formatNumber } from "../utils/format";
import { POSPanel } from "./SalesPage";

const EMI_FORM_DRAFT_KEY = "emi-pos-draft-v1";
const EMI_SALE_TYPES = [{ key: "emi", label: "EMI Sale" }];

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const isEmiPaymentMethod = (value) => normalizeText(value).includes("emi");

const toLocalDateValue = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function EmiPage() {
  const [emiSearchTerm, setEmiSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formSale, setFormSale] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [forceFreshForm, setForceFreshForm] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  const salesListQuery = useQuery({
    queryKey: ["sales", "list"],
    queryFn: salesApi.listSales,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isFormOpen) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFormOpen]);

  const emiInvoices = useMemo(
    () => (salesListQuery.data || []).filter((sale) => isEmiPaymentMethod(sale.paymentMethod)),
    [salesListQuery.data],
  );

  const filteredEmiInvoices = useMemo(() => {
    const keyword = normalizeText(emiSearchTerm);
    return emiInvoices.filter((sale) => {
      const saleDateValue = toLocalDateValue(sale.saleDate);
      if (dateFrom && saleDateValue && saleDateValue < dateFrom) {
        return false;
      }
      if (dateTo && saleDateValue && saleDateValue > dateTo) {
        return false;
      }
      if (!keyword) {
        return true;
      }

      const invoiceNo = sale.invoiceNo || `SA-${sale.id}`;
      const searchableText = [
        invoiceNo,
        sale.customer?.name,
        sale.customer?.phone,
        sale.customer?.address,
        sale.paymentMethod,
        sale.notes,
        formatDateTime(sale.saleDate),
      ]
        .map((value) => normalizeText(value))
        .join(" ");

      return searchableText.includes(keyword);
    });
  }, [dateFrom, dateTo, emiInvoices, emiSearchTerm]);

  const summary = useMemo(() => {
    const customers = new Set();
    let totalAmount = 0;
    let totalItems = 0;

    filteredEmiInvoices.forEach((sale) => {
      totalAmount += Number(sale.totalAmount || 0);
      totalItems += Number(sale.lines?.length || 0);
      if (sale.customer?.name) {
        customers.add(String(sale.customer.name).trim().toLowerCase());
      }
    });

    return {
      invoices: filteredEmiInvoices.length,
      totalAmount,
      totalItems,
      customers: customers.size,
    };
  }, [filteredEmiInvoices]);

  const handleOpenNewEmi = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(EMI_FORM_DRAFT_KEY);
    }
    setFormSale(null);
    setForceFreshForm(true);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const handleOpenEditEmi = (sale) => {
    setFormSale(sale);
    setForceFreshForm(false);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setFormSale(null);
    setForceFreshForm(false);
  };

  return (
    <section className="module-page emi-module-page">
      <header className="module-header">
        <div>
          <h3>EMI & Installments</h3>
          <span className="module-subtitle">
            EMI invoices aur installments yahan show hongi, aur Add EMI se popup form open hoga
          </span>
        </div>
        <div className="emi-module-page__clock">
          <strong>{clock.toLocaleDateString()}</strong>
          <span>{clock.toLocaleTimeString()}</span>
        </div>
      </header>

      <article className="module-card emi-toolbar-card">
        <div className="line-head emi-toolbar">
          <div className="pos-item-search emi-toolbar__search">
            <Search size={16} className="pos-search-icon" />
            <input
              type="text"
              className="pos-input pos-input--search"
              placeholder="Search invoice, customer, phone, payment..."
              value={emiSearchTerm}
              onChange={(event) => setEmiSearchTerm(event.target.value)}
            />
          </div>
          <div className="emi-toolbar__filters">
            <label>
              From Date
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              To Date
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button
              type="button"
              className="small-btn small-btn--ghost"
              onClick={() => {
                setEmiSearchTerm("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Reset
            </button>
            <button type="button" className="small-btn" onClick={handleOpenNewEmi}>
              <Plus size={14} /> Add EMI
            </button>
          </div>
        </div>
      </article>

      <div className="kpi-grid emi-kpi-grid">
        <div>
          <span>EMI Invoices</span>
          <strong>{formatNumber(summary.invoices)}</strong>
        </div>
        <div>
          <span>Total EMI Value</span>
          <strong>{formatCurrency(summary.totalAmount)}</strong>
        </div>
        <div>
          <span>Total Items</span>
          <strong>{formatNumber(summary.totalItems)}</strong>
        </div>
        <div>
          <span>Customers</span>
          <strong>{formatNumber(summary.customers)}</strong>
        </div>
      </div>

      <article className="module-card emi-list-card">
        <div className="line-head sales-invoice-head">
          <div>
            <h4>EMI Invoice List</h4>
            <p className="inventory-modal__sub">Sirf EMI module ki invoices aur installments yahan show ho rahi hain.</p>
          </div>
        </div>
        <div className="table-wrap emi-list-table">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {salesListQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="hint-line" style={{ padding: "12px" }}>
                    Loading EMI invoices...
                  </td>
                </tr>
              ) : salesListQuery.isError ? (
                <tr>
                  <td colSpan={8} className="hint-line" style={{ padding: "12px" }}>
                    Unable to load EMI invoices.
                  </td>
                </tr>
              ) : filteredEmiInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="hint-line" style={{ padding: "12px" }}>
                    No EMI invoice found for the selected filters.
                  </td>
                </tr>
              ) : (
                filteredEmiInvoices.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.invoiceNo || `SA-${sale.id}`}</td>
                    <td>{formatDateTime(sale.saleDate)}</td>
                    <td>{sale.customer?.name || "-"}</td>
                    <td>{sale.customer?.phone || "-"}</td>
                    <td>{formatNumber(sale.lines?.length || 0)}</td>
                    <td>{formatCurrency(sale.totalAmount || 0)}</td>
                    <td>{sale.paymentMethod || "EMI"}</td>
                    <td>
                      <button
                        type="button"
                        className="pos-edit-btn"
                        title="Edit EMI"
                        onClick={() => handleOpenEditEmi(sale)}
                      >
                        <Edit size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {isFormOpen && (
        <div className="inventory-modal-backdrop" onClick={handleCloseForm}>
          <div
            className="inventory-modal emi-entry-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal__header">
              <div>
                <h4>{formSale ? "Edit EMI" : "Add EMI"}</h4>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={handleCloseForm}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="inventory-modal__body emi-entry-modal__body">
              <POSPanel
                key={formSale ? `emi-edit-${formSale.id}-${formKey}` : `emi-new-${formKey}`}
                editingSale={formSale}
                onSaved={handleCloseForm}
                forceFresh={forceFreshForm}
                availableSaleTypes={EMI_SALE_TYPES}
                initialSaleType="emi"
                draftStorageKey={EMI_FORM_DRAFT_KEY}
                lockSaleType
                autoInvoicePrefix="EMI"
                hideBarcodeField
                editableMarketPrice
                expandItemNameColumn
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default EmiPage;
