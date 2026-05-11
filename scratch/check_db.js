const { pool } = require('../src/config/db');

async function check() {
  try {
    const res = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
