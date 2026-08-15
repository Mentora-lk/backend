// src/utils/enrollmentEmailTemplate.js
// HTML email template for enrollment notification sent to tutor

const enrollmentEmailTemplate = ({
  tutorName,
  studentName,
  courseName,
  selectedDay,
  selectedTime,
  preferredMode,
  studentMessage,
}) => `
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
        Hello ${tutorName}! 👋
      </h2>
      <p style="color:#6B7280;font-size:14px;line-height:1.7;margin:0 0 22px;">
        You have received a new enrollment request from a student on Mentora.lk.
        Please log in to your dashboard to review and respond.
      </p>

      <!-- Alert box -->
      <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-left:4px solid #10B981;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <p style="color:#065F46;font-weight:700;font-size:15px;margin:0 0 4px;">
          🎓 New Enrollment Request
        </p>
        <p style="color:#047857;font-size:13px;margin:0;">
          A student wants to join <strong>${courseName}</strong>
        </p>
      </div>

      <!-- Details -->
      <h3 style="color:#374151;font-size:15px;font-weight:700;margin:0 0 14px;">
        Enrollment Details
      </h3>
      <table style="width:100%;border-collapse:separate;border-spacing:0 4px;">
        ${[
          ['📚 Course',         courseName],
          ['👤 Student Name',   studentName],
          ['📅 Preferred Day',  selectedDay],
          ['🕐 Preferred Time', selectedTime],
          ['💻 Mode',           preferredMode || 'Online'],
        ].map(([label, value]) => `
          <tr>
            <td style="padding:9px 14px;background:#F9FAFB;border-radius:8px 0 0 8px;color:#6B7280;font-size:13px;font-weight:600;width:38%;">
              ${label}
            </td>
            <td style="padding:9px 14px;background:#F9FAFB;border-radius:0 8px 8px 0;color:#111827;font-size:13px;border-left:3px solid white;">
              ${value || 'Not specified'}
            </td>
          </tr>
        `).join('')}
      </table>

      <!-- Student message -->
      ${studentMessage ? `
      <div style="background:#F9FAFB;border-radius:12px;padding:16px;margin-top:18px;border:1px solid #E5E7EB;">
        <p style="color:#374151;font-weight:700;font-size:13px;margin:0 0 6px;">
          💬 Message from Student:
        </p>
        <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;font-style:italic;">
          "${studentMessage}"
        </p>
      </div>
      ` : ''}

      <!-- Action button -->
      <div style="text-align:center;margin-top:28px;">
        <p style="color:#6B7280;font-size:13px;margin:0 0 14px;">
          Log in to approve or reject this enrollment request.
        </p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/tutor"
           style="display:inline-block;background:linear-gradient(135deg,#10B981,#059669);color:white;text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:700;font-size:14px;">
          View Request →
        </a>
      </div>

      <!-- Divider -->
      <div style="border-top:1px solid #F3F4F6;margin:28px 0 20px;"></div>

      <p style="color:#9CA3AF;font-size:11px;text-align:center;line-height:1.6;margin:0;">
        This email was sent by <strong>Mentora.lk</strong> because a student enrolled in your class.<br>
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

module.exports = enrollmentEmailTemplate;
