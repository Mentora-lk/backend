const express = require('express');
const router = express.Router();
const multer = require('multer');
const tutorCommunityController = require('../controllers/tutorCommunityController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Configure multer for file uploads (memory storage for Cloudinary)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Base route: /api/tutor

// Protect all tutor community routes and ensure user is a tutor
// Assuming role for tutor is 'tutor' or similar. 
// For now, we just use protect, and authorize('tutor') if applicable.
// If role is different, adjust accordingly.
router.use(protect);

// Test route - no upload needed
router.get('/test', (req, res) => {
  console.log('✅ Test route hit - authentication working');
  res.json({ message: 'Tutor routes are working', user: req.user });
});

// router.use(authorize('tutor')); // Uncomment and adjust role string if roleMiddleware is needed

// 1. Community Management
router.get('/communities', tutorCommunityController.getCommunities);
router.post('/communities', tutorCommunityController.createCommunity);
router.get('/communities/:id', tutorCommunityController.getCommunityById);
router.get('/communities/:id/posts', tutorCommunityController.getCommunityPosts);
router.get('/communities/:id/members', tutorCommunityController.getCommunityMembers);

// 2. Request Management
router.get('/requests', tutorCommunityController.getPendingRequests);
router.put('/requests/:membership_id', tutorCommunityController.updateRequestStatus);

// 3. Content Publishing
// Debug logging middleware
router.post('/communities/:id/posts', (req, res, next) => {
  console.log('📤 POST /communities/:id/posts hit');
  console.log('  Community ID:', req.params.id);
  console.log('  Has file:', !!req.file);
  console.log('  Body:', req.body);
  console.log('  User:', req.user);
  next();
}, upload.single('material'), tutorCommunityController.createPost);

router.put('/posts/:id/pin', tutorCommunityController.pinPost);
router.post('/communities/:id/deadlines', tutorCommunityController.createDeadline);

// 4. Download Material
router.get('/posts/:id/download', tutorCommunityController.downloadMaterial);

module.exports = router;
