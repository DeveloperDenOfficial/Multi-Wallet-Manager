const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

class Database {
    constructor() {
        this.pool = null;
    }

    connect() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });

        this.pool.query('SELECT NOW()', (err, res) => {
            if (err) {
                console.error('Database connection error:', err.stack);
            } else {
                console.log('✅ Database connected successfully');
            }
        });
    }

    async query(text, params) {
        const start = Date.now();
        const res = await this.pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    }
}

module.exports = new Database();
