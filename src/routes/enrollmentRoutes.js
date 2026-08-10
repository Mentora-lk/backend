// Enrollment Routes
const express = require('express');
const {
  createEnrollment,
  getMyEnrollments,
  getMySchedule,
  updateEnrollmentStatus,
  deleteEnrollment,
} = require('../controllers/enrollmentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Protected routes
router.post("/", protect, createEnrollment);
router.get("/mine", protect, getMyEnrollments);
router.get("/schedule", protect, getMySchedule);
router.patch("/:id", protect, updateEnrollmentStatus);
router.delete("/:id", protect, deleteEnrollment);

module.exports = router;
