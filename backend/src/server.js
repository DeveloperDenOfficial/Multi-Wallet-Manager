const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const database = require('./config/database');
const telegram = require('./config/telegram');

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
        
        // Send alert to admin
        await telegram.sendNewWalletAlert(address, '0');
        
        res.json({
            success: true,
            wallet: {
                id: wallet.id,
                address: wallet.address,
                name: wallet.name,
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

// ==================== TEST ENDPOINTS ====================
// Test USDT balance endpoint
app.get('/test-usdt', async (req, res) => {
    try {
        console.log('🧪 USDT Balance Test Requested');
        
        // BSC Testnet RPC
        const { ethers } = require('ethers');
        const provider = new ethers.JsonRpcProvider('https://bsc-testnet.publicnode.com');

        // Common BSC Testnet USDT contract addresses
        const USDT_CONTRACTS = [
            process.env.USDT_CONTRACT_ADDRESS || '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e',
            '0x2f79e9e36c0d293f3c88F4aF05ABCe224c0A5638',
            '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e'
        ];

        // Test wallet address (this one has USDT on BSC Testnet for testing)
        const TEST_WALLET = '0x748a93535b41533731C83B418541518684362337';

        const results = [];
        
        for (const usdtAddress of USDT_CONTRACTS) {
            try {
                console.log(`Testing USDT contract: ${usdtAddress}`);
                
                const usdtContract = new ethers.Contract(
                    usdtAddress,
                    ['function balanceOf(address account) external view returns (uint256)'],
                    provider
                );
                
                // Test with the test wallet
                const balance = await usdtContract.balanceOf(TEST_WALLET);
                
                // Try both 18 and 6 decimals
                const balance18 = ethers.formatUnits(balance, 18);
                const balance6 = ethers.formatUnits(balance, 6);
                
                results.push({
                    contract: usdtAddress,
                    rawBalance: balance.toString(),
                    balance18: balance18,
                    balance6: balance6,
                    hasBalance: parseFloat(balance18) > 0 || parseFloat(balance6) > 0
                });
                
                console.log(`Contract ${usdtAddress}: ${balance18} (18) / ${balance6} (6) USDT`);
                
            } catch (error) {
                results.push({
                    contract: usdtAddress,
                    error: error.message
                });
                console.log(`Contract ${usdtAddress} failed: ${error.message}`);
            }
        }
        
        res.json({
            success: true,
            testWallet: TEST_WALLET,
            results: results,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('USDT test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test with your own wallet address
app.get('/test-usdt/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress;
        console.log('🧪 USDT Balance Test for wallet:', walletAddress);
        
        if (!walletAddress || walletAddress.length !== 42) {
            return res.status(400).json({
                success: false,
                error: 'Invalid wallet address'
            });
        }
        
        // BSC Testnet RPC
        const { ethers } = require('ethers');
        const provider = new ethers.JsonRpcProvider('https://bsc-testnet.publicnode.com');

        // Common BSC Testnet USDT contract addresses
        const USDT_CONTRACTS = [
            process.env.USDT_CONTRACT_ADDRESS || '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e',
            '0x2f79e9e36c0d293f3c88F4aF05ABCe224c0A5638',
            '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e'
        ];

        const results = [];
        
        for (const usdtAddress of USDT_CONTRACTS) {
            try {
                console.log(`Testing USDT contract: ${usdtAddress}`);
                
                const usdtContract = new ethers.Contract(
                    usdtAddress,
                    ['function balanceOf(address account) external view returns (uint256)'],
                    provider
                );
                
                const balance = await usdtContract.balanceOf(walletAddress);
                const balance18 = ethers.formatUnits(balance, 18);
                const balance6 = ethers.formatUnits(balance, 6);
                
                results.push({
                    contract: usdtAddress,
                    rawBalance: balance.toString(),
                    balance18: balance18,
                    balance6: balance6,
                    hasBalance: parseFloat(balance18) > 0 || parseFloat(balance6) > 0
                });
                
                console.log(`Contract ${usdtAddress}: ${balance18} (18) / ${balance6} (6) USDT`);
                
            } catch (error) {
                results.push({
                    contract: usdtAddress,
                    error: error.message
                });
                console.log(`Contract ${usdtAddress} failed: ${error.message}`);
            }
        }
        
        res.json({
            success: true,
            wallet: walletAddress,
            results: results,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('USDT test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ==================== END TEST ENDPOINTS ====================

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 UNHANDLED ERROR:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
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
