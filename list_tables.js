const { pool } = require('./src/config/db');
pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
  .then(r => console.log(r.rows.map(row => row.table_name).join(', ')))
  .catch(console.error)
  .finally(() => process.exit());
