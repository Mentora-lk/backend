require('dotenv').config();
const sendEmail = require('./src/utils/sendEmail');

async function test() {
  console.log('📤 Sending test email...');
  console.log('📧 Using Sender Address:', process.env.EMAIL_USER);
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Error: EMAIL_USER or EMAIL_PASS is missing in your .env file!');
    process.exit(1);
  }

  try {
    await sendEmail({
      email: process.env.EMAIL_USER, // Send to yourself to test
      subject: '🧪 Mentora - SMTP Integration Test',
      message: 'This is a plain text fallback message. If you receive this, your email configuration is correct!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px; max-width: 600px;">
          <h2 style="color: #4F46E5;">🧪 SMTP Integration Test Successful!</h2>
          <p>Hello,</p>
          <p>If you are reading this email, it means your Mentora backend email service has been configured correctly and is able to send emails using your Gmail SMTP settings.</p>
          <hr style="border: 0; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #777;">Sent from your Mentora local backend server.</p>
        </div>
      `
    });
    console.log('✅ Success! Test email has been sent successfully.');
    console.log(`✉️  Check the inbox/spam folder of: ${process.env.EMAIL_USER}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    console.log('\n💡 Troubleshooting Tips:');
    console.log('1. Since you are using Gmail, make sure you are using an "App Password" (16 characters) instead of your account password.');
    console.log('   - Enable 2-Step Verification on your Google account.');
    console.log('   - Go to Google Account Security -> App Passwords.');
    console.log('   - Generate a password for "Mail" and "Other (Windows/Mac/Linux/Node)".');
    console.log('2. Double check that your .env file is saved and contains the generated password (without spaces).');
  }
}

test();
