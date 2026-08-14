const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_tIa5UxNYu0Rf@ep-odd-bar-ai460n04-pooler.c-4.us-east-1.aws.neon.tech/Mentora?sslmode=require' });

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tutor_payments (
        id SERIAL PRIMARY KEY,
        tutor_id INTEGER NOT NULL,
        ad_id INTEGER NOT NULL REFERENCES poatad(id) ON DELETE CASCADE,
        order_id VARCHAR(100) UNIQUE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        payment_id VARCHAR(100),
        status VARCHAR(50) DEFAULT 'PENDING',
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("Table tutor_payments created.");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
createTable();
