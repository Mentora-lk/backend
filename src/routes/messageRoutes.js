const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getContacts, getMessages, sendMessage } = require('../controllers/messageController');

router.use(protect);

router.get('/contacts', getContacts);
router.get('/:userId', getMessages);
router.post('/:userId', sendMessage);

module.exports = router;
