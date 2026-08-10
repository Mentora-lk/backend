const express = require('express');
const recommendationController = require('../controllers/recommendationController');
const jwt = require('jsonwebtoken');

const router = express.Router();

/**
 * Optional authentication middleware for recommendations.
 * Allows logged-in students to have their profiles integrated, 
 * but falls back gracefully for demo/unauthenticated environments.
 */
const protectOptional = (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_jwt_key_here');
      req.user = decoded;
    } catch (error) {
      console.warn('Optional JWT authentication failed:', error.message);
    }
  }
  next();
};

router.post('/', protectOptional, recommendationController.getRecommendations);

module.exports = router;
