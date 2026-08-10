const express = require('express');
const tutorController = require('../controllers/tutorController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/dashboard', protect, authorize('tutor'), tutorController.getDashboardData);
router.get('/profile', protect, authorize('tutor'), tutorController.getProfile);
router.put('/profile', protect, authorize('tutor'), tutorController.updateProfile);
router.get('/requests', protect, authorize('tutor'), tutorController.getTutorRequests);
router.get('/', tutorController.getAllTutors);

module.exports = router;
