const { pool } = require('./src/config/db');

async function getSchema() {
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    for (let row of tables.rows) {
      const columns = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${row.table_name}'`);
      console.log(`Table: ${row.table_name}`);
      console.table(columns.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

getSchema();
