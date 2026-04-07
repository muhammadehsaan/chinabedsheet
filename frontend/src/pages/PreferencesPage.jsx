import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download, Eye, Lock, Pencil, Plus, ShieldCheck, Trash2, Upload, UserCog } from "lucide-react";

import ModuleTabs from "../components/ModuleTabs";
import { inventoryApi } from "../api/modules";
import { extractApiError } from "../api/client";
import { formatNumber } from "../utils/format";

const tabs = [
  { value: "roles", label: "User Roles" },
  { value: "data", label: "Data Protection" },
  { value: "shortcuts", label: "Shortcuts" },
  { value: "print", label: "Print Config" },
  { value: "stock", label: "Stock Adjustment" },
];

const shortcuts = [
  { key: "F1", action: "Open Sales" },
  { key: "F2", action: "Open Inventory" },
  { key: "F3", action: "New Invoice" },
];

const rbacSteps = [
  {
    title: "Create Role",
    text: "Define a role like Manager, Cashier or Warehouse and describe its responsibility.",
  },
  {
    title: "Toggle Permissions",
    text: "Turn permissions on or off module-wise so every role gets only the access it needs.",
  },
  {
    title: "Assign Users",
    text: "Create users and map them to roles. Enforcement can be connected in the next step.",
  },
];

const rbacSections = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
];

