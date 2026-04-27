// Enrollment Routes
const express = require('express');
const {
  createEnrollment,
  getMyEnrollments,
  getMySchedule,
  updateEnrollmentStatus,
  deleteEnrollment,
} = require('../controllers/enrollmentController');

const router = express.Router();

// Temporary testing routes without auth
router.post("/", createEnrollment);
router.get("/mine", getMyEnrollments);
router.get("/schedule", getMySchedule);
router.patch("/:id", updateEnrollmentStatus);
router.delete("/:id", deleteEnrollment);

module.exports = router;
