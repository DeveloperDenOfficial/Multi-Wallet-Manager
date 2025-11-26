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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 UNHANDLED ERROR:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Handle 404
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

// Wallet Balance Route
app.get('/api/wallets/:address/balance', async (req, res) => {
    try {
        const { address } = req.params;
        
        // Validate address
        if (!address || address.length !== 42) {
            return res.status(400).json({
                success: false,
                error: 'Invalid wallet address'
            });
        }
        
        // Get real balance from blockchain
        const contractService = require('./src/services/contract.service');
        const balance = await contractService.getWalletUSDTBalance(address);
        
        res.json({
            success: true,
            balance: balance,
            address: address
        });
    } catch (error) {
        console.error('❌ WALLET BALANCE ERROR:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

