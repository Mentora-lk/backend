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
  updateCourseFinancials,
  getPlatformStats,
} = require('../controllers/courseController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

//! Public routes — no login needed to browse
router.get('/stats',         getPlatformStats);
router.get('/',              getCourses);
router.get('/:id',           getCourseById);
router.get('/:id/reviews',   getCourseReviews);

//! Protected — only enrolled students can post a review
router.post('/:id/reviews',  protect, restrictTo('student'), addReview);

// Protected - only tutors can create/delete/update a course
router.post('/', protect, restrictTo('tutor'), upload.single('banner'), createCourse);
router.put('/:id', protect, restrictTo('tutor'), upload.single('banner'), updateCourse);
router.patch('/:id/financials', protect, restrictTo('tutor'), updateCourseFinancials);
router.delete('/:id', protect, restrictTo('tutor'), deleteCourse);

module.exports = router;
