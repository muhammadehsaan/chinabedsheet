import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Search,
  Edit,
  CreditCard,
  Wallet,
  Smartphone,
  DollarSign,
  Pause,
  User,
  Package,
  History,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Printer,
  Eye,
} from "lucide-react";

import ModuleTabs from "../components/ModuleTabs";
import brandLogo from "../assets/company logo.png";
import { extractApiError } from "../api/client";
import { accountsApi, inventoryApi, partiesApi, salesApi } from "../api/modules";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "../utils/format";

/* ─── Static Demo Data ─────────────────────────────────── */
const SALESMEN_STORAGE_KEY = "sales-pos-salesmen";
export const SALES_POS_DRAFT_KEY = "sales-pos-draft-v1";
const COUNTER_SALE_LABEL = "Counter Sale";

const PAYMENT_METHODS = [
  { key: "cash", label: "Cash", icon: DollarSign },
  { key: "bank", label: "Bank", icon: Wallet },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "easypaisa", label: "Easypaisa", icon: Smartphone },
  { key: "jazzcash", label: "JazzCash", icon: Smartphone },
];

const ALL_SALE_TYPES = [
  { key: "cash", label: "Cash Sale" },
  { key: "emi", label: "EMI Sale" },
  { key: "hold", label: "Bill Hold" },
];
const POS_SALE_TYPES = ALL_SALE_TYPES.filter((type) => type.key !== "emi");

const tabs = [
  { value: "pos", label: "POS / New Sale" },
  { value: "audit", label: "Audit Trail" },
];


/* ─── Helper ────────────────────────────────────────────── */
function calcLine(line) {
  const quantity = Number(line.qty || 0);
  const salePrice = Number(line.salePrice || 0);
  const marketPrice = Number(line.marketPrice || 0);
  const costPrice = Number(line.costPrice || 0);
  const discountAmt = Number(line.extraDiscount || 0);
  const subtotal = quantity * salePrice;
  const total = Math.max(0, subtotal - discountAmt);
  const market = quantity * marketPrice;
  const cost = quantity * costPrice;
  const profit = total - cost;
  return { subtotal, discountAmt, total, market, cost, profit };
}
const resizeTextarea = (element) => {
  if (!element) {
    return;
  }
  element.style.height = "auto";
  element.style.height = `${Math.max(38, element.scrollHeight)}px`;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
const normalizePartyInputValue = (value) => String(value || "").toUpperCase();
const formatInputDate = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};
const extractPromiseDateValue = (value) => {
  const match = String(value || "").match(/\[PROMISE_DATE:([^\]]+)\]/i);
  return match ? formatInputDate(match[1]) : "";
};
const matchNumberFromText = (text, regex) => {
  const match = String(text || "").match(regex);
  return match ? String(match[1] || "").trim() : "";
};
const matchDeliveryPolicyFromNotes = (text) =>
  /delivery\s+after payment/i.test(String(text || ""))
    ? "AFTER_PAYMENT"
    : /delivery\s+before payment/i.test(String(text || ""))
      ? "BEFORE_PAYMENT"
      : "BEFORE_PAYMENT";
const isHoldPaymentMethod = (value) => normalizeText(value).includes("hold");
const getPaidAmountFromSale = (sale = {}) => {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }
  const matches = String(sale.paymentMethod || "").match(/\d[\d,]*\.?\d*/g) || [];
  return matches.reduce((sum, value) => sum + (Number(String(value).replace(/,/g, "")) || 0), 0);
};
const escapePrintHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const invoiceLanguageCopy = {
  EN: {
    dir: "ltr",
    title: "Sale Invoice",
    subtitle: "Customer Invoice",
    invoiceNo: "Invoice No",
    date: "Date",
    customer: "Customer",
    phone: "Phone",
    location: "Location",
    paymentMethod: "Payment Method",
    item: "Item",
    qty: "Qty",
    unitPrice: "Unit Price",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Tax",
    netTotal: "Net Total",
    notes: "Notes",
    printEnglish: "Print English",
    printUrdu: "Print Urdu",
    shareWhatsApp: "Share WhatsApp",
    englishPreview: "English",
    urduPreview: "Urdu",
    noItems: "No line details available",
  },
  UR: {
    dir: "rtl",
    title: "سیل انوائس",
    subtitle: "گاہک کی انوائس",
    invoiceNo: "انوائس نمبر",
    date: "تاریخ",
    customer: "گاہک",
    phone: "فون",
    location: "مقام",
    paymentMethod: "ادائیگی کا طریقہ",
    item: "آئٹم",
    qty: "تعداد",
    unitPrice: "ریٹ",
    total: "کل",
    subtotal: "ذیلی کل",
    tax: "ٹیکس",
    netTotal: "کل رقم",
    notes: "نوٹس",
    printEnglish: "انگلش پرنٹ",
    printUrdu: "اردو پرنٹ",
    shareWhatsApp: "واٹس ایپ شیئر",
    englishPreview: "English",
    urduPreview: "اردو",
    noItems: "کوئی آئٹم موجود نہیں",
  },
};
const localizeInvoiceValue = (value, language = "EN") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "-";
  }
  if (language !== "UR") {
    return rawValue;
  }
  const lowerValue = normalizeText(rawValue);
  const replacements = [
    ["cash", "کیش"],
    ["bank", "بینک"],
    ["hold", "ہولڈ"],
    ["credit", "کریڈٹ"],
    ["card", "کارڈ"],
    ["easypaisa", "ایزی پیسہ"],
    ["jazzcash", "جاز کیش"],
    ["cancelled", "منسوخ"],
    ["counter sale", "کاؤنٹر سیل"],
    ["emi", "قسط"],
    ["before payment", "ادائیگی سے پہلے"],
    ["after payment", "ادائیگی کے بعد"],
  ];
  let translated = lowerValue;
  replacements.forEach(([from, to]) => {
    translated = translated.replaceAll(from, to);
  });
  return translated || rawValue;
};
const transliterateUrduValue = (value, field = "generic", language = "EN") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "-";
  }
  if (language !== "UR") {
    return rawValue;
  }
  const normalized = normalizeText(rawValue);
  const exactMap = {
    ubl: "یو بی ایل",
    hbl: "ایچ بی ایل",
    mcb: "ایم سی بی",
    nbp: "نیشنل بینک",
    meezan: "میزان",
    "meezan bank": "میزان بینک",
    "bank alfalah": "بینک الفلاح",
    "alfalah bank": "بینک الفلاح",
    "allied bank": "الائیڈ بینک",
    "askari bank": "عسکری بینک",
    "faysal bank": "فیصل بینک",
    lahore: "لاہور",
    lohare: "لاہور",
    karachi: "کراچی",
    islamabad: "اسلام آباد",
    rawalpindi: "راولپنڈی",
    faisalabad: "فیصل آباد",
    multan: "ملتان",
    peshawar: "پشاور",
    quetta: "کوئٹہ",
    sialkot: "سیالکوٹ",
    gujranwala: "گوجرانوالہ",
    hyderabad: "حیدرآباد",
    bahawalpur: "بہاولپور",
    sargodha: "سرگودھا",
    irfan: "عرفان",
    khan: "خان",
    "irfan khan": "عرفان خان",
  };
  if (exactMap[normalized]) {
    return exactMap[normalized];
  }

  const tokenMap = {
    bank: "بینک",
    ubl: "یو بی ایل",
    hbl: "ایچ بی ایل",
    mcb: "ایم سی بی",
    meezan: "میزان",
    alfalah: "الفلاح",
    allied: "الائیڈ",
    askari: "عسکری",
    faysal: "فیصل",
    lahore: "لاہور",
    lohare: "لاہور",
    karachi: "کراچی",
    islamabad: "اسلام آباد",
    irfan: "عرفان",
    khan: "خان",
  };
  const localizedTokens = normalized
    .split(/\s+/)
    .map((token) => tokenMap[token] || token);
  const localizedValue = localizedTokens.join(" ").trim();
  if (field === "payment") {
    return localizeInvoiceValue(localizedValue.replace(/\brs\b/gi, "روپے"), "UR");
  }
  return localizedValue || rawValue;
};
const localizeProductNameUrdu = (value, language = "EN") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "-";
  }
  if (language !== "UR") {
    return rawValue;
  }
  const productTokenMap = {
    bedsheet: "بیڈ شیٹ",
    bed: "بیڈ",
    sheet: "شیٹ",
    blanket: "کمبل",
    floral: "پھولدار",
    pillow: "تکیہ",
    cover: "کور",
    comforter: "رضائی",
    quilt: "رضائی",
    cushion: "کشن",
    sofa: "سوفا",
    queen: "کوئین",
    king: "کنگ",
    size: "سائز",
    red: "لال",
    green: "سبز",
    blue: "نیلا",
    black: "کالا",
    white: "سفید",
    grey: "سلیٹی",
    gray: "سلیٹی",
    brown: "بھورا",
    orange: "نارنجی",
    pink: "گلابی",
    cotton: "کاٹن",
    printed: "پرنٹڈ",
    design: "ڈیزائن",
    single: "سنگل",
    double: "ڈبل",
    kids: "کڈز",
    urban: "اربن",
    decoria: "ڈیکوریا",
    test: "ٹیسٹ",
    quality: "کوالٹی",
    good: "اچھی",
    product: "پروڈکٹ",
    queensize: "کوئین سائز",
    kingsize: "کنگ سائز",
  };
  return rawValue
    .split(/(\s+|[-/()])/)
    .map((part) => {
      const token = normalizeText(part);
      return productTokenMap[token] || part;
    })
    .join("");
};
const formatInvoiceDateByLanguage = (value, language = "EN") => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return language === "UR"
    ? date.toLocaleDateString("ur-PK")
    : date.toLocaleDateString("en-PK");
};
const createEmptyPaymentRow = (overrides = {}) => ({
  method: "cash",
  bankAccountId: "",
  amount: "",
  ...overrides,
});
const getPaymentSourceValue = (payment) =>
  payment?.method === "bank" && Number(payment?.bankAccountId || 0) > 0
    ? `bank:${payment.bankAccountId}`
    : "cash";
const resolvePaymentSource = (value) => {
  const rawValue = String(value || "").trim();
  if (rawValue.startsWith("bank:")) {
    return {
      method: "bank",
      bankAccountId: rawValue.slice(5),
    };
  }
  return {
    method: "cash",
    bankAccountId: "",
  };
};
const buildPaymentLabel = (payment, bankOptions = []) => {
  if (payment?.method === "bank") {
    const matchedBank = bankOptions.find((bank) => Number(bank.id) === Number(payment.bankAccountId || 0));
    return matchedBank?.bankName || "Bank";
  }
  return "Cash";
};

/* ─── Sub-components ────────────────────────────────────── */
function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="pos-section-title">
      <Icon size={14} />
      <span>{title}</span>
    </div>
  );
}

function InfoRow({ label, value, accent }) {
  return (
    <div className="pos-info-row">
      <span className="pos-info-label">{label}</span>
      <span className={`pos-info-value${accent ? " pos-info-value--accent" : ""}`}>{value}</span>
    </div>
  );
}

