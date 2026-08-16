const { pool } = require('./src/config/db');

async function checkTables() {
  const tables = ['enrollments', 'PoatAD', 'tutor_profiles', 'student_profiles'];
  try {
    for (const table of tables) {
      console.log(`--- Table: ${table} ---`);
      const res = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
        ORDER BY ordinal_position
      `);
      console.table(res.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkTables();
