const { ethers } = require('ethers');
const dotenv = require('dotenv');
const contractABI = require('../../smart-contracts/artifacts/abi.json');

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
        
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        this.contract = new ethers.Contract(
            process.env.CONTRACT_ADDRESS,
            contractABI,
            this.provider
        );
        
        this.initialized = true;
        console.log('✅ Contract service initialized');
    }

    async getWalletUSDTBalance(walletAddress) {
        if (!this.initialized) {
            console.warn('Contract service not initialized');
            return '0';
        }
        
        try {
            // For now, we'll use a mock USDT contract address
            // In production, use the actual USDT contract
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
}

module.exports = new ContractService();
