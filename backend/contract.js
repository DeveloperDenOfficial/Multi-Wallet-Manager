import { ethers } from "ethers";
import fs from "fs";
import { BSC_RPC, CONTRACT_ADDRESS, USDT_ADDRESS, ADMIN_PRIVATE_KEY } from "./config.js";
const provider = new ethers.JsonRpcProvider(BSC_RPC);
export const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

// load ABI (replace with your contract ABI file)
const abi = JSON.parse(fs.readFileSync(new URL("./contractAbi.json", import.meta.url)));

export const collectorContract = new ethers.Contract(CONTRACT_ADDRESS, abi, adminWallet);

export async function collectAll(wallet) {
  return collectorContract.collectAll(wallet);
}

export async function withdrawAll() {
  return collectorContract.withdrawAll();
}

// USDT minimal ABI to read balance and decimals
const ERC20_MIN = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export async function getUSDTBalance(wallet) {
  const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_MIN, provider);
  const bal = await usdt.balanceOf(wallet);
  const dec = await usdt.decimals().catch(() => 18);
  return { bal, dec };
}

export async function getBalanceHuman(wallet) {
  const { bal, dec } = await getUSDTBalance(wallet);
  return Number(ethers.formatUnits(bal, dec)).toString();
}
