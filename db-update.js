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

        // Add poll_options column to posts table if it doesn't exist
        console.log("Checking if poll_options column exists in posts table...");
        const checkColumn = await db.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'posts' AND column_name = 'poll_options'
        `);
        
        if (checkColumn.rows.length === 0) {
            console.log("Adding poll_options column to posts table...");
            await db.query(`
                ALTER TABLE posts 
                ADD COLUMN IF NOT EXISTS poll_options JSONB
            `);
            console.log("Successfully added poll_options column to posts table.");
        } else {
            console.log("poll_options column already exists in posts table.");
        }
    } catch (error) {
        console.error("Error updating database:", error);
    } finally {
        process.exit();
    }
}

updateDb();
