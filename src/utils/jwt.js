const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = {
  generateToken: (user) => {
    return jwt.sign(
      { id: user.id, email: user.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  },

  verifyToken: (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
  },
};