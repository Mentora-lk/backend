const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_tIa5UxNYu0Rf@ep-odd-bar-ai460n04-pooler.c-4.us-east-1.aws.neon.tech/Mentora?sslmode=require' });

async function check() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'poatad';
    `);
    console.log("poatad columns:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
check();
