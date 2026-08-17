const express = require('express');
const studentController = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.get('/profile', protect, authorize('student'), studentController.getProfile);
router.put('/profile', protect, authorize('student'), upload.single('profilePicture'), studentController.updateProfile);

module.exports = router;
