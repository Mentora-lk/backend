const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, register, forgotPassword, resetPassword } = require('../controllers/authController');

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per window
  message: { message: 'Too many reset requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin auth routes
router.post('/login', login);
router.post('/register', register);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
module.exports = router;