/* ─── Main POS Panel ────────────────────────────────────── */
export function POSPanel({
  editingSale = null,
  onSaved = null,
  onOpenHoldBills = null,
  forceFresh = false,
  availableSaleTypes = ALL_SALE_TYPES,
  initialSaleType = "cash",
  draftStorageKey = SALES_POS_DRAFT_KEY,
  lockSaleType = false,
  autoInvoicePrefix = "",
  hideBarcodeField = false,
  editableMarketPrice = false,
  expandItemNameColumn = false,
  showCostAndProfitTotals = true,
  showSavingsTotal = false,
}) {
  const queryClient = useQueryClient();
  const [posClock, setPosClock] = useState(() => new Date());
  const [saleType, setSaleType] = useState(() => initialSaleType);
  const [salesman, setSalesman] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerFieldEditState, setCustomerFieldEditState] = useState({
    phone: false,
    city: false,
  });
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerFeedback, setCustomerFeedback] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [activeItemSearchPanel, setActiveItemSearchPanel] = useState(null);
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState([createEmptyPaymentRow()]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [savedSaleReceipt, setSavedSaleReceipt] = useState(null);
  const [emiSelectedBankId, setEmiSelectedBankId] = useState("");
  const [emiData, setEmiData] = useState({
    markup: "",
    advance: "",
    installments: "6",
    deliveryPolicy: "BEFORE_PAYMENT",
    paymentMode: "credit",
  });
  const [showItemHistory, setShowItemHistory] = useState(null);
  const [showClientLedger, setShowClientLedger] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [historyInvoiceView, setHistoryInvoiceView] = useState(null);
  const [historyInvoiceLanguage, setHistoryInvoiceLanguage] = useState("EN");
  const [remarkPreview, setRemarkPreview] = useState(null);
  const [extraCharge, setExtraCharge] = useState({ amount: "", remark: "" });
  const [promiseDate, setPromiseDate] = useState("");
  const itemDropdownCloseTimeoutRef = useRef(null);
  const posShellRef = useRef(null);
  const invoiceItemsWrapRef = useRef(null);
  const previousLineCountRef = useRef(0);
  const [salesmanOptions, setSalesmanOptions] = useState(() => {
    try {
      if (typeof window === "undefined") {
        return [];
      }
      const parsed = JSON.parse(window.localStorage.getItem(SALESMEN_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });
  const [saleFeedback, setSaleFeedback] = useState(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const isEditMode = Boolean(editingSale?.id);
  const saleTypes = Array.isArray(availableSaleTypes) && availableSaleTypes.length > 0
    ? availableSaleTypes
    : ALL_SALE_TYPES;
  const shouldAutoInvoiceNo = Boolean(autoInvoicePrefix) && !isEditMode;
  const showInvoiceCornerBadge = Boolean(autoInvoicePrefix) || isEditMode;

  const partiesQuery = useQuery({
    queryKey: ["parties", "sales-pos"],
    queryFn: () => partiesApi.listParties(),
  });

  const itemsQuery = useQuery({
    queryKey: ["inventory", "items", "sales-pos"],
    queryFn: inventoryApi.listItems,
  });

  const salesListQuery = useQuery({
    queryKey: ["sales", "list"],
    queryFn: salesApi.listSales,
  });
  const banksQuery = useQuery({
    queryKey: ["accounts", "banks", "sales-pos"],
    queryFn: accountsApi.listBanks,
  });

  const customerLedgerQuery = useQuery({
    queryKey: ["parties", "ledger", "sales-pos", selectedCustomer?.id],
    queryFn: () => partiesApi.partyLedger(selectedCustomer.id),
    enabled: Boolean(selectedCustomer?.id),
  });

  const createCustomerMutation = useMutation({
    mutationFn: partiesApi.createParty,
    onSuccess: async (party) => {
      const nextCustomer = {
        id: party.id,
        partyNumber: party.partyNumber || "",
        name: party.name,
        phone: party.phone || "",
        city: party.address || "",
        openingBalance: Number(party.openingBalance || 0),
      };
      setSelectedCustomer({
        ...nextCustomer,
        name: normalizePartyInputValue(nextCustomer.name),
        city: normalizePartyInputValue(nextCustomer.city),
      });
      setCustomerSearch(normalizePartyInputValue(nextCustomer.name));
      setCustomerPhone(nextCustomer.phone);
      setCustomerCity(normalizePartyInputValue(nextCustomer.city));
      setCustomerFieldEditState({ phone: false, city: false });
      setCustomerFeedback("Customer created.");
      setShowCustomerDropdown(false);
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (error) => {
      setCustomerFeedback(extractApiError(error, "Customer create failed."));
    },
  });

  const saveSaleMutation = useMutation({
    mutationFn: salesApi.createSale,
    onSuccess: async (sale) => {
      setSavedSaleReceipt(sale || null);
      setHistoryInvoiceLanguage("EN");
      setSaleFeedback({ type: "success", message: "Sale saved successfully." });
      resetPosForm({ keepPaymentModal: true, keepSavedSaleReceipt: true });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      await queryClient.invalidateQueries({ queryKey: ["parties", "ledger"] });
      await queryClient.invalidateQueries({ queryKey: ["sales", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["sales", "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts", "banks"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error) => {
      setSaleFeedback({ type: "error", message: extractApiError(error, "Sale save failed.") });
    },
  });
  const updateSaleMutation = useMutation({
    mutationFn: ({ saleId, payload }) => salesApi.updateSale(saleId, payload),
    onSuccess: async (sale) => {
      setSavedSaleReceipt(sale || null);
      setHistoryInvoiceLanguage("EN");
      setSaleFeedback({ type: "success", message: "Sale updated successfully." });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      await queryClient.invalidateQueries({ queryKey: ["parties", "ledger"] });
      await queryClient.invalidateQueries({ queryKey: ["sales", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["sales", "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts", "banks"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error) => {
      setSaleFeedback({ type: "error", message: extractApiError(error, "Sale update failed.") });
    },
  });
  const cancelSaleMutation = useMutation({
    mutationFn: ({ saleId, payload }) => salesApi.cancelSale(saleId, payload),
    onSuccess: async () => {
      setSaleFeedback({ type: "success", message: "Invoice cancelled successfully." });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      await queryClient.invalidateQueries({ queryKey: ["parties", "ledger"] });
      await queryClient.invalidateQueries({ queryKey: ["sales", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["sales", "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts", "banks"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      if (typeof onSaved === "function") {
        onSaved();
      }
    },
    onError: (error) => {
      setSaleFeedback({ type: "error", message: extractApiError(error, "Invoice cancel failed.") });
    },
  });

  const customerOptions = useMemo(
    () =>
      (partiesQuery.data || [])
        .filter((party) => party.type === "CUSTOMER" || party.type === "BOTH")
        .map((party) => ({
          id: party.id,
          partyNumber: party.partyNumber || "",
          name: normalizePartyInputValue(party.name),
          phone: party.phone || "",
          city: normalizePartyInputValue(party.address || ""),
          openingBalance: Number(party.openingBalance || 0),
        })),
    [partiesQuery.data],
  );

  const itemOptions = useMemo(
    () =>
      (itemsQuery.data || []).map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku || `ITEM-${item.id}`,
        barcode: item.barcode || "",
        status: item.status || "Active",
        categoryName: String(item.category?.name || item.categoryName || item.brand?.name || item.brandName || "General").trim(),
        imageUrl: Array.isArray(item.imageUrls) && item.imageUrls.length > 0
          ? String(item.imageUrls[0] || "").trim()
          : String(item.imageUrl || "").trim(),
        currentStock: Number(item.currentStock || 0),
        marketPrice: Number(item.marketPrice || item.retailPrice || item.salePrice || 0),
        salePrice: Number(item.salePrice || item.retailPrice || item.marketPrice || 0),
        costPrice: Number(item.purchasePrice || 0),
        commissionPercent: Number(item.commissionPercent || 0),
        commissionAmount: Number(item.commissionAmount || 0),
      })),
    [itemsQuery.data],
  );
  const bankOptions = useMemo(
    () =>
      (banksQuery.data || []).filter((bank) => normalizeText(bank.status || "active") === "active"),
    [banksQuery.data],
  );
  const filteredCustomers = useMemo(
    () => {
      const keyword = String(customerSearch || "").toLowerCase();
      if (!keyword) {
        return customerOptions;
      }
      return customerOptions.filter((customer) => {
        const customerName = String(customer?.name || "").toLowerCase();
        const customerPhone = String(customer?.phone || "");
        const keywordPhone = normalizePhone(keyword);
        return (
          customerName.includes(keyword) ||
          customerPhone.includes(keyword) ||
          (keywordPhone && normalizePhone(customerPhone).includes(keywordPhone))
        );
      });
    },
    [customerOptions, customerSearch],
  );

  const exactCustomerMatch = useMemo(() => {
    const keyword = normalizeText(customerSearch);
    if (!keyword) {
      return null;
    }
    return (
      customerOptions.find((customer) => {
        const customerName = normalizeText(customer?.name);
        const customerPhone = normalizeText(customer?.phone);
        const keywordPhone = normalizePhone(keyword);
        const customerPhoneDigits = normalizePhone(customer?.phone);
        return (
          customerName === keyword ||
          customerPhone === keyword ||
          (keywordPhone && customerPhoneDigits === keywordPhone)
        );
      }) || null
    );
  }, [customerOptions, customerSearch]);

  const filteredItems = useMemo(() => {
    const keyword = normalizeText(itemSearch);
    const searchableItems = itemOptions.filter(
      (item) => String(item.status || "").toLowerCase() !== "inactive",
    );
    if (!keyword) {
      return searchableItems.slice(0, 80);
    }

    const startsWith = [];
    const contains = [];
    searchableItems.forEach((item) => {
      const name = normalizeText(item.name);
      const sku = normalizeText(item.sku);
      const barcode = normalizeText(item.barcode);
      const haystack = `${name} ${sku} ${barcode}`.trim();
      if (!haystack.includes(keyword)) {
        return;
      }
      if (name.startsWith(keyword) || sku.startsWith(keyword) || barcode.startsWith(keyword)) {
        startsWith.push(item);
      } else {
        contains.push(item);
      }
    });

    return [...startsWith, ...contains];
  }, [itemOptions, itemSearch]);

  const categoryOptions = useMemo(() => {
    const unique = new Set(["All"]);
    itemOptions.forEach((item) => {
      const categoryName = String(item.categoryName || "General").trim();
      if (categoryName) {
        unique.add(categoryName);
      }
    });
    return Array.from(unique).slice(0, 30);
  }, [itemOptions]);

  const catalogItems = useMemo(() => {
    const sourceItems = itemSearch ? filteredItems : itemOptions;
    const visible = sourceItems.filter((item) => {
      if (String(item.status || "").toLowerCase() === "inactive") {
        return false;
      }
      if (selectedCategory === "All") {
        return true;
      }
      return String(item.categoryName || "General") === selectedCategory;
    });
    return visible.slice(0, itemSearch ? 120 : 60);
  }, [filteredItems, itemOptions, itemSearch, selectedCategory]);

  const activeLineItemIds = useMemo(
    () => new Set(lines.map((line) => Number(line.itemId || 0)).filter((id) => id > 0)),
    [lines],
  );
  const showInvoiceItemDropdown =
    showItemDropdown && activeItemSearchPanel === "invoice" && Boolean(itemSearch);
  const showBrowserItemDropdown =
    showItemDropdown && activeItemSearchPanel === "browser" && Boolean(itemSearch);
  const blurNumberInputOnWheel = (event) => {
    event.currentTarget.blur();
  };
  const autoInvoiceNo = useMemo(() => {
    if (!autoInvoicePrefix) {
      return "";
    }
    const currentYear = new Date().getFullYear();
    const prefix = `${String(autoInvoicePrefix).trim().toUpperCase()}-${currentYear}-`;
    let maxSequence = 0;

    (salesListQuery.data || []).forEach((sale) => {
      const invoiceValue = String(sale?.invoiceNo || "").trim().toUpperCase();
      if (invoiceValue.startsWith(prefix)) {
        const rawSequence = Number(invoiceValue.slice(prefix.length));
        if (Number.isFinite(rawSequence) && rawSequence > maxSequence) {
          maxSequence = rawSequence;
        }
      }
    });

    return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
  }, [autoInvoicePrefix, salesListQuery.data]);
  const displayInvoiceNo = String(invoiceNo || autoInvoiceNo || "").trim();

  const saveSalesmanOption = (value) => {
    const nextValue = String(value || "").trim();
    if (!nextValue) {
      return;
    }
    setSalesmanOptions((prev) => {
      if (prev.some((entry) => entry.toLowerCase() === nextValue.toLowerCase())) {
        return prev;
      }
      const next = [nextValue, ...prev].slice(0, 100);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SALESMEN_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };
  const focusNextPosField = (currentField) => {
    if (typeof window === "undefined" || !posShellRef.current || !currentField) {
      return;
    }
    const fields = Array.from(
      posShellRef.current.querySelectorAll("input, select, textarea"),
    ).filter((field) => {
      if (!(field instanceof HTMLElement)) {
        return false;
      }
      if (field.dataset.enterSkip === "true" || field.hasAttribute("disabled")) {
        return false;
      }
      if (field instanceof HTMLInputElement && (field.type === "hidden" || field.readOnly)) {
        return false;
      }
      const styles = window.getComputedStyle(field);
      return styles.display !== "none" && styles.visibility !== "hidden";
    });
    const currentIndex = fields.indexOf(currentField);
    if (currentIndex < 0) {
      return;
    }
    const nextField = fields.slice(currentIndex + 1).find((field) => field instanceof HTMLElement);
    if (!(nextField instanceof HTMLElement)) {
      return;
    }
    nextField.focus();
    if (nextField instanceof HTMLInputElement || nextField instanceof HTMLTextAreaElement) {
      nextField.select?.();
    }
  };
  const handleEnterAsNextField = (event) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return;
    }
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }
    if (target.dataset.enterSkip === "true") {
      return;
    }
    event.preventDefault();
    focusNextPosField(target);
  };

  const handleSelectCustomer = (customer) => {
    const safeCustomer = {
      ...customer,
      partyNumber: String(customer?.partyNumber || ""),
      name: normalizePartyInputValue(customer?.name || ""),
      phone: String(customer?.phone || ""),
      city: normalizePartyInputValue(customer?.city || ""),
      openingBalance: Number(customer?.openingBalance || 0),
    };
    setSelectedCustomer(safeCustomer);
    setCustomerSearch(safeCustomer.name);
    setCustomerPhone(safeCustomer.phone);
    setCustomerCity(safeCustomer.city);
    setCustomerFieldEditState({ phone: false, city: false });
    setCustomerFeedback("");
    setShowCustomerDropdown(false);
  };

  const handleCreateCustomer = () => {
    const name = String(customerSearch || "").trim();
    if (!name || createCustomerMutation.isPending) {
      return;
    }
    const existing = customerOptions.find(
      (customer) => String(customer?.name || "").toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      handleSelectCustomer(existing);
      return;
    }
    createCustomerMutation.mutate({
      name: normalizePartyInputValue(name),
      phone: customerPhone.trim() || undefined,
      address: normalizePartyInputValue(customerCity).trim() || undefined,
      type: "CUSTOMER",
    });
  };

  const handleQuickBarcodeAdd = () => {
    const keyword = normalizeText(barcodeSearch);
    if (!keyword) {
      return;
    }
    const matchedItem = itemOptions.find((item) => {
      const barcodeKey = normalizeText(item.barcode);
      const skuKey = normalizeText(item.sku);
      const nameKey = normalizeText(item.name);
      return barcodeKey === keyword || skuKey === keyword || nameKey === keyword;
    });
    if (!matchedItem) {
      setSaleFeedback({ type: "error", message: `No product found for "${barcodeSearch}".` });
      return;
    }
    setSaleFeedback(null);
    addItem(matchedItem);
    setBarcodeSearch("");
  };

  const openItemDropdown = (panel, value) => {
    if (itemDropdownCloseTimeoutRef.current && typeof window !== "undefined") {
      window.clearTimeout(itemDropdownCloseTimeoutRef.current);
      itemDropdownCloseTimeoutRef.current = null;
    }
    setItemSearch(value);
    setShowItemDropdown(true);
    setActiveItemSearchPanel(panel);
  };

  const closeItemDropdown = () => {
    if (itemDropdownCloseTimeoutRef.current && typeof window !== "undefined") {
      window.clearTimeout(itemDropdownCloseTimeoutRef.current);
      itemDropdownCloseTimeoutRef.current = null;
    }
    setShowItemDropdown(false);
    setActiveItemSearchPanel(null);
  };

  const scheduleItemDropdownClose = () => {
    if (typeof window === "undefined") {
      closeItemDropdown();
      return;
    }
    if (itemDropdownCloseTimeoutRef.current) {
      window.clearTimeout(itemDropdownCloseTimeoutRef.current);
    }
    itemDropdownCloseTimeoutRef.current = window.setTimeout(() => {
      closeItemDropdown();
    }, 120);
  };

  const buildSalePayload = (mode) => {
    const customerName = String(selectedCustomer?.name || customerSearch || "").trim();
    if (lines.length === 0) {
      setSaleFeedback({ type: "error", message: "At least one item is required." });
      return null;
    }

    const activePayments = (payments || [])
      .map((entry) => ({
        method: String(entry.method || "").trim().toLowerCase() === "bank" ? "bank" : "cash",
        bankAccountId: String(entry.method || "").trim().toLowerCase() === "bank" ? String(entry.bankAccountId || "").trim() : "",
        amount: Number(entry.amount || 0),
      }))
      .filter((entry) => entry.amount > 0 && entry.method);
    const invalidBankPayment = activePayments.find(
      (entry) => entry.method === "bank" && !Number(entry.bankAccountId || 0),
    );
    if (invalidBankPayment) {
      setSaleFeedback({ type: "error", message: "Please select a registered bank for each bank payment." });
      return null;
    }
    const emiPaymentMode = String(emiData.paymentMode || "credit").toLowerCase() === "cash" ? "Cash" : "Credit";
    const bankPaymentAmount =
      mode === "emi"
        ? emiPaymentMode === "Cash"
          ? Number(emiData.advance || 0)
          : 0
        : activePayments
            .filter((entry) => entry.method === "bank")
            .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const selectedBank = bankOptions.find((bank) => Number(bank.id) === Number(emiSelectedBankId || 0));
    if (mode === "emi" && bankPaymentAmount > 0 && !selectedBank) {
      setSaleFeedback({ type: "error", message: "Please select a registered bank." });
      return null;
    }
    const legacyBankPayments = activePayments.filter((entry) => entry.method === "bank");
    const singleBankPayment = legacyBankPayments.length === 1 ? legacyBankPayments[0] : null;
    const remainingAmount =
      mode === "cash"
        ? Math.max(0, Number((totalSale - activePayments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)).toFixed(2)))
        : 0;
    const isCreditCustomerSale = mode === "cash" && Boolean(selectedCustomer?.id) && remainingAmount > 0;
    if (isCreditCustomerSale && !String(promiseDate || "").trim()) {
      setSaleFeedback({ type: "error", message: "Please enter promise date." });
      return null;
    }
    const paymentMethod =
      mode === "hold"
        ? "Hold"
        : mode === "emi"
          ? `EMI ${emiPaymentMode}`
          : activePayments.length > 0
            ? activePayments
                .map((entry) => {
                  return `${buildPaymentLabel(entry, bankOptions)} ${formatCurrency(entry.amount)}`;
                })
                .join(" + ")
            : "Cash";

    const emiDeliveryPolicy = String(emiData.deliveryPolicy || "BEFORE_PAYMENT").toUpperCase();
    const emiDeliveryLabel = emiDeliveryPolicy === "AFTER_PAYMENT" ? "After Payment" : "Before Payment";

    const paymentNote =
      mode === "cash" && activePayments.length > 0
        ? `Payment breakdown: ${activePayments
            .map((entry) => {
              return `${buildPaymentLabel(entry, bankOptions)} ${entry.amount}`;
            })
            .join(", ")}`
        : "";
    const emiNote =
      mode === "emi"
        ? `EMI payment ${emiPaymentMode}, markup ${emiData.markup || 0}%, advance ${emiData.advance || 0}, installments ${emiData.installments || 0}, delivery ${emiDeliveryLabel}${selectedBank && bankPaymentAmount > 0 ? `, bank ${selectedBank.bankName}` : ""}.`
        : "";
    const extraChargeAmount = Number(extraCharge.amount || 0);
    const extraChargeRemark = String(extraCharge.remark || "").trim();
    const extraChargeNote =
      extraChargeAmount > 0
        ? `Extra charges ${extraChargeAmount}${extraChargeRemark ? ` | Extra charges remark: ${extraChargeRemark}` : ""}`
        : "";

    const mergedNotes = isEditMode
      ? [notes, extraChargeNote].filter(Boolean).join(" | ")
      : [notes, paymentNote, emiNote, extraChargeNote].filter(Boolean).join(" | ");

    const payloadItems = lines.map((line) => {
      const quantity = Number(line.qty || 0);
      const saleRate = Number(line.salePrice || 0);
      const discountAmount = Number(line.extraDiscount || 0);
      const subtotal = quantity * saleRate;
      const discountedTotal = Math.max(0, subtotal - discountAmount);
      const effectiveUnitPrice = quantity > 0 ? discountedTotal / quantity : saleRate;
      return {
        itemId: line.itemId,
        itemName: line.name,
        quantity,
        unitPrice: Number(effectiveUnitPrice.toFixed(2)),
        taxPercent: 0,
        commissionPercent: Number(line.commissionPercent || 0),
        commissionAmount: Number(line.commissionAmount || 0),
        remark: String(line.remark || "").trim() || undefined,
      };
    });
    if (extraChargeAmount > 0) {
      payloadItems.push({
        itemName: "Extra Charges",
        quantity: 1,
        unitPrice: Number(extraChargeAmount.toFixed(2)),
        taxPercent: 0,
      });
    }

    return {
      invoiceNo: invoiceNo.trim() || undefined,
      customerId: selectedCustomer?.id || undefined,
      customerName: normalizePartyInputValue(customerName) || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerCity: normalizePartyInputValue(customerCity).trim() || undefined,
      promiseDate:
        mode === "cash"
          ? isCreditCustomerSale
            ? String(promiseDate || "").trim() || undefined
            : null
          : null,
      paymentMethod,
      notes: mergedNotes || undefined,
      deliveryPolicy: mode === "emi" ? emiDeliveryPolicy : undefined,
      bankAccountId:
        mode === "emi"
          ? selectedBank && bankPaymentAmount > 0
            ? selectedBank.id
            : undefined
          : singleBankPayment
            ? Number(singleBankPayment.bankAccountId)
            : undefined,
      bankAmount:
        mode === "emi"
          ? selectedBank && bankPaymentAmount > 0
            ? bankPaymentAmount
            : undefined
          : legacyBankPayments.length > 0
            ? legacyBankPayments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
            : undefined,
      payments:
        mode === "cash"
          ? activePayments.map((entry) => ({
              method: entry.method,
              amount: Number(entry.amount || 0),
              bankAccountId: entry.method === "bank" ? Number(entry.bankAccountId || 0) || undefined : undefined,
            }))
          : undefined,
      pricingMode: "retail",
      language: "EN",
      userName: salesman.trim() || undefined,
      items: payloadItems,
    };
  };

  const submitSale = () => {
    if (saveSaleMutation.isPending || updateSaleMutation.isPending) {
      return;
    }
    setSaleFeedback(null);
    saveSalesmanOption(salesman);
    const payload = buildSalePayload(
      saleType === "hold" ? "hold" : saleType === "emi" ? "emi" : "cash",
    );
    if (!payload) {
      return;
    }
    if (isEditMode) {
      updateSaleMutation.mutate({ saleId: editingSale.id, payload });
      return;
    }
    saveSaleMutation.mutate(payload);
  };
  const handleSaveSale = () => {
    if (saleType === "cash") {
      if (lines.length === 0) {
        setSaleFeedback({ type: "error", message: "At least one item is required." });
        return;
      }
      setSavedSaleReceipt(null);
      setShowPaymentModal(true);
      return;
    }
    submitSale();
  };

  const handleHoldBill = () => {
    if (saveSaleMutation.isPending) {
      return;
    }
    setSaleFeedback(null);
    saveSalesmanOption(salesman);
    const payload = buildSalePayload("hold");
    if (!payload) {
      return;
    }
    saveSaleMutation.mutate(payload);
  };
  const handleCancelInvoice = () => {
    if (!isEditMode || !editingSale?.id || cancelSaleMutation.isPending || isCancelledInvoice) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Cancel invoice ${editingSale.invoiceNo || `SA-${editingSale.id}`}?`)
    ) {
      return;
    }
    setSaleFeedback(null);
    cancelSaleMutation.mutate({
      saleId: editingSale.id,
      payload: {
        reason: `Cancelled from POS on ${new Date().toLocaleString()}.`,
        userName: salesman.trim() || undefined,
      },
    });
  };
  const handlePrintClientCard = () => {
    if (typeof window === "undefined" || !selectedCustomer) {
      return;
    }
    const clientId = String(selectedCustomer.partyNumber || `CUST-${selectedCustomer.id}`);
    const customerNameValue = String(selectedCustomer.name || customerSearch || COUNTER_SALE_LABEL);
    const customerPhoneValue = String(customerPhone || selectedCustomer.phone || "-");
    const customerLocationValue = String(customerCity || selectedCustomer.city || "-");
    const printWindow = window.open("", "_blank", "width=560,height=420");
    if (!printWindow) {
      setSaleFeedback({ type: "error", message: "Please allow popups to print client card." });
      return;
    }

    const cardHtml = `
      <!doctype html>
	      <html>
	        <head>
	          <meta charset="utf-8" />
	          <title>Client Card - ${escapePrintHtml(clientId)}</title>
	          <style>
              @page {
                size: 2in 1.5in;
                margin: 0;
              }
	            body {
	              margin: 0;
	              font-family: Arial, sans-serif;
	              background: #ffffff;
	              color: #111827;
	            }
	            .sheet {
	              display: flex;
	              justify-content: center;
                align-items: center;
                width: 2in;
                height: 1.5in;
	            }
	            .card {
                width: 2in;
                height: 1.5in;
	              border: 1px solid #cbd5e1;
	              border-radius: 8px;
	              padding: 0.08in;
                box-sizing: border-box;
	              text-align: left;
	              background: #ffffff;
                display: flex;
                flex-direction: column;
                gap: 0.04in;
	            }
              .topline {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
              }
              .title {
                font-size: 8px;
                font-weight: 700;
                letter-spacing: 0.08em;
                color: #475569;
                text-transform: uppercase;
              }
              .client-id {
                font-size: 9px;
                font-weight: 800;
              }
              .detail {
                min-width: 0;
              }
              .detail-label {
                display: block;
                font-size: 7px;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.06em;
              }
              .detail-value {
                display: block;
                font-size: 9px;
                font-weight: 700;
                line-height: 1.15;
                word-break: break-word;
              }
	            .barcode-lines {
	              height: 0.34in;
	              background: repeating-linear-gradient(
	                90deg,
	                #111827 0 2px,
                transparent 2px 4px,
                #111827 4px 5px,
                transparent 5px 8px
              );
	              margin-top: auto;
	              margin-bottom: 0.03in;
	            }
	            .barcode-text {
	              font-size: 8px;
	              letter-spacing: 0.12em;
	              font-weight: 800;
                text-align: center;
	            }
	            @media print {
                body, .sheet {
                  width: 2in;
                  height: 1.5in;
                }
	            }
	          </style>
	        </head>
	        <body>
	          <div class="sheet">
	            <div class="card">
                <div class="topline">
                  <div class="title">Client Card</div>
                  <div class="client-id">${escapePrintHtml(clientId)}</div>
                </div>
                <div class="detail">
                  <span class="detail-label">Name</span>
                  <span class="detail-value">${escapePrintHtml(customerNameValue)}</span>
                </div>
                <div class="detail">
                  <span class="detail-label">Phone</span>
                  <span class="detail-value">${escapePrintHtml(customerPhoneValue)}</span>
                </div>
                <div class="detail">
                  <span class="detail-label">Location</span>
                  <span class="detail-value">${escapePrintHtml(customerLocationValue)}</span>
                </div>
	              <div class="barcode-lines"></div>
	              <div class="barcode-text">${escapePrintHtml(clientId)}</div>
              </div>
	          </div>
          <script>
            window.addEventListener('load', function () {
              setTimeout(function () {
                window.focus();
                window.print();
              }, 150);
            });
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(cardHtml);
    printWindow.document.close();
  };
  const getHistoryInvoiceSnapshot = (record, language = "EN") => {
    const copy = invoiceLanguageCopy[language] || invoiceLanguageCopy.EN;
    const invoiceNo = record?.invoiceNo || `SA-${record?.id || ""}`;
    const customerName = transliterateUrduValue(
      record?.customer?.name || selectedCustomer?.name || COUNTER_SALE_LABEL,
      "customer",
      language,
    );
    const customerPhoneValue = record?.customer?.phone || selectedCustomer?.phone || customerPhone || "-";
    const customerLocationValue = transliterateUrduValue(
      record?.customer?.address || selectedCustomer?.city || customerCity || "-",
      "location",
      language,
    );
    const localizedPaymentMethod = transliterateUrduValue(record?.paymentMethod || "-", "payment", language);
    const invoiceDate = formatInvoiceDateByLanguage(record?.saleDate, language);
    const invoiceTime = record?.saleDate
      ? new Date(record.saleDate).toLocaleTimeString(language === "UR" ? "ur-PK" : "en-PK", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";
    const paidAmount = Number(getPaidAmountFromSale(record) || 0);
    const totalAmount = Number(record?.totalAmount || 0);
    const balanceAmount = Math.max(0, totalAmount - paidAmount);
    const matchedLedgerRow = customerLedgerRows.find((entry) => Number(entry.sale?.id || entry.id) === Number(record?.id || 0));
    const currentBalanceValue = matchedLedgerRow ? Number(matchedLedgerRow.balance || 0) : 0;
    const previousBalanceValue = matchedLedgerRow
      ? Number(matchedLedgerRow.balance || 0) - Number(matchedLedgerRow.credit || 0) + Number(matchedLedgerRow.debit || 0)
      : 0;
    const showCreditBalances = balanceAmount > 0 || currentBalanceValue > 0 || previousBalanceValue > 0;
    const paymentStamp =
      paidAmount >= totalAmount && totalAmount > 0
        ? language === "UR"
          ? "ادا شدہ"
          : "PAID"
        : paidAmount > 0
          ? language === "UR"
            ? "جزوی ادائیگی"
            : "PARTIAL"
          : language === "UR"
            ? "بقایا"
            : "DUE";
    const clientCardNo = record?.customer?.partyNumber || selectedCustomer?.partyNumber || "-";
    const lines = (record?.lines || []).map((line, index) => ({
      id: line.id || `${record?.id || "sale"}-${index}`,
      sr: index + 1,
      itemName: localizeProductNameUrdu(line.itemName || line.item?.name || `Item ${index + 1}`, language),
      qty: formatNumber(line.quantity || 0),
      marketPrice: formatCurrency(line.item?.marketPrice || line.marketPrice || line.unitPrice || 0),
      salePrice: formatCurrency(line.unitPrice || 0),
      total: formatCurrency(line.lineTotal || 0),
    }));
    return {
      copy,
      invoiceNo,
      customerName,
      customerPhoneValue,
      customerLocationValue,
      localizedPaymentMethod,
      invoiceDate,
      invoiceTime,
      clientCardNo,
      userName: String(record?.userName || "-"),
      subtotal: formatCurrency(record?.subtotal || 0),
      taxAmount: formatCurrency(record?.taxAmount || 0),
      totalAmount: formatCurrency(totalAmount),
      paidAmount: formatCurrency(paidAmount),
      balanceAmount: formatCurrency(balanceAmount),
      previousBalance: formatCurrency(previousBalanceValue),
      currentBalance: formatCurrency(currentBalanceValue),
      showCreditBalances,
      paymentStamp,
      billHeading: language === "UR" ? "بل / کیش میمو" : "BILL / CASH MEMO",
      companyName: language === "UR" ? "چائنا بیڈ شیٹ" : "China Bed Sheet",
      companyTagline:
        language === "UR"
          ? "بستر، پردے، کمبل اور ہوم کلیکشن"
          : "Bedsheets, curtains, blankets and home collection",
      contactPills:
        language === "UR"
          ? ["کیش میمو", "ریٹیل سیل", "پرنٹ انوائس"]
          : ["Cash Memo", "Retail Sale", "Printed Invoice"],
      notes: String(record?.notes || "-"),
      lines,
    };
  };
  const buildHistoryInvoiceHtml = (record, language = "EN", paper = "A4") => {
    const snapshot = getHistoryInvoiceSnapshot(record, language);
    const { copy } = snapshot;
    const normalizedPaper = String(paper || "A4").toUpperCase();
    const isThermal = normalizedPaper === "THERMAL";
    const isA5 = normalizedPaper === "A5";
    const maxWidth = isThermal ? "272px" : isA5 ? "540px" : "760px";
    const pageSize = isThermal ? "80mm auto" : `${isA5 ? "A5" : "A4"} portrait`;
    const pageMargin = isThermal ? "4mm" : isA5 ? "10mm" : "12mm";
    const outerPadding = isThermal ? "10px" : isA5 ? "14px" : "16px";
    const logoSize = isThermal ? "40px" : isA5 ? "46px" : "54px";
    const bodyFont = isThermal ? "9px" : isA5 ? "10px" : "11px";
    const lineRows = snapshot.lines
      .map((line) => {
        const itemName = escapePrintHtml(line.itemName);
        return `<tr>
          <td>${escapePrintHtml(line.sr)}</td>
          <td>${itemName}</td>
          <td>${escapePrintHtml(line.qty)}</td>
          <td>${escapePrintHtml(line.marketPrice)}</td>
          <td>${escapePrintHtml(line.salePrice)}</td>
          <td>${escapePrintHtml(line.total)}</td>
        </tr>`;
      })
      .join("");
    return `<!doctype html>
      <html dir="${copy.dir}">
	        <head>
	          <meta charset="utf-8" />
	          <title>${escapePrintHtml(copy.title)} ${escapePrintHtml(snapshot.invoiceNo)} - ${escapePrintHtml(normalizedPaper)}</title>
	          <style>
	            @page { size: ${pageSize}; margin: ${pageMargin}; }
              html, body { width: 100%; }
              *, *::before, *::after { box-sizing: border-box; }
	            body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #111; background: #fff; font-size: ${bodyFont}; overflow-wrap: anywhere; }
	            .invoice { width: 100%; max-width: ${maxWidth}; margin: 0 auto; border: 1px solid #111827; border-radius: ${isThermal ? "8px" : "14px"}; padding: ${outerPadding}; background: #fff; }
	            .brand { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: start; border-bottom: 3px solid #111827; padding-bottom: 12px; }
	            .brand-meta { display: flex; align-items: center; gap: 12px; min-width: 0; }
	            .brand img { width: ${logoSize}; height: ${logoSize}; object-fit: contain; }
              .company { min-width: 0; }
	            .company h1 { margin: 0; font-size: ${isThermal ? "18px" : isA5 ? "22px" : "26px"}; line-height: 1; }
	            .company p { margin: 3px 0 0; font-size: ${isThermal ? "8px" : "10px"}; color: #374151; }
	              .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
	              .pill { border: 1px solid #111827; border-radius: 999px; padding: 3px 8px; font-size: ${isThermal ? "7px" : "9px"}; font-weight: 700; }
	              .barcode-box { display: grid; gap: 5px; justify-items: center; min-width: 0; }
	              .barcode-grid { width: ${isThermal ? "64px" : isA5 ? "86px" : "104px"}; height: ${isThermal ? "28px" : isA5 ? "34px" : "40px"}; background:
                  repeating-linear-gradient(
                    90deg,
                    #111827 0 2px,
                    transparent 2px 3px,
                    #111827 3px 5px,
                    transparent 5px 7px,
                    #111827 7px 8px,
                    transparent 8px 10px,
                    #111827 10px 13px,
                    transparent 13px 15px
                  );
                  border-bottom: 3px solid #111827;
                  background-color: #fff; }
	              .barcode-box span { font-size: ${isThermal ? "7px" : "9px"}; font-weight: 800; text-align: center; letter-spacing: 0.04em; }
	              .doc-head { display: grid; grid-template-columns: repeat(${isThermal ? 2 : 4}, minmax(0, 1fr)); gap: 8px; margin-top: 12px; align-items: start; }
	              .doc-cell { border-bottom: 1px solid #111827; padding-bottom: 6px; }
	              .doc-cell span { display: block; font-size: ${isThermal ? "7px" : "9px"}; color: #475569; margin-bottom: 2px; }
	              .doc-cell strong { display: block; min-width: 0; font-size: ${isThermal ? "9px" : "11px"}; }
	              .stamp { justify-self: ${copy.dir === "rtl" ? "start" : "end"}; align-self: center; font-size: ${isThermal ? "12px" : "18px"}; font-weight: 900; letter-spacing: 0.08em; }
	              .summary { margin-top: 12px; border: 1px solid #111827; }
	              .summary-grid { display: grid; grid-template-columns: repeat(${isThermal ? 1 : 2}, minmax(0, 1fr)); }
	              .summary-item { padding: 8px 10px; border-bottom: 1px solid #111827; }
	              .summary-item:nth-child(odd) { border-${copy.dir === "rtl" ? "left" : "right"}: 1px solid #111827; }
	              .summary-item span { display: inline-block; min-width: ${isThermal ? "70px" : "84px"}; font-size: ${isThermal ? "7px" : "9px"}; color: #475569; }
	              .summary-item strong { display: inline-block; max-width: 100%; font-size: ${isThermal ? "9px" : "11px"}; }
		            table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
		            th, td { border: 1px solid #111827; padding: ${isThermal ? "5px 3px" : "6px 4px"}; text-align: ${copy.dir === "rtl" ? "right" : "left"}; font-size: ${isThermal ? "8px" : "10px"}; word-break: break-word; vertical-align: top; }
	            th { background: #f3f4f6; font-weight: 800; }
	              .bill-title { text-align: center; margin-top: 10px; font-size: ${isThermal ? "11px" : "16px"}; font-weight: 900; display:flex; justify-content:center; align-items:center; gap:${isThermal ? "8px" : "12px"}; flex-wrap:wrap; }
	              .totals { margin-top: 12px; border-top: 2px solid #111827; padding-top: 8px; display: grid; gap: 4px; width: min(100%, 320px); margin-${copy.dir === "rtl" ? "right" : "left"}: auto; }
	              .totals-row { display: flex; justify-content: space-between; gap: 12px; }
	              .footer { display: grid; grid-template-columns: repeat(${isThermal ? 1 : 2}, minmax(0, 1fr)); gap: 18px; margin-top: 18px; }
	              .footer-box { min-height: ${isThermal ? "48px" : "84px"}; }
	              .footer-box h4 { margin: 0 0 8px; font-size: ${isThermal ? "8px" : "11px"}; }
                .footer-box div { font-size: ${isThermal ? "8px" : "10px"}; }
	              .notes { margin-top: 14px; border-top: 1px dashed #111827; padding-top: 10px; }
		            .notes span { display: block; color: #475569; font-size: ${isThermal ? "7px" : "9px"}; margin-bottom: 6px; }
	              .disclaimer { margin-top: 10px; font-size: ${isThermal ? "7px" : "9px"}; line-height: 1.5; color: #374151; text-align: center; }
                @media (max-width: 720px) {
                  .brand, .doc-head, .summary-grid, .footer { grid-template-columns: 1fr; }
                  .summary-item:nth-child(odd) { border-${copy.dir === "rtl" ? "left" : "right"}: 0; }
                }
		            @media print { body { margin: 0; padding: 0; } .invoice { border: 0; border-radius: 0; max-width: none; width: 100%; } }
	          </style>
	        </head>
	        <body>
	          <div class="invoice">
	            <div class="brand">
	              <div class="brand-meta">
	                <img src="${brandLogo}" alt="Logo" />
	                <div class="company">
	                  <h1>${escapePrintHtml(snapshot.companyName)}</h1>
	                  <p>${escapePrintHtml(snapshot.companyTagline)}</p>
                    <div class="pills">
                      ${snapshot.contactPills.map((pill) => `<span class="pill">${escapePrintHtml(pill)}</span>`).join("")}
                    </div>
	                </div>
	              </div>
                <div class="barcode-box">
                  <div class="barcode-grid"></div>
                  <span>${escapePrintHtml(snapshot.invoiceNo)}</span>
                </div>
	            </div>
              <div class="bill-title">${escapePrintHtml(snapshot.billHeading)} <span class="stamp">${escapePrintHtml(snapshot.paymentStamp)}</span></div>
              <div class="doc-head">
                <div class="doc-cell"><span>${escapePrintHtml(copy.invoiceNo)}</span><strong>${escapePrintHtml(snapshot.invoiceNo)}</strong></div>
                <div class="doc-cell"><span>${escapePrintHtml(copy.date)}</span><strong>${escapePrintHtml(snapshot.invoiceDate)}</strong></div>
                <div class="doc-cell"><span>${escapePrintHtml(language === "UR" ? "وقت" : "Time")}</span><strong>${escapePrintHtml(snapshot.invoiceTime)}</strong></div>
                <div class="doc-cell"><span>${escapePrintHtml(language === "UR" ? "یوزر" : "User")}</span><strong>${escapePrintHtml(snapshot.userName)}</strong></div>
              </div>
              <div class="summary">
                <div class="summary-grid">
                  <div class="summary-item"><span>${escapePrintHtml(language === "UR" ? "کلائنٹ کارڈ" : "Client Card No")}</span><strong>${escapePrintHtml(snapshot.clientCardNo)}</strong></div>
                  <div class="summary-item"><span>${escapePrintHtml(copy.paymentMethod)}</span><strong>${escapePrintHtml(snapshot.localizedPaymentMethod)}</strong></div>
                  <div class="summary-item"><span>${escapePrintHtml(copy.customer)}</span><strong>${escapePrintHtml(snapshot.customerName)}</strong></div>
                  <div class="summary-item"><span>${escapePrintHtml(copy.phone)}</span><strong>${escapePrintHtml(snapshot.customerPhoneValue)}</strong></div>
                  <div class="summary-item" style="grid-column:${isThermal ? "auto" : "1 / -1"};"><span>${escapePrintHtml(copy.location)}</span><strong>${escapePrintHtml(snapshot.customerLocationValue)}</strong></div>
                  ${snapshot.showCreditBalances ? `<div class="summary-item"><span>${escapePrintHtml(language === "UR" ? "پچھلا بیلنس" : "Previous Balance")}</span><strong>${escapePrintHtml(snapshot.previousBalance)}</strong></div>` : ""}
                  ${snapshot.showCreditBalances ? `<div class="summary-item"><span>${escapePrintHtml(language === "UR" ? "موجودہ بیلنس" : "Current Balance")}</span><strong>${escapePrintHtml(snapshot.currentBalance)}</strong></div>` : ""}
                </div>
              </div>
	            <table>
	              <thead>
	                <tr>
	                  <th>${escapePrintHtml(language === "UR" ? "سریل" : "Sr#")}</th>
	                  <th>${escapePrintHtml(copy.item)}</th>
	                  <th>${escapePrintHtml(copy.qty)}</th>
	                  <th>${escapePrintHtml(language === "UR" ? "مارکیٹ" : "Market")}</th>
	                  <th>${escapePrintHtml(copy.unitPrice)}</th>
	                  <th>${escapePrintHtml(copy.total)}</th>
	                </tr>
	              </thead>
	              <tbody>
	                ${lineRows || `<tr><td colspan="6" style="text-align:center;">${escapePrintHtml(copy.noItems)}</td></tr>`}
	              </tbody>
	            </table>
	            <div class="totals">
	              <div class="totals-row"><span>${escapePrintHtml(copy.subtotal)}</span><strong>${escapePrintHtml(snapshot.subtotal)}</strong></div>
	              <div class="totals-row"><span>${escapePrintHtml(copy.tax)}</span><strong>${escapePrintHtml(snapshot.taxAmount)}</strong></div>
	              <div class="totals-row"><span>${escapePrintHtml(language === "UR" ? "ادا شدہ" : "Paid")}</span><strong>${escapePrintHtml(snapshot.paidAmount)}</strong></div>
	              <div class="totals-row"><span>${escapePrintHtml(language === "UR" ? "بقایا" : "Balance")}</span><strong>${escapePrintHtml(snapshot.balanceAmount)}</strong></div>
	              <div class="totals-row"><strong>${escapePrintHtml(copy.netTotal)}</strong><strong>${escapePrintHtml(snapshot.totalAmount)}</strong></div>
	            </div>
              <div class="footer">
                <div class="footer-box">
                  <h4>${escapePrintHtml(language === "UR" ? "واپسی شکایت" : "Return / Claim")}</h4>
                  <div>${escapePrintHtml(language === "UR" ? "واپسی مال رسید کے ساتھ ہوگی۔" : "Return accepted with invoice receipt only.")}</div>
                </div>
                <div class="footer-box">
                  <h4>${escapePrintHtml(language === "UR" ? "دستخط" : "Signature")}</h4>
                  <div>${escapePrintHtml(language === "UR" ? "آپ کے اعتماد کا شکریہ" : "Thank you for your business")}</div>
                </div>
              </div>
	            <div class="notes">
	              <span>${escapePrintHtml(copy.notes)}</span>
	              <strong>${escapePrintHtml(snapshot.notes)}</strong>
	            </div>
              <div class="disclaimer">${escapePrintHtml(language === "UR" ? "سامان نکلنے کے بعد واپسی یا ایکسچینج اسٹور پالیسی کے مطابق ہوگی۔" : "Returns and exchanges are subject to store policy after delivery.")}</div>
	          </div>
          <script>
            window.addEventListener('load', function () {
              setTimeout(function () {
                window.focus();
                window.print();
              }, 150);
            });
          </script>
        </body>
      </html>`;
  };
  const openInvoicePreview = (record, language = "EN") => {
    setHistoryInvoiceLanguage(language);
    setHistoryInvoiceView(record || null);
  };
  const handlePrintInvoiceRecord = (record, language = "EN", paper = "A4") => {
    if (typeof window === "undefined" || !record) {
      return;
    }
    const printWindow = window.open("", "_blank", "width=1100,height=820");
    if (!printWindow) {
      setSaleFeedback({ type: "error", message: "Please allow popups to print invoice." });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildHistoryInvoiceHtml(record, language, paper));
    printWindow.document.close();
  };
  const handlePrintHistoryInvoice = (language = historyInvoiceLanguage, paper = "A4") => {
    handlePrintInvoiceRecord(historyInvoiceView, language, paper);
  };
  const handleShareHistoryInvoice = (language = historyInvoiceLanguage) => {
    if (typeof window === "undefined" || !historyInvoiceView) {
      return;
    }
    const copy = invoiceLanguageCopy[language] || invoiceLanguageCopy.EN;
    const customerName = transliterateUrduValue(
      historyInvoiceView?.customer?.name || selectedCustomer?.name || COUNTER_SALE_LABEL,
      "customer",
      language,
    );
    const localizedPaymentMethod = transliterateUrduValue(historyInvoiceView?.paymentMethod || "-", "payment", language);
    const linesText = (historyInvoiceView.lines || [])
      .map((line, index) => `${index + 1}. ${localizeProductNameUrdu(line.itemName || line.item?.name || "Item", language)} x${formatNumber(line.quantity || 0)} = ${formatCurrency(line.lineTotal || 0)}`)
      .join("\n");
    const message = [
      `${copy.title}: ${historyInvoiceView.invoiceNo || `SA-${historyInvoiceView.id}`}`,
      `${copy.date}: ${formatInvoiceDateByLanguage(historyInvoiceView.saleDate, language)}`,
      `${copy.customer}: ${customerName}`,
      `${copy.paymentMethod}: ${localizedPaymentMethod}`,
      "",
      linesText,
      "",
      `${copy.netTotal}: ${formatCurrency(historyInvoiceView.totalAmount || 0)}`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  /* add item to grid */
  const addItem = (item) => {
    setLines((prev) => {
      const exists = prev.find((l) => l.itemId === item.id);
      if (exists) {
        return prev.filter((l) => l.itemId !== item.id);
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode || "",
          qty: 1,
          marketPrice: item.marketPrice,
          salePrice: item.salePrice,
          costPrice: item.costPrice,
          commissionPercent: item.commissionPercent,
          commissionAmount: item.commissionAmount,
          extraDiscount: "",
          remark: "",
        },
      ];
    });
    setItemSearch("");
    closeItemDropdown();
  };

  const updateLine = (itemId, field, value) => {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, [field]: value } : l)),
    );
  };
  const updateLineRemark = (itemId, value, target) => {
    updateLine(itemId, "remark", value);
    resizeTextarea(target);
  };

  const removeLine = (itemId) => setLines((prev) => prev.filter((l) => l.itemId !== itemId));

  const closePaymentModal = ({ notifyParent = false } = {}) => {
    setShowPaymentModal(false);
    setSavedSaleReceipt(null);
    if (notifyParent && typeof onSaved === "function") {
      onSaved();
    }
  };
  const resetPosForm = ({ keepPaymentModal = false, keepSavedSaleReceipt = false } = {}) => {
    setSaleType(initialSaleType);
    setInvoiceNo(shouldAutoInvoiceNo ? autoInvoiceNo : "");
    setCustomerSearch("");
    setSelectedCustomer(null);
    setCustomerPhone("");
    setCustomerCity("");
    setCustomerFieldEditState({ phone: false, city: false });
    setBarcodeSearch("");
    setItemSearch("");
    setSelectedCategory("All");
    setLines([]);
    setNotes("");
    setExtraCharge({ amount: "", remark: "" });
    setPromiseDate("");
    setPayments([createEmptyPaymentRow()]);
    setShowPaymentModal(keepPaymentModal);
    if (!keepSavedSaleReceipt) {
      setSavedSaleReceipt(null);
    }
    setEmiSelectedBankId("");
    setEmiData({
      markup: "",
      advance: "",
      installments: "6",
      deliveryPolicy: "BEFORE_PAYMENT",
      paymentMode: "credit",
    });
    setShowCustomerDropdown(false);
    closeItemDropdown();
    setShowClientLedger(false);
    setShowCustomerHistory(false);
    setHistoryInvoiceView(null);
    setRemarkPreview(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const timer = window.setInterval(() => setPosClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (itemDropdownCloseTimeoutRef.current && typeof window !== "undefined") {
        window.clearTimeout(itemDropdownCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!saleTypes.some((type) => type.key === saleType)) {
      setSaleType(saleTypes[0]?.key || initialSaleType);
    }
  }, [initialSaleType, saleType, saleTypes]);

  useEffect(() => {
    if (!shouldAutoInvoiceNo || !autoInvoiceNo) {
      return;
    }
    setInvoiceNo((current) => (String(current || "").trim() ? current : autoInvoiceNo));
  }, [autoInvoiceNo, shouldAutoInvoiceNo]);

  useEffect(() => {
    if (isEditMode) {
      const paymentMethodKey = normalizeText(editingSale?.paymentMethod);
      const nextSaleType = paymentMethodKey.includes("hold")
        ? "hold"
        : paymentMethodKey.includes("emi")
          ? "emi"
          : "cash";
      setSaleType(
        saleTypes.some((type) => type.key === nextSaleType)
          ? nextSaleType
          : saleTypes[0]?.key || initialSaleType,
      );
      setSalesman(String(editingSale?.userName || ""));
      setInvoiceNo(String(editingSale?.invoiceNo || ""));
      const customerName = normalizePartyInputValue(editingSale?.customer?.name || "");
      const customerPhoneValue = String(editingSale?.customer?.phone || "");
      const customerCityValue = normalizePartyInputValue(editingSale?.customer?.address || "");
      setCustomerSearch(customerName);
      setBarcodeSearch("");
      setSelectedCategory("All");
      setSelectedCustomer(
        editingSale?.customer
          ? {
              id: editingSale.customer.id,
              partyNumber: editingSale.customer.partyNumber || "",
              name: customerName,
              phone: customerPhoneValue,
              city: customerCityValue,
              openingBalance: Number(editingSale.customer.openingBalance || 0),
            }
          : null,
      );
      setCustomerPhone(customerPhoneValue);
      setCustomerCity(customerCityValue);
      setCustomerFieldEditState({ phone: false, city: false });
      setEmiSelectedBankId(String(editingSale?.bankAccountId || editingSale?.bankAccount?.id || ""));
      const rawEditLines = Array.isArray(editingSale?.lines) ? editingSale.lines : [];
      const extraChargeLine = rawEditLines.find(
        (line) => !line.itemId && normalizeText(line.itemName).includes("extra charges"),
      );
      setExtraCharge({
        amount: extraChargeLine ? String(Number(extraChargeLine.lineTotal || extraChargeLine.unitPrice || 0) || "") : "",
        remark: matchNumberFromText(String(editingSale?.notes || ""), /Extra charges remark:\s*([^|]+)/i),
      });
      setPromiseDate(formatInputDate(editingSale?.promiseDate) || extractPromiseDateValue(editingSale?.notes));
      setLines(
        rawEditLines
          .filter((line) => !( !line.itemId && normalizeText(line.itemName).includes("extra charges")))
          .map((line, index) => {
          const matchedItem =
            itemOptions.find((item) => Number(item.id) === Number(line.itemId || 0)) ||
            itemOptions.find((item) => normalizeText(item.name) === normalizeText(line.itemName));
          return {
            itemId: line.itemId || matchedItem?.id || `edit-line-${editingSale.id}-${index}`,
            name: line.itemName || matchedItem?.name || "",
            sku: matchedItem?.sku || "",
            barcode: matchedItem?.barcode || "",
            qty: Number(line.quantity || 0),
            marketPrice: Number(matchedItem?.marketPrice || line.unitPrice || 0),
            salePrice: Number(line.unitPrice || matchedItem?.salePrice || 0),
            costPrice: Number(matchedItem?.costPrice || line.item?.purchasePrice || 0),
            commissionPercent: Number(line.commissionPercent || matchedItem?.commissionPercent || 0),
            commissionAmount: Number(line.commissionAmount || matchedItem?.commissionAmount || 0),
            extraDiscount: "",
            remark: String(line.remark || ""),
          };
        }),
      );
      const existingNotes = String(editingSale?.notes || "");
      const cleanedNotes = existingNotes
        .replace(/\|\s*\[PROMISE_DATE:[^\]]+\]/gi, "")
        .replace(/\[PROMISE_DATE:[^\]]+\]\s*\|/gi, "")
        .replace(/\[PROMISE_DATE:[^\]]+\]/gi, "")
        .replace(/\|\s*Extra charges\s+\d+(?:\.\d+)?(?:\s*\|\s*Extra charges remark:\s*[^|]+)?/gi, "")
        .replace(/Extra charges\s+\d+(?:\.\d+)?(?:\s*\|\s*Extra charges remark:\s*[^|]+)?/gi, "")
        .replace(/\|\s*\|/g, "|")
        .trim()
        .replace(/\|$/, "")
        .trim();
      setNotes(cleanedNotes);
      setPayments(
        nextSaleType === "cash"
          ? Array.isArray(editingSale?.payments) && editingSale.payments.length > 0
            ? editingSale.payments.map((payment) =>
                createEmptyPaymentRow({
                  method: String(payment.method || "cash").toLowerCase(),
                  bankAccountId: String(payment.bankAccountId || ""),
                  amount: String(Number(payment.amount || 0) || ""),
                }),
              )
            : Number(editingSale?.bankAmount || 0) > 0
              ? [
                  createEmptyPaymentRow({
                    method: "bank",
                    bankAccountId: String(editingSale?.bankAccountId || editingSale?.bankAccount?.id || ""),
                    amount: String(Number(editingSale.bankAmount || 0)),
                  }),
                ]
              : [createEmptyPaymentRow()]
          : [createEmptyPaymentRow()],
      );
      setEmiData({
        markup: matchNumberFromText(existingNotes, /markup\s+(\d+(?:\.\d+)?)/i),
        advance:
          matchNumberFromText(existingNotes, /advance\s+(\d+(?:\.\d+)?)/i) ||
          (paymentMethodKey.includes("cash")
            ? String(Number(editingSale?.bankAmount || 0) || "")
            : ""),
        installments:
          matchNumberFromText(existingNotes, /installments\s+(\d+(?:\.\d+)?)/i) || "6",
        deliveryPolicy: matchDeliveryPolicyFromNotes(existingNotes),
        paymentMode: paymentMethodKey.includes("cash") ? "cash" : "credit",
      });
      setShowCustomerDropdown(false);
      closeItemDropdown();
      setShowClientLedger(false);
      setShowCustomerHistory(false);
      setHistoryInvoiceView(null);
      setSaleFeedback(null);
      setIsDraftLoaded(true);
      return;
    }

    if (typeof window === "undefined") {
      setIsDraftLoaded(true);
      return;
    }

    if (forceFresh) {
      window.localStorage.removeItem(draftStorageKey);
      setSaleType(initialSaleType);
      setInvoiceNo(autoInvoiceNo || "");
      setSaleFeedback(null);
      setCustomerFeedback("");
      setIsDraftLoaded(true);
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(draftStorageKey);
      if (!rawDraft) {
        setIsDraftLoaded(true);
        return;
      }

      const draft = JSON.parse(rawDraft);
      if (!draft || typeof draft !== "object") {
        setIsDraftLoaded(true);
        return;
      }

      if (typeof draft.saleType === "string") {
        setSaleType(
          saleTypes.some((type) => type.key === draft.saleType)
            ? draft.saleType
            : initialSaleType,
        );
      }
      if (typeof draft.salesman === "string") setSalesman(draft.salesman);
      if (typeof draft.invoiceNo === "string") setInvoiceNo(draft.invoiceNo);
      if (typeof draft.customerSearch === "string") setCustomerSearch(draft.customerSearch);
      if (draft.selectedCustomer && typeof draft.selectedCustomer === "object") {
        setSelectedCustomer({
          ...draft.selectedCustomer,
          name: normalizePartyInputValue(draft.selectedCustomer.name || ""),
          city: normalizePartyInputValue(draft.selectedCustomer.city || ""),
        });
      }
      if (typeof draft.customerPhone === "string") setCustomerPhone(draft.customerPhone);
      if (typeof draft.customerCity === "string") setCustomerCity(normalizePartyInputValue(draft.customerCity));
      setCustomerFieldEditState({
      phone:
          Boolean(draft.selectedCustomer?.id) &&
          String(draft.customerPhone || "") !== String(draft.selectedCustomer?.phone || ""),
        city:
          Boolean(draft.selectedCustomer?.id) &&
          normalizePartyInputValue(draft.customerCity || "") !== normalizePartyInputValue(draft.selectedCustomer?.city || ""),
      });
      if (Array.isArray(draft.lines)) setLines(draft.lines);
      if (typeof draft.notes === "string") setNotes(draft.notes);
      if (draft.extraCharge && typeof draft.extraCharge === "object") {
        setExtraCharge((prev) => ({ ...prev, ...draft.extraCharge }));
      }
      if (typeof draft.promiseDate === "string") {
        setPromiseDate(draft.promiseDate);
      }
      if (Array.isArray(draft.payments) && draft.payments.length > 0) {
        setPayments(draft.payments.map((entry) => createEmptyPaymentRow(entry)));
      }
      if (typeof draft.emiSelectedBankId === "string") setEmiSelectedBankId(draft.emiSelectedBankId);
      if (draft.emiData && typeof draft.emiData === "object") {
        setEmiData((prev) => ({ ...prev, ...draft.emiData }));
      }

      setSaleFeedback({ type: "success", message: "Previous draft restored." });
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      setIsDraftLoaded(true);
    }
  }, [autoInvoiceNo, draftStorageKey, editingSale, forceFresh, initialSaleType, isEditMode, itemOptions, saleTypes]);

  useEffect(() => {
    if (!categoryOptions.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    if (!exactCustomerMatch) {
      return;
    }

    const matchedCustomer = {
      id: exactCustomerMatch.id,
      partyNumber: String(exactCustomerMatch.partyNumber || ""),
      name: normalizePartyInputValue(exactCustomerMatch.name || ""),
      phone: String(exactCustomerMatch.phone || ""),
      city: normalizePartyInputValue(exactCustomerMatch.city || ""),
      openingBalance: Number(exactCustomerMatch.openingBalance || 0),
    };

    const currentCustomerId = Number(selectedCustomer?.id || 0);
    const matchedCustomerId = Number(matchedCustomer.id || 0);
    if (currentCustomerId === matchedCustomerId) {
      if (!customerFieldEditState.phone && customerPhone !== matchedCustomer.phone) {
        setCustomerPhone(matchedCustomer.phone);
      }
      if (!customerFieldEditState.city && customerCity !== matchedCustomer.city) {
        setCustomerCity(matchedCustomer.city);
      }
      return;
    }

    setSelectedCustomer(matchedCustomer);
    setCustomerPhone(matchedCustomer.phone);
    setCustomerCity(matchedCustomer.city);
    setCustomerFieldEditState({ phone: false, city: false });
    setCustomerFeedback("");
    setShowCustomerDropdown(false);
  }, [customerCity, customerFieldEditState.city, customerFieldEditState.phone, customerPhone, exactCustomerMatch, selectedCustomer]);

  useEffect(() => {
    if (isEditMode || !isDraftLoaded || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      const draft = {
        saleType,
        salesman,
        invoiceNo,
        customerSearch,
        selectedCustomer,
        customerPhone,
        customerCity,
        lines,
        notes,
        extraCharge,
        promiseDate,
        payments,
        emiSelectedBankId,
        emiData,
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    customerCity,
    customerPhone,
    customerSearch,
    draftStorageKey,
    emiData,
    invoiceNo,
    isEditMode,
    isDraftLoaded,
    lines,
    notes,
    payments,
    promiseDate,
    emiSelectedBankId,
    extraCharge,
    saleType,
    salesman,
    selectedCustomer,
  ]);

  /* totals */
  const { totalMarket, totalSale, totalCost, totalProfit } = useMemo(() => {
    let totalMarket = 0;
    let totalSale = 0;
    let totalCost = 0;
    let totalProfit = 0;
    lines.forEach((l) => {
      const calc = calcLine(l);
      totalMarket += calc.market;
      totalSale += calc.total;
      totalCost += calc.cost;
      totalProfit += calc.profit;
    });
    const extraChargeAmount = Number(extraCharge.amount || 0);
    if (extraChargeAmount > 0) {
      totalSale += extraChargeAmount;
      totalProfit += extraChargeAmount;
    }
    return { totalMarket, totalSale, totalCost, totalProfit };
  }, [extraCharge.amount, lines]);
  const totalSave = totalMarket - totalSale;
  const isCancelledInvoice = isEditMode && normalizeText(editingSale?.paymentMethod).includes("cancel");

  const totalPaid =
    saleType === "emi"
      ? Number(emiData.advance || 0)
      : saleType === "hold"
        ? 0
        : payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  /* EMI calc */
  const emiMarkup = Number(emiData.markup || 0);
  const emiAdvance = Number(emiData.advance || 0);
  const emiInstallments = Number(emiData.installments || 0);
  const emiTotal = totalSale * (1 + emiMarkup / 100);
  const emiMonthly = emiInstallments > 0
    ? Math.ceil((emiTotal - emiAdvance) / emiInstallments)
    : 0;

  const customerSales = useMemo(() => {
    if (!selectedCustomer?.id) {
      return [];
    }
    return (salesListQuery.data || [])
      .filter(
        (sale) => Number(sale.customerId || sale.customer?.id || 0) === Number(selectedCustomer.id),
      )
      .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [salesListQuery.data, selectedCustomer]);

  const customerLedgerRows = useMemo(() => {
    if (!selectedCustomer?.id) {
      return [];
    }
    const openingBalance = Number(
      customerLedgerQuery.data?.openingBalance ?? selectedCustomer.openingBalance ?? 0,
    );
    let runningBalance = openingBalance;
    return [...customerSales]
      .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime())
      .map((sale) => {
        const credit = Number(sale.totalAmount || 0);
        const debit = Number(getPaidAmountFromSale(sale) || 0);
        runningBalance += credit - debit;
        return {
          id: sale.id,
          date: sale.saleDate ? String(sale.saleDate).slice(0, 10) : "-",
          invoiceNo: sale.invoiceNo || `SA-${sale.id}`,
          description: sale.notes || `Sale Invoice ${sale.invoiceNo || `SA-${sale.id}`}`,
          debit,
          credit,
          balance: runningBalance,
          sale,
        };
      });
  }, [customerLedgerQuery.data, customerSales, selectedCustomer]);

  const resolvedLedgerRowBalance = customerLedgerRows.length > 0
    ? Number(customerLedgerRows[customerLedgerRows.length - 1].balance || 0)
    : null;
  const customerLedgerBalance = resolvedLedgerRowBalance !== null
    ? resolvedLedgerRowBalance
    : Number.isFinite(Number(customerLedgerQuery.data?.balance))
      ? Number(customerLedgerQuery.data.balance)
      : Number(selectedCustomer?.openingBalance || 0);
  const prevBalance = selectedCustomer ? customerLedgerBalance : 0;
  const newBalance = prevBalance + totalSale - totalPaid;
  const paymentRemaining = Math.max(0, totalSale - totalPaid);
  const requiresPromiseDate = saleType === "cash" && Boolean(selectedCustomer?.id) && paymentRemaining > 0;
  const lastCustomerVisit = customerSales.length > 0 ? customerSales[0]?.saleDate : null;
  const activeHistoryInvoiceSnapshot = historyInvoiceView
    ? getHistoryInvoiceSnapshot(historyInvoiceView, historyInvoiceLanguage)
    : null;

  const itemHistoryMap = useMemo(() => {
    const map = new Map();
    (salesListQuery.data || []).forEach((sale) => {
      const date = sale.saleDate ? String(sale.saleDate).slice(0, 10) : "-";
      const invoice = sale.invoiceNo || `SA-${sale.id}`;
      const customer = sale.customer?.name || COUNTER_SALE_LABEL;
      (sale.lines || []).forEach((line) => {
        const itemIdKey = line.itemId ? `id:${line.itemId}` : null;
        const itemNameKey = `name:${normalizeText(line.itemName)}`;
        const entry = {
          id: `${sale.id}-${line.id}`,
          date,
          invoice,
          customer,
          qty: Number(line.quantity || 0),
          rate: Number(line.unitPrice || 0),
          purchaseCost: Number(line.item?.purchasePrice || 0),
        };
        if (itemIdKey) {
          if (!map.has(itemIdKey)) {
            map.set(itemIdKey, []);
          }
          map.get(itemIdKey).push(entry);
        }
        if (!map.has(itemNameKey)) {
          map.set(itemNameKey, []);
        }
        map.get(itemNameKey).push(entry);
      });
    });
    map.forEach((entries, key) => {
      map.set(
        key,
        [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      );
    });
    return map;
  }, [salesListQuery.data]);

  useEffect(() => {
    if (!selectedCustomer) {
      setShowClientLedger(false);
      setShowCustomerHistory(false);
      setHistoryInvoiceView(null);
    }
  }, [selectedCustomer]);

  useEffect(() => {
    if (saleType !== "cash") {
      setPayments([createEmptyPaymentRow()]);
      setShowPaymentModal(false);
    }
  }, [saleType]);

  useEffect(() => {
    const currentCount = lines.length;
    const previousCount = previousLineCountRef.current;
    if (currentCount > previousCount) {
      const wrap = invoiceItemsWrapRef.current;
      if (wrap) {
        wrap.scrollTop = wrap.scrollHeight;
      }
    }
    previousLineCountRef.current = currentCount;
  }, [lines]);

  useEffect(() => {
    if (saleType === "emi" && String(emiData.paymentMode || "credit").toLowerCase() === "cash") {
      return;
    }
    setEmiSelectedBankId("");
  }, [emiData.paymentMode, saleType]);

  return (
    <div className="pos-shell" ref={posShellRef} onKeyDownCapture={handleEnterAsNextField}>
      {/* ── Sale Type Bar ── */}
      <div className="pos-top-strip">
        <div className="pos-type-bar">
          {saleTypes.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`pos-type-btn${saleType === t.key ? " pos-type-btn--active" : ""}`}
              onClick={() => setSaleType(t.key)}
              disabled={lockSaleType}
            >
              {t.label}
            </button>
          ))}
          {typeof onOpenHoldBills === "function" && (
            <button
              type="button"
              className="pos-type-btn"
              onClick={onOpenHoldBills}
            >
              Clear Hold Bill
            </button>
          )}
        </div>
        <div className="pos-top-strip__meta">
          {showInvoiceCornerBadge && (
            <div className="pos-invoice-badge">
              <small>Invoice No</small>
              <strong>{displayInvoiceNo || "Auto"}</strong>
            </div>
          )}
          <div className="pos-time-card">
            <span>{posClock.toLocaleTimeString()}</span>
            <small>{posClock.toLocaleDateString()}</small>
          </div>
        </div>
      </div>

      <div className="pos-layout">
        {/* ─── LEFT COLUMN ─── */}
        <div className="pos-left">
          {/* Salesman + Customer */}
          <div className="pos-card">
            <SectionTitle icon={User} title="Salesman & Customer" />
            <div className="pos-grid-2">
              <label className="pos-label">
                Salesman
                <input
                  className="pos-input"
                  list="pos-salesman-list"
                  placeholder="Type or select salesman..."
                  value={salesman}
                  onChange={(e) => setSalesman(e.target.value)}
                  onBlur={(event) => saveSalesmanOption(event.target.value)}
                />
                <datalist id="pos-salesman-list">
                  {salesmanOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </datalist>
              </label>

		              {!showInvoiceCornerBadge && (
		                <label className="pos-label">
		                  Invoice No
		                  <input
		                    className="pos-input"
		                    placeholder={shouldAutoInvoiceNo ? "Auto generated" : "e.g. SA-2026-001"}
		                    value={invoiceNo}
		                    onChange={(e) => setInvoiceNo(e.target.value)}
                      readOnly={shouldAutoInvoiceNo}
                      disabled={shouldAutoInvoiceNo}
		                  />
		                </label>
		              )}
		
                {!hideBarcodeField && (
	                <label className="pos-label">
	                  Barcode / SKU
		                  <input
		                    className="pos-input"
                        data-enter-skip="true"
		                    placeholder="Scan barcode or SKU..."
		                    value={barcodeSearch}
		                    onChange={(event) => setBarcodeSearch(event.target.value)}
	                    onKeyDown={(event) => {
	                      if (event.key === "Enter") {
	                        event.preventDefault();
	                        handleQuickBarcodeAdd();
	                      }
	                    }}
	                  />
	                </label>
                )}

              <div className="pos-label" style={{ position: "relative" }}>
                Customer Name / Phone
                <div style={{ position: "relative" }}>
                  <input
                    className="pos-input"
                    placeholder="Search customer..."
                    value={customerSearch}
                    onChange={(e) => {
                      const nextValue = normalizePartyInputValue(e.target.value);
                      setCustomerSearch(nextValue);
                      setShowCustomerDropdown(true);
                      setCustomerFeedback("");
                      if (!nextValue) {
                        setSelectedCustomer(null);
                        setCustomerPhone("");
                        setCustomerCity("");
                        setCustomerFieldEditState({ phone: false, city: false });
                      } else if (
                        selectedCustomer &&
                        nextValue.trim().toLowerCase() !==
                          String(selectedCustomer?.name || "").toLowerCase()
                      ) {
                        setSelectedCustomer(null);
                        setCustomerPhone("");
                        setCustomerCity("");
                        setCustomerFieldEditState({ phone: false, city: false });
                      }
                    }}
	                    onFocus={() => setShowCustomerDropdown(true)}
	                    onBlur={() => window.setTimeout(() => setShowCustomerDropdown(false), 120)}
	                  />
                  {showCustomerDropdown && customerSearch && (
                    <div className="pos-dropdown">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="pos-dropdown-item"
                            onMouseDown={() => handleSelectCustomer(c)}
                          >
                            <strong>{c.name}</strong>
                            <span>{c.phone} — {c.city}</span>
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          className="pos-dropdown-item"
                          onMouseDown={handleCreateCustomer}
                          disabled={createCustomerMutation.isPending}
                        >
                          <strong>
                            {createCustomerMutation.isPending
                              ? "Adding customer..."
                              : `Add customer: ${customerSearch}`}
                          </strong>
                          <span>Customer record will be created and selected.</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <label className="pos-label">
                Phone No
                <input
                  className="pos-input"
                  placeholder="03xx-xxxxxxx"
                  value={customerPhone}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCustomerPhone(nextValue);
                    if (selectedCustomer?.id) {
                      setCustomerFieldEditState((prev) => ({ ...prev, phone: true }));
                      setSelectedCustomer((prev) => (prev ? { ...prev, phone: nextValue } : prev));
                    }
                  }}
                />
              </label>

              <label className="pos-label">
                City
                <input
                  className="pos-input"
                  placeholder="City"
                  value={customerCity}
                  onChange={(event) => {
                    const nextValue = normalizePartyInputValue(event.target.value);
                    setCustomerCity(nextValue);
                    if (selectedCustomer?.id) {
                      setCustomerFieldEditState((prev) => ({ ...prev, city: true }));
                      setSelectedCustomer((prev) => (prev ? { ...prev, city: nextValue } : prev));
                    }
                  }}
                />
              </label>
            </div>

            {customerFeedback ? <div className="hint-line">{customerFeedback}</div> : null}
            {selectedCustomer && (
              <div className="pos-customer-info">
                <InfoRow label="Last Balance (Receivable)" value={formatCurrency(customerLedgerBalance)} />
                <InfoRow label="Last Visit" value={formatDateTime(lastCustomerVisit)} />
                <div className="pos-customer-btns">
                  <button
                    type="button"
                    className="pos-sm-btn"
                    onClick={() => setShowClientLedger(true)}
                  >
                    <BookOpen size={13} /> Customer Ledger
                  </button>
                  <button
                    type="button"
                    className="pos-sm-btn"
                    onClick={handlePrintClientCard}
                  >
                    <Printer size={13} /> Print Client Card
                  </button>
                  <button
                    type="button"
                    className="pos-sm-btn"
                    onClick={() => setShowCustomerHistory((prev) => !prev)}
                  >
                    <History size={13} /> {showCustomerHistory ? "Hide History" : "Sales History"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Client Ledger */}
          {false && showClientLedger && selectedCustomer && (
            <div className="pos-card">
              <SectionTitle icon={BookOpen} title={`Client Ledger — ${selectedCustomer.name}`} />
		              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Debit</th>
                      <th>Credit</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>2026-03-01</td>
                      <td>Sale Invoice SA-1590</td>
                      <td>{formatCurrency(6500)}</td>
                      <td>—</td>
                      <td>{formatCurrency(6500)}</td>
                    </tr>
                    <tr>
                      <td>2026-03-05</td>
                      <td>Payment Received</td>
                      <td>—</td>
                      <td>{formatCurrency(5000)}</td>
                      <td>{formatCurrency(1500)}</td>
                    </tr>
                    <tr className="pos-balance-row">
                      <td colSpan={4}><strong>Current Balance</strong></td>
                      <td><strong>{formatCurrency(selectedCustomer.balance)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {false && showClientLedger && selectedCustomer && (
            <div className="pos-card">
              <SectionTitle icon={BookOpen} title={`Ledger - ${selectedCustomer.name}`} />
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
                    {customerLedgerQuery.isLoading ? (
                      <tr>
                        <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                          Loading customer ledger...
                        </td>
                      </tr>
                    ) : customerLedgerRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                          No ledger entries yet.
                        </td>
                      </tr>
                    ) : (
                      customerLedgerRows.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.date}</td>
                          <td>{entry.invoiceNo}</td>
                          <td>{entry.description}</td>
                          <td>{entry.debit ? formatCurrency(entry.debit) : "-"}</td>
                          <td>{entry.credit ? formatCurrency(entry.credit) : "-"}</td>
                          <td>{formatCurrency(entry.balance)}</td>
                          <td>
                              <button
                                type="button"
                                className="small-btn small-btn--ghost"
                                onClick={() => {
                                  setHistoryInvoiceLanguage("EN");
                                  setHistoryInvoiceView(entry.sale);
                                }}
                              >
                                View
                              </button>
                          </td>
                        </tr>
                      ))
                    )}
                    <tr className="pos-balance-row">
                      <td colSpan={5}><strong>Current Balance</strong></td>
                      <td><strong>{formatCurrency(customerLedgerBalance)}</strong></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCustomerHistory && selectedCustomer && (
            <div className="pos-card">
              <SectionTitle icon={History} title={`Sales History - ${selectedCustomer.name}`} />
              <div className="table-wrap">
                <table className="pos-item-table">
                  <thead>
                    <tr>
                      <th>Visit Date & Time</th>
                      <th>Invoice</th>
                      <th>Payment Method</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesListQuery.isLoading ? (
                      <tr>
                        <td colSpan={5} className="hint-line" style={{ padding: "12px" }}>
                          Loading customer history...
                        </td>
                      </tr>
                    ) : customerSales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="hint-line" style={{ padding: "12px" }}>
                          No sales history found for this customer.
                        </td>
                      </tr>
                    ) : (
                      customerSales.map((sale) => (
                        <tr key={sale.id}>
                          <td>{formatDateTime(sale.saleDate)}</td>
                          <td>{sale.invoiceNo || `SA-${sale.id}`}</td>
                          <td>{sale.paymentMethod || "-"}</td>
                          <td>{formatCurrency(sale.totalAmount)}</td>
                          <td>
                              <button
                                type="button"
                                className="small-btn small-btn--ghost"
                                onClick={() => {
                                  setHistoryInvoiceLanguage("EN");
                                  setHistoryInvoiceView(sale);
                                }}
                              >
                                View
                              </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Item Search + Grid */}
          <div className="pos-card pos-card--items">
            <SectionTitle icon={Package} title="Invoice Items" />
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div className="pos-item-search">
                <Search size={14} />
                <input
                  className="pos-input pos-input--search"
                  placeholder="Search product / variation / barcode..."
                  value={itemSearch}
                  onChange={(e) => openItemDropdown("invoice", e.target.value)}
                  onFocus={(e) => openItemDropdown("invoice", e.target.value)}
                  onBlur={scheduleItemDropdownClose}
                />
              </div>
              {showInvoiceItemDropdown && (
                <div className="pos-dropdown">
                  {filteredItems.length === 0 ? (
                    <div className="pos-dropdown-empty">No item found</div>
                  ) : (
                    filteredItems.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        className="pos-dropdown-item"
                        onMouseDown={() => addItem(it)}
                      >
                        <strong>{it.name}</strong>
                        <span>
                          SKU: {it.sku} | Stock: {formatNumber(it.currentStock)} | Sale: {formatCurrency(it.salePrice)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="pos-empty-grid">
                <Package size={28} />
                <span>No items added yet. Search above to add items.</span>
              </div>
            ) : (
	              <div
                  ref={invoiceItemsWrapRef}
                  className="table-wrap pos-table-wrap--items"
                >
                <table className="pos-item-table">
                  <thead>
                    <tr>
                      <th>Sr#</th>
                      <th>Item Name</th>
                      <th>Qty</th>
                      <th>Market Price</th>
                      <th>Sale Price</th>
                      <th>Disc Amount</th>
                      <th>Remark</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const calc = calcLine(line);
                      const history =
                        itemHistoryMap.get(`id:${line.itemId}`) ||
                        itemHistoryMap.get(`name:${normalizeText(line.name)}`) ||
                        [];
                      return (
                        <>
                          <tr key={line.itemId}>
                            <td>{index + 1}</td>
		                            <td className={expandItemNameColumn ? "pos-item-name-col pos-item-name-col--wide" : "pos-item-name-col"}>
		                              <div className="pos-item-cell">
		                                <span>{line.name}</span>
		                                <small className="pos-info-label">{line.sku}</small>
                                {line.barcode ? (
                                  <small className="pos-info-label">Barcode: {line.barcode}</small>
                                ) : null}
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
                                  Item History
                                  {showItemHistory === line.itemId ? (
                                    <ChevronUp size={11} />
                                  ) : (
                                    <ChevronDown size={11} />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input"
	                                value={line.qty}
	                                min={1}
                                  onWheel={blurNumberInputOnWheel}
	                                onChange={(e) => updateLine(line.itemId, "qty", e.target.value)}
	                              />
                            </td>
		                            <td className={editableMarketPrice ? "" : "pos-market-price"}>
	                                {editableMarketPrice ? (
		                                  <input
	                                    type="number"
	                                    className="pos-cell-input pos-cell-input--wide"
	                                    value={line.marketPrice}
                                      onWheel={blurNumberInputOnWheel}
	                                    onChange={(e) => updateLine(line.itemId, "marketPrice", e.target.value)}
	                                  />
                                ) : (
                                  formatCurrency(calc.market)
                                )}
                              </td>
                            <td>
	                              <input
	                                type="number"
	                                className="pos-cell-input"
	                                value={line.salePrice}
                                  onWheel={blurNumberInputOnWheel}
	                                onChange={(e) => updateLine(line.itemId, "salePrice", e.target.value)}
	                              />
                            </td>
                            <td>
		                              <input
		                                type="number"
		                                className="pos-cell-input"
		                                value={line.extraDiscount}
		                                min={0}
	                                  onWheel={blurNumberInputOnWheel}
		                                onChange={(e) => updateLine(line.itemId, "extraDiscount", e.target.value)}
		                              />
                            </td>
                            <td>
                              <div className="pos-remark-field">
                                <textarea
                                  className="pos-cell-input pos-cell-input--remark"
                                  rows={1}
                                  value={line.remark ?? ""}
                                  placeholder="Remark"
                                  onChange={(e) => updateLineRemark(line.itemId, e.target.value, e.target)}
                                  ref={(element) => resizeTextarea(element)}
                                />
                                <button
                                  type="button"
                                  className="pos-remark-preview-btn"
                                  onClick={() =>
                                    setRemarkPreview({
                                      itemName: line.name,
                                      remark: String(line.remark || "").trim() || "No remark added.",
                                    })
                                  }
                                  title="Preview remark"
                                >
                                  <Eye size={12} />
                                </button>
                              </div>
                            </td>
                            <td><strong>{formatCurrency(calc.total)}</strong></td>
                            <td>
                              <button
                                type="button"
                                className="pos-remove-btn"
                                onClick={() => removeLine(line.itemId)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>

                          {/* Item History Row */}
                          {showItemHistory === line.itemId && (
                            <tr key={`hist-${line.itemId}`} className="pos-history-row">
                              <td colSpan={9}>
                                <div className="pos-item-history">
                                  <strong><History size={12} /> &nbsp;Previous Item History - {line.name}</strong>
                                  {salesListQuery.isLoading ? (
                                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                      Loading item history...
                                    </span>
                                  ) : history.length === 0 ? (
                                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                      No previous sales history found for this item.
                                    </span>
                                  ) : (
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Date</th>
                                          <th>Invoice</th>
                                          <th>Customer</th>
                                          <th>Qty</th>
                                          <th>Purchase Cost</th>
                                          <th>Rate</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {history.map((hist) => (
                                          <tr key={hist.id}>
                                            <td>{hist.date}</td>
                                            <td>{hist.invoice}</td>
                                            <td>{hist.customer}</td>
                                            <td>{formatNumber(hist.qty)}</td>
                                            <td>{formatCurrency(hist.purchaseCost)}</td>
                                            <td><strong>{formatCurrency(hist.rate)}</strong></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals Row */}
            {lines.length > 0 && (
		              <div className="pos-totals">
		                <div className="pos-total-card pos-total-card--market">
		                  <span>Total Market Price</span>
	                  <strong>{formatCurrency(totalMarket)}</strong>
	                </div>
	                <div className="pos-total-card pos-total-card--sale">
	                  <span>Total Sale Price</span>
	                  <strong>{formatCurrency(totalSale)}</strong>
	                </div>
                  {showSavingsTotal && (
	                  <div className="pos-total-card pos-total-card--save">
	                    <span>Total Save</span>
	                    <strong>{formatCurrency(totalSave)}</strong>
	                  </div>
                  )}
                  {showCostAndProfitTotals && (
                    <>
	                  <div className="pos-total-card pos-total-card--save">
	                    <span>Total Purchase Cost</span>
	                    <strong>{formatCurrency(totalCost)}</strong>
	                  </div>
	                  <div className="pos-total-card pos-total-card--save">
	                    <span>Estimated Profit (Sale - Purchase)</span>
	                    <strong>{formatCurrency(totalProfit)}</strong>
	                  </div>
	                    </>
	                  )}
		              </div>
		            )}
              <div className="pos-action-buttons pos-action-buttons--items">
                {!isEditMode && saleType === "hold" ? (
                  <button
                    type="button"
                    className="pos-btn pos-btn--hold"
                    disabled={lines.length === 0 || saveSaleMutation.isPending || cancelSaleMutation.isPending}
                    onClick={handleHoldBill}
                  >
                    <Pause size={16} /> Hold Bill
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pos-btn pos-btn--save"
                    disabled={
                      lines.length === 0 ||
                      saveSaleMutation.isPending ||
                      updateSaleMutation.isPending ||
                      cancelSaleMutation.isPending ||
                      isCancelledInvoice
                    }
                    onClick={handleSaveSale}
                  >
                    {isEditMode ? <Edit size={16} /> : <Plus size={16} />}
                    {isEditMode
                      ? updateSaleMutation.isPending
                        ? "Updating..."
                        : "Update Sale"
                      : saveSaleMutation.isPending
                        ? "Saving..."
                        : saleType === "emi"
                          ? "Save EMI Sale"
                          : "Save Sale"}
                  </button>
                )}
                {isEditMode && (
                  <button
                    type="button"
                    className="pos-btn pos-btn--cancel"
                    disabled={cancelSaleMutation.isPending || isCancelledInvoice}
                    onClick={handleCancelInvoice}
                  >
                    <Trash2 size={16} />
                    {isCancelledInvoice
                      ? "Invoice Cancelled"
                      : cancelSaleMutation.isPending
                        ? "Cancelling..."
                        : "Cancel Invoice"}
                  </button>
                )}
                {saleFeedback ? (
                  <div className="hint-line">{saleFeedback.message}</div>
                ) : null}
              </div>
          </div>

          {/* Notes */}
          <div className="pos-card">
            <label className="pos-label">
              Notes / Remarks
              <textarea
                className="pos-input"
                rows={2}
                placeholder="Any instructions or notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          {saleType !== "cash" && (
            <div className="pos-card">
              <SectionTitle icon={DollarSign} title="Payment" />

              {saleType === "hold" && (
                <div className="hint-line">Hold bill selected. Payment is skipped for now.</div>
              )}

              {saleType === "emi" && (
                <div>
                  <InfoRow label="Total Bill Amount" value={formatCurrency(totalSale)} accent />
                  <div className="pos-grid-2" style={{ marginTop: 10 }}>
                    <label className="pos-label">
                      Payment Type
                      <select
                        className="pos-input"
                        value={emiData.paymentMode || "credit"}
                        onChange={(e) => setEmiData((p) => ({ ...p, paymentMode: e.target.value }))}
                      >
                        <option value="credit">Credit</option>
                        <option value="cash">Cash</option>
                      </select>
                    </label>
                    {String(emiData.paymentMode || "credit").toLowerCase() === "cash" && (
                      <label className="pos-label">
                        Registered Bank
                        <select
                          className="pos-input"
                          value={emiSelectedBankId}
                          onChange={(e) => setEmiSelectedBankId(e.target.value)}
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
                    <label className="pos-label">
                      Markup %
                      <input
                        className="pos-input"
                        type="number"
                        value={emiData.markup}
                        onChange={(e) => setEmiData((p) => ({ ...p, markup: e.target.value }))}
                      />
                    </label>
                    <label className="pos-label">
                      Advance Payment
                      <input
                        className="pos-input"
                        type="number"
                        value={emiData.advance}
                        onChange={(e) => setEmiData((p) => ({ ...p, advance: e.target.value }))}
                      />
                    </label>
                    <label className="pos-label">
                      Installment Count
                      <input
                        className="pos-input"
                        type="number"
                        value={emiData.installments}
                        onChange={(e) => setEmiData((p) => ({ ...p, installments: e.target.value }))}
                      />
                    </label>
                    <label className="pos-label">
                      Delivery Timing
                      <select
                        className="pos-input"
                        value={emiData.deliveryPolicy || "BEFORE_PAYMENT"}
                        onChange={(e) => setEmiData((p) => ({ ...p, deliveryPolicy: e.target.value }))}
                      >
                        <option value="BEFORE_PAYMENT">Before Payment</option>
                        <option value="AFTER_PAYMENT">After Payment</option>
                      </select>
                    </label>
                  </div>
                  <div className="pos-emi-summary">
                    <InfoRow label="EMI Total (with markup)" value={formatCurrency(emiTotal)} accent />
                    <InfoRow label="Monthly Installment" value={formatCurrency(emiMonthly)} accent />
                    <InfoRow label="Remaining after Advance" value={formatCurrency(emiTotal - emiAdvance)} />
                  </div>
                  <div className="hint-line" style={{ marginTop: 8 }}>
                    {String(emiData.deliveryPolicy || "BEFORE_PAYMENT") === "AFTER_PAYMENT"
                      ? "After Payment: stock deducts on delivery; ledger shows pending delivery."
                      : "Before Payment: stock deducts now and delivery is treated as completed."}
                  </div>
                </div>
              )}

              {saleType !== "hold" && lines.length > 0 && (
                <div className="pos-payment-summary">
                  <InfoRow label="Bill Total" value={formatCurrency(totalSale)} accent />
                  <InfoRow label="Total Paid" value={formatCurrency(totalPaid)} />
                  <InfoRow
                    label={totalPaid >= totalSale ? "Change Return" : "Remaining"}
                    value={formatCurrency(Math.abs(totalSale - totalPaid))}
                    accent
                  />
                </div>
              )}
            </div>
          )}

        </div>

        {/* ─── RIGHT COLUMN ─── */}
        <div className="pos-right">
          <div className="pos-card pos-catalog-card">
            <div className="line-head" style={{ marginBottom: 12 }}>
              <h4>Product Browser</h4>
              <span className="hint-line" style={{ margin: 0 }}>
                {selectedCategory} • {formatNumber(catalogItems.length)} items
              </span>
            </div>

            <div style={{ position: "relative", marginBottom: 12 }}>
              <div className="pos-item-search">
                <Search size={14} className="pos-search-icon" />
                <input
                  className="pos-input pos-input--search"
                  placeholder="Search product / variation / barcode..."
                  value={itemSearch}
                  onChange={(e) => openItemDropdown("browser", e.target.value)}
                  onFocus={(e) => openItemDropdown("browser", e.target.value)}
                  onBlur={scheduleItemDropdownClose}
                />
              </div>
              {showBrowserItemDropdown && (
                <div className="pos-dropdown">
                  {filteredItems.length === 0 ? (
                    <div className="pos-dropdown-empty">No item found</div>
                  ) : (
                    filteredItems.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        className="pos-dropdown-item"
                        onMouseDown={() => addItem(it)}
                      >
                        <strong>{it.name}</strong>
                        <span>
                          SKU: {it.sku} | Stock: {formatNumber(it.currentStock)} | Sale:{" "}
                          {formatCurrency(it.salePrice)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="pos-category-strip">
              {categoryOptions.map((categoryName) => (
                <button
                  key={categoryName}
                  type="button"
                  className={`pos-category-chip${selectedCategory === categoryName ? " is-active" : ""}`}
                  onClick={() => setSelectedCategory(categoryName)}
                >
                  {categoryName}
                </button>
              ))}
            </div>

            {catalogItems.length === 0 ? (
              <div className="pos-empty-grid pos-empty-grid--catalog">
                <Package size={28} />
                <span>No products available for the current filters.</span>
              </div>
            ) : (
              <div className="pos-product-grid">
                {catalogItems.map((item) => {
                  const isSelected = activeLineItemIds.has(Number(item.id || 0));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`pos-product-card${isSelected ? " is-selected" : ""}`}
                      onClick={() => addItem(item)}
                    >
                      <div className="pos-product-card__media">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} />
                        ) : (
                          <span>{String(item.name || "?").slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="pos-product-card__body">
                        <strong>{item.name}</strong>
                        <span>{item.sku}</span>
                        <div className="pos-product-card__footer">
                          <b>{formatCurrency(item.salePrice)}</b>
                          <small>Stock {formatNumber(item.currentStock)}</small>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showPaymentModal && saleType === "cash" && (
        <div
          className="inventory-modal-backdrop"
          onClick={() => closePaymentModal({ notifyParent: isEditMode && Boolean(savedSaleReceipt) })}
        >
          <div
            className="inventory-modal payment-entry-modal"
            style={{ maxWidth: 960, height: "auto", maxHeight: "92vh" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal__header">
              <div>
                <h4>{savedSaleReceipt ? "Invoice Ready" : isEditMode ? "Update Payment" : "Sale Payment"}</h4>
                <p className="inventory-modal__sub">
                  {savedSaleReceipt?.invoiceNo || displayInvoiceNo || "Auto invoice"}{" "}
                  {savedSaleReceipt
                    ? "- preview ya print choose kar lo"
                    : "- add payment method, bank and amount"}
                </p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => closePaymentModal({ notifyParent: isEditMode && Boolean(savedSaleReceipt) })}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="inventory-modal__body payment-entry-modal__body">
              <div className="pos-card" style={{ margin: 0 }}>
                {savedSaleReceipt ? (
                  <>
                    <SectionTitle icon={Printer} title="Invoice Actions" />
                    <div className="pos-payment-summary payment-entry-modal__summary">
                      <InfoRow label="Invoice No" value={savedSaleReceipt.invoiceNo || `SA-${savedSaleReceipt.id}`} accent />
                      <InfoRow label="Customer" value={savedSaleReceipt.customer?.name || COUNTER_SALE_LABEL} />
                      <InfoRow label="Net Total" value={formatCurrency(savedSaleReceipt.totalAmount || 0)} accent />
                    </div>
                    <div className="pos-action-buttons payment-entry-modal__actions">
                      <button
                        type="button"
                        className="pos-btn pos-btn--cancel"
                        onClick={() => openInvoicePreview(savedSaleReceipt, "EN")}
                      >
                        <Eye size={16} /> Preview Invoice
                      </button>
                      <button
                        type="button"
                        className="pos-btn pos-btn--save"
                        onClick={() => handlePrintInvoiceRecord(savedSaleReceipt, "EN", "A4")}
                      >
                        <Printer size={16} /> Print A4
                      </button>
                      <button
                        type="button"
                        className="pos-btn pos-btn--save"
                        onClick={() => handlePrintInvoiceRecord(savedSaleReceipt, "EN", "A5")}
                      >
                        <Printer size={16} /> Print A5
                      </button>
                      <button
                        type="button"
                        className="pos-btn pos-btn--save"
                        onClick={() => handlePrintInvoiceRecord(savedSaleReceipt, "EN", "THERMAL")}
                      >
                        <Printer size={16} /> Print Thermal
                      </button>
                    </div>
                    <div className="pos-action-buttons payment-entry-modal__actions">
                      <button
                        type="button"
                        className="pos-btn pos-btn--cancel"
                        onClick={() => closePaymentModal({ notifyParent: isEditMode })}
                      >
                        Done
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <SectionTitle icon={DollarSign} title="Payment" />
                    <div className="payment-entry-list">
		                  {payments.map((payment, idx) => (
		                    <div key={`payment-row-${idx}`} className="payment-entry-row">
		                      <select
		                        className="pos-input"
		                        value={getPaymentSourceValue(payment)}
		                        onChange={(e) => {
		                          const nextSource = resolvePaymentSource(e.target.value);
		                          setPayments((prev) =>
		                            prev.map((row, rowIndex) =>
		                              rowIndex === idx
		                                ? {
		                                    ...row,
		                                    method: nextSource.method,
		                                    bankAccountId: nextSource.bankAccountId,
		                                  }
		                                : row,
		                            ),
		                          );
		                        }}
		                      >
		                        <option value="cash">Cash</option>
		                        {bankOptions.map((bank) => (
		                          <option key={bank.id} value={`bank:${bank.id}`}>
		                            {bank.bankName}
		                          </option>
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
	                      {payments.length > 1 ? (
	                        <button
	                          type="button"
	                          className="pos-remove-btn"
	                          onClick={() => setPayments((prev) => prev.filter((_, rowIndex) => rowIndex !== idx))}
	                        >
	                          <Trash2 size={13} />
	                        </button>
		                      ) : (
		                        <div className="payment-entry-row__spacer" />
		                      )}
		                    </div>
		                  ))}
                    </div>
                    <button
                      type="button"
                      className="pos-sm-btn"
                      onClick={() => setPayments((prev) => [...prev, createEmptyPaymentRow()])}
                    >
                      <Plus size={13} /> Add Payment Method
                    </button>
                    <div className="payment-entry-extra">
                      <label className="pos-label">
                        Extra Charges
                        <input
                          className="pos-input"
                          type="number"
                          placeholder="Extra charges amount"
                          value={extraCharge.amount}
                          onChange={(e) => setExtraCharge((prev) => ({ ...prev, amount: e.target.value }))}
                        />
                      </label>
                      <label className="pos-label">
                        Charges Remark
                        <input
                          className="pos-input"
                          type="text"
                          placeholder="Reason / remark"
                          value={extraCharge.remark}
                          onChange={(e) => setExtraCharge((prev) => ({ ...prev, remark: e.target.value }))}
                        />
                      </label>
                      <label className="pos-label">
                        Promise Date {requiresPromiseDate ? "*" : ""}
                        <input
                          className="pos-input"
                          type="date"
                          value={promiseDate}
                          onChange={(e) => setPromiseDate(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="pos-payment-summary payment-entry-modal__summary">
                      <InfoRow label="Bill Total" value={formatCurrency(totalSale)} accent />
                      <InfoRow label="Total Paid" value={formatCurrency(totalPaid)} />
                      <InfoRow
                        label={totalPaid >= totalSale ? "Change Return" : "Remaining"}
                        value={formatCurrency(Math.abs(totalSale - totalPaid))}
                        accent
                      />
                    </div>
                    {requiresPromiseDate ? (
                      <div className="hint-line">
                        Credit sale detected. Promise date required before saving.
                      </div>
                    ) : null}
                    {selectedCustomer && (
                      <div className="pos-payment-summary payment-entry-modal__summary">
                        <SectionTitle icon={Wallet} title="Customer Balance" />
                        <InfoRow label="Previous Balance" value={formatCurrency(prevBalance)} />
                        <InfoRow label="Current Bill" value={formatCurrency(totalSale)} />
                        <InfoRow label="Paid Now" value={formatCurrency(totalPaid)} />
                        <div className="pos-balance-total">
                          <span>New Total Balance</span>
                          <strong className={newBalance > 0 ? "pos-balance-due" : "pos-balance-clear"}>
                            {formatCurrency(newBalance)}
                          </strong>
                        </div>
                      </div>
                    )}
                    <div className="pos-action-buttons payment-entry-modal__actions">
                      <button
                        type="button"
                        className="pos-btn pos-btn--cancel"
                        onClick={() => closePaymentModal()}
                      >
                        Close Payment
                      </button>
                      <button
                        type="button"
                        className="pos-btn pos-btn--save"
                        disabled={
                          lines.length === 0 ||
                          saveSaleMutation.isPending ||
                          updateSaleMutation.isPending ||
                          cancelSaleMutation.isPending ||
                          isCancelledInvoice
                        }
                        onClick={submitSale}
                      >
                        {isEditMode ? <Edit size={16} /> : <Plus size={16} />}
                        {isEditMode
                          ? updateSaleMutation.isPending
                            ? "Updating..."
                            : "Update Sale"
                          : saveSaleMutation.isPending
                            ? "Saving..."
                            : "Save Sale"}
                      </button>
                    </div>
                  </>
                )}
                {saleFeedback ? <div className="hint-line">{saleFeedback.message}</div> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {showClientLedger && selectedCustomer && (
        <div className="inventory-modal-backdrop" onClick={() => setShowClientLedger(false)}>
          <div
            className="inventory-modal"
            style={{ maxWidth: 1120 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal__header">
              <div>
                <h4>Customer Ledger</h4>
                <p className="inventory-modal__sub">{selectedCustomer.name}</p>
              </div>
              <div className="inventory-modal__actions">
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
                      {customerLedgerQuery.isLoading ? (
                        <tr>
                          <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                            Loading customer ledger...
                          </td>
                        </tr>
                      ) : customerLedgerRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                            No ledger entries yet.
                          </td>
                        </tr>
                      ) : (
                        customerLedgerRows.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.date}</td>
                            <td>{entry.invoiceNo}</td>
                            <td>{entry.description}</td>
                            <td>{entry.debit ? formatCurrency(entry.debit) : "-"}</td>
                            <td>{entry.credit ? formatCurrency(entry.credit) : "-"}</td>
                            <td>{formatCurrency(entry.balance)}</td>
                            <td>
                              <button
                                type="button"
                                className="small-btn small-btn--ghost"
                                onClick={() => {
                                  setShowClientLedger(false);
                                  setHistoryInvoiceLanguage("EN");
                                  setHistoryInvoiceView(entry.sale);
                                }}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                      <tr className="pos-balance-row">
                        <td colSpan={5}><strong>Current Balance</strong></td>
                        <td><strong>{formatCurrency(customerLedgerBalance)}</strong></td>
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

      {historyInvoiceView && (
        <div className="inventory-modal-backdrop" onClick={() => setHistoryInvoiceView(null)}>
          <div
            className="inventory-modal history-invoice-modal"
            style={{ maxWidth: 1120 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal__header">
              <div>
                <h4>Invoice View</h4>
                <p className="inventory-modal__sub">
                  {historyInvoiceView.invoiceNo || `SA-${historyInvoiceView.id}`} -{" "}
                  {historyInvoiceView.customer?.name || selectedCustomer?.name || COUNTER_SALE_LABEL}
                </p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className={`small-btn${historyInvoiceLanguage === "EN" ? "" : " small-btn--ghost"}`}
                  onClick={() => setHistoryInvoiceLanguage("EN")}
                >
                  English
                </button>
                <button
                  type="button"
                  className={`small-btn${historyInvoiceLanguage === "UR" ? "" : " small-btn--ghost"}`}
                  onClick={() => setHistoryInvoiceLanguage("UR")}
                >
                  اردو
                </button>
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => handlePrintHistoryInvoice("EN")}
                >
                  <Printer size={13} /> Print English
                </button>
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => handlePrintHistoryInvoice("UR")}
                >
                  <Printer size={13} /> Print Urdu
                </button>
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => handleShareHistoryInvoice(historyInvoiceLanguage)}
                >
                  Share WhatsApp
                </button>
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => setHistoryInvoiceView(null)}
                >
                  Close
                </button>
              </div>
            </div>
	            <div className="inventory-modal__body">
	              <article
	                className={`history-invoice-preview${historyInvoiceLanguage === "UR" ? " is-urdu" : ""}`}
	                dir={(invoiceLanguageCopy[historyInvoiceLanguage] || invoiceLanguageCopy.EN).dir}
	              >
                  {activeHistoryInvoiceSnapshot && (
                    <>
                      <div className="history-invoice-preview__hero">
                        <div className="history-invoice-preview__hero-main">
                          <img src={brandLogo} alt="Company logo" />
                          <div>
                            <h3>{activeHistoryInvoiceSnapshot.companyName}</h3>
                            <p>{activeHistoryInvoiceSnapshot.companyTagline}</p>
                            <div className="history-invoice-preview__contact-strip">
                              {activeHistoryInvoiceSnapshot.contactPills.map((pill) => (
                                <span key={pill} className="history-invoice-preview__contact-pill">{pill}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="history-invoice-preview__barcode-box">
                          <div className="history-invoice-preview__barcode-grid" />
                          <span>{activeHistoryInvoiceSnapshot.invoiceNo}</span>
                        </div>
                      </div>

                      <div className="history-invoice-preview__bill-title">
                        <span>{activeHistoryInvoiceSnapshot.billHeading}</span>
                        <strong>{activeHistoryInvoiceSnapshot.paymentStamp}</strong>
                      </div>

                      <div className="history-invoice-preview__doc-head">
                        <div className="history-invoice-preview__doc-cell">
                          <span>{activeHistoryInvoiceSnapshot.copy.invoiceNo}</span>
                          <strong>{activeHistoryInvoiceSnapshot.invoiceNo}</strong>
                        </div>
                        <div className="history-invoice-preview__doc-cell">
                          <span>{activeHistoryInvoiceSnapshot.copy.date}</span>
                          <strong>{activeHistoryInvoiceSnapshot.invoiceDate}</strong>
                        </div>
                        <div className="history-invoice-preview__doc-cell">
                          <span>{historyInvoiceLanguage === "UR" ? "وقت" : "Time"}</span>
                          <strong>{activeHistoryInvoiceSnapshot.invoiceTime}</strong>
                        </div>
                        <div className="history-invoice-preview__doc-cell">
                          <span>{historyInvoiceLanguage === "UR" ? "یوزر" : "User"}</span>
                          <strong>{activeHistoryInvoiceSnapshot.userName}</strong>
                        </div>
                      </div>

                      <div className="history-invoice-preview__summary">
                        <div className="history-invoice-preview__summary-grid">
                          <div className="history-invoice-preview__summary-item">
                            <span>{historyInvoiceLanguage === "UR" ? "کلائنٹ کارڈ" : "Client Card No"}</span>
                            <strong>{activeHistoryInvoiceSnapshot.clientCardNo}</strong>
                          </div>
                          <div className="history-invoice-preview__summary-item">
                            <span>{activeHistoryInvoiceSnapshot.copy.paymentMethod}</span>
                            <strong>{activeHistoryInvoiceSnapshot.localizedPaymentMethod}</strong>
                          </div>
                          <div className="history-invoice-preview__summary-item">
                            <span>{activeHistoryInvoiceSnapshot.copy.customer}</span>
                            <strong>{activeHistoryInvoiceSnapshot.customerName}</strong>
                          </div>
                          <div className="history-invoice-preview__summary-item">
                            <span>{activeHistoryInvoiceSnapshot.copy.phone}</span>
                            <strong>{activeHistoryInvoiceSnapshot.customerPhoneValue}</strong>
                          </div>
                          <div className="history-invoice-preview__summary-item history-invoice-preview__summary-item--wide">
                            <span>{activeHistoryInvoiceSnapshot.copy.location}</span>
                            <strong>{activeHistoryInvoiceSnapshot.customerLocationValue}</strong>
                          </div>
                          {activeHistoryInvoiceSnapshot.showCreditBalances ? (
                            <div className="history-invoice-preview__summary-item">
                              <span>{historyInvoiceLanguage === "UR" ? "پچھلا بیلنس" : "Previous Balance"}</span>
                              <strong>{activeHistoryInvoiceSnapshot.previousBalance}</strong>
                            </div>
                          ) : null}
                          {activeHistoryInvoiceSnapshot.showCreditBalances ? (
                            <div className="history-invoice-preview__summary-item">
                              <span>{historyInvoiceLanguage === "UR" ? "موجودہ بیلنس" : "Current Balance"}</span>
                              <strong>{activeHistoryInvoiceSnapshot.currentBalance}</strong>
                            </div>
                          ) : null}
                        </div>
                      </div>

	                  <div className="table-wrap history-invoice-preview__table-wrap">
	                  <table className="pos-item-table history-invoice-preview__table">
	                    <thead>
	                      <tr>
                          <th>{historyInvoiceLanguage === "UR" ? "سریل" : "Sr#"}</th>
	                        <th>{activeHistoryInvoiceSnapshot.copy.item}</th>
	                        <th>{activeHistoryInvoiceSnapshot.copy.qty}</th>
                          <th>{historyInvoiceLanguage === "UR" ? "مارکیٹ" : "Market"}</th>
	                        <th>{activeHistoryInvoiceSnapshot.copy.unitPrice}</th>
	                        <th>{activeHistoryInvoiceSnapshot.copy.total}</th>
	                      </tr>
	                    </thead>
	                    <tbody>
	                      {activeHistoryInvoiceSnapshot.lines.length === 0 ? (
	                        <tr>
	                          <td colSpan={6} className="hint-line" style={{ padding: "12px" }}>
	                            {activeHistoryInvoiceSnapshot.copy.noItems}
	                          </td>
	                        </tr>
	                      ) : (
	                        activeHistoryInvoiceSnapshot.lines.map((line) => (
	                          <tr key={line.id}>
                                <td>{line.sr}</td>
	                            <td>{line.itemName || "-"}</td>
	                            <td>{line.qty}</td>
                                <td>{line.marketPrice}</td>
	                            <td>{line.salePrice}</td>
	                            <td>{line.total}</td>
	                          </tr>
	                        ))
	                      )}
	                    </tbody>
	                  </table>
	                </div>

	                <div className="history-invoice-preview__totals">
	                  <div className="history-invoice-preview__totals-row">
	                    <span>{activeHistoryInvoiceSnapshot.copy.subtotal}</span>
	                    <strong>{activeHistoryInvoiceSnapshot.subtotal}</strong>
	                  </div>
	                  <div className="history-invoice-preview__totals-row">
	                    <span>{activeHistoryInvoiceSnapshot.copy.tax}</span>
	                    <strong>{activeHistoryInvoiceSnapshot.taxAmount}</strong>
	                  </div>
	                  <div className="history-invoice-preview__totals-row">
	                    <span>{historyInvoiceLanguage === "UR" ? "ادا شدہ" : "Paid"}</span>
	                    <strong>{activeHistoryInvoiceSnapshot.paidAmount}</strong>
	                  </div>
	                  <div className="history-invoice-preview__totals-row">
	                    <span>{historyInvoiceLanguage === "UR" ? "بقایا" : "Balance"}</span>
	                    <strong>{activeHistoryInvoiceSnapshot.balanceAmount}</strong>
	                  </div>
	                  <div className="history-invoice-preview__totals-row is-grand">
	                    <span>{activeHistoryInvoiceSnapshot.copy.netTotal}</span>
	                    <strong>{activeHistoryInvoiceSnapshot.totalAmount}</strong>
	                  </div>
	                </div>

                      <div className="history-invoice-preview__footer">
                        <div className="history-invoice-preview__footer-box">
                          <h4>{historyInvoiceLanguage === "UR" ? "واپسی شکایت" : "Return / Claim"}</h4>
                          <p>
                            {historyInvoiceLanguage === "UR"
                              ? "واپسی مال رسید کے ساتھ ہوگی۔"
                              : "Return accepted with invoice receipt only."}
                          </p>
                        </div>
                        <div className="history-invoice-preview__footer-box">
                          <h4>{historyInvoiceLanguage === "UR" ? "دستخط" : "Signature"}</h4>
                          <p>
                            {historyInvoiceLanguage === "UR"
                              ? "آپ کے اعتماد کا شکریہ"
                              : "Thank you for your business"}
                          </p>
                        </div>
                      </div>

	                <div className="history-invoice-preview__notes">
	                  <span>{activeHistoryInvoiceSnapshot.copy.notes}</span>
	                  <strong>{activeHistoryInvoiceSnapshot.notes}</strong>
	                </div>
                      <div className="history-invoice-preview__disclaimer">
                        {historyInvoiceLanguage === "UR"
                          ? "سامان نکلنے کے بعد واپسی یا ایکسچینج اسٹور پالیسی کے مطابق ہوگی۔"
                          : "Returns and exchanges are subject to store policy after delivery."}
                      </div>
                    </>
                  )}
	              </article>
	            </div>
          </div>
        </div>
      )}

      {remarkPreview && (
        <div className="inventory-modal-backdrop" onClick={() => setRemarkPreview(null)}>
          <div
            className="inventory-modal production-edit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal__header">
              <div>
                <h4>Remark Preview</h4>
                <p className="inventory-modal__sub">{remarkPreview.itemName || "Invoice Item"}</p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => setRemarkPreview(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="inventory-modal__body">
              <article className="module-card">
                <div className="remark-preview-box">
                  {remarkPreview.remark || "No remark added."}
                </div>
              </article>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Invoice Search ─────────────────────────────────────── */
function InvoiceSearch({ sales, isLoading, isError }) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSales = useMemo(() => {
    const keyword = normalizeText(searchTerm);
    if (!keyword) {
      return sales || [];
    }
    return (sales || []).filter((sale) => {
      const invoiceNo = sale.invoiceNo || `SA-${sale.id}`;
      const searchableText = [
        invoiceNo,
        sale.customer?.name || COUNTER_SALE_LABEL,
        sale.customer?.phone,
        sale.customer?.address,
        sale.paymentMethod,
        formatDate(sale.saleDate),
      ]
        .map((value) => normalizeText(value))
        .join(" ");
      return searchableText.includes(keyword);
    });
  }, [sales, searchTerm]);

  return (
    <article className="module-card form-card">
      <h4>Invoice Search</h4>
      <div className="line-head" style={{ marginBottom: 12 }}>
        <div className="pos-item-search" style={{ minWidth: 280, flex: 1, maxWidth: 520 }}>
          <Search size={16} className="pos-search-icon" />
          <input
            type="text"
            className="pos-input pos-input--search"
            placeholder="Search invoice no, customer, payment..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <button type="button" className="small-btn small-btn--ghost" onClick={() => setSearchTerm("")}>
          Reset
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Items</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                  Loading invoices...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                  Unable to load invoices.
                </td>
              </tr>
            ) : filteredSales.length === 0 ? (
              <tr>
                <td colSpan={7} className="hint-line" style={{ padding: "12px" }}>
                  {searchTerm.trim() ? "No invoice found for this search." : "No sales invoices yet."}
                </td>
              </tr>
            ) : (
              filteredSales.map((sale) => {
                const isHoldInvoice = String(sale.paymentMethod || "").toLowerCase().includes("hold");
                return (
                  <tr key={`search-${sale.id}`}>
                    <td>{sale.invoiceNo || `SA-${sale.id}`}</td>
                    <td>{formatDate(sale.saleDate)}</td>
                    <td>{sale.customer?.name || COUNTER_SALE_LABEL}</td>
                    <td>{sale.paymentMethod || "-"}</td>
                    <td>{isHoldInvoice ? "Hold" : "Cleared"}</td>
                    <td>{formatNumber(sale.lines?.length || 0)}</td>
                    <td>{formatCurrency(sale.totalAmount || 0)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/* ─── Page ───────────────────────────────────────────────── */
function SalesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pos");
  const [isPosModalOpen, setIsPosModalOpen] = useState(false);
  const [posModalSale, setPosModalSale] = useState(null);
  const [posModalKey, setPosModalKey] = useState(0);
  const [forceFreshPosForm, setForceFreshPosForm] = useState(false);
  const [isHoldBillsModalOpen, setIsHoldBillsModalOpen] = useState(false);
  const [profitInvoice, setProfitInvoice] = useState(null);
  const [holdFeedback, setHoldFeedback] = useState(null);
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState("");
  const salesListQuery = useQuery({
    queryKey: ["sales", "list"],
    queryFn: salesApi.listSales,
  });
  const inventoryItemsQuery = useQuery({
    queryKey: ["inventory", "items", "sales-profit"],
    queryFn: inventoryApi.listItems,
  });
  const auditLogsQuery = useQuery({
    queryKey: ["sales", "audit"],
    queryFn: salesApi.listAudit,
  });

  const clearHoldMutation = useMutation({
    mutationFn: async ({ saleRef, saleId, payload, fallbackPayload }) => {
      try {
        return await salesApi.clearHoldSale(saleRef, payload);
      } catch (error) {
        if (error?.response?.status === 404 && saleId && fallbackPayload) {
          return salesApi.updateSale(saleId, fallbackPayload);
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setHoldFeedback({ type: "success", message: "Hold invoice cleared successfully." });
      await queryClient.invalidateQueries({ queryKey: ["sales", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["sales", "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error) => {
      setHoldFeedback({ type: "error", message: extractApiError(error, "Unable to clear hold invoice.") });
    },
  });

  useEffect(() => {
    if (!isPosModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPosModalOpen]);

  useEffect(() => {
    if (activeTab !== "pos") {
      setIsPosModalOpen(false);
      setPosModalSale(null);
      setForceFreshPosForm(false);
      setIsHoldBillsModalOpen(false);
      setProfitInvoice(null);
      if (typeof document !== "undefined" && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, [activeTab]);

  const heldInvoices = useMemo(
    () =>
      (salesListQuery.data || []).filter((sale) => isHoldPaymentMethod(sale.paymentMethod)),
    [salesListQuery.data],
  );

  const filteredSalesList = useMemo(() => {
    const keyword = normalizeText(invoiceSearchTerm);
    if (!keyword) {
      return salesListQuery.data || [];
    }
    return (salesListQuery.data || []).filter((sale) => {
      const invoiceNo = sale.invoiceNo || `SA-${sale.id}`;
      const searchableText = [
        invoiceNo,
        sale.customer?.name || COUNTER_SALE_LABEL,
        sale.customer?.phone,
        sale.customer?.address,
        sale.paymentMethod,
        formatDate(sale.saleDate),
      ]
        .map((value) => normalizeText(value))
        .join(" ");
      return searchableText.includes(keyword);
    });
  }, [salesListQuery.data, invoiceSearchTerm]);

  const filteredSalesInvoiceTotal = useMemo(
    () =>
      filteredSalesList.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0),
    [filteredSalesList],
  );

  const purchasePriceLookup = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    (inventoryItemsQuery.data || []).forEach((item) => {
      const itemId = Number(item.id || 0);
      const purchasePrice = Number(item.purchasePrice ?? item.purchase ?? 0);
      const normalizedPrice = Number.isFinite(purchasePrice) ? purchasePrice : 0;
      if (itemId > 0) {
        byId.set(itemId, normalizedPrice);
      }
      const nameKey = normalizeText(item.name);
      if (nameKey && !byName.has(nameKey)) {
        byName.set(nameKey, normalizedPrice);
      }
    });
    return { byId, byName };
  }, [inventoryItemsQuery.data]);

  const getLineBuyRate = (line) => {
    const directRate = Number(line?.item?.purchasePrice);
    if (Number.isFinite(directRate) && directRate > 0) {
      return directRate;
    }

    const itemId = Number(line?.itemId || line?.item?.id || 0);
    if (itemId > 0 && purchasePriceLookup.byId.has(itemId)) {
      const rateFromId = Number(purchasePriceLookup.byId.get(itemId) || 0);
      if (rateFromId > 0) {
        return rateFromId;
      }
    }

    const nameKey = normalizeText(line?.itemName || line?.item?.name);
    if (nameKey && purchasePriceLookup.byName.has(nameKey)) {
      const rateFromName = Number(purchasePriceLookup.byName.get(nameKey) || 0);
      if (rateFromName > 0) {
        return rateFromName;
      }
    }

    return Number.isFinite(directRate) ? directRate : 0;
  };

  const getInvoiceFigures = (sale) =>
    (sale?.lines || []).reduce(
      (totals, line) => {
        const quantity = Number(line.quantity || 0);
        const saleRate = Number(line.unitPrice || 0);
        const buyRate = getLineBuyRate(line);
        totals.saleAmount += quantity * saleRate;
        totals.buyAmount += quantity * buyRate;
        return totals;
      },
      { buyAmount: 0, saleAmount: 0 },
    );

  const getInvoiceProfit = (sale) => {
    const figures = getInvoiceFigures(sale);
    return figures.saleAmount - figures.buyAmount;
  };

  const handleOpenEditInvoice = (sale) => {
    setPosModalSale(sale);
    setForceFreshPosForm(false);
    setPosModalKey((prev) => prev + 1);
    setIsPosModalOpen(true);
    if (typeof document !== "undefined" && document.documentElement?.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const handleOpenNewSale = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SALES_POS_DRAFT_KEY);
    }
    setPosModalSale(null);
    setForceFreshPosForm(true);
    setPosModalKey((prev) => prev + 1);
    setIsPosModalOpen(true);
    if (typeof document !== "undefined" && document.documentElement?.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const handleClosePosModal = () => {
    setIsPosModalOpen(false);
    setPosModalSale(null);
    setForceFreshPosForm(false);
    if (typeof document !== "undefined" && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleClearHoldInvoice = (sale) => {
    if (clearHoldMutation.isPending) {
      return;
    }
    const saleRef = sale.id || sale.invoiceNo;
    if (!saleRef) {
      setHoldFeedback({ type: "error", message: "Unable to clear hold invoice: missing sale reference." });
      return;
    }
    const customerName = String(sale.customer?.name || "").trim();
    const fallbackItems = (sale.lines || [])
      .map((line) => ({
        itemId: line.itemId || undefined,
        itemName: line.itemName || "Product",
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        taxPercent: Number(line.taxPercent || 0),
      }))
      .filter((line) => line.quantity > 0);
    if (fallbackItems.length === 0) {
      setHoldFeedback({ type: "error", message: "No valid line items found for this hold invoice." });
      return;
    }
    const clearedAt = new Date().toLocaleString();
    clearHoldMutation.mutate({
      saleRef,
      saleId: sale.id,
      payload: {
        invoiceNo: sale.invoiceNo || undefined,
        paymentMethod: "Cash",
        notes: `Hold cleared at ${clearedAt}`,
      },
      fallbackPayload: {
        invoiceNo: sale.invoiceNo || undefined,
        customerName,
        paymentMethod: "Cash",
        notes: `Hold cleared at ${clearedAt}`,
        pricingMode: sale.pricingMode || "retail",
        language: sale.language || "EN",
        items: fallbackItems,
      },
    });
  };

  if (isPosModalOpen) {
    return (
      <div className="sales-pos-screen">
        <div className="sales-pos-screen__frame">
          <div className="sales-pos-screen__toolbar">
            <button
              type="button"
              className="small-btn small-btn--ghost sales-pos-screen__close"
              onClick={handleClosePosModal}
            >
              Close
            </button>
          </div>
		          <POSPanel
		            key={posModalSale ? `edit-${posModalSale.id}-${posModalKey}` : `new-${posModalKey}`}
		            editingSale={posModalSale}
	            onSaved={handleClosePosModal}
              onOpenHoldBills={() => setIsHoldBillsModalOpen(true)}
	            forceFresh={forceFreshPosForm}
	            availableSaleTypes={POS_SALE_TYPES}
            initialSaleType="cash"
	            draftStorageKey={SALES_POS_DRAFT_KEY}
	            autoInvoicePrefix="SA"
	            hideBarcodeField
              editableMarketPrice
              showCostAndProfitTotals={false}
              showSavingsTotal
	          />
        </div>
      </div>
    );
  }

  return (
    <section className="module-page">
      <header className="module-header">
        <h3>Sales &amp; POS</h3>
        <span className="module-subtitle">
          Bedsheet sales, POS billing, EMI and multi-method cash payments
        </span>
      </header>

      <ModuleTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === "pos" && (
        <>
          <article className="module-card">
            <div className="sales-pos-launcher">
              <div>
                <h4>POS / New Sale</h4>
                <p className="inventory-modal__sub">Open POS form in fixed popup screen.</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="small-btn" onClick={handleOpenNewSale}>
                  Open POS Form
                </button>
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => {
                    setHoldFeedback(null);
                    setIsHoldBillsModalOpen(true);
                  }}
                >
                  Held Bills
                </button>
              </div>
            </div>
          </article>

          <article className="module-card">
            <div className="line-head sales-invoice-head">
              <h4>Sales Invoices</h4>
              <div className="pos-item-search sales-invoice-search">
                <Search size={16} className="pos-search-icon" />
                <input
                  type="text"
                  className="pos-input pos-input--search"
                  placeholder="Search invoice no, customer, payment..."
                  value={invoiceSearchTerm}
                  onChange={(event) => setInvoiceSearchTerm(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="small-btn small-btn--ghost sales-invoice-search-reset"
                onClick={() => setInvoiceSearchTerm("")}
              >
                Reset
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
	                  <tr>
	                    <th>Invoice #</th>
	                    <th>Date</th>
	                    <th>Customer</th>
	                    <th>Payment</th>
	                    <th>Status</th>
	                    <th>Items</th>
	                    <th>Total</th>
	                    <th>Action</th>
	                  </tr>
	                </thead>
	                <tbody>
	                  {salesListQuery.isLoading ? (
	                    <tr>
	                      <td colSpan={8} className="hint-line" style={{ padding: "12px" }}>
	                        Loading invoices...
	                      </td>
	                    </tr>
	                  ) : salesListQuery.isError ? (
	                    <tr>
	                      <td colSpan={8} className="hint-line" style={{ padding: "12px" }}>
	                        Unable to load invoices.
	                      </td>
	                    </tr>
	                  ) : filteredSalesList.length === 0 ? (
	                    <tr>
	                      <td colSpan={8} className="hint-line" style={{ padding: "12px" }}>
	                        {invoiceSearchTerm.trim() ? "No invoice found for this search." : "No sales invoices yet."}
	                      </td>
	                    </tr>
	                  ) : (
	                    filteredSalesList.map((sale) => {
	                      const isHoldInvoice = String(sale.paymentMethod || "").toLowerCase().includes("hold");
                        const isCancelledSale = String(sale.paymentMethod || "").toLowerCase().includes("cancel");
	                      return (
	                        <tr key={sale.id}>
	                          <td>{sale.invoiceNo || `SA-${sale.id}`}</td>
	                          <td>{formatDate(sale.saleDate)}</td>
	                          <td>{sale.customer?.name || COUNTER_SALE_LABEL}</td>
		                          <td>{sale.paymentMethod || "-"}</td>
		                          <td>{isCancelledSale ? "Cancelled" : isHoldInvoice ? "Hold" : "Cleared"}</td>
		                          <td>{formatNumber(sale.lines?.length || 0)}</td>
		                          <td>{formatCurrency(sale.totalAmount || 0)}</td>
		                          <td>
		                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
		                              <button
		                                type="button"
		                                className="pos-edit-btn"
		                                title="Edit Invoice"
                                      disabled={isCancelledSale}
		                                onClick={() => handleOpenEditInvoice(sale)}
		                              >
	                                <Edit size={14} />
	                              </button>
	                              <button
	                                type="button"
                                className="small-btn small-btn--ghost"
                                onClick={() => setProfitInvoice(sale)}
                              >
                                Check Profit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
	                </tbody>
	              </table>
	            </div>
	            <div className="purchase-invoice-summary">
	              <strong>Invoices Shown: {formatNumber(filteredSalesList.length)}</strong>
	              <strong>Total Invoice Sum: {formatCurrency(filteredSalesInvoiceTotal)}</strong>
	            </div>
	          </article>

          {isHoldBillsModalOpen && (
            <div className="inventory-modal-backdrop" onClick={() => setIsHoldBillsModalOpen(false)}>
              <div
                className="inventory-modal"
                style={{ maxWidth: 980 }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="inventory-modal__header">
                  <div>
                    <h4>Held Bills</h4>
                    <p className="inventory-modal__sub">
                      Clear hold bills from this list to update invoice status.
                    </p>
                  </div>
                  <div className="inventory-modal__actions">
                    <button
                      type="button"
                      className="small-btn small-btn--ghost"
                      onClick={() => setIsHoldBillsModalOpen(false)}
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
                            <th>Invoice #</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesListQuery.isLoading ? (
                            <tr>
                              <td colSpan={5} className="hint-line" style={{ padding: "12px" }}>
                                Loading held bills...
                              </td>
                            </tr>
                          ) : heldInvoices.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="hint-line" style={{ padding: "12px" }}>
                                No held bills found.
                              </td>
                            </tr>
                          ) : (
                            heldInvoices.map((sale) => (
                              <tr key={`hold-${sale.id}`}>
                                <td>{sale.invoiceNo || `SA-${sale.id}`}</td>
                                <td>{formatDate(sale.saleDate)}</td>
                                <td>{sale.customer?.name || COUNTER_SALE_LABEL}</td>
                                <td>{formatNumber(sale.lines?.length || 0)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="small-btn"
                                    disabled={clearHoldMutation.isPending}
                                    onClick={() => handleClearHoldInvoice(sale)}
                                  >
                                    {clearHoldMutation.isPending ? "Clearing..." : "Clear Hold"}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {holdFeedback ? <div className="hint-line">{holdFeedback.message}</div> : null}
                  </article>
                </div>
              </div>
            </div>
          )}

          {profitInvoice && (
            <div className="inventory-modal-backdrop" onClick={() => setProfitInvoice(null)}>
              <div
                className="inventory-modal"
                style={{ maxWidth: 960 }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="inventory-modal__header">
                  <div>
                    <h4>Invoice Profit</h4>
                    <p className="inventory-modal__sub">
                      Invoice {profitInvoice.invoiceNo || `SA-${profitInvoice.id}`} —{" "}
                      {profitInvoice.customer?.name || COUNTER_SALE_LABEL}
                    </p>
                  </div>
                  <div className="inventory-modal__actions">
                    <button
                      type="button"
                      className="small-btn small-btn--ghost"
                      onClick={() => setProfitInvoice(null)}
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
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Buy Rate</th>
                            <th>Sale Rate</th>
                            <th>Buy Total</th>
                            <th>Sale Total</th>
                            <th>Line Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(profitInvoice.lines || []).map((line) => {
                            const quantity = Number(line.quantity || 0);
                            const saleRate = Number(line.unitPrice || 0);
                            const buyRate = getLineBuyRate(line);
                            const buyTotal = quantity * buyRate;
                            const saleTotal = quantity * saleRate;
                            const lineProfit = saleTotal - buyTotal;
                            return (
                              <tr key={line.id}>
                                <td>{line.itemName || "-"}</td>
                                <td>{formatNumber(quantity)}</td>
                                <td>{formatCurrency(buyRate)}</td>
                                <td>{formatCurrency(saleRate)}</td>
                                <td>{formatCurrency(buyTotal)}</td>
                                <td>{formatCurrency(saleTotal)}</td>
                                <td>{formatCurrency(lineProfit)}</td>
                              </tr>
                            );
                          })}
                          {(profitInvoice.lines || []).length === 0 ? (
                            <tr>
                              <td colSpan={7} className="hint-line" style={{ padding: "10px" }}>
                                No line items available.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="kpi-grid" style={{ marginTop: 12 }}>
                      <div>
                        <span>Total Buy Amount</span>
                        <strong>{formatCurrency(getInvoiceFigures(profitInvoice).buyAmount)}</strong>
                      </div>
                      <div>
                        <span>Total Sale Amount</span>
                        <strong>{formatCurrency(getInvoiceFigures(profitInvoice).saleAmount)}</strong>
                      </div>
                      <div>
                        <span>Total Invoice Profit</span>
                        <strong>{formatCurrency(getInvoiceProfit(profitInvoice))}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {activeTab === "audit" && (
        <article className="module-card">
          <h4>Invoice Audit Trail</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {auditLogsQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="hint-line" style={{ padding: "12px" }}>
                      Loading audit logs...
                    </td>
                  </tr>
                ) : auditLogsQuery.isError ? (
                  <tr>
                    <td colSpan={4} className="hint-line" style={{ padding: "12px" }}>
                      Unable to load audit logs.
                    </td>
                  </tr>
                ) : (auditLogsQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="hint-line" style={{ padding: "12px" }}>
                      No audit logs available.
                    </td>
                  </tr>
                ) : (
                  (auditLogsQuery.data || []).map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.action || "-"}</td>
                      <td>{log.userName || "-"}</td>
                      <td>{log.refNo || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}

export default SalesPage;
