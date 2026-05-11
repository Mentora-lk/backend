const { pool } = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/passwordHash');
const { generateToken } = require('../utils/jwt');

module.exports = {

  // Admin Login — POST /api/auth/login
  login: async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
      const result = await pool.query(
        'SELECT * FROM admins WHERE email = $1', [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const admin = result.rows[0];

      const isMatch = await comparePassword(password, admin.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const token = generateToken(admin);

      res.json({
        token,
        admin: {
          id: admin.id,
          fullName: admin.full_name,
          email: admin.email,
        },
      });

    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Admin Signup — POST /api/auth/register
  register: async (req, res) => {
    const { fullName, email, password, adminCode } = req.body;

    if (!fullName || !email || !password || !adminCode) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (adminCode !== process.env.ADMIN_CODE) {
      return res.status(403).json({ message: 'Invalid admin access code' });
    }

    try {
      const exists = await pool.query(
        'SELECT id FROM admins WHERE email = $1', [email]
      );

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

      res.status(201).json({
        token,
        admin: {
          id: admin.id,
          fullName: admin.full_name,
          email: admin.email,
        },
      });

    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },
};