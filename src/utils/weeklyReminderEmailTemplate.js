// src/utils/weeklyReminderEmailTemplate.js
// Weekly digest emailed to a student for every class they're currently
// approved/active in. Mirrors enrollmentStatusEmailTemplate.js's visual
// style, but lists one row per session instead of a single class's details.

const weeklyReminderEmailTemplate = ({ studentName, sessions }) => {
  const rows = sessions
    .map(
      (s) => `
      <tr>
        <td style="padding:9px 14px;background:#F9FAFB;color:#111827;font-size:13px;font-weight:600;border-bottom:1px solid white;">
          ${s.courseTitle || 'Class'}
        </td>
        <td style="padding:9px 14px;background:#F9FAFB;color:#6B7280;font-size:13px;border-bottom:1px solid white;">
          ${s.tutorName || 'Tutor'}
        </td>
        <td style="padding:9px 14px;background:#F9FAFB;color:#111827;font-size:13px;border-bottom:1px solid white;">
          ${s.selectedDay || 'Not specified'}
        </td>
        <td style="padding:9px 14px;background:#F9FAFB;color:#111827;font-size:13px;border-bottom:1px solid white;">
          ${s.selectedTime || 'Not specified'}
        </td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F6F5;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:580px;margin:0 auto;padding:36px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#064E3B,#065F46);border-radius:16px 16px 0 0;padding:28px;text-align:center;">
      <h1 style="color:white;font-size:26px;margin:0;font-weight:900;">
        Mentora<span style="color:#34D399;">.lk</span>
      </h1>
      <p style="color:rgba(255,255,255,0.65);margin:6px 0 0;font-size:13px;">
        Online Tutoring Platform
      </p>
    </div>

    <!-- Body -->
    <div style="background:white;padding:32px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

      <h2 style="color:#111827;font-size:20px;font-weight:700;margin:0 0 8px;">
        Hi ${studentName || 'there'}!
      </h2>
      <p style="color:#6B7280;font-size:14px;line-height:1.7;margin:0 0 22px;">
        Here's a reminder of your upcoming sessions on Mentora.lk this week.
      </p>

      <h3 style="color:#374151;font-size:15px;font-weight:700;margin:0 0 14px;">
        Your Week Ahead
      </h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:9px 14px;background:#ECFDF5;color:#065F46;font-size:12px;font-weight:700;text-align:left;border-radius:8px 0 0 0;">Course</th>
            <th style="padding:9px 14px;background:#ECFDF5;color:#065F46;font-size:12px;font-weight:700;text-align:left;">Tutor</th>
            <th style="padding:9px 14px;background:#ECFDF5;color:#065F46;font-size:12px;font-weight:700;text-align:left;">Day</th>
            <th style="padding:9px 14px;background:#ECFDF5;color:#065F46;font-size:12px;font-weight:700;text-align:left;border-radius:0 8px 0 0;">Time</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <!-- Action button -->
      <div style="text-align:center;margin-top:28px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/student"
           style="display:inline-block;background:linear-gradient(135deg,#10B981,#059669);color:white;text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:700;font-size:14px;">
          View My Classes →
        </a>
      </div>

      <!-- Divider -->
      <div style="border-top:1px solid #F3F4F6;margin:28px 0 20px;"></div>

      <p style="color:#9CA3AF;font-size:11px;text-align:center;line-height:1.6;margin:0;">
        This is your weekly session reminder from <strong>Mentora.lk</strong>.<br>
        Please do not reply to this email.
      </p>
    </div>

    <p style="color:#9CA3AF;font-size:11px;text-align:center;margin:16px 0 0;">
      © 2026 Mentora.lk · University of Moratuwa · Team Loop 5
    </p>
  </div>
</body>
</html>
`;
};

module.exports = weeklyReminderEmailTemplate;
