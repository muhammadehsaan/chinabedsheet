import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import ModuleTabs from "../components/ModuleTabs";
import { inventoryApi } from "../api/modules";
import { formatCurrency, formatNumber } from "../utils/format";

const tabs = [
  { value: "recipe", label: "BOM" },
  { value: "costing", label: "Production Costing" },
  { value: "overview", label: "Production Overview" },
];

const createBomId = () => `bom-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createBomLine = () => ({
  id: createBomId(),
  material: "",
  materialId: null,
  qty: "",
  atQty: "1",
  unit: "",
  cost: "",
  notes: "",
});

const createExpenseLine = (expense = "", amount = "", remark = "") => ({
  id: createBomId(),
  expense: String(expense || ""),
  amount: amount === 0 ? "0" : String(amount || ""),
  remark: String(remark || ""),
});

const createEmptyCostSummary = () => ({
  materialCost: 0,
  laborCost: 0,
  overhead: 0,
  total: 0,
  totalPerUnit: 0,
  productionQty: 0,
  batchQty: 1,
  batchFactor: 0,
  lines: [],
});

const normalizeText = (value) => String(value || "").trim().toLowerCase();
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

const findInventoryItemByName = (items, name) => {
  const query = normalizeText(name);
  if (!query) {
    return null;
  }
  return items.find((item) => normalizeText(item.name) === query) || null;
};

const getInventoryUnit = (item) => item?.unit?.name || item?.unit || "";

const getInventoryPurchasePrice = (item) => Number(item?.purchasePrice ?? 0);

const mapStoredLines = (lines) =>
  lines.map((line) => ({
    id: createBomId(),
    material: line.material || "",
    materialId: line.materialId ?? null,
    qty: line.qty ?? "",
    atQty: line.atQty ?? "1",
    unit: line.unit || "",
    cost: line.cost ?? "",
    notes: line.notes || "",
  }));

const mapStoredExpenseLines = (lines) =>
  lines.map((line) =>
    createExpenseLine(
      line.expense ?? line.name ?? "",
      line.amount ?? line.value ?? "",
      line.remark ?? line.note ?? "",
    ),
  );

const normalizeSpaces = (value) => String(value || "").trim().replace(/\s+/g, " ");

const dedupeExpenseNames = (names) => {
  const seen = new Set();
  const unique = [];
  names.forEach((name) => {
    const normalized = normalizeSpaces(name);
    if (!normalized) {
      return;
    }
    const key = normalizeText(normalized);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(normalized);
  });
  return unique;
};

const getExpenseNamesFromBoms = (bomList) =>
  dedupeExpenseNames(
    bomList.flatMap((bom) =>
      (Array.isArray(bom.expenseLines) ? bom.expenseLines : []).map(
        (line) => line.expense ?? line.name ?? "",
      ),
    ),
  );

const readStoredExpenseNames = () => {
  const stored = localStorage.getItem("production.expenseNames");
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? dedupeExpenseNames(parsed) : [];
  } catch {
    return [];
  }
};

const hasInvalidExpenseRows = (rows) =>
  rows.some((row) => {
    const expenseName = normalizeSpaces(row.expense);
    const remarkValue = normalizeSpaces(row.remark);
    const amountValue = Number(row.amount || 0);
    const hasAmount = Number.isFinite(amountValue) && amountValue !== 0;
    return !expenseName && (hasAmount || Boolean(remarkValue));
  });

const normalizeExpenseRowsForSave = (rows) => {
  const merged = new Map();
  rows.forEach((row) => {
    const expenseName = normalizeSpaces(row.expense);
    const remarkValue = normalizeSpaces(row.remark);
    const amountValue = Number(row.amount || 0);
    const hasAmount = Number.isFinite(amountValue) && amountValue !== 0;
    if (!expenseName && !hasAmount && !remarkValue) {
      return;
    }
    if (!expenseName) {
      return;
    }
    const key = normalizeText(expenseName);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        expense: expenseName,
        amount: Number.isFinite(amountValue) ? amountValue : 0,
        remark: remarkValue,
      });
      return;
    }
    const existingRemarkKey = normalizeText(current.remark);
    const nextRemarkKey = normalizeText(remarkValue);
    const mergedRemark =
      remarkValue && existingRemarkKey !== nextRemarkKey
        ? [current.remark, remarkValue].filter(Boolean).join(" | ")
        : current.remark;
    merged.set(key, {
      ...current,
      amount: Number(current.amount || 0) + (Number.isFinite(amountValue) ? amountValue : 0),
      remark: mergedRemark,
    });
  });
  return Array.from(merged.values());
};

const buildExpenseRowsFromPayload = (payload) => {
  if (Array.isArray(payload?.expenseLines) && payload.expenseLines.length > 0) {
    return mapStoredExpenseLines(payload.expenseLines);
  }
  const fallbackAmount = payload?.expense ?? payload?.laborCost ?? "";
  const fallbackRemark = payload?.remark || "";
  if (String(fallbackAmount || "").trim() || String(fallbackRemark || "").trim()) {
    return [createExpenseLine("General Expense", fallbackAmount, fallbackRemark)];
  }
  return [createExpenseLine()];
};

const sumExpenseRows = (rows) =>
  rows.reduce((sum, row) => sum + Number(row.amount || row.value || 0), 0);

const getBomExpenseValue = (bom) => {
  if (Array.isArray(bom?.expenseLines) && bom.expenseLines.length > 0) {
    return sumExpenseRows(bom.expenseLines);
  }
  return Number(bom?.expense ?? bom?.laborCost ?? 0);
};
const getBomMaterialSubtotal = (bom) =>
  (Array.isArray(bom?.lines) ? bom.lines : []).reduce(
    (sum, line) => sum + Number(line?.qty || 0) * Number(line?.cost || 0),
    0,
  );

const readStoredBoms = () => {
  const stored = localStorage.getItem("production.boms");
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

function ProductionPage() {
  const [activeTab, setActiveTab] = useState("recipe");
  const [bomLines, setBomLines] = useState([createBomLine()]);
  const [bomName, setBomName] = useState("");
  const [bomProduct, setBomProduct] = useState("");
  const [bomQuantity, setBomQuantity] = useState("1");
  const [bomUnit, setBomUnit] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [bomRemark, setBomRemark] = useState("");
  const [bomExpenseRows, setBomExpenseRows] = useState([createExpenseLine()]);
  const [expenseNameLibrary, setExpenseNameLibrary] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [boms, setBoms] = useState([]);
  const [bomSearch, setBomSearch] = useState("");
  const [editingBom, setEditingBom] = useState(null);
  const [editName, setEditName] = useState("");
  const [editProduct, setEditProduct] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editUnit, setEditUnit] = useState("");
  const [editLaborCost, setEditLaborCost] = useState("");
  const [editRemark, setEditRemark] = useState("");
  const [editExpenseRows, setEditExpenseRows] = useState([createExpenseLine()]);
  const [editLines, setEditLines] = useState([createBomLine()]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isBomFormOpen, setIsBomFormOpen] = useState(false);
  const [costingProduct, setCostingProduct] = useState("");
  const [costingInputs, setCostingInputs] = useState({
    productionQty: "1",
  });
  const [costSummary, setCostSummary] = useState(createEmptyCostSummary);
  const [pendingProduction, setPendingProduction] = useState(null);
  const [costHistory, setCostHistory] = useState([]);
  const [editingProduction, setEditingProduction] = useState(null);
  const [productionEditInputs, setProductionEditInputs] = useState({
    quantity: "1",
  });
  const [productionEditStatus, setProductionEditStatus] = useState("processing");
  const [isProductionEditOpen, setIsProductionEditOpen] = useState(false);
  const [isCostingModalOpen, setIsCostingModalOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const itemsQuery = useQuery({
    queryKey: ["inventory", "items"],
    queryFn: inventoryApi.listItems,
  });
  const items = itemsQuery.data || [];
  const inventoryItems = useMemo(() => items.slice(), [items]);
  const matchedBomProductItem = useMemo(
    () => findInventoryItemByName(inventoryItems, bomProduct),
    [inventoryItems, bomProduct],
  );
  const matchedEditProductItem = useMemo(
    () => findInventoryItemByName(inventoryItems, editProduct),
    [inventoryItems, editProduct],
  );
  const expenseNameOptions = useMemo(
    () => dedupeExpenseNames([...expenseNameLibrary, ...getExpenseNamesFromBoms(boms)]),
    [expenseNameLibrary, boms],
  );

  const applyInventoryDefaultsToLine = (line, materialValue) => {
    const matchedItem = findInventoryItemByName(inventoryItems, materialValue);
    if (!matchedItem) {
      return {
        ...line,
        material: materialValue,
        materialId: null,
      };
    }
    const fallbackUnit = getInventoryUnit(matchedItem);
    const fallbackCost = String(getInventoryPurchasePrice(matchedItem));
    return {
      ...line,
      material: materialValue,
      materialId: matchedItem.id,
      unit: String(line.unit || "").trim() ? line.unit : fallbackUnit,
      cost: String(line.cost || "").trim() ? line.cost : fallbackCost,
    };
  };

  const getLineSubtotal = (line) => Number(line.qty || 0) * Number(line.cost || 0);

  const handleBomProductChange = (value) => {
    setBomProduct(value);
    const matchedItem = findInventoryItemByName(inventoryItems, value);
    if (!matchedItem) {
      return;
    }
    setBomUnit(getInventoryUnit(matchedItem));
    setBomName((prev) => (prev.trim() ? prev : `${matchedItem.name} BOM`));
  };

  const handleEditProductChange = (value) => {
    setEditProduct(value);
    const matchedItem = findInventoryItemByName(inventoryItems, value);
    if (!matchedItem) {
      return;
    }
    setEditUnit(getInventoryUnit(matchedItem));
    setEditName((prev) => (prev.trim() ? prev : `${matchedItem.name} BOM`));
  };

  const handleAddBomLine = () => {
    setBomLines((prev) => [...prev, createBomLine()]);
  };

  const handleBomExpenseRowChange = (rowId, field, value) => {
    setBomExpenseRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
  };

  const handleAddBomExpenseRow = () => {
    setBomExpenseRows((prev) => [...prev, createExpenseLine()]);
  };

  const handleRemoveBomExpenseRow = (rowId) => {
    setBomExpenseRows((prev) => {
      const filtered = prev.filter((row) => row.id !== rowId);
      return filtered.length > 0 ? filtered : [createExpenseLine()];
    });
  };

  const handleEditExpenseRowChange = (rowId, field, value) => {
    setEditExpenseRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
  };

  const handleAddEditExpenseRow = () => {
    setEditExpenseRows((prev) => [...prev, createExpenseLine()]);
  };

  const handleRemoveEditExpenseRow = (rowId) => {
    setEditExpenseRows((prev) => {
      const filtered = prev.filter((row) => row.id !== rowId);
      return filtered.length > 0 ? filtered : [createExpenseLine()];
    });
  };

  const resetBomForm = () => {
    setBomName("");
    setBomProduct("");
    setBomQuantity("1");
    setBomUnit("");
    setLaborCost("");
    setBomRemark("");
    setBomExpenseRows([createExpenseLine()]);
    setBomLines([createBomLine()]);
  };

  const handleOpenBomForm = () => {
    resetBomForm();
    setIsBomFormOpen(true);
  };

  const handleCloseBomForm = () => {
    setIsBomFormOpen(false);
    resetBomForm();
  };

  const handleBomLineChange = (lineId, field, value) => {
    if (field === "material") {
      setBomLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? applyInventoryDefaultsToLine(line, value) : line,
        ),
      );
      return;
    }
    setBomLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, [field]: value } : line)),
    );
  };
  const handleSaveBom = () => {
    setFeedback(null);
    const productName = bomProduct.trim();
    const recipeName = bomName.trim() || productName;
    if (!productName) {
      setFeedback({ type: "error", message: "Item to produce is required to save BOM." });
      return;
    }
    const cleanedLines = bomLines
      .filter((line) =>
        [line.material, line.qty, line.atQty, line.unit, line.cost, line.notes].some(
          (value) => String(value || "").trim() !== "",
        ),
      )
      .map((line) => ({
        material: line.material.trim(),
        materialId: line.materialId ?? null,
        qty: line.qty,
        atQty: line.atQty,
        unit: line.unit.trim(),
        cost: line.cost,
        notes: line.notes.trim(),
      }));
    if (cleanedLines.length === 0) {
      setFeedback({ type: "error", message: "Add at least one material line." });
      return;
    }
    if (cleanedLines.some((line) => !line.material)) {
      setFeedback({ type: "error", message: "Each BOM line must include material name." });
      return;
    }
    if (hasInvalidExpenseRows(bomExpenseRows)) {
      setFeedback({ type: "error", message: "Enter expense name for every expense amount/remark." });
      return;
    }
    const normalizedExpenseRows = normalizeExpenseRowsForSave(bomExpenseRows);
    const totalExpense = sumExpenseRows(normalizedExpenseRows);
    const mergedRemark = normalizedExpenseRows
      .map((row) => normalizeSpaces(row.remark))
      .filter(Boolean)
      .join(" | ");
    const existingIndex = boms.findIndex(
      (bom) => bom.product?.trim().toLowerCase() === productName.toLowerCase(),
    );
    const payload = {
      id: existingIndex >= 0 ? boms[existingIndex].id : createBomId(),
      name: recipeName,
      product: productName,
      quantityPerBatch: Number(bomQuantity || 1),
      unit: bomUnit.trim(),
      expense: totalExpense,
      laborCost: totalExpense,
      expenseLines: normalizedExpenseRows,
      remark: mergedRemark,
      lines: cleanedLines,
      savedAt: new Date().toISOString(),
    };
    const nextBoms =
      existingIndex >= 0
        ? boms.map((bom, index) => (index === existingIndex ? payload : bom))
        : [...boms, payload];
    localStorage.setItem("production.boms", JSON.stringify(nextBoms));
    localStorage.setItem("production.bom", JSON.stringify(payload));
    const nextExpenseNames = dedupeExpenseNames([
      ...expenseNameLibrary,
      ...getExpenseNamesFromBoms(nextBoms),
      ...normalizedExpenseRows.map((row) => row.expense),
    ]);
    setExpenseNameLibrary(nextExpenseNames);
    localStorage.setItem("production.expenseNames", JSON.stringify(nextExpenseNames));
    setBoms(nextBoms);
    setLaborCost(totalExpense ? String(totalExpense) : "");
    setBomRemark(mergedRemark);
    setFeedback({ type: "success", message: "BOM saved successfully." });
    setActiveTab("recipe");
    handleCloseBomForm();
  };

  useEffect(() => {
    const storedBoms = readStoredBoms();
    setBoms(storedBoms);
    const storedExpenseNames = readStoredExpenseNames();
    const mergedExpenseNames = dedupeExpenseNames([
      ...storedExpenseNames,
      ...getExpenseNamesFromBoms(storedBoms),
    ]);
    setExpenseNameLibrary(mergedExpenseNames);
    localStorage.setItem("production.expenseNames", JSON.stringify(mergedExpenseNames));
    const saved = localStorage.getItem("production.bom");
    let fallbackPayload = null;
    if (saved) {
      try {
        fallbackPayload = JSON.parse(saved);
      } catch {
        localStorage.removeItem("production.bom");
      }
    }
    const payload = storedBoms[storedBoms.length - 1] || fallbackPayload;
    if (!payload) {
      return;
    }
    if (payload?.product) {
      setBomProduct(payload.product);
      setBomName(payload.name || payload.product);
    }
    if (payload?.quantityPerBatch !== undefined) {
      setBomQuantity(String(payload.quantityPerBatch));
    }
    if (payload?.unit !== undefined) {
      setBomUnit(String(payload.unit || ""));
    }
    if (payload?.expense !== undefined || payload?.laborCost !== undefined) {
      setLaborCost(String(payload.expense ?? payload.laborCost ?? ""));
    }
    if (payload?.remark !== undefined) {
      setBomRemark(String(payload.remark || ""));
    }
    setBomExpenseRows(buildExpenseRowsFromPayload(payload));
    if (Array.isArray(payload?.lines) && payload.lines.length > 0) {
      setBomLines(mapStoredLines(payload.lines));
    }
  }, []);

  useEffect(() => {
    const storedHistory = localStorage.getItem("production.costingHistory");
    if (!storedHistory) {
      return;
    }
    try {
      const parsed = JSON.parse(storedHistory);
      if (Array.isArray(parsed)) {
        setCostHistory(parsed);
      }
    } catch {
      localStorage.removeItem("production.costingHistory");
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const persistCostHistory = (updater) => {
    setCostHistory((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem("production.costingHistory", JSON.stringify(next));
      return next;
    });
  };

  const formattedDateTime = useMemo(
    () =>
      currentDateTime.toLocaleString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [currentDateTime],
  );

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

  function computeTotals(bom, productionQtyValue) {
    if (!bom) {
      return null;
    }
    const productionQty = Number(productionQtyValue || 0);
    const batchQty = Number(bom.quantityPerBatch || 1) || 1;
    const batchFactor = productionQty > 0 ? productionQty / batchQty : 0;
    const lines = (bom.lines || []).map((line) => {
      const recipeQty = Number(line.qty || 0);
      const atQty = Number(line.atQty || batchQty) || batchQty;
      const unitCost = Number(line.cost || 0);
      const scaledQty =
        productionQty > 0 ? ((recipeQty || 0) / (atQty || 1)) * productionQty : 0;
      return {
        ...line,
        recipeQty,
        atQty,
        unitCost,
        scaledQty,
        subtotal: scaledQty * unitCost,
      };
    });
    const materialCost = lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0);
    const laborCostValue = getBomExpenseValue(bom) * batchFactor;
    const total = materialCost + laborCostValue;
    const totalPerUnit = productionQty > 0 ? total / productionQty : 0;
    return {
      batchQty,
      batchFactor,
      productionQty,
      lines,
      materialCost,
      laborCost: laborCostValue,
      overhead: 0,
      total,
      totalPerUnit,
    };
  }

  const applyInventoryDeduction = async (entry) => {
    if (!entry || entry.inventoryAdjusted) {
      return true;
    }
    const qty = Number(entry.quantity || 1);
    const match = items.find(
      (item) => (item.name || "").toLowerCase() === (entry.product || "").toLowerCase(),
    );
    if (!match) {
      setFeedback({ type: "error", message: "Inventory item not found for this product." });
      return false;
    }
    const currentStock = Number(match.currentStock || 0);
    try {
      await inventoryApi.updateItem(match.id, { currentStock: currentStock - qty });
      itemsQuery.refetch();
    } catch {
      setFeedback({ type: "error", message: "Failed to update inventory stock." });
      return false;
    }
    persistCostHistory((prev) =>
      prev.map((row) =>
        row.id === entry.id
          ? { ...row, inventoryAdjusted: true, inventoryAdjustedAt: new Date().toISOString() }
          : row,
      ),
    );
    return true;
  };

  const filteredBoms = useMemo(() => {
    const query = normalizeText(bomSearch);
    if (!query) {
      return boms;
    }
    return boms.filter((bom) =>
      `${bom.name || ""} ${bom.product || ""}`.toLowerCase().includes(query),
    );
  }, [boms, bomSearch]);

  const matchingCostingBoms = useMemo(() => {
    const query = normalizeText(costingProduct);
    if (!query) {
      return [];
    }
    return boms.filter((bom) =>
      `${bom.name || ""} ${bom.product || ""}`.toLowerCase().includes(query),
    );
  }, [boms, costingProduct]);

  const matchedCostingBom = useMemo(() => {
    const query = normalizeText(costingProduct);
    if (!query) {
      return null;
    }
    return (
      boms.find(
        (bom) => normalizeText(bom.product) === query || normalizeText(bom.name) === query,
      ) || null
    );
  }, [boms, costingProduct]);

  const costingPreview = useMemo(
    () => computeTotals(matchedCostingBom, costingInputs.productionQty) || createEmptyCostSummary(),
    [matchedCostingBom, costingInputs.productionQty],
  );

  const editingProductionPreview = useMemo(() => {
    if (!editingProduction) {
      return createEmptyCostSummary();
    }
    const bom = boms.find((item) => item.id === editingProduction.bomId);
    return computeTotals(bom, productionEditInputs.quantity) || createEmptyCostSummary();
  }, [boms, editingProduction, productionEditInputs.quantity]);

  const handleOpenEdit = (bom) => {
    const expenseRows = buildExpenseRowsFromPayload(bom);
    const normalizedExpenseRows = normalizeExpenseRowsForSave(expenseRows);
    const totalExpense = sumExpenseRows(normalizedExpenseRows);
    const combinedRemark = normalizedExpenseRows
      .map((row) => normalizeSpaces(row.remark))
      .filter(Boolean)
      .join(" | ");
    setEditingBom(bom);
    setEditName(bom.name || bom.product || "");
    setEditProduct(bom.product || "");
    setEditQuantity(String(bom.quantityPerBatch ?? 1));
    setEditUnit(String(bom.unit || ""));
    setEditLaborCost(String(totalExpense || bom.expense || bom.laborCost || ""));
    setEditRemark(String(combinedRemark || bom.remark || ""));
    setEditExpenseRows(expenseRows);
    setEditLines(bom.lines?.length ? mapStoredLines(bom.lines) : [createBomLine()]);
    setIsEditOpen(true);
  };

  const closeCostingModal = () => {
    setIsCostingModalOpen(false);
    setCostingProduct("");
    setCostingInputs({ productionQty: "1" });
    setPendingProduction(null);
    setCostSummary(createEmptyCostSummary());
  };

  const handleOpenNewCosting = () => {
    setCostingProduct("");
    setCostingInputs({ productionQty: "1" });
    setPendingProduction(null);
    setCostSummary(createEmptyCostSummary());
    setIsCostingModalOpen(true);
  };

  const handleLoadBomIntoCosting = (bom) => {
    if (!bom) {
      return;
    }
    const defaultQty = String(bom.quantityPerBatch || 1);
    setCostingProduct(bom.product || bom.name || "");
    setCostingInputs({ productionQty: defaultQty });
    setCostSummary(computeTotals(bom, defaultQty) || createEmptyCostSummary());
    setPendingProduction(null);
    setActiveTab("costing");
    setIsCostingModalOpen(true);
  };

  const handleEditLineChange = (lineId, field, value) => {
    if (field === "material") {
      setEditLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? applyInventoryDefaultsToLine(line, value) : line,
        ),
      );
      return;
    }
    setEditLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, [field]: value } : line)),
    );
  };

  const handleEditAddLine = () => {
    setEditLines((prev) => [...prev, createBomLine()]);
  };

  const handleCalculateCost = () => {
    setFeedback(null);
    if (!matchedCostingBom) {
      setFeedback({ type: "error", message: "Select a BOM product before calculating cost." });
      return;
    }
    const quantity = Number(costingInputs.productionQty || 0);
    if (quantity <= 0) {
      setFeedback({ type: "error", message: "Enter a production quantity greater than zero." });
      return;
    }
    const totals = computeTotals(matchedCostingBom, quantity);
    if (!totals || totals.productionQty <= 0) {
      setFeedback({ type: "error", message: "Unable to calculate totals for this BOM." });
      return;
    }
    setCostSummary(totals);
    setPendingProduction({
      recipeName: matchedCostingBom.name || matchedCostingBom.product,
      product: matchedCostingBom.product,
      bomId: matchedCostingBom.id,
      quantity,
      totals,
    });
  };

  const handleProductionStatusChange = async (entryId, nextStatus) => {
    const entry = costHistory.find((row) => row.id === entryId);
    if (!entry || entry.status === nextStatus) {
      return;
    }
    if (nextStatus === "processing" && !entry.inventoryAdjusted) {
      const success = await applyInventoryDeduction(entry);
      if (!success) {
        return;
      }
    }
    persistCostHistory((prev) =>
      prev.map((row) => (row.id === entryId ? { ...row, status: nextStatus } : row)),
    );
  };

  const handleSaveProduction = async () => {
    if (!pendingProduction) {
      setFeedback({ type: "error", message: "Calculate cost before saving production." });
      return;
    }
    const entry = {
      id: createBomId(),
      recipeName: pendingProduction.recipeName,
      product: pendingProduction.product,
      bomId: pendingProduction.bomId,
      quantity: pendingProduction.quantity,
      status: "processing",
      inventoryAdjusted: false,
      totals: pendingProduction.totals,
      summaryLines: pendingProduction.totals?.lines || [],
      createdAt: new Date().toISOString(),
    };
    persistCostHistory((prev) => [entry, ...prev]);
    await applyInventoryDeduction(entry);
    setFeedback({ type: "success", message: "Production saved successfully." });
    closeCostingModal();
  };

  const handleEditProduction = (entry) => {
    setEditingProduction(entry);
    setProductionEditInputs({
      quantity: String(entry.quantity || entry.totals?.productionQty || 1),
    });
    setProductionEditStatus(entry.status || "processing");
    setIsProductionEditOpen(true);
  };

  const handleSaveProductionEdit = async () => {
    if (!editingProduction) {
      return;
    }
    const bom = boms.find((item) => item.id === editingProduction.bomId);
    if (!bom) {
      setFeedback({ type: "error", message: "BOM not found for this production entry." });
      return;
    }
    const quantity = Number(productionEditInputs.quantity || 0);
    if (quantity <= 0) {
      setFeedback({ type: "error", message: "Enter a production quantity greater than zero." });
      return;
    }
    const totals = computeTotals(bom, quantity);
    if (!totals || totals.productionQty <= 0) {
      setFeedback({ type: "error", message: "Unable to calculate totals for this entry." });
      return;
    }
    const updatedEntry = {
      ...editingProduction,
      quantity,
      status: productionEditStatus,
      totals,
      summaryLines: totals.lines,
    };
    persistCostHistory((prev) =>
      prev.map((row) => (row.id === editingProduction.id ? updatedEntry : row)),
    );
    if (productionEditStatus === "processing" && !editingProduction.inventoryAdjusted) {
      await applyInventoryDeduction(updatedEntry);
    }
    setIsProductionEditOpen(false);
    setEditingProduction(null);
    setFeedback({ type: "success", message: "Production updated successfully." });
  };

  const handleDeleteProduction = (entryId) => {
    persistCostHistory((prev) => prev.filter((row) => row.id !== entryId));
  };

  const handleSaveEditedBom = () => {
    if (!editingBom) {
      return;
    }
    const productName = editProduct.trim();
    const recipeName = editName.trim() || productName;
    if (!productName) {
      setFeedback({ type: "error", message: "Item to produce is required to update BOM." });
      return;
    }
    const cleanedLines = editLines
      .filter((line) =>
        [line.material, line.qty, line.atQty, line.unit, line.cost, line.notes].some(
          (value) => String(value || "").trim() !== "",
        ),
      )
      .map((line) => ({
        material: line.material.trim(),
        materialId: line.materialId ?? null,
        qty: line.qty,
        atQty: line.atQty,
        unit: line.unit.trim(),
        cost: line.cost,
        notes: line.notes.trim(),
      }));
    if (cleanedLines.length === 0) {
      setFeedback({ type: "error", message: "Add at least one material line." });
      return;
    }
    if (cleanedLines.some((line) => !line.material)) {
      setFeedback({ type: "error", message: "Each BOM line must include material name." });
      return;
    }
    if (hasInvalidExpenseRows(editExpenseRows)) {
      setFeedback({ type: "error", message: "Enter expense name for every expense amount/remark." });
      return;
    }
    const normalizedExpenseRows = normalizeExpenseRowsForSave(editExpenseRows);
    const totalExpense = sumExpenseRows(normalizedExpenseRows);
    const mergedRemark = normalizedExpenseRows
      .map((row) => normalizeSpaces(row.remark))
      .filter(Boolean)
      .join(" | ");
    const payload = {
      id: editingBom.id,
      name: recipeName,
      product: productName,
      quantityPerBatch: Number(editQuantity || 1),
      unit: editUnit.trim(),
      expense: totalExpense,
      laborCost: totalExpense,
      expenseLines: normalizedExpenseRows,
      remark: mergedRemark,
      lines: cleanedLines,
      savedAt: new Date().toISOString(),
    };
    const nextBoms = boms.map((bom) => (bom.id === editingBom.id ? payload : bom));
    setBoms(nextBoms);
    localStorage.setItem("production.boms", JSON.stringify(nextBoms));
    localStorage.setItem("production.bom", JSON.stringify(payload));
    const nextExpenseNames = dedupeExpenseNames([
      ...expenseNameLibrary,
      ...getExpenseNamesFromBoms(nextBoms),
      ...normalizedExpenseRows.map((row) => row.expense),
    ]);
    setExpenseNameLibrary(nextExpenseNames);
    localStorage.setItem("production.expenseNames", JSON.stringify(nextExpenseNames));
    setEditLaborCost(totalExpense ? String(totalExpense) : "");
    setEditRemark(mergedRemark);
    setFeedback({ type: "success", message: "BOM updated successfully." });
    setActiveTab("recipe");
    setIsEditOpen(false);
    setEditingBom(null);
    setEditExpenseRows([createExpenseLine()]);
  };

  return (
    <section className="module-page production-module-page" onKeyDown={handleEnterToNextField}>
      <header className="module-header">
        <h3>Production & Manufacturing</h3>
        <span className="module-subtitle">BOM, recipe edits, auto inventory deduction, and costing</span>
      </header>

      {feedback && (
        <div className={feedback.type === "success" ? "alert alert--success" : "alert alert--error"}>
          {feedback.message}
        </div>
      )}

      <ModuleTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === "bom" && (
        <div className="production-bom-shell">
          <form className="module-card form-card production-form-card" style={{ width: "100%" }}>
            <h4>BOM (Bill of Materials)</h4>
            <div className="two-col">
              <label>
                BOM Name
                <input
                  type="text"
                  placeholder="e.g. Core i5 System Generation"
                  value={bomName}
                  onChange={(event) => setBomName(event.target.value)}
                />
              </label>
              <label>
                Item to Produce
                <input
                  type="text"
                  list="bom-product-list"
                  placeholder="Select from inventory or type manually..."
                  value={bomProduct}
                  onChange={(event) => handleBomProductChange(event.target.value)}
                />
              </label>
            </div>
            <div className="two-col">
              <label>
                Quantity
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  value={bomQuantity}
                  onChange={(event) => setBomQuantity(event.target.value)}
                />
              </label>
              <label>
                Unit of Measure
                <input
                  type="text"
                  placeholder="e.g. Pieces"
                  value={bomUnit}
                  onChange={(event) => setBomUnit(event.target.value)}
                />
              </label>
            </div>
            {matchedBomProductItem && (
              <div className="hint-line">
                Inventory Auto Fill: Stock {formatNumber(matchedBomProductItem.currentStock || 0)}, Purchase{" "}
                {formatCurrency(getInventoryPurchasePrice(matchedBomProductItem))}
              </div>
            )}
            <datalist id="bom-product-list">
              {inventoryItems.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </datalist>
            <div className="line-items">
              <div className="line-head">
                <h5>Raw Material Consumed</h5>
                <button type="button" className="small-btn small-btn--ghost" onClick={handleAddBomLine}>
                  + Add Line
                </button>
              </div>
              <div className="table-wrap">
                <table className="pos-item-table">
	                  <thead>
	                    <tr>
	                      <th>SR</th>
	                      <th>Item Name</th>
	                      <th>Qty</th>
	                      <th>UOM</th>
	                      <th>Price</th>
	                      <th>Sub Total</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomLines.map((line, index) => (
                      <tr key={line.id}>
                        <td>{index + 1}</td>
	                        <td>
		                          <input
		                            className="pos-cell-input production-bom-item-input"
		                            type="text"
		                            list="bom-product-list"
		                            placeholder="Material"
	                            style={getAdaptiveFieldStyle(line.material, "Material Name", 26, 44)}
	                            value={line.material}
                            onChange={(event) =>
                              handleBomLineChange(line.id, "material", event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="pos-cell-input"
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={line.qty}
                            onChange={(event) => handleBomLineChange(line.id, "qty", event.target.value)}
                          />
                        </td>
	                        <td>
	                          <input
	                            className="pos-cell-input"
                            type="text"
                            placeholder="Unit"
                            value={line.unit}
                            onChange={(event) => handleBomLineChange(line.id, "unit", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="pos-cell-input"
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={line.cost}
                            onChange={(event) => handleBomLineChange(line.id, "cost", event.target.value)}
                          />
                        </td>
                        <td>{formatCurrency(getLineSubtotal(line))}</td>
                        <td>
                          <input
                            className="pos-cell-input"
                            type="text"
                            placeholder="Notes"
                            value={line.notes}
                            onChange={(event) => handleBomLineChange(line.id, "notes", event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <label>
              Expense
              <input
                type="number"
                placeholder="0"
                value={laborCost}
                onChange={(event) => setLaborCost(event.target.value)}
              />
            </label>
            <button type="button" onClick={handleSaveBom}>Save BOM</button>
          </form>
        </div>
      )}

      {activeTab === "recipe" && (
        <div className="module-card">
          <div className="panel-header production-list-toolbar">
            <div className="production-list-toolbar__title">
              <h4 style={{ margin: 0 }}>Recipe BOM List</h4>
              <span className="production-datetime-pill">{formattedDateTime}</span>
            </div>
            <div className="production-list-toolbar__actions">
              <div className="pos-item-search" style={{ minWidth: 260, flex: 1, maxWidth: 420 }}>
                <Search size={16} className="pos-search-icon" />
                <input
                  className="pos-input pos-input--search"
                  type="text"
                  placeholder="Search by BOM name or item to produce..."
                  value={bomSearch}
                  onChange={(event) => setBomSearch(event.target.value)}
                />
              </div>
              <button type="button" className="view-all-btn" onClick={handleOpenBomForm}>
                Add New BOM
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="pos-item-table">
              <thead>
                <tr>
                  <th>BOM Name</th>
                  <th>Product</th>
                  <th>Batch Qty</th>
                  <th>UOM</th>
	                  <th>Materials</th>
	                  <th>Sub Total</th>
	                  <th>Expense</th>
	                  <th>Total</th>
	                  <th>Last Updated</th>
	                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoms.length === 0 ? (
                  <tr>
	                    <td colSpan={10} className="hint-line" style={{ padding: "16px" }}>
                      No BOMs found yet. Save a BOM to see it here.
                    </td>
                  </tr>
                ) : (
		                  filteredBoms.map((bom) => {
		                    const subtotal = getBomMaterialSubtotal(bom);
		                    const expense = getBomExpenseValue(bom);
		                    const total = subtotal + expense;
		                    return (
		                    <tr key={bom.id}>
                      <td>{bom.name || bom.product}</td>
                      <td>{bom.product}</td>
                      <td>{formatNumber(bom.quantityPerBatch || 1)}</td>
                      <td>{bom.unit || "-"}</td>
                      <td>{formatNumber(bom.lines?.length || 0)}</td>
	                      <td>{formatCurrency(subtotal)}</td>
	                      <td>{formatCurrency(expense)}</td>
	                      <td>{formatCurrency(total)}</td>
                      <td>{bom.savedAt ? new Date(bom.savedAt).toLocaleString() : "—"}</td>
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => handleLoadBomIntoCosting(bom)}
                          >
                            Load In Costing
                          </button>
                          <button
                            type="button"
                            className="small-btn small-btn--ghost"
                            onClick={() => handleOpenEdit(bom)}
                          >
                            Edit
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
        </div>
      )}

      {activeTab === "costing" && (
        <div className="module-card">
          <div className="panel-header" style={{ gap: 12, alignItems: "center" }}>
            <h4 style={{ margin: 0 }}>Production List</h4>
            <button type="button" className="view-all-btn" onClick={handleOpenNewCosting}>
              New Production Costing
            </button>
          </div>
          <div className="table-wrap">
            <table className="pos-item-table">
              <thead>
                <tr>
	                      <th>Recipe</th>
	                      <th>Product</th>
	                      <th>Qty</th>
	                      <th>Per Unit</th>
	                      <th>Sub Total</th>
	                      <th>Expense</th>
	                      <th>Total</th>
	                      <th>Status</th>
	                      <th>Saved</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {costHistory.length === 0 ? (
                  <tr>
	                    <td colSpan={10} className="hint-line" style={{ padding: "16px" }}>
                      No production entries yet. Calculate cost to save entries.
                    </td>
                  </tr>
		                ) : (
		                  costHistory.map((entry) => {
		                    const subtotal = Number(entry.totals?.materialCost || 0);
		                    const expense = Number(entry.totals?.laborCost || 0);
		                    const overhead = Number(entry.totals?.overhead || 0);
		                    const total = Number(entry.totals?.total ?? subtotal + expense + overhead);
		                    return (
		                      <tr key={entry.id}>
		                        <td>{entry.recipeName || entry.product}</td>
		                        <td>{entry.product}</td>
		                        <td>{formatNumber(entry.quantity || 1)}</td>
		                        <td>{formatCurrency(entry.totals?.totalPerUnit || 0)}</td>
		                        <td>{formatCurrency(subtotal)}</td>
		                        <td>{formatCurrency(expense)}</td>
		                        <td>{formatCurrency(total)}</td>
                      <td>
                        <div className="status-cell">
                          <span
                            className={`status-pill status-pill--${(entry.status || "processing").toLowerCase()}`}
                          >
                            {entry.status || "Processing"}
                          </span>
                          <select
                            className="pos-cell-input status-select"
                            value={entry.status || "processing"}
                            onChange={(event) =>
                              handleProductionStatusChange(entry.id, event.target.value)
                            }
                          >
                            <option value="processing">Processing</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </td>
                      <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "-"}</td>
                      <td>
	                        <div className="inline-actions">
                          <button
                            type="button"
                            className="small-btn small-btn--ghost"
                            onClick={() => handleEditProduction(entry)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="small-btn small-btn--danger"
                            onClick={() => handleDeleteProduction(entry.id)}
                          >
                            Delete
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
        </div>
      )}

      {activeTab === "overview" && (
        <article className="module-card">
          <div className="panel-header">
            <h3>Production Overview</h3>
            <button type="button" className="view-all-btn">
              View All
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recipe</th>
                  <th>Status</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {costHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="hint-line" style={{ padding: "12px" }}>
                      No production entries yet.
                    </td>
                  </tr>
                ) : (
                  costHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.product}</td>
                      <td>
                        <span
                          className={`status-pill status-pill--${(entry.status || "processing").toLowerCase()}`}
                        >
                          {entry.status || "Processing"}
                        </span>
                      </td>
                      <td>{formatNumber(entry.quantity || 1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {isBomFormOpen && (
        <div className="inventory-modal-backdrop" onClick={handleCloseBomForm}>
          <div
            className="inventory-modal inventory-product-modal production-bom-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal__header">
              <div>
                <h4>Add New BOM</h4>
                <p className="inventory-modal__sub">Create a new BOM with expense and remark details.</p>
              </div>
              <div className="inventory-modal__actions">
                <button type="button" className="small-btn small-btn--ghost" onClick={handleCloseBomForm}>
                  Close
                </button>
                <button type="button" onClick={handleSaveBom}>
                  Save BOM
                </button>
              </div>
            </div>
            <div className="inventory-modal__body">
              <form className="module-card form-card production-form-card" style={{ width: "100%" }}>
                <div className="three-col">
                  <label>
                    BOM Name
                    <input
                      type="text"
                      placeholder="e.g. Core i5 System Generation"
                      value={bomName}
                      onChange={(event) => setBomName(event.target.value)}
                    />
                  </label>
                  <label>
                    Item to Produce
                    <input
                      type="text"
                      list="bom-product-list"
                      placeholder="Select from inventory or type manually..."
                      value={bomProduct}
                      onChange={(event) => handleBomProductChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="1"
                      value={bomQuantity}
                      onChange={(event) => setBomQuantity(event.target.value)}
                    />
                  </label>
                </div>
                <div className="three-col">
                  <label>
                    Unit of Measure
                    <input
                      type="text"
                      placeholder="e.g. Pieces"
                      value={bomUnit}
                      onChange={(event) => setBomUnit(event.target.value)}
                    />
                  </label>
                </div>
                {matchedBomProductItem && (
                  <div className="hint-line">
                    Inventory Auto Fill: Stock {formatNumber(matchedBomProductItem.currentStock || 0)}, Purchase{" "}
                    {formatCurrency(getInventoryPurchasePrice(matchedBomProductItem))}
                  </div>
                )}
                <datalist id="bom-product-list">
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </datalist>
                <div className="line-items">
                  <div className="line-head">
                    <h5>Raw Material Consumed</h5>
                    <button type="button" className="small-btn small-btn--ghost" onClick={handleAddBomLine}>
                      + Add Line
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table className="pos-item-table">
	                      <thead>
	                        <tr>
	                          <th>SR</th>
	                          <th>Item Name</th>
	                          <th>Qty</th>
	                          <th>UOM</th>
	                          <th>Price</th>
	                          <th>Sub Total</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bomLines.map((line, index) => (
                          <tr key={line.id}>
                            <td>{index + 1}</td>
	                            <td>
		                              <input
		                                className="pos-cell-input production-bom-item-input"
		                                type="text"
		                                list="bom-product-list"
		                                placeholder="Material"
	                                style={getAdaptiveFieldStyle(line.material, "Material Name", 26, 44)}
	                                value={line.material}
                                onChange={(event) =>
                                  handleBomLineChange(line.id, "material", event.target.value)
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="pos-cell-input"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={line.qty}
                                onChange={(event) => handleBomLineChange(line.id, "qty", event.target.value)}
                              />
                            </td>
	                            <td>
	                              <input
	                                className="pos-cell-input"
                                type="text"
                                placeholder="Unit"
                                value={line.unit}
                                onChange={(event) => handleBomLineChange(line.id, "unit", event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="pos-cell-input"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={line.cost}
                                onChange={(event) => handleBomLineChange(line.id, "cost", event.target.value)}
                              />
                            </td>
                            <td>{formatCurrency(getLineSubtotal(line))}</td>
                            <td>
                              <input
                                className="pos-cell-input"
                                type="text"
                                placeholder="Notes"
                                value={line.notes}
                                onChange={(event) => handleBomLineChange(line.id, "notes", event.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="line-items production-expense-block">
                  <div className="line-head">
                    <h5>Expense & Remark</h5>
                    <button type="button" className="small-btn small-btn--ghost" onClick={handleAddBomExpenseRow}>
                      + Add Expense
                    </button>
                  </div>
                  <div className="production-expense-grid">
                    {bomExpenseRows.map((row) => (
                      <div key={row.id} className="production-expense-row">
                        <label>
                          Expense Name
                          <input
                            type="text"
                            list="bom-expense-name-list"
                            placeholder="Search or type expense name"
                            value={row.expense}
                            onChange={(event) =>
                              handleBomExpenseRowChange(row.id, "expense", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Expense Amount
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={row.amount}
                            onChange={(event) =>
                              handleBomExpenseRowChange(row.id, "amount", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Remark / Note
                          <input
                            type="text"
                            placeholder="Expense remark"
                            value={row.remark}
                            onChange={(event) =>
                              handleBomExpenseRowChange(row.id, "remark", event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="small-btn small-btn--danger"
                          onClick={() => handleRemoveBomExpenseRow(row.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <datalist id="bom-expense-name-list">
                    {expenseNameOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isEditOpen && (
        <div className="inventory-modal-backdrop">
          <div className="inventory-modal inventory-product-modal production-bom-modal">
            <div className="inventory-modal__header">
              <div>
                <h4>Edit BOM</h4>
                <p className="inventory-modal__sub">Update materials, expense, and remark for this recipe.</p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditingBom(null);
                    setEditExpenseRows([createExpenseLine()]);
                  }}
                >
                  Close
                </button>
                <button type="button" onClick={handleSaveEditedBom}>
                  Save Changes
                </button>
              </div>
            </div>
            <div className="inventory-modal__body">
              <form className="module-card form-card production-form-card" style={{ width: "100%" }}>
                <div className="two-col">
                  <label>
                    BOM Name
                    <input
                      type="text"
                      placeholder="e.g. Core i5 System Generation"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  </label>
                  <label>
                    Item to Produce
                    <input
                      type="text"
                      list="bom-product-list"
                      placeholder="Select from inventory or type manually..."
                      value={editProduct}
                      onChange={(event) => handleEditProductChange(event.target.value)}
                    />
                  </label>
                </div>
                <div className="two-col">
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="1"
                      value={editQuantity}
                      onChange={(event) => setEditQuantity(event.target.value)}
                    />
                  </label>
                  <label>
                    Unit of Measure
                    <input
                      type="text"
                      placeholder="e.g. Pieces"
                      value={editUnit}
                      onChange={(event) => setEditUnit(event.target.value)}
                    />
                  </label>
                </div>
                {matchedEditProductItem && (
                  <div className="hint-line">
                    Inventory Auto Fill: Stock {formatNumber(matchedEditProductItem.currentStock || 0)}, Purchase{" "}
                    {formatCurrency(getInventoryPurchasePrice(matchedEditProductItem))}
                  </div>
                )}
                <div className="line-items">
                  <div className="line-head">
                    <h5>Raw Material Consumed</h5>
                    <button
                      type="button"
                      className="small-btn small-btn--ghost"
                      onClick={handleEditAddLine}
                    >
                      + Add Line
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table className="pos-item-table">
	                      <thead>
	                        <tr>
	                          <th>SR</th>
	                          <th>Item Name</th>
	                          <th>Qty</th>
	                          <th>UOM</th>
	                          <th>Price</th>
	                          <th>Sub Total</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editLines.map((line, index) => (
                          <tr key={line.id}>
                            <td>{index + 1}</td>
	                            <td>
		                              <input
		                                className="pos-cell-input production-bom-item-input"
		                                type="text"
		                                list="bom-product-list"
		                                placeholder="Material"
	                                style={getAdaptiveFieldStyle(line.material, "Material Name", 26, 44)}
	                                value={line.material}
                                onChange={(event) =>
                                  handleEditLineChange(line.id, "material", event.target.value)
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="pos-cell-input"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={line.qty}
                                onChange={(event) =>
                                  handleEditLineChange(line.id, "qty", event.target.value)
                                }
                              />
                            </td>
	                            <td>
	                              <input
	                                className="pos-cell-input"
                                type="text"
                                placeholder="Unit"
                                value={line.unit}
                                onChange={(event) =>
                                  handleEditLineChange(line.id, "unit", event.target.value)
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="pos-cell-input"
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={line.cost}
                                onChange={(event) =>
                                  handleEditLineChange(line.id, "cost", event.target.value)
                                }
                              />
                            </td>
                            <td>{formatCurrency(getLineSubtotal(line))}</td>
                            <td>
                              <input
                                className="pos-cell-input"
                                type="text"
                                placeholder="Notes"
                                value={line.notes}
                                onChange={(event) =>
                                  handleEditLineChange(line.id, "notes", event.target.value)
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="line-items production-expense-block">
                  <div className="line-head">
                    <h5>Expense & Remark</h5>
                    <button type="button" className="small-btn small-btn--ghost" onClick={handleAddEditExpenseRow}>
                      + Add Expense
                    </button>
                  </div>
                  <div className="production-expense-grid">
                    {editExpenseRows.map((row) => (
                      <div key={row.id} className="production-expense-row">
                        <label>
                          Expense Name
                          <input
                            type="text"
                            list="edit-expense-name-list"
                            placeholder="Search or type expense name"
                            value={row.expense}
                            onChange={(event) =>
                              handleEditExpenseRowChange(row.id, "expense", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Expense Amount
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={row.amount}
                            onChange={(event) =>
                              handleEditExpenseRowChange(row.id, "amount", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Remark / Note
                          <input
                            type="text"
                            placeholder="Expense remark"
                            value={row.remark}
                            onChange={(event) =>
                              handleEditExpenseRowChange(row.id, "remark", event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="small-btn small-btn--danger"
                          onClick={() => handleRemoveEditExpenseRow(row.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <datalist id="edit-expense-name-list">
                    {expenseNameOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isProductionEditOpen && editingProduction && (
        <div className="inventory-modal-backdrop">
          <div className="inventory-modal production-edit-modal">
            <div className="inventory-modal__header">
              <div>
                <h4>Edit Production</h4>
                <p className="inventory-modal__sub">Update production quantity and status.</p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={() => {
                    setIsProductionEditOpen(false);
                    setEditingProduction(null);
                  }}
                >
                  Close
                </button>
                <button type="button" onClick={handleSaveProductionEdit}>
                  Update Production
                </button>
              </div>
            </div>
            <div className="inventory-modal__body">
              <form className="module-card form-card production-form-card" style={{ width: "100%" }}>
                <label>
                  Product
                  <input type="text" value={editingProduction.product} readOnly />
                </label>
                <div className="two-col">
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      value={productionEditInputs.quantity}
                      onChange={(event) =>
                        setProductionEditInputs((prev) => ({ ...prev, quantity: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={productionEditStatus}
                      onChange={(event) => setProductionEditStatus(event.target.value)}
                    >
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                </div>
                <div className="production-preview-card">
                  <div className="production-preview-card__head">Auto Summary</div>
                  <div className="kpi-grid production-kpi-grid">
                    <div>
                      <span>Batch Qty</span>
                      <strong>{formatNumber(editingProductionPreview.batchQty || 1)}</strong>
                    </div>
                    <div>
                      <span>Material Cost</span>
                      <strong>{formatCurrency(editingProductionPreview.materialCost || 0)}</strong>
                    </div>
                    <div>
                      <span>Expense</span>
                      <strong>{formatCurrency(editingProductionPreview.laborCost || 0)}</strong>
                    </div>
                    <div>
                      <span>Total / Unit</span>
                      <strong>{formatCurrency(editingProductionPreview.totalPerUnit || 0)}</strong>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isCostingModalOpen && (
        <div className="inventory-modal-backdrop">
          <div className="inventory-modal production-modal--wide">
            <div className="inventory-modal__header">
              <div>
                <h4>Production Costing</h4>
                <p className="inventory-modal__sub">Create a new production entry with costing.</p>
              </div>
              <div className="inventory-modal__actions">
                <button
                  type="button"
                  className="small-btn small-btn--ghost"
                  onClick={closeCostingModal}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="inventory-modal__body">
              <div className="summary-grid two-wide production-costing-layout">
                <form className="module-card form-card production-form-card">
                  <h4>Production Input</h4>
                  <label>
                    Product
                    <input
                      className="pos-input"
                      type="text"
                      list="costing-bom-list"
                      placeholder="Search by product name..."
                      value={costingProduct}
                      onChange={(event) => setCostingProduct(event.target.value)}
                    />
                    <datalist id="costing-bom-list">
                      {boms.map((bom) => (
                        <option key={bom.id} value={bom.product} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    Production Qty
                    <input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={costingInputs.productionQty}
                      onChange={(event) =>
                        setCostingInputs((prev) => ({ ...prev, productionQty: event.target.value }))
                      }
                    />
                  </label>
                  <div className="hint-line">
                    Recipe Editor ka BOM yahan auto load hota hai. Production qty barhay gi to qty, material cost aur labor cost sab scale honge.
                  </div>
                  <div className="hint-line">Total BOM recipes saved: {formatNumber(boms.length)}</div>
                  <div className="quick-actions">
                    <button type="button" onClick={handleCalculateCost}>
                      Calculate Cost
                    </button>
                    <button
                      type="button"
                      className="small-btn small-btn--ghost"
                      onClick={() => handleLoadBomIntoCosting(matchedCostingBom)}
                      disabled={!matchedCostingBom}
                    >
                      Reload Recipe Qty
                    </button>
                  </div>
                </form>
                <article className="module-card">
                  <h4>Attached BOM Recipe</h4>
                  {matchedCostingBom ? (
                    <>
                      <div className="hint-line">
                        {matchedCostingBom.product} - {formatNumber(matchedCostingBom.lines?.length || 0)} materials
                      </div>
                      <div className="table-wrap" style={{ marginTop: 10 }}>
                        <table className="pos-item-table">
                          <thead>
                            <tr>
                              <th>Material</th>
                              <th>Qty</th>
                              <th>At Qty</th>
                              <th>Unit</th>
                              <th>Cost</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matchedCostingBom.lines?.map((line, index) => (
                              <tr key={`${matchedCostingBom.id}-${index}`}>
                                <td>{line.material}</td>
                                <td>{line.qty}</td>
                                <td>{line.atQty || matchedCostingBom.quantityPerBatch || 1}</td>
                                <td>{line.unit || "-"}</td>
                                <td>{line.cost ? formatCurrency(line.cost) : "-"}</td>
                                <td>{line.notes || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="production-preview-card">
                        <div className="production-preview-card__head">Auto Summary</div>
                        <div className="kpi-grid production-kpi-grid">
                          <div>
                            <span>Batch Qty</span>
                            <strong>{formatNumber(costingPreview.batchQty || 1)}</strong>
                          </div>
                          <div>
                            <span>Production Qty</span>
                            <strong>{formatNumber(costingPreview.productionQty || 0)}</strong>
                          </div>
                          <div>
                            <span>Batch Factor</span>
                            <strong>{formatNumber(costingPreview.batchFactor || 0)}</strong>
                          </div>
                          <div>
                            <span>Batch Expense</span>
                            <strong>{formatCurrency(matchedCostingBom.expense ?? matchedCostingBom.laborCost ?? 0)}</strong>
                          </div>
                          <div>
                            <span>Scaled Expense</span>
                            <strong>{formatCurrency(costingPreview.laborCost || 0)}</strong>
                          </div>
                          <div>
                            <span>Material Preview</span>
                            <strong>{formatCurrency(costingPreview.materialCost || 0)}</strong>
                          </div>
                          <div>
                            <span>Preview Total</span>
                            <strong>{formatCurrency(costingPreview.total || 0)}</strong>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : matchingCostingBoms.length > 0 ? (
                    <div className="table-wrap">
                      <table className="pos-item-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Materials</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchingCostingBoms.map((bom) => (
                            <tr key={bom.id}>
                              <td>{bom.product}</td>
                              <td>{formatNumber(bom.lines?.length || 0)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="small-btn small-btn--ghost"
                                  onClick={() => handleLoadBomIntoCosting(bom)}
                                >
                                  Attach
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="hint-line">
                      Search a product name to attach its BOM recipe from Recipe Editor.
                    </div>
                  )}
                </article>
                <article className="module-card">
                  <h4>Auto Cost Summary</h4>
                  <div className="kpi-grid production-kpi-grid">
                    <div>
                      <span>Material Cost</span>
                      <strong>{formatCurrency(costSummary.materialCost)}</strong>
                    </div>
                    <div>
                      <span>Expense</span>
                      <strong>{formatCurrency(costSummary.laborCost)}</strong>
                    </div>
                    <div>
                      <span>Overhead</span>
                      <strong>{formatCurrency(costSummary.overhead)}</strong>
                    </div>
                    <div>
                      <span>Total Cost</span>
                      <strong>{formatCurrency(costSummary.total)}</strong>
                    </div>
                    <div>
                      <span>Total Cost / Unit</span>
                      <strong>{formatCurrency(costSummary.totalPerUnit)}</strong>
                    </div>
                    <div>
                      <span>Production Qty</span>
                      <strong>{formatNumber(costSummary.productionQty || 0)}</strong>
                    </div>
                  </div>
                  <div className="quick-actions">
                    <button type="button" onClick={handleSaveProduction} disabled={!pendingProduction}>
                      Save Production
                    </button>
                  </div>
                </article>
              </div>
              {costSummary.lines?.length > 0 && (
                <article className="module-card production-breakdown-card">
                  <div className="panel-header">
                    <h4 style={{ margin: 0 }}>Calculated Item-Wise Grid</h4>
                    <div className="hint-line">
                      Production qty {formatNumber(costSummary.productionQty || 0)} par BOM auto scale ho chuka hai.
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="pos-item-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Recipe Qty</th>
                          <th>At Qty</th>
                          <th>Scaled Qty</th>
                          <th>Unit</th>
                          <th>Unit Cost</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costSummary.lines.map((line, index) => (
                          <tr key={`${line.id || line.material}-${index}`}>
                            <td>{line.material || "-"}</td>
                            <td>{formatNumber(line.recipeQty || 0)}</td>
                            <td>{formatNumber(line.atQty || costSummary.batchQty || 1)}</td>
                            <td>{formatNumber(line.scaledQty || 0)}</td>
                            <td>{line.unit || "-"}</td>
                            <td>{formatCurrency(line.unitCost || 0)}</td>
                            <td>{formatCurrency(line.subtotal || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ProductionPage;
