const express = require('express');
const tutorController = require('../controllers/tutorController');

const router = express.Router();

router.get('/', tutorController.getAllTutors);

module.exports = router;
