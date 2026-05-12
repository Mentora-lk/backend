const express = require('express');
const { getConversations, getMessages, sendMessage, getContacts } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require a valid JWT (any role)
router.use(protect);

// GET  /api/messages/contacts      — list of people you can message
// GET  /api/messages/conversations — your conversation threads
// GET  /api/messages/:userId       — full thread with a specific user
// POST /api/messages/:userId       — send a message to a specific user
router.get('/contacts',      getContacts);
router.get('/conversations', getConversations);
router.get('/:userId',       getMessages);
router.post('/:userId',      sendMessage);

module.exports = router;
