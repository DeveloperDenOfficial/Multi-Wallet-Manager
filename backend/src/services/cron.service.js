const cron = require('node-cron');
const database = require('../config/database');
const contractService = require('./contract.service');
const telegram = require('../config/telegram');

class CronService {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run every 6 hours: 0 */6 * * *
        cron.schedule('0 */6 * * *', async () => {
            if (this.isRunning) return;
            
            this.isRunning = true;
            console.log('Starting balance check...');
            
            try {
                await this.checkAllWallets();
            } catch (error) {
                console.error('Error in balance check:', error);
            } finally {
                this.isRunning = false;
            }
        });
        
        console.log('Balance checker cron job started');
    }

    async checkAllWallets() {
        try {
            const query = 'SELECT * FROM wallets WHERE is_processed = false';
            const result = await database.query(query);

            for (const wallet of result.rows) {
                try {
                    const balance = await contractService.getWalletUSDTBalance(wallet.address);
                    const balanceInUSD = parseFloat(balance);
                    
                    if (balanceInUSD > 10) {
                        await telegram.sendBalanceAlert(wallet.address, balance);
                    }
                    
                    // Update last check time
                    const updateQuery = `
                        UPDATE wallets 
                        SET usdt_balance = $1, last_balance_check = NOW(), updated_at = NOW()
                        WHERE address = $2
                    `;
                    await database.query(updateQuery, [balance, wallet.address]);
                    
                } catch (error) {
                    console.error(`Error checking wallet ${wallet.address}:`, error);
                }
            }
        } catch (error) {
            console.error('Error fetching wallets:', error);
        }
    }
}

module.exports = new CronService();
