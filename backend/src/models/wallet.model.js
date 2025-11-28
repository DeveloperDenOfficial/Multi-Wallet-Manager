// This file is handled by the database service directly
// Wallet model is represented in SQL queries

module.exports = {
    createTable: `
        CREATE TABLE IF NOT EXISTS wallets (
            id SERIAL PRIMARY KEY,
            address VARCHAR(42) UNIQUE NOT NULL,
            name VARCHAR(100),
            usdt_balance DECIMAL(18,8) DEFAULT 0,
            last_balance_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    
    createTransactionTable: `
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            wallet_address VARCHAR(42),
            type VARCHAR(20),
            amount DECIMAL(18,8),
            status VARCHAR(20),
            tx_hash VARCHAR(66),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,
    
    // Enhanced queries with better error handling
    insertWallet: `
        INSERT INTO wallets (address, name, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (address) DO UPDATE
        SET updated_at = NOW()
        RETURNING *
    `,
    
    updateWalletBalance: `
        UPDATE wallets 
        SET usdt_balance = $1, last_balance_check = NOW(), updated_at = NOW()
        WHERE address = $2
        RETURNING *
    `,
    
    deleteWallet: `
        DELETE FROM wallets WHERE address = $1
    `,
    
    getAllWallets: `
        SELECT * FROM wallets ORDER BY created_at DESC
    `,
    
    getWalletByAddress: `
        SELECT * FROM wallets WHERE address = $1
    `
};
