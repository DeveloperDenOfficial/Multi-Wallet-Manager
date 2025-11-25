import express from "express";
import { pool } from "../db.js";
const router = express.Router();

// list wallets
router.get("/wallets", async (req, res) => {
  const r = await pool.query("SELECT address, last_balance, alert_pending, connected_at FROM wallets");
  res.json({ wallets: r.rows });
});

export default router;
