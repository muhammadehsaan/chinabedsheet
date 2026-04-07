import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Search,
  BookOpen,
  Printer,
  Share2,
  Eye,
  Edit,
  Package,
  History,
  FileText,
  DollarSign,
  User,
  Tags,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { accountsApi, inventoryApi, partiesApi, purchasesApi } from "../api/modules";
import { extractApiError } from "../api/client";
import { formatCurrency, formatNumber } from "../utils/format";

/* â”€â”€â”€ Static Demo Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SUPPLIERS = [];

const ITEMS = [];

const LEDGER_ENTRIES = {};
const PURCHASE_PAYMENT_METHODS = [
  "Cash",
  "Bank",
  "Easypaisa",
  "JazzCash",
  "Card",
];

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const normalizeText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const normalizePhone = (value) => String(value || "").replace(/\D+/g, "");
const isDraftSupplier = (supplier) => String(supplier?.id || "").startsWith("sup-");
const getSupplierPartyNumber = (supplier) => String(supplier?.partyNumber || "").trim();
const getInputWidthStyle = (value, minChars = 7, maxChars = 18) => {
  const contentLength = String(value ?? "").trim().length;
  const widthChars = Math.min(maxChars, Math.max(minChars, contentLength + 2));
  return {
    width: `${widthChars}ch`,
    minWidth: `${minChars}ch`,
  };
};
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const supplierIdentityKey = (supplier) => {
  if (!supplier) return "";
  const partyNumber = normalizeText(getSupplierPartyNumber(supplier));
  if (partyNumber) return `party:${partyNumber}`;
  const phone = normalizePhone(supplier.phone);
  if (phone) return `phone:${phone}`;
  const name = normalizeText(supplier.name);
  const city = normalizeText(supplier.city || supplier.address);
  const id = String(supplier.id || "").trim();
  if (id) return `id:${id}`;
  return `name:${name}|city:${city}`;
};
const isSameSupplier = (left, right) => {
  if (!left || !right) return false;
  const leftPartyNumber = normalizeText(getSupplierPartyNumber(left));
  const rightPartyNumber = normalizeText(getSupplierPartyNumber(right));
  if (leftPartyNumber && rightPartyNumber && leftPartyNumber === rightPartyNumber) {
    return true;
  }
  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);
  if (leftPhone && rightPhone && leftPhone === rightPhone) {
    return true;
  }
  const leftName = normalizeText(left.name);
  const rightName = normalizeText(right.name);
  const leftCity = normalizeText(left.city || left.address);
  const rightCity = normalizeText(right.city || right.address);
  if (leftName && rightName && leftName === rightName) {
    if (leftCity && rightCity) {
      return leftCity === rightCity;
    }
    if (!leftCity && !rightCity) {
      return true;
    }
  }
  const leftId = String(left.id || "").trim();
  const rightId = String(right.id || "").trim();
  return Boolean(leftId && rightId && leftId === rightId);
};
const buildSupplierOptionLabel = (supplier) =>
  [getSupplierPartyNumber(supplier), supplier?.id, supplier?.name, supplier?.phone, supplier?.city || supplier?.address]
    .filter(Boolean)
    .join(" ");
const mergeSupplierRecord = (existing = {}, incoming = {}) => ({
  ...existing,
  ...incoming,
  partyNumber: incoming.partyNumber || existing.partyNumber || "",
  name: incoming.name || existing.name || "",
  phone: incoming.phone || existing.phone || "",
  city: incoming.city || incoming.address || existing.city || existing.address || "",
  address: incoming.address || incoming.city || existing.address || existing.city || "",
  openingBalance:
    incoming.openingBalance !== undefined && incoming.openingBalance !== null
      ? incoming.openingBalance
      : (existing.openingBalance ?? 0),
  balance:
    incoming.balance !== undefined && incoming.balance !== null
      ? incoming.balance
      : (existing.balance ?? 0),
});
const mergeSuppliersByIdentity = (existingList = [], incomingList = []) => {
  const merged = [...existingList];
  incomingList.forEach((incoming) => {
    const index = merged.findIndex((entry) => isSameSupplier(entry, incoming));
    if (index >= 0) {
      merged[index] = mergeSupplierRecord(merged[index], incoming);
      return;
    }
    merged.push(mergeSupplierRecord({}, incoming));
  });
  return merged;
};
const mergePurchaseRecord = (existing = {}, incoming = {}) => {
  const existingSupplier = existing?.supplier || {};
  const incomingSupplier = incoming?.supplier || {};
  const mergedSupplier = {
    ...existingSupplier,
    ...incomingSupplier,
    partyNumber:
      incomingSupplier.partyNumber ||
      incoming.supplierPartyNumber ||
      existingSupplier.partyNumber ||
      existing.supplierPartyNumber ||
      null,
    phone:
      incomingSupplier.phone ||
      incoming.supplierPhone ||
      existingSupplier.phone ||
      existing.supplierPhone ||
      null,
    address:
      incomingSupplier.address ||
      incomingSupplier.city ||
      incoming.supplierCity ||
      existingSupplier.address ||
      existingSupplier.city ||
      existing.supplierCity ||
      null,
  };
  return {
    ...existing,
    ...incoming,
    invoiceNo: incoming.invoiceNo || existing.invoiceNo || null,
    billNo:
      incoming.billNo !== undefined
        ? incoming.billNo
        : (existing.billNo !== undefined ? existing.billNo : null),
    purchaseDate: incoming.purchaseDate || existing.purchaseDate || null,
    paymentMethod: incoming.paymentMethod || existing.paymentMethod || null,
    notes: incoming.notes || existing.notes || null,
    totalAmount:
      incoming.totalAmount !== undefined && incoming.totalAmount !== null
        ? incoming.totalAmount
        : (existing.totalAmount ?? 0),
    supplierId: incoming.supplierId || mergedSupplier.id || existing.supplierId || null,
    supplierPartyNumber:
      incoming.supplierPartyNumber ||
      incomingSupplier.partyNumber ||
      existing.supplierPartyNumber ||
      existingSupplier.partyNumber ||
      null,
    supplierPhone:
      incoming.supplierPhone ||
      incomingSupplier.phone ||
      existing.supplierPhone ||
      existingSupplier.phone ||
      null,
    supplierCity:
      incoming.supplierCity ||
      incomingSupplier.address ||
      incomingSupplier.city ||
      existing.supplierCity ||
      existingSupplier.address ||
      existingSupplier.city ||
      null,
    supplierName:
      incoming.supplierName || incomingSupplier.name || existing.supplierName || existingSupplier.name || null,
    supplier: mergedSupplier,
    lines:
      Array.isArray(incoming.lines) && incoming.lines.length > 0
        ? incoming.lines
        : (Array.isArray(existing.lines) ? existing.lines : []),
  };
};
const mergePurchaseRecordsById = (existingList = [], incomingList = []) => {
  const merged = [...existingList];
  incomingList.forEach((incoming) => {
    const incomingId = Number(incoming?.id);
    const index = merged.findIndex((entry) => Number(entry?.id) === incomingId);
    if (index >= 0) {
      merged[index] = mergePurchaseRecord(merged[index], incoming);
      return;
    }
    merged.push(mergePurchaseRecord({}, incoming));
  });
  return merged;
};
const findSupplierMatch = (list, value) => {
  const normalized = normalizeText(value);
  const normalizedPhone = normalizePhone(value);
  if (!normalized) return null;
  const exactMatches = list.filter(
    (supplier) =>
      normalizeText(supplier.name) === normalized ||
      normalizeText(getSupplierPartyNumber(supplier)) === normalized ||
      (normalizedPhone && normalizePhone(supplier.phone) === normalizedPhone) ||
      normalizeText(buildSupplierOptionLabel(supplier)) === normalized,
  );
  if (exactMatches.length > 0) {
    return exactMatches.reduce((bestMatch, current) =>
      scoreSupplierData(current) > scoreSupplierData(bestMatch) ? current : bestMatch,
    );
  }
  return null;
};
const scoreSupplierData = (supplier = {}) => {
  let score = 0;
  if (getSupplierPartyNumber(supplier)) score += 5;
  if (normalizePhone(supplier.phone)) score += 4;
  if (normalizeText(supplier.city || supplier.address)) score += 3;
  if (String(supplier.id || "").trim() && !String(supplier.id).startsWith("sup-")) score += 2;
  return score;
};
const hydrateSupplierSelection = (supplier, list = []) => {
  if (!supplier) return null;
  const supplierId = String(supplier.id || "").trim();
  const supplierParty = normalizeText(getSupplierPartyNumber(supplier));
  const supplierPhone = normalizePhone(supplier.phone);
  const supplierName = normalizeText(supplier.name);
  const candidates = (list || []).filter((entry) => {
    if (!entry) return false;
    const entryId = String(entry.id || "").trim();
    const entryParty = normalizeText(getSupplierPartyNumber(entry));
    const entryPhone = normalizePhone(entry.phone);
    const entryName = normalizeText(entry.name);
    if (supplierId && entryId && supplierId === entryId) return true;
    if (supplierParty && entryParty && supplierParty === entryParty) return true;
    if (supplierPhone && entryPhone && supplierPhone === entryPhone) return true;
    if (supplierName && entryName && supplierName === entryName) return true;
    return isSameSupplier(entry, supplier);
  });
  if (candidates.length === 0) {
    return mergeSupplierRecord({}, supplier);
  }
  const best = candidates.reduce((bestMatch, current) =>
    scoreSupplierData(current) > scoreSupplierData(bestMatch) ? current : bestMatch,
  );
  return mergeSupplierRecord(best, supplier);
};
const getSupplierOpeningBalance = (supplier, list = []) => {
  if (!supplier) return 0;
  const hydrated = hydrateSupplierSelection(supplier, list) || supplier;
  const openingBalance = Number(hydrated?.openingBalance ?? supplier?.openingBalance ?? 0);
  return Number.isFinite(openingBalance) ? openingBalance : 0;
};
const parseTrailingNumber = (value) => {
  const match = String(value || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
};
const formatPurchaseInvoiceNo = (number) => String(number).padStart(2, "0");
const formatPartyNumber = (number) => String(number).padStart(3, "0");
const extractPaidAmountFromPaymentMethod = (value) => {
  const text = String(value || "").trim();
  if (!text || normalizeText(text) === "credit") {
    return 0;
  }
  const matches = text.match(/\d[\d,]*\.?\d*/g) || [];
  return matches.reduce((sum, part) => sum + (Number(part.replace(/,/g, "")) || 0), 0);
};

const loadStored = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const saveStored = (key, value) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
};

