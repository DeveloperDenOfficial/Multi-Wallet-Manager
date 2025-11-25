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
        telegram: telegram.isInitialized ? 'Connected' : 'Not Connected'
    });
});

// Telegram webhook endpoint - this is what Telegram will call
app.post(`/telegram/${process.env.TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    try {
        console.log('📥 Received Telegram webhook update:', new Date().toISOString());
        console.log('Update body:', JSON.stringify(req.body, null, 2));
        
        // Process the Telegram update
        await telegram.processUpdate(req.body);
        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Error processing Telegram webhook:', error);
        res.status(500).send('Error');
    }
});

// Test endpoint to manually trigger a message
app.get('/test-alert', async (req, res) => {
    try {
        console.log('🧪 Test alert requested');
        if (process.env.ADMIN_CHAT_ID) {
            await telegram.sendWelcomeMessage(process.env.ADMIN_CHAT_ID);
            res.json({ success: true, message: 'Test message sent' });
        } else {
            res.status(400).json({ success: false, error: 'ADMIN_CHAT_ID not set' });
        }
    } catch (error) {
        console.error('❌ Test alert error:', error);
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
        console.error('❌ Bot info error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/wallets/connect', async (req, res) => {
    try {
        const { address, name } = req.body;
        
        console.log('📥 Wallet connection request:', { address, name });
        
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
        
        console.log('💾 Wallet saved to database:', wallet.address);
        
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
        console.error('❌ Wallet connection error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Handle 404
app.use((req, res) => {
    console.log('❓ 404 Not Found:', req.method, req.url);
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Multi Wallet Manager backend running on port ${PORT}`);
    console.log(`📡 Webhook URL: https://your-render-url.onrender.com/telegram/${process.env.TELEGRAM_BOT_TOKEN}`);
    
    // Log environment variables for debugging (masked)
    console.log('🔧 Environment check:');
    console.log('   PORT:', process.env.PORT || 3000);
    console.log('   TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ SET' : '❌ MISSING');
    console.log('   ADMIN_CHAT_ID:', process.env.ADMIN_CHAT_ID ? '✅ SET' : '❌ MISSING');
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
