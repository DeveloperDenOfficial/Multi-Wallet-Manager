const cron = require('node-cron');
const database = require('../config/database');
const contractService = require('../services/contract.service');
const telegram = require('../config/telegram');

class BalanceChecker {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run every 45 seconds (between 30-60 seconds as requested)
        cron.schedule('*/45 * * * * *', async () => {
            if (this.isRunning) {
                console.log('Balance checker already running, skipping...');
                return;
            }

            this.isRunning = true;
            console.log('Starting balance check cron job...');
            
            try {
                await this.checkWalletBalances();
            } catch (error) {
                console.error('Error in balance check cron job:', error);
            } finally {
                this.isRunning = false;
                console.log('Balance check cron job completed');
            }
        });
        
        console.log('Balance checker cron job started - running every 45 seconds');
    }

    async checkWalletBalances() {
        try {
            // Query DB for all wallets
            const query = 'SELECT address, name, usdt_balance FROM wallets ORDER BY created_at ASC';
            const result = await database.query(query);
            
            console.log(`Checking balances for ${result.rows.length} wallets...`);
            
            for (const wallet of result.rows) {
                try {
                    console.log(`Checking wallet: ${wallet.address}`);
                    
                    // Check if wallet has sufficient USDT balance
                    const balance = await contractService.getWalletUSDTBalance(wallet.address);
                    console.log(`Wallet ${wallet.address} balance: ${balance} USDT`);
                    
                    // If balance > 10 USDT, send alert
                    if (parseFloat(balance) > 10) {
                        console.log(`Wallet ${wallet.address} has ${balance} USDT - sending alert`);
                        await telegram.sendWalletReadyAlert(wallet.address, balance);
                    }
                    
                    // Update database with current balance
                    const updateQuery = `
                        UPDATE wallets 
                        SET usdt_balance = $1, last_balance_check = NOW(), updated_at = NOW()
                        WHERE address = $2
                    `;
                    await database.query(updateQuery, [balance, wallet.address]);
                    
                } catch (error) {
                    console.error(`Error checking wallet ${wallet.address}:`, error.message);
                    // Continue with other wallets
                }
            }
        } catch (error) {
            console.error('Error fetching wallets from database:', error);
        }
    }
}

module.exports = new BalanceChecker();
