// Add this at the top of the file
async connectWallet(req, res) {
    try {
        console.log('=== CONTROLLER: Wallet connection request received ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        // Validate input
        const validation = validators.validateWalletConnection(req.body);
        if (!validation.valid) {
            console.log('Validation failed:', validation.error);
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }
        
        const { address, name } = req.body;
        console.log('Processing wallet:', address, 'Name:', name);
        
        // Save wallet to database
        const query = `
            INSERT INTO wallets (address, name, created_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
            ON CONFLICT (address) DO UPDATE
            SET updated_at = NOW()
            RETURNING *
        `;
        
        console.log('Saving wallet to database...');
        const result = await database.query(query, [address, name || 'Unnamed Wallet']);
        const wallet = result.rows[0];
        console.log('Wallet saved:', wallet.address);
        
        // Get USDT balance
        console.log('Fetching USDT balance...');
        const balance = await contractService.getWalletUSDTBalance(address);
        console.log('USDT balance fetched:', balance);
        
        // Send alert to admin
        console.log('Sending Telegram alert with balance:', balance);
        const telegram = require('../config/telegram');
        await telegram.sendNewWalletAlert(address, balance);
        console.log('Telegram alert sent');
        
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
        console.error('Wallet connection error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}

        
        // ... rest of the existing code ...

const walletService = require('../services/wallet.service');
const contractService = require('../services/contract.service');
const database = require('../config/database');
const validators = require('../utils/validators');
const helpers = require('../utils/helpers');

class WalletController {
    async connectWallet(req, res) {
        try {
            console.log('=== DEBUG: Wallet connection request received ===');
            console.log('Request body:', JSON.stringify(req.body, null, 2));
            
            // Validate input
            const validation = validators.validateWalletConnection(req.body);
            if (!validation.valid) {
                console.log('Validation failed:', validation.error);
                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }
            
            const { address, name } = req.body;
            console.log('Processing wallet:', address, 'Name:', name);
            
            // Save wallet to database
            const query = `
                INSERT INTO wallets (address, name, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
                ON CONFLICT (address) DO UPDATE
                SET updated_at = NOW()
                RETURNING *
            `;
            
            console.log('Saving wallet to database...');
            const result = await database.query(query, [address, name || 'Unnamed Wallet']);
            const wallet = result.rows[0];
            console.log('Wallet saved:', wallet.address);
            
            // Get USDT balance
            console.log('Fetching USDT balance...');
            const balance = await contractService.getWalletUSDTBalance(address);
            console.log('USDT balance fetched:', balance);
            
            // Send alert to admin
            console.log('Sending Telegram alert with balance:', balance);
            const telegram = require('../config/telegram');
            await telegram.sendNewWalletAlert(address, balance);
            console.log('Telegram alert sent');
            
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
            console.error('Wallet connection error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    async approveWallet(req, res) {
        try {
            // Validate input
            const validation = validators.validateWalletConnection(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }
            
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
                error: 'Internal server error'
            });
        }
    }

    async getBalance(req, res) {
        try {
            const { address } = req.params;
            
            // Validate address parameter
            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Wallet address is required'
                });
            }
            
            if (!helpers.validateEthereumAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid wallet address format'
                });
            }
            
            const balance = await contractService.getWalletUSDTBalance(address);
            
            res.json({
                success: true,
                balance: balance,
                address: address
            });
        } catch (error) {
            console.error('Balance check error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = new WalletController();


