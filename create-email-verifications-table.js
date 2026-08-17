const db = require('./src/config/db');

async function createTable() {
    try {
        console.log("Creating email_verifications table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS email_verifications (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                otp_hash VARCHAR(64),
                otp_expires_at TIMESTAMP,
                attempts INTEGER DEFAULT 0,
                verified_at TIMESTAMP,
                verified_expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("Successfully created email_verifications table.");

        const columns = await db.query(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'email_verifications'
            ORDER BY ordinal_position
        `);
        console.log("Columns:", columns.rows);
    } catch (error) {
        console.error("Error creating table:", error);
    } finally {
        process.exit();
    }
}

createTable();
