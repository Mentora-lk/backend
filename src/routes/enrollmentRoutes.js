//! Enrollment Routes
const express = require('express');
const {
  createEnrollment,
  getMyEnrollments,
  getMySchedule,
  updateEnrollmentStatus,
  deleteEnrollment,
  testEnrollmentEmail,
} = require('../controllers/enrollmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Public test route for email functionality via Postman
router.post("/test-email", testEnrollmentEmail);

// Protected routes — require student authentication to enroll
router.post("/", protect, createEnrollment);

// Protected routes — require student authentication
router.get("/me", protect, authorize('student'), getMyEnrollments);
router.get("/schedule", protect, authorize('student'), getMySchedule);
router.get("/me/schedule", protect, authorize('student'), getMySchedule);
router.patch("/:id", protect, updateEnrollmentStatus);
router.delete("/:id", protect, deleteEnrollment);

module.exports = router;
