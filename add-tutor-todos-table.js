const db = require('./src/config/db');

// Ad hoc one-off schema patch, in the style of add-reset-attempts-column.js —
// creates the table backing the Profile page's new "To Do List" tab. Each
// row is one task a tutor is tracking for themselves: what they need to do,
// when it's due, and how long they estimate it'll take. Not part of the app
// runtime.
async function addTutorTodosTable() {
    try {
        console.log("Creating tutor_todos table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS tutor_todos (
                id SERIAL PRIMARY KEY,
                tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                task VARCHAR(255) NOT NULL,
                finish_time TIMESTAMP,
                duration_minutes INTEGER,
                status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
                "createdAt" TIMESTAMP DEFAULT NOW(),
                "updatedAt" TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_tutor_todos_tutor_id ON tutor_todos(tutor_id)
        `);
        console.log("Successfully created tutor_todos table.");

        const check = await db.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'tutor_todos'
            ORDER BY ordinal_position
        `);
        console.log("Verified columns:", check.rows);
    } catch (error) {
        console.error("Error updating database:", error);
    } finally {
        process.exit();
    }
}

addTutorTodosTable();
