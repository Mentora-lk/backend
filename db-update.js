const db = require('./src/config/db');

async function updateDb() {
    try {
        console.log("Altering users table...");
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;
        `);
        console.log("Successfully added reset_password_token and reset_password_expires to users table.");
    } catch (error) {
        console.error("Error updating database:", error);
    } finally {
        process.exit();
    }
}

updateDb();
