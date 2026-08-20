// src/jobs/weeklyReminderJob.js
const cron = require('node-cron');
const { pool } = require('../config/db');
const sendEmail = require('../utils/sendEmail');
const weeklyReminderEmailTemplate = require('../utils/weeklyReminderEmailTemplate');

// Gathers every student with an approved/active enrollment, groups their
// sessions by student (one digest email per student, not per enrollment),
// and emails each one their week ahead. Pure — no cron dependency — so it
// can be awaited directly from a test or a manual-trigger endpoint.
async function sendWeeklySessionReminders() {
  const result = await pool.query(
    `SELECT
       u.id            AS student_id,
       u.email         AS student_email,
       COALESCE(sp.full_name, e.full_name) AS student_name,
       c.title         AS course_title,
       tp.full_name    AS tutor_name,
       e.selected_day,
       e.selected_time
     FROM enrollments e
     JOIN users u                  ON u.id = e.student_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     JOIN courses c                ON c.id = e.class_id
     LEFT JOIN tutor_profiles tp   ON tp.user_id = c.tutor_id
     WHERE e.status IN ('approved', 'active')`
  );

  const recipients = new Map();
  for (const row of result.rows) {
    if (!recipients.has(row.student_id)) {
      recipients.set(row.student_id, {
        email: row.student_email,
        name: row.student_name,
        sessions: [],
      });
    }
    recipients.get(row.student_id).sessions.push({
      courseTitle: row.course_title,
      tutorName: row.tutor_name,
      selectedDay: row.selected_day,
      selectedTime: row.selected_time,
    });
  }

  let sent = 0;
  let failed = 0;

  // Sequential, not Promise.all — one bad send shouldn't take down the rest
  // of the batch, and Gmail SMTP shouldn't be hit with concurrent connections.
  for (const recipient of recipients.values()) {
    try {
      const html = weeklyReminderEmailTemplate({
        studentName: recipient.name,
        sessions: recipient.sessions,
      });

      await sendEmail({
        email: recipient.email,
        subject: '📅 Your week ahead on Mentora.lk',
        message: 'Here is a reminder of your upcoming sessions this week on Mentora.lk.',
        html,
      });

      sent++;
    } catch (err) {
      failed++;
      console.warn(`⚠️ Weekly reminder email failed for ${recipient.email}:`, err.message);
    }
  }

  return { sent, failed };
}

// Registers the weekly cron tick — Monday 8:00 AM Sri Lanka time. Kept
// separate from sendWeeklySessionReminders so tests can call the latter
// directly without ever registering a scheduled job.
function scheduleWeeklyReminderJob() {
  cron.schedule(
    '0 8 * * 1',
    () => {
      sendWeeklySessionReminders().catch((err) =>
        console.error('Weekly reminder job failed:', err)
      );
    },
    { timezone: 'Asia/Colombo' }
  );
}

module.exports = { sendWeeklySessionReminders, scheduleWeeklyReminderJob };
