import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Plus,
  Search,
  Edit,
  Eye,
  X,
  Upload,
  Download,
  Save,
  CheckCircle,
  Image as ImageIcon,
} from "lucide-react";

import ModuleTabs from "../components/ModuleTabs";
import { inventoryApi } from "../api/modules";
import { extractApiError } from "../api/client";
import { formatCurrency, formatNumber } from "../utils/format";
import * as XLSX from "xlsx";

/* ─── Static Lists & Options ───────────────────── */
const tabs = [
  { value: "items", label: "Product Master" },
];

const DEPARTMENTS = ["Bedding", "Textiles", "Accessories"];
const STORES = ["Main Warehouse", "Showroom", "Factory Outlet"];
const CATEGORIES = ["Bedsheets", "Comforters", "Pillows", "Curtains"];

const emptyItemForm = {
  itemFormNo: "",
  storeName: "",
  name: "",
  department: "",
  categoryName: "",
  unit: "",
  variation: "",
  purPrice: "",
  salePrice: "",
  mrktPrice: "",
  wholesalePrice: "",
  openingStock: "",
  lowStockThreshold: "",
  commissionPercent: "",
  commissionAmount: "",
  itemDescription: "",
  tax: "",
  images: [],
  status: "Active",
  barcodeType: "auto",
  barcode: "",
};

const formatItemNo = (value) => String(Math.max(1, Number(value) || 1)).padStart(2, "0");
const isFourDigitBarcode = (value) => /^\d{4}$/.test(String(value || "").trim());
const normalizeOptionText = (value) => String(value || "").trim().replace(/\s+/g, " ");
const toUppercaseText = (value) => String(value || "").toUpperCase();
const normalizeOptionKey = (value) => normalizeOptionText(value).toLowerCase();
const autoCapitalizeWords = (value) =>
  String(value || "").replace(/\b([a-z])/g, (match) => match.toUpperCase());
const toDisplayOptionLabel = (value) => autoCapitalizeWords(normalizeOptionText(value));
const getUniqueOptionValues = (values = []) => {
  const seen = new Map();
  (values || []).forEach((value) => {
    const label = toDisplayOptionLabel(value);
    const key = normalizeOptionKey(label);
    if (!key || seen.has(key)) {
      return;
    }
    seen.set(key, label);
  });
  return Array.from(seen.values());
};
const findMatchingOption = (options = [], value) => {
  const key = normalizeOptionKey(value);
  if (!key) {
    return null;
  }
  return (options || []).find((option) => normalizeOptionKey(option) === key) || null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const getAdaptiveFieldStyle = (value, placeholder = "", minCh = 8, maxCh = 18) => {
  const width = clamp(
    Math.max(String(value || "").length, String(placeholder || "").length) + 1,
    minCh,
    maxCh,
  );
  return {
    width: `${width}ch`,
    minWidth: `${minCh}ch`,
  };
};

const createVariationRow = () => ({
  id: `var-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  itemId: null,
  size: "",
  color: "",
  images: [],
  barcodeType: "auto",
  barcode: "",
  purchasePrice: "",
  wholesalePrice: "",
  retailPrice: "",
  marketPrice: "",
  openingStock: "",
  commissionPercent: "",
  commissionAmount: "",
});

const VARIATION_DRAFTS_STORAGE_KEY = "inventory.variationDraftMap";

const toPersistableVariationRows = (rows = []) =>
  (rows || []).map((row) => ({
    id: row?.id || `var-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    itemId: Number(row?.itemId) || null,
    size: row?.size || "",
    color: row?.color || "",
    barcodeType: row?.barcodeType || "auto",
    barcode: row?.barcode || "",
    purchasePrice: row?.purchasePrice || "",
    wholesalePrice: row?.wholesalePrice || "",
    retailPrice: row?.retailPrice || "",
    marketPrice: row?.marketPrice || "",
    openingStock: row?.openingStock || "",
    commissionPercent: row?.commissionPercent || "",
    commissionAmount: row?.commissionAmount || "",
    images: Array.isArray(row?.images)
      ? row.images
          .map((image) => ({
            id: image?.id || `img-${Math.random().toString(36).slice(2)}`,
            preview: getImagePreviewValue(image),
          }))
          .filter(
            (image) =>
              image.preview.startsWith("http://") ||
              image.preview.startsWith("https://"),
          )
      : [],
  }));

const fromPersistedVariationRows = (rows = []) =>
  (rows || []).map((row) => ({
    ...createVariationRow(),
    ...row,
    images: Array.isArray(row?.images)
      ? row.images.map((image) => ({
          id: image?.id || `img-${Math.random().toString(36).slice(2)}`,
          preview: image?.preview || "",
          url: image?.preview || "",
        }))
      : [],
  }));

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

const getImagePreviewValue = (image) =>
  String(image?.preview || image?.url || image?.dataUrl || "").trim();

const getItemImageUrls = (item) => {
  const imageUrls = Array.isArray(item?.imageUrls)
    ? item.imageUrls.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (imageUrls.length > 0) {
    return imageUrls;
  }
  if (item?.imageUrl) {
    return [String(item.imageUrl).trim()].filter(Boolean);
  }
  return [];
};

const splitImagesForPayload = async (images) => {
  const imageUrls = [];
  const imageDataUrls = [];
  for (const image of images || []) {
    const previewValue = getImagePreviewValue(image);
    if (previewValue.startsWith("http://") || previewValue.startsWith("https://")) {
      imageUrls.push(previewValue);
      continue;
    }
    if (previewValue.startsWith("data:image")) {
      imageDataUrls.push(previewValue);
      continue;
    }
    if (previewValue.startsWith("blob:") && image?.file) {
      const dataUrl = await readFileAsDataUrl(image.file);
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
        imageDataUrls.push(dataUrl);
      }
    }
  }
  return { imageUrls, imageDataUrls };
};

function InventoryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("items");
  const [feedback, setFeedback] = useState(null);
  const [itemForm, setItemForm] = useState(() => ({ ...emptyItemForm, itemFormNo: "01" }));
  const [formMode, setFormMode] = useState("create");
  const [showItemForm, setShowItemForm] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [itemSearch, setItemSearch] = useState("");
  const [variationRows, setVariationRows] = useState([]);
  const [savingVariations, setSavingVariations] = useState(false);
  const [variationItemIds, setVariationItemIds] = useState([]);
  const [variationItemMap, setVariationItemMap] = useState({});
  const [variationDraftMap, setVariationDraftMap] = useState({});
  const [unitName, setUnitName] = useState("");
  const [pricingEdits, setPricingEdits] = useState({});
  const [activePriceCell, setActivePriceCell] = useState(null);
  const [importingItems, setImportingItems] = useState(false);
  const importInputRef = useRef(null);
  const productFormRef = useRef(null);
  const [customStores, setCustomStores] = useState([]);
  const [customDepartments, setCustomDepartments] = useState([]);
  const [customUnits, setCustomUnits] = useState([]);
  const variationDraftMapRef = useRef({});
  const variationItemMapRef = useRef({});
  const skipNextVariationDraftPersistRef = useRef(false);
  const pendingVariationFocusRowRef = useRef(null);

  const itemsQuery = useQuery({
    queryKey: ["inventory", "items"],
    queryFn: inventoryApi.listItems,
  });

  const categoriesQuery = useQuery({
    queryKey: ["inventory", "categories"],
    queryFn: inventoryApi.listCategories,
  });

  const unitsQuery = useQuery({
    queryKey: ["inventory", "units"],
    queryFn: inventoryApi.listUnits,
  });

  const lowStockQuery = useQuery({
    queryKey: ["inventory", "low-stock"],
    queryFn: inventoryApi.lowStockAlerts,
  });

  const items = itemsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const units = useMemo(() => {
    const source = Array.isArray(unitsQuery.data) ? unitsQuery.data.map((unit) => unit.name) : [];
    return getUniqueOptionValues(source);
  }, [unitsQuery.data]);
  const stockAlerts = lowStockQuery.data || [];
  const nextAutoItemNo = useMemo(() => {
    const maxId = items.reduce((max, item) => {
      const itemId = Number(item?.id) || 0;
      return itemId > max ? itemId : max;
    }, 0);
    return formatItemNo(maxId + 1);
  }, [items]);
  const normalizedItemSearch = itemSearch.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedItemSearch) {
      return items;
    }
    return items.filter((item) => {
      const haystack = [
        item.name,
        item.sku,
        item.barcode,
        item.category?.name,
        item.unit?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedItemSearch);
    });
  }, [items, normalizedItemSearch]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId],
  );
  const hasSelectedItem = Boolean(selectedItemId);
  const variationItemIdSet = useMemo(
    () => new Set((variationItemIds || []).map((id) => Number(id)).filter(Boolean)),
    [variationItemIds],
  );
  const itemsById = useMemo(
    () =>
      new Map(
        (items || []).map((item) => [Number(item?.id), item]).filter(([id]) => Number.isFinite(id) && id > 0),
      ),
    [items],
  );
  const variationParentLookup = useMemo(() => {
    const lookup = new Map();
    Object.entries(variationItemMap || {}).forEach(([parentId, entries]) => {
      (entries || []).forEach((entry) => {
        const variationId = Number(entry?.itemId);
        const parent = Number(parentId);
        if (Number.isFinite(variationId) && variationId > 0 && Number.isFinite(parent) && parent > 0) {
          lookup.set(variationId, parent);
        }
      });
    });
    return lookup;
  }, [variationItemMap]);
  const buildVariationRowsFromSavedEntries = (entries = []) =>
    (entries || []).map((entry, index) => {
      const itemId = Number(entry?.itemId) || null;
      const linkedItem = itemId ? itemsById.get(itemId) : null;
      const imageUrls = linkedItem ? getItemImageUrls(linkedItem) : [];
      const toFieldValue = (value) => (value === null || value === undefined ? "" : String(value));
      return {
        ...createVariationRow(),
        id: `var-saved-${itemId || index}`,
        itemId,
        size: String(entry?.size || "").trim(),
        color: String(entry?.color || "").trim(),
        barcodeType: String(linkedItem?.barcodeType || entry?.barcodeType || "auto").toLowerCase().includes("physical")
          ? "physical"
          : "auto",
        barcode: String(linkedItem?.barcode || entry?.barcode || "").trim(),
        purchasePrice: toFieldValue(linkedItem?.purchasePrice ?? entry?.purchasePrice),
        wholesalePrice: toFieldValue(linkedItem?.wholesalePrice ?? entry?.wholesalePrice),
        retailPrice: toFieldValue(linkedItem?.salePrice ?? linkedItem?.retailPrice ?? entry?.retailPrice),
        marketPrice: toFieldValue(linkedItem?.marketPrice ?? entry?.marketPrice),
        openingStock: toFieldValue(linkedItem?.currentStock ?? entry?.openingStock),
        commissionPercent: toFieldValue(linkedItem?.commissionPercent ?? entry?.commissionPercent),
        commissionAmount: toFieldValue(linkedItem?.commissionAmount ?? entry?.commissionAmount),
        images: imageUrls.map((url, imageIndex) => ({
          id: `saved-var-${itemId || index}-${imageIndex}`,
          preview: url,
          url,
        })),
      };
    });
  const groupedDisplayRows = useMemo(() => {
    const filteredById = new Map(
      filteredItems
        .map((item) => [Number(item?.id), item])
        .filter(([id]) => Number.isFinite(id) && id > 0),
    );
    const rows = [];
    const seen = new Set();
    const pushRow = (item, isVariation = false, parentId = null) => {
      const itemId = Number(item?.id);
      if (!Number.isFinite(itemId) || itemId <= 0 || seen.has(itemId)) {
        return;
      }
      seen.add(itemId);
      rows.push({ item, isVariation, parentId });
    };

    filteredItems.forEach((item) => {
      const itemId = Number(item?.id);
      if (!Number.isFinite(itemId) || itemId <= 0 || seen.has(itemId)) {
        return;
      }
      const parentId = variationParentLookup.get(itemId) || null;
      if (parentId && filteredById.has(parentId)) {
        return;
      }
      const childEntries = variationItemMap[String(itemId)] || [];
      const visibleChildren = childEntries
        .map((entry) => filteredById.get(Number(entry?.itemId)))
        .filter(Boolean);
      if (visibleChildren.length > 0) {
        visibleChildren.forEach((childItem) => {
          pushRow(childItem, true, itemId);
        });
        return;
      }
      const isVariation = variationItemIdSet.has(itemId);
      pushRow(item, isVariation, parentId);
      childEntries.forEach((entry) => {
        const childItem = filteredById.get(Number(entry?.itemId));
        if (childItem) {
          pushRow(childItem, true, itemId);
        }
      });
    });

    filteredItems.forEach((item) => {
      const itemId = Number(item?.id);
      if (seen.has(itemId)) {
        return;
      }
      pushRow(item, variationItemIdSet.has(itemId), variationParentLookup.get(itemId) || null);
    });

    return rows;
  }, [filteredItems, variationItemIdSet, variationItemMap, variationParentLookup]);
  const getFallbackVariationEntries = (parentItem) => {
    if (!parentItem || variationItemIdSet.has(Number(parentItem?.id))) {
      return [];
    }
    const baseName = String(parentItem?.name || "").trim().toLowerCase();
    if (!baseName) {
      return [];
    }
    return items
      .filter((entry) => {
        const entryId = Number(entry?.id);
        if (!variationItemIdSet.has(entryId)) {
          return false;
        }
        const name = String(entry?.name || "").trim().toLowerCase();
        return name.startsWith(`${baseName} `);
      })
      .map((entry) => ({
        itemId: Number(entry.id),
        name: entry.name,
        size: "",
        color: "",
        barcodeType: entry.barcodeType || "auto",
        barcode: entry.barcode || "",
        purchasePrice: Number(entry.purchasePrice || 0),
        wholesalePrice: Number(entry.wholesalePrice || 0),
        retailPrice: Number(entry.salePrice ?? entry.retailPrice ?? 0),
        marketPrice: Number(entry.marketPrice || 0),
        commissionPercent: Number(entry.commissionPercent || 0),
        commissionAmount: Number(entry.commissionAmount || 0),
        openingStock: Number(entry.currentStock || 0),
      }));
  };
  const selectedSavedVariations = useMemo(() => {
    const mapped = variationItemMap[String(selectedItemId)] || [];
    if (mapped.length > 0) {
      return mapped;
    }
    return getFallbackVariationEntries(selectedItem);
  }, [variationItemMap, selectedItemId, selectedItem, variationItemIdSet, items]);

  const isPreview = formMode === "preview";
  const isEditing = formMode === "edit";
  const canEditVariationDraft = !isPreview && (hasSelectedItem || !isEditing);
  const storeOptions = useMemo(() => {
    return getUniqueOptionValues([...STORES, ...customStores]);
  }, [customStores]);
  const categoryOptions = useMemo(
    () => getUniqueOptionValues([...(categories || []).map((category) => category?.name), ...CATEGORIES]),
    [categories],
  );
  const departmentOptions = useMemo(() => {
    return getUniqueOptionValues([...DEPARTMENTS, ...customDepartments]);
  }, [customDepartments]);
  const unitOptions = useMemo(() => {
    return getUniqueOptionValues([...units, ...customUnits]);
  }, [units, customUnits]);
  const isVariationRowEmpty = (row) => {
    const fields = [
      "size",
      "color",
      "barcode",
      "purchasePrice",
      "wholesalePrice",
      "retailPrice",
      "marketPrice",
      "openingStock",
      "commissionPercent",
      "commissionAmount",
    ];
    return !fields.some((field) => String(row[field] || "").trim() !== "");
  };

  const revokeImagePreviews = (images) => {
    images.forEach((image) => {
      if (typeof image?.preview === "string" && image.preview.startsWith("blob:")) {
        URL.revokeObjectURL(image.preview);
      }
    });
  };

  const revokeVariationPreviews = (rows) => {
    rows.forEach((row) => {
      row?.images?.forEach((image) => {
        if (typeof image?.preview === "string" && image.preview.startsWith("blob:")) {
          URL.revokeObjectURL(image.preview);
        }
      });
    });
  };

  useEffect(() => {
    const storedStores = JSON.parse(localStorage.getItem("inventory.customStores") || "[]");
    const storedDepartments = JSON.parse(
      localStorage.getItem("inventory.customDepartments") || "[]",
    );
    const storedUnits = JSON.parse(localStorage.getItem("inventory.customUnits") || "[]");
    if (Array.isArray(storedStores)) setCustomStores(getUniqueOptionValues(storedStores));
    if (Array.isArray(storedDepartments)) {
      setCustomDepartments(getUniqueOptionValues(storedDepartments));
    }
    if (Array.isArray(storedUnits)) setCustomUnits(getUniqueOptionValues(storedUnits));
  }, []);

  useEffect(() => {
    localStorage.setItem("inventory.customStores", JSON.stringify(getUniqueOptionValues(customStores)));
  }, [customStores]);

  useEffect(() => {
    localStorage.setItem(
      "inventory.customDepartments",
      JSON.stringify(getUniqueOptionValues(customDepartments)),
    );
  }, [customDepartments]);

  useEffect(() => {
    localStorage.setItem("inventory.customUnits", JSON.stringify(getUniqueOptionValues(customUnits)));
  }, [customUnits]);

  useEffect(() => {
    const storedVariationIds = JSON.parse(localStorage.getItem("inventory.variationItemIds") || "[]");
    if (Array.isArray(storedVariationIds)) {
      setVariationItemIds(storedVariationIds);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("inventory.variationItemIds", JSON.stringify(variationItemIds));
  }, [variationItemIds]);

  useEffect(() => {
    const storedVariationMap = JSON.parse(localStorage.getItem("inventory.variationItemMap") || "{}");
    if (storedVariationMap && typeof storedVariationMap === "object" && !Array.isArray(storedVariationMap)) {
      setVariationItemMap(storedVariationMap);
    }
  }, []);

  useEffect(() => {
    variationItemMapRef.current = variationItemMap;
    localStorage.setItem("inventory.variationItemMap", JSON.stringify(variationItemMap));
  }, [variationItemMap]);

  useEffect(() => {
    const storedVariationDraftMap = JSON.parse(localStorage.getItem(VARIATION_DRAFTS_STORAGE_KEY) || "{}");
    if (
      storedVariationDraftMap &&
      typeof storedVariationDraftMap === "object" &&
      !Array.isArray(storedVariationDraftMap)
    ) {
      setVariationDraftMap(storedVariationDraftMap);
    }
  }, []);

  useEffect(() => {
    variationDraftMapRef.current = variationDraftMap;
    localStorage.setItem(VARIATION_DRAFTS_STORAGE_KEY, JSON.stringify(variationDraftMap));
  }, [variationDraftMap]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }
    const timeoutMs = 1800;
    const timer = window.setTimeout(() => {
      setFeedback(null);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const resetItemForm = () => {
    setItemForm((prev) => {
      revokeImagePreviews(prev.images);
      return {
        ...emptyItemForm,
        itemFormNo: nextAutoItemNo,
      };
    });
    setSelectedItemId(null);
    setFormMode("create");
  };

  const formatNumeric = (value) => (value === null || value === undefined ? "" : String(value));
  const normalizeExcelHeader = (value) => String(value || "").trim().toLowerCase();
  const parseImportNumber = (value, fallback = 0) => {
    const cleaned = String(value ?? "")
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "")
      .trim();
    if (!cleaned) {
      return fallback;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const buildImportPayload = (row) => {
    const normalizedRow = Object.entries(row || {}).reduce((acc, [key, value]) => {
      acc[normalizeExcelHeader(key)] = value;
      return acc;
    }, {});
    const readValue = (keys) => {
      for (const key of keys) {
        const value = normalizedRow[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return value;
        }
      }
      return "";
    };
    const name = String(readValue(["name", "product name", "item name"])).trim();
    if (!name) {
      return null;
    }
    const sku = String(readValue(["sku", "item sku", "product sku"])).trim();
    const categoryName = String(readValue(["category", "category name"])).trim();
    const unit = String(readValue(["unit", "uom"])).trim();
    const barcodeRaw = String(readValue(["barcode", "barcode string"])).trim();
    const barcode = barcodeRaw === "-" ? "" : barcodeRaw;
    const statusRaw = String(readValue(["status"])).trim().toLowerCase();
    const barcodeTypeRaw = String(readValue(["barcode type"])).trim().toLowerCase();
    const parentProductName = String(
      readValue(["parent product", "parent item", "variation of", "parent name"]),
    ).trim();
    const rowTypeRaw = String(readValue(["row type", "type", "is variation"])).trim().toLowerCase();
    const shouldTreatAsVariation =
      Boolean(parentProductName) ||
      rowTypeRaw.includes("variation") ||
      rowTypeRaw === "yes" ||
      rowTypeRaw === "true" ||
      rowTypeRaw === "1";
    const normalizedParentProductName = parentProductName.toLowerCase();
    const resolvedBarcodeType = barcodeTypeRaw
      ? barcodeTypeRaw.includes("physical")
        ? "physical"
        : "auto"
      : barcode
        ? "physical"
        : "auto";

    return {
      name,
      sku: sku || null,
      status: statusRaw ? (statusRaw.includes("inactive") ? "Inactive" : "Active") : "Active",
      categoryName: categoryName || undefined,
      unit: unit || undefined,
      lowStockThreshold: parseImportNumber(
        readValue(["restock level", "low stock", "low stock threshold", "restock", "min stock"]),
        5,
      ),
      barcodeType: resolvedBarcodeType,
      barcode: barcode || null,
      purchasePrice: parseImportNumber(readValue(["purchase price", "pur price", "purchase"])),
      wholesalePrice: parseImportNumber(readValue(["wholesale price", "wholesale"])),
      retailPrice: parseImportNumber(readValue(["sale price", "sale", "retail price", "retail"])),
      marketPrice: parseImportNumber(readValue(["market price", "market"])),
      commissionPercent: parseImportNumber(readValue(["commission %", "commission percent"])),
      commissionAmount: parseImportNumber(
        readValue(["commission amount", "commission", "commission per unit"]),
      ),
      openingStock: parseImportNumber(readValue(["opening stock", "stock", "current stock"])),
      _parentProductName: shouldTreatAsVariation ? normalizedParentProductName : "",
    };
  };

const buildItemFormFromItem = (item) => ({
    ...emptyItemForm,
    itemFormNo: formatItemNo(item?.id),
    name: item?.name || "",
    status: item?.status || "Active",
    categoryName: item?.category?.name || "",
    unit: item?.unit?.name || item?.unit || emptyItemForm.unit,
    lowStockThreshold: formatNumeric(item?.lowStockThreshold ?? emptyItemForm.lowStockThreshold),
  barcodeType: item?.barcodeType || emptyItemForm.barcodeType,
  barcode:
    String(item?.barcodeType || "")
      .toLowerCase()
      .includes("auto") && !isFourDigitBarcode(item?.barcode)
      ? ""
      : item?.barcode || "",
    purPrice: formatNumeric(item?.purchasePrice),
    wholesalePrice: formatNumeric(item?.wholesalePrice),
    salePrice: formatNumeric(item?.salePrice ?? item?.retailPrice),
    mrktPrice: formatNumeric(item?.marketPrice),
    commissionPercent: formatNumeric(item?.commissionPercent),
    commissionAmount: formatNumeric(item?.commissionAmount),
    openingStock: formatNumeric(item?.currentStock),
    images: getItemImageUrls(item).map((url, index) => ({
      id: `stored-item-${item?.id}-${index}`,
      preview: url,
      url,
    })),
  });

  const handleProductRowClick = (item) => {
    if (!item) {
      return;
    }
    const clickedItemId = Number(item.id);
    const isVariationItem = variationItemIdSet.has(clickedItemId);
    const parentId = variationParentLookup.get(clickedItemId);
    const targetId =
      isVariationItem && Number.isFinite(Number(parentId)) && Number(parentId) > 0
        ? Number(parentId)
        : clickedItemId;
    setActivePriceCell(null);
    setSelectedItemId(targetId);
    setFormMode("preview");
  };
  const handleEditProductFromList = (event, item) => {
    event.stopPropagation();
    if (!item) {
      return;
    }
    const clickedItemId = Number(item.id);
    const isVariationItem = variationItemIdSet.has(clickedItemId);
    const parentId = variationParentLookup.get(clickedItemId);
    const targetId =
      isVariationItem && Number.isFinite(Number(parentId)) && Number(parentId) > 0
        ? Number(parentId)
        : clickedItemId;
    const targetItem = itemsById.get(targetId);
    if (!targetItem) {
      setFeedback({ type: "error", message: "Product not found for editing." });
      return;
    }
    setActivePriceCell(null);
    setShowItemForm(true);
    setSelectedItemId(targetId);
    setItemForm((prev) => {
      revokeImagePreviews(prev.images);
      return buildItemFormFromItem(targetItem);
    });
    setFormMode("edit");
  };

  useEffect(() => {
    if (selectedItem && isPreview) {
      setItemForm((prev) => {
        revokeImagePreviews(prev.images);
        return buildItemFormFromItem(selectedItem);
      });
    }
  }, [selectedItem, isPreview]);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    const key = String(selectedItemId);
    const savedRows = variationDraftMapRef.current?.[key];
    const savedEntries = variationItemMapRef.current?.[key] || getFallbackVariationEntries(selectedItem);
    skipNextVariationDraftPersistRef.current = true;
    setVariationRows((prev) => {
      revokeVariationPreviews(prev);
      if (Array.isArray(savedRows) && savedRows.length > 0) {
        return fromPersistedVariationRows(savedRows);
      }
      if (Array.isArray(savedEntries) && savedEntries.length > 0) {
        return buildVariationRowsFromSavedEntries(savedEntries);
      }
      return [];
    });
  }, [selectedItemId, selectedItem, itemsById, items, variationItemIdSet]);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    if (skipNextVariationDraftPersistRef.current) {
      skipNextVariationDraftPersistRef.current = false;
      return;
    }
    const key = String(selectedItemId);
    setVariationDraftMap((prev) => ({
      ...(prev || {}),
      [key]: toPersistableVariationRows(variationRows),
    }));
  }, [variationRows, selectedItemId]);

  useEffect(() => {
    const targetRowId = pendingVariationFocusRowRef.current;
    if (!targetRowId) {
      return;
    }
    const input = document.querySelector(
      `[data-variation-size-input="${targetRowId}"]`,
    );
    if (input instanceof HTMLElement) {
      input.focus();
      if ("select" in input && typeof input.select === "function") {
        input.select();
      }
      pendingVariationFocusRowRef.current = null;
    }
  }, [variationRows]);

  const createItemMutation = useMutation({
    mutationFn: inventoryApi.createItem,
    onSuccess: (data) => {
      setFeedback({ type: "success", message: "Product saved. You can add variations now." });
      if (data?.id) {
        setSelectedItemId(data.id);
        setFormMode("preview");
        setItemForm((prev) => {
          revokeImagePreviews(prev.images);
          return buildItemFormFromItem(data);
        });
        setVariationRows((prev) => {
          revokeVariationPreviews(prev);
          return [createVariationRow()];
        });
      } else {
        resetItemForm();
      }
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "units"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to save product.") });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, payload }) => inventoryApi.updateItem(itemId, payload),
    onSuccess: (data) => {
      setFeedback({ type: "success", message: "Product updated successfully." });
      setFormMode("preview");
      if (data?.id) {
        setSelectedItemId(data.id);
        setItemForm((prev) => {
          revokeImagePreviews(prev.images);
          return buildItemFormFromItem(data);
        });
      }
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "units"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to update product.") });
    },
  });

  const createUnitMutation = useMutation({
    mutationFn: inventoryApi.createUnit,
    onSuccess: () => {
      setFeedback({ type: "success", message: "Unit added successfully." });
      setUnitName("");
      queryClient.invalidateQueries({ queryKey: ["inventory", "units"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to add unit.") });
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: ({ itemId, payload }) => inventoryApi.updateItemPricing(itemId, payload),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Pricing updated." });
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to update pricing.") });
    },
  });

  const saveVariationRowsForItem = async (parentItem, rows) => {
    const parentItemId = Number(parentItem?.id);
    if (!Number.isFinite(parentItemId) || parentItemId <= 0) {
      throw new Error("Product is required before saving variations.");
    }
    const rowsToSave = (rows || []).filter((row) => !isVariationRowEmpty(row));
    if (rowsToSave.length === 0) {
      return { savedCount: 0 };
    }
    const savedVariationItems = await Promise.all(
      rowsToSave.map(async (row) => {
        const sizeText = String(row.size || "").trim();
        const colorText = String(row.color || "").trim();
        if (!sizeText && !colorText) {
          throw new Error("Each variation must include size or color.");
        }
        const variationName = [parentItem?.name, sizeText, colorText]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join(" ");
        const { imageUrls, imageDataUrls } = await splitImagesForPayload(row.images);
        const payload = {
          name: variationName,
          status: parentItem?.status || "Active",
          categoryId: parentItem?.categoryId || parentItem?.category?.id || undefined,
          categoryName: parentItem?.category?.name || itemForm.categoryName || undefined,
          unit: parentItem?.unit?.name || parentItem?.unit || itemForm.unit || undefined,
          lowStockThreshold: Number(parentItem?.lowStockThreshold || itemForm.lowStockThreshold || 5),
          barcodeType: row.barcodeType || null,
          barcode: String(row.barcodeType || "").toLowerCase() === "auto" ? null : row.barcode || null,
          purchasePrice: Number(row.purchasePrice || 0),
          wholesalePrice: Number(row.wholesalePrice || 0),
          retailPrice: Number(row.retailPrice || 0),
          marketPrice: Number(row.marketPrice || 0),
          commissionPercent: Number(row.commissionPercent || 0),
          commissionAmount: Number(row.commissionAmount || 0),
          openingStock: Number(row.openingStock || 0),
          imageUrls,
          imageDataUrls,
        };
        const rowItemId = Number(row.itemId);
        if (Number.isFinite(rowItemId) && rowItemId > 0) {
          return inventoryApi.updateItem(rowItemId, payload);
        }
        return inventoryApi.createItem(payload);
      }),
    );
    const savedItemIds = savedVariationItems.map((item) => {
      const id = Number(item?.id);
      return Number.isFinite(id) && id > 0 ? id : null;
    });
    const validSavedIds = savedItemIds.filter(Boolean);
    if (validSavedIds.length > 0) {
      setVariationItemIds((prev) => Array.from(new Set([...(prev || []), ...validSavedIds])));
    }
    const savedEntries = rowsToSave
      .map((row, index) => ({
        itemId: savedItemIds[index] || null,
        name: savedVariationItems[index]?.name || "",
        size: String(row.size || "").trim(),
        color: String(row.color || "").trim(),
        barcodeType: row.barcodeType || "auto",
        barcode:
          String(row.barcodeType || "").toLowerCase() === "auto" ? "" : String(row.barcode || "").trim(),
        purchasePrice: Number(row.purchasePrice || 0),
        wholesalePrice: Number(row.wholesalePrice || 0),
        retailPrice: Number(row.retailPrice || 0),
        marketPrice: Number(row.marketPrice || 0),
        commissionPercent: Number(row.commissionPercent || 0),
        commissionAmount: Number(row.commissionAmount || 0),
        openingStock: Number(row.openingStock || 0),
      }))
      .filter((entry) => Number(entry.itemId) > 0);
    setVariationItemMap((prev) => {
      const parentKey = String(parentItemId);
      const existing = Array.isArray(prev?.[parentKey]) ? prev[parentKey] : [];
      const mergedMap = new Map();
      [...existing, ...savedEntries].forEach((entry) => {
        const key = Number(entry?.itemId);
        if (!Number.isFinite(key) || key <= 0) {
          return;
        }
        mergedMap.set(key, entry);
      });
      return {
        ...(prev || {}),
        [parentKey]: Array.from(mergedMap.values()),
      };
    });
    setVariationRows((prev) => {
      revokeVariationPreviews(prev);
      return rowsToSave.map((row, index) => ({
        ...row,
        itemId: savedItemIds[index] || row.itemId || null,
      }));
    });
    queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "low-stock"] });
    return { savedCount: rowsToSave.length };
  };

  const handleItemSubmit = async (event) => {
    event.preventDefault();
    if (isPreview) {
      return;
    }
    setFeedback(null);
    try {
      const matchedCategory = categories.find(
        (category) => normalizeOptionKey(category.name) === normalizeOptionKey(itemForm.categoryName),
      );
      const { imageUrls, imageDataUrls } = await splitImagesForPayload(itemForm.images);
      const payload = {
        name: normalizeOptionText(toUppercaseText(itemForm.name)),
        status: itemForm.status,
        categoryId: matchedCategory?.id,
        categoryName: matchedCategory
          ? undefined
          : normalizeOptionText(itemForm.categoryName) || undefined,
        unit: normalizeOptionText(itemForm.unit),
        lowStockThreshold: Number(itemForm.lowStockThreshold || 5),
        barcodeType: itemForm.barcodeType,
        barcode:
          String(itemForm.barcodeType || "").toLowerCase() === "auto"
            ? null
            : itemForm.barcode || null,
        purchasePrice: Number(itemForm.purPrice || 0),
        wholesalePrice: Number(itemForm.wholesalePrice || 0),
        retailPrice: Number(itemForm.salePrice || 0),
        marketPrice: Number(itemForm.mrktPrice || 0),
        commissionPercent: Number(itemForm.commissionPercent || 0),
        commissionAmount: Number(itemForm.commissionAmount || 0),
        openingStock: Number(itemForm.openingStock || 0),
        imageUrls,
        imageDataUrls,
      };
      const variationSnapshot = variationRows.map((row) => ({
        ...row,
        images: Array.isArray(row.images) ? [...row.images] : [],
      }));
      const hasVariationRows = variationSnapshot.some((row) => !isVariationRowEmpty(row));

      if (isEditing && selectedItemId) {
        const updatedItem = await updateItemMutation.mutateAsync({ itemId: selectedItemId, payload });
        if (hasVariationRows) {
          setSavingVariations(true);
          await saveVariationRowsForItem(updatedItem, variationSnapshot);
          setFeedback({ type: "success", message: "Product and variations saved successfully." });
        }
        return;
      }

      const createdItem = await createItemMutation.mutateAsync(payload);
      if (hasVariationRows) {
        setSavingVariations(true);
        await saveVariationRowsForItem(createdItem, variationSnapshot);
        setFeedback({ type: "success", message: "Product with variations saved successfully." });
      }
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to save product.") });
    } finally {
      setSavingVariations(false);
    }
  };

  const handleItemFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "barcodeType") {
      setItemForm((prev) => ({
        ...prev,
        barcodeType: value,
        barcode: value === "auto" ? "" : prev.barcode,
      }));
      return;
    }
    const nextValue = name === "name" ? toUppercaseText(value) : value;
    setItemForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (checked ? "Active" : "Inactive") : nextValue,
    }));
  };

  const handleNormalizedOptionBlur = (field, options = [], setCustomOptions) => {
    const normalizedValue = normalizeOptionText(itemForm[field]);
    if (!normalizedValue) {
      setItemForm((prev) => ({ ...prev, [field]: "" }));
      return;
    }
    const matched = findMatchingOption(options, normalizedValue);
    const nextValue = matched || toDisplayOptionLabel(normalizedValue);
    setItemForm((prev) => ({ ...prev, [field]: nextValue }));
    if (!matched && typeof setCustomOptions === "function") {
      setCustomOptions((prev) => getUniqueOptionValues([...(prev || []), nextValue]));
    }
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      return;
    }
    const newImages = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setItemForm((prev) => ({
      ...prev,
      images: [...prev.images, ...newImages],
    }));
    e.target.value = "";
  };

  const handleImageRemove = (imageId) => {
    setItemForm((prev) => {
      const target = prev.images.find((image) => image.id === imageId);
      if (typeof target?.preview === "string" && target.preview.startsWith("blob:")) {
        URL.revokeObjectURL(target.preview);
      }
      return {
        ...prev,
        images: prev.images.filter((image) => image.id !== imageId),
      };
    });
  };

  const handleNewProduct = () => {
    setShowItemForm(true);
    resetItemForm();
    setVariationRows((prev) => {
      revokeVariationPreviews(prev);
      return [createVariationRow()];
    });
  };

  const handleCloseProduct = () => {
    setShowItemForm(false);
  };

  const handleImportItems = async (file) => {
    if (!file) {
      return;
    }
    setFeedback(null);
    setImportingItems(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setFeedback({ type: "error", message: "No worksheet found in the file." });
        return;
      }
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
      if (!rows.length) {
        setFeedback({ type: "error", message: "No rows found in the import file." });
        return;
      }
      const existingSkus = new Set(
        items
          .map((item) => String(item.sku || "").trim().toLowerCase())
          .filter(Boolean),
      );
      const seenSkus = new Set(existingSkus);
      let skipped = 0;
      let clearedSkus = 0;
      const payloads = [];
      rows.forEach((row) => {
        const payload = buildImportPayload(row);
        if (!payload) {
          skipped += 1;
          return;
        }
        if (payload.sku) {
          const key = payload.sku.trim().toLowerCase();
          if (seenSkus.has(key)) {
            payload.sku = null;
            clearedSkus += 1;
          } else {
            seenSkus.add(key);
          }
        }
        payloads.push(payload);
      });
      if (!payloads.length) {
        setFeedback({ type: "error", message: "No valid product rows found to import." });
        return;
      }
      const createdItems = await Promise.all(
        payloads.map((payload) => {
          const {
            _parentProductName,
            ...apiPayload
          } = payload;
          return inventoryApi.createItem(apiPayload);
        }),
      );

      const existingByName = new Map();
      items.forEach((item) => {
        const key = String(item?.name || "").trim().toLowerCase();
        if (!key || existingByName.has(key)) {
          return;
        }
        existingByName.set(key, item);
      });
      const createdByName = new Map();
      createdItems.forEach((item) => {
        const key = String(item?.name || "").trim().toLowerCase();
        if (!key || createdByName.has(key)) {
          return;
        }
        createdByName.set(key, item);
      });

      const importedVariationLinks = [];
      payloads.forEach((payload, index) => {
        const parentKey = String(payload?._parentProductName || "").trim().toLowerCase();
        if (!parentKey) {
          return;
        }
        const child = createdItems[index];
        const childId = Number(child?.id);
        const parent =
          createdByName.get(parentKey) ||
          existingByName.get(parentKey);
        const parentId = Number(parent?.id);
        if (
          Number.isFinite(childId) &&
          childId > 0 &&
          Number.isFinite(parentId) &&
          parentId > 0 &&
          childId !== parentId
        ) {
          importedVariationLinks.push({
            parentId,
            childId,
            childName: child?.name || payload?.name || "",
            size: "",
            color: "",
            barcodeType: child?.barcodeType || payload?.barcodeType || "auto",
            barcode: child?.barcode || payload?.barcode || "",
            purchasePrice: Number(child?.purchasePrice ?? payload?.purchasePrice ?? 0),
            wholesalePrice: Number(child?.wholesalePrice ?? payload?.wholesalePrice ?? 0),
            retailPrice: Number(child?.salePrice ?? child?.retailPrice ?? payload?.retailPrice ?? 0),
            marketPrice: Number(child?.marketPrice ?? payload?.marketPrice ?? 0),
            commissionPercent: Number(child?.commissionPercent ?? payload?.commissionPercent ?? 0),
            commissionAmount: Number(child?.commissionAmount ?? payload?.commissionAmount ?? 0),
            openingStock: Number(child?.currentStock ?? payload?.openingStock ?? 0),
          });
        }
      });

      if (importedVariationLinks.length > 0) {
        setVariationItemIds((prev) => {
          const next = new Set((prev || []).map((id) => Number(id)).filter(Boolean));
          importedVariationLinks.forEach((link) => next.add(link.childId));
          return Array.from(next);
        });
        setVariationItemMap((prev) => {
          const next = { ...(prev || {}) };
          importedVariationLinks.forEach((link) => {
            const parentKey = String(link.parentId);
            const existingEntries = Array.isArray(next[parentKey]) ? next[parentKey] : [];
            const merged = new Map();
            [...existingEntries].forEach((entry) => {
              const key = Number(entry?.itemId);
              if (Number.isFinite(key) && key > 0) {
                merged.set(key, entry);
              }
            });
            merged.set(link.childId, {
              itemId: link.childId,
              name: link.childName,
              size: link.size,
              color: link.color,
              barcodeType: link.barcodeType,
              barcode: link.barcode,
              purchasePrice: link.purchasePrice,
              wholesalePrice: link.wholesalePrice,
              retailPrice: link.retailPrice,
              marketPrice: link.marketPrice,
              commissionPercent: link.commissionPercent,
              commissionAmount: link.commissionAmount,
              openingStock: link.openingStock,
            });
            next[parentKey] = Array.from(merged.values());
          });
          return next;
        });
      }

      const hasDuplicates = clearedSkus > 0;
      const baseMessage = `Imported ${payloads.length} products.`;
      const skippedMessage = skipped > 0 ? ` Skipped ${skipped} rows.` : "";
      const duplicateMessage = hasDuplicates
        ? ` ${clearedSkus} duplicate SKUs found and removed.`
        : "";
      const variationMessage =
        importedVariationLinks.length > 0
          ? ` Linked ${importedVariationLinks.length} imported variation rows.`
          : "";
      setFeedback({
        type: hasDuplicates ? "error" : "success",
        message: `${baseMessage}${skippedMessage}${duplicateMessage}${variationMessage}`.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "units"] });
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to import products.") });
    } finally {
      setImportingItems(false);
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleExportItems = () => {
    if (!groupedDisplayRows.length) {
      setFeedback({ type: "error", message: "No products available to export." });
      return;
    }
    const rows = groupedDisplayRows.map((row, index) => {
      const item = row.item;
      const parentItem =
        row.isVariation && row.parentId ? itemsById.get(Number(row.parentId)) : null;
      return {
        "Item No": index + 1,
        Barcode: item.barcode || "",
        "Item Name": item.name || "",
        "Row Type": row.isVariation ? "Variation" : "Product",
        "Parent Product": parentItem?.name || "",
        "Purchase Price": item.purchasePrice ?? 0,
        "Sale Price": item.salePrice ?? item.retailPrice ?? 0,
        "Wholesale Price": item.wholesalePrice ?? 0,
        "Market Price": item.marketPrice ?? 0,
        "Current Stock": item.currentStock ?? 0,
        "Restock Level": item.lowStockThreshold ?? 0,
        Category: item.category?.name || "",
        Unit: item.unit?.name || item.unit || "",
        Status: item.status || "",
        "Barcode Type": item.barcodeType || "",
        "Commission %": item.commissionPercent ?? 0,
        "Commission Amount": item.commissionAmount ?? 0,
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ProductList");
    XLSX.writeFile(workbook, "product-list-current-format.xlsx");
  };

  const handleVariationRowChange = (rowId, field, value) => {
    setVariationRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        if (field === "barcodeType") {
          return {
            ...row,
            barcodeType: value,
            barcode: value === "auto" ? "" : row.barcode,
          };
        }
        if (field === "size" || field === "color") {
          return { ...row, [field]: toUppercaseText(value) };
        }
        return { ...row, [field]: value };
      }),
    );
  };

  const handleVariationImageChange = (rowId, files) => {
    const incoming = Array.from(files || []);
    if (incoming.length === 0) {
      return;
    }
    const newImages = incoming.map((file) => ({
      id: `${rowId}-${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setVariationRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        return { ...row, images: [...row.images, ...newImages] };
      }),
    );
  };

  const handleRemoveVariationImage = (rowId, imageId) => {
    setVariationRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const target = row.images.find((image) => image.id === imageId);
        if (typeof target?.preview === "string" && target.preview.startsWith("blob:")) {
          URL.revokeObjectURL(target.preview);
        }
        return { ...row, images: row.images.filter((image) => image.id !== imageId) };
      }),
    );
  };

  const handleAddVariationRow = () => {
    if (isPreview) {
      return null;
    }
    if (hasSelectedItem && !selectedItem) {
      setFeedback({ type: "error", message: "Selected product not found. Please reselect product." });
      return null;
    }
    const nextRow = createVariationRow();
    setVariationRows((prev) => [...prev, nextRow]);
    return nextRow.id;
  };

  const handleVariationLastFieldEnter = (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const nextRowId = handleAddVariationRow();
    if (nextRowId) {
      pendingVariationFocusRowRef.current = nextRowId;
    }
  };

  const handleRemoveVariationRow = (rowId) => {
    setVariationRows((prev) => {
      const target = prev.find((row) => row.id === rowId);
      target?.images?.forEach((image) => {
        if (typeof image?.preview === "string" && image.preview.startsWith("blob:")) {
          URL.revokeObjectURL(image.preview);
        }
      });
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const handleSaveVariations = async (event) => {
    event.preventDefault();
    setFeedback(null);
    if (!hasSelectedItem) {
      setFeedback({ type: "error", message: "Select a product to add variations." });
      return;
    }
    if (!selectedItem) {
      setFeedback({ type: "error", message: "Selected product not found. Please reselect product." });
      return;
    }
    const rowsToSave = variationRows.filter((row) => !isVariationRowEmpty(row));
    if (rowsToSave.length === 0) {
      setFeedback({ type: "error", message: "Add at least one variation row." });
      return;
    }
    try {
      setSavingVariations(true);
      await saveVariationRowsForItem(selectedItem, variationRows);
      setFeedback({ type: "success", message: "Variations saved successfully." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: extractApiError(error, "Failed to save variations as products."),
      });
    } finally {
      setSavingVariations(false);
    }
  };
  const handleVariationPrimarySave = (event) => {
    if (hasSelectedItem) {
      handleSaveVariations(event);
      return;
    }
    event.preventDefault();
    if (isPreview) {
      return;
    }
    productFormRef.current?.requestSubmit();
  };

  const handleUnitSubmit = (event) => {
    event.preventDefault();
    if (!unitName.trim()) {
      return;
    }
    setFeedback(null);
    createUnitMutation.mutate({ name: unitName.trim() });
  };

  const handlePricingChange = (itemId, field, value) => {
    setPricingEdits((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [field]: value,
      },
    }));
  };

  const getPricingValue = (item, field) => {
    const edit = pricingEdits[item.id]?.[field];
    if (edit !== undefined) {
      return edit;
    }
    if (field === "purchase") return item.purchasePrice ?? 0;
    if (field === "wholesale") return item.wholesalePrice ?? 0;
    if (field === "retail") return item.retailPrice ?? 0;
    return item.marketPrice ?? 0;
  };

  const handlePricingSave = (item) => {
    updatePricingMutation.mutate({
      itemId: item.id,
      payload: {
        purchase: Number(getPricingValue(item, "purchase") || 0),
        wholesale: Number(getPricingValue(item, "wholesale") || 0),
        retail: Number(getPricingValue(item, "retail") || 0),
        market: Number(getPricingValue(item, "market") || 0),
      },
    });
  };
  const openPriceCellEditor = (event, itemId, field) => {
    event.stopPropagation();
    setActivePriceCell({
      itemId: Number(itemId),
      field,
    });
  };
  const closePriceCellEditor = () => {
    setActivePriceCell(null);
  };
  const commitPriceCellEditor = (item) => {
    handlePricingSave(item);
    setActivePriceCell(null);
  };
  const handleListPricingEnter = (event, item) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePriceCellEditor();
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commitPriceCellEditor(item);
  };

  const handleEnterToNextField = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const tagName = target.tagName.toLowerCase();
    if (tagName === "textarea" || tagName === "button") {
      return;
    }
    event.preventDefault();
    const scope =
      target.closest("form, .table-wrap, .pos-card, .inventory-modal, .module-page") || document;
    const focusables = Array.from(
      scope.querySelectorAll(
        "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])",
      ),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const hidden = element.offsetParent === null && element !== document.activeElement;
      return !hidden && element.tabIndex !== -1;
    });
    const currentIndex = focusables.indexOf(target);
    if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
      const next = focusables[currentIndex + 1];
      if (next instanceof HTMLElement) {
        next.focus();
        if ("select" in next && typeof next.select === "function") {
          next.select();
        }
      }
    }
  };

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
    <section
      className="module-page inventory-number-lock"
      onKeyDown={handleEnterToNextField}
      onWheelCapture={handlePreventNumberWheel}
    >
      <header className="module-header">
        <h3>Inventory & Variations</h3>
        <span className="module-subtitle">Product master, variations, pricing, barcode, units and alerts</span>
      </header>

      {feedback && (
        <div className={feedback.type === "success" ? "alert alert--success" : "alert alert--error"}>
          {feedback.message}
        </div>
      )}

      <ModuleTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === "items" && (
        <div className="pos-shell">
          <div className="pos-card">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              <label className="pos-label pos-item-search" style={{ flex: "1 1 280px", position: "relative" }}>
                Product Search
                <Search size={14} />
                <input
                  type="text"
                  className="pos-input pos-input--search"
                  placeholder="Search by name, barcode..."
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                />
              </label>
            </div>
            {selectedItem && (
              <div className="hint-line">
                Selected: <strong>{selectedItem.name}</strong> - Mode: {formMode}
              </div>
            )}
          </div>

          <article className="pos-card" style={{ marginTop: 20, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div className="pos-section-title" style={{ marginBottom: 0, borderBottom: 0, paddingBottom: 0 }}>
                <Package size={14} />
                <span>Product List</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="pos-sm-btn"
                  onClick={handleImportClick}
                  disabled={importingItems}
                >
                  <Upload size={14} /> {importingItems ? "Importing..." : "Import from Excel"}
                </button>
                <button type="button" className="pos-sm-btn" onClick={handleExportItems}>
                  <Download size={14} /> Export to Excel
                </button>
                <button type="button" className="pos-sm-btn" onClick={handleNewProduct}>
                  <Plus size={14} /> Add New Product
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleImportItems(file);
                    }
                    event.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
              </div>
            </div>
            <div className="table-wrap">
              <table className="inventory-product-list-table">
                <thead>
                  <tr>
                    <th>Item No</th>
                    <th>Barcode</th>
                    <th>Item Name</th>
                    <th>Image</th>
                    <th>Purchase Price</th>
                    <th>Sale Price</th>
                    <th>Wholesale Price</th>
                    <th>Market Price</th>
                    <th>Current Stock</th>
                    <th>Restock Level</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDisplayRows.map((row, index) => {
                    const item = row.item;
                    const isSelected =
                      Number(item?.id) === Number(selectedItemId) ||
                      (row.isVariation && Number(row.parentId) === Number(selectedItemId));
                    const isCellEditing = (field) =>
                      Number(activePriceCell?.itemId) === Number(item?.id) &&
                      activePriceCell?.field === field;
                    const compactInputStyle = {
                      width: 88,
                      minWidth: 88,
                      padding: "6px 8px",
                      fontSize: 13,
                    };
                    return (
                    <tr
                      key={item.id}
                      onClick={() => handleProductRowClick(item)}
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      <td>{formatItemNo(index + 1)}</td>
                      <td>{item.barcode || "-"}</td>
                      <td>
                        {row.isVariation ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "var(--muted)" }}>↳</span>
                            <span>{item.name}</span>
                          </span>
                        ) : (
                          item.name
                        )}
                      </td>
                      <td>
                        {getItemImageUrls(item)[0] ? (
                          <img
                            src={getItemImageUrls(item)[0]}
                            alt={item.name || "Product"}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              objectFit: "cover",
                              border: "1px solid var(--border)",
                            }}
                          />
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>-</span>
                        )}
                      </td>
                      <td>
                        {isCellEditing("purchase") ? (
                          <input
                            type="number"
                            className="pos-input"
                            autoFocus
                            value={getPricingValue(item, "purchase")}
                            onChange={(event) =>
                              handlePricingChange(item.id, "purchase", event.target.value)
                            }
                            onKeyDown={(event) => handleListPricingEnter(event, item)}
                            onBlur={() => commitPriceCellEditor(item)}
                            onClick={(event) => event.stopPropagation()}
                            placeholder="0"
                            style={compactInputStyle}
                          />
                        ) : (
                          <button
                            type="button"
                            className="pos-sm-btn"
                            onClick={(event) => openPriceCellEditor(event, item.id, "purchase")}
                            style={{ padding: "4px 8px", minHeight: 28 }}
                          >
                            {formatCurrency(getPricingValue(item, "purchase"))}
                          </button>
                        )}
                      </td>
                      <td>
                        {isCellEditing("retail") ? (
                          <input
                            type="number"
                            className="pos-input"
                            autoFocus
                            value={getPricingValue(item, "retail")}
                            onChange={(event) =>
                              handlePricingChange(item.id, "retail", event.target.value)
                            }
                            onKeyDown={(event) => handleListPricingEnter(event, item)}
                            onBlur={() => commitPriceCellEditor(item)}
                            onClick={(event) => event.stopPropagation()}
                            placeholder="0"
                            style={compactInputStyle}
                          />
                        ) : (
                          <button
                            type="button"
                            className="pos-sm-btn"
                            onClick={(event) => openPriceCellEditor(event, item.id, "retail")}
                            style={{ padding: "4px 8px", minHeight: 28 }}
                          >
                            {formatCurrency(getPricingValue(item, "retail"))}
                          </button>
                        )}
                      </td>
                      <td>
                        {isCellEditing("wholesale") ? (
                          <input
                            type="number"
                            className="pos-input"
                            autoFocus
                            value={getPricingValue(item, "wholesale")}
                            onChange={(event) =>
                              handlePricingChange(item.id, "wholesale", event.target.value)
                            }
                            onKeyDown={(event) => handleListPricingEnter(event, item)}
                            onBlur={() => commitPriceCellEditor(item)}
                            onClick={(event) => event.stopPropagation()}
                            placeholder="0"
                            style={compactInputStyle}
                          />
                        ) : (
                          <button
                            type="button"
                            className="pos-sm-btn"
                            onClick={(event) => openPriceCellEditor(event, item.id, "wholesale")}
                            style={{ padding: "4px 8px", minHeight: 28 }}
                          >
                            {formatCurrency(getPricingValue(item, "wholesale"))}
                          </button>
                        )}
                      </td>
                      <td>
                        {isCellEditing("market") ? (
                          <input
                            type="number"
                            className="pos-input"
                            autoFocus
                            value={getPricingValue(item, "market")}
                            onChange={(event) =>
                              handlePricingChange(item.id, "market", event.target.value)
                            }
                            onKeyDown={(event) => handleListPricingEnter(event, item)}
                            onBlur={() => commitPriceCellEditor(item)}
                            onClick={(event) => event.stopPropagation()}
                            placeholder="0"
                            style={compactInputStyle}
                          />
                        ) : (
                          <button
                            type="button"
                            className="pos-sm-btn"
                            onClick={(event) => openPriceCellEditor(event, item.id, "market")}
                            style={{ padding: "4px 8px", minHeight: 28 }}
                          >
                            {formatCurrency(getPricingValue(item, "market"))}
                          </button>
                        )}
                      </td>
                      <td>{formatNumber(item.currentStock)}</td>
                      <td>{formatNumber(item.lowStockThreshold)}</td>
                      <td>{item.category?.name || "-"}</td>
                      <td>{item.unit?.name || item.unit || "-"}</td>
                      <td>
                        <span
                          className={
                            item.status === "Active"
                              ? "status-pill status-pill--active"
                              : "status-pill status-pill--inactive"
                          }
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }} onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="pos-edit-btn"
                            onClick={(event) => handleEditProductFromList(event, item)}
                            aria-label="Edit product"
                          >
                            <Edit size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {groupedDisplayRows.length === 0 && (
                    <tr>
                      <td colSpan="14">No products found. Use "Add New Product" to create one.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {showItemForm && (
            <div className="inventory-modal-backdrop" onClick={handleCloseProduct}>
              <div className="inventory-modal inventory-product-modal" onClick={(event) => event.stopPropagation()}>
                <div className="inventory-modal__header">
                  <div>
                    <h4>{selectedItem ? selectedItem.name : "Add New Product"}</h4>
                    <p className="inventory-modal__sub">
                      {selectedItem ? `Mode: ${formMode}` : "Create a new product entry."}
                    </p>
                  </div>
                  <div className="inventory-modal__actions">
                    {selectedItem && (
                      <>
                        <button type="button" className="pos-sm-btn" onClick={() => setFormMode("edit")}>
                          <Edit size={14} /> Edit
                        </button>
                        <button type="button" className="pos-sm-btn" onClick={() => setFormMode("preview")}>
                          <Eye size={14} /> Preview
                        </button>
                      </>
                    )}
                    <button type="button" className="pos-sm-btn" onClick={handleCloseProduct}>
                      <X size={14} /> Close
                    </button>
                  </div>
                </div>
                <div className="inventory-modal__body">
                  <form
                    ref={productFormRef}
                    className="pos-card inventory-product-form"
                    onSubmit={handleItemSubmit}
                    style={{ width: "100%" }}
                  >
            <div className="pos-section-title">
              <Package size={16} />
              <span>Product Master Form</span>
            </div>
            <fieldset disabled={isPreview} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="pos-layout" style={{ alignItems: "start" }}>
                {/* Left Side: Fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="pos-grid-2">
                    <label className="pos-label">
                      Item Form #
                      <input
                        className="pos-input"
                        name="itemFormNo"
                        value={itemForm.itemFormNo}
                        readOnly
                        placeholder="Auto generated"
                      />
                    </label>
                    <label className="pos-label">
                      Store Name
                      <input
                        list="store-list"
                        className="pos-input"
                        name="storeName"
                        value={itemForm.storeName}
                        onChange={handleItemFormChange}
                        onBlur={() =>
                          handleNormalizedOptionBlur("storeName", storeOptions, setCustomStores)
                        }
                        placeholder="Type or select..."
                      />
                      <datalist id="store-list">
                        {storeOptions.map((store) => (
                          <option key={store} value={store} />
                        ))}
                      </datalist>
                    </label>
                  </div>

                <div className="pos-grid-2">
                  <label className="pos-label">
                    Item Name
                    <input className="pos-input" name="name" value={itemForm.name} onChange={handleItemFormChange} required placeholder="e.g. Silk Bedsheet" />
                  </label>
                </div>

                <div className="pos-grid-2">
                  <label className="pos-label">
                    Department
                    <input
                      list="department-list"
                      className="pos-input"
                      name="department"
                      value={itemForm.department}
                      onChange={handleItemFormChange}
                      onBlur={() =>
                        handleNormalizedOptionBlur("department", departmentOptions, setCustomDepartments)
                      }
                      placeholder="Type or select..."
                    />
                    <datalist id="department-list">
                      {departmentOptions.map((department) => (
                        <option key={department} value={department} />
                      ))}
                    </datalist>
                  </label>
                  <label className="pos-label">
                    Category
                    <input
                      list="cat-list"
                      className="pos-input"
                      name="categoryName"
                      value={itemForm.categoryName}
                      onChange={handleItemFormChange}
                      onBlur={() => handleNormalizedOptionBlur("categoryName", categoryOptions)}
                      placeholder="Type or select..."
                    />
                    <datalist id="cat-list">
                      {categoryOptions.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <div className="pos-grid-2">
                  <label className="pos-label">
                    Unit
                    <input
                      list="unit-list"
                      className="pos-input"
                      name="unit"
                      value={itemForm.unit}
                      onChange={handleItemFormChange}
                      onBlur={() =>
                        handleNormalizedOptionBlur("unit", unitOptions, setCustomUnits)
                      }
                      placeholder="Type or select..."
                    />
                    <datalist id="unit-list">
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <div className="pos-grid-2" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                  <label className="pos-label">
                    Pur. Price
                    <input type="number" className="pos-input" name="purPrice" value={itemForm.purPrice} onChange={handleItemFormChange} placeholder="0" />
                  </label>
                  <label className="pos-label">
                    Wholesale
                    <input type="number" className="pos-input" name="wholesalePrice" value={itemForm.wholesalePrice} onChange={handleItemFormChange} placeholder="0" />
                  </label>
                  <label className="pos-label">
                    Sale Price
                    <input type="number" className="pos-input" name="salePrice" value={itemForm.salePrice} onChange={handleItemFormChange} placeholder="0" />
                  </label>
                  <label className="pos-label">
                    Mrkt Price
                    <input type="number" className="pos-input" name="mrktPrice" value={itemForm.mrktPrice} onChange={handleItemFormChange} placeholder="0" />
                  </label>
                </div>

                <div className="pos-grid-2">
                  <label className="pos-label">
                    Opening Stock
                    <input type="number" className="pos-input" name="openingStock" value={itemForm.openingStock} onChange={handleItemFormChange} placeholder="0" />
                  </label>
                  <label className="pos-label">
                    Restock Level (Min)
                    <input type="number" className="pos-input" name="lowStockThreshold" value={itemForm.lowStockThreshold} onChange={handleItemFormChange} placeholder="5" />
                  </label>
                </div>

                <div className="pos-grid-2">
                  <label className="pos-label">
                    Commission (%)
                    <input
                      type="number"
                      className="pos-input"
                      name="commissionPercent"
                      value={itemForm.commissionPercent}
                      onChange={handleItemFormChange}
                      placeholder="0"
                    />
                  </label>
                  <label className="pos-label">
                    Commission Amount (Per Unit)
                    <input
                      type="number"
                      className="pos-input"
                      name="commissionAmount"
                      value={itemForm.commissionAmount}
                      onChange={handleItemFormChange}
                      placeholder="0"
                    />
                  </label>
                </div>
                <div className="pos-grid-2">
                  <label className="pos-label">
                    Tax (%)
                    <input type="number" className="pos-input" name="tax" value={itemForm.tax} onChange={handleItemFormChange} placeholder="0" />
                  </label>
                </div>

                <label className="pos-label">
                  Item Description (For Online)
                  <textarea className="pos-input" rows={3} name="itemDescription" value={itemForm.itemDescription} onChange={handleItemFormChange} placeholder="Write product description for online store..." />
                </label>
                </div>

                {/* Right Side: Image Upload & Barcode generated */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <label className="pos-label">Upload Pictures</label>
                  <div
                    style={{
                      border: "2px dashed var(--border)",
                      borderRadius: 12,
                      height: "220px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      background: "var(--surface-2)",
                      overflow: "hidden",
                      padding: 10,
                      width: "100%",
                    }}
                  >
                    {itemForm.images.length > 0 ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 8,
                          width: "100%",
                          height: "100%",
                        }}
                      >
                        {itemForm.images.slice(0, 4).map((image) => (
                          <div
                            key={image.id}
                            style={{
                              borderRadius: 10,
                              overflow: "hidden",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <img
                              src={image.preview}
                              alt={image.file?.name || "Uploaded"}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </div>
                        ))}
                        {itemForm.images.length > 4 && (
                          <div
                            style={{
                              borderRadius: 10,
                              border: "1px dashed var(--border)",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 13,
                              color: "var(--muted)",
                            }}
                          >
                            +{itemForm.images.length - 4}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", color: "var(--muted)" }}>
                        <ImageIcon size={48} style={{ opacity: 0.5, marginBottom: 10 }} />
                        <p style={{ fontSize: 13 }}>Click or drag images here</p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0,
                        cursor: "pointer",
                      }}
                    />
                  </div>
                  {itemForm.images.length > 0 && (
                    <div className="gallery-grid" style={{ marginTop: 8 }}>
                      {itemForm.images.map((image) => (
                        <div
                          key={image.id}
                          style={{
                            position: "relative",
                            borderRadius: 10,
                            overflow: "hidden",
                            border: "1px solid var(--border)",
                            height: 90,
                            background: "var(--surface-2)",
                          }}
                        >
                          <img
                            src={image.preview}
                            alt={image.file?.name || "Uploaded"}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <button
                            type="button"
                            className="pos-remove-btn"
                            onClick={() => handleImageRemove(image.id)}
                            style={{ position: "absolute", top: 6, right: 6 }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pos-grid-2" style={{ marginTop: 16, gridTemplateColumns: "1fr" }}>
                    <label className="pos-label">
                      Barcode Type
                      <select className="pos-input" name="barcodeType" value={itemForm.barcodeType} onChange={handleItemFormChange}>
                        <option value="auto">Auto-generated</option>
                        <option value="physical">Physical Scan</option>
                      </select>
                    </label>
                    <label className="pos-label">
                      Barcode String
                      <input
                        className="pos-input"
                        name="barcode"
                        value={itemForm.barcode}
                        onChange={handleItemFormChange}
                        readOnly={String(itemForm.barcodeType || "").toLowerCase() === "auto"}
                        placeholder={
                          String(itemForm.barcodeType || "").toLowerCase() === "auto"
                            ? "Auto 4-digit (1001+)"
                            : "Enter barcode"
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            </fieldset>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <button
                type="submit"
                className="pos-sm-btn"
                disabled={isPreview || createItemMutation.isPending || updateItemMutation.isPending}
                style={{ background: "var(--success)", color: "#fff", borderColor: "var(--success)" }}
              >
                <Save size={14} />{" "}
                {createItemMutation.isPending || updateItemMutation.isPending
                  ? "Saving..."
                  : isEditing
                    ? "Update Product"
                    : "Save Product"}
              </button>
              <label
                className="pos-sm-btn"
                style={{
                  cursor: isPreview ? "not-allowed" : "pointer",
                  display: "flex",
                  gap: 6,
                  background: itemForm.status === "Active" ? "var(--accent)" : "var(--surface-2)",
                  color: itemForm.status === "Active" ? "#fff" : "var(--ink)",
                  opacity: isPreview ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  name="status"
                  checked={itemForm.status === "Active"}
                  onChange={handleItemFormChange}
                  disabled={isPreview}
                  style={{ display: "none" }}
                />
                <CheckCircle size={14} /> {itemForm.status}
              </label>
            </div>
          </form>

          <form className="pos-card inventory-variation-form" onSubmit={handleSaveVariations} style={{ width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div className="pos-section-title" style={{ marginBottom: 0, borderBottom: 0, paddingBottom: 0 }}>
                <Package size={16} />
                <span>Variations</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="pos-sm-btn"
                  onClick={handleAddVariationRow}
                  disabled={isPreview}
                >
                  <Plus size={14} /> Add Row
                </button>
                <button
                  type="button"
                  className="pos-sm-btn"
                  onClick={handleVariationPrimarySave}
                  disabled={
                    savingVariations ||
                    createItemMutation.isPending ||
                    updateItemMutation.isPending ||
                    isPreview
                  }
                  style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
                >
                  <Save size={14} />{" "}
                  {savingVariations || createItemMutation.isPending || updateItemMutation.isPending
                    ? "Saving..."
                    : hasSelectedItem
                      ? "Save Variations"
                      : "Save Product"}
                </button>
              </div>
            </div>
            {!hasSelectedItem && !isEditing && (
              <div className="hint-line">
                You can add variation rows now. They will save automatically with product save.
              </div>
            )}
            {!hasSelectedItem && isEditing && (
              <div className="hint-line">Select a product from the list to add variations.</div>
            )}
            {hasSelectedItem && selectedItem && (
              <div className="hint-line">
                Linked product: <strong>{selectedItem.name}</strong>
              </div>
            )}
            {hasSelectedItem && selectedSavedVariations.length > 0 && (
              <div className="hint-line">
                Saved variations:{" "}
                <strong>
                  {selectedSavedVariations.map((entry) => entry.name).filter(Boolean).join(" | ")}
                </strong>
              </div>
            )}
            <fieldset disabled={!canEditVariationDraft} style={{ border: 0, padding: 0, marginTop: 12 }}>
              <div className="table-wrap">
                <table>
	                  <thead>
	                    <tr>
	                      <th>Size</th>
	                      <th>Color</th>
	                      <th>Image</th>
	                      <th>Barcode Type</th>
                      <th>Barcode</th>
                      <th>Purchase</th>
                      <th>Wholesale</th>
                      <th>Retail</th>
                      <th>Market</th>
                      <th>Commission %</th>
                      <th>Commission Amount</th>
                      <th>Opening Stock</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {variationRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            className="pos-input variation-size-input"
                            data-variation-size-input={row.id}
                            value={row.size}
                            onChange={(event) =>
                              handleVariationRowChange(row.id, "size", event.target.value)
	                            }
	                            placeholder="Size"
	                            style={getAdaptiveFieldStyle(row.size, "Size", 10, 22)}
	                          />
	                        </td>
                        <td>
	                          <input
	                            className="pos-input variation-color-input"
	                            value={row.color}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "color", event.target.value)
	                            }
	                            placeholder="Color"
	                            style={getAdaptiveFieldStyle(row.color, "Color", 10, 22)}
	                          />
	                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label
                              className="pos-sm-btn"
                              style={{ padding: "4px 8px", fontSize: 11, gap: 4, width: "fit-content" }}
                            >
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(event) => {
                                  handleVariationImageChange(row.id, event.target.files);
                                  event.target.value = "";
                                }}
                                style={{ display: "none" }}
                              />
                            </label>
                            {row.images.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {row.images.map((image) => (
                                  <div
                                    key={image.id}
                                    style={{
                                      position: "relative",
                                      width: 36,
                                      height: 36,
                                      borderRadius: 6,
                                      overflow: "hidden",
                                      border: "1px solid var(--border)",
                                    }}
                                  >
                                    <img
                                      src={image.preview}
                                      alt="Variation"
                                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    />
                                    <button
                                      type="button"
                                      className="pos-remove-btn"
                                      onClick={() => handleRemoveVariationImage(row.id, image.id)}
                                      style={{ position: "absolute", top: -6, right: -6 }}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
	                          <select
	                            className="pos-input"
	                            value={row.barcodeType}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "barcodeType", event.target.value)
	                            }
	                            style={getAdaptiveFieldStyle(
	                              row.barcodeType === "physical" ? "Physical" : "Auto",
	                              "Physical",
	                              10,
	                              12,
	                            )}
	                          >
                            <option value="auto">Auto</option>
                            <option value="physical">Physical</option>
                          </select>
                        </td>
                        <td>
	                          <input
	                            className="pos-input"
	                            value={row.barcode}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "barcode", event.target.value)
	                            }
	                            placeholder="Barcode"
	                            style={getAdaptiveFieldStyle(row.barcode, "Barcode", 10, 20)}
	                          />
	                        </td>
                        <td>
                          <input
                            type="number"
                            className="pos-input"
	                            value={row.purchasePrice}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "purchasePrice", event.target.value)
	                            }
	                            placeholder="0"
	                            style={getAdaptiveFieldStyle(row.purchasePrice, "0", 7, 12)}
	                          />
	                        </td>
                        <td>
                          <input
                            type="number"
                            className="pos-input"
	                            value={row.wholesalePrice}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "wholesalePrice", event.target.value)
	                            }
	                            placeholder="0"
	                            style={getAdaptiveFieldStyle(row.wholesalePrice, "0", 7, 12)}
	                          />
	                        </td>
                        <td>
                          <input
                            type="number"
                            className="pos-input"
	                            value={row.retailPrice}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "retailPrice", event.target.value)
	                            }
	                            placeholder="0"
	                            style={getAdaptiveFieldStyle(row.retailPrice, "0", 7, 12)}
	                          />
	                        </td>
                        <td>
                          <input
                            type="number"
                            className="pos-input"
	                            value={row.marketPrice}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "marketPrice", event.target.value)
	                            }
	                            placeholder="0"
	                            style={getAdaptiveFieldStyle(row.marketPrice, "0", 7, 12)}
	                          />
	                        </td>
                        <td>
                          <input
                            type="number"
                            className="pos-input"
	                            value={row.commissionPercent}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "commissionPercent", event.target.value)
	                            }
	                            placeholder="%"
	                            style={getAdaptiveFieldStyle(row.commissionPercent, "%", 7, 10)}
	                          />
	                        </td>
                        <td>
                          <input
                            type="number"
                            className="pos-input"
	                            value={row.commissionAmount}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "commissionAmount", event.target.value)
	                            }
	                            placeholder="Amount"
	                            style={getAdaptiveFieldStyle(row.commissionAmount, "Amount", 10, 14)}
	                          />
	                        </td>
                        <td>
                          <input
                            type="number"
                            className="pos-input"
	                            value={row.openingStock}
	                            onChange={(event) =>
	                              handleVariationRowChange(row.id, "openingStock", event.target.value)
	                            }
	                            onKeyDown={handleVariationLastFieldEnter}
	                            placeholder="0"
	                            style={getAdaptiveFieldStyle(row.openingStock, "0", 7, 12)}
	                          />
	                        </td>
                        <td>
                          <button
                            type="button"
                            className="pos-remove-btn"
                            onClick={() => handleRemoveVariationRow(row.id)}
                            aria-label="Remove row"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
	                    {variationRows.length === 0 && (
	                      <tr>
	                        <td colSpan="13">Click "Add Row" to start adding variations.</td>
	                      </tr>
	                    )}
                  </tbody>
                </table>
              </div>
            </fieldset>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "pricing" && (
        <article className="module-card">
          <h4>Pricing Matrix</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Purchase</th>
                  <th>Wholesale</th>
                  <th>Retail</th>
                  <th>Market</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>
                      <input
                        type="number"
                        value={getPricingValue(item, "purchase")}
                        onChange={(event) => handlePricingChange(item.id, "purchase", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={getPricingValue(item, "wholesale")}
                        onChange={(event) => handlePricingChange(item.id, "wholesale", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={getPricingValue(item, "retail")}
                        onChange={(event) => handlePricingChange(item.id, "retail", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={getPricingValue(item, "market")}
                        onChange={(event) => handlePricingChange(item.id, "market", event.target.value)}
                      />
                    </td>
                    <td>
                      <button type="button" className="small-btn" onClick={() => handlePricingSave(item)}>
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan="6">No products found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="hint-line">4-tier pricing supported: Purchase, Wholesale, Retail, Market.</div>
        </article>
      )}

      {activeTab === "alerts" && (
        <div className="summary-grid two-wide">
          <article className="module-card">
            <h4>Stock Alert Rule</h4>
            <div className="kpi-grid">
              <div>
                <span>Threshold</span>
                <strong>{formatNumber(5)} units</strong>
              </div>
              <div>
                <span>Alert Type</span>
                <strong>Automatic Notification</strong>
              </div>
            </div>
          </article>
          <article className="module-card">
            <h4>Low Stock Alerts</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Stock</th>
                    <th>Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {stockAlerts.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{formatNumber(row.currentStock)}</td>
                      <td>{formatNumber(row.lowStockThreshold)}</td>
                    </tr>
                  ))}
                  {stockAlerts.length === 0 && (
                    <tr>
                      <td colSpan="3">No low stock alerts.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}

      {activeTab === "barcode" && (
        <div className="summary-grid two-wide">
          <article className="module-card">
            <h4>Barcode Handler</h4>
            <p className="module-subtitle">Auto-generated or physical barcode support per product.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Barcode Type</th>
                    <th>Barcode</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.barcodeType || "-"}</td>
                      <td>{item.barcode || "-"}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan="3">No products found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}

      {activeTab === "units" && (
        <article className="module-card">
          <h4>Unit Management</h4>
          <div className="chip-row">
            {units.map((unit) => (
              <span key={unit} className="chip">
                {unit}
              </span>
            ))}
          </div>
          <form className="form-card" onSubmit={handleUnitSubmit}>
            <label>
              Add New Unit
              <input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="e.g. Packs" />
            </label>
            <button type="submit" className="small-btn" disabled={createUnitMutation.isPending}>
              {createUnitMutation.isPending ? "Saving..." : "Add Unit"}
            </button>
          </form>
        </article>
      )}

      {activeTab === "gallery" && (
        <article className="module-card">
          <h4>Product Media Gallery</h4>
          <div className="gallery-grid">
            {["Front", "Back", "Label", "Packaging", "Size Tag", "Pattern"].map((tile) => (
              <div key={tile} className="gallery-tile">
                {tile}
              </div>
            ))}
          </div>
          <div className="hint-line">Unlimited image uploads per product.</div>
        </article>
      )}
    </section>
  );
}

export default InventoryPage;
