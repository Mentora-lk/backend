const express = require('express');
const tutorController = require('../controllers/tutorController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/dashboard', protect, authorize('tutor'), tutorController.getDashboardData);
router.get('/revenue-analytics', protect, authorize('tutor'), tutorController.getRevenueAnalytics);
router.post('/transactions', protect, authorize('tutor'), tutorController.addTransaction);
router.delete('/transactions/:id', protect, authorize('tutor'), tutorController.deleteTransaction);
router.get('/profile', protect, authorize('tutor'), tutorController.getProfile);
router.put('/profile', protect, authorize('tutor'), tutorController.updateProfile);
router.get('/requests', protect, authorize('tutor'), tutorController.getTutorRequests);
router.get('/', tutorController.getAllTutors);

module.exports = router;
