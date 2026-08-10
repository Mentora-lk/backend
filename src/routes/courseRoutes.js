//! Course Routes
const express = require('express');
const {
  getCourses,
  getCourseById,
  getCourseReviews,
  addReview,
  createCourse,
  deleteCourse,
  updateCourse,
  getPlatformStats,
} = require('../controllers/courseController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

const router = express.Router();

//! Public routes — no login needed to browse
router.get('/stats',         getPlatformStats);
router.get('/',              getCourses);
router.get('/:id',           getCourseById);
router.get('/:id/reviews',   getCourseReviews);

//! Protected — only enrolled students can post a review
router.post('/:id/reviews',  protect, restrictTo('student'), addReview);

// Protected - only tutors can create/delete/update a course
router.post('/', protect, restrictTo('tutor'), createCourse);
router.put('/:id', protect, restrictTo('tutor'), updateCourse);
router.delete('/:id', protect, restrictTo('tutor'), deleteCourse);

module.exports = router;
