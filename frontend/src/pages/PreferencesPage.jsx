import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download, Eye, Lock, Pencil, Plus, ShieldCheck, Trash2, Upload, UserCog } from "lucide-react";

import ModuleTabs from "../components/ModuleTabs";
import { inventoryApi, rbacApi } from "../api/modules";
import { extractApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatNumber } from "../utils/format";
import { allPermissionKeys, createPermissionState, permissionGroups } from "../utils/rbac";

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

const createEmptyUserForm = (defaultRoleId = "") => ({
  name: "",
  username: "",
  email: "",
  phone: "",
  status: "Active",
  roleId: defaultRoleId,
  notes: "",
  password: "",
});

const createEmptyRoleForm = () => ({
  name: "",
  description: "",
  status: "Active",
  permissions: createPermissionState(false),
});

function PreferencesPage() {
  const queryClient = useQueryClient();
  const { user, refreshUser, hasPermission } = useAuth();
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
  const [editingRoleId, setEditingRoleId] = useState("");
  const [roleEditorMode, setRoleEditorMode] = useState("view");
  const [activeRbacSection, setActiveRbacSection] = useState("overview");
  const [roleForm, setRoleForm] = useState(() => createEmptyRoleForm());
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState(() => createEmptyUserForm());

  const rbacQuery = useQuery({
    queryKey: ["rbac", "snapshot"],
    queryFn: rbacApi.snapshot,
    enabled: activeTab === "roles",
  });

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
  const roleRows = rbacQuery.data?.roles || [];
  const userRows = rbacQuery.data?.users || [];
  const canManageUsers = hasPermission("settings.users");
  const canManageRoles = hasPermission("settings.roles");
  const canChangePermissions = hasPermission("settings.permissions");
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

  const refreshRbacState = async () => {
    await queryClient.invalidateQueries({ queryKey: ["rbac", "snapshot"] });
    await refreshUser();
  };

  const createRoleMutation = useMutation({
    mutationFn: rbacApi.createRole,
    onSuccess: refreshRbacState,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ roleId, payload }) => rbacApi.updateRole(roleId, payload),
    onSuccess: refreshRbacState,
  });

  const deleteRoleMutation = useMutation({
    mutationFn: rbacApi.deleteRole,
    onSuccess: refreshRbacState,
  });

  const createUserMutation = useMutation({
    mutationFn: rbacApi.createUser,
    onSuccess: refreshRbacState,
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, payload }) => rbacApi.updateUser(userId, payload),
    onSuccess: refreshRbacState,
  });

  const deleteUserMutation = useMutation({
    mutationFn: rbacApi.deleteUser,
    onSuccess: refreshRbacState,
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

  useEffect(() => {
    if (!editingUserId && !userForm.roleId && roleRows.length > 0) {
      setUserForm((prev) => ({
        ...prev,
        roleId: roleRows.find((role) => !role.isLocked)?.id || roleRows[0]?.id || "",
      }));
    }
  }, [editingUserId, roleRows, userForm.roleId]);

  const handleUserFormChange = (field, value) => {
    setUserForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRoleFormChange = (field, value) => {
    if (selectedRoleIsLocked || !canManageRoles) {
      return;
    }
    setRoleForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePermissionToggle = (permissionKey) => {
    if (selectedRoleIsLocked || !canChangePermissions) {
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
    if (selectedRoleIsLocked || !canChangePermissions) {
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

  const handleSaveRole = async () => {
    setFeedback(null);
    if (!canManageRoles || !canChangePermissions) {
      setFeedback({ type: "error", message: "You do not have permission to change roles." });
      return;
    }
    const roleName = String(roleForm.name || "").trim();
    if (!roleName) {
      setFeedback({ type: "error", message: "Role name is required." });
      return;
    }
    if (selectedRoleIsLocked) {
      setFeedback({ type: "error", message: "Admin role is locked and cannot be modified." });
      return;
    }
    const payload = {
      name: roleName,
      description: String(roleForm.description || "").trim(),
      status: roleForm.status || "Active",
      permissions: { ...createPermissionState(false), ...(roleForm.permissions || {}) },
    };
    try {
      const nextRole =
        roleEditorMode === "create"
          ? await createRoleMutation.mutateAsync(payload)
          : await updateRoleMutation.mutateAsync({ roleId: editingRoleId, payload });
      loadRoleIntoEditor(nextRole, "view");
      if (roleEditorMode === "create" && !userForm.roleId) {
        setUserForm((prev) => ({ ...prev, roleId: nextRole.id }));
      }
      setFeedback({
        type: "success",
        message: roleEditorMode === "create" ? "Role created successfully." : "Role updated successfully.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to save role.") });
    }
  };

  const handleDeleteRole = async (role) => {
    setFeedback(null);
    if (!canManageRoles) {
      setFeedback({ type: "error", message: "You do not have permission to delete roles." });
      return;
    }
    if (role.isLocked) {
      setFeedback({ type: "error", message: "Admin role cannot be deleted." });
      return;
    }
    try {
      await deleteRoleMutation.mutateAsync(role.id);
      if (editingRoleId === role.id) {
        setEditingRoleId("");
        setRoleEditorMode("create");
        setRoleForm(createEmptyRoleForm());
      }
      setFeedback({ type: "success", message: "Role deleted successfully." });
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to delete role.") });
    }
  };

  const handleSaveUser = async () => {
    setFeedback(null);
    if (!canManageUsers) {
      setFeedback({ type: "error", message: "You do not have permission to manage users." });
      return;
    }
    const name = String(userForm.name || "").trim();
    const email = String(userForm.email || "").trim().toLowerCase();
    if (!name || !email || !userForm.roleId) {
      setFeedback({ type: "error", message: "User name, email and role are required." });
      return;
    }
    if (!editingUserId && !String(userForm.password || "")) {
      setFeedback({ type: "error", message: "Password is required for new user." });
      return;
    }
    const payload = {
      name,
      username: String(userForm.username || "").trim(),
      email,
      phone: String(userForm.phone || "").trim(),
      status: userForm.status || "Active",
      roleId: userForm.roleId,
      notes: String(userForm.notes || "").trim(),
      password: String(userForm.password || ""),
    };
    try {
      if (editingUserId) {
        await updateUserMutation.mutateAsync({ userId: editingUserId, payload });
      } else {
        await createUserMutation.mutateAsync(payload);
      }
      resetUserEditor();
      setFeedback({
        type: "success",
        message: editingUserId ? "User updated successfully." : "User created successfully.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to save user.") });
    }
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
      password: "",
    });
  };

  const handleDeleteUser = async (targetUser) => {
    setFeedback(null);
    if (!canManageUsers) {
      setFeedback({ type: "error", message: "You do not have permission to delete users." });
      return;
    }
    if (targetUser.isLocked) {
      setFeedback({ type: "error", message: "Admin user is locked and cannot be deleted." });
      return;
    }
    try {
      await deleteUserMutation.mutateAsync(targetUser.id);
      if (editingUserId === targetUser.id) {
        resetUserEditor();
      }
      if (Number(user?.id || 0) === Number(targetUser.id || 0)) {
        await refreshUser();
      }
      setFeedback({ type: "success", message: "User deleted successfully." });
    } catch (error) {
      setFeedback({ type: "error", message: extractApiError(error, "Failed to delete user.") });
    }
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
                  Manage live users, roles and permission toggles. Admin remains system protected.
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
            {rbacQuery.isLoading ? <div className="hint-line">Loading roles and users...</div> : null}
            {rbacQuery.isError ? (
              <div className="hint-line">Failed to load RBAC data. Please refresh this page.</div>
            ) : null}
          </article>

          {activeRbacSection === "users" && (
            <div className="summary-grid two-wide">
            <form className="module-card form-card">
              <div className="rbac-card-head">
                <div>
                  <h4>{editingUserId ? "Edit User" : "Add User"}</h4>
                  <p className="module-subtitle">Create users, assign roles and keep access under control.</p>
                </div>
                <button type="button" className="small-btn small-btn--ghost" onClick={resetUserEditor} disabled={!canManageUsers}>
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
                    disabled={!canManageUsers}
                  />
                </label>
                <label>
                  Username
                  <input
                    type="text"
                    value={userForm.username}
                    onChange={(event) => handleUserFormChange("username", event.target.value)}
                    placeholder="mali"
                    disabled={!canManageUsers}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(event) => handleUserFormChange("email", event.target.value)}
                    placeholder="user@china-bedsheet.com"
                    disabled={!canManageUsers}
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="text"
                    value={userForm.phone}
                    onChange={(event) => handleUserFormChange("phone", event.target.value)}
                    placeholder="03xx-xxxxxxx"
                    disabled={!canManageUsers}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(event) => handleUserFormChange("password", event.target.value)}
                    placeholder={editingUserId ? "Leave blank to keep current password" : "Create password"}
                    disabled={!canManageUsers}
                  />
                </label>
                <label>
                  Role
                  <select
                    value={userForm.roleId}
                    onChange={(event) => handleUserFormChange("roleId", event.target.value)}
                    disabled={!canManageUsers}
                  >
                    {roleRows.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={userForm.status}
                    onChange={(event) => handleUserFormChange("status", event.target.value)}
                    disabled={!canManageUsers}
                  >
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
                    disabled={!canManageUsers}
                  />
                </label>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={handleSaveUser}
                  disabled={!canManageUsers || createUserMutation.isPending || updateUserMutation.isPending}
                >
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
                              <button
                                type="button"
                                className="small-btn small-btn--ghost"
                                disabled={!canManageUsers}
                                onClick={() => handleEditUser(user)}
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                className="small-btn small-btn--danger"
                                disabled={user.isLocked || !canManageUsers || deleteUserMutation.isPending}
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
                  <button type="button" className="small-btn small-btn--ghost" onClick={resetRoleEditor} disabled={!canManageRoles}>
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
                    disabled={selectedRoleIsLocked || roleEditorMode === "view" || !canManageRoles}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={roleForm.status}
                    onChange={(event) => handleRoleFormChange("status", event.target.value)}
                    disabled={selectedRoleIsLocked || roleEditorMode === "view" || !canManageRoles}
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
                    disabled={selectedRoleIsLocked || roleEditorMode === "view" || !canManageRoles}
                  />
                </label>
              </div>

              <div className="rbac-permission-head">
                <div>
                  <strong>Permissions</strong>
                  <span>{formatNumber(activePermissionCount)} / {formatNumber(totalPermissionCount)} enabled</span>
                </div>
                {roleEditorMode !== "view" && !selectedRoleIsLocked && canChangePermissions ? (
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
                              disabled={selectedRoleIsLocked || roleEditorMode === "view" || !canChangePermissions}
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
                  disabled={
                    selectedRoleIsLocked ||
                    roleEditorMode === "view" ||
                    !canManageRoles ||
                    !canChangePermissions ||
                    createRoleMutation.isPending ||
                    updateRoleMutation.isPending
                  }
                >
                  <ShieldCheck size={14} /> {roleEditorMode === "create" ? "Save Role" : "Update Role"}
                </button>
                {roleEditorMode === "view" && selectedRole ? (
                  <button
                    type="button"
                    className="small-btn small-btn--ghost"
                    disabled={selectedRoleIsLocked || !canManageRoles}
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
                          disabled={role.isLocked || !canManageRoles}
                          onClick={() => loadRoleIntoEditor(role, "edit")}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="small-btn small-btn--danger"
                          disabled={role.isLocked || !canManageRoles || deleteRoleMutation.isPending}
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
