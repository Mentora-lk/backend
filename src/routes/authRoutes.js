const express = require('express');
const router = express.Router();
const multer = require('multer');
const { registerStudent, registerTutor, loginUser, loginWithGoogle, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/register/student', registerStudent);
router.post(
    '/register/tutor', 
    upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), 
    registerTutor
);
router.post('/login', loginUser);
router.post('/google', loginWithGoogle);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// Existing Tutor Route
router.get('/tutor-dashboard', protect, authorize('tutor'), (req, res) => {
    res.json({ message: 'Welcome to the tutor dashboard', userId: req.user.id });
});

// NEW: Protected Student Route
router.get('/student-dashboard', protect, authorize('student'), (req, res) => {
    res.json({ 
        message: 'Welcome to the student dashboard!',
        userId: req.user.id 
    });
});

module.exports = router;