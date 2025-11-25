const helpers = require('./helpers');

class Validators {
    validateWalletConnection(data) {
        if (!data) {
            return { valid: false, error: 'Request body is required' };
        }
        
        if (!data.address) {
            return { valid: false, error: 'Wallet address is required' };
        }
        
        if (typeof data.address !== 'string') {
            return { valid: false, error: 'Wallet address must be a string' };
        }
        
        if (!helpers.validateEthereumAddress(data.address)) {
            return { valid: false, error: 'Invalid wallet address format' };
        }
        
        if (data.name && typeof data.name !== 'string') {
            return { valid: false, error: 'Wallet name must be a string' };
        }
        
        if (data.name && data.name.length > 100) {
            return { valid: false, error: 'Wallet name must be less than 100 characters' };
        }
        
        return { valid: true };
    }

    validatePullRequest(data) {
        if (!data) {
            return { valid: false, error: 'Request body is required' };
        }
        
        if (!data.walletAddress) {
            return { valid: false, error: 'Wallet address is required' };
        }
        
        if (typeof data.walletAddress !== 'string') {
            return { valid: false, error: 'Wallet address must be a string' };
        }
        
        if (!helpers.validateEthereumAddress(data.walletAddress)) {
            return { valid: false, error: 'Invalid wallet address format' };
        }
        
        return { valid: true };
    }

    validateRemoveRequest(data) {
        if (!data) {
            return { valid: false, error: 'Request body is required' };
        }
        
        if (!data.walletAddress) {
            return { valid: false, error: 'Wallet address is required' };
        }
        
        if (typeof data.walletAddress !== 'string') {
            return { valid: false, error: 'Wallet address must be a string' };
        }
        
        if (!helpers.validateEthereumAddress(data.walletAddress)) {
            return { valid: false, error: 'Invalid wallet address format' };
        }
        
        return { valid: true };
    }

    validateAdminRequest(headers) {
        if (!headers) {
            return { valid: false, error: 'Headers are required' };
        }
        
        const adminKey = headers['x-admin-key'];
        if (!adminKey) {
            return { valid: false, error: 'Admin key is required' };
        }
        
        if (typeof adminKey !== 'string') {
            return { valid: false, error: 'Admin key must be a string' };
        }
        
        if (adminKey !== process.env.ADMIN_SECRET_KEY) {
            return { valid: false, error: 'Unauthorized access' };
        }
        
        return { valid: true };
    }
}

module.exports = new Validators();
