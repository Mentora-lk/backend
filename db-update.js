const db = require('./src/config/db');

async function updateDb() {
    try {
        console.log("Creating post_reactions table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS post_reactions (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(post_id, student_id)
            );
        `);
        console.log("Successfully created post_reactions table.");
    } catch (error) {
        console.error("Error updating database:", error);
    } finally {
        process.exit();
    }
}

updateDb();