/* â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="pos-section-title">
      <Icon size={14} />
      <span>{title}</span>
    </div>
  );
}

function InfoRow({ label, value, accent, negative }) {
  return (
    <div className="pos-info-row">
      <span className="pos-info-label">{label}</span>
      <span className={`pos-info-value${accent ? " pos-info-value--accent" : ""}${negative ? " pos-profit-negative" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/* â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function PurchaseEntryPanel() {
  const queryClient = useQueryClient();
  const todayDate = new Date().toISOString().slice(0, 10);
  const [suppliers, setSuppliers] = useState(SUPPLIERS);
  const [purchaseRecords, setPurchaseRecords] = useState(() =>
    loadStored("purchases.records", []),
  );
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [partyInvoiceNo, setPartyInvoiceNo] = useState("");
  const [showClientLedger, setShowClientLedger] = useState(false);
  const [purchaseFormReturnState, setPurchaseFormReturnState] = useState(null);
  const [ledgerEntries, setLedgerEntries] = useState(LEDGER_ENTRIES);
  const [invoiceEdit, setInvoiceEdit] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Credit");
  const [purchasePaymentType, setPurchasePaymentType] = useState("credit");
  const [payments, setPayments] = useState([{ method: "Cash", amount: "" }]);
  const [purchaseDateFrom, setPurchaseDateFrom] = useState(todayDate);
	  const [purchaseDateTo, setPurchaseDateTo] = useState(todayDate);
	  const [selectedBankId, setSelectedBankId] = useState("");
		  const [activeSupplierIndex, setActiveSupplierIndex] = useState(-1);
	  const [supplierDropdownNavigated, setSupplierDropdownNavigated] = useState(false);
	  const [activeItemIndex, setActiveItemIndex] = useState(-1);
  const [pendingLineFocusId, setPendingLineFocusId] = useState(null);
  const [barcodePrint, setBarcodePrint] = useState({
    open: false,
    entry: null,
    template: "classic",
    qty: 1,
  });
  const [isPurchaseFormOpen, setIsPurchaseFormOpen] = useState(false);
  const [purchaseInvoiceSearch, setPurchaseInvoiceSearch] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  const [itemSearch, setItemSearch] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [lines, setLines] = useState([]);
  const [showItemHistory, setShowItemHistory] = useState(null);
  const [itemsCatalog, setItemsCatalog] = useState(ITEMS);
  const supplierInputRef = useRef(null);
  const purchaseFormRef = useRef(null);

  const [overallDiscount, setOverallDiscount] = useState("");
  const [extraCharges, setExtraCharges] = useState("");
  const [remarks, setRemarks] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const purchasesQuery = useQuery({
    queryKey: ["purchases", "list"],
    queryFn: purchasesApi.listPurchases,
  });
  const itemsQuery = useQuery({
    queryKey: ["inventory", "items", "purchases-pos"],
    queryFn: inventoryApi.listItems,
  });
  const partiesQuery = useQuery({
    queryKey: ["parties", "suppliers"],
    queryFn: () => partiesApi.listParties(),
  });
  const banksQuery = useQuery({
    queryKey: ["accounts", "banks", "purchases"],
    queryFn: accountsApi.listBanks,
  });
  const supplierLedgerQuery = useQuery({
    queryKey: ["parties", "ledger", "purchases-pos", selectedSupplier?.id],
    queryFn: () => partiesApi.partyLedger(selectedSupplier.id),
    enabled:
      Boolean(selectedSupplier?.id) && Number.isFinite(Number(selectedSupplier?.id)),
  });
  const bankOptions = useMemo(
    () =>
      (banksQuery.data || []).filter((bank) => normalizeText(bank.status || "active") === "active"),
    [banksQuery.data],
  );
  const hasBankPaymentRow = useMemo(
    () =>
      purchasePaymentType === "cash" &&
      payments.some((entry) => String(entry.method || "").toLowerCase() === "bank"),
    [payments, purchasePaymentType],
  );
  const getAvailablePurchaseMethods = (rowIndex) => {
    const bankUsedElsewhere = payments.some(
      (entry, entryIndex) =>
        entryIndex !== rowIndex && String(entry.method || "").toLowerCase() === "bank",
    );
    return PURCHASE_PAYMENT_METHODS.filter(
      (method) =>
        normalizeText(method) !== "bank" ||
        !bankUsedElsewhere ||
        normalizeText(payments[rowIndex]?.method) === "bank",
    );
  };

  const resolvePurchaseSupplier = (purchase) => {
	    const baseSupplier = {
	      id:
	        purchase?.supplier?.id ||
	        purchase?.supplierId ||
	        (purchase?.id ? `sup-purchase-${purchase.id}` : createId("sup")),
	      partyNumber: purchase?.supplier?.partyNumber || purchase?.supplierPartyNumber || "",
	      name: purchase?.supplier?.name || purchase?.supplierName || "Supplier",
	      phone: purchase?.supplier?.phone || purchase?.supplierPhone || "",
	      city:
          purchase?.supplier?.city ||
          purchase?.supplier?.address ||
          purchase?.supplierCity ||
          "",
	      address:
          purchase?.supplier?.address ||
          purchase?.supplier?.city ||
          purchase?.supplierCity ||
          "",
	      balance: 0,
	    };
    return hydrateSupplierSelection(baseSupplier, supplierPool) || baseSupplier;
  };

  const itemHistoryMap = useMemo(() => {
    const map = new Map();
    if (!purchaseRecords || purchaseRecords.length === 0) return map;
    purchaseRecords.forEach((purchase) => {
      const date = purchase.purchaseDate
        ? String(purchase.purchaseDate).slice(0, 10)
        : "";
      const invoice = purchase.invoiceNo || purchase.billNo || purchase.id;
      (purchase.lines || []).forEach((line) => {
        if (!line.itemId && !line.itemName) return;
        const entry = {
          date,
          invoice,
          rate: Number(line.unitCost || 0),
        };
        const keys = [];
        if (line.itemId) keys.push(`id:${line.itemId}`);
        if (line.itemName) keys.push(`name:${normalizeText(line.itemName)}`);
        keys.forEach((key) => {
          if (!map.has(key)) {
            map.set(key, []);
          }
          map.get(key).push(entry);
        });
      });
    });
    map.forEach((entries) => {
      entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    return map;
  }, [purchaseRecords]);

  const nextAutoInvoiceNo = useMemo(() => {
    const maxFromDb = (purchaseRecords || []).reduce((maxNo, purchase) => {
      const parsed = parseTrailingNumber(purchase.invoiceNo || purchase.billNo || "");
      if (!Number.isFinite(parsed)) {
        return maxNo;
      }
      return Math.max(maxNo, parsed);
    }, 0);
    return formatPurchaseInvoiceNo(maxFromDb + 1);
  }, [purchaseRecords]);
  const nextAutoPartyNumber = useMemo(() => {
    const allPartyNumbers = [
      ...suppliers.map((supplier) => getSupplierPartyNumber(supplier)),
      ...(partiesQuery.data || []).map((party) => String(party.partyNumber || "").trim()),
      ...(purchaseRecords || []).map((purchase) =>
        String(
          purchase?.supplier?.partyNumber ||
            purchase?.supplierPartyNumber ||
            purchase?.partyNumber ||
            "",
        ).trim(),
      ),
    ];
    const maxFromAll = allPartyNumbers.reduce((maxNo, partyNumber) => {
      const parsed = parseTrailingNumber(partyNumber);
      if (!Number.isFinite(parsed)) {
        return maxNo;
      }
      return Math.max(maxNo, parsed);
    }, 0);
    return formatPartyNumber(maxFromAll + 1);
  }, [partiesQuery.data, purchaseRecords, suppliers]);
  const registeredSuppliers = useMemo(() => {
    return (partiesQuery.data || [])
      .filter((party) => {
        const type = normalizeText(party.type);
        return type === "both" || type.includes("supplier");
      })
      .map((party) => ({
        id: party.id,
        partyNumber: party.partyNumber || "",
        name: party.name || "Supplier",
        phone: party.phone || "",
        city: party.address || "",
        address: party.address || "",
        openingBalance: Number(party.openingBalance || 0),
        balance: Number(party.openingBalance || 0),
      }));
  }, [partiesQuery.data]);
  const supplierPool = useMemo(
    () => mergeSuppliersByIdentity(suppliers, registeredSuppliers),
    [registeredSuppliers, suppliers],
  );

	  const purchaseInvoiceRows = useMemo(
	    () =>
	      (purchaseRecords || []).map((purchase) => {
        const supplier = resolvePurchaseSupplier(purchase);
        return {
          id: purchase.id,
          invoiceNo: purchase.invoiceNo || formatPurchaseInvoiceNo(purchase.id),
          partyInvoiceNo: purchase.billNo || "-",
          date: purchase.purchaseDate ? String(purchase.purchaseDate).slice(0, 10) : "-",
          supplier: supplier?.name || "-",
          partyNumber: getSupplierPartyNumber(supplier) || "-",
          supplierPhone: supplier?.phone || "-",
          supplierCity: supplier?.city || supplier?.address || "-",
          paymentMethod: purchase.paymentMethod || "-",
          itemsCount: purchase.lines?.length || 0,
          amount: Number(purchase.totalAmount || 0),
          notes: purchase.notes || "-",
        };
      }),
	    [purchaseRecords, supplierPool],
	  );

  const filteredPurchaseInvoiceRows = useMemo(() => {
    const query = normalizeText(purchaseInvoiceSearch);
    let rows = purchaseInvoiceRows;
    if (purchaseDateFrom) {
      rows = rows.filter((row) => row.date !== "-" && row.date >= purchaseDateFrom);
    }
    if (purchaseDateTo) {
      rows = rows.filter((row) => row.date !== "-" && row.date <= purchaseDateTo);
    }
    if (!query) {
      return rows;
    }
    return rows.filter((row) =>
      normalizeText(
        `${row.invoiceNo} ${row.partyInvoiceNo} ${row.date} ${row.partyNumber} ${row.supplier} ${row.supplierPhone} ${row.supplierCity} ${row.paymentMethod} ${row.itemsCount} ${row.amount} ${row.notes}`,
      ).includes(query),
    );
  }, [purchaseInvoiceRows, purchaseInvoiceSearch, purchaseDateFrom, purchaseDateTo]);

  const filteredPurchaseInvoiceTotal = useMemo(
    () => filteredPurchaseInvoiceRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [filteredPurchaseInvoiceRows],
  );

  useEffect(() => {
    const storedSuppliers = loadStored("purchases.suppliers", SUPPLIERS);
    const storedItems = loadStored("purchases.items", ITEMS);
	    const storedLedger = loadStored("purchases.ledger", LEDGER_ENTRIES);
      const storedPurchases = loadStored("purchases.records", []);
    const draft = loadStored("purchases.draft", null);

    let nextSuppliers = [...storedSuppliers];
    let nextItems = [...storedItems];

    if (draft?.supplier) {
      const existing = nextSuppliers.find((supplier) => isSameSupplier(supplier, draft.supplier));
      if (!existing) {
        nextSuppliers = [...nextSuppliers, draft.supplier];
      }
      setSelectedSupplier(existing || draft.supplier);
      setSupplierSearch(draft.supplier.name || "");
    } else if (draft?.supplierSearch) {
      setSupplierSearch(draft.supplierSearch);
    }

    if (Array.isArray(draft?.lines)) {
      draft.lines.forEach((line) => {
        if (!nextItems.find((it) => it.id === line.itemId)) {
          nextItems.push({
            id: line.itemId || createId("item"),
            name: line.name || "",
            sku: line.sku || "",
            purchasePrice: line.purchasePrice || 0,
            salePrice: line.salePrice || 0,
            wholesalePrice: line.wholesalePrice || 0,
            marketPrice: line.marketPrice || 0,
          });
        }
      });
      setLines(draft.lines);
    }

	    if (draft?.invoiceNo) setInvoiceNo(draft.invoiceNo);
	    if (draft?.partyInvoiceNo) setPartyInvoiceNo(draft.partyInvoiceNo);
	    if (draft?.purchaseDate) setPurchaseDate(draft.purchaseDate);
	    if (draft?.paymentMethod) setPaymentMethod(draft.paymentMethod);
	    if (draft?.purchasePaymentType) setPurchasePaymentType(draft.purchasePaymentType);
	    if (Array.isArray(draft?.payments) && draft.payments.length > 0) setPayments(draft.payments);
	    if (typeof draft?.selectedBankId === "string") setSelectedBankId(draft.selectedBankId);
	    if (draft?.overallDiscount !== undefined) setOverallDiscount(draft.overallDiscount);
    if (draft?.extraCharges !== undefined) setExtraCharges(draft.extraCharges);
    if (draft?.remarks !== undefined) setRemarks(draft.remarks);

	    setSuppliers(nextSuppliers);
	    setItemsCatalog(nextItems);
		    setLedgerEntries(storedLedger);
      if (Array.isArray(storedPurchases) && storedPurchases.length > 0) {
        setPurchaseRecords((prev) => mergePurchaseRecordsById(prev, storedPurchases));
      }
      if (
        draft &&
        (draft.supplier ||
          draft.supplierSearch ||
          (Array.isArray(draft.lines) && draft.lines.length > 0) ||
          draft.remarks ||
          draft.invoiceNo ||
          draft.partyInvoiceNo)
      ) {
        setIsPurchaseFormOpen(true);
      }
	    setDraftLoaded(true);
	  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    if (editingPurchaseId) return;
    if (String(invoiceNo || "").trim()) return;
    setInvoiceNo(nextAutoInvoiceNo);
  }, [draftLoaded, editingPurchaseId, invoiceNo, nextAutoInvoiceNo]);

	  useEffect(() => {
	    if (!purchasesQuery.data || purchasesQuery.data.length === 0) {
	      return;
	    }
      setPurchaseRecords((prev) => mergePurchaseRecordsById(prev, purchasesQuery.data));
    }, [purchasesQuery.data]);

	  useEffect(() => {
	    if (!purchaseRecords || purchaseRecords.length === 0) {
	      return;
	    }
	    const supplierMap = new Map();
	    const ledgerMap = {};
	    const itemMap = new Map();

	    const sorted = [...purchaseRecords].sort(
	      (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime(),
	    );

	    sorted.forEach((purchase) => {
		      const supplier = purchase.supplier || {
	        id: purchase.supplierId || createId("sup"),
	        partyNumber: "",
	        name: purchase.supplierName || "Supplier",
	        phone: "",
	        city: "",
	      };
	      const openingBalance = getSupplierOpeningBalance(supplier, registeredSuppliers);
	      const nameKey = supplier.name ? `name:${supplier.name.toLowerCase()}` : null;
	      if (!supplierMap.has(supplier.id)) {
	        supplierMap.set(supplier.id, { ...supplier, openingBalance, balance: openingBalance });
	      }
		      const currentSupplier = supplierMap.get(supplier.id);
	      currentSupplier.openingBalance = openingBalance;
		      const credit = Number(purchase.totalAmount || 0);
		      const debit = extractPaidAmountFromPaymentMethod(purchase.paymentMethod);
		      const nextBalance = Number(currentSupplier.balance || 0) + credit - debit;
      currentSupplier.balance = nextBalance;

      const entry = {
        id: purchase.id,
        date: purchase.purchaseDate ? String(purchase.purchaseDate).slice(0, 10) : "",
        description: `Purchase Invoice #${purchase.invoiceNo || purchase.billNo || purchase.id}`,
        debit,
        credit,
        balance: nextBalance,
        invoiceNo: purchase.invoiceNo || purchase.billNo || "",
      };

      if (!ledgerMap[supplier.id]) {
        ledgerMap[supplier.id] = [];
      }
      if (nameKey && !ledgerMap[nameKey]) {
        ledgerMap[nameKey] = ledgerMap[supplier.id];
      }
      ledgerMap[supplier.id].push(entry);

      (purchase.lines || []).forEach((line) => {
        if (!line.itemId && !line.itemName) return;
        if (itemMap.has(line.itemId || line.itemName)) return;
	        itemMap.set(line.itemId || line.itemName, {
	          id: line.itemId || createId("item"),
	          name: line.itemName || "Item",
	          sku: "",
	          purchasePrice: Number(line.unitCost || 0),
	          salePrice: 0,
	          wholesalePrice: 0,
	          marketPrice: 0,
	          currentStock: 0,
	        });
	      });
    });

    const apiSuppliers = Array.from(supplierMap.values());
    const apiItems = Array.from(itemMap.values());
    setSuppliers((prev) => mergeSuppliersByIdentity(prev, apiSuppliers));
    setLedgerEntries(ledgerMap);
    setItemsCatalog((prev) => {
      const merged = [...prev];
      apiItems.forEach((item) => {
        if (!merged.find((it) => it.id === item.id)) {
          merged.push(item);
        }
      });
	      return merged;
	    });
		  }, [purchaseRecords, registeredSuppliers]);

  useEffect(() => {
    if (!partiesQuery.data || partiesQuery.data.length === 0) {
      return;
    }
    const supplierParties = partiesQuery.data.filter((party) => {
      const type = normalizeText(party.type);
      return type === "both" || type.includes("supplier");
    });
    if (supplierParties.length === 0) {
      return;
    }
    setSuppliers((prev) => {
      let merged = [...prev];
      supplierParties.forEach((party) => {
        const normalizedName = normalizeText(party.name);
	        const mapped = {
	          id: party.id,
	          partyNumber: party.partyNumber || "",
	          name: party.name || "Supplier",
	          phone: party.phone || "",
	          city: party.address || "",
	          openingBalance: Number(party.openingBalance || 0),
	          balance: Number(party.openingBalance || 0),
	        };
        const index = merged.findIndex(
          (supplier) => isSameSupplier(supplier, mapped),
        );
        if (index >= 0) {
          const existing = merged[index];
          merged[index] = mergeSupplierRecord(existing, {
            ...mapped,
            id: mapped.id || existing.id,
            balance:
              mapped.balance !== undefined && mapped.balance !== null
                ? mapped.balance
                : (existing.balance ?? 0),
          });
        } else {
          merged.push(mapped);
        }
      });
      return merged;
    });
  }, [partiesQuery.data]);

	  useEffect(() => {
	    if (!itemsQuery.data || itemsQuery.data.length === 0) {
	      return;
	    }
	    const inventoryItems = itemsQuery.data.map((item) => ({
	      id: item.id,
	      name: item.name || "Item",
	      sku: item.sku || "",
	      purchasePrice: Number(item.purchasePrice || 0),
	      salePrice: Number(item.salePrice || item.retailPrice || 0),
	      wholesalePrice: Number(item.wholesalePrice || 0),
	      marketPrice: Number(item.marketPrice || 0),
	      currentStock: Number(item.currentStock || 0),
	    }));
	    setItemsCatalog((prev) => {
	      const merged = [...prev];
	      inventoryItems.forEach((item) => {
	        const index = merged.findIndex(
	          (entry) => entry.id === item.id || normalizeText(entry.name) === normalizeText(item.name),
	        );
	        if (index >= 0) {
	          merged[index] = { ...merged[index], ...item };
	        } else {
	          merged.push(item);
	        }
	      });
	      return merged;
	    });
	  }, [itemsQuery.data]);

	  useEffect(() => {
	    if (!normalizeText(supplierSearch)) {
	      return;
	    }
	    const match = findSupplierMatch(supplierPool, supplierSearch);
	    if (match && (!selectedSupplier || selectedSupplier.id !== match.id)) {
	      setSelectedSupplier(hydrateSupplierSelection(match, supplierPool));
	      if (supplierSearch !== match.name && normalizeText(supplierSearch) === normalizeText(match.name)) {
	        setSupplierSearch(match.name);
	      }
	    }
	  }, [selectedSupplier, supplierPool, supplierSearch]);

	  useEffect(() => {
		    if (!selectedSupplier) return;
		    const match = hydrateSupplierSelection(selectedSupplier, supplierPool);
		    if (!match) return;
			    if (
			      match.partyNumber !== selectedSupplier.partyNumber ||
			      match.phone !== selectedSupplier.phone ||
		      match.city !== selectedSupplier.city ||
		      match.balance !== selectedSupplier.balance ||
		      match.openingBalance !== selectedSupplier.openingBalance
	    ) {
	      setSelectedSupplier(match);
	    }
		  }, [selectedSupplier, supplierPool]);

  useEffect(() => {
    saveStored("purchases.suppliers", suppliers);
  }, [suppliers]);

  useEffect(() => {
    saveStored("purchases.items", itemsCatalog);
  }, [itemsCatalog]);

	  useEffect(() => {
	    saveStored("purchases.ledger", ledgerEntries);
	  }, [ledgerEntries]);

  useEffect(() => {
    saveStored("purchases.records", purchaseRecords);
  }, [purchaseRecords]);

  useEffect(() => {
    if (!draftLoaded) return;
    saveStored("purchases.draft", {
      supplier: selectedSupplier,
      supplierSearch,
      invoiceNo,
      partyInvoiceNo,
      purchaseDate,
      paymentMethod,
      purchasePaymentType,
      payments,
      selectedBankId,
      lines,
      overallDiscount,
      extraCharges,
      remarks,
    });
  }, [
    draftLoaded,
    selectedSupplier,
    supplierSearch,
    invoiceNo,
    partyInvoiceNo,
    purchaseDate,
    paymentMethod,
    purchasePaymentType,
    payments,
    selectedBankId,
    lines,
    overallDiscount,
    extraCharges,
    remarks,
  ]);

	  const supplierLedger = useMemo(() => {
	    if (!selectedSupplier) {
	      return [];
	    }
    if (Array.isArray(supplierLedgerQuery.data?.purchaseEntries) && supplierLedgerQuery.data.purchaseEntries.length > 0) {
      return supplierLedgerQuery.data.purchaseEntries;
    }
    const nameKey = selectedSupplier.name ? `name:${selectedSupplier.name.toLowerCase()}` : null;
	    return (
	      ledgerEntries[selectedSupplier.id] ||
      (nameKey ? ledgerEntries[nameKey] : null) ||
	      []
	    );
	  }, [ledgerEntries, selectedSupplier, supplierLedgerQuery.data]);
	  const selectedSupplierOpeningBalance = useMemo(
	    () => getSupplierOpeningBalance(selectedSupplier, registeredSuppliers),
	    [registeredSuppliers, selectedSupplier],
	  );

	  const ledgerBalance = Number.isFinite(Number(supplierLedgerQuery.data?.balance))
	    ? Number(supplierLedgerQuery.data.balance)
	    : supplierLedger.length
	      ? supplierLedger[supplierLedger.length - 1].balance
	      : selectedSupplierOpeningBalance;
		  const supplierDetails = useMemo(() => {
		    if (!selectedSupplier) return null;
		    const hydrated = hydrateSupplierSelection(selectedSupplier, supplierPool) || selectedSupplier;
		    return {
		      ...selectedSupplier,
		      ...hydrated,
	      partyNumber: hydrated.partyNumber || selectedSupplier.partyNumber || "",
	      phone: hydrated.phone || selectedSupplier.phone || "",
	      city: hydrated.city || selectedSupplier.city || "",
	      openingBalance:
	        hydrated.openingBalance !== undefined
	          ? hydrated.openingBalance
	          : selectedSupplierOpeningBalance,
		      balance:
		        hydrated.balance !== undefined ? hydrated.balance : (selectedSupplier.balance || 0),
		    };
			  }, [selectedSupplier, selectedSupplierOpeningBalance, supplierPool]);
  const resolvedPartyNumber = useMemo(
    () => getSupplierPartyNumber(supplierDetails || selectedSupplier) || nextAutoPartyNumber,
    [nextAutoPartyNumber, selectedSupplier, supplierDetails],
  );
  const resolvedInvoiceNo = useMemo(
    () => String(invoiceNo || "").trim() || nextAutoInvoiceNo,
    [invoiceNo, nextAutoInvoiceNo],
  );
	  const editingPurchaseRecord = useMemo(() => {
	    if (!editingPurchaseId) {
	      return null;
	    }
	    return (purchaseRecords || []).find((purchase) => purchase.id === editingPurchaseId) || null;
	  }, [editingPurchaseId, purchaseRecords]);
  const existingEditingPurchaseTotal = Number(editingPurchaseRecord?.totalAmount || 0);
  const existingEditingPurchasePaid = extractPaidAmountFromPaymentMethod(
    editingPurchaseRecord?.paymentMethod,
  );
	  const totalPaid = useMemo(
	    () =>
	      purchasePaymentType === "credit"
	        ? 0
	        : payments.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
	    [payments, purchasePaymentType],
	  );
  const bankPaymentAmount = useMemo(
    () =>
      purchasePaymentType === "credit"
        ? 0
        : payments
            .filter((entry) => String(entry.method || "").toLowerCase() === "bank")
            .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
    [payments, purchasePaymentType],
  );
  const selectedBank = useMemo(
    () => bankOptions.find((bank) => Number(bank.id) === Number(selectedBankId || 0)) || null,
    [bankOptions, selectedBankId],
  );
  const paymentMethodLabel = useMemo(() => {
    if (purchasePaymentType === "credit") {
      return "Credit";
    }
    const activePayments = (payments || []).filter(
      (entry) => Number(entry.amount || 0) > 0 && String(entry.method || "").trim(),
    );
    if (activePayments.length === 0) {
      return "Cash";
    }
    return activePayments
      .map((entry) =>
        `${entry.method === "Bank" ? selectedBank?.bankName || "Bank" : entry.method} ${formatCurrency(entry.amount)}`,
      )
      .join(" + ");
  }, [payments, purchasePaymentType, selectedBank]);

  /* filters */
  const filteredSuppliers = useMemo(() => {
	    const query = String(supplierSearch || "").trim();
	    if (!query) {
	      return supplierPool;
	    }
    const normalized = normalizeText(query);
    const numericQuery = normalizePhone(query);
    const hasAlphabetic = /[a-zA-Z]/.test(query);
	    const list = supplierPool.filter((supplier) => {
	      if (hasAlphabetic) {
	        return normalizeText(supplier.name).includes(normalized);
	      }
      const partyNumber = normalizeText(getSupplierPartyNumber(supplier));
      const supplierId = normalizeText(supplier.id);
      const phone = normalizePhone(supplier.phone);
      return (
        partyNumber.includes(normalized) ||
        supplierId.includes(normalized) ||
        phone.includes(numericQuery)
      );
    });
    return list.sort((left, right) => {
      const leftName = normalizeText(left.name);
      const rightName = normalizeText(right.name);
      const leftStarts = leftName.startsWith(normalized);
      const rightStarts = rightName.startsWith(normalized);
      if (leftStarts && !rightStarts) return -1;
      if (!leftStarts && rightStarts) return 1;
      return leftName.localeCompare(rightName);
    });
	  }, [supplierPool, supplierSearch]);
  const filteredItems = useMemo(
    () =>
      itemsCatalog.filter(
        (item) =>
          item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
          (item.sku || "").toLowerCase().includes(itemSearch.toLowerCase()),
      ),
    [itemSearch, itemsCatalog],
  );

	  useEffect(() => {
	    if (!showSupplierDropdown) {
	      setActiveSupplierIndex(-1);
	      setSupplierDropdownNavigated(false);
	      return;
	    }
	    setActiveSupplierIndex(-1);
	    setSupplierDropdownNavigated(false);
	  }, [filteredSuppliers, showSupplierDropdown]);

  useEffect(() => {
    if (!showItemDropdown) {
      setActiveItemIndex(-1);
      return;
    }
    setActiveItemIndex(filteredItems.length > 0 ? 0 : -1);
  }, [filteredItems, showItemDropdown]);

  useEffect(() => {
    if (!isPurchaseFormOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      supplierInputRef.current?.focus();
      supplierInputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isPurchaseFormOpen]);

  useEffect(() => {
    if (!pendingLineFocusId) {
      return;
    }
    const timer = window.setTimeout(() => {
      const target = purchaseFormRef.current?.querySelector(
        `[data-line-focus-id="${String(pendingLineFocusId).replace(/"/g, '\\"')}"]`,
      );
      if (target instanceof HTMLElement) {
        target.focus();
        target.select?.();
      }
      setPendingLineFocusId(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lines, pendingLineFocusId]);

  useEffect(() => {
    if (purchasePaymentType === "credit") {
      setSelectedBankId("");
      return;
    }
    if (!hasBankPaymentRow) {
      setSelectedBankId("");
    }
  }, [hasBankPaymentRow, purchasePaymentType]);

  /* Add Item */
  const addItem = (item) => {
    setLines((prev) => {
      const exists = prev.find((l) => l.itemId === item.id);
      if (exists) {
        return prev.map((l) =>
          l.itemId === item.id
            ? { ...l, qty: l.qty === "" ? 1 : Number(l.qty || 0) + 1 }
            : l,
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          qty: "",
          purchasePrice: "",
          salePrice: "",
          wholesalePrice: "",
          marketPrice: "",
          discountPercent: "",
          isManual: false,
        },
      ];
    });
    setItemSearch("");
    setShowItemDropdown(false);
  };

  const addEmptyLine = (options = {}) => {
    const nextId = createId("item");
    setLines((prev) => [
      ...prev,
      {
        itemId: nextId,
        name: "",
        sku: "",
        qty: "",
        purchasePrice: "",
        salePrice: "",
        wholesalePrice: "",
        marketPrice: "",
        discountPercent: "",
        isManual: true,
      },
    ]);
    if (options.focus) {
      setPendingLineFocusId(nextId);
    }
    return nextId;
  };

  const updateLine = (itemId, field, value) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.itemId !== itemId) return l;
        if (value === "") {
          return { ...l, [field]: "" };
        }
        const parsed = Number(value);
        return { ...l, [field]: Number.isNaN(parsed) ? "" : parsed };
      }),
    );
  };

  const updateLineText = (itemId, field, value) => {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, [field]: value } : l)),
    );
  };

  const isEnterKey = (event) => event.key === "Enter" || event.key === "NumpadEnter";

	  const focusField = (element) => {
	    if (!(element instanceof HTMLElement)) return;
	    element.focus();
    element.scrollIntoView({ block: "center", behavior: "smooth" });
	    if ("select" in element && typeof element.select === "function") {
	      element.select();
	    }
	  };

  const getPurchaseFormFocusables = () => {
    const scope = purchaseFormRef.current || document;
    return Array.from(
      scope.querySelectorAll(
        "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])",
      ),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const isHidden = element.offsetParent === null && element !== document.activeElement;
      return !isHidden && !element.readOnly;
    });
  };

	  const focusNextFieldFrom = (target) => {
	    if (!(target instanceof HTMLElement)) return false;
	    const focusables = getPurchaseFormFocusables();
    const currentIndex = focusables.indexOf(target);
    if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
      focusField(focusables[currentIndex + 1]);
      return true;
	    }
	    return false;
	  };

  const focusPreviousFieldFrom = (target) => {
    if (!(target instanceof HTMLElement)) return false;
    const focusables = getPurchaseFormFocusables();
    const currentIndex = focusables.indexOf(target);
    if (currentIndex > 0) {
      focusField(focusables[currentIndex - 1]);
      return true;
    }
    return false;
  };

	  const handlePurchaseFormEnter = (event) => {
	    if (event.defaultPrevented) return;
	    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
	    const target = event.target;
	    if (!(target instanceof HTMLElement)) return;
	    const tagName = target.tagName.toLowerCase();
	    if (tagName === "textarea" || tagName === "button") return;
	    if (target.closest(".pos-dropdown")) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusNextFieldFrom(target);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusPreviousFieldFrom(target);
      return;
    }
    if (!isEnterKey(event)) return;
	    event.preventDefault();
	    focusNextFieldFrom(target);
	  };

  const handleDeleteKeyDown = (event) => {
    if (!isEnterKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    addEmptyLine();
  };

	  const handleSupplierInputKeyDown = (event) => {
	    if (event.key === "ArrowDown") {
	      event.preventDefault();
	      setShowSupplierDropdown(true);
	      setSupplierDropdownNavigated(true);
	      if (filteredSuppliers.length > 0) {
	        setActiveSupplierIndex((prev) =>
	          prev < 0 || prev >= filteredSuppliers.length - 1 ? 0 : prev + 1,
        );
      }
      return;
    }
	    if (event.key === "ArrowUp") {
	      event.preventDefault();
	      setShowSupplierDropdown(true);
	      setSupplierDropdownNavigated(true);
	      if (filteredSuppliers.length > 0) {
	        setActiveSupplierIndex((prev) =>
	          prev <= 0 ? filteredSuppliers.length - 1 : prev - 1,
        );
      }
      return;
	    }
	    if (isEnterKey(event) && showSupplierDropdown) {
	      if (supplierDropdownNavigated && filteredSuppliers.length > 0 && activeSupplierIndex >= 0) {
	        event.preventDefault();
	        handleSelectSupplier(filteredSuppliers[activeSupplierIndex]);
	        window.setTimeout(() => focusNextFieldFrom(event.currentTarget), 0);
        return;
      }
      if (supplierSearch.trim()) {
        event.preventDefault();
        handleAddSupplier();
        window.setTimeout(() => focusNextFieldFrom(event.currentTarget), 0);
      }
      return;
    }
    if (isEnterKey(event) && supplierSearch.trim()) {
      event.preventDefault();
      handleAddSupplier();
      window.setTimeout(() => focusNextFieldFrom(event.currentTarget), 0);
      return;
    }
    if (event.key === "Escape") {
      setShowSupplierDropdown(false);
    }
  };

  const handleItemInputKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setShowItemDropdown(true);
      if (filteredItems.length > 0) {
        setActiveItemIndex((prev) =>
          prev < 0 || prev >= filteredItems.length - 1 ? 0 : prev + 1,
        );
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setShowItemDropdown(true);
      if (filteredItems.length > 0) {
        setActiveItemIndex((prev) => (prev <= 0 ? filteredItems.length - 1 : prev - 1));
      }
      return;
    }
    if (isEnterKey(event) && showItemDropdown) {
      if (filteredItems.length > 0 && activeItemIndex >= 0) {
        event.preventDefault();
        addItem(filteredItems[activeItemIndex]);
        return;
      }
      if (itemSearch.trim()) {
        event.preventDefault();
        handleAddItem();
      }
      return;
    }
    if (event.key === "Escape") {
      setShowItemDropdown(false);
    }
  };

  const removeLine = (itemId) => setLines((prev) => prev.filter((l) => l.itemId !== itemId));

  const handleLastLineFieldEnter = (event) => {
    if (!isEnterKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    addEmptyLine({ focus: true });
  };

		  const handleSelectSupplier = (supplier) => {
		    const matchedSupplier = hydrateSupplierSelection(supplier, supplierPool) || supplier;
		    setSuppliers((prev) => mergeSuppliersByIdentity(prev, [matchedSupplier]));
		    setSelectedSupplier(matchedSupplier);
		    setSupplierSearch(matchedSupplier.name);
		    setShowSupplierDropdown(false);
		    setSupplierDropdownNavigated(false);
		    setActiveSupplierIndex(-1);
		  };

	  const handleAddSupplier = () => {
	    const name = supplierSearch.trim();
	    if (!name) {
	      return;
	    }
	    const draftSupplier = isDraftSupplier(selectedSupplier) ? selectedSupplier : null;
	    const selectedIsRegistered =
	      selectedSupplier &&
	      !isDraftSupplier(selectedSupplier) &&
	      normalizeText(selectedSupplier.name) === normalizeText(name);
	    if (selectedIsRegistered) {
	      handleSelectSupplier(selectedSupplier);
	      return;
    }
		    const exactMatch =
		      findSupplierMatch(supplierPool, name) ||
		      supplierPool.find((supplier) => normalizeText(supplier.name) === normalizeText(name));
    if (exactMatch) {
      handleSelectSupplier(exactMatch);
      return;
    }
	    const phone = draftSupplier?.phone || "";
	    const city = draftSupplier?.city || "";
	    const partyNumber = draftSupplier?.partyNumber || "";
		    const existing =
		      draftSupplier && (phone || city || partyNumber)
		        ? supplierPool.find((supplier) =>
		            isSameSupplier(supplier, { name, phone, city, partyNumber }),
		          )
		        : null;
	    if (existing) {
	      handleSelectSupplier(existing);
	      return;
	    }
		    const newSupplier = {
		      id: createId("sup"),
		      partyNumber: partyNumber || nextAutoPartyNumber,
		      name,
		      phone,
		      city,
		      openingBalance: 0,
		      balance: 0,
		    };
	    setSuppliers((prev) => mergeSuppliersByIdentity(prev, [newSupplier]));
	    setSupplierDropdownNavigated(false);
	    handleSelectSupplier(newSupplier);
	  };

			  const updateSelectedSupplier = (patch) => {
				    if (!selectedSupplier) {
				      const createdSupplier = {
				        id: createId("sup"),
				        partyNumber: patch.partyNumber || nextAutoPartyNumber,
				        name: supplierSearch.trim(),
				        phone: patch.phone || "",
				        city: patch.city || "",
				        openingBalance: patch.openingBalance ?? 0,
				        balance: 0,
				      };
			      setSelectedSupplier(createdSupplier);
			      setSuppliers((prev) => mergeSuppliersByIdentity(prev, [createdSupplier]));
			      return;
			    }
				    const updated = {
		          ...selectedSupplier,
		          ...patch,
		          partyNumber: selectedSupplier.partyNumber || patch.partyNumber || nextAutoPartyNumber,
		          openingBalance:
		            patch.openingBalance !== undefined
		              ? patch.openingBalance
		              : (selectedSupplier.openingBalance ?? 0),
		        };
			    setSelectedSupplier(updated);
	    setSuppliers((prev) => mergeSuppliersByIdentity(prev, [updated]));
	  };

  const handleAddItem = () => {
    const name = itemSearch.trim();
    if (!name) return;
    const existing = itemsCatalog.find((it) => it.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      addItem(existing);
      return;
    }
    const newItem = {
      id: createId("item"),
      name,
      sku: "",
      purchasePrice: 0,
      salePrice: 0,
      wholesalePrice: 0,
      marketPrice: 0,
    };
    setItemsCatalog((prev) => [...prev, newItem]);
    addItem(newItem);
  };

  const handleOpenInvoiceEdit = (entry) => {
    setInvoiceEdit({ ...entry });
  };

  const handleSaveInvoiceEdit = () => {
    if (!invoiceEdit || !selectedSupplier) {
      return;
    }
    setLedgerEntries((prev) => ({
      ...prev,
      [selectedSupplier.id]: (prev[selectedSupplier.id] || []).map((row) =>
        row.id === invoiceEdit.id ? { ...invoiceEdit } : row,
      ),
    }));
    setInvoiceEdit(null);
  };

  const handleOpenBarcodePrint = (entry) => {
    setBarcodePrint({ open: true, entry, template: "classic", qty: 1 });
  };

  const capturePurchaseFormState = () => ({
    editingPurchaseId,
    purchaseDate,
    paymentMethod,
    purchasePaymentType,
    payments: Array.isArray(payments) ? payments.map((row) => ({ ...row })) : [],
    invoiceNo,
    partyInvoiceNo,
    lines: Array.isArray(lines) ? lines.map((line) => ({ ...line })) : [],
    itemSearch,
    showItemHistory,
    overallDiscount,
    extraCharges,
    remarks,
    supplierSearch,
    selectedSupplier: selectedSupplier ? { ...selectedSupplier } : null,
    selectedBankId,
  });

  const restorePurchaseFormState = (snapshot) => {
    if (!snapshot) return;
    setEditingPurchaseId(snapshot.editingPurchaseId || null);
    setPurchaseDate(snapshot.purchaseDate || new Date().toISOString().slice(0, 10));
    setPaymentMethod(snapshot.paymentMethod || "Credit");
    setPurchasePaymentType(snapshot.purchasePaymentType || "credit");
    setPayments(
      Array.isArray(snapshot.payments) && snapshot.payments.length > 0
        ? snapshot.payments
        : [{ method: "Cash", amount: "" }],
    );
    setInvoiceNo(snapshot.invoiceNo || nextAutoInvoiceNo);
    setPartyInvoiceNo(snapshot.partyInvoiceNo || "");
    setLines(Array.isArray(snapshot.lines) ? snapshot.lines : []);
    setItemSearch(snapshot.itemSearch || "");
    setShowItemDropdown(false);
    setActiveItemIndex(-1);
    setShowItemHistory(snapshot.showItemHistory || null);
    setOverallDiscount(snapshot.overallDiscount ?? "");
    setExtraCharges(snapshot.extraCharges ?? "");
    setRemarks(snapshot.remarks ?? "");
    setSupplierSearch(snapshot.supplierSearch || "");
    setSelectedSupplier(snapshot.selectedSupplier || null);
    setSelectedBankId(snapshot.selectedBankId || "");
    setShowSupplierDropdown(false);
    setActiveSupplierIndex(-1);
    setSupplierDropdownNavigated(false);
    setShowClientLedger(false);
    setFeedback(null);
    setIsPurchaseFormOpen(true);
  };

  const resetPurchaseForm = () => {
    setEditingPurchaseId(null);
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("Credit");
    setPurchasePaymentType("credit");
    setPayments([{ method: "Cash", amount: "" }]);
    setInvoiceNo(nextAutoInvoiceNo);
    setPartyInvoiceNo("");
    setLines([]);
    setItemSearch("");
    setShowItemDropdown(false);
    setActiveItemIndex(-1);
    setShowItemHistory(null);
    setOverallDiscount("");
    setExtraCharges("");
    setRemarks("");
    setSupplierSearch("");
    setSelectedSupplier(null);
    setSelectedBankId("");
    setShowSupplierDropdown(false);
    setActiveSupplierIndex(-1);
    setSupplierDropdownNavigated(false);
    setShowClientLedger(false);
    setPurchaseFormReturnState(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("purchases.draft");
    }
  };

  const handleClosePurchaseForm = () => {
    if (purchaseFormReturnState) {
      const snapshot = purchaseFormReturnState;
      setPurchaseFormReturnState(null);
      restorePurchaseFormState(snapshot);
      return;
    }
    setIsPurchaseFormOpen(false);
    resetPurchaseForm();
  };

  const handleOpenNewPurchase = () => {
    setFeedback(null);
    setPurchaseFormReturnState(null);
    resetPurchaseForm();
    setIsPurchaseFormOpen(true);
  };

  const openPurchaseInvoiceForm = (purchase, fallbackRow = null) => {
    if (!purchase) {
      setFeedback({ type: "error", message: "Purchase invoice not found." });
      return;
    }
    const supplierFromPurchase = resolvePurchaseSupplier(purchase);
	    const supplier = {
	      ...supplierFromPurchase,
	      name: supplierFromPurchase?.name || fallbackRow?.supplier || "",
	      openingBalance:
	        supplierPool.find((entry) => isSameSupplier(entry, supplierFromPurchase))?.openingBalance ||
	        supplierFromPurchase?.openingBalance ||
	        0,
	      balance:
	        supplierPool.find((entry) => isSameSupplier(entry, supplierFromPurchase))?.balance ||
	        supplierFromPurchase?.balance ||
        0,
    };
    const nextLines = (purchase.lines || []).map((line) => {
      const catalogMatch = itemsCatalog.find(
        (item) =>
          item.id === line.itemId ||
          normalizeText(item.name) === normalizeText(line.itemName),
      );
      return {
        itemId: line.itemId || createId("item"),
        name: line.itemName || catalogMatch?.name || "",
        sku: catalogMatch?.sku || "",
        qty: Number(line.quantity || 0),
        purchasePrice: Number(line.unitCost || 0),
        salePrice: Number(catalogMatch?.salePrice || 0),
        wholesalePrice: Number(catalogMatch?.wholesalePrice || 0),
        marketPrice: Number(catalogMatch?.marketPrice || 0),
        discountPercent: "",
        isManual: !line.itemId,
      };
    });
    setEditingPurchaseId(purchase.id);
    setPurchaseDate(
      purchase.purchaseDate ? String(purchase.purchaseDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    );
	    const existingDebit =
	      (supplierLedger.find((entry) => entry.id === purchase.id || entry.invoiceNo === (purchase.invoiceNo || purchase.billNo || ""))?.debit) ||
        extractPaidAmountFromPaymentMethod(purchase.paymentMethod);
    const existingMethod = String(purchase.paymentMethod || "Cash");
    const isCreditPurchase = existingMethod.toLowerCase().includes("credit");
    setPaymentMethod(existingMethod || "Cash");
    setPurchasePaymentType(isCreditPurchase ? "credit" : "cash");
    setSelectedBankId(String(purchase.bankAccountId || purchase.bankAccount?.id || ""));
    setPayments([
      {
        method:
          Number(purchase.bankAmount || 0) > 0 && (purchase.bankAccountId || purchase.bankAccount?.id)
            ? "Bank"
            : PURCHASE_PAYMENT_METHODS.find((entry) =>
                existingMethod.toLowerCase().includes(entry.toLowerCase()),
              ) || "Cash",
        amount:
          isCreditPurchase
            ? ""
            : String(
                Number(purchase.bankAmount || 0) > 0 && (purchase.bankAccountId || purchase.bankAccount?.id)
                  ? Number(purchase.bankAmount || 0)
                  : existingDebit || "",
              ),
      },
    ]);
	    setInvoiceNo(purchase.invoiceNo || formatPurchaseInvoiceNo(purchase.id));
    setPartyInvoiceNo(purchase.billNo || "");
	    setRemarks(purchase.notes || "");
    setOverallDiscount("");
    setExtraCharges("");
	    setSelectedSupplier(supplier);
	    setSuppliers((prev) => mergeSuppliersByIdentity(prev, [supplier]));
	    setSupplierSearch(supplier.name || "");
	    setShowSupplierDropdown(false);
		    setLines(nextLines);
	    setShowItemHistory(null);
	    setFeedback(null);
      setShowClientLedger(false);
	    setIsPurchaseFormOpen(true);
  };

  const handleOpenPurchaseListEdit = (row) => {
    setPurchaseFormReturnState(null);
	    const purchase = (purchaseRecords || []).find((entry) => entry.id === row.id);
	    openPurchaseInvoiceForm(purchase, row);
	  };

  const handleOpenInvoiceView = (entry) => {
	    const purchase = (purchaseRecords || []).find(
	      (row) =>
	        row.id === entry.id ||
	        String(row.invoiceNo || row.billNo || "") === String(entry.invoiceNo || ""),
    );
    openPurchaseInvoiceForm(purchase, {
      supplier: selectedSupplier?.name || supplierDetails?.name || "",
    });
  };

  const handleOpenLedgerInvoiceView = (entry) => {
    setPurchaseFormReturnState(capturePurchaseFormState());
    setShowClientLedger(false);
    handleOpenInvoiceView(entry);
  };

  const handlePrintBarcode = () => {
    if (!barcodePrint.entry) {
      return;
    }
    const qty = Math.max(1, Number(barcodePrint.qty || 1));
    const template = barcodePrint.template;
    const codeValue = barcodePrint.entry.invoiceNo || barcodePrint.entry.description;
    const labels = Array.from({ length: qty }).map(
      (_, index) =>
        `<div class="barcode-label ${template}">
          <div class="barcode-lines"></div>
          <div class="barcode-text">${codeValue}</div>
        </div>`,
    );
    const printWindow = window.open("", "_blank", "width=720,height=720");
    if (!printWindow) {
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Barcode Print</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 24px; }
            .barcode-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
            .barcode-label { border: 1px solid #111; padding: 10px; text-align: center; }
            .barcode-lines { height: 48px; background: repeating-linear-gradient(90deg, #000 0 2px, transparent 2px 4px); margin-bottom: 6px; }
            .barcode-text { font-size: 12px; letter-spacing: 0.08em; }
            .barcode-label.compact { padding: 6px; }
            .barcode-label.compact .barcode-lines { height: 32px; }
            .barcode-label.wide { grid-column: span 2; }
          </style>
        </head>
        <body>
          <div class="barcode-grid">
            ${labels.join("")}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setBarcodePrint((prev) => ({ ...prev, open: false }));
  };

  const handlePrintSupplierLedger = () => {
    if (!supplierDetails) {
      return;
    }
	    const balanceValue = ledgerBalance;
    const rows = supplierLedger
      .map(
        (entry) => `
          <tr>
            <td>${escapeHtml(entry.date || "-")}</td>
            <td>${escapeHtml(entry.invoiceNo || "-")}</td>
            <td>${escapeHtml(entry.description || "-")}</td>
            <td>${escapeHtml(entry.debit ? formatCurrency(entry.debit) : "-")}</td>
            <td>${escapeHtml(entry.credit ? formatCurrency(entry.credit) : "-")}</td>
            <td>${escapeHtml(formatCurrency(entry.balance || 0))}</td>
          </tr>`,
      )
      .join("");
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Supplier Ledger Print</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 24px; color: #111827; }
            .header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
            .title { font-size: 24px; font-weight: 700; margin: 0 0 6px; }
            .meta { font-size: 13px; color: #4b5563; margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 10px 8px; text-align: left; font-size: 13px; }
            th { background: #f3f4f6; font-weight: 700; }
            .balance-row td { font-weight: 700; background: #f9fafb; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <p class="title">Supplier Ledger</p>
              <p class="meta">Supplier: ${escapeHtml(supplierDetails.name)}</p>
              <p class="meta">Party #: ${escapeHtml(getSupplierPartyNumber(supplierDetails) || "-")}</p>
              <p class="meta">Phone: ${escapeHtml(supplierDetails.phone || "-")}</p>
              <p class="meta">City: ${escapeHtml(supplierDetails.city || "-")}</p>
            </div>
            <div>
              <p class="meta">Printed: ${escapeHtml(new Date().toLocaleString())}</p>
              <p class="meta">Current Balance: ${escapeHtml(formatCurrency(balanceValue))}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Description</th>
                <th>Debit (Paid)</th>
                <th>Credit (Bill)</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows ||
                '<tr><td colspan="6" style="text-align:center;">No ledger entries yet.</td></tr>'
              }
              <tr class="balance-row">
                <td colspan="5">Current Balance</td>
                <td>${escapeHtml(formatCurrency(balanceValue))}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleShareSupplierLedger = () => {
    if (!supplierDetails) {
      return;
    }
	    const balanceValue = ledgerBalance;
    const recentEntries = supplierLedger.slice(-12).reverse();
    const messageLines = [
      "Supplier Ledger",
      `Supplier: ${supplierDetails.name}`,
      `Party #: ${getSupplierPartyNumber(supplierDetails) || "-"}`,
      `Phone: ${supplierDetails.phone || "-"}`,
      `City: ${supplierDetails.city || "-"}`,
      `Current Balance: ${formatCurrency(balanceValue)}`,
      "",
      "Recent Entries:",
    ];
    if (recentEntries.length === 0) {
      messageLines.push("No ledger entries yet.");
    } else {
      recentEntries.forEach((entry) => {
        messageLines.push(
          `${entry.date || "-"} | ${entry.invoiceNo || "-"} | Dr ${entry.debit ? formatCurrency(entry.debit) : "-"} | Cr ${entry.credit ? formatCurrency(entry.credit) : "-"} | Bal ${formatCurrency(entry.balance || 0)}`,
        );
      });
    }
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(messageLines.join("\n"))}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const handleSavePurchaseBill = async () => {
    if (lines.length === 0) return;
    let supplier = supplierDetails || selectedSupplier;
	    if (!supplier && supplierSearch.trim()) {
	      const name = supplierSearch.trim();
	      supplier = suppliers.find((entry) => normalizeText(entry.name) === normalizeText(name));
		      if (!supplier) {
		        supplier = {
		          id: createId("sup"),
		          partyNumber: resolvedPartyNumber,
		          name,
		          phone: "",
		          city: "",
	          openingBalance: 0,
	          balance: 0,
	        };
        setSuppliers((prev) => [...prev, supplier]);
      }
      setSelectedSupplier(supplier);
    }
    if (!supplier) return;

    setFeedback(null);

    try {
			      const supplierPartyNumber = getSupplierPartyNumber(supplier) || resolvedPartyNumber;
      const supplierOpeningBalance = getSupplierOpeningBalance(supplier, registeredSuppliers);
      const supplierId = Number.isFinite(Number(supplier.id)) ? Number(supplier.id) : null;
      if (bankPaymentAmount > 0 && !selectedBank) {
        setFeedback({ type: "error", message: "Please select a registered bank." });
        return;
      }
      const payload = {
        supplierId,
        supplierName: supplier.name,
        supplierPartyNumber: supplierPartyNumber || null,
        supplierPhone: supplier.phone || null,
        supplierCity: supplier.city || null,
        invoiceNo: resolvedInvoiceNo,
        billNo: String(partyInvoiceNo || "").trim() || null,
        purchaseDate: purchaseDate || new Date().toISOString().slice(0, 10),
        paymentMethod: paymentMethodLabel,
        bankAccountId: selectedBank && bankPaymentAmount > 0 ? selectedBank.id : undefined,
        bankAmount: selectedBank && bankPaymentAmount > 0 ? bankPaymentAmount : undefined,
        notes: remarks || null,
        items: lines.map((line) => ({
          itemId: Number.isFinite(Number(line.itemId)) ? Number(line.itemId) : undefined,
          itemName: line.name,
          quantity: Number(line.qty || 0),
          unitCost: Number(line.purchasePrice || 0),
          gstPercent: 0,
        })),
      };
	      const saved = editingPurchaseId
	        ? await purchasesApi.updatePurchase(editingPurchaseId, payload)
	        : await purchasesApi.createPurchase(payload);
	      const totalAmount = Number(saved?.totalAmount ?? netBillTotal);
      const entry = {
        id: saved?.id || createId("led"),
        date: saved?.purchaseDate ? String(saved.purchaseDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        description: `Purchase Invoice #${resolvedInvoiceNo}`,
        debit: totalPaid,
        credit: totalAmount,
        balance: prevBalance + totalAmount - totalPaid,
        invoiceNo: saved?.invoiceNo || resolvedInvoiceNo,
      };

      setLedgerEntries((prev) => {
        const nameKey = supplier.name ? `name:${supplier.name.toLowerCase()}` : null;
        const existing =
          prev[supplier.id] || (nameKey ? prev[nameKey] : null) || [];
        const alreadyExists = existing.some(
          (row) => row.id === entry.id || row.invoiceNo === entry.invoiceNo,
        );
        const nextEntries = alreadyExists
          ? existing.map((row) =>
              row.id === entry.id || row.invoiceNo === entry.invoiceNo ? entry : row,
            )
          : [...existing, entry];
        const next = { ...prev, [supplier.id]: nextEntries };
        if (nameKey) {
          next[nameKey] = nextEntries;
        }
        return next;
      });

		      const updatedSupplier = {
	        ...supplier,
	        partyNumber: supplierPartyNumber,
	        openingBalance: supplierOpeningBalance,
	        balance: entry.balance,
	      };
			      const savedSupplier = saved?.supplier
			        ? {
				            id: saved.supplier.id,
				            partyNumber: saved.supplier.partyNumber || supplierPartyNumber || "",
				            name: saved.supplier.name || supplier.name,
			            phone: saved.supplier.phone || supplier.phone || "",
			            city: saved.supplier.address || saved.supplier.city || supplier.city || "",
		            openingBalance: supplierOpeningBalance,
		            balance: entry.balance,
		          }
		        : updatedSupplier;
	      setSuppliers((prev) => mergeSuppliersByIdentity(prev, [savedSupplier]));
	      setSelectedSupplier(savedSupplier);

	      setFeedback({
	        type: "success",
	        message: editingPurchaseId ? "Purchase updated successfully." : "Purchase saved to database.",
	      });
            const normalizedRecord = {
			            ...saved,
		            invoiceNo: saved?.invoiceNo || resolvedInvoiceNo,
	            billNo: saved?.billNo ?? (String(partyInvoiceNo || "").trim() || null),
            paymentMethod: paymentMethodLabel,
            purchaseDate: saved?.purchaseDate || purchaseDate,
            notes: saved?.notes ?? (remarks || null),
            totalAmount: saved?.totalAmount ?? totalAmount,
            bankAccountId:
              saved?.bankAccountId ??
              (selectedBank && bankPaymentAmount > 0 ? selectedBank.id : null),
            bankAmount:
              saved?.bankAmount ??
              (selectedBank && bankPaymentAmount > 0 ? bankPaymentAmount : null),
            bankAccount:
              saved?.bankAccount ||
              (selectedBank && bankPaymentAmount > 0
                ? {
                    id: selectedBank.id,
                    bankName: selectedBank.bankName,
                    accountNumber: selectedBank.accountNumber || null,
                  }
                : null),
              supplierName: savedSupplier.name,
              supplierPhone: savedSupplier.phone || null,
              supplierCity: savedSupplier.city || null,
		            supplier:
		              saved?.supplier ||
		              {
	                id: savedSupplier.id,
	                partyNumber: savedSupplier.partyNumber || null,
	                name: savedSupplier.name,
	                phone: savedSupplier.phone || null,
	                address: savedSupplier.city || null,
	              },
            lines:
              saved?.lines ||
		              lines.map((line) => ({
		                itemId: Number.isFinite(Number(line.itemId)) ? Number(line.itemId) : null,
		                itemName: line.name,
		                quantity: Number(line.qty || 0),
		                unitCost: Number(line.purchasePrice || 0),
		              })),
		          };
		        queryClient.setQueryData(["purchases", "list"], (prev = []) => {
	          if (!Array.isArray(prev)) {
	            return prev;
	          }
		          if (editingPurchaseId) {
		            return prev.map((entry) => (entry.id === editingPurchaseId ? mergePurchaseRecord(entry, normalizedRecord) : entry));
		          }
		          return [normalizedRecord, ...prev];
		        });
          setPurchaseRecords((prev) => {
            if (editingPurchaseId) {
              return prev.map((entry) =>
                entry.id === editingPurchaseId ? mergePurchaseRecord(entry, normalizedRecord) : entry,
              );
            }
            return mergePurchaseRecordsById(prev, [normalizedRecord]);
          });
	          queryClient.setQueryData(["parties", "suppliers"], (prev = []) => {
	            if (!Array.isArray(prev)) {
	              return prev;
	            }
	            const existingParty = prev.find((entry) =>
	              isSameSupplier(
	                {
	                  id: entry?.id,
	                  partyNumber: entry?.partyNumber,
	                  name: entry?.name,
	                  phone: entry?.phone,
	                  city: entry?.address,
	                  address: entry?.address,
	                },
	                savedSupplier,
	              ),
	            );
	            const normalizedSupplier = {
	              id: savedSupplier.id,
	              partyNumber: savedSupplier.partyNumber || null,
	              name: savedSupplier.name || supplier.name,
	              type: "SUPPLIER",
	              phone: savedSupplier.phone || null,
	              address: savedSupplier.city || null,
	              openingBalance: Number(existingParty?.openingBalance ?? supplierOpeningBalance ?? 0),
	            };
            const existingIndex = prev.findIndex((entry) =>
              isSameSupplier(
                {
                  id: entry?.id,
                  partyNumber: entry?.partyNumber,
                  name: entry?.name,
                  phone: entry?.phone,
                  city: entry?.address,
                  address: entry?.address,
                },
                normalizedSupplier,
              ),
            );
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = { ...next[existingIndex], ...normalizedSupplier };
              return next;
            }
            return [normalizedSupplier, ...prev];
          });
      queryClient.invalidateQueries({ queryKey: ["purchases", "list"] });
      queryClient.invalidateQueries({ queryKey: ["purchases", "history"] });
      queryClient.invalidateQueries({ queryKey: ["parties", "suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["accounts", "banks"] });
      queryClient.invalidateQueries({ queryKey: ["parties", "ledger", "purchases-pos", savedSupplier.id] });
      setIsPurchaseFormOpen(false);
    } catch (err) {
      setFeedback({
        type: "error",
        message: extractApiError(err) || "Failed to save purchase.",
      });
      return;
    }
    resetPurchaseForm();
  };

  /* Totals */
  const itemsTotal = lines.reduce((sum, l) => {
    const sub = l.qty * l.purchasePrice;
    const discAmt = (sub * (l.discountPercent || 0)) / 100;
    return sum + (sub - discAmt);
  }, 0);

	  const netBillTotal = itemsTotal - Number(overallDiscount || 0) + Number(extraCharges || 0);
	  const currentSupplierBalance = Number.isFinite(Number(ledgerBalance)) ? Number(ledgerBalance) : 0;
	  const prevBalance = editingPurchaseId
	    ? currentSupplierBalance -
	      existingEditingPurchaseTotal +
	      existingEditingPurchasePaid
	    : currentSupplierBalance;
  const newBalance = prevBalance + netBillTotal - totalPaid;

  return (
    <div className="pos-shell purchase-entry-shell">
      {feedback && (
        <div className={feedback.type === "success" ? "alert alert--success" : "alert alert--error"}>
          {feedback.message}
        </div>
      )}
      <article className="module-card">
        <div className="line-head sales-invoice-head">
          <h4>Purchase Invoices</h4>
          <div className="pos-item-search sales-invoice-search">
            <Search size={16} className="pos-search-icon" />
            <input
              type="text"
              className="pos-input pos-input--search"
	              placeholder="Search invoice, party #, supplier, payment..."
              value={purchaseInvoiceSearch}
              onChange={(event) => setPurchaseInvoiceSearch(event.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="date"
              className="pos-input"
              value={purchaseDateFrom}
              onChange={(event) => setPurchaseDateFrom(event.target.value)}
              style={{ width: 160 }}
            />
            <span style={{ color: "var(--muted)", fontSize: 12 }}>to</span>
            <input
              type="date"
              className="pos-input"
              value={purchaseDateTo}
              onChange={(event) => setPurchaseDateTo(event.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <div className="purchase-invoice-actions">
            <button
              type="button"
              className="small-btn small-btn--ghost sales-invoice-search-reset"
	              onClick={() => {
	                setPurchaseInvoiceSearch("");
	                setPurchaseDateFrom(todayDate);
	                setPurchaseDateTo(todayDate);
	              }}
            >
              Reset
            </button>
            <button type="button" className="small-btn" onClick={handleOpenNewPurchase}>
              <Plus size={14} /> New Purchase
            </button>
          </div>
        </div>
        <div className="table-wrap purchase-invoice-list-table">
          <table>
	            <thead>
	              <tr>
	                <th>Invoice #</th>
	                <th>Party Invoice #</th>
	                <th>Date</th>
	                <th>Party #</th>
	                <th>Supplier</th>
                <th>Phone</th>
                <th>City</th>
                <th>Payment</th>
                <th>Items</th>
                <th>Bill</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
	              {purchasesQuery.isLoading ? (
	                <tr>
	                  <td colSpan={12} className="hint-line" style={{ padding: "12px" }}>
	                    Loading purchase invoices...
	                  </td>
	                </tr>
	              ) : purchasesQuery.isError ? (
	                <tr>
	                  <td colSpan={12} className="hint-line" style={{ padding: "12px" }}>
	                    Unable to load purchase invoices.
	                  </td>
	                </tr>
	              ) : filteredPurchaseInvoiceRows.length === 0 ? (
	                <tr>
	                  <td colSpan={12} className="hint-line" style={{ padding: "12px" }}>
	                    {purchaseInvoiceSearch.trim()
	                      ? "No purchase invoice found for this search."
	                      : "No purchase invoices yet."}
                  </td>
                </tr>
              ) : (
	                filteredPurchaseInvoiceRows.map((row) => (
	                  <tr key={row.id}>
	                    <td>{row.invoiceNo}</td>
	                    <td>{row.partyInvoiceNo}</td>
	                    <td>{row.date}</td>
	                    <td>{row.partyNumber}</td>
                    <td>{row.supplier}</td>
                    <td>{row.supplierPhone}</td>
                    <td>{row.supplierCity}</td>
                    <td>{row.paymentMethod}</td>
                    <td>{row.itemsCount}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{row.notes}</td>
                    <td>
                      <button
                        type="button"
                        className="pos-edit-btn"
                        title="Edit Invoice"
                        onClick={() => handleOpenPurchaseListEdit(row)}
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
	        <div className="purchase-invoice-summary">
	          <strong>Invoices Shown: {filteredPurchaseInvoiceRows.length}</strong>
	          <strong>Total Bill Sum: {formatCurrency(filteredPurchaseInvoiceTotal)}</strong>
	        </div>
      </article>

      {isPurchaseFormOpen && (
        <div className="inventory-modal-backdrop">
          <div className="inventory-modal purchase-entry-modal">
	            <div className="inventory-modal__header">
	              <div>
	                <h4>{editingPurchaseId ? "Edit Purchase Entry" : "New Purchase Entry"}</h4>
	                <p className="inventory-modal__sub">
	                  Fill supplier and item details, then save purchase invoice.
	                </p>
	              </div>
                <div className="purchase-entry-modal__header-tools">
	                  <label className="purchase-locked-field">
	                    <span>Invoice #</span>
	                    <input className="pos-input" value={resolvedInvoiceNo} readOnly tabIndex={-1} />
	                  </label>
	                <div className="inventory-modal__actions">
	                  <button
	                    type="button"
	                    className="small-btn small-btn--ghost"
	                    onClick={handleClosePurchaseForm}
	                  >
	                    Close
	                  </button>
	                </div>
                </div>
	            </div>
            <div className="inventory-modal__body" ref={purchaseFormRef} onKeyDown={handlePurchaseFormEnter}>
              <div className="pos-layout">
        {/* â”€â”€â”€ LEFT COLUMN: Supplier & Grid â”€â”€â”€ */}
        <div className="pos-left">
          {/* Supplier Info */}
          <div className="pos-card">
            <SectionTitle icon={User} title="Supplier Details" />
            <div className="pos-grid-2">
              <label className="pos-label" style={{ position: "relative" }}>
                Supplier Name
                <div style={{ position: "relative" }}>
                  <input
                    ref={supplierInputRef}
                    className="pos-input"
	                    placeholder="Search supplier or party #..."
                    value={supplierSearch}
                    onChange={(e) => {
                      const value = e.target.value;
                      const trimmed = normalizeText(value);
                      setSupplierSearch(value);
                      setShowSupplierDropdown(true);
                      if (!trimmed) {
                        setSelectedSupplier(null);
                        return;
                      }
		                      const match = findSupplierMatch(supplierPool, value);
		                      if (match) {
		                        setSelectedSupplier(hydrateSupplierSelection(match, supplierPool));
			                        if (value !== match.name && normalizeText(value) === normalizeText(match.name)) {
			                          setSupplierSearch(match.name);
			                        }
		                      } else {
			                        setSelectedSupplier((prev) => {
			                          const nextDraft = isDraftSupplier(prev) ? prev : null;
			                          return {
			                            id: nextDraft?.id || createId("sup"),
			                            partyNumber: nextDraft?.partyNumber || nextAutoPartyNumber,
			                            name: value.trim(),
			                            phone: nextDraft?.phone || "",
			                            city: nextDraft?.city || "",
			                            address: nextDraft?.address || nextDraft?.city || "",
		                            openingBalance: nextDraft?.openingBalance || 0,
		                            balance: nextDraft?.balance || 0,
		                          };
			                        });
		                      }
	                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    onKeyDown={handleSupplierInputKeyDown}
                  />
	                  {showSupplierDropdown && supplierSearch && (
	                    <div className="pos-dropdown">
                      {filteredSuppliers.length === 0 ? (
                        <button
                          type="button"
                          className={`pos-dropdown-item${activeSupplierIndex === 0 ? " is-active" : ""}`}
                          onMouseDown={handleAddSupplier}
                        >
                          <strong>Add "{supplierSearch}"</strong>
                          <span>Create new supplier</span>
                        </button>
                      ) : (
                        filteredSuppliers.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`pos-dropdown-item${
                              activeSupplierIndex === filteredSuppliers.findIndex((entry) => entry.id === s.id)
                                ? " is-active"
                                : ""
                            }`}
                            onMouseDown={() => handleSelectSupplier(s)}
                          >
                            <strong>{s.name}</strong>
                            <span>{s.phone || "-"} | {s.city || s.address || "-"}</span>
                          </button>
                        ))
	                      )}
	                    </div>
	                  )}
	                </div>
                  <div className="purchase-supplier-meta-inline">
                    <span>Phone: {supplierDetails?.phone || "-"}</span>
                    <span>Location: {supplierDetails?.city || supplierDetails?.address || "-"}</span>
                  </div>
	              </label>

		              <label className="pos-label">
		                Party Number
		                <input
		                  className="pos-input"
		                  value={resolvedPartyNumber}
                      readOnly
                      tabIndex={-1}
		                  placeholder="Auto"
		                />
		              </label>

		              <label className="pos-label">
		                Purchase Date
	                <input
	                  type="date"
	                  className="pos-input"
	                  value={purchaseDate}
	                  onChange={(e) => setPurchaseDate(e.target.value)}
	                />
	              </label>

                  <label className="pos-label">
                    Party Invoice No
                    <input
                      className="pos-input"
                      placeholder="Manual supplier invoice #"
                      value={partyInvoiceNo}
                      onChange={(e) => setPartyInvoiceNo(e.target.value)}
                    />
                  </label>

		              <label className="pos-label">
		                Purchase Type
		                <select
		                  className="pos-input"
		                  value={purchasePaymentType}
		                  onChange={(e) => {
                        const nextType = e.target.value;
                        setPurchasePaymentType(nextType);
                        setPaymentMethod(nextType === "credit" ? "Credit" : (payments[0]?.method || "Cash"));
                      }}
		                >
		                  <option value="credit">Credit Purchase</option>
		                  <option value="cash">Cash Purchase</option>
		                </select>
		              </label>

              <label className="pos-label">
                Phone No
                <input
                  className="pos-input"
	                  value={supplierDetails ? supplierDetails.phone : ""}
                  onChange={(e) => updateSelectedSupplier({ phone: e.target.value })}
                />
              </label>

              <label className="pos-label">
                City
                <input
                  className="pos-input"
	                  value={supplierDetails ? supplierDetails.city : ""}
                  onChange={(e) => updateSelectedSupplier({ city: e.target.value })}
                />
              </label>
            </div>

	            {supplierDetails && (
	              <div className="pos-customer-info">
	                <InfoRow label="Previous Balance" value={formatCurrency(prevBalance)} negative={prevBalance > 0} />
	                <InfoRow label="Current Balance" value={formatCurrency(newBalance)} negative={newBalance > 0} />
	                <div className="pos-customer-btns">
	                  <button
	                    type="button"
	                    className="pos-sm-btn"
	                    onClick={() => setShowClientLedger(true)}
	                  >
	                    <BookOpen size={13} /> Supplier Ledger
	                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Supplier Ledger Drawer */}
	          {false && showClientLedger && selectedSupplier && (
            <div className="pos-card">
              <SectionTitle icon={BookOpen} title={`Ledger - ${selectedSupplier.name}`} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Debit (Paid)</th>
                      <th>Credit (Bill)</th>
                      <th>Balance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="hint-line" style={{ padding: "12px" }}>
                          No ledger entries yet.
                        </td>
                      </tr>
                    ) : (
                      supplierLedger.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.date}</td>
                          <td>{entry.description}</td>
                          <td>{entry.debit ? formatCurrency(entry.debit) : "-"}</td>
                          <td>{entry.credit ? formatCurrency(entry.credit) : "-"}</td>
                          <td>{formatCurrency(entry.balance)}</td>
                          <td>
                            <div className="inline-actions">
                              <button
                                type="button"
                                className="pos-sm-btn"
                                onClick={() => handleOpenInvoiceView(entry)}
                              >
                                <Eye size={13} /> View
                              </button>
                              <button
                                type="button"
                                className="pos-sm-btn"
                                onClick={() => handleOpenInvoiceEdit(entry)}
                              >
                                <Edit size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                className="pos-sm-btn"
                                onClick={() => handleOpenBarcodePrint(entry)}
                              >
                                <Printer size={13} /> Print
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                    {selectedSupplier && (
                      <tr className="pos-balance-row">
                        <td colSpan={4}><strong>Current Balance</strong></td>
                        <td><strong>{formatCurrency(ledgerBalance)}</strong></td>
                        <td></td>
                      </tr>
                    )}
                    {/*
                    <tr style={{ display: "none" }}>
                      <td>2026-02-15</td>
                      <td>Purchase Invoice #102</td>
                      <td>â€”</td>
                      <td>{formatCurrency(150000)}</td>
                      <td>{formatCurrency(150000)}</td>
                    </tr>
                    <tr className="pos-balance-row" style={{ display: "none" }}>
                      <td colSpan={4}><strong>Current Balance</strong></td>
                      <td><strong>{formatCurrency(selectedSupplier.balance)}</strong></td>
                    </tr>
                    */}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Item Grid */}
          <div className="pos-card">
            <SectionTitle icon={Package} title="Purchase Items Grid" />
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div className="pos-item-search">
                <Search size={14} />
                <input
                  className="pos-input pos-input--search"
                  placeholder="Search item to add..."
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    setShowItemDropdown(true);
                  }}
                  onFocus={() => setShowItemDropdown(true)}
                  onKeyDown={handleItemInputKeyDown}
                />
              </div>
              {showItemDropdown && itemSearch && (
                <div className="pos-dropdown">
                  {filteredItems.length === 0 ? (
                    <button
                      type="button"
                      className={`pos-dropdown-item${activeItemIndex === 0 ? " is-active" : ""}`}
                      onMouseDown={handleAddItem}
                    >
                      <strong>Add "{itemSearch}"</strong>
                      <span>Create new item</span>
                    </button>
                  ) : (
                    filteredItems.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        className={`pos-dropdown-item${
                          activeItemIndex === filteredItems.findIndex((entry) => entry.id === it.id)
                            ? " is-active"
                            : ""
                        }`}
                        onMouseDown={() => addItem(it)}
                      >
                        <strong>{it.name}</strong>
	                        <span>SKU: {it.sku} | Stock: {formatNumber(it.currentStock || 0)} | Purchase: {formatCurrency(it.purchasePrice)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="pos-empty-grid">
                <Package size={28} />
                <span>Search and add items to the purchase bill.</span>
              </div>
            ) : (
              <div className="table-wrap" style={{ overflowX: "auto" }}>
	                <table className="pos-item-table purchase-grid-table" style={{ minWidth: "100%" }}>
                  <thead>
                    <tr>
                      <th>Sr#</th>
                      <th>Item Name</th>
	                      <th>Qty</th>
	                      <th>Purchase</th>
	                      <th>Sale</th>
	                      <th>Wholesale</th>
	                      <th>Market</th>
	                      <th>Disc %</th>
	                      <th>Disc Amt</th>
                      <th>Total</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
	                    {lines.map((line, index) => {
	                      const subtotal = line.qty * line.purchasePrice;
	                      const discAmt = (subtotal * (line.discountPercent || 0)) / 100;
	                      const rowTotal = subtotal - discAmt;
	                      const catalogItem =
	                        itemsCatalog.find(
	                          (item) =>
	                            item.id === line.itemId ||
	                            normalizeText(item.name) === normalizeText(line.name),
	                        ) || null;
	                      const currentItemStock = Number(catalogItem?.currentStock || 0);

		                      return [
	                          <tr key={`row-${line.itemId}`}>
                            <td>{index + 1}</td>
                            <td>
                              {line.isManual ? (
	                                <input
	                                  type="text"
	                                  className="pos-cell-input purchase-grid-input"
	                                  data-line-focus-id={line.itemId}
	                                  placeholder="Item name"
	                                  value={line.name}
	                                  style={getInputWidthStyle(line.name, 16, 36)}
	                                  onChange={(e) => updateLineText(line.itemId, "name", e.target.value)}
	                                />
                              ) : (
                                <div className="pos-item-cell">
                                  <span>{line.name}</span>
                                  <button
                                    type="button"
                                    className="pos-history-btn"
                                    onClick={() =>
                                      setShowItemHistory(
                                        showItemHistory === line.itemId ? null : line.itemId,
                                      )
                                    }
                                  >
                                    <History size={12} />
                                    Rate History
                                    {showItemHistory === line.itemId ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                  </button>
                                </div>
                              )}
                            </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input purchase-grid-input"
	                                data-line-focus-id={!line.isManual ? line.itemId : undefined}
	                                style={getInputWidthStyle(line.qty, 7, 12)}
	                                value={line.qty}
                                min={1}
                                placeholder="Qty"
                                onChange={(e) => updateLine(line.itemId, "qty", e.target.value)}
                              />
                            </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input purchase-grid-input"
	                                style={getInputWidthStyle(line.purchasePrice, 9, 14)}
	                                value={line.purchasePrice}
                                placeholder="0"
                                onChange={(e) => updateLine(line.itemId, "purchasePrice", e.target.value)}
                              />
                            </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input purchase-grid-input"
	                                style={getInputWidthStyle(line.salePrice, 9, 14)}
	                                value={line.salePrice}
                                placeholder="0"
                                onChange={(e) => updateLine(line.itemId, "salePrice", e.target.value)}
                              />
                            </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input purchase-grid-input"
	                                style={getInputWidthStyle(line.wholesalePrice, 10, 16)}
	                                value={line.wholesalePrice}
                                placeholder="0"
                                onChange={(e) => updateLine(line.itemId, "wholesalePrice", e.target.value)}
                              />
                            </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input purchase-grid-input"
	                                style={getInputWidthStyle(line.marketPrice, 10, 16)}
	                                value={line.marketPrice}
                                placeholder="0"
                                onChange={(e) => updateLine(line.itemId, "marketPrice", e.target.value)}
                              />
                            </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input purchase-grid-input"
	                                style={getInputWidthStyle(line.discountPercent, 7, 10)}
	                                value={line.discountPercent}
                                min={0}
                                max={100}
                                placeholder="0"
	                                onChange={(e) => updateLine(line.itemId, "discountPercent", e.target.value)}
	                                onKeyDown={handleLastLineFieldEnter}
	                              />
                            </td>
                            <td style={{ fontSize: 13, color: "var(--muted)" }}>{formatCurrency(discAmt)}</td>
                            <td><strong>{formatCurrency(rowTotal)}</strong></td>
                            <td>
	                              <button
	                                type="button"
	                                className="pos-remove-btn"
	                                onClick={() => removeLine(line.itemId)}
	                              >
                                <Trash2 size={13} />
                              </button>
	                            </td>
	                          </tr>,
		                          showItemHistory === line.itemId ? (
	                            <tr key={`history-${line.itemId}`} className="pos-history-row">
                              <td colSpan={11}>
                                <div className="pos-item-history">
                                  <strong><History size={12} /> &nbsp;Purchase Rate History â€” {line.name}</strong>
	                                  <div style={{ marginBottom: 10, fontSize: 12, color: "var(--muted)" }}>
	                                    Current Stock: <strong style={{ color: "var(--ink)" }}>{formatNumber(currentItemStock)}</strong>
	                                  </div>
	                                  {(() => {
                                    const history =
                                      itemHistoryMap.get(`id:${line.itemId}`) ||
                                      itemHistoryMap.get(`name:${normalizeText(line.name)}`) ||
                                      [];
                                    if (history.length === 0) {
                                      return (
                                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                          No previous purchase history found for this item.
                                        </span>
                                      );
                                    }
                                    return (
                                      <table>
                                        <thead>
                                          <tr>
                                            <th>Date</th>
                                            <th>Invoice No</th>
                                            <th>Purchase Rate</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {history.map((hist, idx) => (
                                            <tr key={idx}>
                                              <td>{hist.date}</td>
                                              <td>{hist.invoice}</td>
                                              <td><strong>{formatCurrency(hist.rate)}</strong></td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    );
                                  })()}
                                </div>
                              </td>
	                            </tr>
	                          ) : null,
	                      ];
	                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* â”€â”€â”€ RIGHT COLUMN: Billing & Summary â”€â”€â”€ */}
        <div className="pos-right">
          <div className="pos-card">
            <SectionTitle icon={FileText} title="Bill Summary" />
            
            <label className="pos-label" style={{ marginBottom: 12 }}>
              Overall Discount Amount
              <input 
                type="number" 
                className="pos-input" 
                value={overallDiscount}
                onChange={(e) => {
                  const value = e.target.value;
                  setOverallDiscount(value === "" ? "" : Number(value));
                }}
              />
            </label>

            <label className="pos-label" style={{ marginBottom: 16 }}>
              Extra Charges (Freight/Labour)
              <input 
                type="number" 
                className="pos-input" 
                value={extraCharges}
                onChange={(e) => {
                  const value = e.target.value;
                  setExtraCharges(value === "" ? "" : Number(value));
                }}
              />
            </label>

            <div className="pos-payment-summary" style={{ marginTop: 0 }}>
              <InfoRow label="Items Total" value={formatCurrency(itemsTotal)} />
              <InfoRow label="Discount" value={`- ${formatCurrency(overallDiscount || 0)}`} accent />
              <InfoRow label="Extra Charges" value={`+ ${formatCurrency(extraCharges || 0)}`} />
              <div className="pos-balance-total" style={{ borderTop: "2px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
                <span style={{ fontSize: 16 }}>Total Bill</span>
                <strong style={{ fontSize: 20, color: "var(--accent)" }}>{formatCurrency(netBillTotal)}</strong>
              </div>
            </div>
          </div>

	          <div className="pos-card">
	            <SectionTitle icon={DollarSign} title="Payment & Balance" />
	            {purchasePaymentType === "cash" ? (
	              <div>
	                {payments.map((payment, idx) => (
	                  <div key={idx} className="pos-split-row">
		                    <select
		                      className="pos-input"
		                      value={payment.method}
		                      onChange={(e) => {
		                        const nextMethod = e.target.value;
		                        setPayments((prev) =>
		                          prev.map((row, rowIndex) =>
		                            rowIndex === idx ? { ...row, method: nextMethod } : row,
		                          ),
		                        );
		                        if (
		                          String(payment.method || "").toLowerCase() === "bank" &&
		                          String(nextMethod || "").toLowerCase() !== "bank" &&
		                          !payments.some(
		                            (row, rowIndex) =>
		                              rowIndex !== idx && String(row.method || "").toLowerCase() === "bank",
		                          )
		                        ) {
		                          setSelectedBankId("");
		                        }
		                      }}
		                    >
		                      {getAvailablePurchaseMethods(idx).map((method) => (
		                        <option key={method} value={method}>{method}</option>
		                      ))}
		                    </select>
	                    <input
	                      className="pos-input"
	                      type="number"
	                      placeholder="Amount"
	                      value={payment.amount}
	                      onChange={(e) =>
	                        setPayments((prev) =>
	                          prev.map((row, rowIndex) =>
	                            rowIndex === idx ? { ...row, amount: e.target.value } : row,
	                          ),
	                        )
	                      }
	                    />
	                    {payments.length > 1 && (
	                      <button
	                        type="button"
	                        className="pos-remove-btn"
	                        onClick={() => setPayments((prev) => prev.filter((_, rowIndex) => rowIndex !== idx))}
	                      >
	                        <Trash2 size={13} />
	                      </button>
	                    )}
	                  </div>
	                ))}
                <button
                  type="button"
                  className="pos-sm-btn"
                  onClick={() => setPayments((prev) => [...prev, { method: "Cash", amount: "" }])}
                >
                  <Plus size={13} /> Add Payment Method
                </button>
	                {hasBankPaymentRow && (
	                  <label className="pos-label" style={{ marginTop: 12 }}>
	                    Registered Bank
                    <select
                      className="pos-input"
                      value={selectedBankId}
                      onChange={(event) => setSelectedBankId(event.target.value)}
                    >
                      <option value="">Select bank</option>
                      {bankOptions.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.bankName} - {bank.accountNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ) : (
              <div className="hint-line">Credit purchase selected. Payment will be added later in ledger.</div>
            )}

	            {supplierDetails && (
	              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
	                <InfoRow label="Previous Balance" value={formatCurrency(prevBalance)} />
	                <InfoRow label="Current Bill" value={`+ ${formatCurrency(netBillTotal)}`} />
	                <InfoRow label="Paid Now" value={`- ${formatCurrency(totalPaid)}`} accent />
	                <div className="pos-balance-total">
	                  <span>Current Balance</span>
	                  <strong className={newBalance > 0 ? "pos-profit-negative" : ""}>
	                    {formatCurrency(newBalance)}
	                  </strong>
                </div>
              </div>
            )}
          </div>

          <div className="pos-card">
            <label className="pos-label">
              Remarks / Comments
              <textarea 
                className="pos-input" 
                rows={3} 
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Write any remarks here..." 
              />
            </label>
          </div>

          <div className="pos-action-buttons">
            <button
              type="button"
              className="pos-btn pos-btn--save"
              onClick={handleSavePurchaseBill}
              disabled={lines.length === 0 || (!selectedSupplier && !supplierSearch.trim())}
            >
              <Plus size={16} /> {editingPurchaseId ? "Update Purchase Bill" : "Save Purchase Bill"}
            </button>
          </div>
        </div>
              </div>
            </div>
          </div>
        </div>
	      )}

	      {showClientLedger && supplierDetails && (
	        <div className="inventory-modal-backdrop" onClick={() => setShowClientLedger(false)}>
	          <div
	            className="inventory-modal"
	            style={{ maxWidth: 920 }}
	            onClick={(event) => event.stopPropagation()}
	          >
	            <div className="inventory-modal__header">
	              <div>
	                <h4>Supplier Ledger</h4>
	                <p className="inventory-modal__sub">{supplierDetails.name}</p>
	              </div>
	              <div className="inventory-modal__actions">
	                <button
	                  type="button"
	                  className="small-btn small-btn--ghost"
	                  onClick={handleShareSupplierLedger}
	                >
	                  <Share2 size={13} /> Share
	                </button>
	                <button
	                  type="button"
	                  className="small-btn"
	                  onClick={handlePrintSupplierLedger}
	                >
	                  <Printer size={13} /> Print
	                </button>
	                <button
	                  type="button"
	                  className="small-btn small-btn--ghost"
	                  onClick={() => setShowClientLedger(false)}
	                >
	                  Close
	                </button>
	              </div>
	            </div>
	            <div className="inventory-modal__body">
	              <article className="module-card">
	                <div className="table-wrap">
	                  <table>
	                    <thead>
	                      <tr>
	                        <th>Date</th>
	                        <th>Invoice</th>
	                        <th>Description</th>
	                        <th>Debit (Paid)</th>
	                        <th>Credit (Bill)</th>
	                        <th>Balance</th>
	                        <th>Action</th>
	                      </tr>
	                    </thead>
		                    <tbody>
		                      {supplierLedgerQuery.isLoading ? (
		                        <tr>
		                          <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
		                            Loading ledger...
		                          </td>
		                        </tr>
		                      ) : supplierLedger.length === 0 ? (
		                        <tr>
		                          <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
		                            No ledger entries yet.
		                          </td>
	                        </tr>
	                      ) : (
	                        supplierLedger.map((entry) => (
	                          <tr key={entry.id}>
	                            <td>{entry.date}</td>
	                            <td>{entry.invoiceNo || "-"}</td>
	                            <td>{entry.description}</td>
	                            <td>{entry.debit ? formatCurrency(entry.debit) : "-"}</td>
	                            <td>{entry.credit ? formatCurrency(entry.credit) : "-"}</td>
	                            <td>{formatCurrency(entry.balance)}</td>
	                            <td>
	                              <div className="inline-actions">
		                                <button
		                                  type="button"
		                                  className="small-btn small-btn--ghost"
		                                  onClick={() => handleOpenLedgerInvoiceView(entry)}
		                                >
	                                  View
	                                </button>
	                              </div>
	                            </td>
	                          </tr>
	                        ))
	                      )}
	                      <tr className="pos-balance-row">
	                        <td colSpan={5}><strong>Current Balance</strong></td>
	                        <td>
	                          <strong>{formatCurrency(ledgerBalance)}</strong>
	                        </td>
	                        <td></td>
	                      </tr>
	                    </tbody>
	                  </table>
	                </div>
	              </article>
	            </div>
	          </div>
	        </div>
	      )}

      {invoiceEdit && (
        <div className="inventory-modal-backdrop">
          <div className="inventory-modal" style={{ maxWidth: 640 }}>
            <div className="inventory-modal__header">
              <div>
                <h4>Edit Invoice</h4>
                <p className="inventory-modal__sub">Update supplier invoice details.</p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => setInvoiceEdit(null)}
                >
                  Close
                </button>
                <button type="button" onClick={handleSaveInvoiceEdit}>
                  Save Changes
                </button>
              </div>
            </div>
            <div className="inventory-modal__body">
              <form className="module-card form-card" style={{ width: "100%" }}>
                <label>
                  Invoice No
                  <input
                    className="pos-input"
                    value={invoiceEdit.invoiceNo}
                    onChange={(e) => setInvoiceEdit((prev) => ({ ...prev, invoiceNo: e.target.value }))}
                  />
                </label>
                <label>
                  Date
                  <input
                    className="pos-input"
                    value={invoiceEdit.date}
                    onChange={(e) => setInvoiceEdit((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </label>
                <label>
                  Description
                  <input
                    className="pos-input"
                    value={invoiceEdit.description}
                    onChange={(e) => setInvoiceEdit((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </label>
                <div className="two-col">
                  <label>
                    Debit (Paid)
                    <input
                      type="number"
                      className="pos-input"
                      value={invoiceEdit.debit}
                      onChange={(e) =>
                        setInvoiceEdit((prev) => ({ ...prev, debit: Number(e.target.value) || 0 }))
                      }
                    />
                  </label>
                  <label>
                    Credit (Bill)
                    <input
                      type="number"
                      className="pos-input"
                      value={invoiceEdit.credit}
                      onChange={(e) =>
                        setInvoiceEdit((prev) => ({ ...prev, credit: Number(e.target.value) || 0 }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Balance
                  <input
                    type="number"
                    className="pos-input"
                    value={invoiceEdit.balance}
                    onChange={(e) =>
                      setInvoiceEdit((prev) => ({ ...prev, balance: Number(e.target.value) || 0 }))
                    }
                  />
                </label>
              </form>
            </div>
          </div>
        </div>
      )}

      {barcodePrint.open && barcodePrint.entry && (
        <div className="inventory-modal-backdrop">
          <div className="inventory-modal" style={{ maxWidth: 720 }}>
            <div className="inventory-modal__header">
              <div>
                <h4>Barcode Print</h4>
                <p className="inventory-modal__sub">Select template and quantity to print.</p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => setBarcodePrint((prev) => ({ ...prev, open: false }))}
                >
                  Close
                </button>
                <button type="button" onClick={handlePrintBarcode}>
                  Print Barcodes
                </button>
              </div>
            </div>
            <div className="inventory-modal__body">
              <div className="module-card form-card" style={{ width: "100%" }}>
                <div className="two-col">
                  <label>
                    Template
                    <select
                      className="pos-input"
                      value={barcodePrint.template}
                      onChange={(e) =>
                        setBarcodePrint((prev) => ({ ...prev, template: e.target.value }))
                      }
                    >
                      <option value="classic">Classic</option>
                      <option value="compact">Compact</option>
                      <option value="wide">Wide</option>
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      className="pos-input"
                      min={1}
                      value={barcodePrint.qty}
                      onChange={(e) =>
                        setBarcodePrint((prev) => ({ ...prev, qty: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="barcode-preview-grid">
                  {Array.from({ length: Math.min(3, Number(barcodePrint.qty || 1)) }).map((_, index) => (
                    <div key={index} className={`barcode-preview-label ${barcodePrint.template}`}>
                      <div className="barcode-preview-lines" />
                      <span>{barcodePrint.entry.invoiceNo || barcodePrint.entry.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PurchasePage() {
  const handlePreventNumberWheel = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.type !== "number") {
      return;
    }
    target.blur();
    event.preventDefault();
  };

  return (
    <section className="module-page purchase-number-lock" onWheelCapture={handlePreventNumberWheel}>
      <header className="module-header">
        <h3>Purchases & Procurement</h3>
        <span className="module-subtitle">
          Manage supplier bills, purchase rates, extra charges, and vendor ledgers
        </span>
      </header>

      <PurchaseEntryPanel />
    </section>
  );
}

export default PurchasePage;

