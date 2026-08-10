const { pool } = require('./src/config/db');

async function checkTables() {
  const tables = ['enrollments', 'poatad'];
  try {
    for (const table of tables) {
      const res = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
        ORDER BY ordinal_position
      `);
      console.log(`${table}: ${res.rows.map(r => r.column_name).join(', ')}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkTables();
