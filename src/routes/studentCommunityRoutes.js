// Student Community Routes
const express = require('express');
const {
  discoverCommunities,
  requestCommunityAccess,
  cancelCommunityRequest,
  getMyPendingRequests,
  getMyClasses,
  getMyDeadlines,
  getCommunityFeed,
  togglePostReaction,
  downloadMaterial,
} = require('../controllers/studentCommunityController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

const router = express.Router();

// All routes below require a valid JWT and the 'student' role
router.use(protect, restrictTo('student'));

// ── Discovery & Access ────────────────────────────────────────────────────────
// GET  /api/student/communities/discover         (optional ?tag=Physics)
// POST /api/student/communities/:id/request
router.get('/communities/discover', discoverCommunities);
router.post('/communities/:id/request', requestCommunityAccess);
router.delete('/communities/:id/request', cancelCommunityRequest);
router.get('/communities/my-requests', getMyPendingRequests);

// ── Dashboard ─────────────────────────────────────────────────────────────────
// GET  /api/student/communities/my-classes
// GET  /api/student/deadlines
router.get('/communities/my-classes', getMyClasses);
router.get('/deadlines', getMyDeadlines);

// ── Feed & Engagement ─────────────────────────────────────────────────────────
// GET  /api/student/communities/:id/feed
// POST /api/student/posts/:id/react
router.get('/communities/:id/feed', getCommunityFeed);
router.post('/posts/:id/react', togglePostReaction);

// ── Material Download ─────────────────────────────────────────────────────────
// GET  /api/student/posts/:id/download
router.get('/posts/:id/download', downloadMaterial);

module.exports = router;
