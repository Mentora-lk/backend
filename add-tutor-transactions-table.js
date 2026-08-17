const db = require('./src/config/db');

// Ad hoc one-off schema patch, in the style of add-reset-attempts-column.js —
// creates the table backing the Revenue Analytics page's manual money
// management ledger. Tutors log their own income/outcome (expense) entries
// here instead of revenue being auto-derived from enrollments; general
// ledger, not tied to a specific class. Not part of the app runtime.
async function addTutorTransactionsTable() {
    try {
        console.log("Creating tutor_transactions table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS tutor_transactions (
                id SERIAL PRIMARY KEY,
                tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'outcome')),
                amount NUMERIC NOT NULL CHECK (amount >= 0),
                description VARCHAR(255),
                entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
                "createdAt" TIMESTAMP DEFAULT NOW(),
                "updatedAt" TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_tutor_transactions_tutor_id ON tutor_transactions(tutor_id)
        `);
        console.log("Successfully created tutor_transactions table.");

        const check = await db.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'tutor_transactions'
            ORDER BY ordinal_position
        `);
        console.log("Verified columns:", check.rows);
    } catch (error) {
        console.error("Error updating database:", error);
    } finally {
        process.exit();
    }
}

addTutorTransactionsTable();
