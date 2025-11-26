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
        if (!this.initialized) {
            console.warn('Contract service not initialized');
            return '0';
        }
        
        try {
            const mockUSDTAddress = process.env.USDT_CONTRACT_ADDRESS || 
                '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e5';
            
            const usdtContract = new ethers.Contract(
                mockUSDTAddress,
                ['function balanceOf(address account) external view returns (uint256)'],
                this.provider
            );
            
            const balance = await usdtContract.balanceOf(walletAddress);
            return ethers.formatUnits(balance, 18); // USDT has 18 decimals
        } catch (error) {
            console.error('Error getting wallet balance:', error);
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
            
            // Execute the withdrawal
            const tx = await this.contract.withdrawToMaster();
            
            // Wait for transaction confirmation
            const receipt = await tx.wait();
            
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
