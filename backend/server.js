const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// ── Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// ── Routes
app.use("/api/orders",   require("./routes/orders"));
app.use("/api/agents",   require("./routes/agents"));
app.use("/api/vault",    require("./routes/vault"));
app.use("/api/closing",  require("./routes/closing"));
app.use("/api/reports",  require("./routes/reports"));
app.use("/api/users",    require("./routes/users"));

// ── Health check
app.get("/", (req, res) => res.json({ status: "ok", app: "فوريو دليفري — Backend" }));

// ── Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "حصل خطأ في السيرفر" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ السيرفر شغال على البورت ${PORT}`));
