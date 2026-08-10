const { pool } = require('../src/config/db');

async function checkTutorProfiles() {
  try {
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tutor_profiles'
    `);
    console.log('tutor_profiles columns:', columns.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkTutorProfiles();
