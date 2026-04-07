import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import ModuleTabs from "../components/ModuleTabs";
import { extractApiError } from "../api/client";
import { partiesApi } from "../api/modules";
import { formatCurrency, formatDate, formatNumber } from "../utils/format";

const initialPartyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  type: "BOTH",
};

function PartiesPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [feedback, setFeedback] = useState(null);
  const [activeTab, setActiveTab] = useState("directory");
  const [partyForm, setPartyForm] = useState(initialPartyForm);
  const [search, setSearch] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState(null);
  const [pendingSearchTarget, setPendingSearchTarget] = useState(null);
  const [highlightedPartyId, setHighlightedPartyId] = useState(null);
  const partyRowRefs = useRef(new Map());
  const highlightResetRef = useRef(null);
  const lastHandledSearchRequestRef = useRef("");
  const searchTarget = location.state?.searchTarget || null;

  const partiesQuery = useQuery({
    queryKey: ["parties", "list", search],
    queryFn: () =>
      partiesApi.listParties({
        ...(search ? { search } : {}),
      }),
  });

  const supplierParties = useMemo(
    () =>
      (partiesQuery.data || []).filter((party) => party.type === "SUPPLIER" || party.type === "BOTH"),
    [partiesQuery.data],
  );

  const customerParties = useMemo(
    () =>
      (partiesQuery.data || []).filter((party) => party.type === "CUSTOMER" || party.type === "BOTH"),
    [partiesQuery.data],
  );

  const selectedParty = useMemo(
    () => (partiesQuery.data || []).find((party) => party.id === selectedPartyId) || null,
    [partiesQuery.data, selectedPartyId],
  );

  useEffect(() => {
    if (!selectedPartyId && partiesQuery.data?.length) {
      setSelectedPartyId(partiesQuery.data[0].id);
    }

    if (selectedPartyId && partiesQuery.data?.length) {
      const stillExists = partiesQuery.data.some((party) => party.id === selectedPartyId);
      if (!stillExists) {
        setSelectedPartyId(partiesQuery.data[0].id);
      }
    }
  }, [partiesQuery.data, selectedPartyId]);

  const partyHistoryQuery = useQuery({
    queryKey: ["parties", "history", selectedPartyId],
    queryFn: () => partiesApi.partyHistory(selectedPartyId),
    enabled: Boolean(selectedPartyId),
  });

  const partyLedgerQuery = useQuery({
    queryKey: ["parties", "ledger", selectedPartyId],
    queryFn: () => partiesApi.partyLedger(selectedPartyId),
    enabled: Boolean(selectedPartyId),
  });

  const createPartyMutation = useMutation({
    mutationFn: partiesApi.createParty,
    onSuccess: async () => {
      setFeedback({ type: "success", message: "Party created successfully." });
      setPartyForm(initialPartyForm);
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (error) =>
      setFeedback({ type: "error", message: extractApiError(error, "Party creation failed.") }),
  });

  const focusPartyRow = (partyId) => {
    const row = partyRowRefs.current.get(partyId);
    if (!row) {
      return false;
    }

    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedPartyId(partyId);
    window.clearTimeout(highlightResetRef.current);
    highlightResetRef.current = window.setTimeout(() => setHighlightedPartyId(null), 2200);
    return true;
  };

  useEffect(() => {
    return () => window.clearTimeout(highlightResetRef.current);
  }, []);

  useEffect(() => {
    if (!searchTarget || searchTarget.module !== "parties") {
      return;
    }

    if (lastHandledSearchRequestRef.current === searchTarget.requestId) {
      return;
    }

    lastHandledSearchRequestRef.current = searchTarget.requestId;
    setSearch("");
    setSelectedPartyId(searchTarget.entityId);
    setActiveTab(searchTarget.focusTab || "directory");
    setPendingSearchTarget(searchTarget);
  }, [searchTarget]);

  const handleCreateParty = (event) => {
    event.preventDefault();
    setFeedback(null);
    createPartyMutation.mutate({
      name: partyForm.name.trim(),
      phone: partyForm.phone.trim() || undefined,
      email: partyForm.email.trim() || undefined,
      address: partyForm.address.trim() || undefined,
      type: partyForm.type,
    });
  };

  useEffect(() => {
    if (!pendingSearchTarget || pendingSearchTarget.module !== "parties") {
      return;
    }

    const focusTab = pendingSearchTarget.focusTab || "directory";
    if (activeTab !== focusTab || !partiesQuery.data) {
      return;
    }

    const matchedParty = (partiesQuery.data || []).find(
      (party) => party.id === pendingSearchTarget.entityId,
    );
    if (!matchedParty) {
      if (partiesQuery.isFetching) {
        return;
      }
      setFeedback({
        type: "error",
        message: `Party ${pendingSearchTarget.label || ""} not found.`,
      });
      setPendingSearchTarget(null);
      return;
    }

    setSelectedPartyId(matchedParty.id);

    const frameId = window.requestAnimationFrame(() => {
      if (focusPartyRow(matchedParty.id)) {
        setPendingSearchTarget(null);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, partiesQuery.data, partiesQuery.isFetching, pendingSearchTarget]);

  const renderPartyList = (title, rows) => (
    <article className="module-card">
      <div className="line-head">
        <h4>{title}</h4>
        <span>{formatNumber(rows.length)} records</span>
      </div>
      <div className="party-list">
        {rows.map((party) => (
          <button
            type="button"
            key={party.id}
            ref={(node) => {
              if (node) {
                partyRowRefs.current.set(party.id, node);
                return;
              }
              partyRowRefs.current.delete(party.id);
            }}
            className={`${selectedPartyId === party.id ? "party-row active" : "party-row"}${
              highlightedPartyId === party.id ? " search-focus-row" : ""
            }`}
            onClick={() => setSelectedPartyId(party.id)}
          >
            <div>
              <strong>{party.name}</strong>
              <small>{party.type}</small>
            </div>
            <div className="party-meta">
              <span>P:{party.totalPurchases}</span>
              <span>S:{party.totalSales}</span>
              <span>{formatCurrency(party.ledgerBalance)}</span>
            </div>
          </button>
        ))}
      </div>
    </article>
  );

  return (
    <section className="module-page">
      <header className="module-header">
        <h3>Parties Module</h3>
        <span className="module-subtitle">Customers + Suppliers with history and ledger</span>
      </header>

      {feedback && (
        <div className={feedback.type === "success" ? "alert alert--success" : "alert alert--error"}>
          {feedback.message}
        </div>
      )}

      <ModuleTabs
        tabs={[
          { value: "directory", label: "Directory" },
          { value: "suppliers", label: "Suppliers" },
          { value: "customers", label: "Customers" },
          { value: "create", label: "Create Party" },
          { value: "purchaseHistory", label: "Purchase History" },
          { value: "saleHistory", label: "Sale History" },
          { value: "ledger", label: "Ledger View" },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab !== "create" && (
        <article className="module-card">
          <div className="line-head">
            <h4>Party Search</h4>
            {selectedParty && <span>Selected: {selectedParty.name}</span>}
          </div>
          <div className="filter-row">
            <input
              placeholder="Search by name or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </article>
      )}

      {activeTab === "create" && (
        <form className="module-card form-card" onSubmit={handleCreateParty}>
          <h4>Create Party</h4>
          <div className="two-col">
            <label>
              Name
              <input
                value={partyForm.name}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Type
              <select
                value={partyForm.type}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="SUPPLIER">Supplier</option>
                <option value="CUSTOMER">Customer</option>
                <option value="BOTH">Both</option>
              </select>
            </label>
          </div>
          <div className="two-col">
            <label>
              Phone
              <input
                value={partyForm.phone}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={partyForm.email}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
          </div>
          <label>
            Address
            <input
              value={partyForm.address}
              onChange={(event) => setPartyForm((prev) => ({ ...prev, address: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={createPartyMutation.isPending}>
            {createPartyMutation.isPending ? "Saving..." : "Save Party"}
          </button>
        </form>
      )}

      {activeTab === "directory" && renderPartyList("Party Directory", partiesQuery.data || [])}
      {activeTab === "suppliers" && renderPartyList("Suppliers", supplierParties)}
      {activeTab === "customers" && renderPartyList("Customers", customerParties)}

      {!selectedPartyId &&
        (activeTab === "purchaseHistory" || activeTab === "saleHistory" || activeTab === "ledger") && (
          <article className="module-card">Select a party first from Directory/Suppliers/Customers.</article>
        )}

      {selectedPartyId && activeTab === "purchaseHistory" && (
        <article className="module-card">
          <h4>{selectedParty?.name || "Selected Party"} Purchase History</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Lines</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(partyHistoryQuery.data?.purchases || []).map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{purchase.invoiceNo}</td>
                    <td>{formatDate(purchase.purchaseDate)}</td>
                    <td>{formatNumber(purchase.lines?.length || 0)}</td>
                    <td>{formatCurrency(purchase.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {selectedPartyId && activeTab === "saleHistory" && (
        <article className="module-card">
          <h4>{selectedParty?.name || "Selected Party"} Sale History</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Lines</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(partyHistoryQuery.data?.sales || []).map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.invoiceNo}</td>
                    <td>{formatDate(sale.saleDate)}</td>
                    <td>{formatNumber(sale.lines?.length || 0)}</td>
                    <td>{formatCurrency(sale.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {selectedPartyId && activeTab === "ledger" && (
        <article className="module-card">
          <div className="line-head">
            <h4>{selectedParty?.name || "Selected Party"} Ledger</h4>
            <span>Balance: {formatCurrency(partyLedgerQuery.data?.balance)}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(partyLedgerQuery.data?.entries || []).map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.entryDate)}</td>
                    <td>{entry.sourceType}</td>
                    <td>{formatCurrency(entry.debit)}</td>
                    <td>{formatCurrency(entry.credit)}</td>
                    <td>{formatCurrency(entry.balance)}</td>
                    <td>{entry.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}

export default PartiesPage;
