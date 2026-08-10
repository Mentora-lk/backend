const { pool } = require('../src/config/db');

async function checkTables() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables:', res.rows.map(r => r.table_name));
    
    // Check PoatAD columns
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'poatad'
    `);
    console.log('poatad columns:', columns.rows);

    const count = await pool.query('SELECT COUNT(*) FROM poatad');
    console.log('poatad count:', count.rows[0].count);

    const activeCount = await pool.query("SELECT COUNT(*) FROM poatad WHERE status = 'active'");
    console.log('poatad active count:', activeCount.rows[0].count);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkTables();
