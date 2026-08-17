const db = require('./src/config/db');

// Ad hoc one-off schema patch, in the style of add-reset-attempts-column.js —
// adds the two fields tutors can enter on the Revenue Analytics page's Class
// Profitability table: a monthly operating spend/expense figure (used to
// compute real profit = revenue - spend) and an informational "days taught
// per month" figure. Both are nullable/defaulted so existing course rows and
// every existing query against `courses` are unaffected. Not part of the app
// runtime.
async function addCourseFinancialsColumns() {
    try {
        console.log("Adding monthly_expenses and days_per_month columns to courses table...");
        await db.query(`
            ALTER TABLE courses
            ADD COLUMN IF NOT EXISTS monthly_expenses NUMERIC DEFAULT 0
        `);
        await db.query(`
            ALTER TABLE courses
            ADD COLUMN IF NOT EXISTS days_per_month INTEGER
        `);
        console.log("Successfully added monthly_expenses and days_per_month columns.");

        const check = await db.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'courses' AND column_name IN ('monthly_expenses', 'days_per_month')
            ORDER BY column_name
        `);
        console.log("Verified:", check.rows);
    } catch (error) {
        console.error("Error updating database:", error);
    } finally {
        process.exit();
    }
}

addCourseFinancialsColumns();
