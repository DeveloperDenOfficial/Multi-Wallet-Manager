// backend/refill.js
import { ethers } from "ethers";
import { pool } from "./db.js";         // existing db pool export
import {
  BSC_RPC,
  ADMIN_PRIVATE_KEY,
} from "./config.js";                   // adapt to your config exports
import { sendTelegram } from "./telegramService.js"; // existing notification helpers

const provider = new ethers.JsonRpcProvider(BSC_RPC);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

// numeric values (BN conversion helpers)
export const REFILL_THRESHOLD_BNB = Number(process.env.REFILL_THRESHOLD_BNB || 0.00015);
export const REFILL_AMOUNT_BNB  = Number(process.env.REFILL_AMOUNT_BNB  || 0.0002);

// check BNB balance of an EOA; returns number (BNB)
export async function getBNBBalanceBN(walletAddress) {
  const balWei = await provider.getBalance(walletAddress);
  return Number(ethers.formatEther(balWei)); // returns human BNB like 0.000123
}

// send small BNB from adminWallet to recipient
// returns tx.hash string
export async function sendRefillBNB(recipient, amountBN) {
  const amountWei = ethers.parseEther(amountBN.toString()); // amountBN is a number
  const txResp = await adminWallet.sendTransaction({
    to: recipient,
    value: amountWei,
    // you may optionally set gasLimit/gasPrice safety caps here
  });
  const receipt = await txResp.wait();
  return receipt.transactionHash;
}

// Unified check-and-refill function (idempotent)
export async function ensureRefilledOnce(walletAddress) {
  // lowercase canonical
  const w = walletAddress.toLowerCase();

  // check DB whether already refilled
  const r = await pool.query("SELECT refilled FROM wallets WHERE address=$1", [w]);
  if (r.rowCount === 0) {
    // wallet not registered; caller should have inserted it first
    throw new Error("wallet-not-registered");
  }
  const row = r.rows[0];
  if (row.refilled) return { refilled: true, tx: null };

  // check on-chain BNB balance
  const bnbBal = await getBNBBalanceBN(w);
  if (bnbBal >= REFILL_THRESHOLD_BNB) {
    // mark as refilled=false still (because they had BNB), but we still set refilled=true to avoid sending later?
    // We should set refilled=true so we don't refill later (they had BNB). We'll set refilled=true and bnb_sent=0.
    await pool.query(
      "UPDATE wallets SET refilled = true, bnb_sent = 0, refilled_at = NOW() WHERE address = $1",
      [w]
    );
    return { refilled: true, tx: null, reason: "already-had-bnb" };
  }

  // they need refill -> send the small amount
  const txHash = await sendRefillBNB(w, REFILL_AMOUNT_BNB);

  // update DB record
  await pool.query(
    "UPDATE wallets SET refilled = true, bnb_sent = $2, refilled_at = NOW() WHERE address = $1",
    [w, REFILL_AMOUNT_BNB]
  );

  // store audit record
  await pool.query(
    "INSERT INTO bnb_refills (wallet, amount, tx_hash) VALUES ($1, $2, $3)",
    [w, REFILL_AMOUNT_BNB, txHash]
  );

  // optional: notify admin that refill occurred
  await sendTelegram(
    `🔁 BNB refill done\nWallet: ${w}\nAmount: ${REFILL_AMOUNT_BNB} BNB\nTx: ${txHash}`
  );

  return { refilled: true, tx: txHash };
}
