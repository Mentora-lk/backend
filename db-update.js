const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./src/config/db');

async function updateDb() {
    try {
        console.log("Creating post_comments table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS post_comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ post_comments table created.");

        await db.query(`CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);`);
        console.log("✅ post_comments index created.");

        console.log("Creating messages table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ messages table created.");

        await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);`);
        console.log("✅ messages indexes created.");

        console.log("Creating deadline_submissions table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS deadline_submissions (
                id SERIAL PRIMARY KEY,
                deadline_id INTEGER NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                file_url TEXT NOT NULL,
                file_name TEXT,
                submitted_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(deadline_id, student_id)
            );
        `);
        console.log("✅ deadline_submissions table created.");


        console.log("All done!");
    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        process.exit();
    }
}

updateDb();
