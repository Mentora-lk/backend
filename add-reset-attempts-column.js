const db = require('./src/config/db');

// Ad hoc one-off schema patch, in the style of db-update.js — adds the
// failed-attempt counter that resetPassword uses to invalidate a reset code
// after too many wrong guesses. Not part of the app runtime.
async function addResetAttemptsColumn() {
    try {
        console.log("Adding reset_password_attempts column to users table...");
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_password_attempts INTEGER DEFAULT 0
        `);
        console.log("Successfully added reset_password_attempts column.");

        const check = await db.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'reset_password_attempts'
        `);
        console.log("Verified:", check.rows[0]);
    } catch (error) {
        console.error("Error updating database:", error);
    } finally {
        process.exit();
    }
}

addResetAttemptsColumn();