const permissionGroups = [
  {
    key: "dashboard",
    label: "Dashboard",
    permissions: [
      { key: "dashboard.view", label: "View dashboard" },
      { key: "dashboard.notifications", label: "Open notifications" },
    ],
  },
  {
    key: "sales",
    label: "Sales & POS",
    permissions: [
      { key: "sales.view", label: "View sales" },
      { key: "sales.create", label: "Create sales" },
      { key: "sales.edit", label: "Edit sales" },
      { key: "sales.delete", label: "Delete / cancel sales" },
      { key: "sales.print", label: "Print invoices" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View inventory" },
      { key: "inventory.create", label: "Create items" },
      { key: "inventory.edit", label: "Edit items" },
      { key: "inventory.delete", label: "Delete items" },
      { key: "inventory.adjust", label: "Adjust stock" },
    ],
  },
  {
    key: "purchases",
    label: "Purchases",
    permissions: [
      { key: "purchases.view", label: "View purchases" },
      { key: "purchases.create", label: "Create purchases" },
      { key: "purchases.edit", label: "Edit purchases" },
      { key: "purchases.delete", label: "Delete purchases" },
    ],
  },
  {
    key: "accounts",
    label: "Accounts & Finance",
    permissions: [
      { key: "accounts.view", label: "View accounts" },
      { key: "accounts.create", label: "Create bank / ledger" },
      { key: "accounts.edit", label: "Edit bank / ledger" },
      { key: "accounts.delete", label: "Delete bank / ledger" },
    ],
  },
  {
    key: "emi",
    label: "EMI & Installments",
    permissions: [
      { key: "emi.view", label: "View EMI" },
      { key: "emi.create", label: "Create EMI" },
      { key: "emi.edit", label: "Edit EMI" },
      { key: "emi.delete", label: "Delete EMI" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    permissions: [
      { key: "reports.view", label: "View reports" },
      { key: "reports.export", label: "Export reports" },
      { key: "reports.print", label: "Print reports" },
    ],
  },
  {
    key: "settings",
    label: "Settings & Security",
    permissions: [
      { key: "settings.view", label: "View settings" },
      { key: "settings.roles", label: "Manage roles" },
      { key: "settings.users", label: "Manage users" },
      { key: "settings.permissions", label: "Change permissions" },
    ],
  },
];

const allPermissionKeys = permissionGroups.flatMap((group) =>
  group.permissions.map((permission) => permission.key),
);

const createPermissionState = (fill = false, overrides = {}) =>
  allPermissionKeys.reduce(
    (acc, key) => ({
      ...acc,
      [key]: key in overrides ? Boolean(overrides[key]) : fill,
    }),
    {},
  );

const initialRoles = [
  {
    id: "admin",
    name: "Admin",
    description: "System owner with complete access to every area.",
    status: "Active",
    isLocked: true,
    permissions: createPermissionState(true),
  },
  {
    id: "manager",
    name: "Manager",
    description: "Can manage sales, inventory, purchases and reports.",
    status: "Active",
    isLocked: false,
    permissions: createPermissionState(false, {
      "dashboard.view": true,
      "dashboard.notifications": true,
      "sales.view": true,
      "sales.create": true,
      "sales.edit": true,
      "sales.print": true,
      "inventory.view": true,
      "inventory.create": true,
      "inventory.edit": true,
      "inventory.adjust": true,
      "purchases.view": true,
      "purchases.create": true,
      "purchases.edit": true,
      "accounts.view": true,
      "emi.view": true,
      "emi.create": true,
      "emi.edit": true,
      "reports.view": true,
      "reports.export": true,
      "settings.view": true,
      "settings.users": true,
    }),
  },
  {
    id: "sales-executive",
    name: "Sales Executive",
    description: "Handles counter sales, printing and customer dealing.",
    status: "Active",
    isLocked: false,
    permissions: createPermissionState(false, {
      "dashboard.view": true,
      "sales.view": true,
      "sales.create": true,
      "sales.print": true,
      "inventory.view": true,
      "emi.view": true,
      "emi.create": true,
      "reports.view": true,
    }),
  },
];

const initialUsers = [
  {
    id: "user-admin",
    name: "Admin",
    username: "admin",
    email: "admin@china-bedsheet.com",
    status: "Active",
    roleId: "admin",
    phone: "0300-0000000",
    notes: "Default super admin account.",
    isLocked: true,
  },
  {
    id: "user-muhammad-ali",
    name: "Muhammad Ali",
    username: "mali",
    email: "mali@china-bedsheet.com",
    status: "Active",
    roleId: "manager",
    phone: "0312-1234567",
    notes: "Operations manager mock user.",
    isLocked: false,
  },
  {
    id: "user-warehouse",
    name: "Warehouse",
    username: "warehouse",
    email: "warehouse@china-bedsheet.com",
    status: "Inactive",
    roleId: "sales-executive",
    phone: "",
    notes: "",
    isLocked: false,
  },
];

const createEmptyUserForm = (defaultRoleId = "sales-executive") => ({
  name: "",
  username: "",
  email: "",
  phone: "",
  status: "Active",
  roleId: defaultRoleId,
  notes: "",
});

const createEmptyRoleForm = () => ({
  name: "",
  description: "",
  status: "Active",
  permissions: createPermissionState(false),
});

const slugifyRoleId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function PreferencesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("roles");
  const [feedback, setFeedback] = useState(null);
  const [stockDate, setStockDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemNameInput, setSelectedItemNameInput] = useState("");
  const [selectedNewStock, setSelectedNewStock] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [stockCategoryFilter, setStockCategoryFilter] = useState("all");
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [rowNewStockDrafts, setRowNewStockDrafts] = useState({});
  const [importingStock, setImportingStock] = useState(false);
  const stockImportRef = useRef(null);
  const [roleRows, setRoleRows] = useState(initialRoles);
  const [userRows, setUserRows] = useState(initialUsers);
  const [editingRoleId, setEditingRoleId] = useState("admin");
  const [roleEditorMode, setRoleEditorMode] = useState("view");
  const [activeRbacSection, setActiveRbacSection] = useState("overview");
  const [roleForm, setRoleForm] = useState(() => ({
    ...initialRoles[0],
    permissions: { ...initialRoles[0].permissions },
  }));
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState(() => createEmptyUserForm(initialRoles[2]?.id || initialRoles[0]?.id));

  const itemsQuery = useQuery({
    queryKey: ["inventory", "items"],
    queryFn: inventoryApi.listItems,
  });

  const stockAdjustmentsQuery = useQuery({
    queryKey: ["inventory", "stock-adjustments"],
    queryFn: inventoryApi.listStockAdjustments,
  });

  const items = itemsQuery.data || [];
  const stockAdjustments = stockAdjustmentsQuery.data || [];
  const selectedRole = useMemo(
    () => roleRows.find((role) => role.id === editingRoleId) || null,
    [editingRoleId, roleRows],
  );
  const rolesById = useMemo(
    () => roleRows.reduce((acc, role) => ({ ...acc, [role.id]: role }), {}),
    [roleRows],
  );
  const selectedRoleIsLocked = roleEditorMode !== "create" && Boolean(selectedRole?.isLocked);
  const selectedRoleUsersCount = useMemo(
    () => userRows.filter((user) => user.roleId === editingRoleId).length,
    [editingRoleId, userRows],
  );
  const activePermissionCount = useMemo(
    () => Object.values(roleForm.permissions || {}).filter(Boolean).length,
    [roleForm.permissions],
  );
  const totalPermissionCount = allPermissionKeys.length;
  const roleKpis = useMemo(
    () => ({
      roles: roleRows.length,
      activeRoles: roleRows.filter((role) => role.status === "Active").length,
      users: userRows.length,
      customRoles: roleRows.filter((role) => !role.isLocked).length,
    }),
    [roleRows, userRows],
  );
  const loadRoleIntoEditor = (role, mode = "view") => {
    setEditingRoleId(role.id);
    setRoleEditorMode(role.isLocked && mode === "edit" ? "view" : mode);
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description || "",
      status: role.status || "Active",
      isLocked: Boolean(role.isLocked),
      permissions: { ...createPermissionState(false), ...(role.permissions || {}) },
    });
  };
  const resetRoleEditor = () => {
    setEditingRoleId("");
    setRoleEditorMode("create");
    setRoleForm(createEmptyRoleForm());
  };
  const resetUserEditor = () => {
    setEditingUserId(null);
    setUserForm(createEmptyUserForm(roleRows.find((role) => !role.isLocked)?.id || roleRows[0]?.id || ""));
  };

  const categoryOptions = useMemo(() => {
    const names = items
      .map((item) => String(item?.category?.name || "").trim())
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [items]);

  const selectedItem = useMemo(
    () => items.find((item) => Number(item.id) === Number(selectedItemId)) || null,
    [items, selectedItemId],
  );

  const filteredStockRows = useMemo(() => {
    const search = stockSearch.trim().toLowerCase();
    return items.filter((item) => {
      const categoryName = String(item?.category?.name || "").trim();
      if (stockCategoryFilter !== "all" && categoryName !== stockCategoryFilter) {
        return false;
      }
      const stock = Number(item?.currentStock || 0);
      if (negativeOnly && stock >= 0) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = [item?.name, item?.barcode, categoryName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(search);
    });
  }, [items, stockSearch, stockCategoryFilter, negativeOnly]);

  const filteredAdjustments = useMemo(() => {
    if (!stockDate) {
      return stockAdjustments;
    }
    return stockAdjustments.filter((entry) => {
      const dateValue = entry?.createdAt ? new Date(entry.createdAt).toISOString().slice(0, 10) : "";
      return dateValue === stockDate;
    });
  }, [stockAdjustments, stockDate]);

  const createAdjustmentMutation = useMutation({
    mutationFn: inventoryApi.createStockAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "low-stock"] });
    },
  });

  const saveStockAdjustment = async ({ item, newStock, reason }) => {
    const currentStock = Number(item?.currentStock || 0);
    const nextStock = Number(newStock);
    if (!Number.isFinite(nextStock)) {
      throw new Error("New stock value is invalid.");
    }
    const delta = nextStock - currentStock;
    if (delta === 0) {
      return { skipped: true };
    }
    await createAdjustmentMutation.mutateAsync({
      itemId: item.id,
      quantity: delta,
      reason: reason || `Stock adjusted in Settings (${stockDate || "today"})`,
    });
    return { skipped: false };
  };

  const handleCreateSelectedAdjustment = async () => {
    setFeedback(null);
    if (!selectedItem) {
      setFeedback({ type: "error", message: "Select an item first." });
      return;
    }
    try {
      const result = await saveStockAdjustment({
        item: selectedItem,
        newStock: selectedNewStock,
        reason: selectedReason,
      });
      if (result.skipped) {
        setFeedback({ type: "error", message: "No stock change found." });
        return;
      }
      setFeedback({ type: "success", message: "Stock adjustment saved." });
      setSelectedNewStock("");
      setSelectedReason("");
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to save stock adjustment.") });
    }
  };

  const handleRowDraftChange = (itemId, value) => {
    setRowNewStockDrafts((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const handleSaveRowAdjustment = async (item) => {
    const draftValue = rowNewStockDrafts[item.id];
    setFeedback(null);
    try {
      const result = await saveStockAdjustment({
        item,
        newStock: draftValue,
        reason: `Quick row adjustment (${stockDate || "today"})`,
      });
      if (result.skipped) {
        setFeedback({ type: "error", message: "No stock change found for selected row." });
        return;
      }
      setRowNewStockDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setFeedback({ type: "success", message: "Row stock updated." });
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to update row stock.") });
    }
  };

  const handleExportStockReport = () => {
    if (!filteredStockRows.length) {
      setFeedback({ type: "error", message: "No stock report rows to export." });
      return;
    }
    const rows = filteredStockRows.map((item, index) => ({
      "SR #": index + 1,
      Barcode: item?.barcode || "",
      "Item Name": item?.name || "",
      "Current Stock": Number(item?.currentStock || 0),
      "New Stock": "",
      Category: item?.category?.name || "",
      Status: item?.status || "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "StockReport");
    XLSX.writeFile(workbook, "stock-adjustment-report.xlsx");
  };

  const handleImportStockFromExcel = async (file) => {
    if (!file) {
      return;
    }
    setFeedback(null);
    setImportingStock(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setFeedback({ type: "error", message: "No worksheet found in Excel file." });
        return;
      }
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
      if (!rows.length) {
        setFeedback({ type: "error", message: "No rows found to import." });
        return;
      }
      const normalize = (value) => String(value || "").trim().toLowerCase();
      const itemsByBarcode = new Map();
      const itemsByName = new Map();
      items.forEach((item) => {
        const barcodeKey = normalize(item?.barcode);
        const nameKey = normalize(item?.name);
        if (barcodeKey) {
          itemsByBarcode.set(barcodeKey, item);
        }
        if (nameKey && !itemsByName.has(nameKey)) {
          itemsByName.set(nameKey, item);
        }
      });
      let importedCount = 0;
      let skippedCount = 0;
      for (const row of rows) {
        const normalizedRow = Object.entries(row || {}).reduce((acc, [key, value]) => {
          acc[normalize(key)] = value;
          return acc;
        }, {});
        const barcode = normalize(normalizedRow["barcode"]);
        const itemName = normalize(normalizedRow["item name"] || normalizedRow["name"] || normalizedRow["product name"]);
        const newStockRaw = normalizedRow["new stock"] ?? normalizedRow["stock"] ?? normalizedRow["current stock"];
        const reason = String(normalizedRow["reason"] || "").trim();
        const newStock = Number(String(newStockRaw ?? "").replace(/,/g, "").replace(/[^\d.-]/g, "").trim());
        const item = (barcode && itemsByBarcode.get(barcode)) || (itemName && itemsByName.get(itemName));
        if (!item || !Number.isFinite(newStock)) {
          skippedCount += 1;
          continue;
        }
        try {
          const result = await saveStockAdjustment({ item, newStock, reason });
          if (result.skipped) {
            skippedCount += 1;
            continue;
          }
          importedCount += 1;
        } catch (_error) {
          skippedCount += 1;
        }
      }
      setFeedback({
        type: importedCount > 0 ? "success" : "error",
        message: `Imported ${importedCount} stock adjustments. Skipped ${skippedCount} rows.`,
      });
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to import stock adjustments.") });
    } finally {
      setImportingStock(false);
    }
  };

  useEffect(() => {
    if (!selectedRole && roleRows.length > 0) {
      loadRoleIntoEditor(roleRows[0], "view");
    }
  }, [roleRows, selectedRole]);

  const handleUserFormChange = (field, value) => {
    setUserForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRoleFormChange = (field, value) => {
    if (selectedRoleIsLocked) {
      return;
    }
    setRoleForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePermissionToggle = (permissionKey) => {
    if (selectedRoleIsLocked) {
      return;
    }
    setRoleForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permissionKey]: !prev.permissions?.[permissionKey],
      },
    }));
  };

  const handlePermissionGroupToggle = (group, enabled) => {
    if (selectedRoleIsLocked) {
      return;
    }
    setRoleForm((prev) => {
      const nextPermissions = { ...prev.permissions };
      group.permissions.forEach((permission) => {
        nextPermissions[permission.key] = enabled;
      });
      return {
        ...prev,
        permissions: nextPermissions,
      };
    });
  };

  const handleSaveRole = () => {
    setFeedback(null);
    const roleName = String(roleForm.name || "").trim();
    if (!roleName) {
      setFeedback({ type: "error", message: "Role name is required." });
      return;
    }
    if (selectedRoleIsLocked) {
      setFeedback({ type: "error", message: "Admin role is locked and cannot be modified." });
      return;
    }
    const roleId = roleEditorMode === "create" ? slugifyRoleId(roleName) : editingRoleId;
    if (!roleId) {
      setFeedback({ type: "error", message: "Role id could not be generated." });
      return;
    }
    const duplicateRole = roleRows.find(
      (role) => role.id !== editingRoleId && String(role.name || "").toLowerCase() === roleName.toLowerCase(),
    );
    if (duplicateRole) {
      setFeedback({ type: "error", message: "A role with this name already exists." });
      return;
    }
    const nextRole = {
      id: roleId,
      name: roleName,
      description: String(roleForm.description || "").trim(),
      status: roleForm.status || "Active",
      isLocked: false,
      permissions: { ...createPermissionState(false), ...(roleForm.permissions || {}) },
    };
    setRoleRows((prev) =>
      roleEditorMode === "create"
        ? [...prev, nextRole]
        : prev.map((role) => (role.id === editingRoleId ? { ...role, ...nextRole } : role)),
    );
    loadRoleIntoEditor(nextRole, "view");
    if (roleEditorMode === "create" && !userForm.roleId) {
      setUserForm((prev) => ({ ...prev, roleId }));
    }
    setFeedback({
      type: "success",
      message: roleEditorMode === "create" ? "Role created successfully." : "Role updated successfully.",
    });
  };

  const handleDeleteRole = (role) => {
    setFeedback(null);
    if (role.isLocked) {
      setFeedback({ type: "error", message: "Admin role cannot be deleted." });
      return;
    }
    const assignedUsers = userRows.filter((user) => user.roleId === role.id).length;
    if (assignedUsers > 0) {
      setFeedback({ type: "error", message: "Move assigned users before deleting this role." });
      return;
    }
    setRoleRows((prev) => prev.filter((row) => row.id !== role.id));
    if (editingRoleId === role.id) {
      const fallbackRole = roleRows.find((row) => row.id !== role.id) || initialRoles[0];
      loadRoleIntoEditor(fallbackRole, "view");
    }
    setFeedback({ type: "success", message: "Role deleted successfully." });
  };

  const handleSaveUser = () => {
    setFeedback(null);
    const name = String(userForm.name || "").trim();
    const username = String(userForm.username || "").trim();
    const email = String(userForm.email || "").trim();
    if (!name || !username || !userForm.roleId) {
      setFeedback({ type: "error", message: "User name, username and role are required." });
      return;
    }
    const duplicateUser = userRows.find(
      (user) =>
        user.id !== editingUserId &&
        (String(user.username || "").toLowerCase() === username.toLowerCase() ||
          (email && String(user.email || "").toLowerCase() === email.toLowerCase())),
    );
    if (duplicateUser) {
      setFeedback({ type: "error", message: "Username or email is already in use." });
      return;
    }
    const nextUser = {
      id: editingUserId || `user-${Date.now()}`,
      name,
      username,
      email,
      phone: String(userForm.phone || "").trim(),
      status: userForm.status || "Active",
      roleId: userForm.roleId,
      notes: String(userForm.notes || "").trim(),
      isLocked: false,
    };
    setUserRows((prev) =>
      editingUserId
        ? prev.map((user) => (user.id === editingUserId ? { ...user, ...nextUser } : user))
        : [nextUser, ...prev],
    );
    resetUserEditor();
    setFeedback({
      type: "success",
      message: editingUserId ? "User updated successfully." : "User created successfully.",
    });
  };

  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name || "",
      username: user.username || "",
      email: user.email || "",
      phone: user.phone || "",
      status: user.status || "Active",
      roleId: user.roleId || roleRows[0]?.id || "",
      notes: user.notes || "",
    });
  };

  const handleDeleteUser = (user) => {
    setFeedback(null);
    if (user.isLocked) {
      setFeedback({ type: "error", message: "Admin user is locked and cannot be deleted." });
      return;
    }
    setUserRows((prev) => prev.filter((row) => row.id !== user.id));
    if (editingUserId === user.id) {
      resetUserEditor();
    }
    setFeedback({ type: "success", message: "User deleted successfully." });
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
    const scope = target.closest("form, .module-card, .module-page") || document;
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

  return (
    <section className="module-page" onKeyDown={handleEnterToNextField}>
      <header className="module-header">
        <h3>Settings & Security</h3>
        <span className="module-subtitle">Users, backup, shortcuts and print configuration</span>
      </header>

      {feedback && (
        <div className={feedback.type === "success" ? "alert alert--success" : "alert alert--error"}>
          {feedback.message}
        </div>
      )}

      <ModuleTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === "roles" && (
        <div className="summary-grid">
          <article className="module-card">
            <div className="rbac-head">
              <div>
                <h4>RBAC Setup</h4>
                <p className="module-subtitle">
                  Mock UI for users, roles and permission toggles. Enforcement will be connected later.
                </p>
              </div>
              <div className="rbac-chip">
                <ShieldCheck size={14} />
                Admin always has full access
              </div>
            </div>

            <div className="rbac-steps-grid">
              {rbacSteps.map((step, index) => (
                <div key={step.title} className="rbac-step-card">
                  <span className="rbac-step-card__index">0{index + 1}</span>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>

            <div className="rbac-stats-grid">
              <div className="rbac-stat-card">
                <span>Roles</span>
                <strong>{formatNumber(roleKpis.roles)}</strong>
              </div>
              <div className="rbac-stat-card">
                <span>Active Roles</span>
                <strong>{formatNumber(roleKpis.activeRoles)}</strong>
              </div>
              <div className="rbac-stat-card">
                <span>Users</span>
                <strong>{formatNumber(roleKpis.users)}</strong>
              </div>
              <div className="rbac-stat-card">
                <span>Custom Roles</span>
                <strong>{formatNumber(roleKpis.customRoles)}</strong>
              </div>
            </div>

            <div className="rbac-section-tabs">
              {rbacSections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className={`small-btn small-btn--ghost${activeRbacSection === section.key ? " is-active" : ""}`}
                  onClick={() => setActiveRbacSection(section.key)}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </article>

          {activeRbacSection === "users" && (
            <div className="summary-grid two-wide">
            <form className="module-card form-card">
              <div className="rbac-card-head">
                <div>
                  <h4>{editingUserId ? "Edit User" : "Add User"}</h4>
                  <p className="module-subtitle">Create users with role assignment. Access checks will be connected later.</p>
                </div>
                <button type="button" className="small-btn small-btn--ghost" onClick={resetUserEditor}>
                  <Plus size={13} /> New User
                </button>
              </div>
              <div className="form-grid two-wide">
                <label>
                  Full Name
                  <input
                    type="text"
                    value={userForm.name}
                    onChange={(event) => handleUserFormChange("name", event.target.value)}
                    placeholder="Muhammad Ali"
                  />
                </label>
                <label>
                  Username
                  <input
                    type="text"
                    value={userForm.username}
                    onChange={(event) => handleUserFormChange("username", event.target.value)}
                    placeholder="mali"
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(event) => handleUserFormChange("email", event.target.value)}
                    placeholder="user@china-bedsheet.com"
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="text"
                    value={userForm.phone}
                    onChange={(event) => handleUserFormChange("phone", event.target.value)}
                    placeholder="03xx-xxxxxxx"
                  />
                </label>
                <label>
                  Role
                  <select value={userForm.roleId} onChange={(event) => handleUserFormChange("roleId", event.target.value)}>
                    {roleRows.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={userForm.status} onChange={(event) => handleUserFormChange("status", event.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
                <label className="form-grid-span-2">
                  Notes
                  <input
                    type="text"
                    value={userForm.notes}
                    onChange={(event) => handleUserFormChange("notes", event.target.value)}
                    placeholder="Optional note for this user"
                  />
                </label>
              </div>
              <div className="inline-actions">
                <button type="button" onClick={handleSaveUser}>
                  <UserCog size={14} /> {editingUserId ? "Update User" : "Save User"}
                </button>
                <button type="button" className="small-btn small-btn--ghost" onClick={resetUserEditor}>
                  Clear
                </button>
              </div>
            </form>

            <article className="module-card">
              <div className="rbac-card-head">
                <div>
                  <h4>Users</h4>
                  <p className="module-subtitle">Quick user list for review, edit and cleanup.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRows.map((user) => {
                      const role = rolesById[user.roleId];
                      return (
                        <tr key={user.id}>
                          <td>
                            <div className="rbac-name-cell">
                              <strong>
                                {user.name}{" "}
                                {user.isLocked ? (
                                  <span className="rbac-inline-badge">
                                    <Lock size={11} /> Admin
                                  </span>
                                ) : null}
                              </strong>
                              <span>{user.email || user.username}</span>
                            </div>
                          </td>
                          <td>{user.username || "-"}</td>
                          <td>{role?.name || "-"}</td>
                          <td>
                            <span
                              className={
                                user.status === "Active"
                                  ? "status-pill status-pill--active"
                                  : "status-pill status-pill--inactive"
                              }
                            >
                              {user.status}
                            </span>
                          </td>
                          <td>
                            <div className="rbac-actions">
                              <button type="button" className="small-btn small-btn--ghost" onClick={() => handleEditUser(user)}>
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                className="small-btn small-btn--danger"
                                disabled={user.isLocked}
                                onClick={() => handleDeleteUser(user)}
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
            </div>
          )}

          {activeRbacSection === "roles" && (
            <div className="summary-grid two-wide">
            <form className="module-card form-card">
              <div className="rbac-card-head">
                <div>
                  <h4>
                    {roleEditorMode === "create" ? "Create Role" : roleEditorMode === "edit" ? "Edit Role" : "View Role"}
                  </h4>
                  <p className="module-subtitle">
                    Build role rules module-wise. Admin remains locked with all permissions enabled.
                  </p>
                </div>
                <div className="rbac-card-actions">
                  <button type="button" className="small-btn small-btn--ghost" onClick={resetRoleEditor}>
                    <Plus size={13} /> New Role
                  </button>
                  {selectedRoleIsLocked ? (
                    <span className="rbac-chip rbac-chip--locked">
                      <Lock size={13} /> Locked
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="rbac-editor-kpis">
                <div className="rbac-editor-kpi">
                  <span>Assigned Users</span>
                  <strong>{formatNumber(selectedRoleUsersCount)}</strong>
                </div>
                <div className="rbac-editor-kpi">
                  <span>Enabled Permissions</span>
                  <strong>
                    {formatNumber(activePermissionCount)} / {formatNumber(totalPermissionCount)}
                  </strong>
                </div>
              </div>

              <div className="form-grid two-wide">
                <label>
                  Role Name
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(event) => handleRoleFormChange("name", event.target.value)}
                    placeholder="Sales Executive"
                    disabled={selectedRoleIsLocked || roleEditorMode === "view"}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={roleForm.status}
                    onChange={(event) => handleRoleFormChange("status", event.target.value)}
                    disabled={selectedRoleIsLocked || roleEditorMode === "view"}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
                <label className="form-grid-span-2">
                  Description
                  <input
                    type="text"
                    value={roleForm.description}
                    onChange={(event) => handleRoleFormChange("description", event.target.value)}
                    placeholder="What this role is meant to do"
                    disabled={selectedRoleIsLocked || roleEditorMode === "view"}
                  />
                </label>
              </div>

              <div className="rbac-permission-head">
                <div>
                  <strong>Permissions</strong>
                  <span>{formatNumber(activePermissionCount)} / {formatNumber(totalPermissionCount)} enabled</span>
                </div>
                {roleEditorMode !== "view" && !selectedRoleIsLocked ? (
                  <div className="rbac-actions">
                    <button
                      type="button"
                      className="small-btn small-btn--ghost"
                      onClick={() => setRoleForm((prev) => ({ ...prev, permissions: createPermissionState(true) }))}
                    >
                      Enable All
                    </button>
                    <button
                      type="button"
                      className="small-btn small-btn--ghost"
                      onClick={() => setRoleForm((prev) => ({ ...prev, permissions: createPermissionState(false) }))}
                    >
                      Clear All
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="rbac-permission-grid">
                {permissionGroups.map((group) => {
                  const enabledInGroup = group.permissions.filter((permission) => roleForm.permissions?.[permission.key]).length;
                  return (
                    <section key={group.key} className="rbac-permission-card">
                      <div className="rbac-permission-card__head">
                        <div>
                          <strong>{group.label}</strong>
                          <span>
                            {enabledInGroup}/{group.permissions.length} selected
                          </span>
                        </div>
                        {roleEditorMode !== "view" && !selectedRoleIsLocked ? (
                          <div className="rbac-actions">
                            <button
                              type="button"
                              className="small-btn small-btn--ghost"
                              onClick={() => handlePermissionGroupToggle(group, true)}
                            >
                              All
                            </button>
                            <button
                              type="button"
                              className="small-btn small-btn--ghost"
                              onClick={() => handlePermissionGroupToggle(group, false)}
                            >
                              None
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="rbac-toggle-list">
                        {group.permissions.map((permission) => (
                          <label key={permission.key} className="rbac-toggle-row">
                            <span>{permission.label}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(roleForm.permissions?.[permission.key])}
                              onChange={() => handlePermissionToggle(permission.key)}
                              disabled={selectedRoleIsLocked || roleEditorMode === "view"}
                            />
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>

              {selectedRoleIsLocked ? (
                <div className="hint-line">Admin role is system protected. Permissions can be viewed but not changed.</div>
              ) : null}

              <div className="inline-actions">
                <button
                  type="button"
                  onClick={handleSaveRole}
                  disabled={selectedRoleIsLocked || roleEditorMode === "view"}
                >
                  <ShieldCheck size={14} /> {roleEditorMode === "create" ? "Save Role" : "Update Role"}
                </button>
                {roleEditorMode === "view" && selectedRole ? (
                  <button
                    type="button"
                    className="small-btn small-btn--ghost"
                    disabled={selectedRoleIsLocked}
                    onClick={() => loadRoleIntoEditor(selectedRole, "edit")}
                  >
                    <Pencil size={13} /> Edit Role
                  </button>
                ) : null}
              </div>
            </form>

            <article className="module-card">
              <div className="rbac-card-head">
                <div>
                  <h4>Roles & Permissions</h4>
                  <p className="module-subtitle">View, edit or remove roles. Admin stays read-only.</p>
                </div>
              </div>
              <div className="rbac-role-stack">
                {roleRows.map((role) => {
                  const enabledPermissions = Object.values(role.permissions || {}).filter(Boolean).length;
                  const assignedUsers = userRows.filter((user) => user.roleId === role.id).length;
                  const isSelected = editingRoleId === role.id;
                  const permissionFill = totalPermissionCount > 0 ? Math.round((enabledPermissions / totalPermissionCount) * 100) : 0;
                  return (
                    <article key={role.id} className={`rbac-role-card${isSelected ? " rbac-role-card--selected" : ""}`}>
                      <div className="rbac-role-card__head">
                        <div>
                          <div className="rbac-role-title-row">
                            <strong>{role.name}</strong>
                            {role.isLocked ? (
                              <span className="rbac-chip rbac-chip--locked">
                                <Lock size={12} /> System
                              </span>
                            ) : null}
                          </div>
                          <p>{role.description || "No description yet."}</p>
                        </div>
                        <span
                          className={
                            role.status === "Active"
                              ? "status-pill status-pill--active"
                              : "status-pill status-pill--inactive"
                          }
                        >
                          {role.status}
                        </span>
                      </div>
                      <div className="rbac-role-meta">
                        <span>{formatNumber(enabledPermissions)} permissions</span>
                        <span>{formatNumber(assignedUsers)} users</span>
                      </div>
                      <div className="rbac-progress">
                        <div className="rbac-progress__bar" style={{ width: `${permissionFill}%` }} />
                      </div>
                      <div className="rbac-actions">
                        <button type="button" className="small-btn small-btn--ghost" onClick={() => loadRoleIntoEditor(role, "view")}>
                          <Eye size={13} /> View
                        </button>
                        <button
                          type="button"
                          className="small-btn small-btn--ghost"
                          disabled={role.isLocked}
                          onClick={() => loadRoleIntoEditor(role, "edit")}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="small-btn small-btn--danger"
                          disabled={role.isLocked}
                          onClick={() => handleDeleteRole(role)}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
            </div>
          )}

          {activeRbacSection === "overview" && (
            <div className="summary-grid two-wide">
              <article className="module-card">
                <div className="rbac-card-head">
                  <div>
                    <h4>Users Snapshot</h4>
                    <p className="module-subtitle">Quick summary for mobile-friendly review.</p>
                  </div>
                  <button
                    type="button"
                    className="small-btn small-btn--ghost"
                    onClick={() => setActiveRbacSection("users")}
                  >
                    Open Users
                  </button>
                </div>
                <div className="rbac-overview-list">
                  {userRows.slice(0, 4).map((user) => (
                    <div key={user.id} className="rbac-overview-item">
                      <div>
                        <strong>{user.name}</strong>
                        <span>{rolesById[user.roleId]?.name || "-"}</span>
                      </div>
                      <span
                        className={
                          user.status === "Active"
                            ? "status-pill status-pill--active"
                            : "status-pill status-pill--inactive"
                        }
                      >
                        {user.status}
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="module-card">
                <div className="rbac-card-head">
                  <div>
                    <h4>Roles Snapshot</h4>
                    <p className="module-subtitle">Review access structure before opening full editor.</p>
                  </div>
                  <button
                    type="button"
                    className="small-btn small-btn--ghost"
                    onClick={() => setActiveRbacSection("roles")}
                  >
                    Open Roles
                  </button>
                </div>
                <div className="rbac-overview-list">
                  {roleRows.map((role) => (
                    <div key={role.id} className="rbac-overview-item">
                      <div>
                        <strong>{role.name}</strong>
                        <span>{Object.values(role.permissions || {}).filter(Boolean).length} permissions</span>
                      </div>
                      <span
                        className={
                          role.status === "Active"
                            ? "status-pill status-pill--active"
                            : "status-pill status-pill--inactive"
                        }
                      >
                        {role.status}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          )}
        </div>
      )}

      {activeTab === "data" && (
        <div className="summary-grid two-wide">
          <article className="module-card">
            <h4>Data Protection</h4>
            <p className="module-subtitle">Enable, restore and backup settings.</p>
            <div className="inline-actions">
              <button type="button">Enable Backup</button>
              <button type="button" className="small-btn small-btn--ghost">
                Restore
              </button>
            </div>
            <div className="hint-line">Last backup: 02/10/2026 10:45 AM</div>
          </article>
          <article className="module-card">
            <h4>Backup History</h4>
            <ul className="mini-list">
              <li>
                <span>Auto Backup</span>
                <strong>02/10/2026</strong>
              </li>
              <li>
                <span>Manual Backup</span>
                <strong>02/08/2026</strong>
              </li>
              <li>
                <span>Manual Backup</span>
                <strong>02/01/2026</strong>
              </li>
            </ul>
          </article>
        </div>
      )}

      {activeTab === "shortcuts" && (
        <div className="summary-grid two-wide">
          <article className="module-card">
            <h4>Efficiency Tools</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shortcuts.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key}</td>
                      <td>{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <form className="module-card form-card">
            <h4>Add Shortcut</h4>
            <label>
              Key
              <input type="text" placeholder="F4" />
            </label>
            <label>
              Action
              <input type="text" placeholder="Open Reports" />
            </label>
            <button type="button">Save Shortcut</button>
          </form>
        </div>
      )}

      {activeTab === "print" && (
        <div className="summary-grid two-wide">
          <article className="module-card form-card">
            <h4>Print Configuration</h4>
            <label>
              Printer Type
              <select defaultValue="Thermal">
                <option value="Thermal">Thermal</option>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </select>
            </label>
            <label>
              Header/Footer
              <input type="text" placeholder="Company header" />
            </label>
            <button type="button">Save Settings</button>
          </article>
          <article className="module-card">
            <h4>Print Preview</h4>
            <div className="print-preview">
              <div className="print-preview__line" />
              <div className="print-preview__line" />
              <div className="print-preview__line" />
              <div className="print-preview__line print-preview__line--short" />
            </div>
          </article>
        </div>
      )}

      {activeTab === "stock" && (
        <div className="summary-grid">
          <article className="module-card form-card">
            <h4>New Stock Adjustment</h4>
            <label>
              Date
              <input type="date" value={stockDate} onChange={(event) => setStockDate(event.target.value)} />
            </label>
            <label>
              Item
              <input
                list="settings-stock-item-list"
                value={selectedItemNameInput}
                onChange={(event) => {
                  const typed = String(event.target.value || "").trim().toLowerCase();
                  setSelectedItemNameInput(event.target.value);
                  const match = items.find((item) => String(item?.name || "").trim().toLowerCase() === typed);
                  setSelectedItemId(match ? String(match.id) : "");
                }}
                placeholder="Type exact item name..."
              />
              <datalist id="settings-stock-item-list">
                {items.map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
            </label>
            <label>
              Current Stock
              <input type="text" value={selectedItem ? formatNumber(selectedItem.currentStock) : "-"} readOnly />
            </label>
            <label>
              New Stock
              <input
                type="number"
                value={selectedNewStock}
                onChange={(event) => setSelectedNewStock(event.target.value)}
                placeholder="Enter new stock"
              />
            </label>
            <label>
              Reason
              <input
                type="text"
                value={selectedReason}
                onChange={(event) => setSelectedReason(event.target.value)}
                placeholder="Stock check, damage, correction..."
              />
            </label>
            <button type="button" onClick={handleCreateSelectedAdjustment} disabled={createAdjustmentMutation.isPending}>
              {createAdjustmentMutation.isPending ? "Saving..." : "Save Stock Adjustment"}
            </button>
          </article>

          <article className="module-card">
            <h4>Stock Report</h4>
            <div className="inline-actions" style={{ marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Search item/barcode..."
                value={stockSearch}
                onChange={(event) => setStockSearch(event.target.value)}
              />
              <select value={stockCategoryFilter} onChange={(event) => setStockCategoryFilter(event.target.value)}>
                <option value="all">All Categories</option>
                {categoryOptions.map((categoryName) => (
                  <option key={categoryName} value={categoryName}>
                    {categoryName}
                  </option>
                ))}
              </select>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={negativeOnly}
                  onChange={(event) => setNegativeOnly(event.target.checked)}
                />
                Less than 0 stock
              </label>
              <button type="button" className="small-btn small-btn--ghost" onClick={handleExportStockReport}>
                <Download size={14} /> Export in Excel
              </button>
              <button
                type="button"
                className="small-btn small-btn--ghost"
                onClick={() => stockImportRef.current?.click()}
                disabled={importingStock}
              >
                <Upload size={14} /> {importingStock ? "Importing..." : "Import from Excel"}
              </button>
              <input
                ref={stockImportRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleImportStockFromExcel(file);
                  }
                  event.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SR#</th>
                    <th>Barcode</th>
                    <th>Item Name</th>
                    <th>Current Stock</th>
                    <th>New Stock</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockRows.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.barcode || "-"}</td>
                      <td>{item.name}</td>
                      <td>{formatNumber(item.currentStock)}</td>
                      <td>
                        <input
                          type="number"
                          value={rowNewStockDrafts[item.id] ?? ""}
                          onChange={(event) => handleRowDraftChange(item.id, event.target.value)}
                          placeholder="New stock"
                          style={{ minWidth: 110 }}
                        />
                      </td>
                      <td>
                        <button type="button" className="small-btn" onClick={() => handleSaveRowAdjustment(item)}>
                          Apply
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredStockRows.length === 0 && (
                    <tr>
                      <td colSpan="6">No stock rows found for current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="module-card">
            <h4>Stock Adjustment & Audit List</h4>
            <p className="module-subtitle">Date-wise audit from inventory-connected stock adjustment logs.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Barcode</th>
                    <th>Item Name</th>
                    <th>Qty Change</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdjustments.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "-"}</td>
                      <td>{entry.item?.barcode || "-"}</td>
                      <td>{entry.item?.name || "-"}</td>
                      <td>{formatNumber(entry.quantity)}</td>
                      <td>{entry.reason || "-"}</td>
                    </tr>
                  ))}
                  {filteredAdjustments.length === 0 && (
                    <tr>
                      <td colSpan="5">No stock adjustments recorded on selected date.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

export default PreferencesPage;
