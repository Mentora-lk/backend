const COPY_BY_PURPOSE = {
    'password-reset': {
        subject: 'Your Mentora.lk password reset code',
        intro: 'We received a request to reset your Mentora.lk password.',
        instructions: 'Enter this code on the reset password page. It expires in 10 minutes.',
    },
    'verify-email': {
        subject: 'Verify your email for Mentora.lk',
        intro: 'Confirm this is your email address to continue creating your Mentora.lk account.',
        instructions: 'Enter this code on the signup page. It expires in 10 minutes.',
    },
};

const sendOtpEmail = async (toEmail, otp, purpose = 'password-reset') => {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!apiKey || !senderEmail) {
        throw new Error('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL missing)');
    }

    const copy = COPY_BY_PURPOSE[purpose] || COPY_BY_PURPOSE['password-reset'];

    // Stamped into the body so that, with several of these emails in an
    // inbox, the most recent one (the only one that still works) is
    // identifiable.
    const sentAt = new Date().toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Colombo',
    });

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'api-key': apiKey,
        },
        body: JSON.stringify({
            sender: { email: senderEmail, name: 'Mentora.lk' },
            to: [{ email: toEmail }],
            subject: copy.subject,
            htmlContent: `
                <p>${copy.intro}</p>
                <p style="font-size:28px;font-weight:700;letter-spacing:6px;">${otp}</p>
                <p>${copy.instructions}</p>
                <p style="color:#6b7280;font-size:13px;">
                    Requested at ${sentAt}. Requesting another code cancels this one —
                    if you have several of these emails, only the newest code works.
                </p>
                <p>If you didn't request this, you can ignore this email.</p>
            `,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Brevo request failed (${response.status}): ${errorBody}`);
    }
};

module.exports = sendOtpEmail;
