// backend/src/services/gas.service.js
const { ethers } = require('ethers');
const env = require('../config/environment');

class GasService {
    constructor() {
        if (!env.RPC_URL || !env.MASTER_WALLET_PRIVATE_KEY) {
            console.warn('⚠️ Gas service not properly configured');
            this.initialized = false;
            return;
        }
        
        this.provider = new ethers.JsonRpcProvider(env.RPC_URL);
        this.wallet = new ethers.Wallet(env.MASTER_WALLET_PRIVATE_KEY, this.provider);
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.initialized = true;
        console.log('✅ Gas service initialized');
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

    async checkWalletGasBalance(walletAddress) {
        if (!this.initialized) {
            return { 
                hasSufficientGas: false, 
                currentBalance: '0', 
                minRequired: env.MIN_GAS_THRESHOLD || '0.001',
                error: 'Gas service not initialized'
            };
        }
        
        try {
            const result = await this.retryOperation(async () => {
                const balance = await this.provider.getBalance(walletAddress);
                const balanceInBNB = ethers.formatEther(balance);
                
                const minRequired = env.MIN_GAS_THRESHOLD || '0.001';
                
                return {
                    hasSufficientGas: parseFloat(balanceInBNB) >= parseFloat(minRequired),
                    currentBalance: balanceInBNB,
                    minRequired: minRequired
                };
            });
            
            return result;
        } catch (error) {
            console.error('Error checking gas balance:', error);
            return { 
                hasSufficientGas: false, 
                currentBalance: '0', 
                minRequired: env.MIN_GAS_THRESHOLD || '0.001',
                error: `Failed to check gas balance after ${this.maxRetries} retries: ${error.message}`
            };
        }
    }

    async sendGasToWallet(walletAddress, amount = '0.001') {
        if (!this.initialized) {
            return { 
                success: false, 
                error: 'Gas service not initialized'
            };
        }
        
        try {
            console.log(`Sending ${amount} BNB gas to wallet:`, walletAddress);
            
            const result = await this.retryOperation(async () => {
                const tx = await this.wallet.sendTransaction({
                    to: walletAddress,
                    value: ethers.parseEther(amount),
                    gasLimit: 21000 // Standard gas limit for simple transfers
                });
                
                console.log('Gas transaction sent:', tx.hash);
                
                await tx.wait();
                console.log('Gas transaction confirmed:', tx.hash);
                
                return { success: true, txHash: tx.hash };
            });
            
            return result;
        } catch (error) {
            console.error('Error sending gas:', error);
            return { 
                success: false, 
                error: `Failed to send gas after ${this.maxRetries} retries: ${error.message}` 
            };
        }
    }

    async estimateGasForApproval(walletAddress) {
        if (!this.initialized) {
            return '200000'; // Default fallback
        }
        
        try {
            const gasEstimate = await this.retryOperation(async () => {
                const usdtContract = new ethers.Contract(
                    env.USDT_CONTRACT_ADDRESS,
                    ['function approve(address spender, uint256 amount) public returns (bool)'],
                    this.wallet
                );
                
                return await usdtContract.approve.estimateGas(
                    env.CONTRACT_ADDRESS,
                    ethers.MaxUint256
                );
            });
            
            return gasEstimate.toString();
        } catch (error) {
            console.error('Error estimating approval gas:', error);
            return '200000'; // Default fallback
        }
    }
}

module.exports = new GasService();
