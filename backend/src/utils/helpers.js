const ethers = require('ethers');

class Helpers {
    validateEthereumAddress(address) {
        try {
            if (!address || typeof address !== 'string') return false;
            return ethers.isAddress(address);
        } catch (error) {
            return false;
        }
    }

    formatUSDTAmount(amount) {
        try {
            const num = parseFloat(amount);
            return isNaN(num) ? '0.00' : num.toFixed(2);
        } catch (error) {
            return '0.00';
        }
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.trim().replace(/[^a-zA-Z0-9\s\-_@.]/g, '').substring(0, 255);
    }

    sanitizeAddress(address) {
        if (typeof address !== 'string') return '';
        return address.trim().toLowerCase().substring(0, 42);
    }

    generateTimestamp() {
        return new Date().toISOString();
    }

    maskPrivateKey(privateKey) {
        if (!privateKey || typeof privateKey !== 'string' || privateKey.length < 10) return 'Invalid Key';
        return `${privateKey.substring(0, 6)}...${privateKey.substring(privateKey.length - 4)}`;
    }
    
    isValidDecimal(value, decimals = 18) {
        if (typeof value !== 'string' && typeof value !== 'number') return false;
        const regex = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
        return regex.test(value.toString());
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new Helpers();
