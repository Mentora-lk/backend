const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/dashboard', adminController.getDashboard);
router.post('/trigger-weekly-reminders', protect, authorize('admin'), adminController.triggerWeeklyReminders);

module.exports = router;
