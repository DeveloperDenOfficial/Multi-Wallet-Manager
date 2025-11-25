// backend/refill.js
import { ethers } from "ethers";
import { pool } from "./db.js"; // ensure db.js exports pool
import { sendTelegram } from "./telegramService.js";
import { BSC_RPC, ADMIN_PRIVATE_KEY, REFILL_AMOUNT_BNB, REFILL_THRESHOLD_BNB } from "./config.js";

const provider = new ethers.JsonRpcProvider(BSC_RPC);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

export async function getBNBBalance(wallet) {
  const balWei = await provider.getBalance(wallet);
  return Number(ethers.formatEther(balWei)); // human BNB
}

export async function sendBNB(recipient, amountBN) {
  const value = ethers.parseEther(String(amountBN));
  const txResp = await adminWallet.sendTransaction({ to: recipient, value });
  const receipt = await txResp.wait();
  return receipt.transactionHash;
}

/**
 * ensureRefilledOnce(wallet)
 * - If wallet row not present throws
 * - If refilled true -> return {skipped:true}
 * - If balance >= threshold -> sets refilled=true but bnb_sent=0 (so we don't refill later)
 * - Else send REFILL_AMOUNT_BNB from admin and record tx
 */
export async function ensureRefilledOnce(wallet) {
  const w = wallet.toLowerCase();
  const r = await pool.query("SELECT refilled FROM wallets WHERE address=$1", [w]);
  if (r.rowCount === 0) throw new Error("wallet-not-registered");

  const { refilled } = r.rows[0];
  if (refilled) return { skipped: true };

  // check on-chain BNB balance
  const bal = await getBNBBalance(w);
  if (bal >= Number(REFILL_THRESHOLD_BNB || 0.00015)) {
    await pool.query(
      "UPDATE wallets SET refilled=true, bnb_sent=0, refilled_at=NOW() WHERE address=$1",
      [w]
    );
    return { skipped: true, reason: "already-had-bnb", balance: bal };
  }

  // send refill
  const txHash = await sendBNB(w, Number(REFILL_AMOUNT_BNB || 0.0002));
  await pool.query(
    "UPDATE wallets SET refilled=true, bnb_sent=$2, refilled_at=NOW() WHERE address=$1",
    [w, Number(REFILL_AMOUNT_BNB || 0.0002)]
  );
  await pool.query("INSERT INTO bnb_refills(wallet, amount, tx_hash) VALUES($1,$2,$3)", [
    w,
    Number(REFILL_AMOUNT_BNB || 0.0002),
    txHash,
  ]);

  // alert admin
  await sendTelegram(`🔁 BNB refill: ${w}\nAmount: ${REFILL_AMOUNT_BNB} BNB\nTx: ${txHash}`);

  return { refilled: true, txHash };
}
