import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { initDb } from "./db-init.js"; // or run db-init.sql via manual migration
import authRoutes from "./routes/auth.js";
import pullRoutes from "./routes/pull.js";
import adminRoutes from "./routes/admin.js"; // optional listing
import { startCron } from "./cronService.js"; // you should have cronService file that checks balances

const app = express();
app.use(express.json());
app.use(cors());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/pull", pullRoutes);
app.use("/admin", adminRoutes);

startCron(); // ensure this file exists and triggers refill + balance checks every 6 hours

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
