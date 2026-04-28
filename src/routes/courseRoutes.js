// Course Routes
const express = require('express');
const {
  getCourses,
  getCourseById,
  getCourseReviews,
  addReview,
} = require('../controllers/courseController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

const router = express.Router();

// Public routes — no login needed to browse
router.get('/',              getCourses);
router.get('/:id',           getCourseById);
router.get('/:id/reviews',   getCourseReviews);

// Protected — only enrolled students can post a review
router.post('/:id/reviews',  protect, restrictTo('student'), addReview);

module.exports = router;
