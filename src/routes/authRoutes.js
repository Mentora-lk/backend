const express = require('express');
const router = express.Router();
const { registerStudent, registerTutor, loginUser } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/register/student', registerStudent);
router.post('/register/tutor', registerTutor);
router.post('/login', loginUser);

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