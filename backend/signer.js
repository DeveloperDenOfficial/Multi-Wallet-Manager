import { ethers } from "ethers";
import { BSC_RPC, ADMIN_PRIVATE_KEY } from "./config.js";

const provider = new ethers.JsonRpcProvider(BSC_RPC);
export const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

// A helper to send a transaction with safe gas-price cap (adjust if needed)
export async function sendTx(txRequest) {
  // txRequest is prepared contract connect call, e.g. contract.collectAll(wallet)
  const sent = await txRequest;
  const receipt = await sent.wait();
  return receipt;
}
