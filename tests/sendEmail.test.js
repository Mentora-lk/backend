jest.mock('nodemailer');

const nodemailer = require('nodemailer');
const sendEmail = require('../src/utils/sendEmail');

describe('sendEmail', () => {
  let sendMailMock;

  beforeEach(() => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });
    process.env.EMAIL_USER = 'noreply@mentora.lk';
    process.env.EMAIL_PASS = 'app-password';
  });

  it('creates a Gmail transporter using EMAIL_USER/EMAIL_PASS from env', async () => {
    await sendEmail({ email: 'tutor@example.com', subject: 'Test', message: 'Plain text', html: '<p>HTML</p>' });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'gmail',
        auth: { user: 'noreply@mentora.lk', pass: 'app-password' },
      })
    );
  });

  it('passes recipient, subject, text, and html through to sendMail', async () => {
    await sendEmail({ email: 'tutor@example.com', subject: 'New Enrollment', message: 'plain', html: '<p>rich</p>' });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tutor@example.com',
        subject: 'New Enrollment',
        text: 'plain',
        html: '<p>rich</p>',
      })
    );
  });

  it('sets the From address using EMAIL_USER', async () => {
    await sendEmail({ email: 'tutor@example.com', subject: 'x', message: 'y', html: 'z' });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.stringContaining('noreply@mentora.lk') })
    );
  });

  it('propagates errors from the transporter so callers can catch them', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP connection failed'));

    await expect(
      sendEmail({ email: 'x@example.com', subject: 'x', message: 'y', html: 'z' })
    ).rejects.toThrow('SMTP connection failed');
  });
});
