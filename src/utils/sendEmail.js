const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // Create a transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail', // You can change this based on the SMTP service you use
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    // Define the email options
    const mailOptions = {
        from: `Mentora <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html
    };

    // Send the email
    await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
