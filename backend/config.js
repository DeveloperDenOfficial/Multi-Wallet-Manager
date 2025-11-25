import dotenv from "dotenv";
dotenv.config();

export const BSC_RPC = process.env.BSC_RPC;
export const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
export const USDT_ADDRESS = process.env.USDT_ADDRESS;
export const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
export const DATABASE_URL = process.env.DATABASE_URL;
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;
export const PRICE_ORACLE_URL = process.env.PRICE_ORACLE_URL || "";
