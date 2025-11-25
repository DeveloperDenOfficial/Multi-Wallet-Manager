import cron from "node-cron";
import { pool } from "./db.js";
import { getBalance } from "./usdtService.js";
import { sendBalanceAlert } from "./telegramService.js";

// Threshold in token units (USDT) — use numeric compare with decimals handled in getBalance
const THRESHOLD = 10n; // we treat as raw units if token decimals are 0 for simplicity
// Note: getBalance returns BigInt. USDT decimals on your token: adjust conversion as needed when formatting.

export function startCron() {
  // Every 6 hours at minute 0
  cron.schedule("0 */6 * * *", async () => {
    try {
      const r = await pool.query("SELECT address FROM wallets");
      for (const row of r.rows) {
        const wallet = row.address;
        try {
          const bal = await getBalance(wallet); // BigInt
          // Convert to units depending on decimals; assume USDT uses 6 decimals.
          // For check > $10 we'll convert to human float below (simple threshold)
          // We'll assume 6 decimals:
          const decimals = 6n;
          const human = Number(bal / (10n ** decimals));
          if (human >= 10) {
            await sendBalanceAlert(wallet, `${human} USDT`);
            await pool.query("UPDATE wallets SET alert_pending = true WHERE address = $1", [wallet]);
          }
        } catch (e) {
          console.error("balance check error", e);
        }
      }
    } catch (e) {
      console.error("cron error", e);
    }
  });
}
for (const row of rows) {
  const wallet = row.address;
  // first ensure refill-once is handled
  try {
    await ensureRefilledOnce(wallet);
  } catch(e) {
    console.error("refill during cron failed", e);
  }
  // now proceed to balance check and send USDT alerts as before
  const bal = await getBalance(wallet);
  if (bal >= USDT_THRESHOLD_RAW) {
    // send alert
  }
}

