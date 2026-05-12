// Student Community Routes
const express = require('express');
const multer = require('multer');
const {
  discoverCommunities,
  requestCommunityAccess,
  cancelCommunityRequest,
  dismissDeclinedRequest,
  getMyClasses,
  getMyRequests,
  getMyDeadlines,
  getCommunityFeed,
  togglePostReaction,
  getPostComments,
  addPostComment,
  deletePostComment,
  submitAssignment,
} = require('../controllers/studentCommunityController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes below require a valid JWT and the 'student' role
router.use(protect, restrictTo('student'));

// ── Discovery & Access ────────────────────────────────────────────────────────
// GET    /api/student/communities/discover         (optional ?tag=Physics)
// POST   /api/student/communities/:id/request
// DELETE /api/student/communities/:id/request          (cancel pending)
// DELETE /api/student/communities/:id/request/declined (dismiss declined)
router.get('/communities/discover', discoverCommunities);
router.post('/communities/:id/request', requestCommunityAccess);
router.delete('/communities/:id/request', cancelCommunityRequest);
router.delete('/communities/:id/request/declined', dismissDeclinedRequest);

// ── Dashboard ─────────────────────────────────────────────────────────────────
// GET  /api/student/communities/my-classes
// GET  /api/student/communities/my-requests
// GET  /api/student/deadlines
// POST /api/student/deadlines/:id/submit
router.get('/communities/my-classes', getMyClasses);
router.get('/communities/my-requests', getMyRequests);
router.get('/deadlines', getMyDeadlines);
router.post('/deadlines/:id/submit', upload.single('file'), submitAssignment);

// ── Feed & Engagement ─────────────────────────────────────────────────────────
// GET    /api/student/communities/:id/feed
// POST   /api/student/posts/:id/react
// GET    /api/student/posts/:id/comments
// POST   /api/student/posts/:id/comments
// DELETE /api/student/posts/:postId/comments/:commentId
router.get('/communities/:id/feed', getCommunityFeed);
router.post('/posts/:id/react', togglePostReaction);
router.get('/posts/:id/comments', getPostComments);
router.post('/posts/:id/comments', addPostComment);
router.delete('/posts/:postId/comments/:commentId', deletePostComment);

module.exports = router;
