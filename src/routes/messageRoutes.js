const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getContacts, getMessages, sendMessage, getUnreadCount } = require('../controllers/messageController');

router.use(protect);

router.get('/contacts', getContacts);
router.get('/unread-count', getUnreadCount);
router.get('/:userId', getMessages);
router.post('/:userId', sendMessage);

module.exports = router;
