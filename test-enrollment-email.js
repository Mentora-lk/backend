require('dotenv').config();
const sendEmail = require('./src/utils/sendEmail');
const enrollmentEmailTemplate = require('./src/utils/enrollmentEmailTemplate');

async function test() {
  console.log('📤 Sending test enrollment email...');
  console.log('📧 Using Sender/Recipient Address:', process.env.EMAIL_USER);
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Error: EMAIL_USER or EMAIL_PASS is missing in your .env file!');
    process.exit(1);
  }

  try {
    const html = enrollmentEmailTemplate({
      tutorName: 'Sarah Jenkins',
      studentName: 'Alex Mercer',
      courseName: 'Full-Stack Web Development (Node.js & React)',
      selectedDay: 'Saturday',
      selectedTime: '02:00 PM',
      preferredMode: 'online',
      studentMessage: 'Hi! I am really excited to join your class. I want to build web apps.',
    });

    await sendEmail({
      email: process.env.EMAIL_USER, // Send to yourself to test
      subject: '📚 [Test] New Enrollment Request — Full-Stack Web Development',
      message: 'You have a new enrollment request on Mentora.lk',
      html,
    });
    console.log('✅ Success! Test enrollment email has been sent successfully.');
    console.log(`✉️  Check the inbox/spam folder of: ${process.env.EMAIL_USER}`);
  } catch (error) {
    console.error('❌ Failed to send enrollment email:', error);
  }
}

test();
