// src/utils/enrollmentStatusEmailTemplate.js
// HTML email sent to a student when a tutor approves or rejects their
// enrollment request. Mirrors enrollmentEmailTemplate.js's visual style.

const enrollmentStatusEmailTemplate = ({
  studentName,
  courseName,
  tutorName,
  status, // 'approved' | 'rejected'
  selectedDay,
  selectedTime,
}) => {
  const isApproved = status === 'approved';

  const headline = isApproved ? "🎉 You're In!" : 'Enrollment Update';
  const alertBg = isApproved ? '#ECFDF5' : '#FEF2F2';
  const alertBorder = isApproved ? '#A7F3D0' : '#FECACA';
  const alertAccent = isApproved ? '#10B981' : '#EF4444';
  const alertTitleColor = isApproved ? '#065F46' : '#991B1B';
  const alertBodyColor = isApproved ? '#047857' : '#B91C1C';
  const alertMessage = isApproved
    ? `Great news — <strong>${tutorName || 'your tutor'}</strong> has approved your request to join <strong>${courseName}</strong>.`
    : `<strong>${tutorName || 'The tutor'}</strong> was unable to accept your request to join <strong>${courseName}</strong> this time.`;
  const ctaLabel = isApproved ? 'View Your Class →' : 'Browse Other Classes →';
  const ctaHref = isApproved
    ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/student`
    : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/classes/search`;

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
        Hi ${studentName || 'there'}! 👋
      </h2>
      <p style="color:#6B7280;font-size:14px;line-height:1.7;margin:0 0 22px;">
        There's an update on the enrollment request you submitted on Mentora.lk.
      </p>

      <!-- Alert box -->
      <div style="background:${alertBg};border:1px solid ${alertBorder};border-left:4px solid ${alertAccent};border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <p style="color:${alertTitleColor};font-weight:700;font-size:15px;margin:0 0 4px;">
          ${headline}
        </p>
        <p style="color:${alertBodyColor};font-size:13px;margin:0;">
          ${alertMessage}
        </p>
      </div>

      ${isApproved ? `
      <!-- Details -->
      <h3 style="color:#374151;font-size:15px;font-weight:700;margin:0 0 14px;">
        Class Details
      </h3>
      <table style="width:100%;border-collapse:separate;border-spacing:0 4px;">
        ${[
          ['📚 Course', courseName],
          ['📅 Day', selectedDay],
          ['🕐 Time', selectedTime],
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
      ` : `
      <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0 0 4px;">
        Don't worry — there are plenty of other great tutors on Mentora.lk ready to help.
      </p>
      `}

      <!-- Action button -->
      <div style="text-align:center;margin-top:28px;">
        <a href="${ctaHref}"
           style="display:inline-block;background:linear-gradient(135deg,#10B981,#059669);color:white;text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:700;font-size:14px;">
          ${ctaLabel}
        </a>
      </div>

      <!-- Divider -->
      <div style="border-top:1px solid #F3F4F6;margin:28px 0 20px;"></div>

      <p style="color:#9CA3AF;font-size:11px;text-align:center;line-height:1.6;margin:0;">
        This email was sent by <strong>Mentora.lk</strong> because your enrollment status changed.<br>
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

module.exports = enrollmentStatusEmailTemplate;
