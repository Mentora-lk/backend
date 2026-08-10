const db = require('./src/config/db');
async function run() {
    try {
        const result = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log("Tables:", result.rows.map(r => r.table_name));
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}
run();
