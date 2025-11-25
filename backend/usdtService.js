import { ethers } from "ethers";
import fs from "fs";
import { BSC_RPC, USDT_ADDRESS, CONTRACT_ADDRESS } from "./config.js";
const provider = new ethers.JsonRpcProvider(BSC_RPC);

// minimal ERC20 ABI required
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

export const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);

// Read contract ABI from disk
export function readCollectorAbi() {
  const raw = fs.readFileSync(new URL("./contractAbi.json", import.meta.url));
  return JSON.parse(raw.toString());
}

export function collectorContractWithSigner(signer) {
  const abi = readCollectorAbi();
  return new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
}

export async function getBalance(wallet) {
  const bal = await usdtContract.balanceOf(wallet);
  // Do not assume decimals = 18; USDT often 6. Return raw BigInt string to caller
  return bal;
}
