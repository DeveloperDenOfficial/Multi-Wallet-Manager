# Multi-Wallet-Manager

Purpose: backend + dApp + Telegram bot to pull USDT from your wallets into a master wallet.

Stack:
- Smart contract: BSC (Collector)
- Backend: Node.js (ethers)
- DB: Neon (Postgres)
- Bot: Telegram (admin)
- Hosting: Render

Quickstart:
1. Set Neon DB and create tables using `backend/db-init.sql`.
2. Add secrets to Render (see `backend/.env.example`).
3. Build and deploy backend and bot via Docker on Render using provided `render.yaml`.
4. Deploy frontend as static site on Render (Vite build).

See `backend/.env.example` for required env vars.

Security:
- ADMIN_PRIVATE_KEY must be stored as a secret.
- Refill is performed once per wallet; admin must monitor bnb_refills.
- Only admin Telegram user may trigger pulls.

