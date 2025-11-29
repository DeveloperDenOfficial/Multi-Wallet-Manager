const { ethers } = require('ethers');
const env = require('../config/environment');

class GasService {
    constructor() {
        // Validate required environment variables first
        if (!env.RPC_URL) {
            console.error('❌ RPC_URL not configured in environment');
            this.initialized = false;
            return;
        }
        
        if (!env.MASTER_WALLET_PRIVATE_KEY) {
            console.error('❌ MASTER_WALLET_PRIVATE_KEY not configured in environment');
            this.initialized = false;
            return;
        }
        
        try {
            this.provider = new ethers.JsonRpcProvider(env.RPC_URL);
            this.wallet = new ethers.Wallet(env.MASTER_WALLET_PRIVATE_KEY, this.provider);
            this.maxRetries = 3;
            this.retryDelay = 1000; // 1 second
            this.initialized = true;
            console.log('✅ Gas service initialized with wallet:', this.wallet.address);
        } catch (error) {
            console.error('❌ Failed to initialize gas service:', error.message);
            this.initialized = false;
        }
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
            console.error('Error checking gas balance for wallet', walletAddress, ':', error);
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
        
        // Validate wallet address
        if (!walletAddress || walletAddress.length !== 42) {
            return { 
                success: false, 
                error: 'Invalid wallet address'
            };
        }
        
        try {
            console.log(`🚀 Sending ${amount} BNB gas to wallet: ${walletAddress}`);
            
            // Validate the wallet address
            try {
                ethers.getAddress(walletAddress); // This will throw if invalid
            } catch (error) {
                return { 
                    success: false, 
                    error: 'Invalid wallet address format'
                };
            }
            
            const result = await this.retryOperation(async () => {
                // Get current gas price
                let gasPrice;
                try {
                    const feeData = await this.provider.getFeeData();
                    gasPrice = feeData.gasPrice;
                } catch (error) {
                    console.log('Could not get gas price, using default');
                    gasPrice = ethers.parseUnits('10', 'gwei'); // Default 10 Gwei
                }
                
                const tx = await this.wallet.sendTransaction({
                    to: walletAddress,
                    value: ethers.parseEther(amount),
                    gasLimit: 21000, // Standard gas limit for simple transfers
                    gasPrice: gasPrice
                });
                
                console.log('✅ Gas transaction sent:', tx.hash);
                
                // Wait for confirmation with timeout
                console.log('⏳ Waiting for gas transaction confirmation...');
                const receipt = await Promise.race([
                    tx.wait(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Transaction confirmation timeout after 60 seconds')), 60000)
                    )
                ]);
                
                console.log('✅ Gas transaction confirmed in block:', receipt.blockNumber);
                console.log('✅ Gas transaction confirmed:', tx.hash);
                
                return { success: true, txHash: tx.hash };
            });
            
            return result;
        } catch (error) {
            console.error('❌ Error sending gas to wallet', walletAddress, ':', error);
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
