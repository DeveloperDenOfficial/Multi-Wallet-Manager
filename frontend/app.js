import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.9.0/dist/ethers.esm.min.js";

const backend = (window.__BACKEND_URL__ || "http://localhost:3000");

document.getElementById("connect").onclick = async () => {
  const status = document.getElementById("status");
  try {
    if (!window.ethereum) return alert("Install MetaMask/Wallet");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    status.innerText = "Requesting nonce...";
    const r1 = await fetch(`${backend}/auth/nonce?wallet=${address}`);
    const j1 = await r1.json();
    if (!j1.nonce) throw new Error("nonce failed");

    const signature = await signer.signMessage(j1.nonce);

    // send verification to backend
    status.innerText = "Verifying...";
    const r2 = await fetch(`${backend}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: address, signature })
    });
    const j2 = await r2.json();
    if (!j2.ok) throw new Error(j2.error || "verify failed");

    // notify backend to send Telegram alert (optional)
    await fetch(`${backend}/notify/new-wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: address })
    });

    status.innerText = "Connected — alert sent to admin.";
  } catch (e) {
    console.error(e);
    status.innerText = "Error: " + (e.message || e);
  }
};
