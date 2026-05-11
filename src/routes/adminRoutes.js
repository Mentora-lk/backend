const express = require('express');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All admin routes are protected — must be logged in
router.get('/dashboard', authMiddleware, adminController.getDashboard);
router.get('/tutors',    authMiddleware, adminController.getTutors);
router.get('/students',  authMiddleware, adminController.getStudents);
router.get('/payments',  authMiddleware, adminController.getPayments);
router.get('/ads',       authMiddleware, adminController.getAds);
router.put('/ads/:id',   authMiddleware, adminController.updateAdStatus);

module.exports = router;