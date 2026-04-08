import { api } from "./client";

const withData = (response) => response.data.data;

export const inventoryApi = {
  listCategories: async () => withData(await api.get("/inventory/categories")),
  createCategory: async (payload) => withData(await api.post("/inventory/categories", payload)),
  listUnits: async () => withData(await api.get("/inventory/units")),
  createUnit: async (payload) => withData(await api.post("/inventory/units", payload)),
  listItems: async () => withData(await api.get("/inventory/items")),
  createItem: async (payload) => withData(await api.post("/inventory/items", payload)),
  updateItem: async (itemId, payload) => withData(await api.patch(`/inventory/items/${itemId}`, payload)),
  deleteItem: async (itemId) => withData(await api.delete(`/inventory/items/${itemId}`)),
  updateItemPricing: async (itemId, payload) =>
    withData(await api.patch(`/inventory/items/${itemId}/pricing`, payload)),
  lowStockAlerts: async () => withData(await api.get("/inventory/alerts/low-stock")),
  expiryAlerts: async (days = 30) =>
    withData(await api.get("/inventory/alerts/expiry", { params: { days } })),
  listStockAdjustments: async () => withData(await api.get("/inventory/stock-adjustments")),
  createStockAdjustment: async (payload) =>
    withData(await api.post("/inventory/stock-adjustments", payload)),
  listVariations: async () => withData(await api.get("/inventory/variations")),
  createVariation: async (payload) => withData(await api.post("/inventory/variations", payload)),
  updateVariation: async (id, payload) => withData(await api.patch(`/inventory/variations/${id}`, payload)),
};

export const purchasesApi = {
  listPurchases: async () => withData(await api.get("/purchases")),
  createPurchase: async (payload) => withData(await api.post("/purchases", payload)),
  updatePurchase: async (purchaseId, payload) =>
    withData(await api.patch(`/purchases/${purchaseId}`, payload)),
};

export const salesApi = {
  listSales: async () => withData(await api.get("/sales")),
  listAudit: async () => withData(await api.get("/sales/audit")),
  createSale: async (payload) => withData(await api.post("/sales", payload)),
  updateSale: async (saleId, payload) => withData(await api.patch(`/sales/${saleId}`, payload)),
  cancelSale: async (saleId, payload) => withData(await api.post(`/sales/${saleId}/cancel`, payload)),
  clearHoldSale: async (saleRef, payload) =>
    withData(await api.patch(`/sales/${saleRef}/clear-hold`, payload)),
};

export const accountsApi = {
  listBanks: async () => withData(await api.get("/accounts/banks")),
  bankHistory: async (bankId) => withData(await api.get(`/accounts/banks/${bankId}/history`)),
  createBank: async (payload) => withData(await api.post("/accounts/banks", payload)),
  updateBank: async (bankId, payload) => withData(await api.patch(`/accounts/banks/${bankId}`, payload)),
  createBankTransaction: async (payload) => withData(await api.post("/accounts/banks/transactions", payload)),
};

export const partiesApi = {
  listParties: async (params = {}) => withData(await api.get("/parties", { params })),
  createParty: async (payload) => withData(await api.post("/parties", payload)),
  getPartyById: async (id) => withData(await api.get(`/parties/${id}`)),
  partyHistory: async (id) => withData(await api.get(`/parties/${id}/history`)),
  partyLedger: async (id) => withData(await api.get(`/parties/${id}/ledger`)),
};

export const reportsApi = {
  sales: async (params = {}) => withData(await api.get("/reports/sales", { params })),
  purchases: async (params = {}) => withData(await api.get("/reports/purchases", { params })),
  profit: async (params = {}) => withData(await api.get("/reports/profit", { params })),
  stock: async () => withData(await api.get("/reports/stock")),
  expiry: async (params = {}) => withData(await api.get("/reports/expiry", { params })),
  gst: async (params = {}) => withData(await api.get("/reports/gst", { params })),
  daybook: async (params = {}) => withData(await api.get("/reports/daybook", { params })),
};

export const authApi = {
  setup: async () => withData(await api.get("/auth/setup")),
  signup: async (payload) => withData(await api.post("/auth/signup", payload)),
  login: async (payload) => withData(await api.post("/auth/login", payload)),
  me: async () => withData(await api.get("/auth/me")),
};

export const rbacApi = {
  snapshot: async () => withData(await api.get("/rbac/snapshot")),
  createRole: async (payload) => withData(await api.post("/rbac/roles", payload)),
  updateRole: async (roleId, payload) => withData(await api.patch(`/rbac/roles/${roleId}`, payload)),
  deleteRole: async (roleId) => withData(await api.delete(`/rbac/roles/${roleId}`)),
  createUser: async (payload) => withData(await api.post("/rbac/users", payload)),
  updateUser: async (userId, payload) => withData(await api.patch(`/rbac/users/${userId}`, payload)),
  deleteUser: async (userId) => withData(await api.delete(`/rbac/users/${userId}`)),
};
