const { Pool } = require('pg');
require('dotenv').config();
const env = require('./env');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: env.db.database,
      }
);

const connectDatabase = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('PostgreSQL connected successfully');
    return pool;
  } catch (error) {
    console.error('PostgreSQL connection error:', error);
    process.exit(1);
  }
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  connectDatabase,
};