const { Pool, types } = require('pg');
require('dotenv').config();
const env = require('./env');

// node-postgres's default parser for `timestamp without time zone` (OID 1114)
// builds the JS Date by treating the wall-clock string as being in the
// MACHINE'S OWN local timezone (since the wire value carries no offset). On a
// dev machine set to Asia/Colombo (UTC+5:30), this silently shifts every such
// timestamp backwards by 5:30 relative to its true value — e.g. a
// notification inserted seconds ago reads "5h ago" on the frontend. Every
// *_created_at column in this schema (messages, notifications, etc.) is
// `timestamp without time zone` storing correct UTC wall-clock digits (see
// `NOW() AT TIME ZONE 'UTC'` in messageController.js/notificationController.js)
// — the bug is purely in how the driver re-parses them on the way out, so the
// fix belongs here once, globally, rather than patched into every query.
types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));

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