const { pool } = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/passwordHash');
const { generateToken } = require('../utils/jwt');
const crypto = require('crypto');
const { sendResetEmail } = require('../utils/emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = {
  login: async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    try {
      const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const admin = result.rows[0];
      const isMatch = await comparePassword(password, admin.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const token = generateToken(admin);
      res.json({ token, admin: { id: admin.id, fullName: admin.full_name, email: admin.email } });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  register: async (req, res) => {
    const { fullName, email, password, adminCode } = req.body;
    if (!fullName || !email || !password || !adminCode) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (adminCode !== process.env.ADMIN_CODE) {
      return res.status(403).json({ message: 'Invalid admin access code' });
    }
    try {
      const exists = await pool.query('SELECT id FROM admins WHERE email = $1', [email]);
      if (exists.rows.length > 0) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      const password_hash = await hashPassword(password);
      const result = await pool.query(
        'INSERT INTO admins (full_name, email, password_hash, admin_code) VALUES ($1, $2, $3, $4) RETURNING *',
        [fullName, email, password_hash, adminCode]
      );
      const admin = result.rows[0];
      const token = generateToken(admin);
      res.status(201).json({ token, admin: { id: admin.id, fullName: admin.full_name, email: admin.email } });
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  forgotPassword: async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    try {
      const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.json({ message: 'If that email exists, a reset link has been sent.' });
      }
      const admin = result.rows[0];
      // Generating a new token automatically invalidates any previous one for this admin,
      // since we overwrite reset_token / reset_token_expiry below.
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 30 * 60 * 1000);

      await pool.query(
        'UPDATE admins SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
        [resetToken, expiry, admin.id]
      );

      await sendResetEmail(admin.email, resetToken);

      res.json({ message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  resetPassword: async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    try {
      const result = await pool.query(
        'SELECT * FROM admins WHERE reset_token = $1 AND reset_token_expiry > NOW()',
        [token]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid or expired reset link' });
      }
      const admin = result.rows[0];
      const password_hash = await hashPassword(newPassword);

      await pool.query(
        'UPDATE admins SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
        [password_hash, admin.id]
      );

      res.json({ message: 'Password reset successful' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },
};
