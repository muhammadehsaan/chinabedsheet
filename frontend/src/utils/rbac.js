export const permissionGroups = [
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
    key: "production",
    label: "Production",
    permissions: [
      { key: "production.view", label: "View production" },
      { key: "production.create", label: "Create production entries" },
      { key: "production.edit", label: "Edit production entries" },
      { key: "production.delete", label: "Delete production entries" },
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

export const allPermissionKeys = permissionGroups.flatMap((group) =>
  group.permissions.map((permission) => permission.key),
);

export const createPermissionState = (fill = false, overrides = {}) =>
  allPermissionKeys.reduce(
    (acc, key) => ({
      ...acc,
      [key]: key in overrides ? Boolean(overrides[key]) : fill,
    }),
    {},
  );

export const normalizePermissions = (permissions = {}, fill = false) =>
  allPermissionKeys.reduce(
    (acc, key) => ({
      ...acc,
      [key]: key in permissions ? Boolean(permissions[key]) : fill,
    }),
    {},
  );

export const modulePermissionMap = {
  dashboard: "dashboard.view",
  inventory: "inventory.view",
  production: "production.view",
  sales: "sales.view",
  purchases: "purchases.view",
  financials: "accounts.view",
  emi: "emi.view",
  reports: "reports.view",
  settings: "settings.view",
};

export const modulePathMap = {
  dashboard: "/dashboard",
  inventory: "/inventory",
  production: "/production",
  sales: "/sales",
  purchases: "/purchases",
  financials: "/financials",
  emi: "/emi",
  reports: "/reports",
  settings: "/settings",
};

export const getFirstAccessiblePath = (permissions = {}) => {
  const moduleKeys = Object.keys(modulePermissionMap);
  const match = moduleKeys.find((key) => permissions?.[modulePermissionMap[key]]);
  return match ? modulePathMap[match] : "/";
};
