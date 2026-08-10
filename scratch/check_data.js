const { pool } = require('../src/config/db');

async function checkData() {
  try {
    const res = await pool.query('SELECT * FROM poatad');
    console.log('Data:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkData();
