const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

class Database {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    connect() {
        try {
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: {
                    rejectUnauthorized: false
                },
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });

            this.pool.query('SELECT NOW()', (err, res) => {
                if (err) {
                    console.error('Database connection error:', err.stack);
                    this.isConnected = false;
                } else {
                    console.log('Database connected successfully');
                    this.isConnected = true;
                }
            });
            
            // Handle pool errors
            this.pool.on('error', (err) => {
                console.error('Unexpected database error:', err);
                this.isConnected = false;
            });
        } catch (error) {
            console.error('Database initialization error:', error);
            this.isConnected = false;
        }
    }

    async query(text, params) {
        if (!this.isConnected || !this.pool) {
            throw new Error('Database not connected');
        }
        
        try {
            const start = Date.now();
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log('Executed query', { text, duration, rows: res.rowCount });
            return res;
        } catch (error) {
            console.error('Database query error:', { text, error: error.message });
            throw error;
        }
    }
    
    async healthCheck() {
        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch (error) {
            console.error('Database health check failed:', error);
            return false;
        }
    }
}

module.exports = new Database();
