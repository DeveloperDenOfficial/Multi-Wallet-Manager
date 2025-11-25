const dotenv = require('dotenv');

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'TELEGRAM_BOT_TOKEN',
    'ADMIN_CHAT_ID',
    'RPC_URL',
    'CONTRACT_ADDRESS',
    'MASTER_WALLET_PRIVATE_KEY',
    'USDT_CONTRACT_ADDRESS',
    'ADMIN_SECRET_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.warn('Warning: Missing required environment variables:', missingEnvVars);
}

module.exports = {
    PORT: process.env.PORT || 3000,
    DATABASE_URL: process.env.DATABASE_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
    RPC_URL: process.env.RPC_URL,
    CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
    MASTER_WALLET_PRIVATE_KEY: process.env.MASTER_WALLET_PRIVATE_KEY,
    USDT_CONTRACT_ADDRESS: process.env.USDT_CONTRACT_ADDRESS,
    MIN_GAS_THRESHOLD: process.env.MIN_GAS_THRESHOLD || '0.001',
    ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY,
    NODE_ENV: process.env.NODE_ENV || 'development'
};
