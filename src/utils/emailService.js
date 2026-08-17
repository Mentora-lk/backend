const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const sendResetEmail = async (toEmail, resetToken) => {
  const resetLink = `${process.env.FRONTEND_URL}/dashboard/admin/reset-password/${resetToken}`;

  const { data, error } = await resend.emails.send({
    from: 'Mentora.lk Admin <onboarding@resend.dev>',
    to: toEmail,
    subject: 'Reset Your Admin Password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #10B981;">Reset Your Password</h2>
        <p>We received a request to reset your Mentora.lk admin password.</p>
        <p>Click the button below to set a new password. This link expires in 30 minutes.</p>
        <a href="${resetLink}" style="display:inline-block; background:#10B981; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; margin-top:12px;">
          Reset Password
        </a>
        <p style="color:#6B7280; font-size:13px; margin-top:20px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(error.message || 'Failed to send reset email');
  }

  return data;
};

module.exports = { sendResetEmail };