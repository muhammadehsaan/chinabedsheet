const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { errorHandler } = require("./middleware/error");
const inventoryRoutes = require("./routes/inventory");
const purchasesRoutes = require("./routes/purchases");
const salesRoutes = require("./routes/sales");
const partiesRoutes = require("./routes/parties");
const reportsRoutes = require("./routes/reports");
const accountsRoutes = require("./routes/accounts");
const productionRoutes = require("./routes/production");
const emiRoutes = require("./routes/emi");
const logisticsRoutes = require("./routes/logistics");
const authRoutes = require("./routes/auth");

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(morgan("dev"));

app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok", service: "china-bedsheet-erp-backend" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/purchases", purchasesRoutes);
app.use("/api/v1/sales", salesRoutes);
app.use("/api/v1/parties", partiesRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use("/api/v1/accounts", accountsRoutes);
app.use("/api/v1/production", productionRoutes);
app.use("/api/v1/emi", emiRoutes);
app.use("/api/v1/logistics", logisticsRoutes);

app.use(errorHandler);

module.exports = { app };
