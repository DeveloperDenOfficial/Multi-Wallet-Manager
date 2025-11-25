const { ethers } = require('ethers');
const env = require('../config/environment');
const contractABI = require('../../../smart-contracts/artifacts/abi.json');

class ContractService {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(env.RPC_URL);
        this.wallet = new ethers.Wallet(env.MASTER_WALLET_PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(
            env.CONTRACT_ADDRESS,
            contractABI,
            this.wallet
        );
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async retryOperation(operation, retries = this.maxRetries) {
        for (let i = 0; i <= retries; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === retries) {
                    throw error;
                }
                console.log(`Operation failed, retrying in ${this.retryDelay}ms... (${i + 1}/${retries})`);
                await this.delay(this.retryDelay * Math.pow(2, i)); // Exponential backoff
            }
        }
    }

    async pullUSDTFromWallet(walletAddress) {
        try {
            const result = await this.retryOperation(async () => {
                const tx = await this.contract.pull(walletAddress);
                const receipt = await tx.wait();
                
                return {
                    success: true,
                    txHash: tx.hash,
                    amount: ethers.formatUnits(receipt.logs[0].args.amount, 18)
                };
            });
            
            return result;
        } catch (error) {
            console.error('Error pulling USDT:', error);
            return { 
                success: false, 
                error: `Failed to pull USDT after ${this.maxRetries} retries: ${error.message}` 
            };
        }
    }

    async withdrawUSDTToMaster() {
        try {
            const result = await this.retryOperation(async () => {
                const tx = await this.contract.withdrawToMaster();
                const receipt = await tx.wait();
                
                return {
                    success: true,
                    txHash: tx.hash,
                    amount: ethers.formatUnits(receipt.logs[0].args.amount, 18)
                };
            });
            
            return result;
        } catch (error) {
            console.error('Error withdrawing USDT:', error);
            return { 
                success: false, 
                error: `Failed to withdraw USDT after ${this.maxRetries} retries: ${error.message}` 
            };
        }
    }

    async getWalletUSDTBalance(walletAddress) {
        try {
            const balance = await this.retryOperation(async () => {
                return await this.contract.getWalletUSDT(walletAddress);
            });
            
            return ethers.formatUnits(balance, 18); // USDT has 18 decimals
        } catch (error) {
            console.error('Error getting wallet balance:', error);
            return '0';
        }
    }

    async isWalletApproved(walletAddress) {
        try {
            const approved = await this.retryOperation(async () => {
                return await this.contract.approvedWallets(walletAddress);
            });
            
            return approved;
        } catch (error) {
            console.error('Error checking wallet approval:', error);
            return false;
        }
    }
}

module.exports = new ContractService();

