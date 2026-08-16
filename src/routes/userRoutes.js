const express = require('express');
const userController = require('../controllers/userController');

const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.get('/', userController.getAllUsers);

router.get('/profile', protect, userController.getProfile);
router.put('/profile', protect, upload.single('profilePicture'), userController.updateProfile);

module.exports = router;
