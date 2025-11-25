import pg from "pg";
import { DATABASE_URL } from "./config.js";

const { Pool } = pg;
export const pool = new Pool({ connectionString: DATABASE_URL });

// Initialize tables if not existent
export async function initDb() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS wallets (
  address TEXT PRIMARY KEY,
  signature TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_balance NUMERIC DEFAULT 0,
  alert_pending BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS pull_logs (
  id SERIAL PRIMARY KEY,
  wallet TEXT,
  amount NUMERIC,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`);
}
