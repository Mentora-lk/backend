require('dotenv').config();
const { pool } = require('../src/config/db');

(async () => {
  try {
    // Exact query used by sendWeeklySessionReminders
    const result = await pool.query(
      `SELECT
         u.id            AS student_id,
         u.email         AS student_email,
         COALESCE(sp.full_name, e.full_name) AS student_name,
         c.title         AS course_title,
         tp.full_name    AS tutor_name,
         e.selected_day,
         e.selected_time,
         e.status,
         e.id AS enrollment_id
       FROM enrollments e
       JOIN users u                  ON u.id = e.student_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       JOIN courses c                ON c.id = e.class_id
       LEFT JOIN tutor_profiles tp   ON tp.user_id = c.tutor_id
       WHERE e.status IN ('approved', 'active')
       ORDER BY u.id`
    );
    console.log('Total rows matching status filter:', result.rows.length);
    console.log(JSON.stringify(result.rows, null, 2));

    console.log('\n--- raw status values on enrollments table (distinct) ---');
    const statuses = await pool.query('SELECT DISTINCT status, length(status) AS len FROM enrollments');
    console.log(JSON.stringify(statuses.rows, null, 2));

    console.log('\n--- student_profiles row count per user_id 15,16 (checking for duplicates) ---');
    const dupCheck = await pool.query(
      'SELECT user_id, COUNT(*) FROM student_profiles WHERE user_id IN (15,16) GROUP BY user_id'
    );
    console.log(JSON.stringify(dupCheck.rows, null, 2));
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await pool.end();
  }
})();
