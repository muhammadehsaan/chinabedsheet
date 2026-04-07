import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Edit, History, Landmark, Search } from "lucide-react";

import { extractApiError } from "../api/client";
import { accountsApi } from "../api/modules";
import { formatCurrency, formatDate, formatNumber } from "../utils/format";

const initialBankForm = {
  bankName: "",
  accountTitle: "",
  accountNumber: "",
  openingBalance: "",
  openingDate: "",
  branchName: "",
  accountType: "CURRENT",
  iban: "",
  status: "Active",
  notes: "",
};

const initialTransactionForm = {
  type: "DEPOSIT",
  bankAccountId: "",
  targetBankAccountId: "",
  amount: "",
  entryDate: new Date().toISOString().slice(0, 10),
  reference: "",
  notes: "",
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

function AccountsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [bankForm, setBankForm] = useState(initialBankForm);
  const [editingBankId, setEditingBankId] = useState(null);
  const [activeBankId, setActiveBankId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [transactionForm, setTransactionForm] = useState(initialTransactionForm);

  const banksQuery = useQuery({
    queryKey: ["accounts", "banks"],
    queryFn: accountsApi.listBanks,
  });
  const bankHistoryQuery = useQuery({
    queryKey: ["accounts", "banks", "history", activeBankId],
    queryFn: () => accountsApi.bankHistory(activeBankId),
    enabled: Boolean(activeBankId),
  });

  const saveBankMutation = useMutation({
    mutationFn: (payload) =>
      editingBankId
        ? accountsApi.updateBank(editingBankId, payload)
        : accountsApi.createBank(payload),
    onSuccess: async () => {
      setFeedback({
        type: "success",
        message: editingBankId ? "Bank account updated successfully." : "Bank account registered successfully.",
      });
      setBankForm(initialBankForm);
      setEditingBankId(null);
      await queryClient.invalidateQueries({ queryKey: ["accounts", "banks"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: extractApiError(error, "Unable to save bank account.") });
    },
  });
  const transactionMutation = useMutation({
    mutationFn: accountsApi.createBankTransaction,
    onSuccess: async (response) => {
      const focusBankId =
        response?.type === "TRANSFER"
          ? Number(response?.sourceBank?.id || transactionForm.bankAccountId || 0)
          : Number(response?.sourceBank?.id || transactionForm.bankAccountId || 0);
      setActiveBankId(focusBankId || null);
      setTransactionForm({
        ...initialTransactionForm,
        bankAccountId: focusBankId ? String(focusBankId) : "",
      });
      setFeedback({ type: "success", message: "Bank transaction saved successfully." });
      await queryClient.invalidateQueries({ queryKey: ["accounts", "banks"] });
      if (focusBankId) {
        await queryClient.invalidateQueries({ queryKey: ["accounts", "banks", "history", focusBankId] });
      }
      if (response?.type === "TRANSFER" && response?.targetBank?.id) {
        await queryClient.invalidateQueries({
          queryKey: ["accounts", "banks", "history", Number(response.targetBank.id)],
        });
      }
    },
    onError: (error) => {
      setFeedback({ type: "error", message: extractApiError(error, "Unable to save bank transaction.") });
    },
  });

  const filteredBanks = useMemo(() => {
    const keyword = normalizeText(searchTerm);
    if (!keyword) {
      return banksQuery.data || [];
    }

    return (banksQuery.data || []).filter((bank) => {
      const searchableText = [
        bank.bankName,
        bank.accountTitle,
        bank.accountNumber,
        bank.branchName,
        bank.accountType,
        bank.iban,
        bank.status,
      ]
        .map((value) => normalizeText(value))
        .join(" ");

      return searchableText.includes(keyword);
    });
  }, [banksQuery.data, searchTerm]);

  const summary = useMemo(() => {
    let openingBalanceTotal = 0;
    let currentBalanceTotal = 0;
    let activeCount = 0;
    const banks = new Set();

    filteredBanks.forEach((bank) => {
      openingBalanceTotal += Number(bank.openingBalance || 0);
      currentBalanceTotal += Number(bank.currentBalance || 0);
      if (normalizeText(bank.status) === "active") {
        activeCount += 1;
      }
      if (bank.bankName) {
        banks.add(normalizeText(bank.bankName));
      }
    });

    return {
      totalAccounts: filteredBanks.length,
      totalBanks: banks.size,
      activeCount,
      openingBalanceTotal,
      currentBalanceTotal,
    };
  }, [filteredBanks]);

  const handleChange = (field, value) => {
    setBankForm((prev) => ({ ...prev, [field]: value }));
  };
  const handleTransactionChange = (field, value) => {
    setTransactionForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "type" && value !== "TRANSFER" ? { targetBankAccountId: "" } : {}),
    }));
  };

  const handleSubmit = () => {
    if (saveBankMutation.isPending) {
      return;
    }

    if (!String(bankForm.bankName || "").trim()) {
      setFeedback({ type: "error", message: "Bank name is required." });
      return;
    }
    if (!String(bankForm.accountTitle || "").trim()) {
      setFeedback({ type: "error", message: "Account title is required." });
      return;
    }
    if (!String(bankForm.accountNumber || "").trim()) {
      setFeedback({ type: "error", message: "Account number is required." });
      return;
    }

    setFeedback(null);
    saveBankMutation.mutate({
      bankName: bankForm.bankName.trim(),
      accountTitle: bankForm.accountTitle.trim(),
      accountNumber: bankForm.accountNumber.trim(),
      openingBalance: Number(bankForm.openingBalance || 0),
      openingDate: bankForm.openingDate || null,
      branchName: bankForm.branchName.trim() || null,
      accountType: bankForm.accountType,
      iban: bankForm.iban.trim() || null,
      status: bankForm.status,
      notes: bankForm.notes.trim() || null,
    });
  };

  const handleEdit = (bank) => {
    setEditingBankId(bank.id);
    setActiveBankId(bank.id);
    setFeedback(null);
    setBankForm({
      bankName: bank.bankName || "",
      accountTitle: bank.accountTitle || "",
      accountNumber: bank.accountNumber || "",
      openingBalance: String(bank.openingBalance ?? ""),
      openingDate: bank.openingDate ? String(bank.openingDate).slice(0, 10) : "",
      branchName: bank.branchName || "",
      accountType: bank.accountType || "CURRENT",
      iban: bank.iban || "",
      status: bank.status || "Active",
      notes: bank.notes || "",
    });
  };

  const activeBank = bankHistoryQuery.data?.bank || null;
  const historySummary = bankHistoryQuery.data?.summary || null;
  const historyEntries = bankHistoryQuery.data?.entries || [];
  const selectedTransactionBank = useMemo(
    () =>
      (banksQuery.data || []).find((bank) => Number(bank.id) === Number(transactionForm.bankAccountId || 0)) || null,
    [banksQuery.data, transactionForm.bankAccountId],
  );
  const availableTargetBanks = useMemo(
    () =>
      (banksQuery.data || []).filter(
        (bank) =>
          normalizeText(bank.status) === "active" &&
          Number(bank.id) !== Number(transactionForm.bankAccountId || 0),
      ),
    [banksQuery.data, transactionForm.bankAccountId],
  );

  const handleReset = () => {
    setEditingBankId(null);
    setBankForm(initialBankForm);
    setFeedback(null);
  };
  const handleTransactionReset = () => {
    setTransactionForm(initialTransactionForm);
    setFeedback(null);
  };
  const handleTransactionSubmit = () => {
    if (transactionMutation.isPending) {
      return;
    }
    if (!transactionForm.bankAccountId) {
      setFeedback({ type: "error", message: "Please select a bank account." });
      return;
    }
    if (transactionForm.type === "TRANSFER" && !transactionForm.targetBankAccountId) {
      setFeedback({ type: "error", message: "Please select destination bank." });
      return;
    }
    if (Number(transactionForm.amount || 0) <= 0) {
      setFeedback({ type: "error", message: "Amount must be greater than zero." });
      return;
    }
    if (
      transactionForm.type === "TRANSFER" &&
      Number(transactionForm.bankAccountId || 0) === Number(transactionForm.targetBankAccountId || 0)
    ) {
      setFeedback({ type: "error", message: "Source and destination bank must be different." });
      return;
    }
    setFeedback(null);
    transactionMutation.mutate({
      type: transactionForm.type,
      bankAccountId: Number(transactionForm.bankAccountId),
      targetBankAccountId:
        transactionForm.type === "TRANSFER" ? Number(transactionForm.targetBankAccountId || 0) : undefined,
      amount: Number(transactionForm.amount || 0),
      entryDate: transactionForm.entryDate || null,
      reference: transactionForm.reference.trim() || null,
      notes: transactionForm.notes.trim() || null,
    });
  };
  const transactionTypeMeta = {
    DEPOSIT: {
      title: "Deposit",
      hint: "Adds money into selected bank account.",
      icon: ArrowDownLeft,
    },
    WITHDRAW: {
      title: "Withdraw",
      hint: "Removes money from selected bank account.",
      icon: ArrowUpRight,
    },
    TRANSFER: {
      title: "Bank Transfer",
      hint: "Moves amount from one bank account to another.",
      icon: ArrowLeftRight,
    },
  };
  const ActiveTransactionIcon = transactionTypeMeta[transactionForm.type]?.icon || ArrowDownLeft;

  return (
    <section className="module-page accounts-module-page">
      <header className="module-header">
        <div>
          <h3>Financials & Accounts</h3>
          <span className="module-subtitle">
            Register bank accounts with opening balance and key banking details
          </span>
        </div>
      </header>

      <div className="kpi-grid accounts-kpi-grid">
        <div>
          <span>Total Accounts</span>
          <strong>{formatNumber(summary.totalAccounts)}</strong>
        </div>
        <div>
          <span>Total Banks</span>
          <strong>{formatNumber(summary.totalBanks)}</strong>
        </div>
        <div>
          <span>Active Accounts</span>
          <strong>{formatNumber(summary.activeCount)}</strong>
        </div>
        <div>
          <span>Current Balance Total</span>
          <strong>{formatCurrency(summary.currentBalanceTotal)}</strong>
        </div>
      </div>

      <div className="summary-grid two-wide accounts-layout">
        <div className="accounts-form-stack">
          <form
            className="module-card form-card accounts-form-card"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <div className="line-head">
              <h4>{editingBankId ? "Edit Bank Account" : "Register Bank Account"}</h4>
            </div>
            <div className="form-grid two-wide">
              <label>
                Bank Name
                <input
                  type="text"
                  value={bankForm.bankName}
                  onChange={(event) => handleChange("bankName", event.target.value)}
                  placeholder="Meezan, MCB, HBL..."
                />
              </label>
              <label>
                Account Title
                <input
                  type="text"
                  value={bankForm.accountTitle}
                  onChange={(event) => handleChange("accountTitle", event.target.value)}
                  placeholder="Business / owner name"
                />
              </label>
              <label>
                Account Number
                <input
                  type="text"
                  value={bankForm.accountNumber}
                  onChange={(event) => handleChange("accountNumber", event.target.value)}
                  placeholder="Account number"
                />
              </label>
              <label>
                Opening Balance
                <input
                  type="number"
                  value={bankForm.openingBalance}
                  onChange={(event) => handleChange("openingBalance", event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Opening Date
                <input
                  type="date"
                  value={bankForm.openingDate}
                  onChange={(event) => handleChange("openingDate", event.target.value)}
                />
              </label>
              <label>
                Branch Name
                <input
                  type="text"
                  value={bankForm.branchName}
                  onChange={(event) => handleChange("branchName", event.target.value)}
                  placeholder="Branch / city"
                />
              </label>
              <label>
                Account Type
                <select
                  value={bankForm.accountType}
                  onChange={(event) => handleChange("accountType", event.target.value)}
                >
                  <option value="CURRENT">Current</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="BUSINESS">Business</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label>
                Status
                <select value={bankForm.status} onChange={(event) => handleChange("status", event.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Closed">Closed</option>
                </select>
              </label>
              <label className="form-grid-span-2">
                IBAN
                <input
                  type="text"
                  value={bankForm.iban}
                  onChange={(event) => handleChange("iban", event.target.value)}
                  placeholder="Optional IBAN"
                />
              </label>
              <label className="form-grid-span-2">
                Notes
                <input
                  type="text"
                  value={bankForm.notes}
                  onChange={(event) => handleChange("notes", event.target.value)}
                  placeholder="Any branch, manager, or account notes"
                />
              </label>
            </div>
            {feedback ? <div className="hint-line">{feedback.message}</div> : null}
            <div className="quick-actions">
              <button type="submit" disabled={saveBankMutation.isPending}>
                {saveBankMutation.isPending
                  ? editingBankId
                    ? "Updating..."
                    : "Saving..."
                  : editingBankId
                    ? "Update Bank"
                    : "Register Bank"}
              </button>
              <button type="button" className="small-btn small-btn--ghost" onClick={handleReset}>
                Reset
              </button>
            </div>
          </form>

          <form
            className="module-card form-card accounts-form-card"
            onSubmit={(event) => {
              event.preventDefault();
              handleTransactionSubmit();
            }}
          >
            <div className="accounts-transaction-head">
              <div>
                <h4>Bank Transactions</h4>
                <div className="hint-line">{transactionTypeMeta[transactionForm.type]?.hint}</div>
              </div>
              <div className={`accounts-transaction-pill accounts-transaction-pill--${normalizeText(transactionForm.type)}`}>
                <ActiveTransactionIcon size={14} />
                {transactionTypeMeta[transactionForm.type]?.title}
              </div>
            </div>
            <div className="accounts-transaction-switches">
              {Object.entries(transactionTypeMeta).map(([key, item]) => {
                const Icon = item.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`small-btn small-btn--ghost${transactionForm.type === key ? " is-active" : ""}`}
                    onClick={() => handleTransactionChange("type", key)}
                  >
                    <Icon size={13} /> {item.title}
                  </button>
                );
              })}
            </div>
            <div className="form-grid two-wide">
              <label>
                {transactionForm.type === "TRANSFER" ? "From Bank" : "Bank Account"}
                <select
                  value={transactionForm.bankAccountId}
                  onChange={(event) => handleTransactionChange("bankAccountId", event.target.value)}
                >
                  <option value="">Select bank</option>
                  {(banksQuery.data || [])
                    .filter((bank) => normalizeText(bank.status) === "active")
                    .map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.bankName} - {bank.accountNumber}
                      </option>
                    ))}
                </select>
              </label>
              {transactionForm.type === "TRANSFER" ? (
                <label>
                  To Bank
                  <select
                    value={transactionForm.targetBankAccountId}
                    onChange={(event) => handleTransactionChange("targetBankAccountId", event.target.value)}
                  >
                    <option value="">Select destination bank</option>
                    {availableTargetBanks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.bankName} - {bank.accountNumber}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Available Balance
                  <input
                    type="text"
                    readOnly
                    value={selectedTransactionBank ? formatCurrency(selectedTransactionBank.currentBalance || 0) : "-"}
                  />
                </label>
              )}
              <label>
                Amount
                <input
                  type="number"
                  value={transactionForm.amount}
                  onChange={(event) => handleTransactionChange("amount", event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Transaction Date
                <input
                  type="date"
                  value={transactionForm.entryDate}
                  onChange={(event) => handleTransactionChange("entryDate", event.target.value)}
                />
              </label>
              <label>
                Reference
                <input
                  type="text"
                  value={transactionForm.reference}
                  onChange={(event) => handleTransactionChange("reference", event.target.value)}
                  placeholder="Voucher / slip / note ref"
                />
              </label>
              <label>
                Notes
                <input
                  type="text"
                  value={transactionForm.notes}
                  onChange={(event) => handleTransactionChange("notes", event.target.value)}
                  placeholder="Reason / remarks"
                />
              </label>
            </div>
            <div className="quick-actions">
              <button type="submit" disabled={transactionMutation.isPending}>
                {transactionMutation.isPending ? "Saving..." : transactionTypeMeta[transactionForm.type]?.title}
              </button>
              <button type="button" className="small-btn small-btn--ghost" onClick={handleTransactionReset}>
                Clear
              </button>
            </div>
          </form>
        </div>

        <article className="module-card accounts-list-card">
          <div className="line-head accounts-list-head">
            <div>
              <h4>Registered Banks</h4>
              <div className="hint-line">User yahan se bank accounts dekh, edit aur statement open kar sakta hai.</div>
            </div>
            <div className="pos-item-search accounts-search">
              <Search size={15} className="pos-search-icon" />
              <input
                type="text"
                className="pos-input pos-input--search"
                placeholder="Search bank, title, account no..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Account Title</th>
                  <th>Account #</th>
                  <th>Type</th>
                  <th>Opening Balance</th>
                  <th>Current Balance</th>
                  <th>Opening Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {banksQuery.isLoading ? (
                  <tr>
                    <td colSpan={9} className="hint-line" style={{ padding: "12px" }}>
                      Loading bank accounts...
                    </td>
                  </tr>
                ) : banksQuery.isError ? (
                  <tr>
                    <td colSpan={9} className="hint-line" style={{ padding: "12px" }}>
                      Unable to load bank accounts.
                    </td>
                  </tr>
                ) : filteredBanks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="hint-line" style={{ padding: "12px" }}>
                      No bank account registered yet.
                    </td>
                  </tr>
                ) : (
                  filteredBanks.map((bank) => (
                    <tr key={bank.id}>
                      <td>
                        <div className="accounts-bank-cell">
                          <strong>{bank.bankName}</strong>
                          <span>{bank.branchName || "-"}</span>
                        </div>
                      </td>
                      <td>{bank.accountTitle || "-"}</td>
                      <td>{bank.accountNumber || "-"}</td>
                      <td>{bank.accountType || "-"}</td>
                      <td>{formatCurrency(bank.openingBalance || 0)}</td>
                      <td>{formatCurrency(bank.currentBalance || 0)}</td>
                      <td>{formatDate(bank.openingDate)}</td>
                      <td>
                        <span
                          className={`status-pill status-pill--${
                            normalizeText(bank.status) === "active"
                              ? "active"
                              : normalizeText(bank.status) === "inactive"
                                ? "inactive"
                                : "hold"
                          }`}
                        >
                          {bank.status || "-"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="pos-edit-btn"
                            title="Edit Bank"
                            onClick={() => handleEdit(bank)}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            type="button"
                            className={`small-btn small-btn--ghost${activeBankId === bank.id ? " is-active" : ""}`}
                            onClick={() => setActiveBankId(bank.id)}
                          >
                            <History size={14} /> Statement
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="accounts-extra-list">
            {filteredBanks.slice(0, 3).map((bank) => (
              <div key={`card-${bank.id}`} className="accounts-bank-card">
                <div className="accounts-bank-card__icon">
                  <Landmark size={16} />
                </div>
                <div>
                  <strong>{bank.bankName}</strong>
                  <span>{bank.accountTitle}</span>
                </div>
                <div>
                  <strong>{formatCurrency(bank.currentBalance || bank.openingBalance || 0)}</strong>
                  <span>{bank.accountNumber}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="module-card">
          <div className="line-head">
            <h4>Bank Statement</h4>
            <div className="hint-line">
              {activeBank
                ? `${activeBank.bankName} - ${activeBank.accountNumber}`
                : "Select any bank to view statement history."}
            </div>
          </div>

          {activeBank && historySummary ? (
            <>
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span>Opening Balance</span>
                  <strong>{formatCurrency(historySummary.openingBalance || 0)}</strong>
                </div>
                <div>
                  <span>Total In</span>
                  <strong>{formatCurrency(historySummary.totalIn || 0)}</strong>
                </div>
                <div>
                  <span>Total Out</span>
                  <strong>{formatCurrency(historySummary.totalOut || 0)}</strong>
                </div>
                <div>
                  <span>Current Balance</span>
                  <strong>{formatCurrency(historySummary.currentBalance || 0)}</strong>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Ref #</th>
                      <th>Module</th>
                      <th>Description</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankHistoryQuery.isLoading ? (
                      <tr>
                        <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                          Loading statement...
                        </td>
                      </tr>
                    ) : bankHistoryQuery.isError ? (
                      <tr>
                        <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                          Unable to load bank statement.
                        </td>
                      </tr>
                    ) : historyEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                          No statement entries found.
                        </td>
                      </tr>
                    ) : (
                      historyEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDate(entry.date)}</td>
                          <td>{entry.refNo || "-"}</td>
                          <td>{entry.module || "-"}</td>
                          <td>{entry.description || "-"}</td>
                          <td>{entry.inAmount ? formatCurrency(entry.inAmount) : "-"}</td>
                          <td>{entry.outAmount ? formatCurrency(entry.outAmount) : "-"}</td>
                          <td>{formatCurrency(entry.balance || 0)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="hint-line" style={{ paddingTop: 8 }}>
              Registered bank select karte hi statement yahan show ho jayega.
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

export default AccountsPage;
